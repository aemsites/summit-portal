import {
  getSession, staffDomains, isVerifiedMethod, createBoothDeviceToken, verifyBoothDeviceToken,
  clearSessionCookie, clearSignedInMarkerCookie,
} from './session.js';
import { EMAIL_RE, jsonResponse } from './magiclink.js';
import { parseCugSheetRows, compileSheetGroups } from './cugsheet.js';
import { handleShareLinkRequest } from './sharelink.js';
import { sha256hex } from './stafflogin.js';
import { matchesCugGroup, normalizeCugGroup } from './cug-group.js';
import {
  BOOTH_NOTICE_VERSION, BoothActivityError, createBoothActivity,
  storeBoothActivity, countBoothActivity,
} from './booth-activity.js';
import createBoothTiming from './booth-timing.js';
import { BOOTH_DEMOS, findBoothDemo } from './booth-demos.js';

const TTL = 600;
const COOKIE = 'booth_context';
const ASSET_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function reply(body, status = 200) {
  const response = jsonResponse(body, status);
  Object.entries(ASSET_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

function operationalError(reason) {
  // eslint-disable-next-line no-console
  console.error('[booth]', reason);
}

const DATA_ERROR = Symbol('booth-data-error');

function dataError(dataset, stage, category) {
  const error = new Error(`${dataset} ${stage} ${category}`);
  error[DATA_ERROR] = true;
  return error;
}

function failureCategory(error) {
  if (['TimeoutError', 'AbortError'].includes(error?.name)) return 'deadline-or-abort';
  if (/redirect/i.test(error?.message || '')) return 'redirect-option';
  if (/cache|\bcf\b/i.test(error?.message || '')) return 'fetch-options';
  if (/header/i.test(error?.message || '')) return 'request-headers';
  return 'transport-or-runtime';
}

function discoveryFailure(error) {
  const category = error?.[DATA_ERROR] ? error.message : 'unknown runtime failure';
  operationalError(`Private discovery failed: ${category}`);
}

function contextId(request) {
  const match = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)booth_context=([a-f0-9-]{36})(?:;|$)/);
  return match?.[1] || null;
}

export async function boothStaff(request, env) {
  const session = await getSession(request, env);
  if (!session || !isVerifiedMethod(session.method)
    || !staffDomains(env).has(session.email.split('@')[1]?.toLowerCase())) return null;
  return session;
}

async function staffBinding(request) {
  const token = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)auth_token=([^\s;]+)/)?.[1];
  return sha256hex(token || '');
}

export function hasBoothDevice(request) {
  return /(?:^|;\s*)booth_device=/.test(request.headers.get('Cookie') || '');
}

export async function boothDeviceAuthorized(request, env) {
  const session = await boothStaff(request, env);
  const token = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)booth_device=([^;]*)/)?.[1];
  if (!session || !token) return false;
  const marker = await verifyBoothDeviceToken(token, env);
  return !!marker && marker.exp <= session.exp && marker.binding === await staffBinding(request);
}

export async function boothDeviceCookie(request, session, env) {
  const token = await createBoothDeviceToken(await staffBinding(request), session.exp, env);
  const maxAge = Math.max(0, session.exp - Math.floor(Date.now() / 1000));
  return `booth_device=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

/** Always fetch fresh private data; stale-if-error CUG caches are not discovery authority. */
async function sheet(path, env, timing) {
  const dataset = {
    '/data/insights-list.json': 'index',
    '/closed-user-groups.json': 'cugs',
    '/closed-user-groups-mapping.json': 'mapping',
  }[path];
  const headers = { 'Cache-Control': 'no-cache' };
  if (env.ORIGIN_AUTHENTICATION) headers.authorization = `token ${env.ORIGIN_AUTHENTICATION}`;
  const base = `https://${env.ORIGIN_HOSTNAME}${path}`;
  const rows = [];
  let signal;
  try {
    signal = AbortSignal.timeout(10000);
  } catch (error) {
    throw dataError(dataset, 'signal', failureCategory(error));
  }
  for (let page = 0; page < 20; page += 1) {
    const url = page ? `${base}?offset=${rows.length}&limit=1000` : base;
    let response;
    try {
      response = await timing.measure(`booth_${dataset}_fetch`, () => fetch(url, { headers, signal, redirect: 'manual', cf: { cacheTtl: 0, cacheEverything: false } }));
    } catch (error) {
      throw dataError(dataset, `fetch page=${page}`, failureCategory(error));
    }
    if (!response.ok) throw dataError(dataset, 'http', `status=${response.status}`);
    let data;
    try {
      data = await timing.measure(`booth_${dataset}_body`, () => response.json());
    } catch (error) {
      throw dataError(dataset, 'json', failureCategory(error));
    }
    if (!Array.isArray(data.data)) throw dataError(dataset, 'schema', 'missing-data-array');
    rows.push(...data.data);
    const total = Number(data.total ?? rows.length);
    if (!Number.isFinite(total) || total < rows.length) {
      throw dataError(dataset, 'pagination', 'invalid-total');
    }
    if (rows.length >= total) {
      timing.rows(dataset, rows.length);
      return rows;
    }
    if (!data.data.length) throw dataError(dataset, 'pagination', 'incomplete');
  }
  throw dataError(dataset, 'pagination', 'page-limit');
}

function reportPath(folder) {
  if (typeof folder !== 'string') return null;
  const path = `${folder.trim().replace(/\/+$/, '')}/`;
  // Only generated account insight folders, never an internal customer directory.
  return /^\/accounts\/[a-z0-9-]+\/[a-z0-9-]+\/insights\/[a-z0-9-]+\/(?:[a-z0-9-]+\/)?$/.test(path)
    ? path : null;
}

function created(value) {
  const match = String(value || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    const timestamp = Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    const date = new Date(timestamp);
    return date.getUTCDate() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1
      ? timestamp : 0;
  }
  return Date.parse(value) || 0;
}

function mappingAllows(entries, path, email) {
  const covering = entries.map((entry) => ({ ...entry, scope: typeof entry.url === 'string' ? entry.url.replace(/\*+$/, '').replace(/\/+$/, '') : '' })).filter((entry) => entry.scope
    && (path === `${entry.scope}/` || path.startsWith(`${entry.scope}/`)));
  const longest = Math.max(0, ...covering.map((entry) => entry.scope.length));
  return covering.some((entry) => entry.scope.length === longest
    && matchesCugGroup(entry.group, email));
}

export async function discoverReports(email, env, timing = createBoothTiming()) {
  const domain = normalizeCugGroup(email).split('@')[1];
  if (staffDomains(env).has(domain)) return [];
  const [index, cugs, mapping] = await Promise.all([
    sheet('/data/insights-list.json', env, timing),
    sheet('/closed-user-groups.json', env, timing),
    sheet('/closed-user-groups-mapping.json', env, timing),
  ]);
  return timing.sync('booth_match', () => {
    const matchGroups = compileSheetGroups(parseCugSheetRows(cugs));
    const websites = new Map();
    for (const row of index) {
      const path = reportPath(row.Folder);

      if (!path || !matchGroups(path)?.some((group) => matchesCugGroup(group, email))
        || !mappingAllows(mapping, path, email)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const website = path.split('/insights/')[1].split('/')[0];
      const candidate = {
        path,
        company: typeof row.Customers === 'string' && row.Customers.trim()
          ? row.Customers.trim().slice(0, 240) : path.split('/')[3],
        label: [row.Customers, row.Report].filter((text) => typeof text === 'string' && text.trim())
          .join(' — ').slice(0, 240) || website,
        portal: path.endsWith('/portal-landing/'),
        created: created(row.Created),
      };
      const previous = websites.get(website);
      // Filter authorization BEFORE choosing the canonical/latest alias.
      if (!previous || (candidate.portal && !previous.portal)
        || (candidate.portal === previous.portal && candidate.created > previous.created)) {
        websites.set(website, candidate);
      }
    }
    return [...websites.values()].map(({ path, label, company }) => ({ path, label, company }));
  });
}

export async function handleBooth(request, env) {
  const timing = createBoothTiming(env);
  const start = timing.now();
  if (!await timing.measure('booth_auth', () => boothStaff(request, env))) {
    return reply({ error: 'Staff authentication required' }, 401);
  }
  const finish = (response) => {
    timing.add('booth_total', timing.now() - start);
    return timing.response(response);
  };
  const action = new URL(request.url).pathname.split('/').pop();
  if (!['status', 'demos', 'demo', 'request', 'lookup', 'select', 'view', 'send', 'reset', 'exit'].includes(action)) {
    return finish(reply({ error: 'Unknown booth action' }, 404));
  }
  if (request.method !== (['status', 'demos'].includes(action) ? 'GET' : 'POST')) {
    return finish(reply({ error: 'Method not allowed' }, 405));
  }
  if (request.method === 'POST' && (request.headers.get('Origin') !== new URL(request.url).origin
    || request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')) {
    return finish(reply({ error: 'Same-origin JSON request required' }, 403));
  }
  if (!env.BOOTH_COORDINATOR) return finish(reply({ error: 'Booth service is not configured' }, 503));
  if (action === 'demos') return finish(reply({ demos: BOOTH_DEMOS }));
  if (action === 'status' && !contextId(request)) return finish(reply({ state: 'entry' }));
  const id = contextId(request) || crypto.randomUUID();
  const stub = env.BOOTH_COORDINATOR.get(env.BOOTH_COORDINATOR.idFromName(id));
  const upstream = await timing.measure('booth_rpc', () => stub.fetch(request));
  const response = new Response(upstream.body, upstream);
  const maxAge = ['reset', 'exit'].includes(action) ? 0 : TTL;
  response.headers.set('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
  if (action === 'exit' && response.ok) {
    response.headers.append('Set-Cookie', 'booth_device=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    response.headers.append('Set-Cookie', clearSessionCookie());
    response.headers.append('Set-Cookie', clearSignedInMarkerCookie());
  }
  return finish(response);
}

/** A verified staff dashboard navigation explicitly ends this browser's booth mode. */
export async function resumeStaffPortal(request, response, env) {
  const { pathname } = new URL(request.url);
  const destination = request.headers.get('Sec-Fetch-Dest');
  const prefetch = /prefetch/i.test(`${request.headers.get('Purpose') || ''} ${request.headers.get('Sec-Purpose') || ''}`);
  if (request.method !== 'GET' || !/^\/adobe\/dashboard(?:\/|\.html)?$/.test(pathname)
    || (response.status !== 304 && (response.status !== 200 || !response.headers.get('Content-Type')?.includes('text/html')))
    || (destination !== null && !['document', 'iframe'].includes(destination))
    || prefetch || !await boothStaff(request, env)) return null;

  if (contextId(request)) {
    try {
      const reset = await handleBooth(new Request(new URL('/auth/booth/reset', request.url), {
        method: 'POST',
        headers: {
          Cookie: request.headers.get('Cookie') || '',
          Origin: new URL(request.url).origin,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }), env);
      if (!reset.ok) {
        if (reset.status === 403 && !await boothDeviceAuthorized(request, env)) {
          // A new verified staff session cannot revoke its predecessor's private context.
          // eslint-disable-next-line no-console
          console.warn('[booth] Staff portal discarded stale cross-session booth cookies');
        } else {
          throw new Error('Booth context could not be cleared');
        }
      }
    } catch {
      operationalError('Staff portal transition could not clear the booth context');
      return new Response('Booth mode could not be cleared. Retry or sign out before returning to the staff dashboard.', {
        status: 503,
        headers: { ...ASSET_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  const portal = new Response(response.body, response);
  portal.headers.set('Cache-Control', 'private, no-store');
  [COOKIE, 'booth_device'].forEach((name) => {
    portal.headers.append('Set-Cookie', `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  });
  return portal;
}

/** Durable serialization + persistent send outcomes; KV is not a lock. */
export class BoothCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.queue = Promise.resolve();
  }

  fetch(request) {
    const timing = createBoothTiming(this.env);
    const queuedAt = timing.now();
    const storage = timing.storage(this.state.storage);
    let startedAt;
    const operation = this.queue.then(() => {
      startedAt = timing.now();
      timing.add('booth_queue', startedAt - queuedAt);
      return this.handle(request, timing);
    }).catch(async (error) => {
      if (!(error instanceof BoothActivityError)) throw error;
      const action = new URL(request.url).pathname.split('/').pop();
      const record = await storage.get('context');
      const sent = action === 'send' && record?.delivery === 'sent';
      let { message } = error;
      if (sent) message = 'Your report link was emailed. Activity reporting is delayed. Ask the booth team; do not send again.';
      else if (action === 'send' && record?.delivery === 'ready') {
        message = 'Your report has not been sent. Activity reporting is unavailable. Ask the booth team for help.';
      }
      return reply({
        error: message,
        activityPending: true,
        sent,
      }, 503);
    }).then((response) => {
      timing.add('booth_actor', timing.now() - startedAt);
      return timing.response(response);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  alarm() {
    const operation = this.queue.then(async () => {
      try {
        await this.flushActivity();
      } catch (error) {
        if (!(error instanceof BoothActivityError)) throw error;
      }
      const record = await this.state.storage.get('context');
      if (record && record.expiresAt <= Date.now()) await this.clear(record);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async clear(record, timing = createBoothTiming()) {
    const storage = timing.storage(this.state.storage);
    // Pending lead records survive a privacy reset, but attendee access does not.
    await storage.delete('context');
    if (record?.key) await timing.measure('booth_kv_delete', () => this.env.SESSIONS.delete(`booth:${record.key}`));
    if (await storage.get('activity')) {
      await storage.setAlarm(Date.now() + 60000);
    }
  }

  async flushActivity(timing = createBoothTiming()) {
    const storage = timing.storage(this.state.storage);
    const outbox = await storage.get('activity');
    if (!outbox) return;
    const pending = outbox.filter((activity) => Date.parse(activity.expires_at) > Date.now());
    if (!pending.length) {
      await storage.delete('activity');
      return;
    }
    if (pending.length !== outbox.length) await storage.put('activity', pending);
    try {
      for (const activity of pending) {
        if (Date.parse(activity.expires_at) > Date.now()) {
          const inserted = await timing.measure('booth_d1', () => storeBoothActivity(this.env, activity));
          if (inserted) this.state.waitUntil(countBoothActivity(this.env, activity.kind));
        }
      }
      await storage.delete('activity');
      const record = await storage.get('context');
      if (record) await storage.setAlarm(record.expiresAt);
    } catch (error) {
      await storage.setAlarm(Date.now() + 60000);
      throw error;
    }
  }

  async activity(events, record, timing = createBoothTiming()) {
    const storage = timing.storage(this.state.storage);
    const pending = await storage.get('activity') || [];
    const queued = new Map(pending.filter((event) => Date.parse(event.expires_at) > Date.now())
      .map((event) => [event.event_id, event]));
    events.forEach((event) => {
      if (!queued.has(event.event_id)) queued.set(event.event_id, event);
    });
    // A multi-key put atomically saves the action outcome and its export outbox.
    await storage.put({
      activity: [...queued.values()],
      ...(record ? { context: record } : {}),
    });
    await storage.setAlarm(Date.now() + 60000);
    await this.flushActivity(timing);
  }

  async handle(request, timing = createBoothTiming()) {
    const storage = timing.storage(this.state.storage);
    if (!await timing.measure('booth_actor_auth', () => boothStaff(request, this.env))) {
      return reply({ error: 'Staff authentication required' }, 401);
    }
    const binding = await staffBinding(request);
    const action = new URL(request.url).pathname.split('/').pop();
    if (!['status', 'demo', 'request', 'lookup', 'select', 'view', 'send', 'reset', 'exit'].includes(action)) {
      return reply({ error: 'Unknown booth action' }, 404);
    }
    let record = await storage.get('context');
    if (record && record.binding !== binding) {
      return reply({ error: 'Booth context belongs to another staff session' }, 403);
    }
    if (record && record.expiresAt <= Date.now()) {
      await this.clear(record, timing);
      record = null;
    }
    if (['reset', 'exit'].includes(action)) {
      await this.clear(record, timing);
      return reply({ state: 'entry' });
    }
    let body;
    if (action !== 'status') {
      try {
        body = await request.json();
        if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Invalid body');
      } catch {
        return reply({ error: 'Invalid JSON body' }, 400);
      }
    }
    if (['demo', 'request'].includes(action)) {
      const demo = action === 'demo' ? findBoothDemo(body.id) : null;
      if (Object.keys(body).some((key) => action !== 'demo' || key !== 'id')
        || (action === 'demo' && !demo)) {
        return reply({ error: 'Choose one of the available industry demos.' }, 400);
      }
      await this.clear(record, timing);
      record = {
        mode: action,
        binding,
        expiresAt: Date.now() + TTL * 1000,
        selectedPath: demo?.path || '/request-report',
        ...(demo ? { demoId: demo.id, industry: demo.industry, company: demo.company } : {}),
      };
      await storage.put('context', record);
      if (!await storage.get('activity')) await storage.setAlarm(record.expiresAt);
      return reply({ ...record, binding: undefined, state: record.mode });
    }
    if (record?.mode) {
      if (action === 'status') {
        return reply({ ...record, binding: undefined, state: record.mode });
      }
      if (action !== 'lookup') {
        return reply({ error: 'Demo and request screens cannot send or select a personal report.' }, 409);
      }
    }
    const data = record?.key ? await timing.measure('booth_kv_read', () => this.env.SESSIONS.get(`booth:${record.key}`, 'json')) : null;
    if (record?.key && !data) {
      await this.clear(record, timing);
      return reply({ error: 'Booth context expired. Start again.' }, 410);
    }
    if (action === 'status') {
      if (!record) return reply({ state: 'entry' });
      return reply({
        state: record.selectedPath ? 'report' : 'picker',
        selectedPath: record.selectedPath,
        candidates: record.selectedPath ? [] : data.candidates,
        sent: record.delivery === 'sent',
        contactRequested: record.contactRequested === true,
        activityPending: !!await storage.get('activity'),
        delivery: record.delivery,
        expiresAt: record.expiresAt,
      });
    }
    if (action === 'lookup') {
      // Clear the previous visitor even if the new lookup fails.
      await this.clear(record, timing);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (Object.keys(body).some((key) => !['email', 'noticeVersion'].includes(key))
        || email.length > 254 || !EMAIL_RE.test(email)) {
        return reply({ error: 'Enter a valid business email.' }, 400);
      }
      if (body.noticeVersion !== BOOTH_NOTICE_VERSION) {
        return reply({ error: 'Reload the booth to review the current privacy notice before searching.' }, 409);
      }
      const key = crypto.randomUUID();
      await this.activity([createBoothActivity('search', key, email)], undefined, timing);
      let candidates;
      try {
        candidates = await discoverReports(email, this.env, timing);
      } catch (error) {
        discoveryFailure(error);
        return reply({ error: 'Prepared reports cannot be checked right now. Ask the booth team.' }, 502);
      }
      if (!candidates.length) {
        return reply({ code: 'no_report', error: 'No prepared report is authorized for this email domain. Ask the booth team.' }, 404);
      }
      await timing.measure('booth_kv_write', () => this.env.SESSIONS.put(`booth:${key}`, JSON.stringify({ email, candidates }), { expirationTtl: TTL }));
      record = {
        key,
        binding,
        expiresAt: Date.now() + TTL * 1000,
        selectedPath: candidates.length === 1 ? candidates[0].path : null,
        delivery: 'ready',
        noticeVersion: BOOTH_NOTICE_VERSION,
      };
      await storage.put('context', record);
      await storage.setAlarm(record.expiresAt);
      if (record.selectedPath) {
        await this.activity([createBoothActivity('report_selected', key, email, candidates[0])], record, timing);
      }
      return reply({
        state: record.selectedPath ? 'report' : 'picker',
        selectedPath: record.selectedPath,
        candidates: record.selectedPath ? [] : candidates,
        expiresAt: record.expiresAt,
      });
    }
    if (!record) return reply({ error: 'Booth context expired. Start again.' }, 410);
    if (record.noticeVersion !== BOOTH_NOTICE_VERSION) {
      return reply({ error: 'Start again to review the current booth privacy notice.' }, 409);
    }
    if (action === 'select') {
      if (Object.keys(body).some((key) => key !== 'path')
        || (record.selectedPath && record.selectedPath !== body.path)
        || !data.candidates.some((candidate) => candidate.path === body.path)) {
        return reply({ error: 'Select one of your prepared reports.' }, 400);
      }
    } else if (action === 'view') {
      if (Object.keys(body).some((key) => key !== 'path')
        || body.path !== record.selectedPath || !record.selectedPath) {
        return reply({ error: 'Only the selected report can be recorded as opened.' }, 400);
      }
    } else if (Object.keys(body).length || !record.selectedPath) {
      return reply({ error: 'No selected report or invalid request.' }, 400);
    }
    if (action === 'send') await this.flushActivity(timing);
    if (action === 'send' && record.delivery !== 'ready') {
      return record.delivery === 'sent' ? reply({ sent: true })
        : reply({ error: 'Delivery was already attempted. Ask the booth team before trying again.' }, 409);
    }
    const path = action === 'select' ? body.path : record.selectedPath;
    let authorized;
    try {
      const current = await discoverReports(data.email, this.env, timing);
      authorized = current.find((candidate) => candidate.path === path);
    } catch (error) {
      discoveryFailure(error);
      return reply({ error: 'Report authorization cannot be checked right now.' }, 502);
    }
    if (!authorized) {
      await this.clear(record, timing);
      return reply({ error: 'This prepared report is no longer authorized. Start again.' }, 403);
    }
    if (record.expiresAt <= Date.now() || !await timing.measure('booth_actor_auth', () => boothStaff(request, this.env))) {
      await this.clear(record, timing);
      return reply({ error: 'Booth session expired. Ask the booth team.' }, 410);
    }
    if (action === 'select') {
      record.selectedPath = path;
      await this.activity([createBoothActivity('report_selected', record.key, data.email, authorized)], record, timing);
      return reply({ state: 'report', selectedPath: path, expiresAt: record.expiresAt });
    }
    if (action === 'view') {
      if (!record.viewed) {
        record.viewed = true;
        await this.activity([createBoothActivity('report_viewed', record.key, data.email, authorized)], record, timing);
      } else await this.flushActivity(timing);
      return reply({ viewed: true });
    }
    // Persist BEFORE calling APO. A restart or ambiguous upstream failure must never resend.
    record.delivery = 'attempted';
    await storage.put('context', record);
    const internal = new Request(new URL('/auth/sharelink', request.url), {
      method: 'POST',
      headers: { Cookie: request.headers.get('Cookie'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, path, mode: 'email' }),
    });
    const response = await handleShareLinkRequest(internal, this.env);
    if (!response.ok) {
      operationalError('Share-link dispatch could not be confirmed');
      return reply({ error: 'Email delivery could not be confirmed. Ask the booth team; do not send again.' }, 502);
    }
    record.delivery = 'sent';
    await this.activity([createBoothActivity('report_sent', record.key, data.email, authorized)], record, timing);
    return reply({ sent: true });
  }
}
