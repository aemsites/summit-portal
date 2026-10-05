/**
 * Portal redirect: routes an authenticated user to the page mapped to their
 * group in the /members/closed-user-groups-mapping spreadsheet.
 *
 * The mapping is fetched from the AEM origin as JSON:
 *   { "data": [{ "group": "<email-or-domain>", "url": "/path" }, ...] }
 *
 * The signed identity and explicit session groups match the "group" column.
 * The first match wins.
 */

import { matchesCugGroup } from './cug-group.js';

const MAPPING_PATH = '/closed-user-groups-mapping.json';
const NO_REPORT_PATH = '/request-report?reason=unavailable';
const LOOKUP_ERROR_PATH = '/login?reason=lookup-unavailable';
// Reject characters that could break out of the URL or smuggle CRLF.
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_RE = /[\u0000-\u001F\u007F\s\\]/;

/**
 * Validate a caller-supplied redirect path. Must be a same-origin path
 * (starts with '/' but not '//'). Returns the cleaned path+search or null.
 */
export function safeRedirectPath(raw) {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (UNSAFE_PATH_RE.test(raw)) return null;
  try {
    const parsed = new URL(raw, 'https://placeholder.invalid');
    if (parsed.origin !== 'https://placeholder.invalid') return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function redirect(request, path) {
  return Response.redirect(new URL(path, request.url).href, 302);
}

/**
 * Fetches the group-to-URL mapping from the origin and redirects the user
 * to the page that matches their group. No match offers report intake;
 * unavailable or invalid mappings offer a retry instead.
 */
export async function handlePortalRedirect(session, request, env) {
  const requestUrl = new URL(request.url);

  // Caller-supplied deep link wins over the group's default mapped URL,
  // so users dropped on /login?redirect=... land on the originally requested page.
  const redirectParam = safeRedirectPath(requestUrl.searchParams.get('redirect'));
  if (redirectParam && redirectParam !== '/') {
    return redirect(request, redirectParam);
  }

  const origin = new URL(request.url);
  origin.hostname = env.ORIGIN_HOSTNAME;
  origin.pathname = MAPPING_PATH;
  origin.search = '';

  let mapping;
  try {
    const headers = {};
    if (env.ORIGIN_AUTHENTICATION) {
      headers.authorization = `token ${env.ORIGIN_AUTHENTICATION}`;
    }
    const resp = await fetch(origin, { headers, signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      console.error('[portal] mapping fetch failed:', resp.status);
      return redirect(request, LOOKUP_ERROR_PATH);
    }
    mapping = await resp.json();
  } catch (error) {
    console.error('[portal] mapping fetch failed:', error.message);
    return redirect(request, LOOKUP_ERROR_PATH);
  }

  if (!Array.isArray(mapping?.data)) {
    console.error('[portal] mapping response has no data array');
    return redirect(request, LOOKUP_ERROR_PATH);
  }
  const entries = mapping.data;
  const userGroups = session.groups || [];

  const match = entries.find((entry) => matchesCugGroup(entry.group, session.email, userGroups));

  if (!match) return redirect(request, NO_REPORT_PATH);
  const target = safeRedirectPath(match.url);
  if (!target) {
    console.error('[portal] invalid mapped destination');
    return redirect(request, LOOKUP_ERROR_PATH);
  }
  return redirect(request, target);
}
