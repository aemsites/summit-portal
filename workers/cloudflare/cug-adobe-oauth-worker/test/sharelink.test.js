import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';

vi.mock('../src/notification.js', () => ({
  sendShareLinkConfirm: vi.fn().mockResolvedValue(undefined),
  sendMagicLinkInternalNotify: vi.fn().mockResolvedValue(undefined),
}));

// Keep getSession real (we mint genuine session cookies below) but stub the
// token mint so the emailed URL is deterministic.
vi.mock('../src/session.js', async () => {
  const actual = await vi.importActual('../src/session.js');
  return {
    ...actual,
    createShareLinkToken: vi.fn().mockResolvedValue('mock-share-token'),
  };
});

import { handleShareLinkRequest } from '../src/sharelink.js';
import { sendShareLinkConfirm, sendMagicLinkInternalNotify } from '../src/notification.js';
import { createSession, createShareLinkToken } from '../src/session.js';
import { createMockEnv } from './helpers.js';

function mockCugFetch(entries) {
  return vi.fn().mockResolvedValueOnce(
    new Response(JSON.stringify({ data: entries }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

async function staffRequest(env, body, { groups = ['adobe.com'], email = 'staff@adobe.com' } = {}) {
  const token = await createSession(env, { email, name: 'Staff', groups });
  return new Request('https://mysite.com/auth/sharelink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${token}` },
    body: JSON.stringify(body),
  });
}

const APPLE_ENTRY = { group: 'apple.com', url: '/members/apple', org: 'adobe' };

describe('sharelink', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 405 for a non-POST request', async () => {
    const resp = await handleShareLinkRequest(
      new Request('https://mysite.com/auth/sharelink', { method: 'GET' }),
      env,
    );
    expect(resp.status).toBe(405);
  });

  it('returns 401 when there is no session cookie', async () => {
    const resp = await handleShareLinkRequest(
      new Request('https://mysite.com/auth/sharelink', {
        method: 'POST',
        body: JSON.stringify({ email: 'x@apple.com', path: '/members/apple' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );
    expect(resp.status).toBe(401);
    expect(sendShareLinkConfirm).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a staff domain', async () => {
    const req = await staffRequest(
      env,
      { email: 'x@apple.com', path: '/members/apple' },
      { groups: ['apple.com'], email: 'outsider@apple.com' },
    );
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(403);
    expect(sendShareLinkConfirm).not.toHaveBeenCalled();
  });

  it('allows a semrush staffer (STAFF_DOMAINS default includes semrush.com)', async () => {
    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    const req = await staffRequest(
      env,
      { email: 'cust@apple.com', path: '/members/apple' },
      { groups: ['semrush.com'], email: 'rachel@semrush.com' },
    );
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({ result: 'sent' });
  });

  it('returns 400 for an invalid recipient email', async () => {
    const req = await staffRequest(env, { email: 'notanemail', path: '/members/apple' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(400);
  });

  it('returns 400 for an unsafe path (absolute url)', async () => {
    const req = await staffRequest(env, { email: 'x@apple.com', path: 'https://evil.com/x' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(400);
  });

  it('returns 400 for a protocol-relative path', async () => {
    const req = await staffRequest(env, { email: 'x@apple.com', path: '//evil.com/x' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(400);
  });

  it('returns 404 when the page is not in the CUG mapping', async () => {
    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    const req = await staffRequest(env, { email: 'x@unknown.com', path: '/members/nope' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(404);
    expect(sendShareLinkConfirm).not.toHaveBeenCalled();
  });

  it('sends to ANY recipient email and bakes the page group into the link', async () => {
    // Recipient is an outside domain not in the page CUG — staff can still send;
    // the token grants the page group so the link opens directly.
    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    const req = await staffRequest(env, { email: 'stranger@gmail.com', path: '/members/apple' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({ result: 'sent' });
    expect(createShareLinkToken).toHaveBeenCalledWith('stranger@gmail.com', env, ['apple.com']);
    expect(sendShareLinkConfirm).toHaveBeenCalledOnce();
  });

  it('grants the page group regardless of recipient (internal or customer)', async () => {
    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    const internal = await staffRequest(env, { email: 'josec@adobe.com', path: '/members/apple' });
    expect((await handleShareLinkRequest(internal, env)).status).toBe(200);
    expect(createShareLinkToken).toHaveBeenCalledWith('josec@adobe.com', env, ['apple.com']);

    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    const customer = await staffRequest(env, { email: 'tim@apple.com', path: '/members/apple' });
    expect((await handleShareLinkRequest(customer, env)).status).toBe(200);
    expect(createShareLinkToken).toHaveBeenCalledWith('tim@apple.com', env, ['apple.com']);
  });

  it('returns { result: "sent", link } and emails an authorized recipient', async () => {
    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    const req = await staffRequest(env, { email: 'tim@apple.com', path: '/members/apple' });
    const resp = await handleShareLinkRequest(req, env);

    expect(resp.status).toBe(200);
    // The response echoes the link so staff can copy it and deliver it by
    // another channel when the emailed copy is blocked by the recipient's MX.
    expect(await resp.json()).toEqual({
      result: 'sent',
      link: 'https://mysite.com/members/apple?token=mock-share-token',
    });
    expect(sendShareLinkConfirm).toHaveBeenCalledOnce();
    const [calledEmail, calledUrl, , calledTemplate] = sendShareLinkConfirm.mock.calls[0];
    expect(calledEmail).toBe('tim@apple.com');
    expect(calledUrl).toBe('https://mysite.com/members/apple?token=mock-share-token');
    // INTERIM: reusing the live magiclink template until the sharelink template
    // is provisioned in Postoffice.
    expect(calledTemplate).toBe('expdev_actnow_magiclink');
    expect(sendMagicLinkInternalNotify).toHaveBeenCalledOnce();
  });

  it('matches a page path even with a trailing slash / wildcard in the mapping', async () => {
    vi.stubGlobal('fetch', mockCugFetch([{ group: 'apple.com', url: '/members/apple/*' }]));
    const req = await staffRequest(env, { email: 'tim@apple.com', path: '/members/apple/' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({ result: 'sent' });
  });

  it('matches a deep page path under a wildcard CUG scope', async () => {
    // The mapping authors a scope prefix; the dashboard shares a specific
    // report page deeper under it. The scope must still cover the page.
    vi.stubGlobal('fetch', mockCugFetch([{ group: 'apple.com', url: '/accounts/a/apple/*' }]));
    const req = await staffRequest(env, {
      email: 'tim@apple.com',
      path: '/accounts/a/apple/insights/www_apple_com/index',
    });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({ result: 'sent' });
  });

  it('grants only the most-specific scope group when nested scopes both cover the page', async () => {
    // A broad parent scope must not leak into the granted token — only the
    // deepest matching scope's group is baked into the link.
    const nestedEntries = [
      { group: 'broad.com', url: '/accounts/*' },
      { group: 'apple.com', url: '/accounts/a/apple/*' },
    ];
    const deep = '/accounts/a/apple/insights/index';

    vi.stubGlobal('fetch', mockCugFetch(nestedEntries));
    const req = await staffRequest(env, { email: 'someone@anywhere.com', path: deep });
    expect((await handleShareLinkRequest(req, env)).status).toBe(200);
    // grant is the deeper scope (apple.com), not the broad parent (broad.com)
    expect(createShareLinkToken).toHaveBeenCalledWith('someone@anywhere.com', env, ['apple.com']);
  });

  it('authorizes against any of several allowed domains for the same page', async () => {
    vi.stubGlobal('fetch', mockCugFetch([
      { group: 'apple.com', url: '/members/apple' },
      { group: 'beats.com', url: '/members/apple' },
    ]));
    const req = await staffRequest(env, { email: 'dr@beats.com', path: '/members/apple' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({ result: 'sent' });
  });

  it('uses the semrush template when the matched entry org is semrush', async () => {
    vi.stubGlobal('fetch', mockCugFetch([{ group: 'sem-cust.com', url: '/members/sem', org: 'semrush' }]));
    const req = await staffRequest(env, { email: 'c@sem-cust.com', path: '/members/sem' });
    await handleShareLinkRequest(req, env);
    const [, , , calledTemplate] = sendShareLinkConfirm.mock.calls[0];
    // INTERIM: magiclink template family until the sharelink template exists.
    expect(calledTemplate).toBe('expdev_actnow_magiclink_semrush');
  });

  it('returns 502 when the CUG mapping fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const req = await staffRequest(env, { email: 'tim@apple.com', path: '/members/apple' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(502);
    expect(sendShareLinkConfirm).not.toHaveBeenCalled();
  });

  it('returns 502 when sendShareLinkConfirm throws', async () => {
    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    sendShareLinkConfirm.mockRejectedValueOnce(new Error('APO error'));
    const req = await staffRequest(env, { email: 'tim@apple.com', path: '/members/apple' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(502);
  });

  it('still returns sent when the internal notify throws (best-effort)', async () => {
    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    sendMagicLinkInternalNotify.mockRejectedValueOnce(new Error('APO error'));
    const req = await staffRequest(env, { email: 'tim@apple.com', path: '/members/apple' });
    const resp = await handleShareLinkRequest(req, env);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toMatchObject({ result: 'sent' });
  });

  it('normalises recipient email to lowercase', async () => {
    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    const req = await staffRequest(env, { email: 'TIM@APPLE.COM', path: '/members/apple' });
    await handleShareLinkRequest(req, env);
    expect(sendShareLinkConfirm.mock.calls[0][0]).toBe('tim@apple.com');
  });

  it('honours a custom STAFF_DOMAINS env override', async () => {
    const customEnv = createMockEnv({ STAFF_DOMAINS: 'acme.com' });
    vi.stubGlobal('fetch', mockCugFetch([APPLE_ENTRY]));
    // adobe.com is no longer staff under the override
    const req = await staffRequest(customEnv, { email: 'tim@apple.com', path: '/members/apple' }, { email: 'x@adobe.com', groups: ['adobe.com'] });
    const resp = await handleShareLinkRequest(req, customEnv);
    expect(resp.status).toBe(403);
  });
});
