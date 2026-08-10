/**
 * CUG (Closed User Group) access control.
 *
 * Reads x-aem-cug-required and x-aem-cug-groups headers from the origin
 * response and enforces authentication and email-domain-based authorization.
 *
 * Group matching uses the user's email domain (e.g., "adobe.com") against the
 * allowed domains for the path. Access is granted if the user's domain matches
 * at least one (OR logic).
 *
 * WHETHER a path is gated comes from x-aem-cug-required. WHICH domains are
 * allowed comes from the `closed-user-groups` sheet when it covers the path
 * (see cugsheet.js — the header's group list goes stale between manual
 * "Apply Page Access" runs), and from x-aem-cug-groups otherwise.
 *
 * x-aem-cug-login-path (an authorable redirect target for external
 * edge-worker consumers) is stripped like the other CUG headers but not read
 * here — this worker always redirects unauthenticated users to its own
 * fixed /login.
 */

import { cugSheetGroups } from './cugsheet.js';

// eslint-disable-next-line no-console
const log = (...args) => console.log('[cug]', ...args);

export async function checkCugAccess(originResponse, session, request, env) {
  const url = new URL(request.url);
  const cugRequired = originResponse.headers.get('x-aem-cug-required');
  const headerGroups = originResponse.headers.get('x-aem-cug-groups');

  log(`path=${url.pathname} cug-required=${cugRequired} cug-groups=${headerGroups}`);

  // No CUG protection on this path — serve publicly
  if (cugRequired !== 'true') {
    log(`path=${url.pathname} public, no CUG protection`);
    return stripCugHeaders(originResponse);
  }

  // CUG required but no session — redirect to login page, preserving the
  // requested URL so the magic-link / OAuth flow can return the user here.
  if (!session) {
    const loginUrl = new URL('/login', request.url);
    // Only preserve same-origin paths; never echo user-controlled origins.
    const original = `${url.pathname}${url.search}`;
    if (original && original.startsWith('/') && !original.startsWith('//')) {
      loginUrl.searchParams.set('redirect', original);
    }
    log(`path=${url.pathname} CUG required, no session — redirecting to ${loginUrl.pathname}${loginUrl.search}`);
    return Response.redirect(loginUrl.href, 302);
  }

  log(`path=${url.pathname} session email=***@${(session.email || '').split('@')[1]} groups=${JSON.stringify(session.groups)}`);

  // Which domains may see this page. The sheet is authoritative when it covers
  // the path — it is republished on every report, whereas the header's group
  // list only changes when someone runs the DA "Apply Page Access" tool. Any
  // sheet failure returns null and leaves the header in charge (fail closed).
  const sheetGroups = await cugSheetGroups(url.pathname, env);
  if (sheetGroups) {
    log(`path=${url.pathname} groups from sheet=${sheetGroups.join(',')} (header said ${headerGroups || '(none)'})`);
  }
  const cugGroups = sheetGroups ? sheetGroups.join(',') : headerGroups;

  // If specific domains are required, check the user's email domain
  if (cugGroups) {
    const allowedGroups = cugGroups.split(',').map((g) => g.trim().toLowerCase());
    const userGroups = session.groups || [];
    const hasAccess = allowedGroups.some((g) => userGroups.includes(g));

    log(`path=${url.pathname} allowed=${JSON.stringify(allowedGroups)} userGroups=${JSON.stringify(userGroups)} hasAccess=${hasAccess}`);

    if (!hasAccess) {
      log(`path=${url.pathname} access denied — redirecting to /403`);
      return Response.redirect(new URL('/403', request.url).href, 302);
    }
  }

  log(`path=${url.pathname} access granted`);
  const resp = stripCugHeaders(originResponse);
  resp.headers.set('Cache-Control', 'private, no-store');
  return resp;
}

/** Remove CUG headers before sending the response to the browser. */
function stripCugHeaders(response) {
  const resp = new Response(response.body, response);
  resp.headers.delete('x-aem-cug-required');
  resp.headers.delete('x-aem-cug-groups');
  resp.headers.delete('x-aem-cug-login-path');
  return resp;
}
