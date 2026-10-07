import { reportRequestsAuthorisation, csvCell } from './report-requests.js';

export const BOOTH_NOTICE_VERSION = 'booth-privacy-v1';
export const BOOTH_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const KINDS = ['search', 'report_selected', 'report_viewed', 'contact_requested', 'report_sent'];
const PAGE_SIZE = 100;
const HEADERS = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export class BoothActivityError extends Error {
  constructor() {
    super('Booth activity reporting is temporarily unavailable. Please retry or ask the booth team.');
  }
}

function logFailure(operation) {
  // Never log a database exception: it can contain bound email addresses.
  // eslint-disable-next-line no-console
  console.error('[booth-activity]', operation);
}

export function createBoothActivity(kind, flowId, email, report, occurredAt = Date.now()) {
  return {
    event_id: `${flowId}:${kind}${report?.path ? `:${report.path}` : ''}`,
    flow_id: flowId,
    occurred_at: new Date(occurredAt).toISOString(),
    expires_at: new Date(occurredAt + BOOTH_RETENTION_MS).toISOString(),
    email,
    kind,
    report_path: report?.path || null,
    company: report?.company || null,
    report_label: report?.label || null,
    notice_version: BOOTH_NOTICE_VERSION,
  };
}

export async function storeBoothActivity(env, activity) {
  try {
    const result = await env.REPORT_REQUESTS.prepare(`INSERT OR IGNORE INTO booth_activity (
      event_id, flow_id, occurred_at, expires_at, email, kind,
      report_path, company, report_label, notice_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      activity.event_id,
      activity.flow_id,
      activity.occurred_at,
      activity.expires_at,
      activity.email,
      activity.kind,
      activity.report_path,
      activity.company,
      activity.report_label,
      activity.notice_version,
    ).run();
    if (!result.success) throw new BoothActivityError();
    return result.meta.changes > 0;
  } catch {
    logFailure('Private event persistence unavailable');
    throw new BoothActivityError();
  }
}

/** Counts only: do not forward even hashed identities, company data or request headers. */
export async function countBoothActivity(env, kind) {
  // Historical outbox records remain private, but this retired action is no longer counted.
  if (kind === 'contact_requested') return;
  if (!env.BOOTH_ANALYTICS_HOSTNAME) return;
  if (env.BOOTH_ANALYTICS_HOSTNAME !== 'act.aem.now' || !KINDS.includes(kind)) {
    logFailure('Invalid anonymous analytics configuration');
    return;
  }
  try {
    const response = await fetch('https://queue.simpleanalyticscdn.com/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'event',
        hostname: env.BOOTH_ANALYTICS_HOSTNAME,
        event: `booth_${kind}`,
        path: '/booth',
        ua: 'ServerSide/1.0 (+https://act.aem.now/)',
      }),
      signal: AbortSignal.timeout(3000),
      redirect: 'manual',
    });
    if (!response.ok) throw new Error('Analytics rejected event');
  } catch {
    logFailure('Anonymous analytics count unavailable; private record retained');
  }
}

export async function purgeBoothActivity(env) {
  try {
    const result = await env.REPORT_REQUESTS.prepare(
      'DELETE FROM booth_activity WHERE expires_at <= ?',
    ).bind(new Date().toISOString()).run();
    if (!result.success) throw new BoothActivityError();
  } catch {
    logFailure('Retention cleanup unavailable');
    throw new BoothActivityError();
  }
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function dateBoundary(raw) {
  if (raw === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('Invalid date');
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error('Invalid date');
  }
  return date.toISOString();
}

function filters(url) {
  const kind = url.searchParams.get('kind');
  if (kind && !KINDS.includes(kind)) throw new Error('Invalid activity kind');
  const from = dateBoundary(url.searchParams.get('from'));
  const until = dateBoundary(url.searchParams.get('until'));
  if (from && until && from >= until) throw new Error('Invalid date range');
  return { kind, from, until };
}

function cursorFor(row, snapshot, filter) {
  return btoa(JSON.stringify({ at: row.occurred_at, id: row.event_id, snapshot, ...filter }));
}

function readCursor(raw, filter) {
  if (!raw) return null;
  if (raw.length > 1024) throw new Error('Invalid cursor');
  const cursor = JSON.parse(atob(raw));
  if (typeof cursor.at !== 'string' || typeof cursor.id !== 'string'
    || typeof cursor.snapshot !== 'string'
    || !Number.isFinite(Date.parse(cursor.at)) || !Number.isFinite(Date.parse(cursor.snapshot))
    || Object.keys(filter).some((key) => cursor[key] !== filter[key])) {
    throw new Error('Invalid cursor');
  }
  return cursor;
}

async function page(env, filter, snapshot, cursor, limit) {
  const clauses = ['expires_at > ?', 'occurred_at <= ?'];
  const params = [new Date().toISOString(), snapshot];
  if (filter.kind) {
    clauses.push('kind = ?');
    params.push(filter.kind);
  }
  if (filter.from) {
    clauses.push('occurred_at >= ?');
    params.push(filter.from);
  }
  if (filter.until) {
    clauses.push('occurred_at < ?');
    params.push(filter.until);
  }
  if (cursor) {
    clauses.push('(occurred_at < ? OR (occurred_at = ? AND event_id < ?))');
    params.push(cursor.at, cursor.at, cursor.id);
  }
  try {
    const result = await env.REPORT_REQUESTS.prepare(`SELECT *
      FROM booth_activity WHERE ${clauses.join(' AND ')}
      ORDER BY occurred_at DESC, event_id DESC LIMIT ?`).bind(...params, limit).all();
    if (!result.success) throw new BoothActivityError();
    return result.results;
  } catch {
    logFailure('Private activity retrieval unavailable');
    throw new BoothActivityError();
  }
}

function csvRows(rows) {
  return rows.map((row) => [
    row.occurred_at, row.email, row.flow_id, row.kind, row.company, row.report_label,
    row.report_path, row.notice_version, row.expires_at,
  ].map(csvCell).join(',')).join('\r\n');
}

export async function handleBoothActivity(request, env, session) {
  const auth = reportRequestsAuthorisation(session);
  if (auth !== 200) return reply({ error: 'Adobe OAuth access required.' }, auth);
  if (!['GET', 'HEAD'].includes(request.method)) return reply({ error: 'Method not allowed.' }, 405);
  if (!env.REPORT_REQUESTS?.prepare) return reply({ error: 'Booth activity is unavailable.' }, 503);
  const url = new URL(request.url);
  const csv = url.pathname.endsWith('.csv');
  const exportHeaders = {
    ...HEADERS,
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="booth-activity.csv"',
  };
  let filter;
  let cursor;
  try {
    const allowed = ['kind', 'from', 'until', 'cursor'];
    if ([...url.searchParams.keys()].some((key) => !allowed.includes(key)
      || url.searchParams.getAll(key).length !== 1)) throw new Error('Invalid parameters');
    filter = filters(url);
    cursor = readCursor(url.searchParams.get('cursor'), filter);
    if (csv && cursor) throw new Error('CSV does not accept a cursor');
  } catch {
    return reply({ error: 'Invalid activity filter, date range or cursor.' }, 400);
  }
  const snapshot = cursor?.snapshot || new Date().toISOString();
  let rows;
  try {
    rows = await page(env, filter, snapshot, cursor, PAGE_SIZE + 1);
  } catch (error) {
    return reply({ error: error.message }, 503);
  }
  if (request.method === 'HEAD') return new Response(null, { headers: csv ? exportHeaders : HEADERS });
  if (!csv) {
    const events = rows.slice(0, PAGE_SIZE);
    return reply({
      events,
      nextCursor: rows.length > PAGE_SIZE ? cursorFor(events.at(-1), snapshot, filter) : null,
    });
  }
  const encoder = new TextEncoder();
  const header = ['Occurred', 'Email', 'Visit', 'Action', 'Company', 'Report', 'Report path', 'Notice', 'Expires'];
  let first = true;
  let next = null;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (first) {
          controller.enqueue(encoder.encode(`${header.map(csvCell).join(',')}\r\n`));
          first = false;
        }
        if (next) rows = await page(env, filter, snapshot, next, PAGE_SIZE + 1);
        if (!rows.length) {
          controller.close();
          return;
        }
        const chunk = rows.slice(0, PAGE_SIZE);
        controller.enqueue(encoder.encode(`${csvRows(chunk)}\r\n`));
        if (rows.length > PAGE_SIZE) {
          const last = chunk.at(-1);
          next = { at: last.occurred_at, id: last.event_id };
        } else controller.close();
      } catch {
        // Fail the download rather than return a silently truncated lead list.
        controller.error(new Error('Activity export interrupted. Download again.'));
      }
    },
  });
  return new Response(stream, { headers: exportHeaders });
}
