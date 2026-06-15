'use strict';

/**
 * Cloudflare Worker entry point for AEM Edge Delivery with CUG authentication.
 *
 * Routes:
 *   /auth/callback     — OAuth callback (exchanges code for tokens, creates session)
 *   /auth/logout       — Destroys session and logs out of Adobe IMS
 *   /auth/portal       — Redirects authenticated user based on group mapping
 *   /auth/me           — Returns current user info as JSON (email, name, groups)
 *   /auth/magiclink    — POST email, check CUG mapping, send signed magic link
 *   RUM / media        — Passed through to origin without auth
 *   Everything else    — Proxied to origin, then CUG headers are checked
 */

import { redirectToLogin, handleCallback } from './oauth.js';
import {
  createSession, getSession, sessionCookie, clearSessionCookie, verifyMagicLink, verifyShareLink,
} from './session.js';
import { checkCugAccess } from './cug.js';
import { handlePortalRedirect } from './portal.js';
import { handleMagicLinkRequest } from './magiclink.js';
import { handleShareLinkRequest } from './sharelink.js';

const getExtension = (path) => {
  const basename = path.split('/').pop();
  const pos = basename.lastIndexOf('.');
  return (basename === '' || pos < 1) ? '' : basename.slice(pos + 1);
};

const isMediaRequest = (url) => /\/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\.[0-9a-z]+$/.test(url.pathname);
const isRUMRequest = (url) => /\/\.(rum|optel)\/.*/.test(url.pathname);

/**
 * Rewrites the request to the AEM Edge Delivery origin and fetches the response.
 * Sanitizes query params per resource type and enables Cloudflare edge caching.
 */
async function proxyToOrigin(request, env, url) {
  const extension = getExtension(url.pathname);
  const savedSearch = url.search;
  const { searchParams } = url;

  // Only allow known query params per resource type to prevent cache pollution
  if (isMediaRequest(url)) {
    for (const [key] of searchParams.entries()) {
      if (!['format', 'height', 'optimize', 'width'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else if (extension === 'json') {
    for (const [key] of searchParams.entries()) {
      if (!['limit', 'offset', 'sheet'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else {
    url.search = '';
  }
  searchParams.sort();

  url.hostname = env.ORIGIN_HOSTNAME;
  const req = new Request(url, request);
  req.headers.set('x-forwarded-host', req.headers.get('host'));
  req.headers.set('x-byo-cdn-type', 'cloudflare');
  if (env.PUSH_INVALIDATION !== 'disabled') {
    req.headers.set('x-push-invalidation', 'enabled');
  }
  if (env.ORIGIN_AUTHENTICATION) {
    req.headers.set('authorization', `token ${env.ORIGIN_AUTHENTICATION}`);
  }

  let resp = await fetch(req, {
    method: req.method,
    cf: { cacheEverything: true },
  });
  resp = new Response(resp.body, resp);

  // Preserve query string on redirects
  if (resp.status === 301 && savedSearch) {
    const location = resp.headers.get('location');
    if (location && !location.match(/\?.*$/)) {
      resp.headers.set('location', `${location}${savedSearch}`);
    }
  }
  if (resp.status === 304) {
    resp.headers.delete('Content-Security-Policy');
  }
  resp.headers.delete('age');
  resp.headers.delete('x-robots-tag');
  return resp;
}

const handleRequest = async (request, env) => {
  const url = new URL(request.url);

  // Strip non-standard ports
  // if (url.port) {
  //   const redirectTo = new URL(request.url);
  //   redirectTo.port = '';
  //   return new Response('Moved permanently to ' + redirectTo.href, {
  //     status: 301,
  //     headers: { location: redirectTo.href },
  //   });
  // }

  if (url.pathname.startsWith('/drafts/')) {
    return new Response('Not Found', { status: 404 });
  }

  if (isRUMRequest(url)) {
    if (!['GET', 'POST', 'OPTIONS'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405 });
    }
  }

  // --- Auth routes ---

  // Magic link request: POST email, check CUG domain, send signed link
  if (url.pathname === '/auth/magiclink') {
    return handleMagicLinkRequest(request, env);
  }

  // Share link request: authenticated staff POST {email, path} to send a
  // longer-lived deep link for a specific page to a customer.
  if (url.pathname === '/auth/sharelink') {
    return handleShareLinkRequest(request, env);
  }

  // OAuth callback: exchange authorization code for tokens, create session
  if (url.pathname === '/auth/callback') {
    const result = await handleCallback(request, env);
    if (result instanceof Response) return result;

    const token = await createSession(env, result.userInfo);
    return new Response(null, {
      status: 302,
      headers: {
        Location: result.originalUrl,
        'Set-Cookie': sessionCookie(token),
      },
    });
  }

  // Logout: clear session cookie and redirect to IMS logout
  if (url.pathname === '/auth/logout') {
    const imsLogoutUrl = `${env.OAUTH_LOGOUT_URL}?client_id=${env.OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(url.origin + '/')}`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: imsLogoutUrl,
        'Set-Cookie': clearSessionCookie(),
      },
    });
  }

  // Portal redirect: authenticate then redirect based on group mapping
  if (url.pathname === '/auth/portal') {
    const session = await getSession(request, env);
    if (!session) {
      return redirectToLogin(request.url, env);
    }
    return handlePortalRedirect(session, request, env);
  }

  // User info: return authenticated user's identity as JSON
  if (url.pathname === '/auth/me') {
    const session = await getSession(request, env);
    if (!session) {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      authenticated: true,
      email: session.email,
      name: session.name,
      groups: session.groups,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  // RUM and media requests bypass authentication
  if (isRUMRequest(url) || isMediaRequest(url)) {
    return proxyToOrigin(request, env, url);
  }

  // Magic link: ?token= creates or replaces the session without an IMS round-trip
  const magicToken = url.searchParams.get('token');
  if (magicToken) {
    // eslint-disable-next-line no-console
    console.log(`[magiclink] token present on ${url.pathname}`);
    // Accept both the 30-min self-service magic link and the 7-day staff share
    // link — either one mints a fresh 1-hour session for the deep link.
    const claims = (await verifyMagicLink(magicToken, env))
      || (await verifyShareLink(magicToken, env));
    if (!claims) {
      // eslint-disable-next-line no-console
      console.warn(`[magiclink] token verification failed for path=${url.pathname}`);
      return Response.redirect(new URL('/expired', request.url).href, 302);
    }

    const email = claims.email.toLowerCase();
    const domain = email.split('@')[1];
    // eslint-disable-next-line no-console
    console.log(`[magiclink] token valid email=***@${domain} iat=${claims.iat}`);

    if (!domain) {
      // eslint-disable-next-line no-console
      console.error('[magiclink] token missing domain in email claim');
      return new Response('Invalid token', { status: 400 });
    }
    const newToken = await createSession(env, { email, name: claims.name || email, groups: [domain] });

    const cleanUrl = new URL(url.href);
    cleanUrl.searchParams.delete('token');
    // eslint-disable-next-line no-console
    console.log(`[magiclink] session created, redirecting to ${cleanUrl.pathname}`);

    return new Response(null, {
      status: 302,
      headers: {
        Location: cleanUrl.href,
        'Set-Cookie': sessionCookie(newToken),
      },
    });
  }

  // All other requests: fetch from origin, then enforce CUG access control
  const session = await getSession(request, env);
  const originResponse = await proxyToOrigin(request, env, url);

  return checkCugAccess(originResponse, session, request, env);
};

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Unhandled worker error:', err.stack || err);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
