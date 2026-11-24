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
const FIXTURE_SECRET = 'local-fixture-not-a-production-secret';
const REPORT = '/accounts/example/demo/insights/summary';
const CAMPAIGNS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const REPORT_IDS = [
  '2f52c7876af8d2c01fbb33d9cedb0bde47833beda8476259e507429a22a7117e',
  '1ff57c2f896e7db7381d7dca5c40096f06ff1d8f26ba0fca1524667d4dc349e1',
];

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

  describe('campaign attribution', () => {
    function cookiesFrom(response, previous = '') {
      const additions = response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]);
      return [...additions, previous].filter(Boolean).join('; ');
    }

    function campaignRequest(campaign, path = `${REPORT}/`) {
      const body = JSON.stringify({ path, actor_email: 'seller@example.com', public_campaign_id: campaign });
      const timestamp = String(Math.floor(Date.now() / 1000));
      return request(body, { timestamp, mac: signature(body, timestamp, 'POST', ENDPOINT, FIXTURE_SECRET) });
    }

    function campaignOrigin() {
      const events = [];
      env.DIH_SHARE_LINK_SECRET = FIXTURE_SECRET;
      env.BOOTH_ANALYTICS_HOSTNAME = 'act.aem.now';
      const origin = mockCug({ entries: [{ url: '/accounts/example/demo/*', group: 'demo.example' }] });
      const baseFetch = origin.getMockImplementation();
      const gate = { group: 'demo.example', required: true, redirected: false, title: 'Fixture' };
      origin.mockImplementation((input, options) => {
        if (String(input) === 'https://queue.simpleanalyticscdn.com/events') {
          events.push(JSON.parse(options.body));
          return new Response(null, { status: 204 });
        }
        if (input instanceof Request) {
          expect(new URL(input.url).search).toBe('');
          expect(input.headers.get('Cookie') || '').not.toContain('campaign_share_');
          const html = new Response(`<html><head><title>${gate.title}</title></head><body>${gate.title}</body></html>`, {
            headers: {
              'Content-Type': 'text/html',
              'x-aem-cug-required': String(gate.required),
              'x-aem-cug-groups': gate.group,
            },
          });
          Object.defineProperty(html, 'redirected', { value: gate.redirected });
          return html;
        }
        return baseFetch(input, options);
      });
      class Rewriter {
        on(selector, handler) {
          expect(selector).toBe('head');
          this.handler = handler;
          return this;
        }

        async transform(response) {
          let insertion = '';
          this.handler.element({ prepend: (html) => { insertion = html; } });
          return new Response((await response.text()).replace('<head>', `<head>${insertion}`), response);
        }
      }
      vi.stubGlobal('HTMLRewriter', Rewriter);
      return { events, gate };
    }

    async function mint(campaign) {
      const response = await worker.fetch(campaignRequest(campaign), env);
      expect(response.status).toBe(200);
      return response.json();
    }

    async function redeem(link, cookie) {
      return worker.fetch(new Request(link, { headers: cookie ? { Cookie: cookie } : {} }), env);
    }

    async function visit(link, cookie) {
      const response = await redeem(link, cookie);
      return (await response.text()).match(/data-campaign-share="([^"]+)"/)?.[1];
    }

    async function activity(proof, cookie, event = 'report_viewed', extra = {}) {
      const pending = [];
      const result = await worker.fetch(new Request('https://mysite.com/auth/campaign-share', {
        method: 'POST',
        headers: { Cookie: cookie || '', Origin: 'https://mysite.com', 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, event, ...extra }),
      }), env, { waitUntil: (promise) => pending.push(promise) });
      await Promise.all(pending);
      return result;
    }

    it('returns the original token plus expiry for a signed campaign request', async () => {
      campaignOrigin();
      const data = await mint(CAMPAIGNS[0]);
      const url = new URL(data.link);
      expect(Object.keys(data).sort()).toEqual(['expires_at', 'link', 'result']);
      expect(data.result).toBe('link');
      expect(data.expires_at).toBe('2026-12-05T14:00:00.000Z');
      expect(url.pathname).toBe(`${REPORT}/`);
      expect([...url.searchParams.keys()]).toEqual(['token']);
      const token = url.searchParams.get('token');
      expect(await verifyShareLink(token, env)).toMatchObject({
        groups: ['demo.example'],
        exp: 1796479200,
      });
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse(data.expires_at));
      expect(await verifyShareLink(token, env)).not.toBeNull();
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse(data.expires_at) + 1000);
      expect(await verifyShareLink(token, env)).toBeNull();
      const expired = await redeem(data.link);
      expect(new URL(expired.headers.get('Location')).pathname).toBe('/login');
      expect(expired.headers.has('Set-Cookie')).toBe(false);
    });

    it('gives two exports of the same campaign report independent 30-day expiries', async () => {
      campaignOrigin();
      const day = 24 * 60 * 60;
      const setDay = (offset) => vi.spyOn(Date, 'now').mockReturnValue((NOW + offset * day) * 1000);
      async function expectReport(link) {
        const redeemed = await redeem(link);
        expect(redeemed.status).toBe(302);
        const location = redeemed.headers.get('Location');
        expect(new URL(location).pathname).toBe(`${REPORT}/`);
        const report = await redeem(location, cookiesFrom(redeemed));
        expect(report.status).toBe(200);
      }

      async function expectExpired(link) {
        const redeemed = await redeem(link);
        expect(redeemed.status).toBe(302);
        expect(new URL(redeemed.headers.get('Location')).pathname).toBe('/login');
        expect(redeemed.headers.has('Set-Cookie')).toBe(false);
      }

      const first = await mint(CAMPAIGNS[0]);
      setDay(14);
      const second = await mint(CAMPAIGNS[0]);
      expect(first.expires_at).toBe('2026-12-05T14:00:00.000Z');
      expect(second.expires_at).toBe('2026-12-19T14:00:00.000Z');
      expect(first.link).not.toBe(second.link);
      await expectReport(first.link);

      setDay(30);
      await expectReport(first.link);
      setDay(31);
      await expectExpired(first.link);
      await expectReport(second.link);

      setDay(44);
      await expectReport(second.link);
      setDay(45);
      await expectExpired(second.link);
    });

    it('opens refreshed content at the same path without switching to a newer campaign', async () => {
      const { events, gate } = campaignOrigin();
      const first = await mint(CAMPAIGNS[0]);
      gate.title = 'Refreshed report';
      expect(new URL((await mint(CAMPAIGNS[1])).link).pathname).toBe(new URL(first.link).pathname);

      const redeemed = await redeem(first.link);
      const cookie = cookiesFrom(redeemed);
      const report = await redeem(redeemed.headers.get('Location'), cookie);
      expect(report.status).toBe(200);
      const html = await report.text();
      expect(html).toContain('<title>Refreshed report</title>');
      const proof = html.match(/data-campaign-share="([^"]+)"/)?.[1];
      expect(proof).toBeTruthy();
      expect((await activity(proof, cookie)).status).toBe(204);
      expect(events.map(({ metadata }) => metadata)).toEqual([
        { campaign_id: CAMPAIGNS[0], report_id: REPORT_IDS[0] },
      ]);
    });

    it.each([null, '', 42, 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'])(
      'rejects invalid campaign identifiers before CUG calls: %j',
      async (campaign) => {
        env.DIH_SHARE_LINK_SECRET = FIXTURE_SECRET;
        expect((await worker.fetch(campaignRequest(campaign), env)).status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, 'unexpected.example'])(
      'rejects new tagged links without a configured analytics hostname (%j) before any CUG calls',
      async (hostname) => {
        campaignOrigin();
        env.BOOTH_ANALYTICS_HOSTNAME = hostname;
        const response = await worker.fetch(campaignRequest(CAMPAIGNS[0]), env);
        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({
          error: 'Campaign share analytics is not configured',
          code: 'campaign_share_analytics_unconfigured',
        });
        expect(globalThis.fetch).not.toHaveBeenCalled();
      },
    );

    it('does not mint tagged links for stage reports', async () => {
      env.DIH_SHARE_LINK_SECRET = FIXTURE_SECRET;
      env.BOOTH_ANALYTICS_HOSTNAME = 'act.aem.now';
      const path = REPORT.replace('/accounts/', '/accounts-stage/');
      const response = await worker.fetch(campaignRequest(CAMPAIGNS[0], path), env);
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still serves an already-issued tagged link if analytics is disabled later', async () => {
      const { events } = campaignOrigin();
      const { link } = await mint(CAMPAIGNS[0]);
      delete env.BOOTH_ANALYTICS_HOSTNAME;
      const redeemed = await redeem(link);
      expect(redeemed.status).toBe(302);
      const location = redeemed.headers.get('Location');
      expect(location).toBe(`https://mysite.com${REPORT}/`);
      const report = await redeem(location, cookiesFrom(redeemed));
      expect(report.status).toBe(200);
      expect(await report.text()).not.toContain('data-campaign-share');
      expect(events).toEqual([]);
    });

    it('keeps two campaign tabs over the same report distinct across refresh, with no clean-tab attribution', async () => {
      const { events } = campaignOrigin();
      const first = await redeem((await mint(CAMPAIGNS[0])).link);
      const firstLocation = first.headers.get('Location');
      expect(first.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(new URL(firstLocation).searchParams.has('token')).toBe(false);
      expect(first.headers.getSetCookie().find((cookie) => cookie.startsWith('campaign_share_')))
        .toContain(`Path=${REPORT}/; HttpOnly; Secure; SameSite=Lax`);
      const afterFirst = cookiesFrom(first);
      const firstProof = await visit(firstLocation, afterFirst);
      expect(firstProof).toBeTruthy();
      const second = await redeem((await mint(CAMPAIGNS[1])).link, afterFirst);
      const cookie = cookiesFrom(second, afterFirst);
      const secondProof = await visit(second.headers.get('Location'), cookie);
      const refreshedProof = await visit(firstLocation, cookie);
      expect(refreshedProof).toBeTruthy();
      expect(secondProof).toBeTruthy();
      expect(await visit(`https://mysite.com${REPORT}/`, cookie)).toBeUndefined();
      await activity(refreshedProof, cookie);
      await activity(secondProof, cookie, 'report_scroll', { scroll_depth: 50 });
      await activity(firstProof, cookie, 'report_download');
      expect(events).toEqual([
        {
          type: 'event',
          hostname: 'act.aem.now',
          event: 'campaign_share_report_viewed',
          path: '/campaign-share',
          ua: 'ServerSide/1.0 (+https://act.aem.now/)',
          metadata: { campaign_id: CAMPAIGNS[0], report_id: REPORT_IDS[0] },
        },
        {
          type: 'event',
          hostname: 'act.aem.now',
          event: 'campaign_share_report_scroll',
          path: '/campaign-share',
          ua: 'ServerSide/1.0 (+https://act.aem.now/)',
          metadata: { campaign_id: CAMPAIGNS[1], report_id: REPORT_IDS[1], scroll_depth: 50 },
        },
        {
          type: 'event',
          hostname: 'act.aem.now',
          event: 'campaign_share_report_download',
          path: '/campaign-share',
          ua: 'ServerSide/1.0 (+https://act.aem.now/)',
          metadata: { campaign_id: CAMPAIGNS[0], report_id: REPORT_IDS[0] },
        },
      ]);
    });

    it('denies campaign attribution without the original path, current CUG access, or a valid activity proof', async () => {
      const { events, gate } = campaignOrigin();
      const { link } = await mint(CAMPAIGNS[0]);
      const wrongPath = link.replace('/summary/', '/other/');
      const mismatch = await redeem(wrongPath);
      expect(mismatch.status).toBe(302);
      expect(new URL(mismatch.headers.get('Location')).pathname).toBe('/login');
      expect(mismatch.headers.has('Set-Cookie')).toBe(false);
      const redeemed = await redeem(link);
      const location = redeemed.headers.get('Location');
      const cookie = cookiesFrom(redeemed);
      expect(await visit(location, '')).toBeUndefined();
      expect(await visit(location.replace('/summary/', '/other/'), cookie)).toBeUndefined();
      expect(await visit(`${location}tampered`, cookie)).toBeUndefined();
      const proof = await visit(location, cookie);
      expect(proof).toBeTruthy();
      gate.redirected = true;
      expect(await visit(location, cookie)).toBeUndefined();
      gate.redirected = false;
      gate.group = 'different.example';
      expect(await visit(location, cookie)).toBeUndefined();
      gate.required = false;
      expect(await visit(location, cookie)).toBeUndefined();
      expect((await activity(proof, '', 'report_viewed')).status).toBe(403);
      const navigationProof = new URL(location).searchParams.values().next().value;
      expect((await activity(navigationProof, cookie)).status).toBe(403);
      const wrongUser = await createSession(env, { email: 'someone@other.example', groups: ['other.example'] });
      expect((await activity(proof, `auth_token=${wrongUser}`)).status).toBe(403);
      expect((await activity(proof, cookie, 'report_scroll', { scroll_depth: 45 })).status).toBe(400);
      expect((await activity(proof, cookie, 'report_viewed', { email: 'bad@example.com' })).status).toBe(400);
      vi.spyOn(Date, 'now').mockReturnValue((NOW + 3601) * 1000);
      expect(await visit(location, cookie)).toBeUndefined();
      expect((await activity(proof, cookie)).status).toBe(403);
      expect(events).toEqual([]);
    });

    it.each([undefined, 'unexpected.example', 'act.aem.now'])(
      'serves an ordinary share link without campaign context regardless of analytics hostname (%j)',
      async (hostname) => {
        const { events } = campaignOrigin();
        env.BOOTH_ANALYTICS_HOSTNAME = hostname;
        const body = JSON.stringify({ path: `${REPORT}/`, actor_email: 'seller@example.com' });
        const mac = signature(body, String(NOW), 'POST', ENDPOINT, FIXTURE_SECRET);
        const result = await worker.fetch(request(body, { mac }), env);
        const data = await result.json();
        expect(Object.keys(data).sort()).toEqual(['link', 'result']);
        const redeemed = await redeem(data.link);
        const location = redeemed.headers.get('Location');
        expect(location).toBe(`https://mysite.com${REPORT}/`);
        expect(await visit(location, cookiesFrom(redeemed))).toBeUndefined();
        expect(events).toEqual([]);
      },
    );
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
