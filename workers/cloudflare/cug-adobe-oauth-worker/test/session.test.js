import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSession, getSession, sessionCookie, clearSessionCookie, verifyMagicLink, createMagicLinkToken,
  createShareLinkToken, verifyShareLink, signedInMarkerCookie, clearSignedInMarkerCookie,
  EVENT_SESSION_TTL, staffDomains, isStaffEmail, sessionTtlForEmail,
} from '../src/session.js';
import { createMockEnv, signedJwt } from './helpers.js';

function payloadOf(token) {
  return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
}

describe('staff-domain helpers', () => {
  it('treats adobe.com and semrush.com as staff by default', () => {
    const env = createMockEnv();
    expect(isStaffEmail('a@adobe.com', env)).toBe(true);
    expect(isStaffEmail('b@semrush.com', env)).toBe(true);
    expect(isStaffEmail('c@apple.com', env)).toBe(false);
  });

  it('sessionTtlForEmail returns 4 days for staff, default for others', () => {
    const env = createMockEnv();
    expect(sessionTtlForEmail('a@adobe.com', env)).toBe(EVENT_SESSION_TTL);
    expect(sessionTtlForEmail('c@apple.com', env)).toBe(14400);
  });

  it('staffDomains honours STAFF_DOMAINS override', () => {
    const env = createMockEnv({ STAFF_DOMAINS: 'foo.com' });
    expect(staffDomains(env).has('foo.com')).toBe(true);
    expect(isStaffEmail('a@adobe.com', env)).toBe(false);
  });
});

describe('createSession ttl + gen_epoch', () => {
  it('honours an explicit ttl in the JWT exp', async () => {
    const env = createMockEnv();
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'] }, EVENT_SESSION_TTL);
    const payload = payloadOf(token);
    expect(payload.exp - payload.iat).toBe(EVENT_SESSION_TTL);
    expect(payload.gen_epoch).toBeUndefined();
  });

  it('writes gen_epoch when present on userInfo', async () => {
    const env = createMockEnv();
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'], gen_epoch: '1' }, EVENT_SESSION_TTL);
    expect(payloadOf(token).gen_epoch).toBe('1');
  });
});

describe('sessionCookie maxAge', () => {
  it('uses the provided maxAge', () => {
    expect(sessionCookie('tok', EVENT_SESSION_TTL)).toContain(`Max-Age=${EVENT_SESSION_TTL}`);
  });
  it('defaults to the 4h session TTL', () => {
    expect(sessionCookie('tok')).toContain('Max-Age=14400');
  });
});

describe('getSession gen_epoch kill switch', () => {
  function cookieReq(token) {
    return new Request('https://mysite.com/x', { headers: { Cookie: `auth_token=${token}` } });
  }
  it('accepts a token whose gen_epoch matches env', async () => {
    const env = createMockEnv({ EVENT_CRED_EPOCH: '2' });
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'], gen_epoch: '2' }, EVENT_SESSION_TTL);
    const session = await getSession(cookieReq(token), env);
    expect(session?.email).toBe('a@adobe.com');
  });
  it('rejects a token whose gen_epoch no longer matches env', async () => {
    const env = createMockEnv({ EVENT_CRED_EPOCH: '2' });
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'], gen_epoch: '1' }, EVENT_SESSION_TTL);
    const session = await getSession(cookieReq(token), env);
    expect(session).toBeNull();
  });
  it('leaves tokens without gen_epoch untouched', async () => {
    const env = createMockEnv({ EVENT_CRED_EPOCH: '2' });
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'] }, EVENT_SESSION_TTL);
    const session = await getSession(cookieReq(token), env);
    expect(session?.email).toBe('a@adobe.com');
  });
});

describe('session (JWT)', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    it('returns a three-part JWT string', async () => {
      const userInfo = { email: 'alice@adobe.com', name: 'Alice', groups: ['adobe.com'] };
      const token = await createSession(env, userInfo);

      expect(typeof token).toBe('string');
      const parts = token.split('.');
      expect(parts.length).toBe(3);
    });

    it('embeds user info in the payload', async () => {
      const userInfo = { email: 'alice@adobe.com', name: 'Alice', groups: ['adobe.com'] };
      const token = await createSession(env, userInfo);

      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.email).toBe('alice@adobe.com');
      expect(payload.name).toBe('Alice');
      expect(payload.groups).toEqual(['adobe.com']);
      expect(payload.iat).toBeGreaterThan(0);
      expect(payload.exp).toBe(payload.iat + 14400);
    });
  });

  describe('getSession', () => {
    it('returns payload when token is valid', async () => {
      const userInfo = { email: 'bob@test.com', name: 'Bob', groups: ['test.com'] };
      const token = await createSession(env, userInfo);

      const request = new Request('https://mysite.com/', {
        headers: { Cookie: `auth_token=${token}` },
      });
      const session = await getSession(request, env);

      expect(session.email).toBe('bob@test.com');
      expect(session.groups).toEqual(['test.com']);
    });

    it('returns null when no cookie is present', async () => {
      const request = new Request('https://mysite.com/');
      const session = await getSession(request, env);

      expect(session).toBeNull();
    });

    it('returns null when token has invalid signature', async () => {
      const userInfo = { email: 'alice@adobe.com', name: 'Alice', groups: ['adobe.com'] };
      const token = await createSession(env, userInfo);
      const tampered = token.slice(0, -4) + 'XXXX';

      const request = new Request('https://mysite.com/', {
        headers: { Cookie: `auth_token=${tampered}` },
      });
      const session = await getSession(request, env);

      expect(session).toBeNull();
    });

    it('returns null when token is expired', async () => {
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(1000 * 1000)    // createSession: iat = 1000 (exp = 1000 + SESSION_TTL)
        .mockReturnValueOnce(999999 * 1000); // getSession: way past exp

      const userInfo = { email: 'alice@adobe.com', name: 'Alice', groups: ['adobe.com'] };
      const token = await createSession(env, userInfo);

      const request = new Request('https://mysite.com/', {
        headers: { Cookie: `auth_token=${token}` },
      });
      const session = await getSession(request, env);

      expect(session).toBeNull();
    });

    it('returns null when token is signed with a different secret', async () => {
      const userInfo = { email: 'alice@adobe.com', name: 'Alice', groups: ['adobe.com'] };
      const otherEnv = createMockEnv({ JWT_SECRET: 'other-secret' });
      const token = await createSession(otherEnv, userInfo);

      const request = new Request('https://mysite.com/', {
        headers: { Cookie: `auth_token=${token}` },
      });
      const session = await getSession(request, env);

      expect(session).toBeNull();
    });

    it('parses auth_token cookie among multiple cookies', async () => {
      const userInfo = { email: 'carol@adobe.com', name: 'Carol', groups: ['adobe.com'] };
      const token = await createSession(env, userInfo);

      const request = new Request('https://mysite.com/', {
        headers: { Cookie: `other=abc; auth_token=${token}; another=xyz` },
      });
      const session = await getSession(request, env);

      expect(session.email).toBe('carol@adobe.com');
    });
  });

  describe('cookie helpers', () => {
    it('sessionCookie sets HttpOnly, Secure, SameSite=Lax with Max-Age', () => {
      const cookie = sessionCookie('jwt-token-here');
      expect(cookie).toBe('auth_token=jwt-token-here; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400');
    });

    it('clearSessionCookie expires the cookie', () => {
      const cookie = clearSessionCookie();
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('auth_token=;');
    });
  });

  describe('signedInMarkerCookie', () => {
    it('is readable by JS (not HttpOnly) and outlives the session by a day', () => {
      const cookie = signedInMarkerCookie();
      expect(cookie).toContain('signed_in=1');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('HttpOnly');
      expect(cookie).toContain(`Max-Age=${14400 + 86400}`);
    });

    it('clearSignedInMarkerCookie expires the marker', () => {
      const cookie = clearSignedInMarkerCookie();
      expect(cookie).toContain('signed_in=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).not.toContain('HttpOnly');
    });
  });

  describe('verifyMagicLink', () => {
    it('returns payload for a valid fresh token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: now }, env.JWT_SECRET);

      const result = await verifyMagicLink(token, env);

      expect(result.email).toBe('alice@adobe.com');
      expect(result.iat).toBe(now);
    });

    it('returns null when iat is older than 2 days', async () => {
      const oldIat = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60 - 60;
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: oldIat }, env.JWT_SECRET);

      const result = await verifyMagicLink(token, env);

      expect(result).toBeNull();
    });

    it('returns null when email is missing', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', iat: now }, env.JWT_SECRET);

      const result = await verifyMagicLink(token, env);

      expect(result).toBeNull();
    });

    it('returns null when iat is missing', async () => {
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com' }, env.JWT_SECRET);

      const result = await verifyMagicLink(token, env);

      expect(result).toBeNull();
    });

    it('returns null when signature is wrong', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: now }, 'wrong-secret');

      const result = await verifyMagicLink(token, env);

      expect(result).toBeNull();
    });

    it('accepts a token at exactly the 2-day boundary', async () => {
      const fixedNow = 2000000000;
      vi.spyOn(Date, 'now').mockReturnValue(fixedNow * 1000);

      const boundary = fixedNow - 2 * 24 * 60 * 60;
      const token = await signedJwt({ purpose: 'magiclink', email: 'alice@adobe.com', iat: boundary }, env.JWT_SECRET);
      const result = await verifyMagicLink(token, env);

      vi.restoreAllMocks();
      expect(result).not.toBeNull();
    });

    it('rejects a token missing the magiclink purpose claim', async () => {
      // a regular session token should NOT be accepted by verifyMagicLink
      const sessionToken = await createSession(env, { email: 'alice@adobe.com', name: 'Alice', groups: ['adobe.com'] });
      const result = await verifyMagicLink(sessionToken, env);
      expect(result).toBeNull();
    });
  });

  describe('createMagicLinkToken', () => {
    it('returns a three-part JWT string', async () => {
      const token = await createMagicLinkToken('alice@adobe.com', env);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('produces a token that verifyMagicLink accepts (round-trip)', async () => {
      const before = Math.floor(Date.now() / 1000);
      const token = await createMagicLinkToken('alice@adobe.com', env);

      const result = await verifyMagicLink(token, env);

      expect(result).not.toBeNull();
      expect(result.email).toBe('alice@adobe.com');
      expect(result.iat).toBeGreaterThanOrEqual(before);
      expect(result.exp).toBeUndefined();
    });

    it('embeds email and iat in the payload, no exp', async () => {
      const before = Math.floor(Date.now() / 1000);
      const token = await createMagicLinkToken('bob@test.com', env);
      const after = Math.floor(Date.now() / 1000);

      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));

      expect(payload.purpose).toBe('magiclink');
      expect(payload.email).toBe('bob@test.com');
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.iat).toBeLessThanOrEqual(after);
      expect(payload.exp).toBeUndefined();
    });
  });

  describe('createShareLinkToken / verifyShareLink', () => {
    it('embeds purpose=sharelink, email and a 7-day exp', async () => {
      const before = Math.floor(Date.now() / 1000);
      const token = await createShareLinkToken('alice@adobe.com', env);

      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.purpose).toBe('sharelink');
      expect(payload.email).toBe('alice@adobe.com');
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.exp).toBe(payload.iat + 7 * 24 * 60 * 60);
    });

    it('round-trips through verifyShareLink', async () => {
      const token = await createShareLinkToken('alice@adobe.com', env);
      const result = await verifyShareLink(token, env);
      expect(result).not.toBeNull();
      expect(result.email).toBe('alice@adobe.com');
      expect(result.purpose).toBe('sharelink');
    });

    it('rejects an expired share link', async () => {
      const past = Math.floor(Date.now() / 1000) - 10;
      const token = await signedJwt({
        purpose: 'sharelink', email: 'alice@adobe.com', iat: past - 100, exp: past,
      }, env.JWT_SECRET);
      expect(await verifyShareLink(token, env)).toBeNull();
    });

    it('rejects a magic link token (wrong purpose)', async () => {
      const token = await createMagicLinkToken('alice@adobe.com', env);
      expect(await verifyShareLink(token, env)).toBeNull();
    });

    it('verifyMagicLink rejects a share link token (wrong purpose)', async () => {
      const token = await createShareLinkToken('alice@adobe.com', env);
      expect(await verifyMagicLink(token, env)).toBeNull();
    });

    it('rejects a tampered signature', async () => {
      const token = await createShareLinkToken('alice@adobe.com', env);
      const tampered = `${token.slice(0, -3)}xxx`;
      expect(await verifyShareLink(tampered, env)).toBeNull();
    });
  });
});
