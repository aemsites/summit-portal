import { getSession, isStaffEmail } from './session.js';

/**
 * Convert a page path to a safe KV key segment using URL-safe base64.
 * btoa is available in Cloudflare Workers.
 */
export function pathToKey(path) {
  return btoa(unescape(encodeURIComponent(path)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const VALID_EVENTS = new Set(['page_view', 'scroll_depth', 'cta_click', 'time_on_page']);
const MAX_DURATION_SECONDS = 86400; // clamp: a tab open longer than a day is noise
const KEY_PATH = 'p:'; // p:{pathKey}            -> path string (idempotent)
const KEY_EVENT = 'e:'; // e:{pathKey}:{ts}-{rand} -> full event JSON (immutable)

/**
 * Coerce a value to an integer within [min, max]; returns null when not a
 * finite number so callers can omit the field entirely.
 */
function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * List every key under a prefix, following the KV pagination cursor.
 * Returns the raw key objects ({ name, metadata }).
 */
async function listAll(kv, prefix) {
  const keys = [];
  let cursor;
  do {
    const res = await kv.list({ prefix, cursor });
    keys.push(...res.keys);
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return keys;
}

/**
 * Reduce a list of event-key metadata into an engagement summary. All numbers
 * come from the per-key metadata written at capture time, so building a summary
 * needs only one list() call per path — no per-event get().
 *
 * avg_scroll_depth is the mean of the FURTHEST depth reached per view (keyed by
 * view id), not the mean of every cumulative milestone — so a reader who reaches
 * the bottom counts as 100%, not the 62.5% a naive average of 25/50/75/100 gives.
 */
function summarize(path, metas) {
  const domains = new Set();
  const maxDepthByView = new Map();
  let totalViews = 0;
  let ctaClicks = 0;
  let totalDuration = 0;
  let durationCount = 0;
  let firstViewed = null;
  let lastViewed = null;

  metas.filter(Boolean).forEach((m) => {
    if (m.dom) domains.add(m.dom);
    if (typeof m.ts === 'number') {
      if (firstViewed === null || m.ts < firstViewed) firstViewed = m.ts;
      if (lastViewed === null || m.ts > lastViewed) lastViewed = m.ts;
    }
    if (m.ev === 'page_view') {
      totalViews += 1;
    } else if (m.ev === 'cta_click') {
      ctaClicks += 1;
    } else if (m.ev === 'scroll_depth' && typeof m.d === 'number') {
      const view = m.vid || 'anon';
      if (m.d > (maxDepthByView.get(view) || 0)) maxDepthByView.set(view, m.d);
    } else if (m.ev === 'time_on_page' && typeof m.dur === 'number') {
      totalDuration += m.dur;
      durationCount += 1;
    }
  });

  const scrollViews = [...maxDepthByView.values()];
  const avgScroll = scrollViews.length
    ? Math.round(scrollViews.reduce((s, d) => s + d, 0) / scrollViews.length)
    : 0;

  return {
    path,
    total_views: totalViews,
    unique_visitors: domains.size,
    avg_scroll_depth: avgScroll,
    cta_clicks: ctaClicks,
    avg_time_seconds: durationCount ? Math.round(totalDuration / durationCount) : 0,
    first_viewed: firstViewed ? new Date(firstViewed).toISOString() : '',
    last_viewed: lastViewed ? new Date(lastViewed).toISOString() : '',
    // Exposed only for the global roll-up (removed before the row is returned).
    domainSet: domains,
  };
}

/**
 * POST /auth/analytics — record a tracking event from an authenticated page visit.
 *
 * Any authenticated session may POST (a customer holding a sharelink/magiclink
 * session is the primary caller). Every event is written as its own immutable KV
 * key, so concurrent events on the same page never overwrite each other — this
 * pipeline is intentionally 100% capture, unlike sampled operational telemetry.
 */
export async function handleAnalyticsPost(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const session = await getSession(request, env);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // No KV binding in dev/test — accept but don't persist.
  if (!env.ANALYTICS_KV) {
    return new Response(JSON.stringify({ ok: true, stored: false }), { headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    event, path, depth, duration_seconds: durationSeconds, href, device, view_id: viewId,
  } = body;

  if (!event || !path) {
    return new Response(JSON.stringify({ error: 'Missing required fields: event, path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!VALID_EVENTS.has(event)) {
    return new Response(JSON.stringify({ error: `Invalid event type. Valid: ${[...VALID_EVENTS].join(', ')}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!path.startsWith('/')) {
    return new Response(JSON.stringify({ error: 'path must be a relative URL starting with /' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ts = Date.now();
  const domain = session.email ? session.email.split('@')[1] : null;
  // Only include the viewer email for interactive verified logins (oauth/staff).
  // Link-borne sessions (sharelink/magiclink) cannot prove the viewer's identity —
  // anyone with the link can open the page.
  const verified = isStaffEmail(session.email, env) || session.method === 'oauth';
  const cleanDepth = event === 'scroll_depth' ? clampInt(depth, 0, 100) : null;
  const cleanDuration = event === 'time_on_page' ? clampInt(durationSeconds, 0, MAX_DURATION_SECONDS) : null;

  const eventData = {
    event,
    path,
    timestamp: ts,
    auth_method: session.method || null,
    viewer_domain: domain,
    viewer_email: verified ? session.email : null,
    view_id: typeof viewId === 'string' ? viewId.slice(0, 64) : null,
    ...(cleanDepth !== null ? { depth: cleanDepth } : {}),
    ...(cleanDuration !== null ? { duration_seconds: cleanDuration } : {}),
    ...(typeof href === 'string' ? { href: href.slice(0, 512) } : {}),
    ...(typeof device === 'string' ? { device: device.slice(0, 16) } : {}),
  };

  // Compact metadata mirrors the numbers summarize() needs, so the summary can
  // be built from a single list() without reading each event body.
  const metadata = {
    ev: event,
    ts,
    dom: domain,
    vid: eventData.view_id,
    ...(cleanDepth !== null ? { d: cleanDepth } : {}),
    ...(cleanDuration !== null ? { dur: cleanDuration } : {}),
  };

  const pathKey = pathToKey(path);
  const rand = Math.random().toString(36).slice(2, 10);

  // Two independent puts to unique / idempotent keys — no read-modify-write,
  // so nothing is lost when events on the same path arrive concurrently.
  await Promise.all([
    env.ANALYTICS_KV.put(`${KEY_PATH}${pathKey}`, path),
    env.ANALYTICS_KV.put(`${KEY_EVENT}${pathKey}:${ts}-${rand}`, JSON.stringify(eventData), { metadata }),
  ]);

  return new Response(JSON.stringify({ ok: true, stored: true }), { headers: { 'Content-Type': 'application/json' } });
}

/**
 * GET /auth/analytics — retrieve engagement analytics. Staff-only.
 *
 * Without ?path=  → all tracked page summaries in DA sheet format
 *                   { total, data: [{ path, total_views, unique_visitors, … }],
 *                     totals: { total_views, unique_visitors, … } }
 *                   `totals.unique_visitors` de-duplicates domains across pages
 *                   (a summed column would double-count a domain seen on 2 pages).
 *
 * With    ?path=X → that page's summary + recent event log (newest first)
 *                   { summary: {...}, data: [{event, timestamp, …}], total }
 */
export async function handleAnalyticsGet(request, env) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const session = await getSession(request, env);
  if (!session || !isStaffEmail(session.email, env)) {
    return new Response(JSON.stringify({ error: 'Staff access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const HEADERS = {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
  };

  if (!env.ANALYTICS_KV) {
    return new Response(JSON.stringify({ total: 0, data: [], totals: {} }), { headers: HEADERS });
  }

  const kv = env.ANALYTICS_KV;
  const url = new URL(request.url);
  const filterPath = url.searchParams.get('path');

  if (filterPath) {
    const eventKeys = await listAll(kv, `${KEY_EVENT}${pathToKey(filterPath)}:`);
    const summary = summarize(filterPath, eventKeys.map((k) => k.metadata));
    delete summary.domainSet;

    // Newest first. Event key names embed the fixed-width timestamp, so a
    // lexicographic sort is chronological. Only the shown slice is fetched.
    const sorted = eventKeys.sort((a, b) => (a.name < b.name ? 1 : -1));
    const shown = sorted.slice(0, 200);
    const events = await Promise.all(
      shown.map((k) => kv.get(k.name, 'json').catch(() => null)),
    );

    return new Response(JSON.stringify({
      summary,
      data: events.filter(Boolean),
      total: eventKeys.length,
    }), { headers: HEADERS });
  }

  // Global view: enumerate paths, then aggregate each in parallel.
  // NOTE: this fans out one list() per tracked page. Fine at Summit scale
  // (tens–low-hundreds of pages); revisit (Durable Objects / rolled-up index)
  // if the tracked-page count grows into the thousands.
  const pathKeyObjs = await listAll(kv, KEY_PATH);
  const paths = await Promise.all(
    pathKeyObjs.map((k) => kv.get(k.name).catch(() => null)),
  );

  const summaries = await Promise.all(
    paths.filter(Boolean).map(async (p) => {
      const eventKeys = await listAll(kv, `${KEY_EVENT}${pathToKey(p)}:`);
      return summarize(p, eventKeys.map((k) => k.metadata));
    }),
  );

  const globalDomains = new Set();
  let globalViews = 0;
  let scrollAcc = 0;
  let scrollPages = 0;
  summaries.forEach((s) => {
    s.domainSet.forEach((d) => globalDomains.add(d));
    globalViews += s.total_views;
    if (s.avg_scroll_depth) { scrollAcc += s.avg_scroll_depth; scrollPages += 1; }
  });

  const rows = summaries
    .sort((a, b) => (b.last_viewed || '').localeCompare(a.last_viewed || ''))
    .map((s) => {
      const { domainSet, ...row } = s;
      return row;
    });

  return new Response(JSON.stringify({
    total: rows.length,
    data: rows,
    totals: {
      total_views: globalViews,
      unique_visitors: globalDomains.size,
      avg_scroll_depth: scrollPages ? Math.round(scrollAcc / scrollPages) : 0,
    },
  }), { headers: HEADERS });
}
