import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoothCoordinator, handleBooth, discoverReports } from '../src/booth.js';
import { createSession } from '../src/session.js';
import { createMockEnv } from './helpers.js';
import { handleShareLinkRequest } from '../src/sharelink.js';

vi.mock('../src/sharelink.js', () => ({ handleShareLinkRequest: vi.fn() }));

const path = '/accounts/e/example/insights/example-com/portal-landing/';
const second = '/accounts/e/example/insights/example-org/portal-landing/';

function storage() {
  const values = new Map();
  return {
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => values.set(key, structuredClone(value)),
    deleteAll: async () => values.clear(),
    setAlarm: vi.fn(),
  };
}

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
    const req = new Request(`https://portal.example/auth/booth/${action}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, Origin: 'https://portal.example', 'Content-Type': 'application/json', ...overrides },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const response = await handleBooth(req, env);
    const id = response.headers.get('Set-Cookie')?.match(/booth_context=([^;]+)/)?.[1];
    if (id) cookie = `${cookie.split(';')[0]}; booth_context=${id}`;
    return response;
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    env = createMockEnv();
    cookie = `auth_token=${await createSession(env, { email: 'operator@adobe.com', method: 'staff', gen_epoch: '1' })}`;
    env.EVENT_CRED_EPOCH = '1';
    data = fixtures();
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const rows = data[new URL(url).pathname];
      return rows ? new Response(JSON.stringify({ data: rows }), { headers: { 'Content-Type': 'application/json' } })
        : new Response(null, { status: 404 });
    }));
    state = { storage: storage() };
    actor = new BoothCoordinator(state, env);
    env.BOOTH_COORDINATOR = { idFromName: (id) => id, get: () => actor };
    vi.mocked(handleShareLinkRequest).mockReset().mockResolvedValue(new Response('{"result":"sent"}'));
  });

  it('staff-gates every route, rejects customer and unverified staff sessions', async () => {
    for (const action of ['status', 'lookup', 'select', 'send', 'reset']) {
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
    expect(await discoverReports('visitor@example.com', env)).toEqual([{ path, label: 'Example — example.com' }]);
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
    vi.mocked(fetch).mockResolvedValue(new Response('{"data":[],"total":2}'));
    expect((await request('lookup', { email: 'visitor@example.com' })).status).toBe(502);
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
});
