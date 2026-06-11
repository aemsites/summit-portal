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
    it('redirects to login when no session and CUG is required', async () => {
      vi.stubGlobal('fetch', mockOriginFetch('<html>secret</html>', {
        'x-aem-cug-required': 'true',
      }));

      const request = new Request('https://mysite.com/members/page');
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toContain(env.OAUTH_AUTHORIZE_URL);
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

    it('returns 401 with a login link when iat is older than 30 minutes', async () => {
      const oldIat = Math.floor(Date.now() / 1000) - 30 * 60 - 60;
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: oldIat }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      expect(resp.status).toBe(401);
      const body = await resp.text();
      expect(body).toContain('href="https://mysite.com/customers/test/"');
    });

    it('returns 401 when the token signature is invalid', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: now }, 'wrong-secret');

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      expect(resp.status).toBe(401);
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

    it('returns 401 when the token has no email claim', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ iat: now }, env.JWT_SECRET);

      const resp = await worker.fetch(
        new Request(`https://mysite.com/customers/test/?token=${token}`),
        env,
      );

      expect(resp.status).toBe(401);
    });
  });
});
