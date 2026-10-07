import { getSession, createShareLinkToken, staffDomains, validateImsStaffToken, hasBoothBoundary } from './session.js';
import {
  safeRedirectPath, appendTokenParam, fetchCugMapping, fetchLiveCugGroups, EMAIL_RE, jsonResponse,
  templateForOrg,
} from './magiclink.js';
import { sendShareLinkConfirm, sendMagicLinkInternalNotify } from './notification.js';
import { cugSheetGroups } from './cugsheet.js';
import { matchesCugGroup } from './cug-group.js';

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

async function dispatchReportEmail(email, shareLinkUrl, org, env) {
  const recipientDomain = email.split('@')[1];
  // The dedicated sharelink template is not yet provisioned; preserve the
  // existing magiclink template and 30-day share grant.
  const templateName = templateForOrg('magiclink', org);
  log(`sending share link to domain=${recipientDomain} template=${templateName} (interim: magiclink template)`);
  try {
    await sendShareLinkConfirm(email, shareLinkUrl, env, templateName);
    log('share link email dispatched successfully');
  } catch (err) {
    logError(`sendShareLinkConfirm failed: ${err.message}`);
    return jsonResponse({ error: 'Failed to send share link email' }, 502);
  }
  try {
    await sendMagicLinkInternalNotify(email, recipientDomain, org || 'Adobe', env);
    log('internal notification dispatched');
  } catch (err) {
    logError(`sendMagicLinkInternalNotify failed: ${err.message}`);
  }
  return jsonResponse({ result: 'sent', link: shareLinkUrl });
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
 *   3. (only when a recipient email is given) that exact email or its domain is allowed
 *      by the target page's CUG
 *
 * Three shapes of request, by `mode` and whether `email` is given:
 *   - `mode: 'email'` (the default) ALWAYS requires a real recipient address:
 *     the link is emailed to it, and the grant is scoped to just that
 *     recipient's authored email/domain groups.
 *   - `mode: 'copy'` WITH an email (e.g. the Experience Workspace magic-link
 *     tool, which always supplies one) mints a link with NO email sent, but
 *     scopes the grant to that recipient's matching groups — same scoping as
 *     the email path, just skipping the send.
 *   - `mode: 'copy'` with NO email (the dashboard's one-click "Copy link",
 *     which has no single recipient to name) grants every non-staff
 *     customer group the page's CUG allows — never wider than what the
 *     page already permits, and never a staff domain or staff email.
 */
export async function handleShareLinkRequest(request, env) {
  if (hasBoothBoundary(request)) return jsonResponse({ error: 'Booth browsers cannot share arbitrary reports' }, 403);
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

  // Which domains the page really allows, best source first. The mapping sheet
  // can drift from what actually gates the page (seen in production: mapping
  // said `hsbc.co.uk`, the live group was `hsbc.com`), so it is the last resort.
  //
  //   1. the `closed-user-groups` SHEET — what the page is authored to allow,
  //      republished on every report, so a new account is never missing
  //   2. the live `x-aem-cug-groups` HEADER — the same data as (1), but only as
  //      fresh as the last manual "Apply Page Access" run
  //   3. the mapping sheet — only when neither of the above is available
  //
  // A grant must match what `checkCugAccess` will enforce when the link is
  // redeemed; both now read the sheet first, so the two stay in step.
  const sheetGroups = await cugSheetGroups(path, env);
  const live = sheetGroups ? null : await fetchLiveCugGroups(path, env);
  const liveGroups = (live && live.required && live.groups.length) ? live.groups : null;
  const domainsForGrant = sheetGroups || liveGroups || allowedDomains;
  if (sheetGroups) {
    log(`CUG groups from sheet count=${sheetGroups.length} mapping count=${allowedDomains.length}`);
  } else if (liveGroups) {
    log(`CUG groups from live header count=${liveGroups.length} mapping count=${allowedDomains.length}`);
  } else {
    log('sheet and live CUG check unavailable or inconclusive — falling back to mapping data');
  }

  let grantGroups;
  let tokenEmail;
  if (copyOnly && !email) {
    // Exclude both staff domains and exact staff addresses from copied grants.
    grantGroups = domainsForGrant.filter((group) => !staffDomains(env).has(group.split('@').pop()));
    if (grantGroups.length === 0) {
      log('rejected: page has no non-staff (customer) group to share');
      return jsonResponse({ error: 'Page has no customer group to share' }, 400);
    }
    // An exact group is already an email, not a domain for a synthetic address.
    const firstGroup = [...grantGroups].sort()[0];
    tokenEmail = firstGroup.includes('@') ? firstGroup : `share-link@${firstGroup}`;
  } else {
    // A recipient WAS named — either `mode: 'email'`, or `mode: 'copy'` from a
    // caller that still supplies one (e.g. the EW magic-link tool). Either way,
    // grant ONLY that recipient's own group — never every group on the page.
    // Never turn an exact address into a whole-domain grant or inherit staff
    // groups. Only groups already authored for this recipient can be shared.
    if (staffDomains(env).has(recipientDomain)) {
      log(`rejected: recipient domain=${recipientDomain} is a staff domain`);
      return jsonResponse({ error: 'Share links must be issued to a customer address, not a staff domain' }, 400);
    }
    grantGroups = domainsForGrant.filter((group) => matchesCugGroup(group, email));
    if (grantGroups.length === 0) {
      log(`rejected: recipient domain=${recipientDomain} not permitted for this page`);
      return jsonResponse({ error: 'Recipient email or domain is not authorized for this page' }, 403);
    }
    tokenEmail = email;
  }

  // --- Mint a long-lived (30-day) signed share token ---
  let token;
  try {
    token = await createShareLinkToken(tokenEmail, env, grantGroups);
    log(`share link token created (grant count=${grantGroups.length})`);
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
  return dispatchReportEmail(email, shareLinkUrl, org, env);
}

/** Server-only dispatch. The coordinator supplies freshly authorized, context-bound values. */
export async function sendAuthorizedBoothReport(email, path, origin, grantGroups, org, env) {
  if (!EMAIL_RE.test(email) || !safeRedirectPath(path) || !grantGroups?.length
    || staffDomains(env).has(email.split('@')[1])
    || !grantGroups.every((group) => matchesCugGroup(group, email))) {
    return jsonResponse({ error: 'Report recipient is not authorized' }, 403);
  }
  const token = await createShareLinkToken(email, env, grantGroups);
  const link = `${origin}${appendTokenParam(path, token)}`;
  return dispatchReportEmail(email, link, org, env);
}
