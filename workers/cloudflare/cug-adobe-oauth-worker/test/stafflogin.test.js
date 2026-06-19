import {
  describe, it, expect, beforeEach,
} from 'vitest';
import {
  handleStaffLoginRequest, sha256hex, timingSafeEqual, parseCredentials,
} from '../src/stafflogin.js';
import { getSession } from '../src/session.js';
import { createMockEnv } from './helpers.js';

function postLogin(body) {
  return new Request('https://mysite.com/auth/staff-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Extract the auth_token cookie value from a response's Set-Cookie header(s).
function authTokenFrom(resp) {
  const cookies = resp.headers.getSetCookie
    ? resp.headers.getSetCookie()
    : [resp.headers.get('set-cookie')];
  const line = cookies.find((c) => c && c.startsWith('auth_token='));
  return line ? line.split(';')[0].slice('auth_token='.length) : null;
}

describe('stafflogin helpers', () => {
  it('sha256hex matches a known vector', async () => {
    // echo -n "secret" | shasum -a 256
    expect(await sha256hex('secret')).toBe('2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b');
  });
  it('timingSafeEqual compares correctly', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
  it('parseCredentials parses newline and comma separated pairs', () => {
    const env = { EVENT_STAFF_CREDENTIALS: 'cannes-ipad:HASH1\nbooth2:HASH2, x:HASH3' };
    const map = parseCredentials(env);
    expect(map.get('cannes-ipad')).toBe('hash1');
    expect(map.get('booth2')).toBe('hash2');
    expect(map.get('x')).toBe('hash3');
  });
});

describe('handleStaffLoginRequest', () => {
  let env;
  beforeEach(async () => {
    env = createMockEnv({
      EVENT_STAFF_CREDENTIALS: `cannes-ipad:${await sha256hex('letmein')}`,
      EVENT_CRED_EPOCH: '3',
    });
  });

  it('rejects non-POST', async () => {
    const resp = await handleStaffLoginRequest(new Request('https://mysite.com/auth/staff-login'), env);
    expect(resp.status).toBe(405);
  });

  it('mints a 4-day full-staff session on valid credentials', async () => {
    const resp = await handleStaffLoginRequest(postLogin({ username: 'cannes-ipad', password: 'letmein' }), env);
    expect(resp.status).toBe(200);
    const token = authTokenFrom(resp);
    expect(token).toBeTruthy();
    const session = await getSession(
      new Request('https://mysite.com/x', { headers: { Cookie: `auth_token=${token}` } }),
      env,
    );
    expect(session.email).toBe('cannes-ipad@adobe.com');
    expect(session.groups).toEqual(['adobe.com', 'semrush.com']);
    expect(session.exp - session.iat).toBe(345600);
    expect(session.gen_epoch).toBe('3');
  });

  it('rejects a wrong password', async () => {
    const resp = await handleStaffLoginRequest(postLogin({ username: 'cannes-ipad', password: 'nope' }), env);
    expect(resp.status).toBe(401);
    expect(authTokenFrom(resp)).toBeNull();
  });

  it('rejects an unknown username', async () => {
    const resp = await handleStaffLoginRequest(postLogin({ username: 'ghost', password: 'letmein' }), env);
    expect(resp.status).toBe(401);
  });

  it('rejects invalid JSON', async () => {
    const req = new Request('https://mysite.com/auth/staff-login', { method: 'POST', body: '{' });
    const resp = await handleStaffLoginRequest(req, env);
    expect(resp.status).toBe(400);
  });
});
