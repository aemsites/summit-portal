import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoothCoordinator, handleBooth, discoverReports } from '../src/booth.js';
import { createSession } from '../src/session.js';
import { createMockEnv, createMockBoothD1, createMockBoothStorage, createMockBoothCookie } from './helpers.js';
import { sendAuthorizedBoothReport } from '../src/sharelink.js';
import * as cugsheet from '../src/cugsheet.js';
import { createBoothActivity } from '../src/booth-activity.js';

vi.mock('../src/sharelink.js', () => ({ sendAuthorizedBoothReport: vi.fn() }));

const path = '/accounts/e/example/insights/example-com/portal-landing/';
const second = '/accounts/e/example/insights/example-org/portal-landing/';

function fixtures() {
  return {
    '/data/insights-list.json': [
      { Report: 'example.com', Customers: 'Example', Folder: path, Created: '1.10.2026' },
    ],
    '/closed-user-groups.json': [
      { url: '/accounts**', 'cug-groups': 'adobe.com,semrush.com' },
      { url: '/accounts/e/example**', 'cug-groups': 'adobe.com,example.com' },
    ],
    '/closed-user-groups-mapping.json': [
      { url: '/accounts/e/example/*', group: 'example.com', org: 'Adobe' },
    ],
  };
}

describe('booth isolated context', () => {
  let env;
  let cookie;
  let data;
  let actor;
  let state;
  async function request(action, body, overrides = {}) {
    const payload = action === 'lookup' ? { noticeVersion: 'booth-privacy-v1', ...body } : body;
    const req = new Request(`https://portal.example/auth/booth/${action}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, Origin: 'https://portal.example', 'Content-Type': 'application/json', ...overrides },
      ...(body === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const response = await handleBooth(req, env);
    const id = response.headers.get('Set-Cookie')?.match(/booth_context=([^;]+)/)?.[1];
    if (id) cookie = `${cookie.replace(/;\s*booth_context=[^;]+/, '')}; booth_context=${id}`;
    return response;
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    env = createMockEnv({ REPORT_REQUESTS: createMockBoothD1() });
    env.EVENT_CRED_EPOCH = '1';
    cookie = await createMockBoothCookie(env);
    data = fixtures();
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const rows = data[new URL(url).pathname];
      return rows ? new Response(JSON.stringify({ data: rows }), { headers: { 'Content-Type': 'application/json' } })
        : new Response(null, { status: 404 });
    }));
    state = { storage: createMockBoothStorage(), waitUntil: vi.fn() };
    actor = new BoothCoordinator(state, env);
    env.BOOTH_COORDINATOR = { idFromName: (id) => id, get: () => actor };
    vi.mocked(sendAuthorizedBoothReport).mockReset().mockResolvedValue(new Response('{"result":"sent"}'));
  });

  it('staff-gates every route, rejects customer and unverified staff sessions', async () => {
    for (const action of ['status', 'lookup', 'select', 'view', 'contact', 'send', 'reset', 'activity']) {
      expect((await request(action, action === 'status' ? undefined : {}, { Cookie: '' })).status).toBe(401);
    }
    cookie = `auth_token=${await createSession(env, { email: 'operator@adobe.com', method: 'sharelink' })}`;
    expect((await request('lookup', { email: 'visitor@example.com' })).status).toBe(401);
    cookie = `auth_token=${await createSession(env, { email: 'visitor@example.com', method: 'oauth' })}`;
    expect((await request('status')).status).toBe(401);
  });

  it('enforces same-origin JSON, method, known endpoints and configuration', async () => {
    expect((await request('lookup', {}, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await request('reset', {}, { Origin: '' })).status).toBe(403);
    expect((await request('reset', {}, { 'Content-Type': 'text/plain' })).status).toBe(403);
    expect((await request('send')).status).toBe(405);
    expect((await request('other', {})).status).toBe(404);
    env.BOOTH_COORDINATOR = null;
    expect((await request('status')).status).toBe(503);
  });

  it('opens a single authorized report without returning email or full catalogue', async () => {
    const response = await request('lookup', { email: 'visitor@example.com' });
    const result = await response.json();
    expect(result.selectedPath).toBe(path);
    expect(result.candidates).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('visitor@');
    expect(response.headers.get('Set-Cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect([...env.SESSIONS.store.values()].join()).toContain('visitor@example.com');
  });

  it('uses a fifteen-minute inactivity expiry and refreshes KV, cookies and alarm only for visitor input', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const started = Date.now();
      const lookup = await (await request('lookup', { email: 'visitor@example.com' })).json();
      expect(lookup.expiresAt).toBe(started + 900000);
      const record = await state.storage.get('context');
      const put = vi.spyOn(env.SESSIONS, 'put');
      const alarm = vi.spyOn(state.storage, 'setAlarm');
      vi.setSystemTime(started + 840000);
      const response = await request('activity', { idleMs: 2000 });
      const renewed = await response.json();
      expect(renewed).toEqual({ expiresAt: started + 1738000 });
      expect(response.headers.get('Set-Cookie')).toContain('Max-Age=900');
      expect(response.headers.get('Set-Cookie')).not.toContain('booth_session');
      expect(put).toHaveBeenCalledWith(`booth:${record.key}`, expect.any(String), { expirationTtl: 898 });
      expect(alarm).toHaveBeenLastCalledWith(renewed.expiresAt);
      expect(await state.storage.get('context')).toMatchObject({ key: record.key, selectedPath: path, expiresAt: renewed.expiresAt });
      vi.setSystemTime(started + 1000000);
      actor = new BoothCoordinator(state, env);
      expect((await (await request('status')).json()).expiresAt).toBe(renewed.expiresAt);
      vi.setSystemTime(renewed.expiresAt);
      expect((await request('activity', { idleMs: 0 })).status).toBe(410);
      expect(await state.storage.get('context')).toBeUndefined();
      expect(env.SESSIONS.store.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not renew access for background status, asset authorization, picker or duplicate view requests', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const lookup = await (await request('lookup', { email: 'visitor@example.com' })).json();
      vi.setSystemTime(Date.now() + 300000);
      await request('status');
      await actor.fetch(new Request('https://portal.example/auth/booth/authorize', { headers: { Cookie: cookie } }));
      await request('view', { path });
      await request('picker', {});
      expect((await state.storage.get('context')).expiresAt).toBe(lookup.expiresAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it('respects the KV minimum retention without extending the inactivity deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const lookup = await (await request('lookup', { email: 'visitor@example.com' })).json();
      const record = await state.storage.get('context');
      const put = vi.spyOn(env.SESSIONS, 'put');
      vi.setSystemTime(lookup.expiresAt - 1000);
      const response = await request('activity', { idleMs: 899500 });
      expect(await response.json()).toEqual({ expiresAt: lookup.expiresAt });
      expect(put).toHaveBeenLastCalledWith(`booth:${record.key}`, expect.any(String), { expirationTtl: 60 });
      vi.setSystemTime(lookup.expiresAt);
      expect((await request('activity', { idleMs: 0 })).status).toBe(410);
      expect(env.SESSIONS.store.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects malformed activity, wrong devices, revoked staff and revoked report permissions', async () => {
    expect((await request('activity', { idleMs: 0 })).status).toBe(410);
    await request('lookup', { email: 'visitor@example.com' });
    for (const body of [{}, { idleMs: -1 }, { idleMs: 900000 }, { idleMs: '0' }, { idleMs: 0.5 }, { idleMs: 0, path }]) {
      expect((await request('activity', body)).status).toBe(400);
    }
    expect((await request('activity', { idleMs: 0 }, { Origin: 'https://other.example' })).status).toBe(403);
    const original = cookie;
    cookie = `${await createMockBoothCookie(env, 'other@adobe.com')}; ${original.match(/booth_context=[^;]+/)[0]}`;
    expect((await request('activity', { idleMs: 0 })).status).toBe(403);
    cookie = original;
    env.EVENT_CRED_EPOCH = '2';
    expect((await request('activity', { idleMs: 0 })).status).toBe(401);
    env.EVENT_CRED_EPOCH = '1';
    data['/closed-user-groups.json'] = [];
    expect((await request('activity', { idleMs: 0 })).status).toBe(410);
    expect(env.SESSIONS.store.size).toBe(0);
  });

  it('renews demo and no-match visits without generating additional lead events', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const lookup = await request('lookup', { email: 'visitor@unknown.example' });
      expect(lookup.status).toBe(404);
      expect(await lookup.json()).toMatchObject({ code: 'no_report', expiresAt: (await state.storage.get('context')).expiresAt });
      const events = env.REPORT_REQUESTS.events.size;
      const initial = (await state.storage.get('context')).expiresAt;
      vi.setSystemTime(Date.now() + 300000);
      expect((await (await request('activity', { idleMs: 0 })).json()).expiresAt).toBe(initial + 300000);
      const demo = await (await request('demo', { id: 'luma' })).json();
      vi.setSystemTime(Date.now() + 600000);
      expect((await (await request('activity', { idleMs: 1000 })).json()).expiresAt).toBe(demo.expiresAt + 599000);
      expect(env.REPORT_REQUESTS.events.size).toBe(events + 1);
      await request('reset', {});
      expect((await request('activity', { idleMs: 0 })).status).toBe(410);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes opt-in, identity-free stage timings without changing fresh revalidation', async () => {
    env.BOOTH_TIMING_ENABLED = 'true';
    data['/data/insights-list.json'].push({ Folder: second, Report: 'example.org' });
    const lookup = await request('lookup', { email: 'visitor@example.com' });
    const lookupTiming = lookup.headers.get('Server-Timing');
    expect(lookupTiming).toContain('booth_total;dur=');
    expect(lookupTiming).toContain('booth_auth;dur=');
    expect(lookupTiming).toContain('booth_rpc;dur=');
    expect(lookupTiming).toContain('booth_queue;dur=');
    expect(lookupTiming).toContain('booth_actor;dur=');
    expect(lookupTiming).toContain('booth_storage;dur=');
    expect(lookupTiming).toContain('booth_d1;dur=');
    expect(lookupTiming).toContain('booth_match;desc="CPU timing unavailable"');
    ['index', 'cugs', 'mapping'].forEach((name) => {
      expect(lookupTiming).toContain(`booth_${name}_fetch;dur=`);
      expect(lookupTiming).toContain(`booth_${name}_body;dur=`);
      expect(lookupTiming).toContain(`booth_${name}_rows;desc=`);
    });
    expect((await lookup.json()).state).toBe('picker');
    expect(fetch).toHaveBeenCalledTimes(3);
    const selection = await request('select', { path });
    expect(selection.headers.get('Server-Timing')).toContain('booth_kv_read;dur=');
    expect(selection.headers.get('Server-Timing')).toContain('booth_d1;dur=');
    expect((await selection.json()).selectedPath).toBe(path);
    expect(fetch).toHaveBeenCalledTimes(6);
    const status = await request('status');
    const statusTiming = status.headers.get('Server-Timing');
    expect(statusTiming).toContain('booth_kv_read;dur=');
    expect(statusTiming).toContain('booth_index');
    expect(statusTiming).not.toContain('booth_d1');
    expect((await status.json()).state).toBe('report');
    expect(fetch).toHaveBeenCalledTimes(9);
    [lookupTiming, selection.headers.get('Server-Timing'), statusTiming].forEach((header) => {
      expect(header).not.toContain('visitor');
      expect(header).not.toContain('example');
      expect(header).not.toContain('/accounts');
      header.split(', ').forEach((metric) => {
        expect(metric).toMatch(/^booth_[a-z0-9_]+;(dur=\d+\.\d|desc="(\d+ rows|CPU timing unavailable)")$/);
      });
    });
  });

  it('keeps timings disabled by default and absent for unauthenticated requests', async () => {
    expect((await request('lookup', { email: 'visitor@example.com' })).headers.get('Server-Timing')).toBeNull();
    env.BOOTH_TIMING_ENABLED = 'true';
    const unauthorized = await request('status', undefined, { Cookie: '' });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('Server-Timing')).toBeNull();
  });

  it('measures queue wait without attributing another request work to status', async () => {
    env.BOOTH_TIMING_ENABLED = 'true';
    data['/data/insights-list.json'].push({ Folder: second, Report: 'example.org' });
    await request('lookup', { email: 'visitor@example.com' });
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    let releaseIndex;
    let indexStarted;
    let statusQueued;
    const gate = new Promise((resolve) => { releaseIndex = resolve; });
    const discoveryStarted = new Promise((resolve) => { indexStarted = resolve; });
    const queued = new Promise((resolve) => { statusQueued = resolve; });
    const serve = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (new URL(url).pathname === '/data/insights-list.json') {
        indexStarted();
        await gate;
      }
      return serve(url, options);
    });
    const actorFetch = actor.fetch.bind(actor);
    vi.spyOn(actor, 'fetch').mockImplementation((req) => {
      const response = actorFetch(req);
      if (new URL(req.url).pathname.endsWith('/status')) statusQueued();
      return response;
    });
    const selecting = request('select', { path });
    await discoveryStarted;
    const status = request('status');
    await queued;
    now = 75;
    releaseIndex();
    const [selectionResponse, statusResponse] = await Promise.all([selecting, status]);
    expect(selectionResponse.headers.get('Server-Timing')).toContain('booth_index_fetch;dur=75.0');
    const header = statusResponse.headers.get('Server-Timing');
    expect(header).toContain('booth_queue;dur=75.0');
    expect(header).toContain('booth_actor;dur=0.0');
    expect(header).toContain('booth_index');
    expect(header).not.toContain('booth_d1');
    expect((await statusResponse.json()).selectedPath).toBe(path);
  });

  it('measures D1 export while retaining the durable activity and response', async () => {
    env.BOOTH_TIMING_ENABLED = 'true';
    data['/data/insights-list.json'].push({ Folder: second, Report: 'example.org' });
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const prepare = env.REPORT_REQUESTS.prepare.bind(env.REPORT_REQUESTS);
    vi.spyOn(env.REPORT_REQUESTS, 'prepare').mockImplementation((sql) => ({
      bind: (...params) => {
        const statement = prepare(sql).bind(...params);
        return {
          ...statement,
          run: async () => {
            now += 43;
            return statement.run();
          },
        };
      },
    }));
    const response = await request('lookup', { email: 'visitor@example.com' });
    expect(response.headers.get('Server-Timing')).toContain('booth_d1;dur=43.0');
    expect(response.headers.get('Server-Timing')).toContain('booth_total;dur=43.0');
    expect((await response.json()).state).toBe('picker');
    expect(env.REPORT_REQUESTS.events.size).toBe(1);
    expect(await state.storage.get('activity')).toBeUndefined();
  });

  it('retains diagnostic stages and existing fail-closed responses on discovery failure', async () => {
    env.BOOTH_TIMING_ENABLED = 'true';
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const response = await request('lookup', { email: 'visitor@example.com' });
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe('Prepared reports cannot be checked right now. Ask the booth team.');
    expect(response.headers.get('Server-Timing')).toContain('booth_index_fetch;dur=');
    expect(response.headers.get('Server-Timing')).not.toContain('booth_match');
  });

  it('filters unauthorized aliases before latest and prefers authorized portal landings', async () => {
    data['/data/insights-list.json'].push(
      { Folder: '/accounts/u/unrelated/insights/example-com/portal-landing/', Created: '2.10.2026' },
      { Folder: '/adobe/data/customer/other/', Report: 'Internal' },
      { Folder: '/accounts/e/example/insights/example-com/', Created: '3.10.2026' },
    );
    expect(await discoverReports('visitor@example.com', env)).toEqual([{ path, label: 'Example — example.com', company: 'Example' }]);
    expect(await discoverReports('operator@adobe.com', env)).toEqual([]);
    expect(await discoverReports('nobody@unknown.example', env)).toEqual([]);
  });

  it('does not repeatedly read the whole CUG rule list during large lookup and selection', async () => {
    const size = 1000;
    const report = (i) => `/accounts/e/company-${i}/insights/site-${i}/portal-landing/`;
    data['/data/insights-list.json'] = Array.from({ length: size }, (_, i) => ({ Folder: report(i), Customers: `Company ${i}`, Report: `Site ${i}` }));
    data['/closed-user-groups.json'] = Array.from({ length: size }, (_, i) => ({
      url: `/accounts/e/company-${i}**`,
      'cug-groups': i < 3 ? 'example.com' : `company-${i}.test`,
    }));
    data['/closed-user-groups-mapping.json'] = Array.from({ length: size }, (_, i) => ({
      url: `/accounts/e/company-${i}/*`,
      group: i < 3 ? 'example.com' : `company-${i}.test`,
    }));
    let prefixReads = 0;
    const parse = cugsheet.parseCugSheetRows;
    vi.spyOn(cugsheet, 'parseCugSheetRows').mockImplementation((rows) => parse(rows).map((entry) => {
      const { prefix } = entry;
      return {
        ...entry,
        get prefix() {
          prefixReads += 1;
          return prefix;
        },
      };
    }));

    const response = await request('lookup', { email: 'visitor@example.com' });
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.candidates.map((candidate) => candidate.path)).toEqual([
      report(0), report(1), report(2),
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(prefixReads).toBeLessThanOrEqual(size * 2);
    const selection = await request('select', { path: report(0) });
    expect(selection.status).toBe(200);
    expect((await selection.json()).selectedPath).toBe(report(0));
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(prefixReads).toBeLessThanOrEqual(size * 4);
  });

  it('rebuilds matching from fresh sheets after narrower revocation and regrant', async () => {
    expect((await discoverReports('visitor@example.com', env)).map((candidate) => candidate.path))
      .toEqual([path]);
    const narrower = { url: path, 'cug-groups': 'other.example' };
    data['/closed-user-groups.json'].push(narrower);
    expect(await discoverReports('visitor@example.com', env)).toEqual([]);
    narrower['cug-groups'] = 'visitor@example.com';
    expect((await discoverReports('visitor@example.com', env)).map((candidate) => candidate.path))
      .toEqual([path]);
    expect(fetch).toHaveBeenCalledTimes(9);
  });

  it('orders DIH and ISO Created dates consistently among authorized aliases', async () => {
    const alias = '/accounts/e/example-alias/insights/example-com/portal-landing/';
    data['/data/insights-list.json'].push({ Folder: alias, Created: '2026-09-30T00:00:00Z' });
    data['/closed-user-groups.json'].push({ url: '/accounts/e/example-alias**', 'cug-groups': 'example.com' });
    data['/closed-user-groups-mapping.json'].push({ url: '/accounts/e/example-alias/*', group: 'example.com' });
    expect((await discoverReports('visitor@example.com', env))[0].path).toBe(path);
    data['/data/insights-list.json'][1].Created = '2026-10-02T00:00:00Z';
    expect((await discoverReports('visitor@example.com', env))[0].path).toBe(alias);
  });

  it('honors the most-specific CUG AND mapping scope, never falls back on failure', async () => {
    data['/closed-user-groups.json'].push({ url: path, 'cug-groups': 'other.example' });
    expect(await discoverReports('visitor@example.com', env)).toEqual([]);
    data = fixtures();
    data['/closed-user-groups-mapping.json'].push({ url: path, group: 'other.example' });
    expect(await discoverReports('visitor@example.com', env)).toEqual([]);
    delete data['/closed-user-groups.json'];
    expect((await request('lookup', { email: 'visitor@example.com' })).status).toBe(502);
  });

  it('uses the origin secret privately and handles incomplete pagination fail-closed', async () => {
    env.ORIGIN_AUTHENTICATION = 'test-only-origin-secret';
    await discoverReports('visitor@example.com', env);
    expect(fetch.mock.calls[0][1].headers.authorization).toBe('token test-only-origin-secret');
    vi.mocked(fetch).mockImplementation(async () => new Response('{"data":[],"total":2}'));
    expect((await request('lookup', { email: 'visitor@example.com' })).status).toBe(502);
  });

  it('accepts the live full-sheet metadata shape and counts without pagination guesses', async () => {
    const counts = {
      '/data/insights-list.json': 9277,
      '/closed-user-groups.json': 8641,
      '/closed-user-groups-mapping.json': 9380,
    };
    vi.mocked(fetch).mockImplementation(async (url) => {
      const name = new URL(url).pathname;
      const rows = Array.from({ length: counts[name] }, (_, index) => data[name][index] || {});
      return new Response(JSON.stringify({ total: rows.length, limit: rows.length, offset: 0, data: rows, ':type': 'sheet' }));
    });
    const response = await request('lookup', { email: 'visitor@example.com' });
    expect(response.status).toBe(200);
    expect((await response.json()).selectedPath).toBe(path);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('uses workerd-supported manual redirects and completes an authorized lookup', async () => {
    const originFetch = fetch.getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (options.redirect === 'error') {
        throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
      }
      return originFetch(url, options);
    });
    const response = await request('lookup', { email: 'visitor@example.com' });
    expect(response.status).toBe(200);
    expect((await response.json()).selectedPath).toBe(path);
    expect(fetch.mock.calls.every(([, options]) => options.redirect === 'manual')).toBe(true);
  });

  it('rejects actual origin redirects without following them or leaking credentials', async () => {
    env.ORIGIN_AUTHENTICATION = 'test-only-private-origin-token';
    vi.mocked(fetch).mockImplementation(async () => new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/elsewhere' } }));
    const response = await request('lookup', { email: 'visitor@example.com' });
    expect(response.status).toBe(502);
    expect(fetch.mock.calls).toHaveLength(3);
    expect(fetch.mock.calls.every(([url, options]) => new URL(url).hostname === env.ORIGIN_HOSTNAME
      && options.redirect === 'manual')).toBe(true);
  });

  it('classifies timeout at the lookup seam without logging raw exception content', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.mocked(fetch).mockRejectedValue(new DOMException(
        'test-only-sensitive-header visitor@example.com https://private.example/?token=private',
        'TimeoutError',
      ));
      const response = await request('lookup', { email: 'visitor@example.com' });
      expect(response.status).toBe(502);
      expect((await response.json()).error).toBe('Prepared reports cannot be checked right now. Ask the booth team.');
      const output = JSON.stringify(logged.mock.calls);
      expect(output).toContain('index fetch page=0 deadline-or-abort');
      expect(output).not.toContain('visitor@');
      expect(output).not.toContain('sensitive');
      expect(output).not.toContain('token=');
    } finally {
      logged.mockRestore();
    }
  });

  it('requires explicit selection from candidates and revalidates current permissions', async () => {
    data['/data/insights-list.json'].push({ Folder: second, Report: '<script>test</script>' });
    const result = await (await request('lookup', { email: 'visitor@example.com' })).json();
    expect(result.state).toBe('picker');
    expect(result.candidates).toHaveLength(2);
    expect((await request('select', { path: '/adobe/dashboard/' })).status).toBe(400);
    expect((await request('send', {})).status).toBe(400);
    data['/closed-user-groups.json'] = [];
    expect((await request('select', { path: second })).status).toBe(403);
    expect((await request('status')).status).toBe(200);
    expect(await (await request('status')).json()).toEqual({ state: 'entry', canChooseAnother: false });
  });

  it('sends only context email/path and serializes duplicate requests across actor restart', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    expect((await request('send', { email: 'other@example.com', path: second })).status).toBe(400);
    const results = await Promise.all([request('send', {}), request('send', {})]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(sendAuthorizedBoothReport).toHaveBeenCalledTimes(1);
    expect(sendAuthorizedBoothReport.mock.calls[0].slice(0, 5)).toEqual(['visitor@example.com', path, 'https://portal.example', ['example.com'], 'Adobe']);
    actor = new BoothCoordinator(state, env);
    expect((await request('send', {})).status).toBe(200);
    expect(sendAuthorizedBoothReport).toHaveBeenCalledTimes(1);
  });

  it('switches through an authorized picker without new identity, expiry, duplicate sends or views', async () => {
    data['/data/insights-list.json'].push({ Folder: second, Report: 'Example.org' });
    const lookup = await (await request('lookup', { email: 'visitor@example.com' })).json();
    expect(lookup.canChooseAnother).toBe(true);
    await request('select', { path });
    await request('view', { path });
    await request('send', {});
    await request('select', { path });
    await request('send', {});
    expect(sendAuthorizedBoothReport).toHaveBeenCalledTimes(1);
    const picker = await (await request('picker', {})).json();
    expect(picker).toMatchObject({ state: 'picker', expiresAt: lookup.expiresAt, canChooseAnother: true });
    expect(picker.candidates).toHaveLength(2);
    expect((await request('send', {})).status).toBe(400);
    const selection = await (await request('select', { path: second })).json();
    expect(selection).toMatchObject({ state: 'report', candidates: [], expiresAt: lookup.expiresAt, canChooseAnother: true });
    await request('view', { path: second });
    await request('send', {});
    actor = new BoothCoordinator(state, env);
    await request('picker', {});
    await request('select', { path });
    await request('view', { path });
    expect((await (await request('status')).json()).sent).toBe(true);
    await request('send', {});
    expect(sendAuthorizedBoothReport).toHaveBeenCalledTimes(2);
    expect(sendAuthorizedBoothReport.mock.calls.map((args) => args.slice(0, 2))).toEqual([
      ['visitor@example.com', path], ['visitor@example.com', second],
    ]);
    const events = [...env.REPORT_REQUESTS.events.values()];
    expect(events.filter((event) => event.kind === 'search')).toHaveLength(1);
    expect(events.filter((event) => event.kind === 'report_viewed')).toHaveLength(2);
    expect(events.filter((event) => event.kind === 'report_sent')).toHaveLength(2);
    expect(events.some((event) => event.kind === 'contact_requested')).toBe(false);
    await request('reset', {});
    expect((await request('select', { path: second })).status).toBe(410);
    expect(env.SESSIONS.store.size).toBe(0);
  });

  it('keeps uncertain delivery nonretryable per report across switches and restarts', async () => {
    data['/data/insights-list.json'].push({ Folder: second });
    await request('lookup', { email: 'visitor@example.com' });
    await request('select', { path });
    sendAuthorizedBoothReport.mockResolvedValueOnce(new Response(null, { status: 502 }));
    expect((await request('send', {})).status).toBe(502);
    await request('picker', {});
    await request('select', { path: second });
    expect((await request('send', {})).status).toBe(200);
    await request('picker', {});
    actor = new BoothCoordinator(state, env);
    await request('select', { path });
    expect((await request('send', {})).status).toBe(409);
    expect(sendAuthorizedBoothReport).toHaveBeenCalledTimes(2);
  });

  it('rechecks narrower CUG and mapping when returning to picker and selecting again', async () => {
    data['/data/insights-list.json'].push({ Folder: second });
    await request('lookup', { email: 'visitor@example.com' });
    await request('select', { path });
    expect((await request('picker', { path: second })).status).toBe(400);
    data['/closed-user-groups-mapping.json'].push({ url: second, group: 'different.example' });
    const picker = await (await request('picker', {})).json();
    expect(picker.candidates.map((candidate) => candidate.path)).toEqual([path]);
    expect(picker.canChooseAnother).toBe(false);
    expect((await request('select', { path: second })).status).toBe(400);
    data['/closed-user-groups.json'].push({ url: path, 'cug-groups': 'different.example' });
    expect((await request('select', { path })).status).toBe(403);
  });

  it('can discard a revoked selection and choose a different still-authorized original candidate', async () => {
    data['/data/insights-list.json'].push({ Folder: second });
    await request('lookup', { email: 'visitor@example.com' });
    await request('select', { path });
    data['/closed-user-groups.json'].push({ url: path, 'cug-groups': 'other.example' });
    const picker = await (await request('picker', {})).json();
    expect(picker.state).toBe('picker');
    expect(picker.candidates.map((candidate) => candidate.path)).toEqual([second]);
    expect((await request('select', { path: second })).status).toBe(200);
    expect((await request('select', { path })).status).toBe(400);
  });

  it('never renews the attendee deadline on picker and fails if discovery crosses expiry', async () => {
    data['/data/insights-list.json'].push({ Folder: second });
    await request('lookup', { email: 'visitor@example.com' });
    await request('select', { path });
    const originalFetch = fetch.getMockImplementation();
    const deadline = (await state.storage.get('context')).expiresAt;
    vi.useFakeTimers({ toFake: ['Date'] });
    fetch.mockImplementation(async (...args) => {
      vi.setSystemTime(deadline + 1);
      return originalFetch(...args);
    });
    expect((await request('picker', {})).status).toBe(410);
    expect(await state.storage.get('context')).toBeUndefined();
    vi.useRealTimers();
  });

  it('does not claim success or retry after uncertain upstream delivery', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    vi.mocked(sendAuthorizedBoothReport).mockResolvedValue(new Response('{"error":"upstream"}', { status: 502 }));
    expect((await request('send', {})).status).toBe(502);
    expect((await request('send', {})).status).toBe(409);
    expect((await (await request('status')).json()).sent).toBe(false);
    actor = new BoothCoordinator(state, env);
    expect((await request('send', {})).status).toBe(409);
    expect(sendAuthorizedBoothReport).toHaveBeenCalledTimes(1);
  });

  it('rejects expiry, revoked staff epoch, cross-session use and permission revocation', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    const original = cookie;
    cookie = `${await createMockBoothCookie(env, 'other@adobe.com')}; ${original.match(/booth_context=[^;]+/)[0]}`;
    expect((await request('send', {})).status).toBe(403);
    cookie = original;
    env.EVENT_CRED_EPOCH = '2';
    expect((await request('send', {})).status).toBe(401);
    env.EVENT_CRED_EPOCH = '1';
    data['/closed-user-groups.json'] = [];
    expect((await request('send', {})).status).toBe(403);
    data = fixtures();
    await request('lookup', { email: 'visitor@example.com' });
    const record = await state.storage.get('context');
    record.expiresAt = Date.now() - 1;
    await state.storage.put('context', record);
    expect((await request('send', {})).status).toBe(410);
    expect(env.SESSIONS.store.size).toBe(0);
  });

  it('reset erases attendee state but never clears staff authentication', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    const response = await request('reset', {});
    expect(response.headers.get('Set-Cookie')).not.toContain('auth_token');
    expect(env.SESSIONS.store.size).toBe(0);
    expect(await (await request('status')).json()).toEqual({ state: 'entry', canChooseAnother: false });
    expect((await request('send', {})).status).toBe(410);
  });

  it('correlates search, selected company, opened report and send without a contact opt-in', async () => {
    await request('lookup', { email: ' VISITOR@Example.COM ' });
    expect((await request('view', { path })).status).toBe(200);
    expect((await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' })).status).toBe(404);
    expect((await request('send', {})).status).toBe(200);
    const events = [...env.REPORT_REQUESTS.events.values()];
    expect(events.map((event) => event.kind)).toEqual(['search', 'report_selected', 'report_viewed', 'report_sent']);
    expect(new Set(events.map((event) => event.flow_id)).size).toBe(1);
    expect(events.every((event) => event.email === 'visitor@example.com')).toBe(true);
    expect(events.slice(1).every((event) => event.report_path === path && event.company === 'Example')).toBe(true);
    expect(events.every((event) => event.notice_version === 'booth-privacy-v1')).toBe(true);
    await request('reset', {});
    expect(env.REPORT_REQUESTS.events.size).toBe(4);
    await request('lookup', { email: 'next@example.com' });
    const flows = [...env.REPORT_REQUESTS.events.values()].map((event) => event.flow_id);
    expect(new Set(flows).size).toBe(2);
  });

  it('records unsuccessful searches but rejects invalid input and missing notice', async () => {
    expect((await request('lookup', { email: 'invalid' })).status).toBe(400);
    expect((await request('lookup', { email: 'visitor@example.com', noticeVersion: 'old' })).status).toBe(409);
    expect(env.REPORT_REQUESTS.events.size).toBe(0);
    expect((await request('lookup', { email: 'person@unmatched.example' })).status).toBe(404);
    delete data['/closed-user-groups.json'];
    expect((await request('lookup', { email: 'visitor@example.com' })).status).toBe(502);
    expect([...env.REPORT_REQUESTS.events.values()].map((event) => event.kind)).toEqual(['search', 'no_report', 'search']);
  });

  it('privately correlates unmatched searches with selected and actually opened industry demos', async () => {
    const email = 'person@unmatched.example';
    expect((await request('lookup', { email })).status).toBe(404);
    const missing = await (await request('status')).json();
    expect(missing.state).toBe('unavailable');
    expect(JSON.stringify(missing)).not.toContain(email);
    const picker = await (await request('demo-picker', {})).json();
    expect(picker).toMatchObject({ state: 'demos', unmatched: true });
    expect(JSON.stringify(picker)).not.toContain(email);
    expect((await request('demo', { id: 'luma' })).status).toBe(200);
    const selected = await (await request('status')).json();
    expect(JSON.stringify(selected)).not.toContain(email);
    expect(selected).not.toHaveProperty('flowId');
    expect((await request('view', { path: '/example-report/carvelo/' })).status).toBe(400);
    expect((await request('view', { path: '/example-report/luma/' })).status).toBe(200);
    expect((await request('view', { path: '/example-report/luma/' })).status).toBe(200);
    await request('demo-picker', {});
    await request('demo', { id: 'carvelo' });
    await request('view', { path: '/example-report/carvelo/' });
    const events = [...env.REPORT_REQUESTS.events.values()];
    expect(events.map((event) => event.kind)).toEqual([
      'search', 'no_report', 'demo_selected', 'demo_viewed', 'demo_selected', 'demo_viewed',
    ]);
    expect(events.every((event) => event.email === email)).toBe(true);
    expect(new Set(events.map((event) => event.flow_id)).size).toBe(1);
    expect(events[2]).toMatchObject({ company: 'Luma', report_label: 'Retail / apparel', report_path: '/example-report/luma/' });
    expect(env.SESSIONS.store.size).toBe(0);
    expect((await request('send', {})).status).toBe(409);
    await request('reset', {});
    expect(await state.storage.get('context')).toBeUndefined();
    await request('demo', { id: 'luma' });
    await request('view', { path: '/example-report/luma/' });
    expect(env.REPORT_REQUESTS.events.size).toBe(6);
  });

  it('retains unmatched activity for retry without misclassifying outages or exposing its email', async () => {
    await request('lookup', { email: 'person@unmatched.example' });
    env.REPORT_REQUESTS.prepare = () => { throw new Error('Database offline'); };
    expect((await request('demo', { id: 'luma' })).status).toBe(503);
    const outbox = await state.storage.get('activity');
    expect(outbox.map((event) => event.kind)).toEqual(['demo_selected']);
    const record = await state.storage.get('context');
    expect(record.mode).toBe('demo');
    await request('reset', {});
    expect(await state.storage.get('context')).toBeUndefined();
    expect(await state.storage.get('activity')).toEqual(outbox);
    env.REPORT_REQUESTS = createMockBoothD1();
    await actor.alarm();
    expect([...env.REPORT_REQUESTS.events.values()][0]).toMatchObject({ kind: 'demo_selected', email: 'person@unmatched.example' });
    delete data['/closed-user-groups.json'];
    expect((await request('lookup', { email: 'visitor@example.com' })).status).toBe(502);
    expect(await state.storage.get('context')).toBeUndefined();
    expect((await (await request('demo-picker', {})).json()).unmatched).toBe(false);
  });

  it('does not infer contact consent from searching, viewing or emailing and refuses recipient overrides', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    expect((await request('contact', {})).status).toBe(404);
    expect((await request('contact', { consent: false, noticeVersion: 'booth-privacy-v1' })).status).toBe(404);
    expect((await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1', email: 'other@example.com' })).status).toBe(404);
    expect((await request('view', { path: second })).status).toBe(400);
    await request('send', {});
    expect([...env.REPORT_REQUESTS.events.values()].some((event) => event.kind === 'contact_requested')).toBe(false);
    expect([...env.REPORT_REQUESTS.events.values()].some((event) => event.kind === 'report_viewed')).toBe(false);
  });

  it('deduplicates repeated views and rejects the retired contact route through actor restarts', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    await request('view', { path });
    expect((await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' })).status).toBe(404);
    actor = new BoothCoordinator(state, env);
    await request('view', { path });
    expect((await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' })).status).toBe(404);
    expect(env.REPORT_REQUESTS.events.size).toBe(3);
    expect((await (await request('status')).json()).contactRequested).toBe(false);
  });

  it('rejects a direct retired contact actor call without dispatching email', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    const response = await actor.fetch(new Request('https://portal.example/auth/booth/contact', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, noticeVersion: 'booth-privacy-v1' }),
    }));
    expect(response.status).toBe(404);
    expect(sendAuthorizedBoothReport).not.toHaveBeenCalled();
    expect([...env.REPORT_REQUESTS.events.values()].some((event) => event.kind === 'contact_requested')).toBe(false);
  });

  it('durably queues a successful send during a D1 outage, preserves it through reset and retries without resending', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    const db = env.REPORT_REQUESTS;
    env.REPORT_REQUESTS = undefined;
    const send = await request('send', {});
    expect(send.status).toBe(503);
    expect(await send.json()).toMatchObject({
      sent: true,
      activityPending: true,
      error: 'Your report link was emailed. Activity reporting is delayed. Ask the booth team; do not send again.',
    });
    expect((await (await request('status')).json())).toMatchObject({ sent: true, activityPending: true });
    const pending = await state.storage.get('activity');
    expect(pending[0].kind).toBe('report_sent');
    await request('reset', {});
    expect(await state.storage.get('context')).toBeUndefined();
    expect(await state.storage.get('activity')).toEqual(pending);
    env.REPORT_REQUESTS = db;
    actor = new BoothCoordinator(state, env);
    await actor.alarm();
    expect(await state.storage.get('activity')).toBeUndefined();
    expect([...db.events.values()].filter((event) => event.kind === 'report_sent')).toHaveLength(1);
    expect(sendAuthorizedBoothReport).toHaveBeenCalledTimes(1);
  });

  it('never records uncertain or rejected mail as sent', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    vi.mocked(sendAuthorizedBoothReport).mockResolvedValue(new Response(null, { status: 502 }));
    await request('send', {});
    expect([...env.REPORT_REQUESTS.events.values()].some((event) => event.kind === 'report_sent')).toBe(false);
    expect((await request('send', {})).status).toBe(409);
  });

  it('preserves historical contact records during an outage without re-enabling the action', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    const db = env.REPORT_REQUESTS;
    env.REPORT_REQUESTS = undefined;
    const record = await state.storage.get('context');
    record.contactRequested = true;
    await state.storage.put('context', record);
    await state.storage.put('activity', [createBoothActivity('contact_requested', record.key, 'visitor@example.com', { path, company: 'Example' })]);
    expect((await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' })).status).toBe(404);
    expect((await (await request('status')).json())).toMatchObject({ contactRequested: true, activityPending: true });
    env.REPORT_REQUESTS = db;
    await actor.alarm();
    expect([...db.events.values()].filter((event) => event.kind === 'contact_requested')).toHaveLength(1);
    expect(sendAuthorizedBoothReport).not.toHaveBeenCalled();
    data['/closed-user-groups.json'] = [];
    expect((await request('view', { path })).status).toBe(403);
    expect([...db.events.values()].some((event) => event.kind === 'report_viewed')).toBe(false);
  });

  it('discards expired outbox emails without extending retention or resurrecting attendee access', async () => {
    env.REPORT_REQUESTS = undefined;
    expect((await request('lookup', { email: 'visitor@example.com' })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    const pending = await state.storage.get('activity');
    pending[0].expires_at = new Date(Date.now() - 1).toISOString();
    await state.storage.put('activity', pending);
    await actor.alarm();
    expect(await state.storage.get('activity')).toBeUndefined();
    expect(await state.storage.get('context')).toBeUndefined();
  });

  it('keeps subsequent search emails during an outage and prunes expired entries even while D1 is still unavailable', async () => {
    const db = env.REPORT_REQUESTS;
    env.REPORT_REQUESTS = undefined;
    expect((await request('lookup', { email: 'first@example.com' })).status).toBe(503);
    expect((await request('lookup', { email: 'second@example.com' })).status).toBe(503);
    const pending = await state.storage.get('activity');
    expect(pending.map((event) => event.email)).toEqual(['first@example.com', 'second@example.com']);
    pending[0].expires_at = new Date(Date.now() - 1).toISOString();
    await state.storage.put('activity', pending);
    await actor.alarm();
    expect((await state.storage.get('activity')).map((event) => event.email)).toEqual(['second@example.com']);
    env.REPORT_REQUESTS = db;
    await actor.alarm();
    expect([...db.events.values()].map((event) => event.email)).toEqual(['second@example.com']);
    expect(await state.storage.get('context')).toBeUndefined();
  });

  it('allows retrying the same saved selection after an outage without switching reports or duplicating selection history', async () => {
    data['/data/insights-list.json'].push({ Folder: second });
    expect((await (await request('lookup', { email: 'visitor@example.com' })).json()).state).toBe('picker');
    const db = env.REPORT_REQUESTS;
    env.REPORT_REQUESTS = undefined;
    expect((await request('select', { path })).status).toBe(503);
    expect((await request('select', { path: second })).status).toBe(400);
    env.REPORT_REQUESTS = db;
    expect((await request('select', { path })).status).toBe(200);
    expect([...db.events.values()].filter((event) => event.kind === 'report_selected')).toHaveLength(1);
    expect((await (await request('status')).json()).selectedPath).toBe(path);
  });

  it('retains historical contact events behind an earlier queued view without dispatching mail', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    const db = env.REPORT_REQUESTS;
    env.REPORT_REQUESTS = undefined;
    expect((await request('view', { path })).status).toBe(503);
    const record = await state.storage.get('context');
    const pending = await state.storage.get('activity');
    pending.push(createBoothActivity('contact_requested', record.key, 'visitor@example.com', { path, company: 'Example' }));
    await state.storage.put('activity', pending);
    expect((await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' })).status).toBe(404);
    expect((await state.storage.get('activity')).map((event) => event.kind)).toEqual(['report_viewed', 'contact_requested']);
    const send = await request('send', {});
    expect(send.status).toBe(503);
    expect((await send.json()).error).toContain('has not been sent');
    expect(sendAuthorizedBoothReport).not.toHaveBeenCalled();
    env.REPORT_REQUESTS = db;
    await actor.alarm();
    expect([...db.events.values()].map((event) => event.kind)).toEqual(['search', 'report_selected', 'report_viewed', 'contact_requested']);
  });
});
