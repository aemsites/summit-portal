/**
 * 'sheet' mode data source: reads raw events from the published Google Sheet CSV
 * and aggregates them (via aggregate.js) into the shapes the dashboard expects.
 * POC only. See tools/analytics-poc/README.md.
 */

import { POC_CSV_URL } from '../../scripts/utils/analytics-config.js';
import { aggregateGlobal, aggregateDetail } from './aggregate.js';

let cache;

/** Minimal RFC-4180-ish CSV parser (handles quotes, embedded commas/newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function loadEvents() {
  if (cache) return cache;
  const resp = await fetch(POC_CSV_URL, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`CSV HTTP ${resp.status}`);
  const rows = parseCsv(await resp.text());
  const headers = rows.shift() || [];
  cache = rows.map((r) => {
    const ev = {};
    headers.forEach((h, i) => { ev[h] = r[i] ?? ''; });
    return ev;
  });
  return cache;
}

export async function loadGlobalPoc() {
  return aggregateGlobal(await loadEvents());
}

export async function loadDetailPoc(path) {
  return aggregateDetail(await loadEvents(), path);
}
