import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { createMockD1, createMockEnv } from './helpers.js';

const PATH = '/api/report-request-campaigns/dih';
const SHARE_LINK_PATH = '/auth/sharelink/dih';
const SECRET = 'synthetic-report-request-sync-secret';
const CAMPAIGN = {
  publicCampaignId: '2a6aa96b-8078-4efb-8d16-cd0d79645589',
  hubCampaignId: 'campaign/synthetic',
  campaignName: 'Summit Montr\u00e9al',
};

function signedRequest(payload = CAMPAIGN, options = {}) {
  const { timestamp = Math.floor(Date.now() / 1000), secret = SECRET, method = 'POST' } = options;
  const signedPath = options.signedPath ?? PATH;
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(`${timestamp}\nPOST\n${signedPath}\n${body}`).digest('hex');
  return new Request(`https://mysite.com${PATH}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-DIH-Timestamp': String(timestamp),
      'X-DIH-Signature': signature,
    },
    body: method === 'POST' ? body : undefined,
  });
}

function environment() {
  return createMockEnv({
    DIH_SHARE_LINK_SECRET: SECRET,
    REPORT_REQUESTS: createMockD1(),
  });
}

describe('signed report request campaign registration', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('accepts the Hub sender fixture without a session and preserves the first mapping on conflicts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response(null, { status: 404 })));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1795168800000);
    const env = environment();
    const fixture = signedRequest();
    expect(fixture.headers.get('X-DIH-Signature')).toBe('b226680c537aea404a67a5c72c6a28520fba1e9f3e4dbf9011445903b247a496');
    for (const submission of [fixture, signedRequest()]) {
      const response = await worker.fetch(submission, env);
      expect(response.status).toBe(204);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    }
    for (const change of [{ campaignName: 'Conflicting Name' }, { hubCampaignId: 'different-id' }]) {
      expect((await worker.fetch(signedRequest({ ...CAMPAIGN, ...change }), env)).status).toBe(409);
    }
    expect([...env.REPORT_REQUESTS.campaigns.values()]).toEqual([{
      hub_campaign_id: 'campaign/synthetic',
      campaign_name: 'Summit Montr\u00e9al',
    }]);
  });

  it('rejects unauthorized and malformed writes without exposing them to the origin', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response(null, { status: 404 })));
    const env = environment();
    const unsigned = signedRequest();
    unsigned.headers.delete('X-DIH-Signature');
    const cases = [
      [unsigned, 401],
      [signedRequest(CAMPAIGN, { secret: 'synthetic-different-signing-secret' }), 401],
      [signedRequest(CAMPAIGN, { signedPath: SHARE_LINK_PATH }), 401],
      [signedRequest(CAMPAIGN, { timestamp: Math.floor(Date.now() / 1000) - 301 }), 401],
      [signedRequest(CAMPAIGN, { method: 'GET' }), 405],
      [signedRequest({ ...CAMPAIGN, publicCampaignId: 'not-a-uuid' }), 400],
      [signedRequest({ ...CAMPAIGN, hubCampaignId: '' }), 400],
      [signedRequest({ ...CAMPAIGN, campaignName: ' ' }), 400],
      [signedRequest({ ...CAMPAIGN, campaignUrl: 'https://other.example' }), 400],
    ];
    for (const [submission, status] of cases) {
      const response = await worker.fetch(submission, env);
      expect(response.status).toBe(status);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(env.REPORT_REQUESTS.campaigns.size).toBe(0);
  });

  it('preserves long Hub names with Unicode and interior whitespace', async () => {
    const env = environment();
    const campaignName = 'Montr\u00e9al  Summit '.repeat(700).trimEnd();
    const response = await worker.fetch(signedRequest({ ...CAMPAIGN, campaignName }), env);
    expect(response.status).toBe(204);
    const stored = env.REPORT_REQUESTS.campaigns.get(CAMPAIGN.publicCampaignId);
    expect(stored.campaign_name).toBe(campaignName);
  });

  it('bounds the mapping envelope to avoid D1 row-size failures', async () => {
    const env = environment();
    const campaignName = 'a'.repeat(256 * 1024);
    const response = await worker.fetch(signedRequest({ ...CAMPAIGN, campaignName }), env);
    expect(response.status).toBe(413);
    expect(env.REPORT_REQUESTS.campaigns.size).toBe(0);
  });
});
