import { createHmac } from 'node:crypto';
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import worker from '../src/index.js';
import { createSession, verifyShareLink } from '../src/session.js';
import { sendShareLinkConfirm, sendMagicLinkInternalNotify } from '../src/notification.js';
import { resetCugSheetCache } from '../src/cugsheet.js';
import { createMockEnv } from './helpers.js';

vi.mock('../src/notification.js', () => ({
  sendShareLinkConfirm: vi.fn(),
  sendMagicLinkInternalNotify: vi.fn(),
}));

const SECRET = '0123456789abcdef0123456789abcdef';
const NOW = 1793887200;
const ENDPOINT = '/auth/sharelink/dih';
const PATH = '/accounts/a/acme/insights/index';
const BODY = '{"path":"/accounts/a/acme/insights/index","actor_email":"seller@example.com"}';
// Python reference: hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
// message = '1793887200\nPOST\n/auth/sharelink/dih\n' + BODY
const PYTHON_MAC = '5bc2c0f2aa257b3a85bf3cc0fc5d4055ed4d3cff9e80315e5253e85f3f9962da';

function signature(body, timestamp = String(NOW), method = 'POST', endpoint = ENDPOINT, secret = SECRET) {
  return createHmac('sha256', secret).update(`${timestamp}\n${method}\n${endpoint}\n${body}`).digest('hex');
}

function request(body = BODY, { timestamp = String(NOW), mac, headers = {}, method = 'POST' } = {}) {
  return new Request(`https://mysite.com${ENDPOINT}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-DIH-Timestamp': timestamp,
      'X-DIH-Signature': mac ?? signature(body, timestamp),
      ...headers,
    },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body }),
  });
}

function mockCug({
  entries = [{ url: '/accounts/a/acme/*', group: 'acme.com' }],
  sheet = [],
  liveGroups = [],
  mappingStatus = 200,
} = {}) {
  const fetchMock = vi.fn().mockImplementation((input) => {
    const url = String(input);
    if (url.includes('closed-user-groups-mapping.json')) {
      return new Response(JSON.stringify({ data: entries }), { status: mappingStatus });
    }
    if (url.includes('closed-user-groups.json')) {
      return new Response(JSON.stringify({ total: sheet.length, data: sheet }));
    }
    return new Response(null, {
      headers: {
        'x-aem-cug-required': 'true',
        'x-aem-cug-groups': liveGroups.join(', '),
      },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function claimsFrom(response, env) {
  const { result, link } = await response.json();
  expect(result).toBe('link');
  const url = new URL(link);
  expect(url.origin).toBe('https://mysite.com');
  return verifyShareLink(url.searchParams.get('token'), env);
}

describe('DIH service share links', () => {
  let env;
  let fetchMock;
  let auditLog;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    auditLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resetCugSheetCache();
    env = createMockEnv({ DIH_SHARE_LINK_SECRET: SECRET });
    fetchMock = mockCug();
  });

  afterEach(() => {
    expect(sendShareLinkConfirm).not.toHaveBeenCalled();
    expect(sendMagicLinkInternalNotify).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should accept a fixed Python HMAC vector and mint a genuine 30-day token for a nonstaff actor', async () => {
    const response = await worker.fetch(request(BODY, { mac: PYTHON_MAC }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const data = await response.clone().json();
    expect(Object.keys(data).sort()).toEqual(['link', 'result']);
    expect(new URL(data.link).pathname).toBe(PATH);
    expect(await claimsFrom(response, env)).toEqual({
      purpose: 'sharelink',
      email: 'share-link@acme.com',
      groups: ['acme.com'],
      iat: NOW,
      exp: NOW + 30 * 24 * 60 * 60,
    });
  });

  it.each([undefined, null, 123, '', 'short', ' '.repeat(32), `${SECRET}\n`, `${SECRET}\u0000`, '😀'.repeat(16)])(
    'should fail closed with 503 for invalid configuration %j',
    async (secret) => {
      env.DIH_SHARE_LINK_SECRET = secret;
      const response = await worker.fetch(request(), env);
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response.json()).toEqual({ error: 'DIH share link service is not configured' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'])('should reject %s with 405 and no CORS', async (method) => {
    const response = await worker.fetch(request(BODY, { method, headers: { Origin: 'https://da.live' } }), env);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should not accept genuine staff cookies or IMS credentials instead of service authentication', async () => {
    const token = await createSession(env, { email: 'staff@adobe.com', groups: ['adobe.com'] });
    const req = request();
    req.headers.delete('X-DIH-Timestamp');
    req.headers.delete('X-DIH-Signature');
    req.headers.set('Cookie', `auth_token=${token}`);
    req.headers.set('Authorization', 'Bearer staff-ims-token');
    expect((await worker.fetch(req, env)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', 'abc', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), '0'.repeat(64)])(
    'should reject missing, malformed or invalid MAC %j',
    async (mac) => {
      expect((await worker.fetch(request(BODY, { mac }), env)).status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'NaN', '1.5', '-1', '+1793887200', '1e9', '9007199254740992', String(NOW - 301), String(NOW + 301)])(
    'should reject invalid or stale timestamp %j',
    async (timestamp) => {
      expect((await worker.fetch(request(BODY, { timestamp }), env)).status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([-300, 300])('should accept inclusive clock boundary %i seconds', async (offset) => {
    const response = await worker.fetch(request(BODY, { timestamp: String(NOW + offset) }), env);
    expect(response.status).toBe(200);
  });

  it.each([
    ['body whitespace', `${BODY}\n`, PYTHON_MAC, String(NOW)],
    ['body path', BODY.replace('/acme/', '/other/'), PYTHON_MAC, String(NOW)],
    ['actor', BODY.replace('seller', 'other'), PYTHON_MAC, String(NOW)],
    ['timestamp', BODY, PYTHON_MAC, String(NOW + 1)],
    ['signed method', BODY, signature(BODY, String(NOW), 'GET'), String(NOW)],
    ['signed route', BODY, signature(BODY, String(NOW), 'POST', '/auth/sharelink'), String(NOW)],
    ['JWT secret instead of service secret', BODY, signature(BODY, String(NOW), 'POST', ENDPOINT, 'test-jwt-secret'), String(NOW)],
  ])('should reject %s tampering', async (label, body, mac, timestamp) => {
    expect((await worker.fetch(request(body, { mac, timestamp }), env)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '{', 'null', '[]', '1', 'true', '""', '{}',
    JSON.stringify({ path: PATH }),
    JSON.stringify({ actor_email: 'seller@example.com' }),
    JSON.stringify({ path: 42, actor_email: 'seller@example.com' }),
    JSON.stringify({ path: PATH, actor_email: 42 }),
    JSON.stringify({ path: PATH, actor_email: 'not-an-email' }),
    JSON.stringify({ path: PATH, actor_email: 'a@b' }),
    JSON.stringify({ path: PATH, actor_email: 'seller@example.com', mode: 'copy' }),
    JSON.stringify({ path: PATH, actor_email: 'seller@example.com', mode: 'email' }),
    JSON.stringify({ path: PATH, actor_email: 'seller@example.com', email: 'recipient@acme.com' }),
    JSON.stringify({ path: PATH, actor_email: 'seller@example.com', extra: true }),
  ])('should reject invalid JSON schema %s', async (body) => {
    expect((await worker.fetch(request(body), env)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['https://evil.example/x', '//evil.example/x', '/foo\\bar', '/foo\nbar'])(
    'should reject unsafe page path %j',
    async (path) => {
      const body = JSON.stringify({ path, actor_email: 'seller@example.com' });
      expect((await worker.fetch(request(body), env)).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['text/plain', 'application/json; charset=iso-8859-1', ''])(
    'should reject non-UTF-8-JSON content type %j',
    async (type) => {
      const req = request();
      req.headers.set('Content-Type', type);
      expect((await worker.fetch(req, env)).status).toBe(415);
    },
  );

  it('should sign exact UTF-8 bytes and keep the service response free of CORS headers', async () => {
    const body = JSON.stringify({ path: PATH, actor_email: 'sèller@example.com' }, null, 2);
    const response = await worker.fetch(request(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', Origin: 'https://da.live' } }), env);
    expect(response.status).toBe(200);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('should reject invalid UTF-8 rather than authenticating replacement characters', async () => {
    const req = request(new Uint8Array([0xff]), { mac: 'a'.repeat(64) });
    expect((await worker.fetch(req, env)).status).toBe(400);
  });

  it('should limit streamed bodies to 8192 bytes and accept exactly the limit', async () => {
    const exact = BODY.padEnd(8192, ' ');
    expect((await worker.fetch(request(exact), env)).status).toBe(200);
    expect((await worker.fetch(request(`${exact} `), env)).status).toBe(413);
  });

  it('should prefer sheet groups over header and mapping while excluding staff domains and exact staff emails', async () => {
    mockCug({
      liveGroups: ['header.example'],
      sheet: [{
        url: '/accounts/a/acme**',
        'cug-groups': 'adobe.com, semrush.com, operator@adobe.com, buyer@acme.com, acme.com',
      }],
    });
    const response = await worker.fetch(request(), env);
    expect((await claimsFrom(response, env)).groups).toEqual(['buyer@acme.com', 'acme.com']);
  });

  it('should prefer live header groups when the sheet has no matching row', async () => {
    mockCug({ liveGroups: ['adobe.com', 'buyer@acme.com'] });
    const claims = await claimsFrom(await worker.fetch(request(), env), env);
    expect(claims.groups).toEqual(['buyer@acme.com']);
    expect(claims.email).toBe('buyer@acme.com');
  });

  it('should use only longest-scope mapping groups when sheet and header are unavailable', async () => {
    mockCug({
      entries: [
        { url: '/accounts/*', group: 'too-broad.example' },
        { url: '/accounts/a/acme/*', group: 'acme.com' },
        { url: '/accounts/a/acme/*', group: 'adobe.com' },
      ],
    });
    expect((await claimsFrom(await worker.fetch(request(), env), env)).groups).toEqual(['acme.com']);
  });

  it.each([
    ['mapping outage', { mappingStatus: 503 }, 502],
    ['unmapped path', { entries: [] }, 404],
    ['staff-only page', { liveGroups: ['adobe.com', 'operator@semrush.com'] }, 400],
  ])('should preserve shared CUG errors for %s without caching', async (label, options, status) => {
    mockCug(options);
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('should return a private 500 without leaking malformed mapping errors', async () => {
    mockCug({ entries: [null] });
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'Failed to create share link' });
  });

  it('should preserve token-minting failures with no-store', async () => {
    env.JWT_SECRET = '';
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'Failed to create share link token' });
  });

  it('should mask actors and omit signatures, query tokens, full emails and resulting links from audit logs', async () => {
    const body = JSON.stringify({ path: `${PATH}?token=previous-signed-link`, actor_email: 'seller@example.com' });
    const response = await worker.fetch(request(body), env);
    expect(response.status).toBe(200);
    const { link } = await response.json();
    const logs = JSON.stringify(auditLog.mock.calls);
    expect(logs).toContain('***@example.com');
    expect(logs).toContain(PATH);
    expect(logs).not.toContain('seller@example.com');
    expect(logs).not.toContain('previous-signed-link');
    expect(logs).not.toContain(link);
    expect(logs).not.toContain(SECRET);
    expect(logs).not.toContain(signature(body));
  });
});
