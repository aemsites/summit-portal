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

const session = { method: 'oauth', email: 'josec@adobe.com' };
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

  it('denies ordinary users and non-OAuth admin identities before querying private activity', async () => {
    const prepare = vi.spyOn(env.REPORT_REQUESTS, 'prepare');
    for (const identity of [
      { method: 'oauth', email: 'seller@adobe.com' },
      ...['staff', 'sharelink', 'magiclink', undefined].map((method) => ({ method, email: session.email })),
    ]) {
      const cookie = `auth_token=${await createSession(env, identity)}`;
      for (const path of ['/api/booth-activity', '/api/booth-activity.csv']) {
        for (const method of ['GET', 'HEAD']) {
          const response = await worker.fetch(new Request(`https://portal.example${path}`, { method, headers: { Cookie: cookie } }), env);
          expect(response.status).toBe(403);
          expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        }
      }
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it.each(['josec@adobe.com', 'nglauser@adobe.com', 'ebill@adobe.com', 'constantinp@adobe.com', 'JOSEC@ADOBE.COM'])(
    'allows the configured admin %s to retrieve JSON and CSV',
    async (email) => {
      for (const path of ['/api/booth-activity', '/api/booth-activity.csv']) {
        const response = await handleBoothActivity(request('', path), env, { method: 'oauth', email });
        expect(response.status).toBe(200);
        await response.text();
      }
    },
  );

  it('stores stable visit correlation, canonical company/report, notice and exact 90-day expiry', async () => {
    const activity = createBoothActivity('contact_requested', 'visit-one', 'visitor@example.com', report);
    expect(await storeBoothActivity(env, activity)).toBe(true);
    expect(await storeBoothActivity(env, activity)).toBe(false);
    expect(env.REPORT_REQUESTS.events.size).toBe(1);
    const retention = Date.parse(activity.expires_at) - Date.parse(activity.occurred_at);
    expect(retention).toBe(BOOTH_RETENTION_MS);
    const response = await handleBoothActivity(request('?kind=contact_requested'), env, session);
    expect((await response.json()).events).toEqual([{
      ...activity,
      public_campaign_id: null,
      scroll_depth: null,
      campaign_name: null,
      campaign_link: '',
    }]);
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

  it('joins a late campaign mapping to existing activity only inside the private export', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    env.DIH_REPORT_REQUEST_HUB_ORIGIN = 'https://hub.example';
    const exportCsv = async () => (await handleBoothActivity(request('', '/api/booth-activity.csv'), env, session)).text();
    await storeBoothActivity(env, {
      ...createBoothActivity('report_scroll', 'one', '', report),
      public_campaign_id: id,
      scroll_depth: 50,
    });

    await storeBoothActivity(env, createBoothActivity('report_sent', 'generic', 'visitor@example.com', report));
    expect(await exportCsv()).toContain(`"${id}","","","50"`);
    env.REPORT_REQUESTS.campaigns.set(id, { campaign_name: '=Synthetic Event', hub_campaign_id: 'event/toronto' });
    const csv = await exportCsv();
    expect(csv).toContain(`"${id}","'=Synthetic Event","https://hub.example/insights-campaigns/event%2Ftoronto","50"`);
    expect(csv.split('\r\n').find((row) => row.includes('"generic"'))).not.toContain('Synthetic Event');
    env.BOOTH_ANALYTICS_HOSTNAME = 'act.aem.now';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
    await countBoothActivity(env, 'report_scroll', id, 50);
    const payload = JSON.parse(fetch.mock.lastCall[1].body);
    expect(payload).toEqual({
      type: 'event',
      hostname: 'act.aem.now',
      event: 'booth_report_scroll',
      path: '/booth',
      ua: 'ServerSide/1.0 (+https://act.aem.now/)',
      metadata: { campaign_id: id, scroll_depth: 50 },
    });
  });

  it('emits a campaign-bound report ID without attendee or raw report data', async () => {
    const campaign = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const otherCampaign = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    env.BOOTH_ANALYTICS_HOSTNAME = 'act.aem.now';
    env.DIH_SHARE_LINK_SECRET = 'fixture-booth-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
    await countBoothActivity(env, 'report_viewed', campaign, null, report.path);
    await countBoothActivity(env, 'report_scroll', campaign, 75, report.path);
    await countBoothActivity(env, 'report_viewed', otherCampaign, null, report.path);
    await countBoothActivity(env, 'report_viewed', null, null, report.path);
    const payloads = fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    const reportId = '9f18f056612eb83d10c6745659689df273f1a590767e9a391559546475cfe39c';
    expect(payloads[0]).toEqual({
      type: 'event',
      hostname: 'act.aem.now',
      path: '/booth',
      event: 'booth_report_viewed',
      ua: 'ServerSide/1.0 (+https://act.aem.now/)',
      metadata: { campaign_id: campaign, report_id: reportId },
    });
    expect(payloads[1].metadata).toMatchObject({ campaign_id: campaign, report_id: reportId });
    expect(payloads[1].metadata.scroll_depth).toBe(75);
    expect(payloads[2].metadata.report_id).not.toBe(reportId);
    expect(payloads[3]).not.toHaveProperty('metadata');
    expect(JSON.stringify(payloads)).not.toContain(report.path);
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

  it('exports unmatched and demo outcomes with private visit correlation while counting them anonymously', async () => {
    env.BOOTH_ANALYTICS_HOSTNAME = 'act.aem.now';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
    for (const kind of ['no_report', 'demo_selected', 'demo_viewed']) {
      await storeBoothActivity(env, createBoothActivity(
        kind,
        'missing-visit',
        'unmatched@example.com',
        kind === 'no_report' ? null : { path: '/example-report/luma/', company: 'Luma', label: 'Retail / apparel' },
      ));
      const csv = await (await handleBoothActivity(request(`?kind=${kind}`, '/api/booth-activity.csv'), env, session)).text();
      expect(csv).toContain('"unmatched@example.com"');
      expect(csv).toContain('"missing-visit"');
      await countBoothActivity(env, kind);
      const payload = JSON.parse(fetch.mock.lastCall[1].body);
      expect(payload).toEqual({
        type: 'event',
        hostname: 'act.aem.now',
        event: `booth_${kind}`,
        path: '/booth',
        ua: 'ServerSide/1.0 (+https://act.aem.now/)',
      });
    }
  });
});
