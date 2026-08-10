import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { checkCugAccess } from '../src/cug.js';
import { resetCugSheetCache } from '../src/cugsheet.js';
import { createMockEnv } from './helpers.js';

function originResponse(headers = {}) {
  return new Response('<html>page</html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html', ...headers },
  });
}

/** Stub the closed-user-groups sheet fetch that group resolution makes. */
function stubSheet(rows = []) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ total: rows.length, data: rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ));
}

describe('cug', () => {
  const env = createMockEnv();
  const request = new Request('https://mysite.com/members/page');

  beforeEach(() => {
    resetCugSheetCache();
    vi.unstubAllGlobals();
    // Default: the sheet covers nothing, so the origin headers decide.
    stubSheet();
  });

  describe('no CUG protection', () => {
    it('passes through when x-aem-cug-required is absent', async () => {
      const resp = await checkCugAccess(originResponse(), null, request, env);

      expect(resp.status).toBe(200);
      expect(resp.headers.get('x-aem-cug-required')).toBeNull();
    });

    it('passes through when x-aem-cug-required is false', async () => {
      const resp = await checkCugAccess(
        originResponse({ 'x-aem-cug-required': 'false' }),
        null, request, env,
      );

      expect(resp.status).toBe(200);
    });

    it('strips CUG headers from the response', async () => {
      const resp = await checkCugAccess(
        originResponse({
          'x-aem-cug-required': 'false',
          'x-aem-cug-groups': 'adobe.com',
          'x-aem-cug-login-path': '/custom-login',
        }),
        null, request, env,
      );

      expect(resp.headers.get('x-aem-cug-required')).toBeNull();
      expect(resp.headers.get('x-aem-cug-groups')).toBeNull();
      expect(resp.headers.get('x-aem-cug-login-path')).toBeNull();
    });
  });

  describe('CUG required, no session', () => {
    it('redirects to /login with the original path preserved as ?redirect=', async () => {
      const resp = await checkCugAccess(
        originResponse({ 'x-aem-cug-required': 'true' }),
        null, request, env,
      );

      expect(resp.status).toBe(302);
      const location = new URL(resp.headers.get('Location'));
      expect(location.origin).toBe('https://mysite.com');
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('redirect')).toBe('/members/page');
    });

    it('preserves query string in the redirect param', async () => {
      const reqWithSearch = new Request('https://mysite.com/members/page?utm=foo&id=42');
      const resp = await checkCugAccess(
        originResponse({ 'x-aem-cug-required': 'true' }),
        null, reqWithSearch, env,
      );

      const location = new URL(resp.headers.get('Location'));
      expect(location.searchParams.get('redirect')).toBe('/members/page?utm=foo&id=42');
    });
  });

  describe('CUG required, with session, no group restriction', () => {
    it('grants access to any authenticated user', async () => {
      const session = { email: 'alice@random.com', groups: ['random.com'] };
      const resp = await checkCugAccess(
        originResponse({ 'x-aem-cug-required': 'true' }),
        session, request, env,
      );

      expect(resp.status).toBe(200);
      const body = await resp.text();
      expect(body).toBe('<html>page</html>');
    });
  });

  describe('CUG required, with group restriction', () => {
    it('grants access when user domain matches an allowed group', async () => {
      const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
      const resp = await checkCugAccess(
        originResponse({
          'x-aem-cug-required': 'true',
          'x-aem-cug-groups': 'adobe.com,partner.com',
        }),
        session, request, env,
      );

      expect(resp.status).toBe(200);
    });

    it('redirects to /403 when user domain does not match any allowed group', async () => {
      const session = { email: 'eve@evil.com', groups: ['evil.com'] };
      const resp = await checkCugAccess(
        originResponse({
          'x-aem-cug-required': 'true',
          'x-aem-cug-groups': 'adobe.com,partner.com',
        }),
        session, request, env,
      );

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/403');
    });

    it('handles whitespace in comma-separated groups', async () => {
      const session = { email: 'bob@partner.com', groups: ['partner.com'] };
      const resp = await checkCugAccess(
        originResponse({
          'x-aem-cug-required': 'true',
          'x-aem-cug-groups': 'adobe.com , partner.com',
        }),
        session, request, env,
      );

      expect(resp.status).toBe(200);
    });

    it('strips CUG headers from the granted response', async () => {
      const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
      const resp = await checkCugAccess(
        originResponse({
          'x-aem-cug-required': 'true',
          'x-aem-cug-groups': 'adobe.com',
          'x-aem-cug-login-path': '/custom-login',
        }),
        session, request, env,
      );

      expect(resp.headers.get('x-aem-cug-required')).toBeNull();
      expect(resp.headers.get('x-aem-cug-groups')).toBeNull();
      expect(resp.headers.get('x-aem-cug-login-path')).toBeNull();
    });

    it('sets Cache-Control: private, no-store on granted responses', async () => {
      const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };
      const resp = await checkCugAccess(
        originResponse({
          'x-aem-cug-required': 'true',
          'x-aem-cug-groups': 'adobe.com',
        }),
        session, request, env,
      );

      expect(resp.headers.get('Cache-Control')).toBe('private, no-store');
    });
  });

  // The origin's group header is only as fresh as the last manual "Apply Page
  // Access" run, so a newly published account looks staff-only at the edge and
  // its own customer 403s. The sheet is republished with every report, so it
  // wins whenever it covers the path.
  describe('group source: sheet over header', () => {
    const accountRequest = new Request('https://mysite.com/accounts/f/freshpet/insights/x/');
    const staleHeaders = {
      'x-aem-cug-required': 'true',
      'x-aem-cug-groups': 'adobe.com, semrush.com',
    };

    it('grants the customer when the sheet allows their domain but the header does not', async () => {
      stubSheet([
        { url: '/accounts**', 'cug-groups': 'adobe.com, semrush.com' },
        { url: '/accounts/f/freshpet**', 'cug-groups': 'adobe.com, semrush.com, freshpet.com' },
      ]);
      const session = { email: 'buyer@freshpet.com', groups: ['freshpet.com'] };

      const resp = await checkCugAccess(originResponse(staleHeaders), session, accountRequest, env);

      expect(resp.status).toBe(200);
    });

    it('still denies a domain neither the sheet nor the header allows', async () => {
      stubSheet([
        { url: '/accounts/f/freshpet**', 'cug-groups': 'adobe.com, semrush.com, freshpet.com' },
      ]);
      const session = { email: 'eve@evil.com', groups: ['evil.com'] };

      const resp = await checkCugAccess(originResponse(staleHeaders), session, accountRequest, env);

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/403');
    });

    it('narrows to the sheet when the sheet is stricter than the header', async () => {
      stubSheet([{ url: '/accounts/f/freshpet**', 'cug-groups': 'freshpet.com' }]);
      const session = { email: 'rachel@semrush.com', groups: ['semrush.com'] };

      const resp = await checkCugAccess(originResponse(staleHeaders), session, accountRequest, env);

      expect(resp.status).toBe(302);
      expect(resp.headers.get('Location')).toBe('https://mysite.com/403');
    });

    it('falls back to the header when the sheet is unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('origin down')));
      const session = { email: 'alice@adobe.com', groups: ['adobe.com'] };

      const resp = await checkCugAccess(originResponse(staleHeaders), session, accountRequest, env);

      expect(resp.status).toBe(200);
    });

    it('never gates a page the origin says is public, whatever the sheet says', async () => {
      stubSheet([{ url: '/accounts**', 'cug-groups': 'adobe.com' }]);

      const resp = await checkCugAccess(originResponse(), null, accountRequest, env);

      expect(resp.status).toBe(200);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
