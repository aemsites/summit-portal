import { buildShareForm, folderToDeepLink } from './share-form.js';
import {
  campaignsForFolder, filterReports, paginateReports, qualifyCampaigns, readReportState,
  reportPath, searchCampaigns,
} from './report-catalog.js';

const RECENT_MAX = 8;
const recentKey = (mode) => `cp-recent-${mode}`;

/** Read the recent-entry list for a mode. Returns [] on any storage failure. */
function readRecent(mode) {
  try {
    const raw = localStorage.getItem(recentKey(mode));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Record an opened company for a mode: dedupe by folder, newest first, cap at
 * RECENT_MAX. Entries without a Folder are skipped (nothing to re-open).
 * Storage failures are swallowed — recents are a convenience, never required.
 */
function pushRecent(mode, company) {
  if (!company || !company.Folder) return;
  try {
    const entry = { company: company.Company, folder: company.Folder, ts: Date.now() };
    const next = [entry, ...readRecent(mode).filter((e) => e.folder !== entry.folder)]
      .slice(0, RECENT_MAX);
    localStorage.setItem(recentKey(mode), JSON.stringify(next));
  } catch {
    // ignore: storage unavailable/full
  }
}

// Known event landing-page variants. A website folder can hold several of these
// in parallel (e.g. a Cannes and a Summit report), so they render as separate
// selectable reports inside one website card.
const EVENT_FORMATS = {
  'cannes-2026': 'Cannes Lions 2026',
  'summit-2026': 'Adobe Summit 2026',
};

/**
 * Event portal tabs are CONTENT, not code. Each event is one extra mode in the
 * picker, backed by one column in `insights-list.json`: a row whose `<column>`
 * cell is non-empty is in that event, and the cell value is the card label (the
 * event-specific company name, which can differ per event). Which columns become
 * tabs — and in what order, under what label — is authored in the DA sheet
 * `/data/event-tabs.json`, so **adding an event needs no code change**: add a
 * sheet row + populate the matching column in `insights-list`.
 *
 * Unlike the All reports tab (one card per website globally), event tabs
 * build ONE CARD PER FLAGGED ROW so the same company can appear in several
 * events and two companies sharing a page each keep their card.
 */

/** Non-event columns in `insights-list`. Every OTHER column is an event flag —
 *  this is what the no-config fallback keys off. */
const INSIGHTS_DATA_COLUMNS = new Set(['Report', 'Customers', 'Folder', 'Created', 'Report Notice']);

/** Built-in picker modes. An event row may never claim one of these ids. */
const BUILTIN_MODE_IDS = new Set(['accounts', 'insights', 'portal']);

/** Slugify a sheet value into a mode id (`Summit Mumbai 2026` → `summit-mumbai-2026`). */
export function slugifyModeId(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** An `Active` cell is opt-OUT: only an explicit falsy word hides the tab, so a
 *  freshly added row with the column left blank still shows. */
function isActiveCell(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  return !['false', 'no', '0', 'off', 'n'].includes(v);
}

/**
 * Fallback when `/data/event-tabs.json` is missing or defines no usable rows:
 * derive one tab per non-reserved `insights-list` column that has at least one
 * non-empty cell, labelled by the column header. Keeps the picker working
 * (rather than losing every event tab) if the sheet is unpublished or broken —
 * order is whatever key order the JSON carries, which is exactly the control the
 * config sheet exists to provide.
 */
export function deriveEventModes(insightRows) {
  const columns = [];
  const seen = new Set();
  for (const row of insightRows || []) {
    for (const key of Object.keys(row)) {
      if (!INSIGHTS_DATA_COLUMNS.has(key) && !key.startsWith('DIH ')
        && !seen.has(key) && String(row[key] || '').trim()) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns
    .map((column) => ({ id: slugifyModeId(column), label: column, column }))
    .filter((m) => m.id && !BUILTIN_MODE_IDS.has(m.id));
}

/**
 * Resolve the event tabs from the `/data/event-tabs.json` rows. Columns:
 *   - `Column`  (required) the `insights-list` column this tab reads
 *   - `Label`   tab text; defaults to `Column`
 *   - `Active`  set `false` to retire a finished event without deleting its data
 *   - `Id`      optional stable mode id (localStorage recents key, `cp-recent-<id>`);
 *               defaults to a slug of `Column`. Pin it to keep recents across a rename.
 * Row order is tab order. Rows with no `Column`, a duplicate/built-in id, or
 * `Active: false` are dropped. If nothing usable survives, fall back to
 * `deriveEventModes` so the tabs never silently disappear.
 */
export function parseEventModes(configRows, insightRows) {
  const modes = [];
  const seen = new Set();
  for (const row of Array.isArray(configRows) ? configRows : []) {
    const column = String(row.Column || '').trim();
    const id = row.CampaignId ? String(row.Id || '').trim() : slugifyModeId(row.Id || column);
    if (column && id && isActiveCell(row.Active) && !BUILTIN_MODE_IDS.has(id) && !seen.has(id)) {
      seen.add(id);
      modes.push({
        id,
        label: String(row.Label || '').trim() || column,
        column,
        ...(row.CampaignId ? { campaignId: String(row.CampaignId).trim() } : {}),
      });
    }
  }
  return modes.length ? modes : deriveEventModes(insightRows);
}

/** The mode the picker opens on, and the fallback for an unknown `?tab=`. */
export const DEFAULT_MODE = 'insights';

/**
 * Group the resolved modes into the two-level navigation: a FAMILY (what am I
 * browsing) over a MODE (which slice). Families are code — Accounts belongs to
 * another team, and `portal`/`insights` read sheets of their own — while the
 * event modes come straight from `/data/event-tabs.json` via parseEventModes,
 * in sheet order, ids and labels untouched.
 *
 * `Adobe Summit 2026` (the `portal` mode) is an event like the rest, but it
 * cannot be an event-tabs.json row: it reads `company-list.json` and the
 * `/customers/` tree, so it has no `insights-list` column to name. Hence it is
 * pinned here, first among the events.
 *
 * `kind` separates "everything we have generated" (`all`) from "pinned for one
 * event" (`event`) — the distinction the chip row exists to make visible.
 */
export function buildNavModel(eventModes) {
  return [
    {
      id: 'reports',
      label: 'Digital Opportunity Reports',
      modes: [
        { id: DEFAULT_MODE, label: 'All reports', kind: 'all' },
        { id: 'portal', label: 'Adobe Summit 2026', kind: 'event' },
        ...(eventModes || []).map((e) => ({ id: e.id, label: e.label, kind: 'event' })),
      ],
    },
    {
      id: 'accounts',
      label: 'Accounts',
      modes: [{ id: 'accounts', label: 'Accounts', kind: 'all' }],
    },
  ];
}

/** The family that owns `modeId`, or undefined. */
export function findFamily(navModel, modeId) {
  return navModel.find((f) => f.modes.some((m) => m.id === modeId));
}

/** The mode entry for `modeId`, or undefined. */
export function findMode(navModel, modeId) {
  return navModel.flatMap((f) => f.modes).find((m) => m.id === modeId);
}

/**
 * Resolve a `?tab=` value to a mode id. Unknown values (a retired event, a
 * typo, a link from before a rename) fall back to All reports rather than
 * rendering an empty picker.
 */
export function resolveTabParam(navModel, raw) {
  const id = String(raw == null ? '' : raw).trim().toLowerCase();
  return findMode(navModel, id) ? id : DEFAULT_MODE;
}

/** Thousands separators, so "4035 total" reads as "4,035 total". */
const fmtCount = (n) => Number(n || 0).toLocaleString('en-US');

/** "405 reports" / "1 report" — a one-card event is rare but real (a brand-new
 *  event with its first row published), and "1 reports" reads like a bug. */
const fmtReports = (n) => `${fmtCount(n)} ${Number(n) === 1 ? 'report' : 'reports'}`;

/**
 * One line of orientation under the chip row: which slice am I looking at, how
 * big is it, and — on an event — how do I get back to the full catalogue. The
 * way back is offered ALWAYS, not just on an empty search: an event tab showing
 * 405 of 4,035 reports is the single most confusing state in the picker.
 * Returns null on Accounts (not this team's surface) and for a missing mode.
 */
export function contextCopy(mode, total) {
  if (!mode || mode.id === 'accounts') return null;
  if (mode.kind === 'all') {
    return {
      text: `Every Digital Opportunity Report we have generated — one card per website. ${fmtCount(total)} total.`,
      action: null,
    };
  }
  return {
    text: `The ${fmtReports(total)} pinned for ${mode.label}.`,
    action: 'Looking for someone else? Search all reports',
  };
}

/**
 * Copy for a search that matched nothing. Without this the grid just goes
 * blank, so "no report for Acme at this event" is indistinguishable from "no
 * report for Acme at all" — on an event tab the report is very often sitting in
 * All reports, hence the action.
 */
export function emptyStateCopy(mode, query, allCount) {
  const q = String(query || '').trim();
  const isEvent = !!mode && mode.kind === 'event';
  return {
    text: isEvent ? `No match for “${q}” in ${mode.label}.` : `No match for “${q}”.`,
    action: isEvent ? `Search all ${fmtReports(allCount)}` : null,
  };
}

/**
 * Per-report data notices. A report's `Report Notice` cell (in insights-list)
 * holds one of these codes when a section was omitted because no data came back
 * for that customer's domain (SEO/keyword data from Semrush, an Adobe company;
 * AI mentions from Adobe's AI-visibility data). The modal surfaces the matching
 * message so a sales rep understands it's a data limitation for that domain —
 * NOT an error in the report. Copy lives here; the sheet only carries the code,
 * so wording can change without re-tagging reports.
 */
const REPORT_NOTICES = {
  'no-ai-visibility': {
    title: 'No AI Visibility section',
    body: 'No AI-visibility data was available for this domain, so the AI Visibility section was left out. The rest of the report is complete.',
  },
  'no-keyword-data': {
    title: 'No Keyword Opportunities section',
    body: 'Semrush returned no keyword/ranking data for this domain, so the Keyword Opportunities section was left out. The rest of the report is complete.',
  },
  'no-seo-ai': {
    title: 'Site performance only',
    body: 'No SEO or AI-visibility data was available for this domain (often because it redirects elsewhere or blocks data collection), so the report covers site performance only.',
  },
  'no-report': {
    title: 'Report not available',
    body: "We couldn't gather enough data for this domain to generate a report.",
  },
};

/**
 * Split an insight-report folder into its website slug and optional variant.
 * DIH folders are `…/insights/<website>/[variant]/` where <variant> is empty
 * (the bare report), `portal-landing`, or an event id (`cannes-2026`, …). The
 * website slug (e.g. `ey-com`) is the anchor; everything deeper is a variant of
 * the SAME website. The full folder is returned so a card can link to it.
 */
export function parseInsightFolder(folder) {
  const f = (folder || '').replace(/\/+$/, '');
  const marker = '/insights/';
  const idx = f.indexOf(marker);
  if (idx < 0) return { website: '', variant: '', folder: `${f}/` };
  const [website = '', variant = ''] = f.slice(idx + marker.length).split('/').filter(Boolean);
  return { website, variant, folder: `${f}/` };
}

/**
 * Parse a DIH `Created` value (`D.MM.YYYY`) into a sortable integer so we can
 * pick the most recent variant. Missing/unparseable dates sort oldest (0).
 */
function createdSortKey(created) {
  const m = (created || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return 0;
  const [, d, mo, y] = m;
  return Number(y) * 10000 + Number(mo) * 100 + Number(d);
}

/**
 * Collapse insight-report rows so each WEBSITE appears EXACTLY ONCE — keyed by
 * the website slug GLOBALLY, across every account folder. DIH publishes a row
 * per account×website×variant, so the same site (e.g. `ey.com` under `ey`,
 * `ey-studio`, `ernst-young`) otherwise renders several times.
 *
 * Selection rules per website (a visitor from any subsidiary lands on the same
 * page):
 *   - If any `portal-landing` variant exists, it WINS — the card links to the
 *     MOST RECENT portal-landing (by `Created`) and offers no other variant.
 *   - Otherwise, if event variants exist (Cannes/Summit), the card lists each
 *     (most-recent per format) as a selectable report, plus the bare report.
 *   - Otherwise the card links to the most recent bare/other report.
 */
export function groupInsightsByWebsite(rows) {
  const groups = new Map();
  for (const row of rows) {
    const { website, variant, folder } = parseInsightFolder(row.Folder);
    const key = website || folder; // global key across accounts
    if (!groups.has(key)) {
      groups.set(key, { Report: row.Report, Customers: row.Customers, variants: [] });
    }
    const g = groups.get(key);
    // Carry a per-report data notice (e.g. a section omitted because no data
    // came back for this domain). The portal-landing row is the canonical one;
    // prefer its notice but fall back to any variant that has one.
    if (row['Report Notice'] && (!g.ReportNotice || /portal-landing/.test(row.Folder || ''))) {
      g.ReportNotice = row['Report Notice'];
    }
    g.variants.push({ variant, folder, created: createdSortKey(row.Created) });
    if (!g.Report && row.Report) g.Report = row.Report;
    if (!g.Customers && row.Customers) g.Customers = row.Customers;
  }

  const mostRecent = (list) => [...list].sort((a, b) => b.created - a.created)[0];

  return [...groups.values()].map((g) => {
    const portalLandings = g.variants.filter((v) => v.variant === 'portal-landing');
    let folder;
    let formats = [];

    if (portalLandings.length) {
      // Portal landing is canonical — most recent wins, suppress everything else.
      folder = mostRecent(portalLandings).folder;
    } else {
      const events = g.variants.filter((v) => EVENT_FORMATS[v.variant]);
      if (events.length) {
        // One report per event format (most recent of each), bare report first.
        const byFormat = new Map();
        for (const v of events) {
          const cur = byFormat.get(v.variant);
          if (!cur || v.created > cur.created) byFormat.set(v.variant, v);
        }
        formats = [...byFormat.entries()]
          .map(([format, v]) => ({ format, label: EVENT_FORMATS[format], folder: v.folder }))
          .sort((a, b) => a.label.localeCompare(b.label));
        const bare = mostRecent(g.variants.filter((v) => v.variant === ''));
        if (bare) formats.unshift({ format: '', label: 'Digital Opportunity Report', folder: bare.folder });
        folder = formats[0].folder;
      } else {
        folder = mostRecent(g.variants).folder;
      }
    }

    return {
      Company: g.Report || g.Customers || folder,
      Report: g.Report,
      Customers: g.Customers,
      Folder: folder,
      ReportNotice: g.ReportNotice || '',
      formats,
    };
  });
}

/**
 * Build the cards for one event tab from the raw insight rows. Each row whose
 * `column` cell is non-empty is in the event; the cell holds one or more event
 * company names (multiple `;`-separated when several companies share one page,
 * e.g. "EY; EY Studio+"), and EACH name becomes its own card linking to that
 * row's page. This intentionally does NOT collapse by website: the same company
 * may sit in several events, and co-located companies each keep a distinct card.
 * Cards are sorted by label so the A–Z grid groups them correctly.
 */
export function buildEventCompanies(rows, column) {
  const cards = [];
  for (const row of rows) {
    const cell = String(row[column] || '').trim();
    const names = cell ? cell.split(';').map((n) => n.trim()).filter(Boolean) : [];
    const base = {
      Report: row.Report,
      Customers: row.Customers,
      Folder: `${(row.Folder || '').replace(/\/+$/, '')}/`,
      ReportNotice: row['Report Notice'] || '',
      formats: [],
    };
    for (const name of names) cards.push({ ...base, Company: name });
  }
  return cards.sort((a, b) => a.Company.localeCompare(b.Company));
}

/**
 * Two-level navigation. The PRIMARY control answers "what am I browsing"
 * (reports vs. the Accounts directory another team owns); the SECONDARY chip
 * row answers "which slice" — All reports, then one chip per event. A hairline
 * after the All-reports chip (CSS, off `.cp-mode-chip--all`) separates the full
 * catalogue from the event pins.
 *
 * `onChange(modeId, { keepQuery })` — keepQuery is true only for the context
 * action, which carries the typed search across to All reports.
 */
export function buildNav(navModel, onChange) {
  const el = document.createElement('div');
  el.className = 'cp-nav';

  // --- primary: one button per family ---
  const primary = document.createElement('div');
  primary.className = 'cp-mode-toggle';
  primary.setAttribute('role', 'tablist');
  primary.setAttribute('aria-label', 'Browse');

  for (const family of navModel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cp-mode-btn cp-family-btn';
    btn.dataset.family = family.id;
    btn.textContent = family.label;
    // A family always opens on its first mode — All reports for reports.
    btn.addEventListener('click', () => onChange(family.modes[0].id, { keepQuery: false }));
    primary.append(btn);
  }

  // --- secondary: one chip per mode in the reports family ---
  const subnav = document.createElement('div');
  subnav.className = 'cp-subnav';
  subnav.setAttribute('role', 'tablist');
  subnav.setAttribute('aria-label', 'Report set');

  const reports = navModel.find((f) => f.id === 'reports');
  for (const mode of reports.modes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cp-mode-chip';
    if (mode.kind === 'all') chip.classList.add('cp-mode-chip--all');
    chip.dataset.mode = mode.id;
    chip.textContent = mode.label;
    chip.addEventListener('click', () => onChange(mode.id, { keepQuery: false }));
    subnav.append(chip);
  }

  // --- context line ---
  const context = document.createElement('p');
  context.className = 'cp-context';

  el.append(primary, subnav, context);

  function setActive(modeId, total) {
    const family = findFamily(navModel, modeId);
    const mode = findMode(navModel, modeId);

    primary.querySelectorAll('.cp-family-btn').forEach((b) => {
      const on = !!family && b.dataset.family === family.id;
      b.classList.toggle('cp-family-btn--active', on);
      b.classList.toggle('cp-mode-btn--active', on);
      b.setAttribute('aria-selected', String(on));
    });

    subnav.querySelectorAll('.cp-mode-chip').forEach((c) => {
      const on = c.dataset.mode === modeId;
      c.classList.toggle('cp-mode-chip--active', on);
      c.setAttribute('aria-selected', String(on));
    });

    // Accounts is a single-mode family: no slice to pick, so no chip row.
    subnav.hidden = !family || family.id !== 'reports';

    const copy = contextCopy(mode, total);
    context.replaceChildren();
    context.hidden = !copy;
    if (!copy) return;

    const text = document.createElement('span');
    text.className = 'cp-context-text';
    text.textContent = copy.text;
    context.append(text);

    if (copy.action) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'cp-context-action';
      action.textContent = copy.action;
      action.addEventListener('click', () => onChange(DEFAULT_MODE, { keepQuery: true }));
      context.append(action);
    }
  }

  return { el, setActive };
}

function buildSearch() {
  const wrapper = document.createElement('label');
  wrapper.className = 'cp-field cp-company-field';
  const label = document.createElement('span');
  label.textContent = 'Company or website';

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search company name or website';
  input.className = 'cp-search-input';
  wrapper.append(label, input);

  return { wrapper, input };
}

function buildDialog(id) {
  const dialog = document.createElement('dialog');
  dialog.className = 'customer-picker cp-report-dialog';
  dialog.setAttribute('aria-labelledby', `${id}-details-title`);

  const close = document.createElement('button');
  close.className = 'cp-dialog-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close details');
  close.textContent = '\u00d7';

  const content = document.createElement('div');
  content.className = 'cp-dialog-content';

  dialog.append(close, content);
  document.body.append(dialog);

  return { dialog, close, content };
}

/** Turn a company.Folder value into a same-origin path (strip origin + trailing slash).
 *  Used to build the da.live edit URL, which appends its own `/index`. */
function folderToPath(folder) {
  try {
    return new URL(folder).pathname.replace(/\/$/, '');
  } catch {
    return folder.replace(/\/$/, '');
  }
}

function buildCard(company, onOpen) {
  const card = document.createElement('button');
  card.className = 'cp-card';
  card.type = 'button';
  card.dataset.folder = company.Folder;

  const name = document.createElement('span');
  name.className = 'cp-card-name';
  name.textContent = company.Company;
  card.append(name);

  const arrow = document.createElement('span');
  arrow.className = 'cp-card-arrow';
  arrow.textContent = '→';
  card.append(arrow);

  card.addEventListener('click', () => onOpen(card, company));
  return card;
}

/**
 * Build the "Recently viewed" band for a mode, or return null when there are no
 * resolvable recents. Stored entries are matched back to the live company list
 * by folder so the dialog opens with full, current data; stale entries (folder
 * no longer present) are dropped.
 */
function buildRecentBand(mode, companies, onOpen) {
  const byFolder = new Map(companies.map((c) => [c.Folder, c]));
  const resolved = readRecent(mode)
    .map((e) => byFolder.get(e.folder))
    .filter(Boolean);
  if (!resolved.length) return null;

  const band = document.createElement('div');
  band.className = 'cp-recent';

  const heading = document.createElement('h2');
  heading.className = 'cp-recent-heading';
  heading.textContent = 'Recently viewed';
  band.append(heading);

  const cards = document.createElement('div');
  cards.className = 'cp-recent-cards';
  for (const company of resolved) {
    cards.append(buildCard(company, onOpen));
  }
  band.append(cards);
  return band;
}

/** Hide cards that do not match `query`, hide groups left with none, and return
 *  how many cards are still visible — the caller uses that to decide whether to
 *  show the empty state. */
export function applyFilter(container, query) {
  const q = query.toLowerCase().trim();
  const groups = container.querySelectorAll('.cp-group');
  let total = 0;

  for (const group of groups) {
    const cards = group.querySelectorAll('.cp-card');
    let visibleCount = 0;

    for (const card of cards) {
      const name = card.querySelector('.cp-card-name').textContent.toLowerCase();
      const match = !q || name.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) visibleCount += 1;
    }

    group.style.display = visibleCount > 0 ? '' : 'none';
    total += visibleCount;
  }

  return total;
}

function buildLookupMaps(companyData, cugData) {
  const websiteMap = new Map();
  (companyData?.data || []).forEach((row) => {
    const company = row.Company;
    const raw = row.Domains;
    if (company && raw) {
      const sites = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      if (sites.length) websiteMap.set(company, sites);
    }
  });

  const cugByPath = new Map();
  (cugData?.data || []).forEach((row) => {
    const path = row.url?.replace(/\*+$/, '').replace(/\/$/, '');
    const groups = row['cug-groups'];
    if (path && groups) cugByPath.set(path, groups);
  });

  const domainMap = new Map();
  (companyData?.data || []).forEach((row) => {
    const company = row.Company;
    const folder = row.Folder?.replace(/\/$/, '');
    if (!company || !folder) return;
    const raw = cugByPath.get(folder);
    if (!raw) return;
    const domains = raw.split(/[\n,]+/).map((d) => d.trim()).filter(Boolean);
    if (domains.length) domainMap.set(company, domains);
  });

  return { websiteMap, domainMap };
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text, className, action) {
  const element = node('button', className, text);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}

function pageLink(text, href, className) {
  const element = node('a', className, text);
  element.href = href;
  element.target = '_blank';
  element.rel = 'noopener';
  return element;
}

function publishedDate(value) {
  const match = String(value || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return node('span', '', 'Not recorded');
  const [, day, month, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) {
    return node('span', '', 'Not recorded');
  }
  const time = node('time', '', new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date));
  time.dateTime = date.toISOString().slice(0, 10);
  return time;
}

function renderDialog(content, company, { id, websiteMap, domainMap, share }) {
  const heading = node('h2', 'cp-dialog-title', company.Company);
  heading.id = `${id}-details-title`;
  const body = node('div', 'cp-details-body');
  body.tabIndex = 0;
  body.setAttribute('role', 'region');
  body.setAttribute('aria-label', 'Report information and campaigns');
  const actions = node('div', 'cp-dialog-actions');
  const sharing = node('section', 'cp-share');
  content.replaceChildren(heading, body, actions, sharing);

  const formats = company.formats || [];
  const selection = node('div', 'cp-selected-report');
  body.append(selection);

  function section(title, values, className = 'cp-dialog-list', description = '') {
    if (!values.length) return;
    const block = node('section', 'cp-dialog-section');
    const list = node('ul', className);
    values.forEach((value) => {
      const item = node('li');
      item.append(value);
      list.append(item);
    });
    block.append(node('h3', '', title));
    if (description) block.append(node('p', 'cp-campaign-count', description));
    block.append(list);
    selection.append(block);
  }

  function renderSelection(selected) {
    selection.replaceChildren();
    actions.replaceChildren();
    sharing.replaceChildren();
    sharing.hidden = !selected;
    if (!selected) return;
    const notice = REPORT_NOTICES[selected.ReportNotice];
    if (notice) {
      const message = node('div', 'cp-dialog-notice');
      message.setAttribute('role', 'note');
      message.append(node('strong', '', notice.title), node('p', '', notice.body));
      selection.append(message);
    }
    const lookup = selected.Customers || company.Customers || company.Company;
    const websites = selected.Report ? [selected.Report] : (websiteMap.get(lookup) || []);
    const metadata = node('div', 'cp-report-meta');
    websites.forEach((website) => {
      metadata.append(pageLink(website, /^https?:\/\//i.test(website) ? website : `https://${website}`));
    });
    const date = node('span', 'cp-report-date', 'Published ');
    date.append(publishedDate(selected.Created));
    metadata.append(date);
    selection.append(metadata);
    const memberships = selected.campaigns || [];
    if (memberships.length) {
      section(
        'Campaigns',
        memberships.map((mode) => mode.label),
        'cp-dialog-list cp-campaign-memberships',
        `This report belongs to ${memberships.length} campaign${memberships.length === 1 ? '' : 's'}.`,
      );
    } else {
      section('Campaigns', [company.campaignsIncomplete ? 'Memberships unavailable' : 'No known campaign']);
    }
    if (selected.Customers && selected.Customers !== company.Company) section('Customer', [selected.Customers]);
    section('Email domains', domainMap.get(lookup) || []);
    if (company.campaignsIncomplete) {
      selection.append(node('p', 'cp-dialog-notice', 'Campaign information could not be fully loaded. Close details and retry the source on the dashboard.'));
    }
    actions.append(
      pageLink('Open report', selected.folder || selected.Folder, 'cp-dialog-cta'),
      pageLink('Edit in DA', `https://da.live/canvas#/aemsites/summit-portal${folderToPath(selected.folder || selected.Folder)}/index`, 'cp-dialog-cta cp-dialog-cta-secondary'),
    );
    sharing.append(node('h3', '', 'Share this report'), buildShareForm(folderToDeepLink(selected.folder || selected.Folder)));
  }

  if (formats.length > 1) {
    const label = node('label', 'cp-field', 'Report format');
    const select = node('select', 'cp-format-select');
    select.setAttribute('aria-label', 'Report format');
    select.append(new Option('Choose a report format', ''));
    formats.forEach((format) => select.append(new Option(format.label, format.folder)));
    label.append(select);
    body.prepend(label, node('p', 'cp-format-help', 'Choose the exact report before opening, editing or sharing.'));
    select.addEventListener('change', () => renderSelection(formats.find((format) => format.folder === select.value)));
  }
  renderSelection(formats.length > 1 ? null : { ...company, ...(formats[0] || {}) });
  if (share) sharing.querySelector('input')?.focus();
}

function buildCampaignPicker(id, onChange) {
  const wrapper = node('div', 'cp-field cp-campaign-picker');
  const label = node('span', '', 'Campaign');
  label.id = `${id}-campaign-label`;
  const trigger = node('button', 'cp-campaign-trigger', 'All campaigns');
  trigger.type = 'button';
  trigger.setAttribute('aria-labelledby', `${label.id} ${id}-campaign-trigger`);
  trigger.id = `${id}-campaign-trigger`;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${id}-campaign-popup`);
  const popup = node('div', 'cp-campaign-popup');
  popup.id = `${id}-campaign-popup`;
  popup.hidden = true;
  const input = node('input', 'cp-campaign-search');
  input.type = 'search';
  input.placeholder = 'Search campaign name';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', 'Search campaigns');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', `${id}-campaign-options`);
  input.setAttribute('aria-expanded', 'true');
  const help = node('p', 'cp-campaign-help', 'Search by any part of a campaign name.');
  const list = node('div', 'cp-campaign-options');
  list.id = `${id}-campaign-options`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Campaigns');
  const status = node('p', 'cp-campaign-status');
  status.setAttribute('role', 'status');
  popup.append(input, help, list, status);
  wrapper.append(label, trigger, popup);
  let modes = [];
  let current = DEFAULT_MODE;
  let active = -1;

  function closePicker(focus = true) {
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    if (focus) trigger.focus();
  }

  function renderOptions() {
    active = -1;
    input.removeAttribute('aria-activedescendant');
    const selected = modes.find((mode) => mode.id === current);
    const matches = input.value.trim() ? searchCampaigns(modes, input.value)
      : [...(selected && current !== DEFAULT_MODE ? [selected] : []), modes[0]].filter(Boolean);
    list.replaceChildren();
    matches.forEach((mode, i) => {
      const choice = button(mode.displayLabel || mode.label, 'cp-campaign-option', () => {
        closePicker();
        onChange(mode.id);
      });
      choice.setAttribute('role', 'option');
      choice.setAttribute('aria-selected', String(mode.id === current));
      choice.id = `${id}-campaign-option-${i}`;
      choice.tabIndex = -1;
      list.append(choice);
    });
    help.hidden = !!input.value.trim();
    status.textContent = input.value.trim() ? `${matches.length} ${matches.length === 1 ? 'campaign' : 'campaigns'} found` : '';
    if (input.value.trim() && !matches.length) status.textContent = 'No matching campaigns. Try another part of the name.';
  }

  trigger.addEventListener('click', () => {
    if (popup.hidden) {
      popup.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      input.value = '';
      renderOptions();
      input.focus();
    } else closePicker();
  });
  input.addEventListener('input', renderOptions);
  wrapper.addEventListener('keydown', (event) => {
    if (popup.hidden) return;
    const choices = [...list.children];
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') active = 0;
      else if (event.key === 'End') active = choices.length - 1;
      else if (event.key === 'ArrowDown') active = Math.min(active + 1, choices.length - 1);
      else active = active <= 0 ? choices.length - 1 : active - 1;
      choices.forEach((choice, i) => choice.classList.toggle('cp-campaign-option-active', i === active));
      if (choices[active]) {
        input.setAttribute('aria-activedescendant', choices[active].id);
        choices[active].scrollIntoView({ block: 'nearest' });
      }
    } else if (event.key === 'Enter' && event.target === input) {
      event.preventDefault();
      choices[active < 0 ? 0 : active]?.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePicker();
    } else if (event.key === 'Tab') closePicker(false);
  });
  const outside = (event) => { if (!wrapper.contains(event.target)) closePicker(false); };
  document.addEventListener('pointerdown', outside);
  return {
    wrapper,
    update(choices, selected) {
      modes = choices;
      current = selected;
      trigger.textContent = modes.find((mode) => mode.id === current)?.displayLabel || 'Campaign unavailable';
      if (!popup.hidden) renderOptions();
    },
    close: closePicker,
    dispose: () => document.removeEventListener('pointerdown', outside),
  };
}

function renderTable(rows, openDialog, recordOpen) {
  const table = node('table', 'cp-table');
  table.setAttribute('role', 'table');
  const caption = node('caption', 'cp-visually-hidden', 'Digital Opportunity Reports');
  const head = node('thead');
  const headerRow = node('tr');
  ['Company', 'Website', 'Published', 'Actions'].forEach((title) => {
    const th = node('th', '', title);
    th.scope = 'col';
    if (title === 'Company') th.setAttribute('aria-sort', 'ascending');
    headerRow.append(th);
  });
  head.append(headerRow);
  const body = node('tbody');
  rows.forEach((company) => {
    const row = node('tr');
    row.setAttribute('role', 'row');
    const companyCell = node('td');
    const companyWrap = node('div', 'cp-company-wrap');
    const avatar = node('span', 'cp-company-avatar', company.Company.slice(0, 2).toUpperCase());
    avatar.setAttribute('aria-hidden', 'true');
    const name = button(company.Company, 'cp-company', () => openDialog(name, company));
    companyWrap.append(avatar, name);
    companyCell.append(companyWrap);
    const website = node('td', 'cp-website', company.Report || company.Domains || 'Not recorded');
    website.dataset.label = 'Website';
    const date = node('td', 'cp-published');
    date.dataset.label = 'Published';
    date.append(publishedDate(company.Created));
    const actions = node('td', 'cp-row-actions');
    const multiple = company.formats?.length > 1;
    let open;
    if (multiple) open = button('Open', 'cp-open', () => openDialog(open, company));
    else {
      open = pageLink('Open', company.Folder, 'cp-open');
      open.addEventListener('click', () => recordOpen(company));
    }
    const share = button('Share', 'cp-share-action', () => openDialog(share, company, true));
    const more = node('details', 'cp-more');
    const summary = node('summary', '', '\u2026');
    summary.setAttribute('aria-label', `More actions for ${company.Company}`);
    const menu = node('div', 'cp-more-options');
    const details = button('Report details', '', () => {
      more.open = false;
      openDialog(summary, company);
    });
    menu.append(details);
    if (multiple) {
      const edit = button('Edit in DA', '', () => {
        more.open = false;
        openDialog(summary, company);
      });
      menu.append(edit);
    } else {
      menu.append(pageLink('Edit in DA', `https://da.live/canvas#/aemsites/summit-portal${folderToPath(company.Folder)}/index`));
    }
    more.append(summary, menu);
    more.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        more.open = false;
        summary.focus();
      }
    });
    const mobileDetails = button('Report details', 'cp-details-action', () => openDialog(mobileDetails, company));
    actions.append(open, share, more, mobileDetails);
    [companyCell, website, date, actions].forEach((cell) => {
      cell.setAttribute('role', 'cell');
      row.append(cell);
    });
    body.append(row);
  });
  table.append(caption, head, body);
  return table;
}

function renderPagination(page, onChange) {
  const nav = node('nav', 'cp-pagination');
  nav.setAttribute('aria-label', 'Report pages');
  function pageButton(text, number, label) {
    const control = button(text, '', () => onChange(number, label));
    control.setAttribute('aria-label', label);
    return control;
  }
  const prev = pageButton('Previous', page.page - 1, 'Previous page');
  prev.disabled = page.page === 1;
  nav.append(prev);
  const numbers = [...new Set([1, page.page - 1, page.page, page.page + 1, page.pageCount])]
    .filter((value) => value >= 1 && value <= page.pageCount).sort((a, b) => a - b);
  numbers.forEach((number, i) => {
    if (i && number - numbers[i - 1] > 1) nav.append(node('span', '', '\u2026'));
    const control = pageButton(String(number), number, `Page ${number}`);
    if (number === page.page) control.setAttribute('aria-current', 'page');
    nav.append(control);
  });
  const next = pageButton('Next', page.page + 1, 'Next page');
  next.disabled = page.page === page.pageCount;
  nav.append(next);
  return nav;
}

function validSheetRow(row, kind) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  if (kind === 'registry') {
    if (Object.values(row).every((value) => value == null || String(value).trim() === '')) return true;
    return typeof row.Column === 'string' && !!row.Column.trim()
      && ['Id', 'Label', 'CampaignId'].every((field) => row[field] == null || typeof row[field] === 'string')
      && (!row.CampaignId || /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(row.Id || ''));
  }
  let fields = [];
  if (kind === 'index') fields = ['Report', 'Customers', 'Folder', 'Created', 'Report Notice'];
  if (kind === 'company') fields = ['Company', 'Folder', 'Domains'];
  if (kind === 'cug') fields = ['url', 'cug-groups'];
  if (!fields.every((field) => row[field] == null || typeof row[field] === 'string')) return false;
  if (kind !== 'index') return true;
  if (!row.Folder || !row.Folder.trim()) return false;
  const url = new URL(row.Folder, window.location.origin);
  return ['https:', 'http:'].includes(url.protocol);
}

async function loadSheet(sourceUrl, kind) {
  try {
    const rows = [];
    let total;
    do {
      const url = new URL(sourceUrl);
      if (rows.length) {
        url.searchParams.set('offset', rows.length);
        url.searchParams.set('limit', 1000);
      }
      const response = await fetch(url.href);
      if (!response.ok) return { state: response.status === 404 ? 'missing' : 'error', status: response.status };
      const body = await response.json();
      if (!Array.isArray(body.data) || !body.data.every((row) => validSheetRow(row, kind))) {
        throw new Error('Invalid sheet rows.');
      }
      const count = Number(body.total ?? body.data.length);
      if (!Number.isSafeInteger(count) || count < 0 || (total !== undefined && total !== count)
        || (body.offset != null && Number(body.offset) !== rows.length)
        || (rows.length && body.offset == null)
        || (count > rows.length && !body.data.length) || rows.length + body.data.length > count) {
        throw new Error('Incomplete or inconsistent sheet pagination.');
      }
      total = count;
      rows.push(...body.data);
    } while (rows.length < total);
    return { state: 'ready', rows };
  } catch (error) {
    return { state: 'error', message: error.message };
  }
}

let pickerCount = 0;

export default async function init(el) {
  const authored = el.querySelector('a[href$=".json"]');
  if (!authored) {
    el.replaceChildren(node('p', 'cp-state', 'Reports are not configured. Ask the page author to add the company-list source.'));
    return undefined;
  }
  pickerCount += 1;
  const id = `cp-${pickerCount}`;
  const companyUrl = new URL(authored.href);
  const urls = {
    company: companyUrl.href,
    index: new URL('insights-list.json', companyUrl).href,
    registry: new URL('event-tabs.json', companyUrl).href,
    cug: new URL('/closed-user-groups.json', companyUrl).href,
  };
  const sources = Object.fromEntries(Object.keys(urls).map((key) => [key, { state: 'loading' }]));
  const versions = {};
  const datasets = new Map();
  let eventModes = [];
  let membershipModes = [];
  let byPath = new Map();
  let maps = { websiteMap: new Map(), domainMap: new Map() };
  let disposed = false;
  let debounce;
  let opener;
  let openedCompany;
  let render;
  let load;
  let state = readReportState(window.location.search, []);
  if (state.unknownCampaign) {
    state.mode = state.unknownCampaign;
    state.unknownCampaign = '';
  }
  const notices = node('div', 'cp-catalog-notices');
  notices.setAttribute('role', 'status');
  const filters = node('div', 'cp-filters');
  const { wrapper: searchWrapper, input: search } = buildSearch();
  function change(patch, push = false) {
    clearTimeout(debounce);
    Object.assign(state, patch);
    render(push);
  }
  const picker = buildCampaignPicker(id, (mode) => change({ mode, page: 1, unknownCampaign: '' }, true));
  filters.append(searchWrapper, picker.wrapper);
  const recents = node('div', 'cp-recents-slot');
  const summary = node('div', 'cp-results-summary');
  const count = node('p', 'cp-result-count');
  count.setAttribute('role', 'status');
  const sizeLabel = node('label', 'cp-page-size', 'Rows per page');
  const size = node('select');
  size.setAttribute('aria-label', 'Rows per page');
  [25, 50, 100].forEach((value) => size.append(new Option(String(value), String(value))));
  sizeLabel.append(size);
  summary.append(count, sizeLabel);
  const results = node('div', 'cp-results');
  const pagination = node('div', 'cp-pagination-slot');
  el.replaceChildren(notices, filters, recents, summary, results, pagination);
  const { dialog, close, content } = buildDialog(id);

  function choices() {
    return [
      { id: DEFAULT_MODE, label: 'All campaigns', displayLabel: 'All campaigns' },
      ...qualifyCampaigns([{ id: 'portal', label: 'Adobe Summit 2026' }, ...eventModes]),
    ];
  }

  function companies(mode) {
    if (datasets.has(mode)) return datasets.get(mode);
    const raw = sources.index.rows || [];
    let rows;
    if (mode === 'portal') rows = (sources.company.rows || []).filter((row) => row.Folder && row.Company);
    else if (mode === DEFAULT_MODE) {
      rows = groupInsightsByWebsite(raw).map((row) => ({ ...row, Company: byPath.get(reportPath(row.Folder))?.Customers?.trim() || 'Company not recorded' }));
    } else {
      const event = eventModes.find((entry) => entry.id === mode);
      rows = event ? buildEventCompanies(raw, event.column) : [];
    }
    rows = rows.map((row) => {
      const selected = byPath.get(reportPath(row.Folder));
      return {
        ...row,
        Report: selected?.Report ?? row.Report,
        Customers: selected?.Customers ?? row.Customers,
        Created: selected?.Created ?? row.Created,
        ReportNotice: selected ? (selected['Report Notice'] || '') : row.ReportNotice,
      };
    });
    datasets.set(mode, rows);
    return rows;
  }

  function membership(folder) {
    const modes = qualifyCampaigns([{ id: 'portal', label: 'Adobe Summit 2026' }, ...membershipModes]);
    const memberships = campaignsForFolder(sources.index.rows || [], modes, folder);
    const legacy = sources.company.rows || [];
    if (legacy.some((row) => row.Folder && reportPath(row.Folder) === reportPath(folder))) {
      memberships.unshift({ id: 'portal', label: modes.find((mode) => mode.id === 'portal').displayLabel });
    }
    return memberships;
  }

  function showDialog(control, company, share = false) {
    opener = control;
    openedCompany = company;
    const report = {
      ...company,
      campaigns: membership(company.Folder),
      campaignsIncomplete: sources.registry.state !== 'ready' || sources.company.state !== 'ready',
    };
    report.formats = (company.formats || []).map((format) => {
      const raw = byPath.get(reportPath(format.folder)) || {};
      return {
        ...format,
        Report: raw.Report,
        Customers: raw.Customers,
        Created: raw.Created,
        ReportNotice: raw['Report Notice'] || '',
        campaigns: membership(format.folder),
      };
    });
    renderDialog(content, report, { id, ...maps, share });
    pushRecent(state.mode, company);
    dialog.showModal();
    if (share) content.querySelector('input, select')?.focus();
    else close.focus();
  }

  function refreshRecents() {
    const band = buildRecentBand(state.mode, companies(state.mode), showDialog);
    recents.replaceChildren(...(band ? [band] : []));
  }

  function closeDialog() {
    if (!dialog.open) return;
    const wasRecent = recents.contains(opener);
    dialog.close();
    refreshRecents();
    if (wasRecent) {
      opener = [...recents.querySelectorAll('.cp-card')]
        .find((card) => card.dataset.folder === openedCompany.Folder) || search;
    }
    if (opener?.isConnected) opener.focus();
  }

  function writeUrl(push = false) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', state.mode);
    if (state.query) url.searchParams.set('q', state.query);
    else url.searchParams.delete('q');
    url.searchParams.set('page', state.page);
    url.searchParams.set('size', state.size);
    if (url.href === window.location.href) return;
    window.history[push ? 'pushState' : 'replaceState'](null, '', url);
  }

  function sourceMessage(slot, key, text) {
    const source = sources[key];
    const message = node('div', 'cp-state');
    const description = node('p', '', text);
    message.append(description);
    if (source.status === 401) {
      const signIn = node('a', 'cp-sign-in', 'Sign in with Adobe ID');
      signIn.href = `/auth/portal?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      message.append(signIn);
    } else if (source.status !== 403 && source.state !== 'loading') {
      message.append(button('Retry', 'cp-retry', () => load([key])));
    }
    slot.append(message);
  }

  function renderNotices() {
    notices.replaceChildren();
    if (state.unknownCampaign) {
      notices.append(node('p', '', 'That campaign is no longer available. Showing All campaigns instead.'));
    }
    if (sources.registry.state === 'missing') {
      sourceMessage(notices, 'registry', 'The campaign list is incomplete. Only legacy campaign names can be shown until its registry is published.');
    } else if (sources.registry.state === 'error') {
      sourceMessage(notices, 'registry', 'The campaign list could not be loaded. Retry to restore campaign names and membership details.');
    }
    if (sources.company.state === 'error' || sources.company.state === 'missing') {
      sourceMessage(notices, 'company', 'Adobe Summit 2026 reports and related company information could not be loaded. Other report sources load separately.');
    }
    if (sources.cug.state === 'error' || sources.cug.state === 'missing') {
      sourceMessage(notices, 'cug', 'Email-domain access information could not be loaded. Report sharing still checks access when you use it.');
    }
  }

  render = (push = false) => {
    const modes = choices();
    const registryResolved = sources.registry.state === 'ready'
      || (sources.registry.state === 'missing' && sources.index.state === 'ready');
    const known = modes.some((mode) => mode.id.toLowerCase() === state.mode.toLowerCase());
    if (!known && registryResolved) {
      state.unknownCampaign = state.mode;
      state.mode = DEFAULT_MODE;
    }
    const resolvedMode = modes.find((mode) => mode.id.toLowerCase() === state.mode.toLowerCase());
    if (resolvedMode) state.mode = resolvedMode.id;
    picker.update(modes, state.mode);
    search.value = state.query;
    size.value = String(state.size);
    renderNotices();
    const required = state.mode === 'portal' ? 'company' : 'index';
    const source = sources[required];
    const waitingForCampaign = !known && !registryResolved;
    search.disabled = source.state !== 'ready' || waitingForCampaign;
    size.disabled = search.disabled;
    results.replaceChildren();
    pagination.replaceChildren();
    recents.replaceChildren();
    if (source.state !== 'ready' || waitingForCampaign) {
      const loading = source.state === 'loading' || (waitingForCampaign && sources.registry.state === 'loading');
      results.setAttribute('aria-busy', String(loading));
      count.textContent = loading ? 'Loading reports...' : 'Reports unavailable';
      let message = 'Reports could not be loaded. Please try again.';
      if (loading) message = waitingForCampaign ? 'Loading campaign and report information...' : 'Loading reports...';
      else if (source.status === 401) message = 'Sign in with Adobe ID to view reports.';
      else if (source.status === 403) message = 'Your account does not have access to these reports.';
      else if (waitingForCampaign) message = 'The selected campaign cannot be resolved until its campaign list loads. Retry above, or choose All campaigns.';
      sourceMessage(results, waitingForCampaign ? 'registry' : required, message);
      if (!waitingForCampaign) writeUrl(push);
      return;
    }
    results.setAttribute('aria-busy', 'false');
    const allRows = companies(state.mode);
    const page = paginateReports(filterReports(allRows, state.query), state);
    state.page = page.page;
    const first = page.total ? (page.page - 1) * state.size + 1 : 0;
    const last = Math.min(page.page * state.size, page.total);
    count.textContent = `${fmtCount(first)}-${fmtCount(last)} of ${fmtReports(page.total)}${state.mode === DEFAULT_MODE ? '' : ` in ${resolvedMode?.displayLabel || resolvedMode?.label}`}`;
    refreshRecents();
    if (page.rows.length) {
      results.append(renderTable(page.rows, showDialog, (company) => {
        pushRecent(state.mode, company);
        refreshRecents();
      }));
    } else {
      const empty = node('div', 'cp-empty');
      empty.append(node('h3', '', state.query ? 'No matching reports' : 'No reports yet'));
      empty.append(node('p', 'cp-empty-text', state.query
        ? `No company or website matches "${state.query}"${state.mode === DEFAULT_MODE ? '.' : ' in this campaign.'}`
        : 'Reports will appear here after they are published.'));
      if (state.mode !== DEFAULT_MODE) empty.append(button('Search all reports', 'cp-empty-action', () => change({ mode: DEFAULT_MODE, page: 1 }, true)));
      if (state.query) empty.append(button('Clear search', 'cp-empty-action', () => change({ query: '', page: 1 })));
      results.append(empty);
    }
    pagination.append(renderPagination(page, (number, label) => {
      change({ page: number }, true);
      const control = pagination.querySelector(`[aria-label="${label}"]:not(:disabled)`)
        || pagination.querySelector('[aria-current="page"]');
      control?.focus();
    }));
    writeUrl(push);
  };

  function rebuild() {
    const raw = sources.index.rows || [];
    byPath = new Map();
    raw.forEach((row) => {
      const path = reportPath(row.Folder);
      const previous = byPath.get(path);
      if (!previous || createdSortKey(row.Created) > createdSortKey(previous.Created)) {
        byPath.set(path, row);
      }
    });
    eventModes = sources.registry.state === 'ready'
      ? parseEventModes(sources.registry.rows, [])
      : [];
    // Retired registrations remain in exact-page details, not the filter picker.
    membershipModes = sources.registry.state === 'ready'
      ? parseEventModes(sources.registry.rows.map((row) => ({ ...row, Active: true })), [])
      : [];
    if (sources.registry.state === 'missing') {
      eventModes = deriveEventModes(raw);
      membershipModes = eventModes;
    }
    maps = buildLookupMaps({ data: sources.company.rows }, { data: sources.cug.rows });
    datasets.clear();
  }

  load = async (keys) => {
    await Promise.all(keys.map(async (key) => {
      versions[key] = (versions[key] || 0) + 1;
      const version = versions[key];
      sources[key] = { state: 'loading' };
      render();
      const result = await loadSheet(urls[key], key);
      if (disposed || version !== versions[key]) return;
      sources[key] = result;
      rebuild();
      render();
    }));
  };

  const popstate = () => {
    clearTimeout(debounce);
    closeDialog();
    picker.close(false);
    state = readReportState(window.location.search, choices());
    if (state.unknownCampaign && !['ready', 'missing'].includes(sources.registry.state)) {
      state.mode = state.unknownCampaign;
      state.unknownCampaign = '';
    }
    render();
  };
  window.addEventListener('popstate', popstate);
  close.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom) closeDialog();
  });
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    state.query = search.value;
    state.page = 1;
    debounce = setTimeout(() => render(), 120);
  });
  size.addEventListener('change', () => change({ size: Number(size.value), page: 1 }, true));
  render();
  // Let section decoration finish even while an optional sheet is still loading.
  const ready = load(Object.keys(urls));
  const dispose = () => {
    disposed = true;
    clearTimeout(debounce);
    window.removeEventListener('popstate', popstate);
    picker.dispose();
    dialog.remove();
  };
  dispose.ready = ready;
  return dispose;
}
