import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleReportRequests, normaliseRequest, normaliseWebsite, reportRequestsAuthorisation, reportRequestsCsv } from '../src/report-requests.js';
import { createMockD1, createMockEnv } from './helpers.js';

const TURNSTILE_RESPONSE = new Response(JSON.stringify({ success: true }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

function environment() {
  return createMockEnv({
    REPORT_REQUESTS: createMockD1(),
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    IDEMPOTENCY_SALT: 'idempotency-salt',
    RATE_LIMIT_SALT: 'rate-limit-salt',
  });
}

function request(body, key = 'request-key-1234') {
  return new Request('https://mysite.com/api/report-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
      'CF-Connecting-IP': '192.0.2.1',
    },
    body: JSON.stringify({ ...body, turnstileToken: 'turnstile-token' }),
  });
}

const validBody = {
  fullName: '  Jordan   Lee ',
  email: ' Jordan@Example.COM ',
  company: ' Northstar  Commerce ',
  website: 'HTTPS://www.Example.com/growth/',
  jobTitle: 'VP, Digital',
  primaryMarket: 'North America',
  consent: true,
};

describe('report requests', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(TURNSTILE_RESPONSE.clone())));
  });

  it('normalises website hostnames and optional paths', () => {
    expect(normaliseWebsite(' Example.COM/path/ ')).toBe('example.com/path');
    expect(normaliseWebsite('https://www.example.com')).toBe('example.com');
    expect(normaliseWebsite('mailto:person@example.com')).toBeNull();
    expect(normaliseWebsite('example.com?campaign=x')).toBeNull();
  });

  it('validates required fields and does not permit honeypot data', () => {
    expect(normaliseRequest({ ...validBody, fullName: '' }).error).toContain('full name');
    expect(normaliseRequest({ ...validBody, consent: false }).error).toContain('agree');
    expect(normaliseRequest({ ...validBody, websiteConfirm: 'bot content' }).error).toBeTruthy();
    expect(normaliseRequest({ ...validBody, fullName: { value: 'Jordan Lee' } }).error).toContain('full name');
  });

  it('rejects non-JSON and unavailable persistence with non-cacheable errors', async () => {
    const nonJson = await handleReportRequests(new Request('https://mysite.com/api/report-requests', {
      method: 'POST',
      body: 'fullName=Jordan',
    }), environment(), null);
    expect(nonJson.status).toBe(400);
    expect(nonJson.headers.get('Cache-Control')).toBe('private, no-store');

    const unavailable = await handleReportRequests(request(validBody), createMockEnv(), null);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('allows the public AEM delivery origins to submit report requests to act.aem.now', async () => {
    const origin = 'https://main--summit-portal--aemsites.aem.page';
    const response = await handleReportRequests(new Request('https://act.aem.now/api/report-requests', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,idempotency-key',
      },
    }), environment(), null);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Idempotency-Key');
  });

  it('stores normalised data, consent provenance, and no Turnstile or IP data', async () => {
    const env = environment();
    const response = await handleReportRequests(request(validBody), env, null);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const result = await response.json();
    const stored = env.REPORT_REQUESTS.requests.get(result.requestId);
    expect(stored).toMatchObject({
      full_name: 'Jordan Lee',
      email: 'jordan@example.com',
      company: 'Northstar Commerce',
      website: 'example.com/growth',
      consent_version: 'adobe-privacy-v1',
    });
    expect(stored).not.toHaveProperty('turnstile_token');
    expect(stored).not.toHaveProperty('ip');
  });

  it('returns the original successful response without duplicating a retried request', async () => {
    const env = environment();
    const first = await handleReportRequests(request(validBody), env, null);
    const second = await handleReportRequests(request(validBody), env, null);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await first.json()).requestId).toBe((await second.json()).requestId);
    expect(env.REPORT_REQUESTS.requests.size).toBe(1);
  });

  it('rejects an unverifiable Turnstile response and does not insert a lead', async () => {
    const env = environment();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }))));
    const response = await handleReportRequests(request(validBody), env, null);
    expect(response.status).toBe(400);
    expect(env.REPORT_REQUESTS.requests.size).toBe(0);
  });

  it('does not let failed Turnstile challenges consume a visitor rate-limit slot', async () => {
    const env = environment();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }))));
    for (let index = 0; index < 5; index += 1) {
      expect((await handleReportRequests(request(validBody, `failed-challenge-${index}-1234`), env, null)).status).toBe(400);
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(TURNSTILE_RESPONSE.clone()));
    expect((await handleReportRequests(request(validBody, 'verified-challenge-1234'), env, null)).status).toBe(201);
  });

  it('rate limits public submission attempts without retaining the raw client IP', async () => {
    const env = environment();
    for (let index = 0; index < 5; index += 1) {
      expect((await handleReportRequests(request(validBody, `request-key-${index}-1234`), env, null)).status).toBe(201);
    }
    expect((await handleReportRequests(request(validBody, 'request-key-last-1234'), env, null)).status).toBe(429);
    expect([...env.SESSIONS.store.keys()].some((key) => key.includes('192.0.2.1'))).toBe(false);
  });

  it('allows list and CSV access only to verified Adobe OAuth sessions', async () => {
    const env = environment();
    const sessions = [
      [null, 401],
      [{ email: 'staff@adobe.com', method: 'staff' }, 403],
      [{ email: 'staff@semrush.com', method: 'oauth' }, 403],
      [{ email: 'staff@adobe.com', method: 'magiclink' }, 403],
      [{ email: 'staff@adobe.com', method: 'sharelink' }, 403],
      [{ email: 'staff@adobe.com', method: 'oauth' }, 200],
    ];
    for (const [session, status] of sessions) {
      for (const path of ['/api/report-requests', '/api/report-requests.csv']) {
        const response = await handleReportRequests(new Request(`https://mysite.com${path}`), env, session);
        expect(response.status).toBe(status);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      }
    }
    expect(reportRequestsAuthorisation({ email: 'employee@adobe.com', method: 'oauth' })).toBe(200);
  });

  it('exports the current Digital Insights Hub intake headers even without requests', () => {
    expect(reportRequestsCsv([])).toBe(
      '"Company Name","Website","Sub-ID","DR ID","Representative Email","CMS","Primary Country (Optional)","Audience","Access Emails"\r\n',
    );
  });

  it('maps requests to company intake without inventing account details or a country override', () => {
    const csv = reportRequestsCsv([{
      request_id: 'internal-id',
      submitted_at: '2026-09-08T10:00:00.000Z',
      full_name: 'Jordan Lee',
      email: 'jordan@example.com',
      company: 'Northstar Commerce',
      website: 'example.com/growth',
      job_title: 'VP, Digital',
      primary_market: 'North America',
    }]);

    expect(csv.split('\r\n').slice(1)).toEqual([
      '"Northstar Commerce","example.com/growth","","","","","","","jordan@example.com"',
      '',
    ]);
  });

  it('keeps CSV downloads aligned with search and newest-first ordering', async () => {
    const env = environment();
    env.REPORT_REQUESTS.requests.set('older', {
      request_id: 'older',
      submitted_at: '2026-09-07T10:00:00.000Z',
      full_name: 'Taylor',
      email: 'taylor@example.com',
      company: 'Example',
      website: 'example.com',
      job_title: null,
      primary_market: null,
      search_text: 'taylor example example.com',
    });
    env.REPORT_REQUESTS.requests.set('newer', {
      request_id: 'newer',
      submitted_at: '2026-09-08T10:00:00.000Z',
      full_name: 'Jordan',
      email: 'jordan@example.com',
      company: 'Northstar',
      website: 'northstar.com',
      job_title: 'VP, Digital',
      primary_market: 'North America',
      search_text: 'jordan northstar northstar.com',
    });
    const session = { email: 'employee@adobe.com', method: 'oauth' };
    const list = await handleReportRequests(new Request('https://mysite.com/api/report-requests?q=northstar'), env, session);
    expect((await list.json()).requests.map((row) => row.request_id)).toEqual(['newer']);
    const csv = await handleReportRequests(new Request('https://mysite.com/api/report-requests.csv'), env, session);
    expect(csv.headers.get('Content-Type')).toContain('text/csv');
    expect(csv.headers.get('Content-Disposition')).toBe('attachment; filename="report-requests.csv"');
    expect((await csv.text()).split('\r\n').slice(1)).toEqual([
      '"Northstar","northstar.com","","","","","","","jordan@example.com"',
      '"Example","example.com","","","","","","","taylor@example.com"',
      '',
    ]);

    const filtered = await handleReportRequests(new Request('https://mysite.com/api/report-requests.csv?q=northstar'), env, session);
    expect((await filtered.text()).split('\r\n').slice(1)).toEqual([
      '"Northstar","northstar.com","","","","","","","jordan@example.com"',
      '',
    ]);
  });

  it.each(['=SUM(A1)', '+SUM(A1)', '-SUM(A1)', '@SUM(A1)'])('escapes a formula-prefixed company: %s', (company) => {
    expect(reportRequestsCsv([{ company, website: 'example.com', email: 'a@example.com' }]).split('\r\n')[1])
      .toBe(`"'${company}","example.com","","","","","","","a@example.com"`);
  });

  it('quotes commas, quotes, and line breaks in intake cells', () => {
    const csv = reportRequestsCsv([{ company: 'A "quoted",\r\ncompany', website: 'example.com', email: 'a@example.com' }]);
    expect(csv).toContain('"A ""quoted"",\r\ncompany","example.com","","","","","","","a@example.com"\r\n');
  });
});
