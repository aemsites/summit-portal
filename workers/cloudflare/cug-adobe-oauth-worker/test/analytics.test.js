import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleAnalyticsPost, handleAnalyticsGet, pathToKey } from '../src/analytics.js';
import { createMockEnv, createMockKV } from './helpers.js';
import { createSession } from '../src/session.js';

async function authedRequest(env, url, options = {}, {
  email = 'customer@apple.com',
  groups = ['apple.com'],
  method = 'sharelink',
} = {}) {
  const token = await createSession(env, { email, name: 'Test User', groups, method });
  return new Request(url, {
    ...options,
    headers: { ...(options.headers || {}), Cookie: `auth_token=${token}` },
  });
}

async function staffRequest(env, url, options = {}) {
  return authedRequest(env, url, options, { email: 'staff@adobe.com', groups: ['adobe.com'], method: 'oauth' });
}

function postBody(event, path, extra = {}) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, path, ...extra }),
  };
}

// Record an event through the public POST handler.
async function record(env, event, path, extra = {}, who = undefined) {
  const req = await authedRequest(env, 'https://site.com/auth/analytics', postBody(event, path, extra), who);
  return handleAnalyticsPost(req, env);
}

// Read the global summary (staff) as parsed JSON.
async function readGlobal(env) {
  const req = await staffRequest(env, 'https://site.com/auth/analytics', { method: 'GET' });
  return (await handleAnalyticsGet(req, env)).json();
}

// Read a single path's summary + events (staff) as parsed JSON.
async function readPath(env, path) {
  const req = await staffRequest(env, `https://site.com/auth/analytics?path=${encodeURIComponent(path)}`, { method: 'GET' });
  return (await handleAnalyticsGet(req, env)).json();
}

const APPLE = '/accounts/a/apple/';

describe('pathToKey', () => {
  it('produces a deterministic URL-safe base64 key', () => {
    const key = pathToKey(APPLE);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(key).toBe(pathToKey(APPLE));
  });

  it('produces distinct keys for distinct paths', () => {
    expect(pathToKey(APPLE)).not.toBe(pathToKey('/accounts/n/nike/'));
  });
});

describe('POST /auth/analytics', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv({ ANALYTICS_KV: createMockKV() });
  });

  it('returns 405 for non-POST requests', async () => {
    const req = await authedRequest(env, 'https://site.com/auth/analytics', { method: 'DELETE' });
    expect((await handleAnalyticsPost(req, env)).status).toBe(405);
  });

  it('returns 401 when there is no session cookie', async () => {
    const req = new Request('https://site.com/auth/analytics', postBody('page_view', APPLE));
    expect((await handleAnalyticsPost(req, env)).status).toBe(401);
  });

  it('records page_view / scroll_depth / cta_click / time_on_page', async () => {
    expect((await record(env, 'page_view', APPLE)).status).toBe(200);
    expect((await record(env, 'scroll_depth', APPLE, { depth: 75 })).status).toBe(200);
    expect((await record(env, 'cta_click', APPLE, { href: 'mailto:x@apple.com' })).status).toBe(200);
    expect((await record(env, 'time_on_page', APPLE, { duration_seconds: 95 })).status).toBe(200);
  });

  it('returns { ok: true, stored: true } on success', async () => {
    const resp = await record(env, 'page_view', APPLE);
    expect(await resp.json()).toMatchObject({ ok: true, stored: true });
  });

  it('returns 400 for an unknown event type', async () => {
    expect((await record(env, 'hover', APPLE)).status).toBe(400);
  });

  it('returns 400 when event is missing', async () => {
    const req = await authedRequest(env, 'https://site.com/auth/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: APPLE }),
    });
    expect((await handleAnalyticsPost(req, env)).status).toBe(400);
  });

  it('returns 400 when path is missing', async () => {
    const req = await authedRequest(env, 'https://site.com/auth/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'page_view' }),
    });
    expect((await handleAnalyticsPost(req, env)).status).toBe(400);
  });

  it('returns 400 for an absolute URL path (injection guard)', async () => {
    expect((await record(env, 'page_view', 'https://evil.com/phish')).status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    const req = await authedRequest(env, 'https://site.com/auth/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect((await handleAnalyticsPost(req, env)).status).toBe(400);
  });

  it('returns ok:true stored:false when ANALYTICS_KV is unbound', async () => {
    const envNoKV = createMockEnv();
    const resp = await record(envNoKV, 'page_view', APPLE);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({ ok: true, stored: false });
  });
});

describe('viewer identity privacy', () => {
  let env;
  beforeEach(() => { env = createMockEnv({ ANALYTICS_KV: createMockKV() }); });

  it('withholds viewer_email for sharelink sessions (domain kept)', async () => {
    await record(env, 'page_view', APPLE, {}, { email: 'tim@apple.com', method: 'sharelink' });
    const { data } = await readPath(env, APPLE);
    expect(data[0].viewer_email).toBeNull();
    expect(data[0].viewer_domain).toBe('apple.com');
    expect(data[0].auth_method).toBe('sharelink');
  });

  it('withholds viewer_email for magiclink sessions', async () => {
    await record(env, 'page_view', APPLE, {}, { email: 'tim@apple.com', method: 'magiclink' });
    const { data } = await readPath(env, APPLE);
    expect(data[0].viewer_email).toBeNull();
  });

  it('includes viewer_email for oauth (verified) sessions', async () => {
    await record(env, 'page_view', APPLE, {}, { email: 'tim@apple.com', groups: ['apple.com'], method: 'oauth' });
    const { data } = await readPath(env, APPLE);
    expect(data[0].viewer_email).toBe('tim@apple.com');
  });

  it('includes viewer_email for staff sessions (verified by domain)', async () => {
    await record(env, 'page_view', APPLE, {}, { email: 'jo@adobe.com', groups: ['adobe.com'], method: 'staff' });
    const { data } = await readPath(env, APPLE);
    expect(data[0].viewer_email).toBe('jo@adobe.com');
  });
});

describe('input validation / clamping', () => {
  let env;
  beforeEach(() => { env = createMockEnv({ ANALYTICS_KV: createMockKV() }); });

  it('clamps scroll depth above 100 down to 100', async () => {
    await record(env, 'scroll_depth', APPLE, { depth: 9999 });
    const { data } = await readPath(env, APPLE);
    expect(data[0].depth).toBe(100);
  });

  it('clamps negative scroll depth up to 0', async () => {
    await record(env, 'scroll_depth', APPLE, { depth: -50 });
    const { data } = await readPath(env, APPLE);
    expect(data[0].depth).toBe(0);
  });

  it('clamps an absurd time_on_page duration', async () => {
    await record(env, 'time_on_page', APPLE, { duration_seconds: 999999999 });
    const { data } = await readPath(env, APPLE);
    expect(data[0].duration_seconds).toBe(86400);
  });

  it('does not trust a client-supplied viewer_email in the body', async () => {
    await record(env, 'page_view', APPLE, { viewer_email: 'spoof@evil.com' }, { email: 'tim@apple.com', method: 'sharelink' });
    const { data } = await readPath(env, APPLE);
    // sharelink → withheld; the spoofed body field must be ignored, not stored
    expect(data[0].viewer_email).toBeNull();
  });
});

describe('aggregation', () => {
  let env;
  beforeEach(() => { env = createMockEnv({ ANALYTICS_KV: createMockKV() }); });

  it('counts page views and cta clicks', async () => {
    await record(env, 'page_view', APPLE);
    await record(env, 'page_view', APPLE);
    await record(env, 'cta_click', APPLE, { href: 'mailto:x@apple.com' });
    const { summary } = await readPath(env, APPLE);
    expect(summary.total_views).toBe(2);
    expect(summary.cta_clicks).toBe(1);
  });

  it('averages the FURTHEST depth per view, not every milestone', async () => {
    // One view reaches 25→50→75 (cumulative milestones); max for that view is 75.
    for (const depth of [25, 50, 75]) {
      await record(env, 'scroll_depth', APPLE, { depth, view_id: 'view-1' });
    }
    // A second view reaches 100.
    await record(env, 'scroll_depth', APPLE, { depth: 100, view_id: 'view-2' });
    const { summary } = await readPath(env, APPLE);
    // avg of per-view maxes (75, 100) = 87.5 → 88, NOT the naive mean of milestones.
    expect(summary.avg_scroll_depth).toBe(88);
  });

  it('averages time on page', async () => {
    await record(env, 'time_on_page', APPLE, { duration_seconds: 100 });
    await record(env, 'time_on_page', APPLE, { duration_seconds: 200 });
    const { summary } = await readPath(env, APPLE);
    expect(summary.avg_time_seconds).toBe(150);
  });

  it('counts unique visitor domains, not sessions', async () => {
    await record(env, 'page_view', APPLE, {}, { email: 'a@apple.com', method: 'sharelink' });
    await record(env, 'page_view', APPLE, {}, { email: 'b@apple.com', method: 'sharelink' });
    await record(env, 'page_view', APPLE, {}, { email: 'c@beats.com', groups: ['beats.com'], method: 'sharelink' });
    const { summary } = await readPath(env, APPLE);
    expect(summary.unique_visitors).toBe(2); // apple.com + beats.com
  });
});

describe('GET /auth/analytics', () => {
  let env;
  beforeEach(() => { env = createMockEnv({ ANALYTICS_KV: createMockKV() }); });

  it('returns 405 for non-GET requests', async () => {
    const req = await staffRequest(env, 'https://site.com/auth/analytics', { method: 'DELETE' });
    expect((await handleAnalyticsGet(req, env)).status).toBe(405);
  });

  it('returns 403 when the session is not staff', async () => {
    const req = await authedRequest(env, 'https://site.com/auth/analytics', { method: 'GET' });
    expect((await handleAnalyticsGet(req, env)).status).toBe(403);
  });

  it('returns 403 when unauthenticated', async () => {
    const req = new Request('https://site.com/auth/analytics', { method: 'GET' });
    expect((await handleAnalyticsGet(req, env)).status).toBe(403);
  });

  it('returns empty data when nothing recorded', async () => {
    const body = await readGlobal(env);
    expect(body).toMatchObject({ total: 0, data: [] });
  });

  it('returns DA-sheet-shaped rows plus de-duplicated totals', async () => {
    await record(env, 'page_view', APPLE, {}, { email: 'a@apple.com', method: 'sharelink' });
    await record(env, 'page_view', '/accounts/n/nike/', {}, { email: 'z@apple.com', method: 'sharelink' });
    const body = await readGlobal(env);
    expect(body.total).toBe(2);
    expect(body.data[0]).toHaveProperty('path');
    expect(body.data[0]).toHaveProperty('total_views');
    // apple.com viewed BOTH pages → global unique domains must be 1, not summed to 2.
    expect(body.totals.unique_visitors).toBe(1);
    expect(body.totals.total_views).toBe(2);
  });

  it('does not leak the internal _domains set in rows', async () => {
    await record(env, 'page_view', APPLE);
    const body = await readGlobal(env);
    expect(body.data[0]).not.toHaveProperty('_domains');
  });

  it('returns per-page events newest-first with ?path=', async () => {
    // Distinct timestamps: event keys embed the ms timestamp, so ordering is at
    // ms granularity — give the two events different times rather than relying
    // on sub-ms tie-breaking (the key's random suffix is for uniqueness only).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T10:00:00Z'));
    await record(env, 'scroll_depth', APPLE, { depth: 25 });
    vi.setSystemTime(new Date('2026-07-01T10:00:01Z'));
    await record(env, 'scroll_depth', APPLE, { depth: 50 });
    vi.useRealTimers();

    const { data, total } = await readPath(env, APPLE);
    expect(total).toBe(2);
    expect(data[0].depth).toBe(50); // most recent first
    expect(data[1].depth).toBe(25);
  });

  it('sorts the global table by last_viewed descending', async () => {
    // Force distinct timestamps so the ordering assertion is about recency,
    // not sub-millisecond tie-breaking.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T10:00:00Z'));
    await record(env, 'page_view', '/accounts/n/nike/');
    vi.setSystemTime(new Date('2026-07-01T11:00:00Z'));
    await record(env, 'page_view', APPLE);
    vi.useRealTimers();

    const body = await readGlobal(env);
    expect(body.data[0].path).toBe(APPLE); // most recently active first
    expect(body.data[1].path).toBe('/accounts/n/nike/');
  });

  it('semrush staff can read analytics', async () => {
    const req = await authedRequest(env, 'https://site.com/auth/analytics', { method: 'GET' }, { email: 'rachel@semrush.com', groups: ['semrush.com'], method: 'oauth' });
    expect((await handleAnalyticsGet(req, env)).status).toBe(200);
  });

  it('honours a custom STAFF_DOMAINS override', async () => {
    const customEnv = createMockEnv({ ANALYTICS_KV: createMockKV(), STAFF_DOMAINS: 'acme.com' });
    const req = await authedRequest(customEnv, 'https://site.com/auth/analytics', { method: 'GET' }, { email: 'x@adobe.com', groups: ['adobe.com'], method: 'oauth' });
    expect((await handleAnalyticsGet(req, customEnv)).status).toBe(403);
  });

  it('sets Cache-Control: private, no-store', async () => {
    const req = await staffRequest(env, 'https://site.com/auth/analytics', { method: 'GET' });
    const resp = await handleAnalyticsGet(req, env);
    expect(resp.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
