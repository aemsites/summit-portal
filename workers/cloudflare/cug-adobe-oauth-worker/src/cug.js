/**
 * CUG (Closed User Group) access control.
 *
 * Reads x-aem-cug-required and x-aem-cug-groups headers from the origin
 * response and enforces authentication and email-domain-based authorization.
 *
 * Group matching uses the user's email domain (e.g., "adobe.com") against
 * the comma-separated domains in x-aem-cug-groups. Access is granted if the
 * user's domain matches at least one (OR logic).
 */

import { redirectToLogin } from './oauth.js';

// eslint-disable-next-line no-console
const log = (...args) => console.log('[cug]', ...args);

export async function checkCugAccess(originResponse, session, request, env) {
  const url = new URL(request.url);
  const cugRequired = originResponse.headers.get('x-aem-cug-required');
  const cugGroups = originResponse.headers.get('x-aem-cug-groups');

  log(`path=${url.pathname} cug-required=${cugRequired} cug-groups=${cugGroups}`);

  // No CUG protection on this path — serve publicly
  if (cugRequired !== 'true') {
    log(`path=${url.pathname} public, no CUG protection`);
    return stripCugHeaders(originResponse);
  }

  // CUG required but no session — redirect to login
  if (!session) {
    log(`path=${url.pathname} CUG required, no session — redirecting to login`);
    return redirectToLogin(request.url, env);
  }

  log(`path=${url.pathname} session email=***@${(session.email || '').split('@')[1]} groups=${JSON.stringify(session.groups)}`);

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
  return resp;
}
