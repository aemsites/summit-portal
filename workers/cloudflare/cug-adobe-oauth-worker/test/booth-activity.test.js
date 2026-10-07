import {
  beforeEach, afterEach, describe, it, expect, vi,
} from 'vitest';
import worker from '../src/index.js';
import { createSession } from '../src/session.js';
import {
  createBoothActivity, storeBoothActivity, handleBoothActivity, purgeBoothActivity,
  countBoothActivity, BOOTH_RETENTION_MS,
} from '../src/booth-activity.js';
import { createMockBoothD1, createMockEnv } from './helpers.js';

const session = { method: 'oauth', email: 'seller@adobe.com' };
const report = { path: '/accounts/e/example/insights/example-com/portal-landing/', company: 'Example', label: 'Example — example.com' };

describe('identified booth activity and anonymous analytics boundary', () => {
  let env;
  beforeEach(() => {
    env = createMockEnv({ REPORT_REQUESTS: createMockBoothD1() });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T09:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function request(query = '', path = '/api/booth-activity') {
    return new Request(`https://portal.example${path}${query}`);
  }

  it('stores stable visit correlation, canonical company/report, notice and exact 90-day expiry', async () => {
    const activity = createBoothActivity('contact_requested', 'visit-one', 'visitor@example.com', report);
    expect(await storeBoothActivity(env, activity)).toBe(true);
    expect(await storeBoothActivity(env, activity)).toBe(false);
    expect(env.REPORT_REQUESTS.events.size).toBe(1);
    const retention = Date.parse(activity.expires_at) - Date.parse(activity.occurred_at);
    expect(retention).toBe(BOOTH_RETENTION_MS);
    const response = await handleBoothActivity(request('?kind=contact_requested'), env, session);
    expect((await response.json()).events).toEqual([activity]);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('restricts PII to Adobe OAuth, excluding booth, partner and link-borne logins', async () => {
    for (const identity of [null, { email: 'seller@adobe.com', method: 'staff' },
      { email: 'seller@adobe.com', method: 'sharelink' },
      { email: 'seller@adobe.com', method: 'magiclink' },
      { email: 'partner@semrush.com', method: 'oauth' }]) {
      const result = await handleBoothActivity(request(), env, identity);
      expect(result.status).toBe(identity ? 403 : 401);
      expect(await result.text()).not.toContain('visitor@');
    }
    const cookie = `auth_token=${await createSession(env, session)}`;
    const authenticated = new Request(request().url, { headers: { Cookie: cookie } });
    const result = await worker.fetch(authenticated, env);
    expect(result.status).toBe(200);
    expect((await result.json()).events).toEqual([]);
    expect((await worker.fetch(request(), env)).status).toBe(401);
  });

  it('paginates ties and exports more than 1000 rows without truncation', async () => {
    for (let i = 0; i < 1105; i += 1) {
      await storeBoothActivity(env, createBoothActivity('search', `visit-${i.toString().padStart(4, '0')}`, `visitor${i}@example.com`));
    }
    const first = await (await handleBoothActivity(request('?kind=search'), env, session)).json();
    const next = request(`?kind=search&cursor=${encodeURIComponent(first.nextCursor)}`);
    const second = await (await handleBoothActivity(next, env, session)).json();
    expect(first.events).toHaveLength(100);
    expect(second.events).toHaveLength(100);
    const ids = [...first.events, ...second.events].map((event) => event.event_id);
    expect(new Set(ids).size).toBe(200);
    const csv = await (await handleBoothActivity(request('?kind=search', '/api/booth-activity.csv'), env, session)).text();
    expect(csv.trim().split('\r\n')).toHaveLength(1106);
    expect(csv).toContain('"visitor0@example.com"');
    expect(csv).toContain('"visitor1104@example.com"');
    expect((await handleBoothActivity(request(`?kind=report_sent&cursor=${encodeURIComponent(first.nextCursor)}`), env, session)).status).toBe(400);
  });

  it('distinguishes contact opt-in from sent reports and filters UTC dates', async () => {
    await storeBoothActivity(env, createBoothActivity('search', 'one', 'one@example.com', null, Date.now() - 86400000));
    await storeBoothActivity(env, createBoothActivity('contact_requested', 'two', 'two@example.com', report));
    await storeBoothActivity(env, createBoothActivity('report_sent', 'three', 'three@example.com', report));
    const contact = await (await handleBoothActivity(request('?kind=contact_requested&from=2026-10-06&until=2026-10-07'), env, session)).json();
    expect(contact.events.map((event) => event.email)).toEqual(['two@example.com']);
    expect((await handleBoothActivity(request('?from=2026-02-30'), env, session)).status).toBe(400);
    expect((await handleBoothActivity(request('?kind=arbitrary'), env, session)).status).toBe(400);
    expect((await handleBoothActivity(request('?from=2026-10-07&until=2026-10-06'), env, session)).status).toBe(400);
  });

  it('excludes expired events immediately and purges only booth records', async () => {
    await storeBoothActivity(env, createBoothActivity('search', 'expired', 'expired@example.com', null, Date.now() - BOOTH_RETENTION_MS));
    await storeBoothActivity(env, createBoothActivity('search', 'fresh', 'fresh@example.com'));
    const rows = await (await handleBoothActivity(request(), env, session)).json();
    expect(rows.events.map((event) => event.email)).toEqual(['fresh@example.com']);
    await worker.scheduled({}, env);
    expect(env.REPORT_REQUESTS.events.size).toBe(1);
    expect([...env.REPORT_REQUESTS.events.values()][0].email).toBe('fresh@example.com');
  });

  it('exports formula-safe CSV and fails visibly on unavailable persistence', async () => {
    await storeBoothActivity(env, createBoothActivity('report_sent', 'one', 'visitor@example.com', { ...report, company: '=DANGEROUS', label: '+formula' }));
    const csv = await (await handleBoothActivity(request('', '/api/booth-activity.csv'), env, session)).text();
    expect(csv).toContain('"\u0027=DANGEROUS"');
    expect(csv).toContain('"\u0027+formula"');
    env.REPORT_REQUESTS = undefined;
    expect((await handleBoothActivity(request(), env, session)).status).toBe(503);
    await expect(purgeBoothActivity(env)).rejects.toThrow('Booth activity');
  });

  it('fails a mid-export download rather than returning a silently truncated CSV', async () => {
    for (let i = 0; i < 105; i += 1) {
      await storeBoothActivity(env, createBoothActivity('search', `visit-${i}`, `visitor${i}@example.com`));
    }
    const { prepare } = env.REPORT_REQUESTS;
    let pages = 0;
    env.REPORT_REQUESTS.prepare = (sql) => {
      pages += 1;
      if (pages > 1) throw new Error('Database unavailable');
      return prepare(sql);
    };
    const response = await handleBoothActivity(request('', '/api/booth-activity.csv'), env, session);
    await expect(response.text()).rejects.toThrow('Activity export interrupted');
  });

  it('returns accurate CSV HEAD metadata and does not conceal database failures', async () => {
    const head = new Request(request('', '/api/booth-activity.csv'), { method: 'HEAD' });
    const response = await handleBoothActivity(head, env, session);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('booth-activity.csv');
    expect(response.body).toBeNull();
    env.REPORT_REQUESTS.prepare = () => { throw new Error('Unavailable'); };
    expect((await handleBoothActivity(head, env, session)).status).toBe(503);
  });

  it('sends only fixed anonymous action metadata, never emails, hashes, company, visit, report URL or attendee headers', async () => {
    env.BOOTH_ANALYTICS_HOSTNAME = 'act.aem.now';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
    await countBoothActivity(env, 'report_sent');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://queue.simpleanalyticscdn.com/events');
    expect(JSON.parse(options.body)).toEqual({
      type: 'event',
      hostname: 'act.aem.now',
      event: 'booth_report_sent',
      path: '/booth',
      ua: 'ServerSide/1.0 (+https://act.aem.now/)',
    });
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(options.redirect).toBe('manual');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockRejectedValue(new Error('private@example.com secret'));
    await countBoothActivity(env, 'search');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('private@example.com');
    expect(JSON.stringify(logged.mock.calls)).toContain('private record retained');
  });

  it('does not emit retired contact opt-in events, including historical outbox replays', async () => {
    env.BOOTH_ANALYTICS_HOSTNAME = 'act.aem.now';
    vi.stubGlobal('fetch', vi.fn());
    await countBoothActivity(env, 'contact_requested');
    expect(fetch).not.toHaveBeenCalled();
  });
});
