/**
 * Resolves the signed-in viewer's auth method for telemetry.
 *
 * The auth worker exposes the current session at /auth/me, including how the
 * session was established (`method`). We record only the method (e.g. `oauth`,
 * `staff`, `magiclink`, `sharelink`) — never the viewer's email. Simple
 * Analytics is used without a consent banner on the premise that events stay
 * anonymous; attaching an email address would identify a named individual and
 * require consent we don't collect.
 */

let cached;

/**
 * Fetch the viewer's identity once per page load. Returns:
 *   { method } when a session exists
 *   { method: null } when anonymous or /auth/me is unreachable
 * Never throws — telemetry must not break on an auth hiccup.
 */
export default function getViewerIdentity() {
  if (cached) return cached;
  cached = fetch('/auth/me', { credentials: 'same-origin' })
    .then((resp) => (resp.ok ? resp.json() : null))
    .then((data) => {
      if (!data?.authenticated) return { method: null };
      return { method: data.method || null };
    })
    .catch(() => ({ method: null }));
  return cached;
}

/** Build the identity fields to merge into an event's metadata. */
export function viewerMetadata(identity) {
  if (!identity) return {};
  const meta = {};
  if (identity.method) meta.auth_method = identity.method;
  return meta;
}
