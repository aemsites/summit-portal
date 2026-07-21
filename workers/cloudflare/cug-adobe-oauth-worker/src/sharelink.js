import {
  getSession, createShareLinkToken, staffDomains, validateImsStaffToken,
} from './session.js';
import {
  safeRedirectPath, appendTokenParam, fetchCugMapping, fetchLiveCugGroups, EMAIL_RE, jsonResponse,
  templateForOrg,
} from './magiclink.js';
import { sendShareLinkConfirm, sendMagicLinkInternalNotify } from './notification.js';

// eslint-disable-next-line no-console
const log = (...args) => console.log('[sharelink]', ...args);
// eslint-disable-next-line no-console
const logError = (...args) => console.error('[sharelink]', ...args);

/** Normalise a CUG mapping `url` to a comparable path (strip trailing '*' and '/'). */
function normalisePath(value) {
  if (typeof value !== 'string') return null;
  return value.replace(/\*+$/, '').replace(/\/+$/, '');
}

/**
 * Does a CUG mapping entry cover the target page? Mapping `url` values are CUG
 * scope prefixes (often authored with a trailing wildcard, e.g.
 * `/accounts/a/apple/*`), while the shared page is a deeper path
 * (`/accounts/a/apple/insights/.../index`). An entry covers the page when the
 * page path equals the scope or sits under it — matching how AEM CUG wildcard
 * scopes actually gate pages (prefix, not exact equality).
 */
function scopeCoversPath(scope, targetPath) {
  const base = normalisePath(scope);
  if (!base || !targetPath) return false;
  return targetPath === base || targetPath.startsWith(`${base}/`);
}

/**
 * Handle a staff "share this page" request.
 *
 * POST /auth/sharelink  { email, path, mode }
 *
 * Unlike the self-service magic link, this is an AUTHENTICATED staff action.
 * It is gated by:
 *   1. a valid staff session (auth_token cookie) or a validated IMS bearer
 *   2. the caller's email domain is in STAFF_DOMAINS
 *   3. (only when a recipient email is given) that email's domain is allowed
 *      by the target page's CUG
 *
 * Three shapes of request, by `mode` and whether `email` is given:
 *   - `mode: 'email'` (the default) ALWAYS requires a real recipient address:
 *     the link is emailed to it, and the grant is scoped to just that
 *     recipient's domain.
 *   - `mode: 'copy'` WITH an email (e.g. the Experience Workspace magic-link
 *     tool, which always supplies one) mints a link with NO email sent, but
 *     scopes the grant to exactly that recipient's domain — same scoping as
 *     the email path, just skipping the send.
 *   - `mode: 'copy'` with NO email (the dashboard's one-click "Copy link",
 *     which has no single recipient to name) grants every non-staff
 *     (customer) domain the page's CUG allows — never wider than what the
 *     page already permits, and never a staff domain.
 */
export async function handleShareLinkRequest(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // --- Gate 1: authenticated staff (session cookie OR a validated IMS token) ---
  // The Experience Workspace plugin runs cross-origin and can't send the
  // act.aem.now cookie, so it authorizes with the DA IMS token it already holds
  // (validated against IMS in validateImsStaffToken).
  const session = await getSession(request, env);
  let callerEmail = session?.email || null;
  if (!callerEmail) {
    const authHeader = request.headers.get('Authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (bearer) callerEmail = await validateImsStaffToken(bearer, env);
  }
  if (!callerEmail) {
    log('rejected: no session and no valid IMS token');
    return jsonResponse({ error: 'Authentication required' }, 401);
  }

  // --- Gate 2: caller must be internal staff ---
  const callerDomain = (callerEmail.split('@')[1] || '').toLowerCase();
  if (!staffDomains(env).has(callerDomain)) {
    log(`rejected: caller domain=${callerDomain} is not staff`);
    return jsonResponse({ error: 'Not authorized to share links' }, 403);
  }

  let email;
  let pathRaw;
  let copyOnly;
  try {
    const body = await request.json();
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    pathRaw = typeof body.path === 'string' ? body.path : '';
    // `mode: 'copy'` mints a link for the staff caller to copy and deliver
    // themselves — NO email is sent. A recipient email is only required in
    // `mode: 'email'` (the default), where it's where the link actually goes;
    // in copy mode it's optional (see grant logic below) but still validated
    // when a caller does supply one (e.g. the EW magic-link tool).
    copyOnly = body.mode === 'copy';
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!copyOnly && !email) {
    return jsonResponse({ error: 'A recipient (customer) email is required' }, 400);
  }
  if (email && !EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'Invalid recipient email' }, 400);
  }

  const path = safeRedirectPath(pathRaw);
  if (!path) {
    return jsonResponse({ error: 'Invalid page path' }, 400);
  }

  const recipientDomain = email ? email.split('@')[1] : null;
  const targetPath = normalisePath(path);
  log(`staff=***@${callerDomain} sharing path=${targetPath}${recipientDomain ? ` with domain=${recipientDomain}` : ' (copy mode, no recipient)'}`);

  // --- Resolve the target page's CUG mapping ---
  const { entries, error: mappingError } = await fetchCugMapping(env);
  if (mappingError) {
    logError(`mapping fetch failed: ${mappingError}`);
    return jsonResponse({ error: 'Failed to load page access mapping' }, 502);
  }

  // A page may have several mapping entries (one per allowed domain) sharing the
  // same scope. Find every entry whose scope COVERS the page, then keep only the
  // most-specific (longest) scope so a broad parent scope can't widen access.
  const covering = entries.filter((e) => scopeCoversPath(e.url, targetPath));
  if (covering.length === 0) {
    log(`no CUG entry covers path=${targetPath}`);
    return jsonResponse({ error: 'Page not found or not access-controlled' }, 404);
  }
  const longestScope = covering.reduce(
    (max, e) => Math.max(max, normalisePath(e.url).length),
    0,
  );
  const pageEntries = covering.filter((e) => normalisePath(e.url).length === longestScope);

  const allowedDomains = pageEntries
    .map((e) => (e.group || '').trim().toLowerCase())
    .filter(Boolean);

  // Cross-check against the page's REAL, live CUG groups rather than trusting
  // the mapping sheet blindly — it can drift out of sync with what actually
  // gates the page (see fetchLiveCugGroups doc). When the live check succeeds
  // and the page is actually CUG-required, it wins; the mapping is only used
  // as a fallback when the live check itself is unavailable, so a transient
  // origin hiccup can't block minting outright.
  const live = await fetchLiveCugGroups(path, env);
  const domainsForGrant = (live && live.required && live.groups.length)
    ? live.groups
    : allowedDomains;
  if (live && live.required && live.groups.length) {
    log(`live CUG groups=${live.groups.join(',')} (mapping said ${allowedDomains.join(',') || '(none)'})`);
  } else {
    log('live CUG check unavailable or inconclusive — falling back to mapping data');
  }

  let grantGroups;
  let tokenEmail;
  if (copyOnly && !email) {
    // No recipient was named (the dashboard's zero-friction "Copy link"), so
    // there's no single domain to scope to — grant every non-staff (customer)
    // domain the page's CUG allows. Never wider than what the page already
    // permits, and staff domains (which also gate every account page) are
    // always excluded so a copied link can't become staff-wide access.
    grantGroups = domainsForGrant.filter((d) => !staffDomains(env).has(d));
    if (grantGroups.length === 0) {
      log('rejected: page has no non-staff (customer) group to share');
      return jsonResponse({ error: 'Page has no customer group to share' }, 400);
    }
    // createShareLinkToken/verifyShareLink require an `email` claim, and its
    // domain gets merged into the visitor's session groups on redemption — so
    // it must resolve to a domain already in grantGroups (never a staff one).
    // Pick deterministically so the same request always mints the same shape.
    tokenEmail = `share-link@${[...grantGroups].sort()[0]}`;
  } else {
    // A recipient WAS named — either `mode: 'email'`, or `mode: 'copy'` from a
    // caller that still supplies one (e.g. the EW magic-link tool). Either way,
    // grant ONLY that recipient's own group — never every group on the page.
    // Every account row also lists the blanket staff domains (adobe.com,
    // semrush.com), so baking all page groups would let any single link open
    // EVERY account page. The recipient's domain must therefore be one of the
    // page's allowed groups, and must not itself be a staff domain (a customer
    // link never grants staff access). This scopes the link to exactly the
    // customer's account.
    if (staffDomains(env).has(recipientDomain)) {
      log(`rejected: recipient domain=${recipientDomain} is a staff domain`);
      return jsonResponse({ error: 'Share links must be issued to a customer address, not a staff domain' }, 400);
    }
    grantGroups = domainsForGrant.filter((d) => d === recipientDomain);
    if (grantGroups.length === 0) {
      log(`rejected: recipient domain=${recipientDomain} not permitted for this page`);
      return jsonResponse({ error: 'Recipient domain is not authorized for this page' }, 403);
    }
    tokenEmail = email;
  }

  // --- Mint a long-lived (7-day) signed share token ---
  let token;
  try {
    token = await createShareLinkToken(tokenEmail, env, grantGroups);
    log(`share link token created (grants: ${grantGroups.join(',') || '(none)'})`);
  } catch (err) {
    logError(`createShareLinkToken failed: ${err.message}`);
    return jsonResponse({ error: 'Failed to create share link token' }, 500);
  }

  const shareLinkUrl = `${new URL(request.url).origin}${appendTokenParam(path, token)}`;

  // Copy mode: return the link for the staff caller to deliver themselves. No
  // email is sent (neither the recipient confirm nor the internal notify), so
  // there's no dependency on a recipient's mail gateway accepting APO mail.
  if (copyOnly) {
    log(`copy-mode link minted for staff=***@${callerDomain} (no email sent)`);
    return jsonResponse({ result: 'link', link: shareLinkUrl });
  }

  // Choose the email template from the PAGE's org (Semrush vs Adobe). The
  // recipient may be any domain, so org comes from the page entry, not the
  // recipient. Prefer an entry that names an org; fall back to the first.
  const matchedEntry = pageEntries.find((e) => (e.org || '').trim()) || pageEntries[0];
  const org = (matchedEntry.org || '').trim();
  // INTERIM: the dedicated `expdev_actnow_sharelink` APO template isn't
  // provisioned in Postoffice yet (sends 404 → 502). Reuse the live
  // `expdev_actnow_magiclink` template, which takes the same `magic_link` data
  // key. Switch back to templateForOrg('sharelink', org) once the email team
  // creates the sharelink template. See PR notes.
  const templateName = templateForOrg('magiclink', org);
  log(`sending share link to domain=${recipientDomain} template=${templateName} (interim: magiclink template)`);

  try {
    await sendShareLinkConfirm(email, shareLinkUrl, env, templateName);
    log('share link email dispatched successfully');
  } catch (err) {
    logError(`sendShareLinkConfirm failed: ${err.message}`);
    return jsonResponse({ error: 'Failed to send share link email' }, 502);
  }

  // Internal notify is best-effort — never fail the request on it.
  const notifyOrg = org || 'Adobe';
  try {
    await sendMagicLinkInternalNotify(email, recipientDomain, notifyOrg, env);
    log('internal notification dispatched');
  } catch (err) {
    logError(`sendMagicLinkInternalNotify failed: ${err.message}`);
  }

  // Return the link itself so the (already-authenticated staff) caller can copy
  // it and deliver it by another channel — useful when the recipient's mail
  // gateway quarantines the APO email. This is not a secret leak: the caller
  // passed both the recipient email and the page, the endpoint is staff-gated
  // (Gates 1+2 above), and the same token was just emailed to that recipient.
  return jsonResponse({ result: 'sent', link: shareLinkUrl });
}
