import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { createMockEnv, fakeJwt, signedJwt } from './helpers.js';
import { sendMagicLinkConfirm } from '../src/notification.js';

vi.mock('../src/notification.js', () => ({
  sendMagicLinkConfirm: vi.fn().mockResolvedValue(undefined),
  sendMagicLinkNotFound: vi.fn().mockResolvedValue(undefined),
}));

function mockOriginFetch(body = '<html>ok</html>', headers = {}, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(body, { status, headers: { 'Content-Type': 'text/html', ...headers } }),
  );
}

describe('index (request routing)', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('port stripping', () => {
    it('redirects requests with a port to the same URL without a port', async () => {
      const request = new Request('https://mysite.com:8080/page');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(301);
      expect(resp.headers.get('location')).toBe('https://mysite.com/page');
    });
  });

  describe('drafts', () => {
    it('returns 404 for /drafts/ paths', async () => {
      const request = new Request('https://mysite.com/drafts/secret');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(404);
    });
  });

  describe('account folder trailing-slash redirect', () => {
    it('redirects an extension-less /accounts/** path to the slash form (308)', async () => {
      const request = new Request('https://mysite.com/accounts/s/sky');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(308);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/accounts/s/sky/');
    });

    it('preserves the query string (e.g. ?token=) on the redirect', async () => {
      const request = new Request('https://mysite.com/accounts/s/sky?token=abc');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(308);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/accounts/s/sky/?token=abc');
    });

    it('does not redirect a path that already ends in a slash', async () => {
      vi.stubGlobal('fetch', mockOriginFetch('<html>ok</html>'));
      const request = new Request('https://mysite.com/accounts/s/sky/');
      const resp = await worker.fetch(request, env);

      expect(resp.status).not.toBe(308);
    });

    it('does not redirect a path with a file extension', async () => {
      vi.stubGlobal('fetch', mockOriginFetch('{}'));
      const request = new Request('https://mysite.com/accounts/s/sky/index.json');
      const resp = await worker.fetch(request, env);

      expect(resp.status).not.toBe(308);
    });
  });

  describe('RUM requests', () => {
    it('proxies .rum requests without auth', async () => {
      vi.stubGlobal('fetch', mockOriginFetch('rum-data'));
      const request = new Request('https://mysite.com/.rum/collect');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(200);
    });

    it('rejects non-allowed methods for RUM', async () => {
      const request = new Request('https://mysite.com/.rum/collect', { method: 'DELETE' });
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(405);
    });
  });

  describe('auth callback', () => {
    it('creates a session and redirects to original URL on success', async () => {
      const state = 'cb-state';
      await env.SESSIONS.put(`pkce:${state}`, JSON.stringify({
        verifier: 'v', originalUrl: 'https://mysite.com/members',
      }));

      const idToken = fakeJwt({ email: 'alice@adobe.com', name: 'Alice' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ id_token: idToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ));

      const request = new Request(`https://mysite.com/auth/callback?code=abc&state=${state}`);
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/members');
      expect(resp.headers.get('Set-Cookie')).toContain('auth_token=');
      // Staff-domain login (alice@adobe.com) gets the 4-day event TTL.
      expect(resp.headers.get('Set-Cookie')).toContain('Max-Age=345600');
    });

    it('also sets the non-HttpOnly signed-in marker cookie', async () => {
      const state = 'cb-state-marker';
      await env.SESSIONS.put(`pkce:${state}`, JSON.stringify({
        verifier: 'v', originalUrl: 'https://mysite.com/members',
      }));

      const idToken = fakeJwt({ email: 'alice@adobe.com', name: 'Alice' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ id_token: idToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ));

      const request = new Request(`https://mysite.com/auth/callback?code=abc&state=${state}`);
      const resp = await worker.fetch(request, env);

      const cookies = resp.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith('auth_token='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('signed_in=1'))).toBe(true);
    });
  });

  describe('auth logout', () => {
    it('clears cookie and redirects to IMS logout', async () => {
      const request = new Request('https://mysite.com/auth/logout');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(302);
      const location = resp.headers.get('Location');
      expect(location).toContain('ims.example.com/ims/logout/v1');
      expect(location).toContain('client_id=test-client-id');
      expect(resp.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });

    it('also clears the signed-in marker cookie', async () => {
      const request = new Request('https://mysite.com/auth/logout');
      const resp = await worker.fetch(request, env);

      const cookies = resp.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith('auth_token=') && c.includes('Max-Age=0'))).toBe(true);
      expect(cookies.some((c) => c.startsWith('signed_in=') && c.includes('Max-Age=0'))).toBe(true);
    });
  });

  describe('public page (no CUG)', () => {
    it('proxies to origin and returns content', async () => {
      vi.stubGlobal('fetch', mockOriginFetch('<html>public</html>'));
      const request = new Request('https://mysite.com/about');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(200);
      const body = await resp.text();
      expect(body).toBe('<html>public</html>');
    });
  });

  describe('protected page (CUG)', () => {
    it('redirects to /login with the original path preserved when no session and CUG is required', async () => {
      vi.stubGlobal('fetch', mockOriginFetch('<html>secret</html>', {
        'x-aem-cug-required': 'true',
      }));

      const request = new Request('https://mysite.com/members/page');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(302);
      const location = new URL(resp.headers.get('Location'));
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('redirect')).toBe('/members/page');
    });

    it('serves content when session exists and CUG is satisfied', async () => {
      vi.stubGlobal('fetch', mockOriginFetch('<html>members</html>', {
        'x-aem-cug-required': 'true',
        'x-aem-cug-groups': 'adobe.com',
      }));

      const { createSession } = await import('../src/session.js');
      const token = await createSession(env, {
        email: 'alice@adobe.com', name: 'Alice', groups: ['adobe.com'],
      });

      const request = new Request('https://mysite.com/members/page', {
        headers: { Cookie: `auth_token=${token}` },
      });
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(200);
      const body = await resp.text();
      expect(body).toBe('<html>members</html>');
    });
  });

  describe('portal redirect', () => {
    it('redirects to IMS login when no session', async () => {
      const request = new Request('https://mysite.com/auth/portal');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toContain(env.OAUTH_AUTHORIZE_URL);
    });

    it('preserves the ?redirect= deep link as the post-login destination', async () => {
      const deep = '/accounts/b/bank-of-america/insights/bankofamerica-com/cannes-2026/';
      const request = new Request(
        `https://mysite.com/auth/portal?redirect=${encodeURIComponent(deep)}`,
      );
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(302);
      const loc = new URL(resp.headers.get('Location'));
      const state = loc.searchParams.get('state');
      // The stored originalUrl must be the deep link, NOT /auth/portal — otherwise
      // the OAuth callback lands the user on the group-mapped dashboard.
      const stored = await env.SESSIONS.get(`pkce:${state}`, 'json');
      expect(stored.originalUrl).toBe(`https://mysite.com${deep}`);
    });

    it('ignores an unsafe ?redirect= and falls back to the portal URL', async () => {
      const request = new Request(
        'https://mysite.com/auth/portal?redirect=https%3A%2F%2Fevil.example.com%2Fphish',
      );
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(302);
      const state = new URL(resp.headers.get('Location')).searchParams.get('state');
      const stored = await env.SESSIONS.get(`pkce:${state}`, 'json');
      const unsafe = 'https://mysite.com/auth/portal?redirect=https%3A%2F%2Fevil.example.com%2Fphish';
      expect(stored.originalUrl).toBe(unsafe);
    });

    it('fetches mapping and redirects to matched page when session exists', async () => {
      const mapping = JSON.stringify({
        data: [{ group: 'adobe.com', url: '/members/adobe-portal' }],
      });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        new Response(mapping, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ));

      const { createSession } = await import('../src/session.js');
      const token = await createSession(env, {
        email: 'alice@adobe.com', name: 'Alice', groups: ['adobe.com'],
      });

      const request = new Request('https://mysite.com/auth/portal', {
        headers: { Cookie: `auth_token=${token}` },
      });
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/members/adobe-portal');
    });
  });

  describe('error handling', () => {
    it('returns 500 instead of crashing on unhandled errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('origin down')));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const request = new Request('https://mysite.com/page');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(500);
      expect(await resp.text()).toBe('Internal Server Error');
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  describe('POST /auth/magiclink', () => {
    it('routes to the magic link handler and returns { result: "sent" } for a known domain', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ group: 'adobe.com', url: '/members/adobe' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ));

      const request = new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'alice@adobe.com' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(200);
      expect(await resp.json()).toEqual({ result: 'sent' });
      expect(sendMagicLinkConfirm).toHaveBeenCalledOnce();
      const [calledEmail, calledUrl] = sendMagicLinkConfirm.mock.calls[0];
      expect(calledEmail).toBe('alice@adobe.com');
      expect(calledUrl).toMatch(/^https:\/\/mysite\.com\/members\/adobe\?token=/);
    });

    it('returns 400 for an invalid email', async () => {
      const request = new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'bad' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(400);
    });
  });

  describe('magic link (?token=)', () => {
    it('creates a session and redirects to the clean URL when token is valid', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: now }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/customers/test/');
      expect(resp.headers.get('Set-Cookie')).toContain('auth_token=');
    });

    it('also sets the signed-in marker when minting a session from a token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: now }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      const cookies = resp.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith('auth_token='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('signed_in=1'))).toBe(true);
    });

    it('creates a session for a valid 7-day share link token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({
        purpose: 'sharelink', email: 'tim@apple.com', iat: now, exp: now + 7 * 24 * 60 * 60,
      }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/members/apple/?token=${token}`),
        env,
      );

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/members/apple/');
      expect(resp.headers.get('Set-Cookie')).toContain('auth_token=');
    });

    it('grants the share token groups (plus the recipient domain) to the session', async () => {
      const { getSession } = await import('../src/session.js');
      const now = Math.floor(Date.now() / 1000);
      // Staff recipient: token carries the page's group so they can open it.
      const token = await signedJwt({
        purpose: 'sharelink', email: 'josec@adobe.com', iat: now, exp: now + 7 * 24 * 60 * 60, groups: ['apple.com'],
      }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/members/apple/?token=${token}`),
        env,
      );

      const newToken = resp.headers.get('Set-Cookie').match(/auth_token=([^;]+)/)[1];
      const session = await getSession(
        new Request('https://mysite.com/', { headers: { Cookie: `auth_token=${newToken}` } }),
        env,
      );
      expect(session.groups).toContain('apple.com'); // page group → can open the page
      expect(session.groups).toContain('adobe.com'); // own domain retained
    });

    it('redirects an expired share link to /login preserving the page', async () => {
      const past = Math.floor(Date.now() / 1000) - 10;
      const token = await signedJwt({
        purpose: 'sharelink', email: 'tim@apple.com', iat: past - 100, exp: past,
      }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/members/apple/?token=${token}`),
        env,
      );

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/login?redirect=%2Fmembers%2Fapple%2F');
    });

    it('redirects an expired magic link (iat > 30 min) to /login preserving the page', async () => {
      const oldIat = Math.floor(Date.now() / 1000) - 30 * 60 - 60;
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: oldIat }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/login?redirect=%2Fcustomers%2Ftest%2F');
    });

    it('redirects an invalid-signature token to /login preserving the page', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: now }, 'wrong-secret');

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/login?redirect=%2Fcustomers%2Ftest%2F');
    });

    it('replaces an existing session cookie when a valid token is provided', async () => {
      const { createSession, getSession } = await import('../src/session.js');
      const oldSession = await createSession(env, {
        email: 'old@test.com', name: 'Old', groups: ['test.com'],
      });

      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: now }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`, {
          headers: { Cookie: `auth_token=${oldSession}` },
        }),
        env,
      );

      expect(resp.status).toBe(302);

      const newCookieHeader = resp.headers.get('Set-Cookie');
      const newToken = newCookieHeader.match(/auth_token=([^;]+)/)[1];
      const newSession = await getSession(
        new Request('https://mysite.com/', { headers: { Cookie: `auth_token=${newToken}` } }),
        env,
      );
      expect(newSession.email).toBe('alice@adobe.com');
    });

    it('preserves other query params in the redirect', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: now }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?foo=bar&token=${token}`),
        env,
      );

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/customers/test/?foo=bar');
    });

    it('derives the group from the email domain', async () => {
      const { getSession } = await import('../src/session.js');
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@partner.com', iat: now }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      const newToken = resp.headers.get('Set-Cookie').match(/auth_token=([^;]+)/)[1];
      const session = await getSession(
        new Request('https://mysite.com/', { headers: { Cookie: `auth_token=${newToken}` } }),
        env,
      );
      expect(session.groups).toEqual(['partner.com']);
    });

    it('redirects to /expired when the token has no email claim', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ iat: now }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/login?redirect=%2Fcustomers%2Ftest%2F');
    });

    it('gives a customer magic-link session the short 4h TTL', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'tim@apple.com', iat: now }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      const cookies = resp.headers.getSetCookie();
      const authCookie = cookies.find((c) => c.startsWith('auth_token='));
      expect(authCookie).toContain('Max-Age=14400');
    });
  });

  describe('POST /auth/staff-login', () => {
    it('routes to the staff-login handler and mints a 4-day session', async () => {
      const { sha256hex } = await import('../src/stafflogin.js');
      const staffEnv = createMockEnv({
        EVENT_STAFF_CREDENTIALS: `cannes:${await sha256hex('pw')}`,
        EVENT_CRED_EPOCH: '1',
      });
      const req = new Request('https://mysite.com/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'cannes', password: 'pw' }),
      });
      const resp = await worker.fetch(req, staffEnv);

      expect(resp.status).toBe(200);
      const cookies = resp.headers.getSetCookie();
      const authCookie = cookies.find((c) => c.startsWith('auth_token='));
      expect(authCookie).toBeTruthy();
      expect(authCookie).toContain('Max-Age=345600');
    });

    it('rejects bad credentials with 401', async () => {
      const { sha256hex } = await import('../src/stafflogin.js');
      const staffEnv = createMockEnv({
        EVENT_STAFF_CREDENTIALS: `cannes:${await sha256hex('pw')}`,
        EVENT_CRED_EPOCH: '1',
      });
      const req = new Request('https://mysite.com/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'cannes', password: 'wrong' }),
      });
      const resp = await worker.fetch(req, staffEnv);
      expect(resp.status).toBe(401);
    });
  });
});
