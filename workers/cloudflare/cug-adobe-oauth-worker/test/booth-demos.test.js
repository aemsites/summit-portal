import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { BOOTH_DEMOS } from '../src/booth-demos.js';
import { BoothCoordinator, handleBooth } from '../src/booth.js';
import { createBoothActivity } from '../src/booth-activity.js';
import { createSession } from '../src/session.js';
import { createMockEnv, createMockBoothD1, createMockBoothStorage } from './helpers.js';

describe('staff-bound, identity-free booth demos and report requests', () => {
  let env;
  let cookie;
  let storage;

  async function request(action, body, headers = {}) {
    const response = await handleBooth(new Request(`https://portal.example/auth/booth/${action}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, Origin: 'https://portal.example', 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
    const context = response.headers.get('Set-Cookie')?.match(/booth_context=([^;]+)/)?.[1];
    if (context) cookie = `${cookie.split(';')[0]}; booth_context=${context}`;
    return response;
  }

  beforeEach(async () => {
    env = createMockEnv({ REPORT_REQUESTS: createMockBoothD1() });
    cookie = `auth_token=${await createSession(env, { email: 'operator@adobe.com', method: 'oauth' })}`;
    storage = createMockBoothStorage();
    const actor = new BoothCoordinator({ storage, waitUntil: vi.fn() }, env);
    env.BOOTH_COORDINATOR = { idFromName: (id) => id, get: () => actor };
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Demo must not run discovery or delivery'); }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('serves the ten approved industries without discovery or a visitor context', async () => {
    const response = await request('demos');
    expect(await response.json()).toEqual({ demos: BOOTH_DEMOS });
    expect(BOOTH_DEMOS).toHaveLength(10);
    expect(new Set(BOOTH_DEMOS.map((demo) => demo.path)).size).toBe(10);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(await storage.get('context')).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(BOOTH_DEMOS)('selects $id without retaining an email or recording personal report activity', async (demo) => {
    const response = await request('demo', { id: demo.id });
    const result = await response.json();
    expect(result).toMatchObject({ state: 'demo', selectedPath: demo.path, industry: demo.industry, company: demo.company });
    expect(result).not.toHaveProperty('binding');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('candidates');
    expect((await request('status')).status).toBe(200);
    expect((await (await request('status')).json()).state).toBe('demo');
    expect(fetch).not.toHaveBeenCalled();
    expect(env.REPORT_REQUESTS.events.size).toBe(0);
    for (const action of ['send', 'view', 'select']) {
      expect((await request(action, {})).status).toBe(409);
    }
    expect((await request('contact', {})).status).toBe(404);
  });

  it('clears the previous visitor KV before switching to a demo, then opens a fresh public form', async () => {
    await env.SESSIONS.put('booth:previous', JSON.stringify({ email: 'previous@example.com' }));
    await storage.put('context', { key: 'previous', expiresAt: Date.now() + 600000, binding: '' });
    // Establish a legitimate binding using the same staff session.
    await storage.delete('context');
    await request('demo', { id: 'carvelo' });
    const record = await storage.get('context');
    await storage.put('context', { ...record, mode: undefined, key: 'previous' });
    await request('demo', { id: 'luma' });
    expect(await env.SESSIONS.get('booth:previous')).toBeNull();
    const response = await request('request', {});
    const result = await response.json();
    expect(result).toMatchObject({ state: 'request', selectedPath: '/request-report' });
    expect(result).not.toHaveProperty('demoId');
    expect(JSON.stringify(result)).not.toContain('previous');
    expect(env.REPORT_REQUESTS.events.size).toBe(0);
    expect((await request('reset', {})).headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(await storage.get('context')).toBeUndefined();
  });

  it.each([
    { id: 'unknown' }, { id: '../accounts/private' }, { path: '/accounts/private/' },
    { id: 'luma', email: 'visitor@example.com' }, { id: ['luma'] },
  ])('rejects unapproved selections and attendee fields: %j', async (body) => {
    expect((await request('demo', body)).status).toBe(400);
    expect(await storage.get('context')).toBeUndefined();
  });

  it('rejects request prefill, cross-origin changes and anonymous access', async () => {
    expect((await request('request', { email: 'visitor@example.com' })).status).toBe(400);
    expect((await request('demo', { id: 'luma' }, { Origin: 'https://evil.example' })).status).toBe(403);
    for (const action of ['demos', 'demo', 'request']) {
      expect((await request(action, action === 'demos' ? undefined : {}, { Cookie: '' })).status).toBe(401);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['demo', 'request'])('preserves the existing outbox retry when switching to %s', async (mode) => {
    const outbox = [createBoothActivity('search', 'prior-visit', 'visitor@example.test')];
    await storage.put('activity', outbox);
    const alarm = vi.spyOn(storage, 'setAlarm');
    expect((await request(mode, mode === 'demo' ? { id: 'luma' } : {})).ok).toBe(true);
    expect(await storage.get('activity')).toEqual(outbox);
    expect(alarm).toHaveBeenCalledTimes(1);
    const [retryAt] = alarm.mock.lastCall;
    expect(retryAt).toBeGreaterThan(Date.now() + 59000);
    expect(retryAt).toBeLessThanOrEqual(Date.now() + 60000);
    expect((await storage.get('context')).expiresAt).toBeGreaterThan(retryAt);
    expect(env.REPORT_REQUESTS.events.size).toBe(0);
  });

  it('expires demo/request state and prevents a different staff session from reusing it', async () => {
    await request('request', {});
    const original = cookie;
    cookie = `auth_token=${await createSession(env, { email: 'another@adobe.com', method: 'oauth' })}; ${cookie.split(';')[1]}`;
    expect((await request('status')).status).toBe(403);
    cookie = original;
    const record = await storage.get('context');
    await storage.put('context', { ...record, expiresAt: Date.now() - 1 });
    expect(await (await request('status')).json()).toEqual({ state: 'entry' });
    expect(await storage.get('context')).toBeUndefined();
  });
});
