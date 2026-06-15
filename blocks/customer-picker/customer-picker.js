const LETTERS = '0-9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(' ');

function getLetterGroup(name) {
  const first = name.trim().charAt(0).toUpperCase();
  return /\d/.test(first) ? '0-9' : first;
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
 * Build the "Share this page with a customer" form. Staff types the customer's
 * email and the worker emails them an authenticated deep link to this page.
 * Returns the section element, or null when there's nothing shareable.
 */
function buildShareSection(company, domains) {
  if (!company.Folder) return null;

  // Preserve the trailing slash so the link lands on the folder's index page,
  // matching the "Open" CTA (which uses company.Folder verbatim).
  const path = folderToDeepLink(company.Folder);
  const allowed = (domains || []).map((d) => d.trim().toLowerCase()).filter(Boolean);

  const section = document.createElement('div');
  section.className = 'cp-dialog-section cp-share';

  const heading = document.createElement('h4');
  heading.textContent = 'Share this page with a customer';
  section.append(heading);

  if (allowed.length) {
    const hint = document.createElement('p');
    hint.className = 'cp-share-hint';
    hint.textContent = `Allowed email domains: ${allowed.join(', ')}`;
    section.append(hint);
  }

  const form = document.createElement('form');
  form.className = 'cp-share-form';

  const input = document.createElement('input');
  input.type = 'email';
  input.className = 'cp-share-input';
  input.placeholder = 'customer@email.com';
  input.setAttribute('inputmode', 'email');
  input.setAttribute('autocomplete', 'off');
  input.required = true;

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'cp-dialog-cta cp-share-send';
  button.textContent = 'Send link';

  form.append(input, button);
  section.append(form);

  const status = document.createElement('p');
  status.className = 'cp-share-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  section.append(status);

  function setStatus(message, kind) {
    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim().toLowerCase();
    if (!email) return;

    // The worker is the authority on which domains may access the page
    // (its Gate 3 returns 403 `forbidden` with the allowed list), so we don't
    // re-check the domain here — that would just duplicate the rule and could
    // drift from the live CUG mapping.
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
        setStatus(`Sent to ${email} ✓`, 'success');
        input.value = '';
      } else if (resp.status === 403 && data.result === 'forbidden') {
        const list = (data.allowedDomains || allowed).join(', ');
        setStatus(`That email can't access this page. Allowed: ${list}`, 'error');
        input.disabled = false;
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

    if (company.Folder) {
      const ctaLabel = mode === 'insights' ? 'Open insight report' : 'Open customer portal page';
      const editUrl = `https://da.live/canvas#/aemsites/summit-portal${folderToPath(company.Folder)}/index`;
      html += `<div class="cp-dialog-actions">
        <a class="cp-dialog-cta" href="${company.Folder}" target="_blank" rel="noopener">${ctaLabel} &rarr;</a>
        <a class="cp-dialog-cta cp-dialog-cta--secondary" href="${editUrl}" target="_blank" rel="noopener">Edit page</a>
      </div>`;
    }
  }

  content.innerHTML = html;

  // Share form — only for customer-facing pages (insights / portal), never the
  // internal accounts directory.
  if (mode !== 'accounts') {
    const shareSection = buildShareSection(company, domains);
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
  const insightsCompanies = insightsResp.ok
    ? (await insightsResp.json()).data.map((r) => ({ ...r, Company: r.Report }))
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
    const companiesMap = { insights: insightsCompanies, accounts: accountsCompanies, portal: portalCompanies };
    const companies = companiesMap[mode] || [];
    searchInput.value = '';
    searchInput.placeholder = SEARCH_PLACEHOLDERS[mode] || 'Search…';

    const { grid, groups } = buildGrid(companies, openDialog);
    const letterNav = buildLetterNav(groups);

    navContainer.replaceChildren(letterNav);
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
