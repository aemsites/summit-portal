/**
 * Resolves the signed-in viewer's identity for telemetry.
 *
 * The auth worker exposes the current session at /auth/me, including how the
 * session was established (`method`) and whether that proves the viewer is the
 * named user (`verified`). We attach the email to analytics events ONLY when
 * verified === true — i.e. the viewer completed an interactive login (Adobe ID
 * or staff credentials).
 *
 * Magic links and staff share links are link-borne: anyone who receives the
 * link can open it, so the email identifies the intended recipient, not
 * necessarily the person viewing. For those we record the auth method but never
 * the email — matching the rule that "if they log in normally we know who
 * viewed; with magic links we can't".
 */

let cached;

/**
 * Fetch the viewer's identity once per page load. Returns:
 *   { email, method } when the session is a verified interactive login
 *   { email: null, method } for link-borne (magiclink/sharelink) sessions
 *   { email: null, method: null } when anonymous or /auth/me is unreachable
 * Never throws — telemetry must not break on an auth hiccup.
 */
export default function getViewerIdentity() {
  if (cached) return cached;
  cached = fetch('/auth/me', { credentials: 'same-origin' })
    .then((resp) => (resp.ok ? resp.json() : null))
    .then((data) => {
      if (!data?.authenticated) return { email: null, method: null };
      return {
        email: data.verified ? (data.email || null) : null,
        method: data.method || null,
      };
    })
    .catch(() => ({ email: null, method: null }));
  return cached;
}

/** Build the identity fields to merge into an event's metadata. */
export function viewerMetadata(identity) {
  if (!identity) return {};
  const meta = {};
  if (identity.method) meta.auth_method = identity.method;
  if (identity.email) meta.viewer_email = identity.email;
  return meta;
}
