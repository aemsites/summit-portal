import { isVerifiedMethod } from './session.js';
import { EMAIL_RE } from './magiclink.js';

const MAX_BODY_BYTES = 8192;
const PAGE_SIZE = 50;
const EXPORT_LIMIT = 1000;
const RATE_LIMIT_WINDOW_SECONDS = 600;
const RATE_LIMIT_MAX_REQUESTS = 5;
const CONSENT_VERSION = 'adobe-privacy-v1';
const IDENTITY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
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
  if (!fullName || !hasAtMost(fullName, 120)) return { error: 'Please enter your full name.' };
  if (!EMAIL_RE.test(email) || !hasAtMost(email, 254)) {
    return { error: 'Enter a valid business email address.' };
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

function requestRowsQuery(search, cursor, limit) {
  const clauses = [];
  const params = [];
  if (search) {
    clauses.push("search_text LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(search)}%`);
  }
  if (cursor) {
    clauses.push('(submitted_at < ? OR (submitted_at = ? AND request_id < ?))');
    params.push(cursor.submittedAt, cursor.submittedAt, cursor.requestId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return {
    sql: `SELECT request_id, submitted_at, full_name, email, company, website, job_title, primary_market
      FROM report_requests ${where} ORDER BY submitted_at DESC, request_id DESC LIMIT ?`,
    params: [...params, limit],
  };
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  const protectedValue = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

export function reportRequestsCsv(rows) {
  const header = ['Submitted', 'Name', 'Email', 'Company', 'Website', 'Role', 'Market'];
  const lines = rows.map((row) => [
    row.submitted_at,
    row.full_name,
    row.email,
    row.company,
    row.website,
    row.job_title,
    row.primary_market,
  ].map(csvCell).join(','));
  return `${header.map(csvCell).join(',')}\r\n${lines.join('\r\n')}\r\n`;
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

async function handleCreate(request, env) {
  if (databaseUnavailable(env)) {
    return privateResponse({ error: 'Report requests are unavailable.' }, 503);
  }
  if (!await rateLimit(request, env)) {
    return privateResponse({ error: 'Too many requests. Please try again later.' }, 429);
  }

  const parsed = await parsePublicRequest(request);
  if (parsed.error) return parsed.error;
  const normalised = normaliseRequest(parsed.body);
  if (normalised.error) return invalid(normalised.error);

  const idempotencyKey = request.headers.get('Idempotency-Key') || '';
  if (!IDENTITY_KEY_RE.test(idempotencyKey)) {
    return invalid('A valid idempotency key is required.');
  }
  if (!await verifyTurnstile(parsed.body.turnstileToken, env)) {
    return privateResponse({ error: 'We could not verify your submission. Please try again.' }, 400);
  }

  const requestId = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  const keyHash = await requestKeyHash(idempotencyKey, env);
  const {
    fullName, email, company, website, jobTitle, primaryMarket,
  } = normalised.value;
  const searchText = [fullName, email, company, website, jobTitle, primaryMarket]
    .filter(Boolean).join(' ').toLowerCase();

  await env.REPORT_REQUESTS.batch([
    env.REPORT_REQUESTS.prepare(
      'INSERT OR IGNORE INTO report_request_idempotency (request_key_hash, request_id, created_at) VALUES (?, ?, ?)',
    ).bind(keyHash, requestId, submittedAt),
    env.REPORT_REQUESTS.prepare(`INSERT INTO report_requests (
      request_id, submitted_at, full_name, email, company, website, job_title, primary_market,
      consent_version, consented_at, search_text
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM report_request_idempotency WHERE request_key_hash = ? AND request_id = ?
      )`).bind(
      requestId,
      submittedAt,
      fullName,
      email,
      company,
      website,
      jobTitle,
      primaryMarket,
      CONSENT_VERSION,
      submittedAt,
      searchText,
      keyHash,
      requestId,
    ),
  ]);

  const stored = await env.REPORT_REQUESTS.prepare(`SELECT r.request_id, r.submitted_at
    FROM report_request_idempotency i JOIN report_requests r ON r.request_id = i.request_id
    WHERE i.request_key_hash = ?`).bind(keyHash).first();

  if (!stored) {
    return privateResponse({ error: 'Report requests are unavailable.' }, 503);
  }
  return privateResponse({ requestId: stored.request_id, submittedAt: stored.submitted_at }, 201);
}

async function handleList(url, env) {
  const search = normaliseSearch(url.searchParams.get('q'));
  const rawCursor = url.searchParams.get('cursor');
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return privateResponse({ error: 'Invalid cursor.' }, 400);

  const query = requestRowsQuery(search, cursor, PAGE_SIZE + 1);
  const { results = [] } = await env.REPORT_REQUESTS.prepare(query.sql).bind(...query.params).all();
  const hasNext = results.length > PAGE_SIZE;
  const requests = results.slice(0, PAGE_SIZE);
  return privateResponse({
    requests,
    nextCursor: hasNext ? encodeCursor(requests[requests.length - 1]) : null,
  });
}

async function handleCsv(url, env) {
  const search = normaliseSearch(url.searchParams.get('q'));
  const query = requestRowsQuery(search, null, EXPORT_LIMIT);
  const { results = [] } = await env.REPORT_REQUESTS.prepare(query.sql).bind(...query.params).all();
  return new Response(reportRequestsCsv(results), { headers: CSV_HEADERS });
}

/**
 * Routes the public POST and Adobe-IMS-only retrieval endpoints. Auth is
 * deliberately narrower than general staff access: event credentials, Semrush,
 * magic links, and share links never expose lead PII.
 */
export async function handleReportRequests(request, env, session) {
  const url = new URL(request.url);
  if (url.pathname === '/api/report-requests' && request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'private, no-store',
        ...publicFormCorsHeaders(request),
      },
    });
  }
  if (url.pathname === '/api/report-requests' && request.method === 'POST') {
    return withPublicFormCors(await handleCreate(request, env), request);
  }
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
  return url.pathname === '/api/report-requests.csv' ? handleCsv(url, env) : handleList(url, env);
}
