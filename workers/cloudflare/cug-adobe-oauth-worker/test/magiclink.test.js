import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/notification.js', () => ({
  sendMagicLinkConfirm: vi.fn().mockResolvedValue(undefined),
  sendMagicLinkNotFound: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/session.js', () => ({
  createMagicLinkToken: vi.fn().mockResolvedValue('mock-token'),
}));

import { handleMagicLinkRequest } from '../src/magiclink.js';
import { sendMagicLinkConfirm, sendMagicLinkNotFound } from '../src/notification.js';
import { createMagicLinkToken } from '../src/session.js';
import { createMockEnv } from './helpers.js';

function mockCugFetch(entries) {
  return vi.fn().mockResolvedValueOnce(
    new Response(JSON.stringify({ data: entries }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('magiclink', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 405 for a non-POST request', async () => {
    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', { method: 'GET' }),
      env,
    );
    expect(resp.status).toBe(405);
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );
    expect(resp.status).toBe(400);
    expect(await resp.json()).toMatchObject({ error: 'Invalid JSON body' });
  });

  it('returns 400 when email is absent', async () => {
    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );
    expect(resp.status).toBe(400);
    expect(await resp.json()).toMatchObject({ error: 'Invalid email address' });
  });

  it('returns 400 for a malformed email', async () => {
    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'notanemail' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );
    expect(resp.status).toBe(400);
  });

  it('returns { result: "success" } and calls sendMagicLinkConfirm when domain matches CUG', async () => {
    vi.stubGlobal('fetch', mockCugFetch([{ group: 'adobe.com', url: '/members/adobe' }]));

    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'alice@adobe.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ result: 'success' });
    expect(sendMagicLinkConfirm).toHaveBeenCalledOnce();
    const [calledEmail, calledUrl] = sendMagicLinkConfirm.mock.calls[0];
    expect(calledEmail).toBe('alice@adobe.com');
    expect(calledUrl).toBe('https://mysite.com/members/adobe?token=mock-token');
  });

  it('returns { result: "not_found" } and calls sendMagicLinkNotFound when domain is not in CUG', async () => {
    vi.stubGlobal('fetch', mockCugFetch([{ group: 'adobe.com', url: '/members/adobe' }]));

    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'stranger@unknown.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ result: 'not_found' });
    expect(sendMagicLinkNotFound).toHaveBeenCalledOnce();
    expect(sendMagicLinkNotFound.mock.calls[0][0]).toBe('stranger@unknown.com');
  });

  it('normalises email to lowercase before domain matching', async () => {
    vi.stubGlobal('fetch', mockCugFetch([{ group: 'adobe.com', url: '/members/adobe' }]));

    await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'ALICE@ADOBE.COM' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );

    expect(sendMagicLinkConfirm.mock.calls[0][0]).toBe('alice@adobe.com');
  });

  it('returns { result: "not_found" } when the CUG mapping fetch fails (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'alice@adobe.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ result: 'not_found' });
    expect(sendMagicLinkNotFound).toHaveBeenCalledOnce();
    expect(sendMagicLinkNotFound.mock.calls[0][0]).toBe('alice@adobe.com');
  });

  it('sends ORIGIN_AUTHENTICATION as authorization header when fetching the CUG mapping', async () => {
    const fetchMock = mockCugFetch([]);
    vi.stubGlobal('fetch', fetchMock);

    await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'alice@adobe.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      createMockEnv({ ORIGIN_AUTHENTICATION: 'site-token-xyz' }),
    );

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('token site-token-xyz');
  });
});
