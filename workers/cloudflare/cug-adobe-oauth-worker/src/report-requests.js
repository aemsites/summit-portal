import { isVerifiedMethod } from './session.js';
import { EMAIL_RE } from './magiclink.js';
import { normalizePublicCampaignId } from './report-request-campaigns.js';

const MAX_BODY_BYTES = 8192;
const PAGE_SIZE = 50;
const EXPORT_LIMIT = 1000;
const RATE_LIMIT_WINDOW_SECONDS = 600;
const RATE_LIMIT_MAX_REQUESTS = 5;
const CONSENT_VERSION = 'adobe-privacy-v1';
const IDENTITY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
const DATA_ADMINS = new Set([
  'josec@adobe.com', 'nglauser@adobe.com', 'ebill@adobe.com', 'constantinp@adobe.com',
]);
const REQUEST_COLUMNS = [
  'request_id', 'submitted_at', 'company', 'website', 'job_title', 'primary_market', 'request_source',
];
export const STAGE_TEST_PATH = '/api/report-requests/test';
// Direct AEM delivery URLs do not share the Worker origin, so limit CORS to them.
const PUBLIC_FORM_ORIGINS = new Set([
  'https://main--summit-portal--aemsites.aem.page',
  'https://main--summit-portal--aemsites.aem.live',
]);

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json',
};

const CSV_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'text/csv; charset=utf-8',
  'Content-Disposition': 'attachment; filename="report-requests.csv"',
  'X-Content-Type-Options': 'nosniff',
};

const normaliseText = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

function privateResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE_HEADERS });
}

function publicFormCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (!PUBLIC_FORM_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withPublicFormCors(response, request) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: { ...Object.fromEntries(response.headers), ...publicFormCorsHeaders(request) },
  });
}

function invalid(message) {
  return privateResponse({ error: message }, 400);
}

function hasAtMost(value, length) {
  return value.length <= length;
}

/**
 * Convert a visitor-provided site into the canonical hostname/path stored with
 * the request. A scheme is optional in the form; credentials, ports, queries,
 * fragments, and non-http(s) URLs are rejected rather than silently altered.
 */
export function normaliseWebsite(value) {
  const source = normaliseText(value);
  if (!source || source.length > 512) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(source) ? source : `https://${source}`);
    if (!['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.port || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!host || !host.includes('.')) return null;
    const path = url.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return null;
  }
}

/** Validate and normalise the exact public form contract. */
export function normaliseRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid request' };
  }

  const fullName = normaliseText(body.fullName);
  const email = normaliseText(body.email).toLowerCase();
  const company = normaliseText(body.company);
  const website = normaliseWebsite(body.website);
  const jobTitle = normaliseText(body.jobTitle);
  const primaryMarket = normaliseText(body.primaryMarket);

  if (body.websiteConfirm != null && body.websiteConfirm !== '') {
    return { error: 'Unable to submit request' };
  }
  if (!fullName || !hasAtMost(fullName, 121)) return { error: 'Please enter your first and last name.' };
  if (!EMAIL_RE.test(email) || !hasAtMost(email, 254)) {
    return { error: 'Enter a valid business email address.' };
  }
  if (/@(?:[^@\s]+\.)?(?:adobe|semrush)\.com$/i.test(email)) {
    return { error: 'Adobe and Semrush employees should use the internal platform. This form is only for tracking report requests directly from customers.' };
  }
  if (!company || !hasAtMost(company, 160)) return { error: 'Please enter your company.' };
  if (!website || !hasAtMost(website, 253)) {
    return { error: 'Enter a website such as company.com.' };
  }
  if (!hasAtMost(jobTitle, 120) || !hasAtMost(primaryMarket, 120)) {
    return { error: 'Optional details must be 120 characters or fewer.' };
  }
  if (body.consent !== true) {
    return { error: 'Please agree that Adobe may contact you about your requested report.' };
  }

  return {
    value: {
      fullName,
      email,
      company,
      website,
      jobTitle: jobTitle || null,
      primaryMarket: primaryMarket || null,
      requestSource: 'Public request form',
      publicCampaignId: normalizePublicCampaignId(body.publicCampaignId),
    },
  };
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return atob(padded);
}

function toBase64url(value) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(raw) {
  if (!raw || raw.length > 512) return null;
  try {
    const cursor = JSON.parse(fromBase64url(raw));
    if (!cursor || typeof cursor.submittedAt !== 'string' || typeof cursor.requestId !== 'string') {
      return null;
    }
    return cursor;
  } catch {
    return null;
  }
}

function encodeCursor(row) {
  return toBase64url(JSON.stringify({ submittedAt: row.submitted_at, requestId: row.request_id }));
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function normaliseSearch(value) {
  return normaliseText(value).toLowerCase().slice(0, 120);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function requestKeyHash(key, env) {
  return sha256(`${env.IDEMPOTENCY_SALT || env.JWT_SECRET}:${key}`);
}

async function rateLimit(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const key = await sha256(`${env.RATE_LIMIT_SALT || env.JWT_SECRET}:${ip}`);
  const storageKey = `report-request-rate:${key}`;
  const count = Number(await env.SESSIONS.get(storageKey)) || 0;
  if (count >= RATE_LIMIT_MAX_REQUESTS) return false;
  await env.SESSIONS.put(
    storageKey,
    String(count + 1),
    { expirationTtl: RATE_LIMIT_WINDOW_SECONDS },
  );
  return true;
}

async function verifyTurnstile(token, env) {
  if (!env.TURNSTILE_SECRET_KEY) return false;
  if (typeof token !== 'string'
    || !token.trim()
    || token.length > 2048) return false;
  const form = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token.trim(),
  });
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}

function databaseUnavailable(env) {
  return !env.REPORT_REQUESTS || typeof env.REPORT_REQUESTS.prepare !== 'function';
}

function authorisedAdobeSession(session) {
  return !!session
    && session.method === 'oauth'
    && isVerifiedMethod(session.method)
    && /^[^@\s]+@adobe\.com$/i.test(String(session.email || ''));
}

export function reportRequestsAuthorisation(session) {
  if (!session) return 401;
  return authorisedAdobeSession(session) ? 200 : 403;
}

export function isDataAdmin(session) {
  return authorisedAdobeSession(session) && DATA_ADMINS.has(session.email.toLowerCase());
}

function requestColumns(admin) {
  return admin ? [...REQUEST_COLUMNS, 'full_name', 'email'] : REQUEST_COLUMNS;
}

function requestRowsQuery(search, cursor, limit, admin) {
  const clauses = [];
  const params = [];
  if (search) {
    const searchColumn = admin ? 'search_text'
      : "lower(coalesce(company, '') || ' ' || coalesce(website, '') || ' ' || coalesce(request_source, ''))";
    clauses.push(`${searchColumn} LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(search)}%`);
  }
  if (cursor) {
    clauses.push('(submitted_at < ? OR (submitted_at = ? AND request_id < ?))');
    params.push(cursor.submittedAt, cursor.submittedAt, cursor.requestId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return {
    sql: `SELECT ${requestColumns(admin).join(', ')}, c.hub_campaign_id, c.campaign_name
      FROM report_requests LEFT JOIN report_request_campaigns c USING (public_campaign_id)
      ${where} ORDER BY submitted_at DESC, request_id DESC LIMIT ?`,
    params: [...params, limit],
  };
}

export function csvCell(value) {
  const text = String(value == null ? '' : value);
  const protectedValue = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function httpsOrigin(value) {
  if (typeof value !== 'string' || !/^https:\/\/[^/?#\\\s]+\/?$/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url.origin;
  } catch {
    return null;
  }
}

function campaignLink(row, origin) {
  return origin && row.hub_campaign_id
    ? `${origin}/insights-campaigns/${encodeURIComponent(row.hub_campaign_id)}` : '';
}

export function reportRequestsCsv(rows, hubOrigin, admin = false) {
  const origin = httpsOrigin(hubOrigin);
  const header = [
    'Company Name',
    'Website',
    ...(admin ? ['Access Emails'] : []),
    'Request Source',
    'Campaign Name',
    'Campaign Link',
    'Submitted At (UTC)',
    ...(admin ? ['Customer Name'] : []),
  ];
  const lines = rows.map((row) => [
    row.company,
    row.website,
    ...(admin ? [row.email] : []),
    row.request_source,
    row.campaign_name,
    campaignLink(row, origin),
    row.submitted_at,
    ...(admin ? [row.full_name] : []),
  ].map(csvCell).join(','));
  return `${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}

async function parsePublicRequest(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return { error: invalid('Content-Type must be application/json.') };
  }
  const headerLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(headerLength) && headerLength > MAX_BODY_BYTES) {
    return { error: privateResponse({ error: 'Request is too large.' }, 413) };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return { error: privateResponse({ error: 'Request is too large.' }, 413) };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: invalid('Invalid JSON body.') };
  }
}

async function validateSubmission(request, env, body) {
  const normalised = normaliseRequest(body);
  if (normalised.error) return { error: invalid(normalised.error) };

  const idempotencyKey = request.headers.get('Idempotency-Key') || '';
  if (!IDENTITY_KEY_RE.test(idempotencyKey)) {
    return { error: invalid('A valid idempotency key is required.') };
  }
  if (!await verifyTurnstile(body.turnstileToken, env)) {
    return { error: invalid('We could not verify your submission. Please try again.') };
  }
  if (!await rateLimit(request, env)) {
    return { error: privateResponse({ error: 'Too many requests. Please try again later.' }, 429) };
  }
  return { value: normalised.value, idempotencyKey };
}

async function handleStageTest(request, env, url) {
  const unavailable = () => privateResponse({ error: 'Test requests are unavailable.' }, 503);
  try {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin && !PUBLIC_FORM_ORIGINS.has(origin)) {
      return privateResponse({ error: 'Origin not allowed.' }, 403);
    }

    const parsed = await parsePublicRequest(request);
    if (parsed.error) return parsed.error;
    const secret = env.DIH_REPORT_REQUEST_STAGE_TEST_SECRET;
    if (typeof secret !== 'string' || (secret.match(/\S/gu)?.length ?? 0) < 32) return unavailable();
    const token = parsed.body?.stageToken;
    const [id, mac] = typeof token === 'string' && token.length === 101 ? token.split('.') : [];
    if (!normalizePublicCampaignId(id) || !/^[a-f0-9]{64}$/.test(mac)) {
      return privateResponse({ error: 'Invalid test link.' }, 403);
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(mac.match(/../g), (pair) => parseInt(pair, 16));
    const message = encoder.encode(`dih-report-request-stage-v1\n${id}`);
    if (!await crypto.subtle.verify('HMAC', key, signature, message)) {
      return privateResponse({ error: 'Invalid test link.' }, 403);
    }
    const { error } = await validateSubmission(request, env, parsed.body);
    return error || privateResponse({ testOnly: true });
  } catch {
    // Do not surface exceptions containing test form data or tokens.
    return unavailable();
  }
}

async function handleCreate(request, env) {
  if (databaseUnavailable(env)) {
    return privateResponse({ error: 'Report requests are unavailable.' }, 503);
  }

  const parsed = await parsePublicRequest(request);
  if (parsed.error) return parsed.error;
  if (parsed.body && Object.hasOwn(parsed.body, 'stageToken')) {
    return invalid('Test requests must use the test endpoint.');
  }
  const { value, error, idempotencyKey } = await validateSubmission(request, env, parsed.body);
  if (error) return error;

  const requestId = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  const keyHash = await requestKeyHash(idempotencyKey, env);
  const {
    fullName, email, company, website, jobTitle, primaryMarket, requestSource, publicCampaignId,
  } = value;
  const searchText = [fullName, email, company, website, jobTitle, primaryMarket, requestSource]
    .filter(Boolean).join(' ').toLowerCase();

  await env.REPORT_REQUESTS.batch([
    env.REPORT_REQUESTS.prepare(`INSERT INTO report_requests (
      request_id, submitted_at, full_name, email, company, website, job_title, primary_market, request_source,
      consent_version, consented_at, search_text, public_campaign_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      requestId,
      submittedAt,
      fullName,
      email,
      company,
      website,
      jobTitle,
      primaryMarket,
      requestSource,
      CONSENT_VERSION,
      submittedAt,
      searchText,
      publicCampaignId,
    ),
    env.REPORT_REQUESTS.prepare(
      'INSERT OR IGNORE INTO report_request_idempotency (request_key_hash, request_id, created_at) VALUES (?, ?, ?)',
    ).bind(
      keyHash,
      requestId,
      submittedAt,
    ),
    // A concurrent retry may already own this idempotency key.
    env.REPORT_REQUESTS.prepare(`DELETE FROM report_requests
      WHERE request_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM report_request_idempotency WHERE request_key_hash = ? AND request_id = ?
      )`).bind(requestId, keyHash, requestId),
  ]);

  const stored = await env.REPORT_REQUESTS.prepare(`SELECT r.request_id, r.submitted_at
    FROM report_request_idempotency i JOIN report_requests r ON r.request_id = i.request_id
    WHERE i.request_key_hash = ?`).bind(keyHash).first();

  if (!stored) {
    return privateResponse({ error: 'Report requests are unavailable.' }, 503);
  }
  return privateResponse({ requestId: stored.request_id, submittedAt: stored.submitted_at }, 201);
}

async function handleList(url, env, admin) {
  const search = normaliseSearch(url.searchParams.get('q'));
  const rawCursor = url.searchParams.get('cursor');
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return privateResponse({ error: 'Invalid cursor.' }, 400);

  const query = requestRowsQuery(search, cursor, PAGE_SIZE + 1, admin);
  const { results = [] } = await env.REPORT_REQUESTS.prepare(query.sql).bind(...query.params).all();
  const hasNext = results.length > PAGE_SIZE;
  const origin = httpsOrigin(env.DIH_REPORT_REQUEST_HUB_ORIGIN);
  const columns = requestColumns(admin);
  const requests = results.slice(0, PAGE_SIZE).map((row) => {
    const record = Object.fromEntries(columns.map((column) => [column, row[column]]));
    const link = campaignLink(row, origin);
    if (row.campaign_name) record.campaign_name = row.campaign_name;
    if (link) record.campaign_link = link;
    return record;
  });
  return privateResponse({
    isAdmin: admin,
    requests,
    nextCursor: hasNext ? encodeCursor(requests[requests.length - 1]) : null,
  });
}

async function handleCsv(url, env, admin) {
  const search = normaliseSearch(url.searchParams.get('q'));
  const query = requestRowsQuery(search, null, EXPORT_LIMIT, admin);
  const { results = [] } = await env.REPORT_REQUESTS.prepare(query.sql).bind(...query.params).all();
  const csv = reportRequestsCsv(results, env.DIH_REPORT_REQUEST_HUB_ORIGIN, admin);
  return new Response(csv, { headers: CSV_HEADERS });
}

/**
 * Routes the public POST and Adobe-IMS-only retrieval endpoints. Auth is
 * deliberately narrower than general staff access: event credentials, Semrush,
 * magic links, and share links never expose lead PII.
 */
export async function handleReportRequests(request, env, session) {
  const url = new URL(request.url);
  const stageTest = url.pathname === STAGE_TEST_PATH;
  const publicIntake = url.pathname === '/api/report-requests';
  if ((publicIntake || stageTest) && request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'private, no-store',
        ...publicFormCorsHeaders(request),
      },
    });
  }
  if ((publicIntake || stageTest) && request.method === 'POST') {
    const response = stageTest
      ? await handleStageTest(request, env, url)
      : await handleCreate(request, env);
    return withPublicFormCors(response, request);
  }
  if (stageTest) return new Response(null, { status: 405, headers: { ...NO_STORE_HEADERS, Allow: 'POST, OPTIONS' } });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405 });

  const authStatus = reportRequestsAuthorisation(session);
  if (authStatus !== 200) {
    return privateResponse(
      { error: authStatus === 401 ? 'Authentication required.' : 'Adobe OAuth access required.' },
      authStatus,
    );
  }
  if (databaseUnavailable(env)) {
    return privateResponse({ error: 'Report requests are unavailable.' }, 503);
  }
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: NO_STORE_HEADERS });
  const admin = isDataAdmin(session);
  return url.pathname === '/api/report-requests.csv'
    ? handleCsv(url, env, admin) : handleList(url, env, admin);
}
