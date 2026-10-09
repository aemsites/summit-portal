import {
  getBoothSession, staffDomains, boothKioskCookie,
  clearSessionCookie, clearSignedInMarkerCookie,
  createBoothRevocationToken, verifyBoothRevocationToken,
} from './session.js';
import { EMAIL_RE, jsonResponse } from './magiclink.js';
import { parseCugSheetRows, compileSheetGroups } from './cugsheet.js';
import { sendAuthorizedBoothReport } from './sharelink.js';
import { matchesCugGroup, normalizeCugGroup } from './cug-group.js';
import {
  BOOTH_NOTICE_VERSION, BoothActivityError, createBoothActivity,
  storeBoothActivity, countBoothActivity,
} from './booth-activity.js';
import createBoothTiming from './booth-timing.js';
import { BOOTH_DEMOS, findBoothDemo } from './booth-demos.js';
import { websiteHost, fetchWebsiteIcon } from './booth-icons.js';

const TTL = 15 * 60;
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
  return getBoothSession(request, env);
}

async function staffBinding(request, env) {
  return (await getBoothSession(request, env))?.binding;
}

export function hasBoothDevice(request) {
  return /(?:^|;\s*)booth_device=/.test(request.headers.get('Cookie') || '');
}

export async function boothDeviceAuthorized(request, env) {
  return !!await boothStaff(request, env);
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

export async function discoverReports(
  email,
  env,
  timing = createBoothTiming(),
  grants = false,
  resource = '',
) {
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
        websiteHost: websiteHost(row.Report),
        portal: path.endsWith('/portal-landing/'),
        created: created(row.Created),
        grantGroups: matchGroups(path).filter((group) => matchesCugGroup(group, email)),
        org: mapping.find((entry) => matchesCugGroup(entry.group, email)
          && typeof entry.url === 'string'
          && path.startsWith(`${entry.url.replace(/\*+$/, '').replace(/\/+$/, '')}/`))?.org || '',
        resourceAuthorized: !resource.startsWith('/accounts/')
          || resource === path || resource === path.replace(/\/$/, '')
          || (matchGroups(resource)?.some((group) => matchesCugGroup(group, email))
            && mappingAllows(mapping, resource, email)),
      };
      const previous = websites.get(website);
      // Filter authorization BEFORE choosing the canonical/latest alias.
      if (!previous || (candidate.portal && !previous.portal)
        || (candidate.portal === previous.portal && candidate.created > previous.created)) {
        websites.set(website, candidate);
      }
    }
    return [...websites.values()].map(({
      path,
      label,
      company,
      websiteHost: host,
      grantGroups,
      org,
      resourceAuthorized,
    }) => ({
      path,
      label,
      company,
      ...(host ? { websiteHost: host } : {}),
      ...(grants ? { grantGroups, org, resourceAuthorized: !!resourceAuthorized } : {}),
    }));
  });
}

async function pickerIcon(request, stub, env, timing) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path || reportPath(path) !== path || url.searchParams.size !== 1) {
    return reply({ error: 'Choose an authorized report icon.' }, 400);
  }
  const snapshotRequest = new Request(new URL('/auth/booth/icon-context', request.url), { headers: { Cookie: request.headers.get('Cookie') || '' } });
  const authorize = async () => {
    const response = await stub.fetch(snapshotRequest.clone());
    if (!response.ok) return null;
    const context = await response.json();
    if (context.expiresAt <= Date.now()
      || !context.candidates.some((item) => item.path === path)) return null;
    // Network revalidation stays outside the actor queue; selection/reset must not wait for icons.
    const reports = await discoverReports(context.email, env, timing);
    const candidate = reports.find((item) => item.path === path);
    if (!candidate) return null;
    const latest = await stub.fetch(snapshotRequest.clone());
    if (!latest.ok) return null;
    const active = await latest.json();
    if (active.visitKey !== context.visitKey || active.expiresAt <= Date.now()) return null;
    return { ...candidate, visitKey: context.visitKey };
  };
  let before;
  try {
    before = await authorize();
  } catch (error) {
    discoveryFailure(error);
    return reply({ error: 'Report icon authorization cannot be checked right now.' }, 502);
  }
  if (!before) return reply({ error: 'Report icon is no longer authorized.' }, 403);
  if (!before.websiteHost) return reply({ error: 'Website icon is unavailable.' }, 404);
  let icon;
  try {
    icon = await fetchWebsiteIcon(before.websiteHost);
  } catch (error) {
    operationalError(`Website icon unavailable: ${error.message}`);
    return reply({ error: 'Website icon is unavailable.' }, 404);
  }
  let after;
  try {
    after = await authorize();
  } catch (error) {
    discoveryFailure(error);
    return reply({ error: 'Report icon authorization cannot be checked right now.' }, 502);
  }
  if (!after || after.websiteHost !== before.websiteHost || after.visitKey !== before.visitKey) {
    return reply({ error: 'Report icon is no longer authorized.' }, 403);
  }
  return new Response(icon.body, { headers: { ...ASSET_HEADERS, 'Content-Type': icon.type } });
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
  if (!['status', 'icon', 'demos', 'demo-picker', 'demo', 'lookup', 'picker', 'select', 'view', 'send', 'reset', 'exit', 'activity', 'authorize'].includes(action)
    || action === 'authorize') {
    return finish(reply({ error: 'Unknown booth action' }, 404));
  }
  if (request.method !== (['status', 'icon', 'demos'].includes(action) ? 'GET' : 'POST')) {
    return finish(reply({ error: 'Method not allowed' }, 405));
  }
  if (request.method === 'POST' && (request.headers.get('Origin') !== new URL(request.url).origin
    || request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')) {
    return finish(reply({ error: 'Same-origin JSON request required' }, 403));
  }
  if (!env.BOOTH_COORDINATOR) return finish(reply({ error: 'Booth service is not configured' }, 503));
  if (action === 'demos') return finish(reply({ demos: BOOTH_DEMOS }));
  if (action === 'status' && !contextId(request)) return finish(reply({ state: 'entry', canChooseAnother: false }));
  if (action === 'icon' && !contextId(request)) return finish(reply({ error: 'Report icon is no longer authorized.' }, 403));
  const id = contextId(request) || crypto.randomUUID();
  const stub = env.BOOTH_COORDINATOR.get(env.BOOTH_COORDINATOR.idFromName(id));
  if (action === 'icon') return finish(await pickerIcon(request, stub, env, timing));
  const upstream = await timing.measure('booth_rpc', () => stub.fetch(request));
  const response = new Response(upstream.body, upstream);
  const maxAge = ['reset', 'exit'].includes(action) && response.ok ? 0 : TTL;
  if (response.status !== 410) {
    response.headers.set('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
  }
  if (action === 'exit' && response.ok) {
    response.headers.append('Set-Cookie', 'booth_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    response.headers.append('Set-Cookie', boothKioskCookie());
    response.headers.append('Set-Cookie', clearSessionCookie());
    response.headers.append('Set-Cookie', clearSignedInMarkerCookie());
  }
  return finish(response);
}

/** This RPC is not an HTTP route. It rechecks fresh CUG+mapping authority for origin reads. */
export async function authorizeBoothContext(request, env) {
  if (!contextId(request) || !env.BOOTH_COORDINATOR || !await boothStaff(request, env)) return null;
  const stub = env.BOOTH_COORDINATOR.get(env.BOOTH_COORDINATOR.idFromName(contextId(request)));
  const headers = { Cookie: request.headers.get('Cookie') || '' };
  const url = new URL('/auth/booth/authorize', request.url);
  url.searchParams.set('resource', new URL(request.url).pathname);
  const response = await stub.fetch(new Request(url, { headers }));
  if (response.status === 410) return null;
  if (!response.ok) throw new Error('Booth authorization unavailable');
  const context = await response.json();
  return context.expiresAt > Date.now() ? context : null;
}

/** Called only after fresh staff authentication, before replacing or removing kiosk credentials. */
export async function resetBeforeBoothLogin(request, env, email, exitBooth = false) {
  const id = contextId(request);
  if (!id) return null;
  if (!env.BOOTH_COORDINATOR) return reply({ error: 'Booth reset unavailable' }, 503);
  let timer;
  try {
    const confirmed = await Promise.race([
      (async () => {
        const token = await createBoothRevocationToken(id, email, env, exitBooth);
        const stub = env.BOOTH_COORDINATOR.get(env.BOOTH_COORDINATOR.idFromName(id));
        const response = await stub.fetch(new Request(new URL('/auth/booth/revoke', request.url), {
          method: 'POST',
          headers: { Cookie: request.headers.get('Cookie') || '', 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, exitBooth }),
        }));
        return response.ok && (await response.json()).state === 'entry';
      })(),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Booth revocation timed out')), 10000);
      }),
    ]);
    if (confirmed) return null;
    // eslint-disable-next-line no-console
    console.error('[booth] Fresh-auth visit revocation was not confirmed');
  } catch {
    // eslint-disable-next-line no-console
    console.error('[booth] Fresh-auth visit revocation failed');
  } finally {
    clearTimeout(timer);
  }
  return reply({ error: 'Booth reset could not be confirmed' }, 503);
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
    const key = record?.key || await storage.get('pendingCleanup');
    if (key) await storage.put('pendingCleanup', key);
    await storage.delete('context');
    if (key) {
      await timing.measure('booth_kv_delete', () => this.env.SESSIONS.delete(`booth:${key}`));
      await storage.delete('pendingCleanup');
    }
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

  async renew(record, data, activityAt, timing) {
    const storage = timing.storage(this.state.storage);
    record.expiresAt = Math.max(record.expiresAt, activityAt + TTL * 1000);
    if (record.key) {
      // KV requires at least 60 seconds; the Durable Object still enforces the exact deadline.
      const expirationTtl = Math.max(60, Math.ceil((record.expiresAt - Date.now()) / 1000));
      await timing.measure('booth_kv_write', () => this.env.SESSIONS.put(`booth:${record.key}`, JSON.stringify(data), { expirationTtl }));
    }
    await storage.put('context', record);
    if (!await storage.get('activity')) await storage.setAlarm(record.expiresAt);
    return reply({ expiresAt: record.expiresAt });
  }

  async handle(request, timing = createBoothTiming()) {
    const storage = timing.storage(this.state.storage);
    const action = new URL(request.url).pathname.split('/').pop();
    if (action === 'revoke') {
      let token;
      let exitBooth;
      try {
        ({ token, exitBooth } = await request.json());
      } catch {
        return reply({ error: 'Invalid revocation request' }, 400);
      }
      const id = contextId(request);
      if (request.method !== 'POST'
        || !await verifyBoothRevocationToken(token, id, this.env, exitBooth === true)) {
        return reply({ error: 'Revocation authentication required' }, 403);
      }
      if (exitBooth === true) await storage.put('retired', true);
      await this.clear(await storage.get('context'), timing);
      return reply({ state: 'entry' });
    }
    if (!await timing.measure('booth_actor_auth', () => boothStaff(request, this.env))) {
      return reply({ error: 'Staff authentication required' }, 401);
    }
    const binding = await staffBinding(request, this.env);
    if (!['status', 'authorize', 'icon-context', 'demo-picker', 'demo', 'lookup', 'picker', 'select', 'view', 'send', 'reset', 'exit', 'activity'].includes(action)) {
      return reply({ error: 'Unknown booth action' }, 404);
    }
    if (!['reset', 'exit'].includes(action) && await storage.get('retired')) {
      return reply({ error: 'This booth visit has ended. Return to the booth entry screen.' }, 410);
    }
    let record = await storage.get('context');
    if (record && record.binding !== binding) {
      return reply({ error: 'Booth context belongs to another staff session' }, 403);
    }
    if (record && record.expiresAt <= Date.now()) {
      await this.clear(record, timing);
      record = null;
    }
    if (record?.mode === 'request') {
      await this.clear(record, timing);
      record = null;
    }
    if (['reset', 'exit'].includes(action)) {
      let prepareExit = false;
      if (action === 'reset') {
        try {
          prepareExit = (await request.json()).prepareExit === true;
        } catch {
          return reply({ error: 'Invalid reset request' }, 400);
        }
      }
      if (prepareExit) await storage.put('retired', true);
      await this.clear(record, timing);
      return reply({ state: 'entry' });
    }
    let body;
    let activityAt;
    if (!['status', 'authorize', 'icon-context'].includes(action)) {
      try {
        body = await request.json();
        if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Invalid body');
      } catch {
        return reply({ error: 'Invalid JSON body' }, 400);
      }
    }
    if (action === 'activity') {
      if (Object.keys(body).some((key) => key !== 'idleMs')
        || !Number.isInteger(body.idleMs) || body.idleMs < 0 || body.idleMs >= TTL * 1000) {
        return reply({ error: 'Invalid booth activity request' }, 400);
      }
      if (!record) return reply({ error: 'Booth visit expired. Start again.' }, 410);
      activityAt = Date.now() - body.idleMs;
    }
    if (action === 'demo-picker') {
      if (Object.keys(body).length) return reply({ error: 'Invalid industry chooser request' }, 400);
      const unmatched = ['unavailable', 'demo'].includes(record?.mode) && !!record.flowId;
      if (record && !unmatched) {
        await this.clear(record, timing);
        record = null;
      } else if (record) {
        record = { mode: 'unavailable', binding, expiresAt: record.expiresAt, flowId: record.flowId, email: record.email };
        await storage.put('context', record);
      }
      return reply({ state: 'demos', unmatched, expiresAt: record?.expiresAt });
    }
    if (action === 'demo') {
      const demo = findBoothDemo(body.id);
      if (Object.keys(body).some((key) => key !== 'id') || !demo) {
        return reply({ error: 'Choose one of the available industry demos.' }, 400);
      }
      const correlation = ['unavailable', 'demo'].includes(record?.mode) && record.flowId
        ? { flowId: record.flowId, email: record.email } : {};
      await this.clear(record, timing);
      record = {
        mode: action,
        binding,
        expiresAt: Date.now() + TTL * 1000,
        selectedPath: demo.path,
        demoId: demo.id,
        industry: demo.industry,
        company: demo.company,
        ...correlation,
      };
      await storage.put('context', record);
      if (!await storage.get('activity')) await storage.setAlarm(record.expiresAt);
      if (record.flowId) {
        await this.activity([createBoothActivity('demo_selected', record.flowId, record.email, { path: demo.path, company: demo.company, label: demo.industry })], record, timing);
      }
      return reply({
        state: 'demo', selectedPath: demo.path, demoId: demo.id, industry: demo.industry, company: demo.company, expiresAt: record.expiresAt,
      });
    }
    if (record?.mode) {
      if (action === 'activity') return this.renew(record, null, activityAt, timing);
      if (['status', 'authorize'].includes(action)) {
        return reply({
          selectedPath: record.selectedPath,
          demoId: record.demoId,
          industry: record.industry,
          company: record.company,
          expiresAt: record.expiresAt,
          state: record.mode,
          canChooseAnother: false,
        });
      }
      if (action === 'view' && record.mode === 'demo') {
        if (Object.keys(body).some((key) => key !== 'path') || body.path !== record.selectedPath) {
          return reply({ error: 'Only the selected industry demo can be recorded as opened.' }, 400);
        }
        if (record.flowId && !record.viewed) {
          record.viewed = true;
          await this.activity([createBoothActivity('demo_viewed', record.flowId, record.email, { path: record.selectedPath, company: record.company, label: record.industry })], record, timing);
        } else await this.flushActivity(timing);
        return reply({ viewed: true });
      }
      if (action !== 'lookup') {
        return reply({ error: 'Industry demos cannot send or select a personal report.' }, 409);
      }
    }
    const data = record?.key ? await timing.measure('booth_kv_read', () => this.env.SESSIONS.get(`booth:${record.key}`, 'json')) : null;
    if (record?.key && !data) {
      await this.clear(record, timing);
      return reply({ error: 'Booth context expired. Start again.' }, 410);
    }
    if (action === 'icon-context') {
      if (!record || record.selectedPath) return reply({ error: 'An active report picker is required.' }, 403);
      return reply({
        email: data.email,
        candidates: data.candidates,
        visitKey: record.key,
        expiresAt: record.expiresAt,
      });
    }
    if (['status', 'authorize', 'picker', 'activity'].includes(action)) {
      if (!record) {
        return action === 'picker' ? reply({ error: 'Booth context expired. Start again.' }, 410)
          : reply({ state: 'entry', canChooseAnother: false });
      }
      if (action === 'picker' && Object.keys(body).length) return reply({ error: 'Invalid picker request' }, 400);
      let current;
      try {
        const resource = action === 'authorize' ? new URL(request.url).searchParams.get('resource') || '' : '';
        current = await discoverReports(data.email, this.env, timing, action === 'authorize', resource);
      } catch (error) {
        discoveryFailure(error);
        return reply({ error: 'Report authorization cannot be checked right now.' }, 502);
      }
      const candidates = current.filter((candidate) => (
        data.candidates.some((item) => item.path === candidate.path)
      ));
      if (record.expiresAt <= Date.now() || !await boothStaff(request, this.env)
        || (action !== 'picker' && record.selectedPath
          && !candidates.some((item) => item.path === record.selectedPath))
        || !candidates.length) {
        await this.clear(record, timing);
        return reply({ error: 'Report access expired or is no longer authorized. Start again.' }, 410);
      }
      if (action === 'activity') return this.renew(record, data, activityAt, timing);
      if (action === 'picker') {
        record.reports ||= {};
        if (record.selectedPath) {
          record.reports[record.selectedPath] = {
            delivery: record.delivery,
            viewed: record.viewed === true,
          };
        }
        record.selectedPath = null;
        record.delivery = 'ready';
        record.viewed = false;
        await storage.put('context', record);
        const pickerData = JSON.stringify({ ...data, candidates });
        const expirationTtl = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
        await timing.measure('booth_kv_write', () => this.env.SESSIONS.put(`booth:${record.key}`, pickerData, { expirationTtl }));
      }
      return reply({
        state: record.selectedPath ? 'report' : 'picker',
        selectedPath: record.selectedPath,
        candidates: record.selectedPath ? [] : candidates,
        canChooseAnother: candidates.length > 1,
        ...(action === 'authorize' ? {
          email: data.email,
          grantGroups: candidates.find((candidate) => (
            candidate.path === record.selectedPath
          ))?.grantGroups || [],
          resourceAuthorized: candidates.find((candidate) => (
            candidate.path === record.selectedPath
          ))?.resourceAuthorized === true,
        } : {}),
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
        record = {
          mode: 'unavailable',
          flowId: key,
          email,
          binding,
          expiresAt: Date.now() + TTL * 1000,
        };
        await this.activity([createBoothActivity('no_report', key, email)], record, timing);
        return reply({ code: 'no_report', error: 'No prepared report is authorized for this email domain. Ask the booth team.', expiresAt: record.expiresAt }, 404);
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
        canChooseAnother: candidates.length > 1,
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
    let canChooseAnother = false;
    try {
      const current = await discoverReports(data.email, this.env, timing, action === 'send');
      authorized = current.find((candidate) => candidate.path === path);
      canChooseAnother = current.filter((candidate) => (
        data.candidates.some((item) => item.path === candidate.path)
      )).length > 1;
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
      if (record.selectedPath !== path) {
        const previous = record.reports?.[path];
        record.delivery = previous?.delivery || 'ready';
        record.viewed = previous?.viewed === true;
      }
      record.selectedPath = path;
      await this.activity([createBoothActivity('report_selected', record.key, data.email, authorized)], record, timing);
      return reply({ state: 'report', selectedPath: path, candidates: [], canChooseAnother, expiresAt: record.expiresAt });
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
    const response = await sendAuthorizedBoothReport(
      data.email,
      path,
      new URL(request.url).origin,
      authorized.grantGroups,
      authorized.org,
      this.env,
    );
    if (!response.ok) {
      operationalError('Share-link dispatch could not be confirmed');
      return reply({ error: 'Email delivery could not be confirmed. Ask the booth team; do not send again.' }, 502);
    }
    record.delivery = 'sent';
    await this.activity([createBoothActivity('report_sent', record.key, data.email, authorized)], record, timing);
    return reply({ sent: true });
  }
}
