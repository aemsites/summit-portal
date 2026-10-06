import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoothCoordinator, handleBooth, discoverReports } from '../src/booth.js';
import { createSession } from '../src/session.js';
import { createMockEnv, createMockBoothD1, createMockBoothStorage } from './helpers.js';
import { handleShareLinkRequest } from '../src/sharelink.js';

vi.mock('../src/sharelink.js', () => ({ handleShareLinkRequest: vi.fn() }));

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
    if (id) cookie = `${cookie.split(';')[0]}; booth_context=${id}`;
    return response;
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    env = createMockEnv({ REPORT_REQUESTS: createMockBoothD1() });
    cookie = `auth_token=${await createSession(env, { email: 'operator@adobe.com', method: 'staff', gen_epoch: '1' })}`;
    env.EVENT_CRED_EPOCH = '1';
    data = fixtures();
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const rows = data[new URL(url).pathname];
      return rows ? new Response(JSON.stringify({ data: rows }), { headers: { 'Content-Type': 'application/json' } })
        : new Response(null, { status: 404 });
    }));
    state = { storage: createMockBoothStorage(), waitUntil: vi.fn() };
    actor = new BoothCoordinator(state, env);
    env.BOOTH_COORDINATOR = { idFromName: (id) => id, get: () => actor };
    vi.mocked(handleShareLinkRequest).mockReset().mockResolvedValue(new Response('{"result":"sent"}'));
  });

  it('staff-gates every route, rejects customer and unverified staff sessions', async () => {
    for (const action of ['status', 'lookup', 'select', 'view', 'contact', 'send', 'reset']) {
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
    expect(response.headers.get('Set-Cookie')).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect([...env.SESSIONS.store.values()].join()).toContain('visitor@example.com');
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
    expect(await (await request('status')).json()).toEqual({ state: 'entry' });
  });

  it('sends only context email/path and serializes duplicate requests across actor restart', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    expect((await request('send', { email: 'other@example.com', path: second })).status).toBe(400);
    const results = await Promise.all([request('send', {}), request('send', {})]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(handleShareLinkRequest).toHaveBeenCalledTimes(1);
    expect(await handleShareLinkRequest.mock.calls[0][0].json()).toEqual({ email: 'visitor@example.com', path, mode: 'email' });
    actor = new BoothCoordinator(state, env);
    expect((await request('send', {})).status).toBe(200);
    expect(handleShareLinkRequest).toHaveBeenCalledTimes(1);
  });

  it('does not claim success or retry after uncertain upstream delivery', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    vi.mocked(handleShareLinkRequest).mockResolvedValue(new Response('{"error":"upstream"}', { status: 502 }));
    expect((await request('send', {})).status).toBe(502);
    expect((await request('send', {})).status).toBe(409);
    expect((await (await request('status')).json()).sent).toBe(false);
    actor = new BoothCoordinator(state, env);
    expect((await request('send', {})).status).toBe(409);
    expect(handleShareLinkRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects expiry, revoked staff epoch, cross-session use and permission revocation', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    const original = cookie;
    cookie = `auth_token=${await createSession(env, { email: 'other@adobe.com', method: 'oauth' })}`;
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
    expect(await (await request('status')).json()).toEqual({ state: 'entry' });
    expect((await request('send', {})).status).toBe(410);
  });

  it('correlates search, selected company, opened report, contact opt-in and send by the asserted email', async () => {
    await request('lookup', { email: ' VISITOR@Example.COM ' });
    expect((await request('view', { path })).status).toBe(200);
    expect((await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' })).status).toBe(200);
    expect((await request('send', {})).status).toBe(200);
    const events = [...env.REPORT_REQUESTS.events.values()];
    expect(events.map((event) => event.kind)).toEqual(['search', 'report_selected', 'report_viewed', 'contact_requested', 'report_sent']);
    expect(new Set(events.map((event) => event.flow_id)).size).toBe(1);
    expect(events.every((event) => event.email === 'visitor@example.com')).toBe(true);
    expect(events.slice(1).every((event) => event.report_path === path && event.company === 'Example')).toBe(true);
    expect(events.every((event) => event.notice_version === 'booth-privacy-v1')).toBe(true);
    await request('reset', {});
    expect(env.REPORT_REQUESTS.events.size).toBe(5);
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
    expect([...env.REPORT_REQUESTS.events.values()].map((event) => event.kind)).toEqual(['search', 'search']);
  });

  it('does not infer contact consent from searching, viewing or emailing and refuses recipient overrides', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    expect((await request('contact', {})).status).toBe(400);
    expect((await request('contact', { consent: false, noticeVersion: 'booth-privacy-v1' })).status).toBe(400);
    expect((await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1', email: 'other@example.com' })).status).toBe(400);
    expect((await request('view', { path: second })).status).toBe(400);
    await request('send', {});
    expect([...env.REPORT_REQUESTS.events.values()].some((event) => event.kind === 'contact_requested')).toBe(false);
    expect([...env.REPORT_REQUESTS.events.values()].some((event) => event.kind === 'report_viewed')).toBe(false);
  });

  it('deduplicates repeated view and contact requests through actor restarts', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    await request('view', { path });
    await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' });
    actor = new BoothCoordinator(state, env);
    await request('view', { path });
    await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' });
    expect(env.REPORT_REQUESTS.events.size).toBe(4);
    expect((await (await request('status')).json()).contactRequested).toBe(true);
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
    expect(handleShareLinkRequest).toHaveBeenCalledTimes(1);
  });

  it('never records uncertain or rejected mail as sent', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    vi.mocked(handleShareLinkRequest).mockResolvedValue(new Response(null, { status: 502 }));
    await request('send', {});
    expect([...env.REPORT_REQUESTS.events.values()].some((event) => event.kind === 'report_sent')).toBe(false);
    expect((await request('send', {})).status).toBe(409);
  });

  it('preserves explicit contact consent during an outage and blocks stale or revoked actions', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    const db = env.REPORT_REQUESTS;
    env.REPORT_REQUESTS = undefined;
    const contact = await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' });
    expect(contact.status).toBe(503);
    expect(await contact.json()).toMatchObject({
      contactRequested: true,
      activityPending: true,
      error: 'Your contact request is recorded. Activity reporting is delayed. The booth team can help.',
    });
    expect((await (await request('status')).json())).toMatchObject({ contactRequested: true, activityPending: true });
    env.REPORT_REQUESTS = db;
    await actor.alarm();
    expect([...db.events.values()].filter((event) => event.kind === 'contact_requested')).toHaveLength(1);
    expect(handleShareLinkRequest).not.toHaveBeenCalled();
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

  it('retains contact consent behind an earlier queued view and never dispatches mail during its reporting failure', async () => {
    await request('lookup', { email: 'visitor@example.com' });
    const db = env.REPORT_REQUESTS;
    env.REPORT_REQUESTS = undefined;
    expect((await request('view', { path })).status).toBe(503);
    const contact = await request('contact', { consent: true, noticeVersion: 'booth-privacy-v1' });
    expect(contact.status).toBe(503);
    expect((await contact.json()).contactRequested).toBe(true);
    expect((await state.storage.get('activity')).map((event) => event.kind)).toEqual(['report_viewed', 'contact_requested']);
    const send = await request('send', {});
    expect(send.status).toBe(503);
    expect((await send.json()).error).toContain('has not been sent');
    expect(handleShareLinkRequest).not.toHaveBeenCalled();
    env.REPORT_REQUESTS = db;
    await actor.alarm();
    expect([...db.events.values()].map((event) => event.kind)).toEqual(['search', 'report_selected', 'report_viewed', 'contact_requested']);
  });
});
