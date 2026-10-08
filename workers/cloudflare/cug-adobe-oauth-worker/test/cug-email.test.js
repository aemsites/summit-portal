import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { BoothCoordinator, handleBooth, discoverReports } from '../src/booth.js';
import { handleShareLinkRequest } from '../src/sharelink.js';
import { checkCugAccess } from '../src/cug.js';
import { handleMagicLinkRequest } from '../src/magiclink.js';
import { handlePortalRedirect } from '../src/portal.js';
import { createSession, getSession, verifyShareLink } from '../src/session.js';
import { resetCugSheetCache } from '../src/cugsheet.js';
import { createMockEnv, createMockBoothStorage, createMockBoothD1, createMockBoothCookie } from './helpers.js';
import { sendShareLinkConfirm, sendMagicLinkConfirm } from '../src/notification.js';

vi.mock('../src/notification.js', () => ({
  sendShareLinkConfirm: vi.fn().mockResolvedValue(undefined),
  sendMagicLinkConfirm: vi.fn().mockResolvedValue(undefined),
  sendMagicLinkInternalNotify: vi.fn().mockResolvedValue(undefined),
  sendMagicLinkNotFound: vi.fn().mockResolvedValue(undefined),
}));

const email = 'approved@alias.example';
const neighbor = 'neighbor@alias.example';
const path = '/accounts/e/example/insights/example-com/portal-landing/';
const domainPath = '/accounts/a/alias/insights/alias-example/portal-landing/';
const unrelated = '/accounts/u/unrelated/insights/unrelated-example/portal-landing/';
const scope = '/accounts/e/example**';

function protectedPage(groups) {
  return new Response('<html><body><main>Actual report</main></body></html>', { headers: { 'Content-Type': 'text/html', 'x-aem-cug-required': 'true', 'x-aem-cug-groups': groups } });
}

describe('exact-email CUG integration', () => {
  let env;
  let rows;
  let staffCookie;

  async function share(body) {
    return handleShareLinkRequest(new Request('https://portal.example/auth/sharelink', {
      method: 'POST',
      headers: { Cookie: staffCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), env);
  }

  async function redeem(link) {
    const response = await worker.fetch(new Request(link), env);
    expect(response.status).toBe(302);
    const cookie = response.headers.get('Set-Cookie').match(/auth_token=[^;]+/)[0];
    const session = await getSession(new Request('https://portal.example/', { headers: { Cookie: cookie } }), env);
    return { cookie, session };
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetCugSheetCache();
    env = createMockEnv();
    staffCookie = `auth_token=${await createSession(env, { email: 'operator@adobe.com', groups: ['adobe.com'], method: 'oauth' })}`;
    rows = {
      '/data/insights-list.json': [
        { Folder: path, Customers: 'Example', Report: 'example.com' },
        { Folder: unrelated },
      ],
      '/closed-user-groups.json': [
        { url: scope, 'cug-groups': `adobe.com,example.com, ${email.toUpperCase()} ` },
        { url: '/accounts/a/alias**', 'cug-groups': 'alias.example' },
        { url: '/accounts/u/unrelated**', 'cug-groups': 'unrelated.example' },
      ],
      '/closed-user-groups-mapping.json': [
        { url: scope, group: email.toUpperCase(), org: 'Adobe' },
        { url: scope, group: 'example.com', org: 'Adobe' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const { pathname } = new URL(url instanceof Request ? url.url : url);
      if (rows[pathname]) return new Response(JSON.stringify({ data: rows[pathname] }));
      if (pathname === path) return protectedPage(email);
      if (pathname === domainPath) return protectedPage('alias.example');
      if (pathname === unrelated) return protectedPage('unrelated.example');
      return new Response(null, { status: 404 });
    }));
  });

  it('discovers an exact authorized email without authorizing its neighboring address or domain', async () => {
    expect(await discoverReports(` ${email.toUpperCase()} `, env)).toEqual([
      { path, label: 'Example — example.com', company: 'Example', websiteHost: 'example.com' },
    ]);
    expect(await discoverReports(neighbor, env)).toEqual([]);
    rows['/closed-user-groups-mapping.json'][0].group = neighbor;
    expect(await discoverReports(email, env)).toEqual([]);
  });

  it('emails through the real share handler and redeems only the exact authored grant', async () => {
    const response = await share({ email, path, mode: 'email' });
    expect(response.status).toBe(200);
    expect(sendShareLinkConfirm).toHaveBeenCalledOnce();
    const { link } = await response.json();
    const claims = await verifyShareLink(new URL(link).searchParams.get('token'), env);
    expect(claims.groups).toEqual([email]);
    const { cookie, session } = await redeem(link);
    expect(session.groups).toEqual([email]);
    expect((await worker.fetch(new Request(`https://portal.example${path}`, { headers: { Cookie: cookie } }), env)).status).toBe(200);
    for (const denied of [domainPath, unrelated]) {
      const rejected = await worker.fetch(new Request(`https://portal.example${denied}`, { headers: { Cookie: cookie } }), env);
      expect(rejected.headers.get('Location')).toBe('https://portal.example/403');
    }
    expect((await share({ email: neighbor, path, mode: 'email' })).status).toBe(403);
    expect(sendShareLinkConfirm).toHaveBeenCalledOnce();
  });

  it('looks up and sends the exact email through the real booth context, then rejects a neighbor', async () => {
    env.REPORT_REQUESTS = createMockBoothD1();
    const actor = new BoothCoordinator({
      storage: createMockBoothStorage(),
      waitUntil: vi.fn(),
    }, env);
    env.BOOTH_COORDINATOR = { idFromName: (id) => id, get: () => actor };
    const scopedCookie = await createMockBoothCookie(env);
    let cookie = scopedCookie;
    const booth = async (action, body) => {
      const response = await handleBooth(new Request(`https://portal.example/auth/booth/${action}`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: 'https://portal.example', 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'lookup' ? { noticeVersion: 'booth-privacy-v1', ...body } : body),
      }), env);
      const context = response.headers.get('Set-Cookie')?.match(/booth_context=[^;]+/)[0];
      if (context) cookie = `${scopedCookie}; ${context}`;
      return response;
    };
    const lookup = await booth('lookup', { email });
    expect(lookup.status).toBe(200);
    expect((await lookup.json()).selectedPath).toBe(path);
    expect((await booth('send', {})).status).toBe(200);
    expect(sendShareLinkConfirm.mock.calls[0][0]).toBe(email);
    expect(sendShareLinkConfirm).toHaveBeenCalledOnce();
    expect((await booth('lookup', { email: neighbor })).status).toBe(404);
    expect((await booth('lookup', { email })).status).toBe(200);
    rows['/closed-user-groups-mapping.json'][0].group = neighbor;
    expect((await booth('send', {})).status).toBe(403);
    expect(sendShareLinkConfirm).toHaveBeenCalledOnce();
  });

  it('copies exact-email groups without granting staff emails or fabricating an invalid token identity', async () => {
    rows['/closed-user-groups.json'][0]['cug-groups'] = `${email}, operator@adobe.com, adobe.com, agent@semrush.com`;
    const response = await share({ path, mode: 'copy' });
    expect(response.status).toBe(200);
    const { link } = await response.json();
    const claims = await verifyShareLink(new URL(link).searchParams.get('token'), env);
    expect(claims.email).toBe(email);
    expect(claims.groups).toEqual([email]);
    const { session } = await redeem(link);
    expect(session.groups).toEqual([email]);
    expect(sendShareLinkConfirm).not.toHaveBeenCalled();
  });

  it('matches verified session identity and explicit bearer groups without allowing a neighboring identity', async () => {
    for (const method of ['oauth', 'magiclink', 'sharelink']) {
      const request = new Request(`https://portal.example${path}`);
      expect((await checkCugAccess(protectedPage(email), { email: email.toUpperCase(), groups: ['alias.example'], method }, request, env)).status).toBe(200);
      expect((await checkCugAccess(protectedPage(email), { email: neighbor, groups: ['alias.example'], method }, request, env)).headers.get('Location')).toBe('https://portal.example/403');
    }
  });

  it('uses the same exact identity for self-service magic links and portal mapping', async () => {
    const response = await handleMagicLinkRequest(new Request('https://portal.example/auth/magiclink', { method: 'POST', body: JSON.stringify({ email }) }), env);
    expect(await response.json()).toEqual({ result: 'sent' });
    expect(sendMagicLinkConfirm).toHaveBeenCalledOnce();
    const portal = await handlePortalRedirect(
      { email, groups: ['alias.example'] },
      new Request('https://portal.example/portal'),
      env,
    );
    expect(portal.headers.get('Location')).toBe(`https://portal.example${scope}`);
  });
});
