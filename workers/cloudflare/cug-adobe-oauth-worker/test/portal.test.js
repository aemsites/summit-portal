import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePortalRedirect } from '../src/portal.js';
import { createMockEnv } from './helpers.js';

function mappingResponse(data, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('portal', () => {
  let env;
  const request = new Request('https://mysite.com/auth/portal');

  beforeEach(() => {
    env = createMockEnv();
    vi.unstubAllGlobals();
  });

  it('redirects to the mapped URL when user group matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      mappingResponse([
        { group: 'adobe.com', url: '/members/adobe-portal' },
        { group: 'partner.com', url: '/members/partner-portal' },
      ]),
    ));

    const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
    const resp = await handlePortalRedirect(session, request, env);

    expect(resp.status).toBe(302);
    expect(resp.headers.get('Location')).toBe('https://mysite.com/members/adobe-portal');
  });

  it('picks the first matching entry when multiple groups could match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      mappingResponse([
        { group: 'adobe.com', url: '/members/first' },
        { group: 'adobe.com', url: '/members/second' },
      ]),
    ));

    const session = { email: 'bob@adobe.com', groups: ['adobe.com'] };
    const resp = await handlePortalRedirect(session, request, env);

    expect(resp.headers.get('Location')).toBe('https://mysite.com/members/first');
  });

  it('offers report intake when no group matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      mappingResponse([
        { group: 'adobe.com', url: '/members/adobe-portal' },
      ]),
    ));

    const session = { email: 'eve@unknown.com', groups: ['unknown.com'] };
    const resp = await handlePortalRedirect(session, request, env);

    expect(resp.status).toBe(302);
    expect(resp.headers.get('Location')).toBe('https://mysite.com/request-report?reason=unavailable');
  });

  it('offers a retry when mapping fetch returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response('Not Found', { status: 404 }),
    ));

    const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
    const resp = await handlePortalRedirect(session, request, env);

    expect(resp.status).toBe(302);
    expect(resp.headers.get('Location')).toBe('https://mysite.com/login?reason=lookup-unavailable');
  });

  it('offers a retry when mapping fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network error')));

    const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
    const resp = await handlePortalRedirect(session, request, env);

    expect(resp.status).toBe(302);
    expect(resp.headers.get('Location')).toBe('https://mysite.com/login?reason=lookup-unavailable');
  });

  it('handles whitespace in group values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      mappingResponse([
        { group: '  partner.com  ', url: '/members/partner-portal' },
      ]),
    ));

    const session = { email: 'bob@partner.com', groups: ['partner.com'] };
    const resp = await handlePortalRedirect(session, request, env);

    expect(resp.headers.get('Location')).toBe('https://mysite.com/members/partner-portal');
  });

  it('treats a missing data array as a lookup failure, not no report', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
    const resp = await handlePortalRedirect(session, request, env);

    expect(resp.status).toBe(302);
    expect(resp.headers.get('Location')).toBe('https://mysite.com/login?reason=lookup-unavailable');
  });

  it('offers report intake when session has no matching groups', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      mappingResponse([
        { group: 'adobe.com', url: '/members/adobe-portal' },
      ]),
    ));

    const session = { email: 'alice@adobe.com' };
    const resp = await handlePortalRedirect(session, request, env);

    expect(resp.status).toBe(302);
    expect(resp.headers.get('Location')).toBe('https://mysite.com/request-report?reason=unavailable');
  });

  it('uses the mapped report instead of an explicit homepage return', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      mappingResponse([{ group: 'customer.com', url: '/accounts/c/customer/' }]),
    ));
    const resp = await handlePortalRedirect(
      { email: 'alice@customer.com', groups: ['customer.com'] },
      new Request('https://mysite.com/auth/portal?redirect=%2F'),
      env,
    );
    expect(resp.headers.get('Location')).toBe('https://mysite.com/accounts/c/customer/');
  });

  it('does not navigate to an invalid mapped URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      mappingResponse([{ group: 'customer.com', url: '//other.example/report' }]),
    ));
    const session = { email: 'alice@customer.com', groups: ['customer.com'] };
    const resp = await handlePortalRedirect(session, request, env);
    expect(resp.headers.get('Location')).toBe('https://mysite.com/login?reason=lookup-unavailable');
  });

  it('honors a same-origin ?redirect= path over the CUG mapping', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
    const reqWithRedirect = new Request(
      'https://mysite.com/auth/portal?redirect=%2Faccounts%2F0-9%2F1-800-flowers%2Finsights%2F1800flowers-com%2F',
    );
    const resp = await handlePortalRedirect(session, reqWithRedirect, env);

    expect(resp.status).toBe(302);
    expect(resp.headers.get('Location')).toBe(
      'https://mysite.com/accounts/0-9/1-800-flowers/insights/1800flowers-com/',
    );
    // No need to fetch mapping when redirect is already provided.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores a malformed redirect param and falls back to mapping logic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      mappingResponse([{ group: 'adobe.com', url: '/members/adobe-portal' }]),
    ));

    const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
    const reqWithBadRedirect = new Request(
      'https://mysite.com/auth/portal?redirect=https%3A%2F%2Fevil.example.com%2Fphish',
    );
    const resp = await handlePortalRedirect(session, reqWithBadRedirect, env);

    expect(resp.status).toBe(302);
    expect(resp.headers.get('Location')).toBe('https://mysite.com/members/adobe-portal');
  });

  it('rejects protocol-relative redirect (//) and falls back to mapping', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      mappingResponse([{ group: 'adobe.com', url: '/members/adobe-portal' }]),
    ));

    const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
    const reqWithBadRedirect = new Request(
      'https://mysite.com/auth/portal?redirect=%2F%2Fevil.example.com%2Fphish',
    );
    const resp = await handlePortalRedirect(session, reqWithBadRedirect, env);

    expect(resp.headers.get('Location')).toBe('https://mysite.com/members/adobe-portal');
  });

  it('fetches the mapping from the origin hostname', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(
      mappingResponse([{ group: 'adobe.com', url: '/members/portal' }]),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
    await handlePortalRedirect(session, request, env);

    const fetchedUrl = new URL(fetchSpy.mock.calls[0][0]);
    expect(fetchedUrl.hostname).toBe(env.ORIGIN_HOSTNAME);
    expect(fetchedUrl.pathname).toBe('/closed-user-groups-mapping.json');
  });
});
