/**
 * Portal redirect: routes an authenticated user to the page mapped to their
 * group in the /members/closed-user-groups-mapping spreadsheet.
 *
 * The mapping is fetched from the AEM origin as JSON:
 *   { "data": [{ "group": "<domain>", "url": "/path" }, ...] }
 *
 * The user's groups (derived from their email domain during login) are matched
 * against the "group" column. The first match wins.
 */

const MAPPING_PATH = '/closed-user-groups-mapping.json';
const FALLBACK_PATH = '/';
// Reject characters that could break out of the URL or smuggle CRLF.
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_RE = /[\u0000-\u001F\u007F\s\\]/;

/**
 * Validate a caller-supplied redirect path. Must be a same-origin path
 * (starts with '/' but not '//'). Returns the cleaned path+search or null.
 */
function safeRedirectPath(raw) {
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
 * to the page that matches their group. Falls back to / when the
 * mapping is unavailable or no group matches.
 */
export async function handlePortalRedirect(session, request, env) {
  const requestUrl = new URL(request.url);

  // Caller-supplied deep link wins over the group's default mapped URL,
  // so users dropped on /login?redirect=... land on the originally requested page.
  const redirectParam = safeRedirectPath(requestUrl.searchParams.get('redirect'));
  if (redirectParam) {
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
    const resp = await fetch(origin, { headers });
    if (!resp.ok) {
      return redirect(request, FALLBACK_PATH);
    }
    mapping = await resp.json();
  } catch {
    return redirect(request, FALLBACK_PATH);
  }

  const entries = Array.isArray(mapping.data) ? mapping.data : [];
  const userGroups = session.groups || [];

  const match = entries.find((entry) => {
    const group = (entry.group || '').trim();
    return userGroups.includes(group);
  });

  return redirect(request, match ? match.url : FALLBACK_PATH);
}
