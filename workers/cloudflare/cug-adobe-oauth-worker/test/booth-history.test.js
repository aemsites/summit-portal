import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import worker from '../src/index.js';
import { BoothCoordinator } from '../src/booth.js';
import { createSession, createShareLinkToken, getSession, getBoothSession, createBoothRevocationToken } from '../src/session.js';
import { handleCallback } from '../src/oauth.js';
import { sha256hex } from '../src/stafflogin.js';
import { resetCugSheetCache } from '../src/cugsheet.js';
import { createMockEnv, createMockBoothD1, createMockBoothStorage } from './helpers.js';

vi.mock('../src/oauth.js', async (original) => ({ ...await original(), handleCallback: vi.fn() }));

const selected = '/accounts/e/example/insights/example-com/portal-landing/';
const other = '/accounts/o/other/insights/other-com/portal-landing/';

describe('request-scoped booth authorization boundary', () => {
  let env;
  let cookies;
  let actor;
  let data;

  async function request(path, body, method, headers = {}, booth = true) {
    const payload = path === '/auth/booth/lookup' ? { noticeVersion: 'booth-privacy-v1', ...body } : body;
    const url = new URL(path, 'https://portal.example');
    if (booth && url.pathname !== '/booth' && !url.pathname.startsWith('/auth/booth/')) url.searchParams.set('booth', '1');
    const response = await worker.fetch(new Request(url, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: {
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        Origin: 'https://portal.example',
        'Content-Type': 'application/json',
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(payload) }),
    }), env);
    response.headers.getSetCookie().forEach((cookie) => {
      const [pair] = cookie.split(';');
      const [key, value] = pair.split('=');
      if (/Max-Age=0(?:;|$)/.test(cookie)) cookies.delete(key);
      else cookies.set(key, value);
    });
    return response;
  }

  async function start() {
    await request('/booth');
    expect((await request('/auth/booth/lookup', { email: 'visitor@example.com' })).status).toBe(200);
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    resetCugSheetCache();
    env = createMockEnv({ REPORT_REQUESTS: createMockBoothD1(), EVENT_CRED_EPOCH: '1' });
    cookies = new Map([['auth_token', await createSession(env, { email: 'operator@adobe.com', groups: ['adobe.com'], method: 'oauth' })]]);
    actor = new BoothCoordinator({ storage: createMockBoothStorage(), waitUntil: vi.fn() }, env);
    env.BOOTH_COORDINATOR = { idFromName: (id) => id, get: () => actor };
    data = {
      '/data/insights-list.json': [{ Folder: selected }],
      '/closed-user-groups-mapping.json': [{ url: '/accounts/e/example**', group: 'example.com' }],
      '/closed-user-groups.json': [{ url: '/accounts**', 'cug-groups': 'adobe.com,example.com' }],
    };
    class Rewriter {
      on(_selector, handler) {
        handler.element({
          prepend: () => {},
          append: () => {},
          setAttribute: () => {},
          getAttribute: () => '',
        });
        return this;
      }

      transform(response) { return response; }
    }
    vi.stubGlobal('HTMLRewriter', Rewriter);
    handleCallback.mockResolvedValue({ userInfo: { email: 'operator@adobe.com', groups: ['adobe.com'] }, originalUrl: '/booth' });
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      if (data[pathname]) return new Response(JSON.stringify({ data: data[pathname] }));
      return new Response('<html><head></head><body>Prepared report</body></html>', {
        headers: {
          'Content-Type': 'text/html',
          'x-aem-cug-required': 'true',
          'x-aem-cug-groups': 'adobe.com',
        },
      });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('adds a separate epoch-bound booth credential without replacing the portal session', async () => {
    await start();
    expect(cookies.has('auth_token')).toBe(true);
    expect(cookies.has('booth_session')).toBe(true);
    expect(cookies.has('booth_device')).toBe(true);
    expect(cookies.has('booth_kiosk')).toBe(false);
    const headers = { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') };
    expect(await getSession(new Request('https://portal.example/?booth=1', { headers }), env)).toBeNull();
    expect(await getSession(new Request('https://portal.example/', { headers }), env)).toMatchObject({ method: 'oauth' });
    expect(await getBoothSession(new Request('https://portal.example/', { headers }), env)).toMatchObject({ epoch: '1', purpose: 'booth-session' });
    expect(await (await request('/auth/me')).json()).toEqual({ authenticated: false });
  });

  it('keeps normal report and guide authentication independent of an active booth visit', async () => {
    await start();
    cookies.delete('auth_token');
    cookies.set('booth_kiosk', '1');
    const context = await actor.state.storage.get('context');
    expect((await request(selected)).status).toBe(200);
    const ordinaryReport = await request(selected, undefined, 'GET', {}, false);
    expect(ordinaryReport.status).toBe(302);
    expect(ordinaryReport.headers.get('Location')).toContain('/login?redirect=');
    const guide = await request('/adobe/booth-guide', undefined, 'GET', {
      Referer: 'https://portal.example/booth',
      'Sec-Fetch-Mode': 'navigate',
    }, false);
    expect(guide.headers.get('Location')).toBe('/auth/portal?redirect=%2Fadobe%2Fbooth-guide');
    handleCallback.mockResolvedValueOnce({
      userInfo: { email: 'operator@adobe.com', groups: ['adobe.com'] },
      originalUrl: 'https://portal.example/adobe/booth-guide',
    });
    const callback = await request('/auth/callback?code=test&state=test', undefined, 'GET', {}, false);
    expect(callback.headers.get('Location')).toBe('https://portal.example/adobe/booth-guide');
    expect((await request('/adobe/booth-guide', undefined, 'GET', {}, false)).status).toBe(200);
    expect(await actor.state.storage.get('context')).toEqual(context);
    expect(cookies.has('booth_session')).toBe(true);
    expect((await request('/adobe/dashboard')).headers.get('Location')).toBe('/booth');
  });

  it('does not grant portal access when the staff form explicitly signs into the booth', async () => {
    cookies.clear();
    cookies.set('booth_kiosk', '1');
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    const payload = { username: 'operator', password: 'test-only-password', action: 'booth-login' };
    const response = await request('/auth/staff-login', payload, 'POST', {}, false);
    expect(response.status).toBe(200);
    expect(cookies.has('auth_token')).toBe(false);
    expect(cookies.has('signed_in')).toBe(false);
    expect(cookies.has('booth_session')).toBe(true);
    expect(cookies.has('booth_kiosk')).toBe(false);
    expect((await request('/adobe/dashboard', undefined, 'GET', {}, false)).headers.get('Location')).toContain('/login?redirect=');
  });

  it('does not reset the attendee when ordinary portal credentials are refreshed or signed out', async () => {
    await start();
    const context = await actor.state.storage.get('context');
    const boothSession = cookies.get('booth_session');
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    const payload = { username: 'operator', password: 'test-only-password' };
    expect((await request('/auth/staff-login', payload, 'POST', {}, false)).status).toBe(200);
    expect(cookies.get('booth_session')).toBe(boothSession);
    expect(await actor.state.storage.get('context')).toEqual(context);
    const logout = await request('/auth/logout', undefined, 'GET', {}, false);
    expect(logout.headers.get('Location')).toContain(env.OAUTH_LOGOUT_URL);
    expect(cookies.has('auth_token')).toBe(false);
    expect(cookies.get('booth_session')).toBe(boothSession);
    expect(await actor.state.storage.get('context')).toEqual(context);
    expect((await request(selected)).status).toBe(200);
  });

  it('preserves the explicitly saved touchscreen setup through scoped OAuth', async () => {
    cookies.clear();
    cookies.set('booth_kiosk', '1');
    handleCallback.mockResolvedValueOnce({
      userInfo: { email: 'operator@adobe.com', groups: ['adobe.com'] },
      originalUrl: 'https://portal.example/booth?touchscreen=1&brand=semrush',
    });
    const response = await request('/auth/callback?code=test&state=test', undefined, 'GET', {}, false);
    expect(response.headers.get('Location')).toBe('/booth?touchscreen=1&brand=semrush');
    expect(cookies.has('booth_session')).toBe(true);
    expect(cookies.has('auth_token')).toBe(false);
    expect(cookies.has('booth_kiosk')).toBe(false);
  });

  it.each(['', 'https://foreign.example'])('requires same-origin authorization for an explicit booth login from %s', async (origin) => {
    cookies.clear();
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    const payload = { username: 'operator', password: 'test-only-password', action: 'booth-login' };
    const response = await request('/auth/staff-login', payload, 'POST', { Origin: origin }, false);
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('keeps restriction cookies on top-level OAuth callbacks instead of dropping Strict cookies', async () => {
    const shell = await request('/booth');
    const markers = shell.headers.getSetCookie().filter((value) => (
      /^booth_(?:session|device|kiosk)=/.test(value) && !value.includes('Max-Age=0')
    ));
    expect(markers).toHaveLength(2);
    markers.forEach((value) => expect(value).toContain('SameSite=Lax'));
    const lookup = await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    expect(lookup.headers.get('Set-Cookie')).toContain('SameSite=Lax');
    const callback = await request('/auth/callback?code=test&state=test', undefined, 'GET', { 'Sec-Fetch-Site': 'cross-site' });
    expect(callback.headers.get('Location')).toBe('/booth');
    expect(cookies.has('auth_token')).toBe(true);
  });

  it.each(['/adobe/dashboard', '/adobe/dashboard/', '/adobe/dashboard.html', '/adobe/data/'])('never restores broad staff privileges through %s', async (path) => {
    await start();
    const previous = await actor.state.storage.get('context');
    const result = await request(path);
    expect(result.status).toBe(302);
    expect(result.headers.get('Location')).toBe('/booth');
    expect(await actor.state.storage.get('context')).toEqual(previous);
    expect((await request(other)).status).toBe(302);
    expect(cookies.has('booth_kiosk')).toBe(false);
  });

  it.each([
    other, `${other}index.html`, `${other}index.plain.html`, `${other}index.md`,
    `${other}data.json`, `${other}report.pdf`, `${selected}report.pdf`,
    `${selected}index.md`, `${selected}index.plain.html`, `${selected}data.json`,
    '/data/insights-list.json', '/data/account-list.json', '/data/company-list.json',
    '/closed-user-groups.json', '/closed-user-groups-mapping.json',
    `${other}media_${'a'.repeat(40)}.png`,
    '/api/report-requests', '/api/report-requests.csv', '/api/booth-activity',
    '/api/booth-activity.csv', '/accounts%2fo%2fother/data.json',
  ])('denies every private representation, index or privileged API: %s', async (path) => {
    await start();
    fetch.mockClear();
    for (const method of ['GET', 'HEAD']) {
      const result = await request(path, undefined, method, { 'If-None-Match': '"cached"' });
      expect(result.status).toBe(302);
      expect(result.headers.get('Location')).toBe('/booth');
      expect(await result.text()).not.toContain('Prepared report');
    }
    expect(fetch.mock.calls.every(([input]) => !new URL(input instanceof Request ? input.url : input).pathname.startsWith('/accounts/'))).toBe(true);
  });

  it.each(['booth_context', 'booth_device', 'booth_kiosk'])('deleting %s never grants portal privileges to a booth request', async (name) => {
    await start();
    cookies.delete(name);
    cookies.set('auth_token', await createSession(env, { email: 'operator@adobe.com', groups: ['adobe.com'], method: 'oauth' }));
    expect((await request(other)).status).toBe(302);
    expect((await request('/adobe/dashboard')).status).toBe(302);
    if (name !== 'booth_kiosk') expect((await request(selected)).status).toBe(302);
  });

  it.each(['forged', ''])('fails closed for a malformed device cookie (%s)', async (value) => {
    await start();
    cookies.set('booth_device', value);
    expect((await request(selected)).status).toBe(302);
    expect((await request('/auth/booth/status')).status).toBe(401);
    cookies.delete('auth_token');
    expect((await request('/booth')).headers.get('Location')).toContain('/login');
  });

  it('keeps restriction through attendee reset, expiry, staff epoch revocation and explicit exit', async () => {
    await start();
    expect((await request(selected)).status).toBe(200);
    await request('/auth/booth/reset', {});
    expect((await request(selected)).status).toBe(302);
    expect(cookies.has('booth_session')).toBe(true);
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 901000);
    expect((await request(selected)).status).toBe(302);
    vi.useRealTimers();
    env.EVENT_CRED_EPOCH = '2';
    expect((await request('/auth/booth/status')).status).toBe(401);
    expect((await request(other)).status).toBe(302);
    env.EVENT_CRED_EPOCH = '1';
    expect((await request('/auth/booth/exit', {})).status).toBe(200);
    expect(cookies.has('booth_session')).toBe(false);
    expect(cookies.has('booth_kiosk')).toBe(false);
    expect((await request('/adobe/dashboard')).status).toBe(302);
  });

  it('keeps explicit booth signout and OAuth re-login separate from the portal session', async () => {
    await start();
    expect((await request('/auth/logout')).headers.get('Location')).toBe('/booth');
    expect(cookies.has('booth_kiosk')).toBe(false);
    expect(cookies.has('booth_session')).toBe(false);
    const portal = await request('/auth/portal?redirect=/adobe/dashboard');
    expect(portal.headers.get('Location')).toContain('https://ims.example.com/authorize');
    const callback = await request('/auth/callback?code=test&state=test');
    expect(callback.headers.get('Location')).toBe('/booth');
    expect(cookies.has('auth_token')).toBe(true);
    expect(cookies.has('booth_session')).toBe(true);
    expect((await request('/adobe/dashboard')).status).toBe(302);
  });

  it('fully exits booth mode only after fresh staff credentials and confirmed visit revocation', async () => {
    await start();
    cookies.set('signed_in', '1');
    cookies.set('auth_token', await createSession(env, { email: 'operator@adobe.com', groups: ['adobe.com'] }));
    const visit = await actor.state.storage.get('context');
    expect(await env.SESSIONS.get(`booth:${visit.key}`)).not.toBeNull();
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    const response = await request('/auth/staff-login', { username: 'operator', password: 'test-only-password', action: 'exit-booth' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'exited' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await actor.state.storage.get('context')).toBeUndefined();
    expect(await env.SESSIONS.get(`booth:${visit.key}`)).toBeNull();
    expect([...cookies.keys()].sort()).toEqual(['auth_token', 'signed_in']);
    expect((await request(other, undefined, 'GET', {}, false)).status).toBe(200);
  });

  it('does not exit or revoke a visit for incorrect reauthentication credentials', async () => {
    await start();
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    const before = new Map(cookies);
    const context = await actor.state.storage.get('context');
    const response = await request('/auth/staff-login', { username: 'operator', password: 'incorrect', action: 'exit-booth' });
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(cookies).toEqual(before);
    expect(await actor.state.storage.get('context')).toEqual(context);
  });

  it.each(['direct', 'prepared'])('does not let a stale tab recreate the %s exited visit or restore its context cookie', async (mode) => {
    await start();
    const staleCookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (mode === 'prepared') {
      expect((await request('/auth/booth/reset', { prepareExit: true })).status).toBe(200);
    }
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    expect((await request('/auth/staff-login', { username: 'operator', password: 'test-only-password', action: 'exit-booth' })).status).toBe(200);
    const lateLookup = await request('/auth/booth/lookup', { email: 'visitor@example.com' }, 'POST', { Cookie: staleCookie });
    expect(lateLookup.status).toBe(410);
    expect([...cookies.keys()]).toEqual(['auth_token']);
    expect(await actor.state.storage.get('context')).toBeUndefined();
    expect((await request(other, undefined, 'GET', {}, false)).status).toBe(200);
  });

  it('keeps scoped staff authentication usable for a new visitor after cancelling the prepared exit', async () => {
    await start();
    const oldId = cookies.get('booth_context');
    const staff = cookies.get('booth_session');
    expect((await request('/auth/booth/reset', { prepareExit: true })).status).toBe(200);
    const nextState = { storage: createMockBoothStorage(), waitUntil: vi.fn() };
    const nextActor = new BoothCoordinator(nextState, env);
    env.BOOTH_COORDINATOR.get = (id) => (id === oldId ? actor : nextActor);
    expect((await request('/booth')).status).toBe(200);
    expect((await request('/auth/booth/lookup', { email: 'visitor@example.com' })).status).toBe(200);
    expect(cookies.get('booth_session')).toBe(staff);
    expect(cookies.has('booth_kiosk')).toBe(false);
    expect(cookies.has('auth_token')).toBe(true);
    expect(cookies.get('booth_context')).not.toBe(oldId);
    expect(await actor.state.storage.get('context')).toBeUndefined();
    expect(await nextActor.state.storage.get('context')).toBeDefined();
  });

  it('preserves terminal retirement when prepared cleanup fails and is retried as an ordinary reset', async () => {
    await start();
    const staleCookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    vi.spyOn(env.SESSIONS, 'delete').mockRejectedValueOnce(new Error('Synthetic cleanup failure'));
    expect((await request('/auth/booth/reset', { prepareExit: true })).status).toBe(500);
    expect((await request('/auth/booth/reset', {})).status).toBe(200);
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    expect((await request('/auth/staff-login', { username: 'operator', password: 'test-only-password', action: 'exit-booth' })).status).toBe(200);
    expect((await request('/auth/booth/lookup', { email: 'visitor@example.com' }, 'POST', { Cookie: staleCookie })).status).toBe(410);
    expect([...cookies.keys()]).toEqual(['auth_token']);
    expect(await actor.state.storage.get('context')).toBeUndefined();
  });

  it('binds permanent exit revocation to its signed purpose rather than an unsigned intent flag', async () => {
    await start();
    const id = cookies.get('booth_context');
    const context = await actor.state.storage.get('context');
    const token = await createBoothRevocationToken(id, 'operator@adobe.com', env);
    const response = await actor.fetch(new Request('https://portal.example/auth/booth/revoke', {
      method: 'POST',
      headers: { Cookie: `booth_context=${id}` },
      body: JSON.stringify({ token, exitBooth: true }),
    }));
    expect(response.status).toBe(403);
    expect(await actor.state.storage.get('context')).toEqual(context);
    expect(await actor.state.storage.get('retired')).toBeUndefined();
  });

  it.each([
    ['cross-origin', { Origin: 'https://untrusted.example' }],
    ['missing origin', { Origin: '' }],
    ['non-JSON', { 'Content-Type': 'text/plain' }],
  ])('rejects %s exit even without a kiosk cookie', async (_name, headers) => {
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    const before = new Map(cookies);
    const response = await request('/auth/staff-login', { username: 'operator', password: 'test-only-password', action: 'exit-booth' }, 'POST', headers);
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(cookies).toEqual(before);
  });

  it.each(['unexpected', 'invalid-json', 'stalled-fetch', 'stalled-body'])('does not clear cookies for %s revocation confirmation', async (failure) => {
    await start();
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    const before = new Map(cookies);
    let reached;
    const ready = new Promise((resolve) => { reached = resolve; });
    vi.spyOn(actor, 'fetch').mockImplementationOnce(async () => {
      reached();
      if (failure === 'stalled-fetch') return new Promise(() => {});
      if (failure === 'stalled-body') return { ok: true, json: async () => new Promise(() => {}) };
      return failure === 'invalid-json' ? new Response('invalid') : Response.json({ state: 'report' });
    });
    vi.useFakeTimers();
    const operation = request('/auth/staff-login', { username: 'operator', password: 'test-only-password', action: 'exit-booth' });
    await ready;
    await vi.advanceTimersByTimeAsync(10001);
    const response = await operation;
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(cookies).toEqual(before);
  });

  it('retains booth credentials if authenticated exit cleanup fails', async () => {
    await start();
    const visit = await actor.state.storage.get('context');
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    const before = new Map(cookies);
    vi.spyOn(env.SESSIONS, 'delete').mockRejectedValueOnce(new Error('Synthetic cleanup failure'));
    const response = await request('/auth/staff-login', { username: 'operator', password: 'test-only-password', action: 'exit-booth' });
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(cookies).toEqual(before);
    expect(await actor.state.storage.get('context')).toBeUndefined();
    expect(await actor.state.storage.get('pendingCleanup')).toBe(visit.key);
    expect((await request(selected)).headers.get('Location')).toBe('/booth');
    expect((await request(other)).headers.get('Location')).toBe('/booth');
    const retry = await request('/auth/staff-login', { username: 'operator', password: 'test-only-password', action: 'exit-booth' });
    expect(retry.status).toBe(200);
    expect(await env.SESSIONS.get(`booth:${visit.key}`)).toBeNull();
    expect(await actor.state.storage.get('pendingCleanup')).toBeUndefined();
    expect([...cookies.keys()]).toEqual(['auth_token']);
  });

  it('can finish a freshly authenticated exit after the old booth credential has expired', async () => {
    await start();
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    cookies.set('booth_session', 'expired');
    const response = await request('/auth/staff-login', { username: 'operator', password: 'test-only-password', action: 'exit-booth' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'exited' });
    expect(await actor.state.storage.get('context')).toBeUndefined();
    expect([...cookies.keys()]).toEqual(['auth_token']);
  });

  it('serves a static recovery screen, never the selected report, and requires confirmed reset', async () => {
    await start();
    const response = await request('/booth?recover=1');
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Reset this booth visit');
    expect(html).toContain("state!=='entry'");
    expect(html).not.toContain('/scripts/booth.js');
    expect((await actor.state.storage.get('context')).selectedPath).toBe(selected);
    expect((await request('/auth/booth/reset', {})).status).toBe(200);
    expect((await request(selected)).status).toBe(302);
  });

  it('retains the context handle until a reset is confirmed by the server', async () => {
    await start();
    const context = cookies.get('booth_context');
    const record = await actor.state.storage.get('context');
    env.BOOTH_COORDINATOR.get = () => ({ fetch: async () => Response.json({ error: 'Reset unavailable' }, { status: 503 }) });
    const response = await request('/auth/booth/reset', {});
    expect(response.status).toBe(503);
    expect(response.headers.get('Set-Cookie')).not.toContain('Max-Age=0');
    expect(cookies.get('booth_context')).toBe(context);
    expect(await actor.state.storage.get('context')).toEqual(record);
  });

  it('does not expose the server-only authorization RPC via a forged internal flag', async () => {
    await start();
    const result = await request('/auth/booth/authorize', undefined, 'GET', { 'X-Booth-Internal': 'true' });
    expect(result.status).toBe(404);
    expect(await result.text()).not.toContain('visitor@example.com');
    expect((await request('/auth/booth/revoke', { token: 'forged' })).status).toBe(404);
    const direct = await actor.fetch(new Request('https://portal.example/auth/booth/revoke', {
      method: 'POST',
      headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') },
      body: JSON.stringify({ token: 'forged' }),
    }));
    expect(direct.status).toBe(403);
  });

  it.each(['/auth/staff-login', '/auth/callback?code=test&state=test'])('revokes the old attendee before scoped re-login at %s, even with a missing device marker', async (login) => {
    await start();
    const staleCookies = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    cookies.delete('booth_device');
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    const response = await request(login, login.startsWith('/auth/staff-login')
      ? { username: 'operator', password: 'test-only-password' } : undefined);
    expect([200, 302]).toContain(response.status);
    expect(await actor.state.storage.get('context')).toBeUndefined();
    expect((await request(selected, undefined, 'GET', { Cookie: staleCookies })).status).toBe(302);
  });

  it('keeps generic credential re-login scoped and rejects a cross-origin login', async () => {
    await start();
    await request('/auth/logout');
    env.EVENT_STAFF_CREDENTIALS = `operator:${await sha256hex('test-only-password')}`;
    expect((await request('/auth/staff-login', { username: 'operator', password: 'test-only-password' }, undefined, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await request('/auth/staff-login', { username: 'operator', password: 'test-only-password' })).status).toBe(200);
    expect(cookies.has('auth_token')).toBe(true);
    expect(cookies.has('booth_session')).toBe(true);
    expect((await request(other)).status).toBe(302);
  });

  it('denies generic share, magiclink and token redemption even with forged staff authorization headers', async () => {
    await start();
    const token = await createShareLinkToken('operator@adobe.com', env, ['adobe.com']);
    const share = await request('/auth/sharelink', { email: 'other@customer.example', path: other }, undefined, { Authorization: 'Bearer test-only-token', 'X-Booth-Internal': 'true' });
    expect(share.status).toBe(403);
    expect((await request('/auth/magiclink', { email: 'visitor@example.com' })).status).toBe(302);
    expect((await request(`${selected}?token=${token}`)).status).toBe(302);
    expect((await request(`/scripts/booth.js?token=${token}`)).status).toBe(302);
    expect(cookies.has('auth_token')).toBe(true);
  });

  it('legacy markers do not block portal access and migrate to scoped credentials only on /booth', async () => {
    cookies.set('booth_device', 'legacy-or-expired');
    cookies.set('booth_kiosk', '1');
    expect((await request('/adobe/dashboard')).status).toBe(302);
    expect((await request(other)).status).toBe(302);
    expect((await request('/adobe/dashboard', undefined, 'GET', {}, false)).status).toBe(200);
    expect((await request('/booth')).status).toBe(200);
    expect(cookies.has('auth_token')).toBe(true);
    expect(cookies.has('booth_kiosk')).toBe(false);
    expect(cookies.has('booth_session')).toBe(true);
  });

  it('leaves ordinary staff, customer and unmarked public request browsing unchanged', async () => {
    expect((await request('/adobe/dashboard', undefined, 'GET', {}, false)).status).toBe(200);
    expect((await request(other, undefined, 'GET', {}, false)).status).toBe(200);
    cookies.set('auth_token', await createSession(env, { email: 'visitor@example.com', groups: ['example.com'], method: 'sharelink' }));
    expect((await request(selected, undefined, 'GET', {}, false)).status).toBe(200);
    expect(cookies.has('booth_kiosk')).toBe(false);
  });

  it('blocks a stale report when reset or picker transition completes during its origin fetch', async () => {
    for (const action of ['reset', 'picker']) {
      await start();
      const original = fetch.getMockImplementation();
      fetch.mockImplementation(async (input, options) => {
        if (input instanceof Request && new URL(input.url).pathname === selected) await request(`/auth/booth/${action}`, {});
        return original(input, options);
      });
      const response = await request(selected);
      expect(response.status).toBe(302);
      expect(await response.text()).not.toContain('Prepared report');
      fetch.mockImplementation(original);
    }
  });

  it('rechecks fresh CUG+mapping despite absent private origin headers, cache validators and reset races', async () => {
    await start();
    const original = fetch.getMockImplementation();
    fetch.mockImplementation(async (input, options) => {
      if (input instanceof Request && new URL(input.url).pathname === selected) {
        expect(input.headers.has('If-None-Match')).toBe(false);
        expect(input.headers.has('Range')).toBe(false);
        expect(input.headers.has('Cookie')).toBe(false);
        expect(input.headers.has('Authorization')).toBe(false);
        expect(options.cf).toEqual({ cacheTtl: 0, cacheEverything: false });
        data['/closed-user-groups-mapping.json'] = [{ url: selected, group: 'other.example' }];
        return new Response('<html><head></head><body>Secret</body></html>', { headers: { 'Content-Type': 'text/html' } });
      }
      return original(input, options);
    });
    const response = await request(selected, undefined, 'GET', { 'If-None-Match': 'known', Range: 'bytes=0-100' });
    expect([302, 503]).toContain(response.status);
    expect(await response.text()).not.toContain('Secret');
  });

  it('rejects cached 304 and PDF responses even at the selected document URL', async () => {
    await start();
    const original = fetch.getMockImplementation();
    for (const pdf of [false, true]) {
      fetch.mockImplementation(async (input, options) => (input instanceof Request
        && new URL(input.url).pathname === selected
        ? new Response(pdf ? 'PDF bytes' : null, { status: pdf ? 200 : 304, headers: { 'Content-Type': pdf ? 'application/pdf' : 'text/html' } })
        : original(input, options)));
      expect((await request(selected)).status).toBe(403);
    }
  });

  it.each([
    [`/media_${'a'.repeat(40)}.png`, 'application/pdf', null, 403],
    [`${selected}media_${'a'.repeat(40)}.png`, 'application/pdf', null, 403],
    [`${selected}content/opaque.png`, 'application/pdf', null, 403],
    [`/media_${'a'.repeat(40)}.png?format=pdf`, 'application/pdf', null, 403],
    [`/media_${'a'.repeat(40)}.png`, 'image/png', 'inline; filename="report.pdf"', 403],
    [`/media_${'a'.repeat(40)}.png`, 'image/png', 'attachment; filename="report.pdf"', 403],
    [`/media_${'a'.repeat(40)}.png`, 'application/octet-stream', null, 403],
    [`/media_${'a'.repeat(40)}`, 'application/pdf', null, 302],
    [`/content/${'a'.repeat(40)}`, 'application/pdf', null, 302],
  ])('denies opaque PDF/native download candidate %s (%s)', async (path, type, disposition, status) => {
    await start();
    const original = fetch.getMockImplementation();
    fetch.mockImplementation(async (input, options) => (input instanceof Request
      && new URL(input.url).pathname === new URL(path, 'https://portal.example').pathname
      ? new Response('Fixture private PDF bytes', { headers: { 'Content-Type': type, ...(disposition ? { 'Content-Disposition': disposition } : {}) } })
      : original(input, options)));
    for (const method of ['GET', 'HEAD']) {
      const response = await request(path, undefined, method);
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain('Fixture private PDF bytes');
    }
  });

  it('preserves ordinary customer PDF access outside the booth boundary', async () => {
    cookies.set('auth_token', await createSession(env, {
      email: 'visitor@example.com',
      groups: ['example.com'],
      method: 'sharelink',
    }));
    const pdf = `${selected}report.pdf`;
    const original = fetch.getMockImplementation();
    fetch.mockImplementation(async (input, options) => (input instanceof Request
      && new URL(input.url).pathname === pdf
      ? new Response('Fixture private PDF bytes', { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="report.pdf"' } })
      : original(input, options)));
    const response = await request(pdf, undefined, 'GET', {}, false);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(await response.text()).toBe('Fixture private PDF bytes');
  });

  it('never forwards an origin redirect to an unguarded report or PDF viewer', async () => {
    await start();
    const original = fetch.getMockImplementation();
    fetch.mockImplementation(async (input, options) => (input instanceof Request
      && new URL(input.url).pathname === selected
      ? Response.redirect('https://origin.aem.live/accounts/other/report.pdf', 302)
      : original(input, options)));
    const response = await request(selected);
    expect(response.status).toBe(403);
    expect(response.headers.has('Location')).toBe(false);
  });

  it('rejects raw JSON disguised as a selected document and narrower private display dependencies', async () => {
    await start();
    const original = fetch.getMockImplementation();
    fetch.mockImplementation(async (input, options) => (input instanceof Request
      && new URL(input.url).pathname === selected
      ? new Response('{"private":"fixture"}', { headers: { 'Content-Type': 'application/json' } })
      : original(input, options)));
    expect((await request(selected)).status).toBe(403);
    data['/closed-user-groups.json'].push({ url: `${selected}image.png`, 'cug-groups': 'other.example' });
    expect((await request(`${selected}image.png`)).status).toBe(302);
  });

  it('allows only selected rendering assets, known public assets and approved demo/request contexts', async () => {
    await start();
    const original = fetch.getMockImplementation();
    fetch.mockImplementation(async (input, options) => (input instanceof Request && new URL(input.url).pathname.endsWith('image.png')
      ? new Response('image', { headers: { 'Content-Type': 'image/png' } }) : original(input, options)));
    expect((await request(`${selected}image.png`)).status).toBe(200);
    expect((await request(`${other}image.png`)).status).toBe(302);
    expect((await request('/styles/booth.css')).status).toBe(200);
    expect((await request('/scripts/booth-report.js')).status).toBe(200);
    await request('/auth/booth/demo', { id: 'luma' });
    expect((await request(selected)).status).toBe(302);
    expect((await request('/example-report/carvelo/')).status).toBe(302);
    await request('/auth/booth/request', {});
    expect((await request(selected)).status).toBe(302);
  });
});
