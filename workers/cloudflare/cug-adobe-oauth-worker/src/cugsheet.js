/**
 * Resolve a page's allowed CUG groups from the `closed-user-groups` SHEET
 * rather than from the origin's `x-aem-cug-groups` header.
 *
 * Why: the header is served from the AEM Config Service, which is only written
 * when a human clicks "Apply Page Access" in the DA tool (`tools/cug/cug.js`).
 * The sheet itself is appended and published automatically every time a report
 * is generated, so between two clicks every new account is invisible to the
 * edge: its pages fall through to the catch-all `/accounts**` row and appear to
 * allow only the staff domains. Customers then 403 on their own report, and
 * `/auth/sharelink` refuses to mint a link ("Page has no customer group to
 * share"). Reading the sheet directly removes that window entirely — a row is
 * live the moment DIH publishes it.
 *
 * The origin header still decides WHETHER a path is gated (`x-aem-cug-required`,
 * which comes from static rules like `/accounts**` that never go stale). The
 * sheet only decides WHICH domains are allowed, and only ever narrows to the
 * groups the sheet itself names. Any failure falls back to the header, so a bad
 * fetch can never open a page up.
 *
 * Matching mirrors what the DA tool would have pushed to the Config Service:
 *   - rows with no `cug-groups` produce no header, so they are skipped entirely
 *     (a row like `/accounts/r/redcross**` with blank groups falls through to
 *     the catch-all, exactly as it does today)
 *   - a trailing `*`/`**` makes the `url` a prefix glob; anything else is exact
 *   - the most specific (longest) matching row wins
 */

const SHEET_PATH = '/closed-user-groups.json';
// Paths the sheet is allowed to decide for. Only the account namespace, which
// DIH creates and maintains, is automated: a wrong or malicious row there can
// at worst expose one customer's own report folder. Everything else the sheet
// covers is an internal surface (`/adobe**` the staff dashboard, `/data/**`,
// `/customers/**`, `/insights**`) and stays on the manually-applied Config
// Service header, so opening one still takes a deliberate human step.
const SHEET_SCOPE = '/accounts/';
// How long a successfully-fetched sheet is reused inside one isolate. Short
// enough that a newly published account goes live within minutes, long enough
// that the sheet is fetched once per isolate rather than per request. It is
// also the floor on how fast a REVOCATION takes effect (plus the 300s edge
// cache below, so ~10 min worst case).
const TTL_MS = 5 * 60 * 1000;
// Total budget for a load, across every page — never let a slow origin hold up
// a page request. Applies to the whole loop, not to each fetch in it.
const LOAD_TIMEOUT_MS = 3000;
// Back-off after a failed load, so a broken origin isn't re-hit per request.
// Applies whether or not a stale copy survived (see loadEntries).
const ERROR_RETRY_MS = 60 * 1000;
// The sheet is served whole today (~4k rows). Page only if that ever changes.
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

// eslint-disable-next-line no-console
const log = (...args) => console.log('[cugsheet]', ...args);
// eslint-disable-next-line no-console
const logError = (...args) => console.error('[cugsheet]', ...args);

// Per-isolate cache, keyed by origin so a redeploy against a different
// ORIGIN_HOSTNAME can never answer from another site's access rules. `entries`
// is kept on refresh failure (stale-if-error): a transient origin blip must not
// silently drop every customer back to the staff-only header groups, which
// would 403 customers on their own pages.
let cache = { origin: null, entries: null, expires: 0 };
let inFlight = null;

/** Reset the module cache — tests only. */
export function resetCugSheetCache() {
  cache = { origin: null, entries: null, expires: 0 };
  inFlight = null;
}

/**
 * Turn raw sheet rows into match entries, most specific first.
 * Equal-length prefixes retain their authored order.
 */
export function parseCugSheetRows(rows) {
  const entries = [];
  for (const row of rows) {
    const url = typeof row?.url === 'string' ? row.url.trim() : '';
    const groups = String(row?.['cug-groups'] || '')
      .split(',')
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean);
    // Keep only rows the DA tool would also turn into a header: a real path,
    // and at least one group. A row naming no groups emits no
    // `x-aem-cug-groups`, so it must not shadow a broader row that does.
    if (url.startsWith('/') && groups.length) {
      entries.push({
        prefix: url.replace(/\*+$/, ''),
        glob: url.endsWith('*'),
        groups,
      });
    }
  }
  entries.sort((a, b) => b.prefix.length - a.prefix.length);
  return entries;
}

/** Most-specific matching row's groups for `path`, or null when none match. */
export function matchSheetGroups(entries, path) {
  if (!entries || !path) return null;
  const clean = path.split('?')[0];
  const match = entries.find(
    (e) => (e.glob ? clean.startsWith(e.prefix) : clean === e.prefix),
  );
  return match ? match.groups : null;
}

/** Index already specificity-sorted entries for repeated, request-local matching. */
export function compileSheetGroups(entries) {
  const rules = new Map();
  let maxPrefixLength = 0;
  for (const { prefix, glob, groups } of entries || []) {
    let rule = rules.get(prefix);
    if (!rule) {
      rule = { first: groups, glob: null };
      rules.set(prefix, rule);
      maxPrefixLength = Math.max(maxPrefixLength, prefix.length);
    }
    if (glob && !rule.glob) rule.glob = groups;
  }
  return (path) => {
    if (!path) return null;
    const clean = path.split('?')[0];
    for (let length = Math.min(clean.length, maxPrefixLength); length >= 0; length -= 1) {
      const rule = rules.get(clean.slice(0, length));
      // At the full path, both exact and glob rules match; the first authored tie wins.
      const groups = length === clean.length ? rule?.first : rule?.glob;
      if (groups) return groups;
    }
    return null;
  };
}

/** Fetch the sheet from the origin, following pagination if it ever appears. */
async function fetchSheetRows(env) {
  const headers = {};
  if (env.ORIGIN_AUTHENTICATION) headers.authorization = `token ${env.ORIGIN_AUTHENTICATION}`;
  const base = `https://${env.ORIGIN_HOSTNAME}${SHEET_PATH}`;
  const rows = [];
  let url = base;
  // ONE signal for the whole loop. A per-fetch timeout would let a paginating
  // origin stall a page request for MAX_PAGES × the timeout.
  const signal = AbortSignal.timeout(LOAD_TIMEOUT_MS);

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const resp = await fetch(url, {
      headers,
      signal,
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!resp.ok) throw new Error(`sheet fetch failed (${resp.status})`);
    const json = await resp.json();
    const data = Array.isArray(json.data) ? json.data : [];
    rows.push(...data);
    const total = Number(json.total) || rows.length;
    if (rows.length >= total || data.length === 0) break;
    url = `${base}?offset=${rows.length}&limit=${PAGE_SIZE}`;
  }

  return rows;
}

/** Load the sheet, honouring the cache. Never throws; returns null on failure. */
async function loadEntries(env) {
  const origin = env.ORIGIN_HOSTNAME;
  // Note the check is on `expires` alone, not on `entries` — a FAILED load with
  // nothing cached must also be honoured, or every request during an origin
  // outage would re-attempt the fetch and pay the full load timeout.
  if (cache.origin === origin && Date.now() < cache.expires) return cache.entries;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const rows = await fetchSheetRows(env);
      const entries = parseCugSheetRows(rows);
      cache = { origin, entries, expires: Date.now() + TTL_MS };
      log(`sheet loaded rows=${rows.length} entries=${entries.length}`);
      return entries;
    } catch (err) {
      logError(`sheet load failed: ${err.message}`);
      // Keep serving the last good copy for this origin rather than falling
      // back to the (staff-only) header groups and locking customers out.
      const stale = cache.origin === origin ? cache.entries : null;
      cache = { origin, entries: stale, expires: Date.now() + ERROR_RETRY_MS };
      return stale;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * The groups the sheet allows for `path`, or null when `path` is outside the
 * automated scope, the sheet is unavailable, or it names no groups for it — in
 * every one of those cases the caller falls back to the origin header.
 */
export async function cugSheetGroups(path, env) {
  try {
    if (!path || !path.startsWith(SHEET_SCOPE)) return null;
    const entries = await loadEntries(env);
    return matchSheetGroups(entries, path);
  } catch (err) {
    // Belt and braces: this path gates every request, so it must never throw.
    logError(`group resolution failed for path=${path}: ${err.message}`);
    return null;
  }
}
