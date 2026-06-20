const LETTERS = '0-9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(' ');

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

function getLetterGroup(name) {
  const first = name.trim().charAt(0).toUpperCase();
  return /\d/.test(first) ? '0-9' : first;
}

// Known event landing-page variants. A website folder can hold several of these
// in parallel (e.g. a Cannes and a Summit report), so they render as separate
// selectable reports inside one website card.
const EVENT_FORMATS = {
  'cannes-2026': 'Cannes Lions 2026',
  'summit-2026': 'Adobe Summit 2026',
};

/**
 * Event portal tabs. Each event is one extra mode in the picker, backed by one
 * column in `insights-list.json`: a row whose `<column>` cell is non-empty is in
 * that event, and the cell value is the card label (the event-specific company
 * name, which can differ per event). Add an event = add one row here + populate
 * the matching column in DA. Unlike the Insight Reports tab (one card per website
 * globally), event tabs build ONE CARD PER FLAGGED ROW so the same company can
 * appear in several events and two companies sharing a page each keep their card.
 */
const EVENT_MODES = [
  { id: 'cannes', label: 'Cannes 2026 Portal', column: 'Cannes 2026' },
  { id: 'sydney', label: 'Sydney Summit 2026', column: 'Sydney Summit 2026' },
];

const EVENT_MODE_IDS = new Set(EVENT_MODES.map((e) => e.id));

/**
 * Per-report data notices. A report's `Report Notice` cell (in insights-list)
 * holds one of these codes when a section was omitted because the third-party
 * data provider returned nothing for that customer's domain. The modal surfaces
 * the matching message so a sales rep understands it's a data limitation for
 * that domain — NOT an error in the report. Copy lives here; the sheet only
 * carries the code, so wording can change without re-tagging reports.
 */
const REPORT_NOTICES = {
  'no-ai-visibility': {
    title: 'No AI Visibility section',
    body: 'Our AI-visibility provider returned no data for this domain, so the AI Visibility section was left out. The rest of the report is complete.',
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

/** Website-report modes (Insight Reports + every event tab) share one dialog
 *  layout — websites, per-format reports, per-page share — distinct from the
 *  accounts/portal directory layout. */
function isReportMode(mode) {
  return mode === 'insights' || EVENT_MODE_IDS.has(mode);
}

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
    // Carry a per-report data notice (e.g. a section omitted because the data
    // provider returned nothing for this domain). The portal-landing row is the
    // canonical one; prefer its notice but fall back to any variant that has one.
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
        if (bare) formats.unshift({ format: '', label: 'Insight report', folder: bare.folder });
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

function buildModeToggle(onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'cp-mode-toggle';

  for (const { id, label } of [
    { id: 'accounts', label: 'Accounts' },
    { id: 'insights', label: 'Insight Reports' },
    { id: 'portal', label: 'Summit 26 Portal' },
    ...EVENT_MODES.map((e) => ({ id: e.id, label: e.label })),
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cp-mode-btn';
    btn.dataset.mode = id;
    btn.textContent = label;
    if (id === 'accounts') btn.classList.add('cp-mode-btn--active');
    btn.addEventListener('click', () => {
      wrapper.querySelectorAll('.cp-mode-btn').forEach((b) => b.classList.remove('cp-mode-btn--active'));
      btn.classList.add('cp-mode-btn--active');
      onChange(id);
    });
    wrapper.append(btn);
  }

  return wrapper;
}

function buildSearch() {
  const wrapper = document.createElement('div');
  wrapper.className = 'cp-search';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search insight reports…';
  input.className = 'cp-search-input';
  wrapper.append(input);

  return { wrapper, input };
}

function buildLetterNav(groups) {
  const nav = document.createElement('nav');
  nav.className = 'cp-letter-nav';
  nav.setAttribute('aria-label', 'Alphabetical navigation');

  for (const letter of LETTERS) {
    const btn = document.createElement('a');
    btn.className = 'cp-letter-btn';
    btn.textContent = letter;
    btn.href = `#cp-group-${letter}`;

    if (!groups.has(letter)) {
      btn.classList.add('cp-letter-disabled');
      btn.removeAttribute('href');
    } else {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(`cp-group-${letter}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    nav.append(btn);
  }

  return nav;
}

function buildDialog() {
  const backdrop = document.createElement('div');
  backdrop.className = 'cp-dialog-backdrop';
  backdrop.hidden = true;

  const dialog = document.createElement('div');
  dialog.className = 'cp-dialog';

  const close = document.createElement('button');
  close.className = 'cp-dialog-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close details');
  close.innerHTML = '&times;';

  const content = document.createElement('div');
  content.className = 'cp-dialog-content';

  dialog.append(close, content);
  backdrop.append(dialog);
  document.body.append(backdrop);

  return { backdrop, close, content };
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

/** Same-origin path for a shareable deep link — strips the origin but PRESERVES
 *  the page path exactly (incl. any trailing slash), so a folder/index page
 *  (e.g. `/accounts/.../1800flowers-com/`) resolves to its index. This mirrors
 *  the "Open" CTA, which links to `company.Folder` verbatim. */
function folderToDeepLink(folder) {
  try {
    return new URL(folder).pathname;
  } catch {
    return folder;
  }
}

/**
 * Build a share-by-email form that sends a 7-day magic link to a SPECIFIC page
 * `path`. Staff enter any email and the worker sends that address a one-click
 * link opening exactly that page — no login or separate magic-link request.
 * Page access is still enforced by the page's own CUG for anyone who navigates
 * there without the link. Returns the <form> wrapper element.
 */
function buildShareForm(path) {
  const wrap = document.createElement('div');
  wrap.className = 'cp-share-form-wrap';

  const hint = document.createElement('p');
  hint.className = 'cp-share-hint';
  hint.textContent = 'Sends a one-click link to any email that opens this page directly — no login needed. The link works for 7 days.';
  wrap.append(hint);

  const form = document.createElement('form');
  form.className = 'cp-share-form';

  const input = document.createElement('input');
  input.type = 'email';
  input.className = 'cp-share-input';
  input.placeholder = 'name@email.com';
  input.setAttribute('inputmode', 'email');
  input.setAttribute('autocomplete', 'off');
  input.required = true;

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'cp-dialog-cta cp-share-send';
  button.textContent = 'Send link';

  form.append(input, button);
  wrap.append(form);

  const status = document.createElement('p');
  status.className = 'cp-share-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  wrap.append(status);

  function setStatus(message, kind) {
    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim().toLowerCase();
    if (!email) return;

    button.disabled = true;
    input.disabled = true;
    setStatus('Sending…', 'pending');

    try {
      const resp = await fetch('/auth/sharelink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, path }),
      });
      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data.result === 'sent') {
        setStatus(`Sent a 7-day link to ${email} ✓`, 'success');
        input.value = '';
      } else if (resp.status === 401) {
        setStatus('Your session expired — please reload and sign in again.', 'error');
        input.disabled = false;
      } else {
        setStatus(data.error || 'Could not send the link. Please try again.', 'error');
        input.disabled = false;
      }
    } catch {
      setStatus('Network error — please try again.', 'error');
      input.disabled = false;
    } finally {
      button.disabled = false;
    }
  });

  return wrap;
}

/**
 * Single "Share this page" section bound to one page `path`. Used by
 * accounts/portal modes (one page per card). Insight reports share per format
 * instead (see the format rows in renderDialog).
 */
function buildShareSection(company) {
  if (!company.Folder) return null;

  // Preserve the trailing slash so the link lands on the folder's index page,
  // matching the "Open" CTA (which uses company.Folder verbatim).
  const path = folderToDeepLink(company.Folder);

  const section = document.createElement('div');
  section.className = 'cp-dialog-section cp-share';

  const heading = document.createElement('h4');
  heading.textContent = 'Share this page';
  section.append(heading);

  section.append(buildShareForm(path));
  return section;
}

function renderDialog(content, company, websiteMap, domainMap, mode) {
  let html = `<h3 class="cp-dialog-title">${company.Company}</h3>`;

  // Data-limitation notice (only on report modes; the value comes from the
  // report's `Report Notice` cell). Tells the rep a section is missing because
  // of the data available for that domain, not a generation error.
  const notice = isReportMode(mode) ? REPORT_NOTICES[company.ReportNotice] : null;
  if (notice) {
    html += `<div class="cp-dialog-notice" role="note">
      <span class="cp-dialog-notice-icon" aria-hidden="true">ℹ️</span>
      <div class="cp-dialog-notice-text">
        <strong>${notice.title}</strong>
        <span>${notice.body}</span>
      </div>
    </div>`;
  }

  const isReport = isReportMode(mode);

  // The key into websiteMap/domainMap differs for report modes (keyed by the
  // customer name) vs. accounts/portal (keyed by company). Compute it once.
  const lookupKey = isReport ? (company.Customers || company.Company) : company.Company;
  const domains = domainMap.get(lookupKey) || [];

  if (mode === 'accounts') {
    if (company.AM) {
      html += `<div class="cp-dialog-section">
        <h4>Account Manager</h4>
        <ul class="cp-dialog-list">
          <li>${company.AM}</li>
        </ul>
      </div>`;
    }
    if (company.Folder) {
      const editUrl = `https://da.live/canvas#/aemsites/summit-portal${folderToPath(company.Folder)}/index`;
      html += `<div class="cp-dialog-actions">
        <a class="cp-dialog-cta" href="${company.Folder}" target="_blank" rel="noopener">Open account page &rarr;</a>
        <a class="cp-dialog-cta cp-dialog-cta--secondary" href="${editUrl}" target="_blank" rel="noopener">Edit page</a>
      </div>`;
    }
  } else {
    const websites = websiteMap.get(lookupKey) || [];

    if (websites.length) {
      html += `<div class="cp-dialog-section">
        <h4>Websites</h4>
        <ul class="cp-dialog-list">
          ${websites.map((w) => {
            const href = /^https?:\/\//i.test(w) ? w : `https://${w}`;
            return `<li><a href="${href}" target="_blank" rel="noopener">${w}</a></li>`;
          }).join('')}
        </ul>
      </div>`;
    }

    if (isReport && company.Customers) {
      html += `<div class="cp-dialog-section">
        <h4>Customer</h4>
        <ul class="cp-dialog-list">
          <li>${company.Customers}</li>
        </ul>
      </div>`;
    } else if (domains.length) {
      html += `<div class="cp-dialog-section">
        <h4>Email Domains</h4>
        <ul class="cp-dialog-list">
          ${domains.map((d) => `<li>${d}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (isReport && company.formats && company.formats.length) {
      // One website can have several landing-page formats (Cannes, Summit, …).
      // Each format opens/edits/shares INDEPENDENTLY — sharing must target a
      // specific landing page, not the whole website folder. The Share button
      // toggles a per-format email form (wired up after innerHTML below).
      html += `<div class="cp-dialog-section">
        <h4>Available reports</h4>
        <div class="cp-format-list">
          ${company.formats.map((f, i) => {
            const editUrl = `https://da.live/canvas#/aemsites/summit-portal${folderToPath(f.folder)}/index`;
            return `<div class="cp-format" data-format-index="${i}">
              <div class="cp-format-row">
                <a class="cp-dialog-cta" href="${f.folder}" target="_blank" rel="noopener">${f.label} &rarr;</a>
                <a class="cp-dialog-cta cp-dialog-cta--secondary" href="${editUrl}" target="_blank" rel="noopener">Edit</a>
                <button type="button" class="cp-dialog-cta cp-dialog-cta--secondary cp-format-share-toggle" aria-expanded="false">Share</button>
              </div>
              <div class="cp-format-share" hidden></div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    } else if (company.Folder) {
      const ctaLabel = isReport ? 'Open insight report' : 'Open customer portal page';
      const editUrl = `https://da.live/canvas#/aemsites/summit-portal${folderToPath(company.Folder)}/index`;
      html += `<div class="cp-dialog-actions">
        <a class="cp-dialog-cta" href="${company.Folder}" target="_blank" rel="noopener">${ctaLabel} &rarr;</a>
        <a class="cp-dialog-cta cp-dialog-cta--secondary" href="${editUrl}" target="_blank" rel="noopener">Edit page</a>
      </div>`;
    }
  }

  content.innerHTML = html;

  // Insight reports: share PER FORMAT. Each "Share" button toggles a share form
  // bound to that format's specific page (lazily built on first open).
  if (isReport && company.formats && company.formats.length) {
    content.querySelectorAll('.cp-format').forEach((row) => {
      const fmt = company.formats[Number(row.dataset.formatIndex)];
      const toggle = row.querySelector('.cp-format-share-toggle');
      const slot = row.querySelector('.cp-format-share');
      if (!fmt || !toggle || !slot) return;
      toggle.addEventListener('click', () => {
        if (!slot.firstChild) slot.append(buildShareForm(folderToDeepLink(fmt.folder)));
        const open = slot.hidden;
        slot.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        if (open) slot.querySelector('.cp-share-input')?.focus();
      });
    });
  } else if (mode !== 'accounts') {
    // Single shared page (portal mode): one share form for the page.
    // The internal accounts directory is never shareable.
    const shareSection = buildShareSection(company);
    if (shareSection) content.append(shareSection);
  }
}

function buildCard(company, onOpen) {
  const card = document.createElement('button');
  card.className = 'cp-card';
  card.type = 'button';

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

function buildGrid(companies, onOpen) {
  const grouped = new Map();
  for (const c of companies) {
    const letter = getLetterGroup(c.Company);
    if (!grouped.has(letter)) grouped.set(letter, []);
    grouped.get(letter).push(c);
  }

  const sortedGroups = new Map();
  for (const letter of LETTERS) {
    if (grouped.has(letter)) sortedGroups.set(letter, grouped.get(letter));
  }

  const grid = document.createElement('div');
  grid.className = 'cp-grid';

  for (const [letter, items] of sortedGroups) {
    const section = document.createElement('div');
    section.className = 'cp-group';
    section.id = `cp-group-${letter}`;

    const heading = document.createElement('h2');
    heading.className = 'cp-group-heading';
    heading.textContent = letter;
    section.append(heading);

    const cards = document.createElement('div');
    cards.className = 'cp-cards';
    for (const company of items) {
      cards.append(buildCard(company, onOpen));
    }
    section.append(cards);
    grid.append(section);
  }

  return { grid, groups: sortedGroups };
}

function applyFilter(container, query) {
  const q = query.toLowerCase().trim();
  const groups = container.querySelectorAll('.cp-group');

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
  }
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

const SEARCH_PLACEHOLDERS = {
  insights: 'Search insight reports…',
  accounts: 'Search accounts…',
  portal: 'Search customers…',
  ...Object.fromEntries(EVENT_MODES.map((e) => [e.id, `Search ${e.label}…`])),
};

export default async function init(el) {
  const link = el.querySelector('a[href$=".json"]');
  if (!link) return;

  const { origin } = new URL(link.href);
  const insightsUrl = `${origin}/data/insights-list.json`;
  const accountsUrl = `${origin}/data/account-list.json`;
  const companyUrl = `${origin}/data/company-list.json`;
  const cugUrl = `${origin}/closed-user-groups.json`;

  const [portalResp, insightsResp, accountsResp, companyResp, cugResp] = await Promise.all([
    fetch(link.href),
    fetch(insightsUrl),
    fetch(accountsUrl),
    fetch(companyUrl),
    fetch(cugUrl),
  ]);
  if (!portalResp.ok) return;

  const portalCompanies = (await portalResp.json()).data || [];
  const insightRows = insightsResp.ok ? ((await insightsResp.json()).data || []) : [];
  // Insight reports: one row per website×variant in the sheet → collapse to one
  // card per website, each carrying its available landing-page formats.
  const insightsCompanies = groupInsightsByWebsite(insightRows);
  // Event portal tabs build directly from the flagged rows (one card per row),
  // independent of the website grouping above — see EVENT_MODES / buildEventCompanies.
  const eventCompanies = Object.fromEntries(
    EVENT_MODES.map((e) => [e.id, buildEventCompanies(insightRows, e.column)]),
  );
  const accountsCompanies = accountsResp.ok
    ? (await accountsResp.json()).data.map((r) => ({ ...r, Company: r.Account }))
    : [];
  const companyData = companyResp.ok ? await companyResp.json() : null;
  const cugData = cugResp.ok ? await cugResp.json() : null;

  const { websiteMap, domainMap } = buildLookupMaps(companyData, cugData);

  el.textContent = '';

  const { backdrop, close, content: dialogContent } = buildDialog();
  let activeCard = null;
  let currentMode = 'insights';

  function closeDialog() {
    backdrop.hidden = true;
    if (activeCard) {
      activeCard.classList.remove('cp-card--active');
      activeCard.focus();
      activeCard = null;
    }
  }

  function openDialog(card, company) {
    if (activeCard) activeCard.classList.remove('cp-card--active');
    activeCard = card;
    card.classList.add('cp-card--active');
    renderDialog(dialogContent, company, websiteMap, domainMap, currentMode);
    backdrop.hidden = false;
    close.focus();
    pushRecent(currentMode, company);
  }

  close.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDialog(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) closeDialog(); });

  const { wrapper: searchWrapper, input: searchInput } = buildSearch();
  const navContainer = document.createElement('div');
  const gridContainer = document.createElement('div');

  function renderMode(mode) {
    currentMode = mode;
    closeDialog();
    const companiesMap = {
      insights: insightsCompanies,
      accounts: accountsCompanies,
      portal: portalCompanies,
      ...eventCompanies,
    };
    const companies = companiesMap[mode] || [];
    searchInput.value = '';
    searchInput.placeholder = SEARCH_PLACEHOLDERS[mode] || 'Search…';

    const { grid, groups } = buildGrid(companies, openDialog);
    const letterNav = buildLetterNav(groups);

    const recentBand = buildRecentBand(mode, companies, openDialog);
    if (recentBand) navContainer.replaceChildren(recentBand, letterNav);
    else navContainer.replaceChildren(letterNav);
    gridContainer.replaceChildren(grid);
  }

  const modeToggle = buildModeToggle(renderMode);
  el.append(modeToggle, searchWrapper, navContainer, gridContainer);
  renderMode('accounts');

  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    const grid = gridContainer.querySelector('.cp-grid');
    debounce = setTimeout(() => applyFilter(grid, searchInput.value), 120);
  });
}
