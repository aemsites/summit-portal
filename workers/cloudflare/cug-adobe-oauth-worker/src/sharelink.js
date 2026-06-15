import { getSession, createShareLinkToken } from './session.js';
import {
  safeRedirectPath, appendTokenParam, fetchCugMapping, EMAIL_RE, jsonResponse, templateForOrg,
} from './magiclink.js';
import { sendShareLinkConfirm, sendMagicLinkInternalNotify } from './notification.js';

const DEFAULT_STAFF_DOMAINS = 'adobe.com,semrush.com';

// eslint-disable-next-line no-console
const log = (...args) => console.log('[sharelink]', ...args);
// eslint-disable-next-line no-console
const logError = (...args) => console.error('[sharelink]', ...args);

/** Parse the comma-separated STAFF_DOMAINS env var into a lowercase set. */
function staffDomains(env) {
  const raw = (env.STAFF_DOMAINS || DEFAULT_STAFF_DOMAINS);
  return new Set(raw.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean));
}

/** Normalise a CUG mapping `url` to a comparable path (strip trailing '*' and '/'). */
function normalisePath(value) {
  if (typeof value !== 'string') return null;
  return value.replace(/\*+$/, '').replace(/\/+$/, '');
}

/**
 * Handle a staff "share this page" request.
 *
 * POST /auth/sharelink  { email, path }
 *
 * Unlike the self-service magic link, this is an AUTHENTICATED staff action that
 * sends a link to an arbitrary recipient for a specific page. It is gated by
 * three independent checks to prevent it becoming an open email relay:
 *   1. a valid staff session (auth_token cookie)
 *   2. the caller's email domain is in STAFF_DOMAINS
 *   3. the recipient's email domain is allowed by the target page's CUG
 */
export async function handleShareLinkRequest(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // --- Gate 1: authenticated staff session ---
  const session = await getSession(request, env);
  if (!session || !session.email) {
    log('rejected: no session');
    return jsonResponse({ error: 'Authentication required' }, 401);
  }

  // --- Gate 2: caller must be internal staff ---
  const callerDomain = (session.email.split('@')[1] || '').toLowerCase();
  if (!staffDomains(env).has(callerDomain)) {
    log(`rejected: caller domain=${callerDomain} is not staff`);
    return jsonResponse({ error: 'Not authorized to share links' }, 403);
  }

  let email;
  let pathRaw;
  try {
    const body = await request.json();
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    pathRaw = typeof body.path === 'string' ? body.path : '';
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'Invalid email address' }, 400);
  }

  const path = safeRedirectPath(pathRaw);
  if (!path) {
    return jsonResponse({ error: 'Invalid page path' }, 400);
  }

  const recipientDomain = email.split('@')[1];
  const targetPath = normalisePath(path);
  log(`staff=***@${callerDomain} sharing path=${targetPath} with domain=${recipientDomain}`);

  // --- Resolve the target page's CUG mapping ---
  const { entries, error: mappingError } = await fetchCugMapping(env);
  if (mappingError) {
    logError(`mapping fetch failed: ${mappingError}`);
    return jsonResponse({ error: 'Failed to load page access mapping' }, 502);
  }

  // A page may have several mapping entries (one per allowed domain), all sharing
  // the same `url`. Collect every entry whose url matches the requested path.
  const pageEntries = entries.filter((e) => normalisePath(e.url) === targetPath);
  if (pageEntries.length === 0) {
    log(`no CUG entry for path=${targetPath}`);
    return jsonResponse({ error: 'Page not found or not access-controlled' }, 404);
  }

  const allowedDomains = pageEntries
    .map((e) => (e.group || '').trim().toLowerCase())
    .filter(Boolean);

  // --- Gate 3: recipient must be authorized for THIS page ---
  if (!allowedDomains.includes(recipientDomain)) {
    log(`rejected: recipient domain=${recipientDomain} not in page CUG ${JSON.stringify(allowedDomains)}`);
    return jsonResponse({ result: 'forbidden', allowedDomains }, 403);
  }

  // --- Mint a long-lived (7-day) signed share token ---
  let token;
  try {
    token = await createShareLinkToken(email, env);
    log('share link token created');
  } catch (err) {
    logError(`createShareLinkToken failed: ${err.message}`);
    return jsonResponse({ error: 'Failed to create share link token' }, 500);
  }

  const shareLinkUrl = `${new URL(request.url).origin}${appendTokenParam(path, token)}`;

  // Choose the template from the matched entry's org (Semrush vs Adobe).
  const matchedEntry = pageEntries.find((e) => (e.group || '').trim().toLowerCase() === recipientDomain) || pageEntries[0];
  const org = (matchedEntry.org || '').trim();
  const templateName = templateForOrg('sharelink', org);
  log(`sending share link to domain=${recipientDomain} template=${templateName}`);

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

  return jsonResponse({ result: 'sent' });
}
