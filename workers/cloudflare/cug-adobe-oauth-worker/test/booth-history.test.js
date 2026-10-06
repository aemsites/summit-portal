import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import worker from '../src/index.js';
import { BoothCoordinator } from '../src/booth.js';
import { createSession, createBoothDeviceToken, getSession } from '../src/session.js';
import { sha256hex } from '../src/stafflogin.js';
import { resetCugSheetCache } from '../src/cugsheet.js';
import { createMockEnv, createMockBoothD1, createMockBoothStorage } from './helpers.js';

const selected = '/accounts/e/example/insights/example-com/portal-landing/';
const other = '/accounts/o/other/insights/other-com/portal-landing/';

describe('booth fresh-document history boundary', () => {
  let env;
  let cookies;
  let actor;

  async function request(path, body, method, headers = {}) {
    const payload = path === '/auth/booth/lookup' ? { noticeVersion: 'booth-privacy-v1', ...body } : body;
    const response = await worker.fetch(new Request(`https://portal.example${path}`, {
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

  beforeEach(async () => {
    vi.restoreAllMocks();
    resetCugSheetCache();
    env = createMockEnv({ REPORT_REQUESTS: createMockBoothD1() });
    cookies = new Map([['auth_token', await createSession(env, { email: 'operator@adobe.com', groups: ['adobe.com'], method: 'oauth' })]]);
    actor = new BoothCoordinator({
      storage: createMockBoothStorage(),
      waitUntil: vi.fn(),
    }, env);
    env.BOOTH_COORDINATOR = { idFromName: (id) => id, get: () => actor };
    class Rewriter {
      on() { return this; }

      transform(response) { return response; }
    }
    vi.stubGlobal('HTMLRewriter', Rewriter);
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      if (pathname === '/data/insights-list.json') {
        return new Response(JSON.stringify({ data: [{ Folder: selected }] }));
      }
      if (pathname === '/closed-user-groups-mapping.json') {
        return new Response(JSON.stringify({ data: [{ url: '/accounts/e/example**', group: 'example.com' }] }));
      }
      if (pathname === '/closed-user-groups.json') {
        return new Response(JSON.stringify({ data: [{ url: '/accounts**', 'cug-groups': 'adobe.com,example.com' }] }));
      }
      return new Response('<html><body>Prepared report</body></html>', { headers: { 'Content-Type': 'text/html', 'x-aem-cug-required': 'true', 'x-aem-cug-groups': 'adobe.com' } });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens a company report from the staff dashboard after the browser has used the booth', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    const token = cookies.get('auth_token');
    const dashboard = await request('/adobe/dashboard?tab=febraban-tech');
    expect(dashboard.status).toBe(200);
    expect(dashboard.headers.get('Cache-Control')).toBe('private, no-store');
    expect(cookies.get('auth_token')).toBe(token);
    expect(cookies.has('booth_device')).toBe(false);
    expect(cookies.has('booth_context')).toBe(false);
    expect(await actor.state.storage.get('context')).toBeUndefined();
    expect([...env.SESSIONS.store.keys()].filter((key) => key.startsWith('booth:'))).toEqual([]);
    const report = await request(other);
    expect(report.headers.get('Location')).not.toBe('/booth');
    expect(report.status).toBe(200);
    expect(report.headers.get('Location')).toBeNull();
    expect(await report.text()).toContain('Prepared report');
    await request('/booth');
    expect((await request(other)).headers.get('Location')).toBe('/booth');
  });

  it.each(['/adobe/dashboard/', '/adobe/dashboard.html'])('also restores staff browsing from %s', async (path) => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    expect((await request(path)).status).toBe(200);
    expect((await request(other)).status).toBe(200);
  });

  it.each(['entry', 'reset', 'expired'])('leaves %s booth state when staff return to the dashboard', async (state) => {
    await request('/booth');
    if (state !== 'entry') await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    if (state === 'reset') await request('/auth/booth/reset', {});
    if (state === 'expired') {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 601000);
    }
    expect((await request('/adobe/dashboard')).status).toBe(200);
    expect(cookies.has('booth_device')).toBe(false);
    expect((await request(other)).status).toBe(200);
  });

  it('does not require the coordinator for ordinary staff dashboard browsing without an attendee cookie', async () => {
    env.BOOTH_COORDINATOR = null;
    expect((await request('/adobe/dashboard')).status).toBe(200);
  });

  it('does not end kiosk mode on HEAD, background requests, prefetch or other staff pages', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    await request('/adobe/dashboard', undefined, 'HEAD');
    await request('/adobe/dashboard', undefined, 'GET', { 'Sec-Fetch-Dest': 'empty' });
    await request('/adobe/dashboard', undefined, 'GET', { Purpose: 'prefetch' });
    await request('/adobe/dashboard', undefined, 'GET', { 'Sec-Purpose': 'prefetch' });
    await request('/adobe/data/');
    expect(cookies.has('booth_device')).toBe(true);
    expect((await request(other)).headers.get('Location')).toBe('/booth');
  });

  it('keeps kiosk protection when dashboard access is denied', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    const origin = fetch.getMockImplementation();
    resetCugSheetCache();
    fetch.mockImplementation(async (input) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      if (pathname === '/adobe/dashboard') {
        return new Response('<html><body>Staff dashboard</body></html>', {
          headers: {
            'Content-Type': 'text/html',
            'x-aem-cug-required': 'true',
            'x-aem-cug-groups': 'different.example',
          },
        });
      }
      return origin(input);
    });
    expect((await request('/adobe/dashboard')).headers.get('Location')).toBe('https://portal.example/403');
    expect(cookies.has('booth_device')).toBe(true);
    expect(cookies.has('booth_context')).toBe(true);
  });

  it('does not clear booth protection for an unauthenticated dashboard request', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    cookies.delete('auth_token');
    expect((await request('/adobe/dashboard')).headers.get('Location')).toContain('/login');
    expect(cookies.has('booth_device')).toBe(true);
    expect(cookies.has('booth_context')).toBe(true);
  });

  it('ends booth mode on a verified cached dashboard navigation and iframe navigation', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    const origin = fetch.getMockImplementation();
    fetch.mockImplementation(async (input) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      if (pathname === '/adobe/dashboard') {
        return new Response(null, {
          status: 304,
          headers: { 'x-aem-cug-required': 'true', 'x-aem-cug-groups': 'adobe.com' },
        });
      }
      return origin(input);
    });
    expect((await request('/adobe/dashboard')).status).toBe(304);
    expect(cookies.has('booth_device')).toBe(false);
    fetch.mockImplementation(origin);
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    expect((await request('/adobe/dashboard', undefined, 'GET', { 'Sec-Fetch-Dest': 'iframe' })).status).toBe(200);
    expect(cookies.has('booth_device')).toBe(false);
  });

  it('does not clear attendee state for a link-borne identity, even with dashboard CUG access', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    cookies.set('auth_token', await createSession(env, { email: 'operator@adobe.com', groups: ['adobe.com'], method: 'sharelink' }));
    await request('/adobe/dashboard');
    expect(cookies.has('booth_device')).toBe(true);
    expect(cookies.has('booth_context')).toBe(true);
    expect(await actor.state.storage.get('context')).toBeDefined();
  });

  it('clears stale browser cookies after verified reauthentication without revoking another session context', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    const previous = await actor.state.storage.get('context');
    cookies.set('auth_token', await createSession(env, { email: 'different@adobe.com', groups: ['adobe.com'], method: 'oauth' }));
    expect((await request('/adobe/dashboard')).status).toBe(200);
    expect(cookies.has('booth_device')).toBe(false);
    expect(cookies.has('booth_context')).toBe(false);
    expect(await actor.state.storage.get('context')).toEqual(previous);
    expect((await request(other)).status).toBe(200);
  });

  it('fails explicitly without dropping kiosk protection if its attendee context cannot be cleared', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    actor.fetch = async () => { throw new Error('Synthetic unavailable coordinator'); };
    const dashboard = await request('/adobe/dashboard');
    expect(dashboard.status).toBe(503);
    expect(await dashboard.text()).toContain('Booth mode could not be cleared');
    expect(cookies.has('booth_device')).toBe(true);
    expect(cookies.has('booth_context')).toBe(true);
  });

  it('isolates the report redirect to the device marker rather than the dashboard link or attendee cookie', async () => {
    expect((await request(other)).status).toBe(200);
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    expect((await request(other)).headers.get('Location')).toBe('/booth');
    const context = cookies.get('booth_context');
    cookies.delete('booth_context');
    expect((await request(other)).headers.get('Location')).toBe('/booth');
    cookies.set('booth_context', context);
    cookies.delete('booth_device');
    expect((await request(other)).status).toBe(200);
  });

  it('blocks a fresh report reload after reset while retaining staff auth and ordinary browsing without a marker', async () => {
    await request('/booth');
    expect((await request('/auth/booth/lookup', { email: 'visitor@example.com' })).status).toBe(200);
    expect((await request(selected)).status).toBe(200);
    expect((await request('/auth/booth/reset', {})).status).toBe(200);
    expect(cookies.has('auth_token')).toBe(true);
    expect(cookies.has('booth_context')).toBe(false);
    fetch.mockClear();
    const freshBack = await request(selected);
    expect(freshBack.status).toBe(302);
    expect(freshBack.headers.get('Location')).toContain('/booth');
    expect(fetch).not.toHaveBeenCalled();
    cookies.delete('booth_device');
    expect((await request(selected)).status).toBe(200);
  });

  it('blocks another account, expired attendee context and a different staff session on a marked device', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    expect((await request(other)).headers.get('Location')).toContain('/booth');
    expect((await request(other, undefined, 'HEAD')).headers.get('Location')).toContain('/booth');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 601000);
    expect((await request(selected)).headers.get('Location')).toContain('/booth');
    cookies.set('auth_token', await createSession(env, { email: 'different@adobe.com', groups: ['adobe.com'], method: 'oauth' }));
    expect((await request(selected)).headers.get('Location')).toContain('/booth');
  });

  it('fails closed on coordinator failure and provides an explicit sign-out exit', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    const original = actor.fetch.bind(actor);
    actor.fetch = async () => { throw new Error('Synthetic unavailable coordinator'); };
    const failure = await request(selected);
    expect([302, 503]).toContain(failure.status);
    actor.fetch = original;
    expect((await request('/auth/booth/exit', {})).status).toBe(200);
    expect(cookies.has('auth_token')).toBe(false);
    expect(cookies.has('booth_context')).toBe(false);
    expect(cookies.has('booth_device')).toBe(false);
    expect((await request(selected)).headers.get('Location')).toContain('/login');
  });

  it('rejects forged and expired markers, preserves canonicalization and leaves assets alone', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    expect((await request(selected.slice(0, -1))).status).toBe(308);
    expect((await request(`${selected}image.png`)).status).toBe(200);
    const marker = cookies.get('booth_device');
    const claims = JSON.parse(Buffer.from(marker.split('.')[1], 'base64url').toString());
    const session = await getSession(new Request('https://portal.example/', { headers: { Cookie: `auth_token=${cookies.get('auth_token')}` } }), env);
    expect(claims.exp).toBeLessThanOrEqual(session.exp);
    expect(JSON.stringify(claims)).not.toContain('@');
    cookies.set('booth_device', `${marker}forged`);
    expect((await request(selected)).headers.get('Location')).toContain('/booth');
    cookies.set('booth_device', await createBoothDeviceToken(await sha256hex(cookies.get('auth_token')), Math.floor(Date.now() / 1000) - 1, env));
    expect((await request(selected)).headers.get('Location')).toContain('/booth');
    cookies.set('booth_device', '');
    expect((await request(selected)).headers.get('Location')).toContain('/booth');
  });

  it('rechecks context after an in-flight origin fetch so concurrent reset cannot return the report body', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    const origin = fetch.getMockImplementation();
    fetch.mockImplementation(async (input) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      if (pathname === selected) await request('/auth/booth/reset', {});
      return origin(input);
    });
    const response = await request(selected);
    expect(response.status).toBe(302);
    expect(await response.text()).not.toContain('Prepared report');
  });

  it('still denies a selected report when its current CUG does not authorize staff', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    const origin = fetch.getMockImplementation();
    fetch.mockImplementation(async (input) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      if (pathname === '/closed-user-groups.json') {
        return new Response(JSON.stringify({ data: [{ url: '/accounts**', 'cug-groups': 'different.example' }] }));
      }
      return origin(input);
    });
    const response = await request(selected);
    expect(response.headers.get('Location')).toBe('https://portal.example/403');
  });

  it('never accepts the signed device marker as an authentication session', async () => {
    await request('/booth');
    const session = await getSession(new Request('https://portal.example/', { headers: { Cookie: `auth_token=${cookies.get('booth_device')}` } }), env);
    expect(session).toBeNull();
  });

  it('does not return the report if reset happens during the final return-helper context check', async () => {
    await request('/booth');
    await request('/auth/booth/lookup', { email: 'visitor@example.com' });
    const original = actor.fetch.bind(actor);
    let checks = 0;
    actor.fetch = async (input) => {
      if (new URL(input.url).pathname.endsWith('/status')) {
        checks += 1;
        if (checks === 3) await request('/auth/booth/reset', {});
      }
      return original(input);
    };
    const response = await request(selected);
    expect(response.status).toBe(302);
    expect(await response.text()).not.toContain('Prepared report');
  });
});
