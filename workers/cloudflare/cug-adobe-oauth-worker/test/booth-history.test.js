import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import worker from '../src/index.js';
import { BoothCoordinator } from '../src/booth.js';
import { createSession, createBoothDeviceToken, getSession } from '../src/session.js';
import { sha256hex } from '../src/stafflogin.js';
import { resetCugSheetCache } from '../src/cugsheet.js';
import { createMockEnv } from './helpers.js';

const selected = '/accounts/e/example/insights/example-com/portal-landing/';
const other = '/accounts/o/other/insights/other-com/portal-landing/';

describe('booth fresh-document history boundary', () => {
  let env;
  let cookies;
  let actor;

  async function request(path, body, method) {
    const response = await worker.fetch(new Request(`https://portal.example${path}`, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: {
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        Origin: 'https://portal.example',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
    env = createMockEnv();
    cookies = new Map([['auth_token', await createSession(env, { email: 'operator@adobe.com', groups: ['adobe.com'], method: 'oauth' })]]);
    const values = new Map();
    actor = new BoothCoordinator({
      storage: {
        get: async (key) => structuredClone(values.get(key)),
        put: async (key, value) => values.set(key, structuredClone(value)),
        deleteAll: async () => values.clear(),
        setAlarm: vi.fn(),
      },
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
