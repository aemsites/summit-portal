import { getSession, staffDomains, isVerifiedMethod } from './session.js';
import { EMAIL_RE, jsonResponse } from './magiclink.js';
import { parseCugSheetRows, matchSheetGroups } from './cugsheet.js';
import { handleShareLinkRequest } from './sharelink.js';
import { sha256hex } from './stafflogin.js';

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

/** Always fetch fresh private data; stale-if-error CUG caches are not discovery authority. */
async function sheet(path, env) {
  const headers = { 'Cache-Control': 'no-cache' };
  if (env.ORIGIN_AUTHENTICATION) headers.authorization = `token ${env.ORIGIN_AUTHENTICATION}`;
  const base = `https://${env.ORIGIN_HOSTNAME}${path}`;
  const rows = [];
  const signal = AbortSignal.timeout(10000);
  for (let page = 0; page < 20; page += 1) {
    const url = page ? `${base}?offset=${rows.length}&limit=1000` : base;
    const response = await fetch(url, { headers, signal, redirect: 'error', cf: { cacheTtl: 0, cacheEverything: false } });
    if (!response.ok) throw new Error('Private report data unavailable');
    const data = await response.json();
    if (!Array.isArray(data.data)) throw new Error('Invalid private report data');
    rows.push(...data.data);
    const total = Number(data.total ?? rows.length);
    if (!Number.isFinite(total) || total < rows.length) throw new Error('Invalid pagination');
    if (rows.length >= total) return rows;
    if (!data.data.length) throw new Error('Incomplete private report data');
  }
  throw new Error('Private report data exceeds pagination limit');
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

function mappingAllows(entries, path, domain) {
  const covering = entries.map((entry) => ({ ...entry, scope: typeof entry.url === 'string' ? entry.url.replace(/\*+$/, '').replace(/\/+$/, '') : '' })).filter((entry) => entry.scope
    && (path === `${entry.scope}/` || path.startsWith(`${entry.scope}/`)));
  const longest = Math.max(0, ...covering.map((entry) => entry.scope.length));
  return covering.some((entry) => entry.scope.length === longest
    && String(entry.group || '').trim().toLowerCase() === domain);
}

export async function discoverReports(email, env) {
  const domain = email.split('@')[1];
  if (staffDomains(env).has(domain)) return [];
  const [index, cugs, mapping] = await Promise.all([
    sheet('/data/insights-list.json', env),
    sheet('/closed-user-groups.json', env),
    sheet('/closed-user-groups-mapping.json', env),
  ]);
  const groups = parseCugSheetRows(cugs);
  const websites = new Map();
  for (const row of index) {
    const path = reportPath(row.Folder);

    if (!path || !matchSheetGroups(groups, path)?.includes(domain)
      || !mappingAllows(mapping, path, domain)) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const website = path.split('/insights/')[1].split('/')[0];
    const candidate = {
      path,
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
  return [...websites.values()].map(({ path, label }) => ({ path, label }));
}

export async function handleBooth(request, env) {
  if (!await boothStaff(request, env)) return reply({ error: 'Staff authentication required' }, 401);
  const action = new URL(request.url).pathname.split('/').pop();
  if (!['status', 'lookup', 'select', 'send', 'reset'].includes(action)) {
    return reply({ error: 'Unknown booth action' }, 404);
  }
  if (request.method !== (action === 'status' ? 'GET' : 'POST')) {
    return reply({ error: 'Method not allowed' }, 405);
  }
  if (request.method === 'POST' && (request.headers.get('Origin') !== new URL(request.url).origin
    || request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')) {
    return reply({ error: 'Same-origin JSON request required' }, 403);
  }
  if (!env.BOOTH_COORDINATOR) return reply({ error: 'Booth service is not configured' }, 503);
  if (action === 'status' && !contextId(request)) return reply({ state: 'entry' });
  const id = contextId(request) || crypto.randomUUID();
  const stub = env.BOOTH_COORDINATOR.get(env.BOOTH_COORDINATOR.idFromName(id));
  const upstream = await stub.fetch(request);
  const response = new Response(upstream.body, upstream);
  const maxAge = action === 'reset' ? 0 : TTL;
  response.headers.set('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
  return response;
}

/** Durable serialization + persistent send outcomes; KV is not a lock. */
export class BoothCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.queue = Promise.resolve();
  }

  fetch(request) {
    const operation = this.queue.then(() => this.handle(request));
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  alarm() {
    const operation = this.queue.then(async () => {
      const record = await this.state.storage.get('context');
      if (record && record.expiresAt <= Date.now()) await this.clear(record);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async clear(record) {
    await this.state.storage.deleteAll();
    if (record) await this.env.SESSIONS.delete(`booth:${record.key}`);
  }

  async handle(request) {
    if (!await boothStaff(request, this.env)) return reply({ error: 'Staff authentication required' }, 401);
    const binding = await staffBinding(request);
    const action = new URL(request.url).pathname.split('/').pop();
    let record = await this.state.storage.get('context');
    if (record && record.binding !== binding) {
      return reply({ error: 'Booth context belongs to another staff session' }, 403);
    }
    if (record && record.expiresAt <= Date.now()) {
      await this.clear(record);
      record = null;
    }
    if (action === 'reset') {
      await this.clear(record);
      return reply({ state: 'entry' });
    }
    const data = record ? await this.env.SESSIONS.get(`booth:${record.key}`, 'json') : null;
    if (record && !data) {
      await this.clear(record);
      return reply({ error: 'Booth context expired. Start again.' }, 410);
    }
    if (action === 'status') {
      if (!record) return reply({ state: 'entry' });
      return reply({
        state: record.selectedPath ? 'report' : 'picker',
        selectedPath: record.selectedPath,
        candidates: record.selectedPath ? [] : data.candidates,
        sent: record.delivery === 'sent',
        delivery: record.delivery,
        expiresAt: record.expiresAt,
      });
    }
    let body;
    try {
      body = await request.json();
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Invalid body');
    } catch {
      return reply({ error: 'Invalid JSON body' }, 400);
    }
    if (action === 'lookup') {
      // Clear the previous visitor even if the new lookup fails.
      await this.clear(record);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (Object.keys(body).some((key) => key !== 'email')
        || email.length > 254 || !EMAIL_RE.test(email)) {
        return reply({ error: 'Enter a valid business email.' }, 400);
      }
      let candidates;
      try {
        candidates = await discoverReports(email, this.env);
      } catch {
        operationalError('Private discovery unavailable or invalid');
        return reply({ error: 'Prepared reports cannot be checked right now. Ask the booth team.' }, 502);
      }
      if (!candidates.length) {
        return reply({ error: 'No prepared report is authorized for this email domain. Ask the booth team.' }, 404);
      }
      const key = crypto.randomUUID();
      await this.env.SESSIONS.put(`booth:${key}`, JSON.stringify({ email, candidates }), { expirationTtl: TTL });
      record = {
        key,
        binding,
        expiresAt: Date.now() + TTL * 1000,
        selectedPath: candidates.length === 1 ? candidates[0].path : null,
        delivery: 'ready',
      };
      await this.state.storage.put('context', record);
      await this.state.storage.setAlarm(record.expiresAt);
      return reply({
        state: record.selectedPath ? 'report' : 'picker',
        selectedPath: record.selectedPath,
        candidates: record.selectedPath ? [] : candidates,
        expiresAt: record.expiresAt,
      });
    }
    if (!record) return reply({ error: 'Booth context expired. Start again.' }, 410);
    if (action === 'select') {
      if (Object.keys(body).some((key) => key !== 'path')
        || record.selectedPath
        || !data.candidates.some((candidate) => candidate.path === body.path)) {
        return reply({ error: 'Select one of your prepared reports.' }, 400);
      }
    } else if (Object.keys(body).length || !record.selectedPath) {
      return reply({ error: 'No selected report or invalid request.' }, 400);
    }
    if (action === 'send' && record.delivery !== 'ready') {
      return record.delivery === 'sent' ? reply({ sent: true })
        : reply({ error: 'Delivery was already attempted. Ask the booth team before trying again.' }, 409);
    }
    const path = action === 'select' ? body.path : record.selectedPath;
    let authorized;
    try {
      const current = await discoverReports(data.email, this.env);
      authorized = current.some((candidate) => candidate.path === path);
    } catch {
      operationalError('Selected report authorization unavailable or invalid');
      return reply({ error: 'Report authorization cannot be checked right now.' }, 502);
    }
    if (!authorized) {
      await this.clear(record);
      return reply({ error: 'This prepared report is no longer authorized. Start again.' }, 403);
    }
    if (record.expiresAt <= Date.now() || !await boothStaff(request, this.env)) {
      await this.clear(record);
      return reply({ error: 'Booth session expired. Ask the booth team.' }, 410);
    }
    if (action === 'select') {
      record.selectedPath = path;
      await this.state.storage.put('context', record);
      return reply({ state: 'report', selectedPath: path, expiresAt: record.expiresAt });
    }
    // Persist BEFORE calling APO. A restart or ambiguous upstream failure must never resend.
    record.delivery = 'attempted';
    await this.state.storage.put('context', record);
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
    await this.state.storage.put('context', record);
    return reply({ sent: true });
  }
}
