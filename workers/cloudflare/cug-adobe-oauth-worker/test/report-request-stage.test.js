import { createHmac } from 'node:crypto';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import worker from '../src/index.js';
import { createMockD1, createMockEnv } from './helpers.js';

const SECRET = 'synthetic-stage-report-request-secret';
const UUID = '2a6aa96b-8078-4efb-8d16-cd0d79645589';
const TOKEN = `${UUID}.38aaa507a2e8fcaba0f1c6ef44906a6f12424296363c6dee9d287c4b4fe24932`;
const TEST_PATH = '/api/report-requests/test';
const ORIGIN = 'https://main--summit-portal--aemsites.aem.page';
const BODY = {
  fullName: 'Sample Attendee',
  email: 'sample@example.test',
  company: 'Synthetic Stage',
  website: 'example.test',
  consent: true,
  turnstileToken: 'sample-challenge',
};

function request(path, body, origin = ORIGIN) {
  return new Request(`https://act.aem.now${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': 'sample-request-key' },
    body: JSON.stringify(body),
  });
}

describe('Stage report requests', () => {
  let env;
  beforeEach(() => {
    env = createMockEnv({
      DIH_REPORT_REQUEST_STAGE_TEST_SECRET: SECRET,
      TURNSTILE_SECRET_KEY: 'synthetic-turnstile',
    });
    Object.defineProperty(env, 'REPORT_REQUESTS', {
      get() { throw new Error('Stage must not read the D1 binding'); },
      configurable: true,
    });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('accepts the cross-service fixture without reading the D1 binding', async () => {
    const response = await worker.fetch(request(TEST_PATH, { ...BODY, stageToken: TOKEN }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ testOnly: true });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('authenticates the exact raw credential bytes', async () => {
    const secret = `  ${SECRET}  `;
    env.DIH_REPORT_REQUEST_STAGE_TEST_SECRET = secret;
    const mac = createHmac('sha256', secret).update(`dih-report-request-stage-v1\n${UUID}`).digest('hex');
    const response = await worker.fetch(request(TEST_PATH, { ...BODY, stageToken: `${UUID}.${mac}` }), env);
    expect(response.status).toBe(200);
  });

  it.each([undefined, null, '', TOKEN.toUpperCase(), `${TOKEN}\n`, `${TOKEN.slice(0, -1)}0`])(
    'rejects invalid Stage authentication before Turnstile',
    async (stageToken) => {
      const response = await worker.fetch(request(TEST_PATH, { ...BODY, stageToken }), env);
      expect(response.status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, ' '.repeat(64), ` ${'x'.repeat(31)}`])('fails closed without a usable secret', async (secret) => {
    env.DIH_REPORT_REQUEST_STAGE_TEST_SECRET = secret;
    env.DIH_REPORT_REQUEST_CAMPAIGN_SYNC_SECRET = SECRET;
    const response = await worker.fetch(request(TEST_PATH, { ...BODY, stageToken: TOKEN }), env);
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shares CORS, validation, Turnstile and rate limits with the public form', async () => {
    const headers = { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' };
    const preflight = await worker.fetch(new Request(`https://act.aem.now${TEST_PATH}`, { method: 'OPTIONS', headers }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const foreign = request(TEST_PATH, { ...BODY, stageToken: TOKEN }, 'https://other.example');
    expect((await worker.fetch(foreign, env)).status).toBe(403);
    const submit = (body) => {
      const sample = { ...BODY, stageToken: TOKEN, ...body };
      return worker.fetch(request(TEST_PATH, sample), env);
    };
    expect((await submit({ consent: false })).status).toBe(400);
    expect((await submit({ websiteConfirm: 'filled honeypot' })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(Response.json({ success: false }));
    expect((await submit()).status).toBe(400);
    for (let count = 0; count < 5; count += 1) expect((await submit()).status).toBe(200);
    expect((await submit()).status).toBe(429);
  });

  it('rejects stageToken on live intake but still stores ordinary submissions', async () => {
    const db = createMockD1();
    const liveEnv = createMockEnv({ REPORT_REQUESTS: db, TURNSTILE_SECRET_KEY: 'synthetic-turnstile' });
    for (const stageToken of [TOKEN, null, '']) {
      expect((await worker.fetch(request('/api/report-requests', { ...BODY, stageToken }), liveEnv)).status).toBe(400);
    }
    expect(db.requests.size).toBe(0);
    expect(db.idempotency.size).toBe(0);
    expect((await worker.fetch(request('/api/report-requests', BODY), liveEnv)).status).toBe(201);
    expect(db.requests.size).toBe(1);
  });
});
