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

/** Human label for an insights landing-page format id, derived from the folder's
 *  last path segment (e.g. 'cannes-2026' -> 'Cannes Lions 2026'). */
function formatLabel(format) {
  const known = {
    'cannes-2026': 'Cannes Lions 2026',
    'summit-2026': 'Adobe Summit 2026',
  };
  if (known[format]) return known[format];
  return format
    .split('-')
    .map((p) => (/^\d+$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/**
 * Collapse insight-report rows so each WEBSITE is one card, not one card per
 * landing-page format. DIH publishes a row per website×format
 * (…/insights/<website>/<format>/), which otherwise renders the same website
 * multiple times. Group by the folder up to the website (drop the trailing
 * format segment); each group keeps its formats so the dialog can list them.
 */
function groupInsightsByWebsite(rows) {
  const groups = new Map();
  for (const row of rows) {
    const folder = (row.Folder || '').replace(/\/+$/, '');
    const lastSlash = folder.lastIndexOf('/');
    const format = lastSlash >= 0 ? folder.slice(lastSlash + 1) : '';
    const siteFolder = lastSlash >= 0 ? `${folder.slice(0, lastSlash)}/` : `${folder}/`;
    // key by the per-website folder so the same website under different accounts
    // (e.g. an orphaned vs. correct account) stays distinct.
    const key = siteFolder;
    if (!groups.has(key)) {
      groups.set(key, {
        Company: row.Report || row.Customers || siteFolder,
        Report: row.Report,
        Customers: row.Customers,
        Folder: siteFolder,
        Created: row.Created,
        formats: [],
      });
    }
    const g = groups.get(key);
    if (format && !g.formats.some((f) => f.format === format)) {
      g.formats.push({ format, label: formatLabel(format), folder: `${folder}/` });
    }
  }
  // stable, readable order within each card's format list
  for (const g of groups.values()) {
    g.formats.sort((a, b) => a.label.localeCompare(b.label));
  }
  return [...groups.values()];
}

function buildModeToggle(onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'cp-mode-toggle';

  for (const { id, label } of [
    { id: 'accounts', label: 'Accounts' },
    { id: 'insights', label: 'Insight Reports' },
    { id: 'portal', label: 'Summit 26 Portal' },
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

  // The key into websiteMap/domainMap differs for insight reports (keyed by the
  // customer name) vs. accounts/portal (keyed by company). Compute it once.
  const lookupKey = mode === 'insights' ? (company.Customers || company.Company) : company.Company;
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

    if (mode === 'insights' && company.Customers) {
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

    if (mode === 'insights' && company.formats && company.formats.length) {
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
      const ctaLabel = mode === 'insights' ? 'Open insight report' : 'Open customer portal page';
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
  if (mode === 'insights' && company.formats && company.formats.length) {
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
  // Insight reports: one row per website×format in the sheet → collapse to one
  // card per website, each carrying its available landing-page formats.
  const insightsCompanies = insightsResp.ok
    ? groupInsightsByWebsite((await insightsResp.json()).data || [])
    : [];
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
