const PAGE_SIZES = [25, 50, 100];
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function searchText(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .trim();
}

export function reportPath(folder) {
  if (!folder) return '';
  return `${new URL(folder, 'https://catalog.invalid').pathname.replace(/\/+$/, '')}/`;
}

export function parsePublishedDate(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day ? date : null;
}

export function filterReports(rows, query) {
  const terms = searchText(query).split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    const text = searchText([row.Company, row.Customers, row.Report, row.Domains].filter(Boolean).join(' '));
    return terms.every((term) => text.includes(term));
  }).map((row) => ({ row, published: parsePublishedDate(row.Created)?.getTime() ?? -Infinity }))
    .sort((a, b) => b.published - a.published
      || collator.compare(a.row.Company || a.row.Customers || '', b.row.Company || b.row.Customers || '')
      || collator.compare(a.row.Report || '', b.row.Report || '')
      || collator.compare(a.row.Folder || '', b.row.Folder || ''))
    .map(({ row }) => row);
}

export function paginateReports(rows, { page = 1, size = 25 } = {}) {
  const count = PAGE_SIZES.includes(Number(size)) ? Number(size) : 25;
  const pageCount = Math.max(1, Math.ceil(rows.length / count));
  const requested = Number(page);
  const current = Number.isFinite(requested)
    ? Math.min(pageCount, Math.max(1, Math.floor(requested))) : 1;
  return {
    rows: rows.slice((current - 1) * count, current * count),
    total: rows.length,
    page: current,
    pageCount,
  };
}

export function qualifyCampaigns(modes) {
  const counts = new Map();
  modes.forEach((mode) => {
    const key = searchText(mode.label);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return modes.map((mode) => ({
    ...mode,
    displayLabel: counts.get(searchText(mode.label)) > 1
      ? `${mode.label} (${mode.campaignId ? `DIH: ${mode.campaignId}` : `Legacy: ${mode.id}`})`
      : mode.label,
  }));
}

export function searchCampaigns(modes, query) {
  const term = searchText(query);
  return modes.filter((mode) => searchText(mode.displayLabel || mode.label).includes(term));
}

export function campaignsForFolder(insightRows, eventModes, folder) {
  const path = reportPath(folder);
  if (!path) return [];
  const matchingRows = insightRows.filter((row) => reportPath(row.Folder) === path);
  return eventModes.filter((mode) => mode.column
    && matchingRows.some((row) => String(row[mode.column] || '').trim()))
    .map((mode) => ({ id: mode.id, label: mode.displayLabel || mode.label }));
}

export function readReportState(search, eventModes) {
  const params = new URLSearchParams(search);
  const raw = (params.get('tab') || 'insights').trim().toLowerCase();
  const match = eventModes.find((mode) => mode.id.toLowerCase() === raw);
  const known = ['insights', 'portal'].includes(raw) || !!match;
  const page = Number(params.get('page') || 1);
  const size = Number(params.get('size') || 25);
  return {
    mode: match?.id || (known ? raw : 'insights'),
    query: params.get('q') || '',
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
    size: PAGE_SIZES.includes(size) ? size : 25,
    unknownCampaign: known ? '' : raw,
  };
}
