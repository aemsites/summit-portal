const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0-9'.replace(/(.)/g, '$1,').slice(0, -1).split(',');
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function getGroupKey(name) {
  const first = name.charAt(0).toUpperCase();
  return ALPHA.includes(first) ? first : '0-9';
}

function buildSearch(onInput) {
  const wrap = document.createElement('div');
  wrap.className = 'picker-search';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'picker-search-input';
  input.placeholder = 'Search companies…';
  input.setAttribute('aria-label', 'Search companies');
  input.addEventListener('input', () => onInput(input.value));

  wrap.append(input);
  return wrap;
}

function buildLetterNav(groups, onClick) {
  const nav = document.createElement('nav');
  nav.className = 'picker-letter-nav';
  nav.setAttribute('aria-label', 'Jump to letter');

  const allLetters = [...ALPHA, '0-9'];
  allLetters.forEach((letter) => {
    const btn = document.createElement('button');
    btn.className = 'picker-letter-btn';
    btn.textContent = letter;
    btn.type = 'button';
    if (!groups.has(letter)) btn.disabled = true;
    btn.addEventListener('click', () => onClick(letter));
    nav.append(btn);
  });

  return nav;
}

function buildDetail() {
  const backdrop = document.createElement('div');
  backdrop.className = 'picker-dialog-backdrop';
  backdrop.hidden = true;

  const dialog = document.createElement('div');
  dialog.className = 'picker-dialog';

  const close = document.createElement('button');
  close.className = 'picker-detail-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close details');
  close.innerHTML = '&times;';

  const content = document.createElement('div');
  content.className = 'picker-detail-content';

  dialog.append(close, content);
  backdrop.append(dialog);
  document.body.append(backdrop);

  return { panel: backdrop, dialog, close, content };
}

function renderDetail(content, company, websiteMap, domainMap) {
  const websites = websiteMap.get(company.Company) || [];
  const domains = domainMap.get(company.Company) || [];

  let html = `<h3 class="picker-detail-title">${company.Company}</h3>`;

  if (websites.length) {
    html += `<div class="picker-detail-section">
      <h4>Websites</h4>
      <ul class="picker-detail-list">
        ${websites.map((w) => {
    const href = /^https?:\/\//i.test(w) ? w : `https://${w}`;
    return `<li><a href="${href}" target="_blank" rel="noopener">${w}</a></li>`;
  }).join('')}
      </ul>
    </div>`;
  }

  if (domains.length) {
    html += `<div class="picker-detail-section">
      <h4>Email Domains</h4>
      <ul class="picker-detail-list">
        ${domains.map((d) => `<li>${d}</li>`).join('')}
      </ul>
    </div>`;
  }

  content.innerHTML = html;

  const actions = document.createElement('div');
  actions.className = 'picker-detail-actions';

  if (company.Folder) {
    const cta = document.createElement('a');
    cta.className = 'picker-detail-cta';
    cta.href = company.Folder;
    cta.textContent = 'Go to dashboard →';
    actions.append(cta);
  }

  const emailBody = [
    `Company: ${company.Company}`,
    '',
    'Current information:',
    `  Websites: ${websites.join(', ') || 'none'}`,
    `  Email Domains: ${domains.join(', ') || 'none'}`,
    '',
    'What should be updated:',
    '  ',
  ].join('\n');

  const request = document.createElement('a');
  request.className = 'picker-detail-request';
  request.href = `mailto:buergi@adobe.com?subject=${encodeURIComponent('Update portal data')}&body=${encodeURIComponent(emailBody)}`;
  request.textContent = 'Request update';
  actions.append(request);

  content.append(actions);
}

function buildGrid(companies, websiteMap, domainMap) {
  const grouped = new Map();
  companies.forEach((c) => {
    const key = getGroupKey(c.Company);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(c);
  });

  const sortedKeys = [...grouped.keys()].sort((a, b) => {
    if (a === '0-9') return 1;
    if (b === '0-9') return -1;
    return a.localeCompare(b);
  });

  const container = document.createElement('div');
  container.className = 'picker-grid';

  const { panel, close, content } = buildDetail();
  let activeCard = null;

  function closeDetail() {
    panel.hidden = true;
    if (activeCard) {
      activeCard.classList.remove('picker-card--active');
      activeCard.focus();
      activeCard = null;
    }
  }

  function openDetail(card, company) {
    if (activeCard) activeCard.classList.remove('picker-card--active');
    activeCard = card;
    card.classList.add('picker-card--active');
    renderDetail(content, company, websiteMap, domainMap);
    panel.hidden = false;
    close.focus();
  }

  close.addEventListener('click', closeDetail);
  panel.addEventListener('click', (e) => { if (e.target === panel) closeDetail(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) closeDetail(); });

  sortedKeys.forEach((letter) => {
    const section = document.createElement('div');
    section.className = 'picker-group';
    section.id = `group-${letter}`;

    const heading = document.createElement('h2');
    heading.className = 'picker-group-heading';
    heading.textContent = letter;
    section.append(heading);

    const cards = document.createElement('div');
    cards.className = 'picker-cards';

    grouped.get(letter).forEach((company) => {
      const btn = document.createElement('button');
      btn.className = 'picker-card';
      btn.type = 'button';
      btn.textContent = company.Company;
      btn.addEventListener('click', () => openDetail(btn, company));
      cards.append(btn);
    });

    section.append(cards);
    container.append(section);
  });

  return { container, groups: new Set(sortedKeys) };
}

function filterGrid(grid, query) {
  const q = query.toLowerCase().trim();
  grid.querySelectorAll('.picker-group').forEach((group) => {
    let visibleCount = 0;
    group.querySelectorAll('.picker-card').forEach((card) => {
      const match = !q || card.textContent.toLowerCase().includes(q);
      card.style.display = match ? '' : 'none';
      if (match) visibleCount += 1;
    });
    group.style.display = visibleCount ? '' : 'none';
  });
}

function buildLookupMaps(companyData, cugData) {
  // company-list: Company -> websites (Domains column)
  const websiteMap = new Map();
  (companyData?.data || []).forEach((row) => {
    const company = row.Company;
    const raw = row.Domains;
    if (company && raw) {
      const sites = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      if (sites.length) websiteMap.set(company, sites);
    }
  });

  // closed-user-groups: url uses glob patterns like /customers/0-9/abbvie**
  // Strip ** suffix and map to cug-groups; skip rows with empty cug-groups
  const cugByPath = new Map();
  (cugData?.data || []).forEach((row) => {
    const path = row.url?.replace(/\*+$/, '').replace(/\/$/, '');
    const groups = row['cug-groups'];
    if (path && groups) cugByPath.set(path, groups);
  });

  // domain map: Company -> [email domains]
  // Match company Folder (strip trailing slash) against cug path
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

export default async function init(el) {
  const link = el.querySelector('a[href$=".json"]');

  // Derive origin from the block's link so relative paths work across environments
  const origin = link ? new URL(link.href).origin : window.location.origin;

  const mappingUrl = link?.href || `${origin}/closed-user-groups-mapping.json`;
  const companyUrl = `${origin}/data/company-list.json`;
  const cugUrl = `${origin}/closed-user-groups.json`;

  el.textContent = '';
  el.classList.add('picker-loading');

  try {
    const [mappingResp, companyResp, cugResp] = await Promise.all([
      fetch(mappingUrl),
      fetch(companyUrl),
      fetch(cugUrl),
    ]);

    if (!mappingResp.ok) throw new Error(mappingResp.status);

    const { data } = await mappingResp.json();
    const companyData = companyResp.ok ? await companyResp.json() : null;
    const cugData = cugResp.ok ? await cugResp.json() : null;

    const { websiteMap, domainMap } = buildLookupMaps(companyData, cugData);

    el.classList.remove('picker-loading');

    const { container: grid, groups } = buildGrid(data, websiteMap, domainMap);
    const search = buildSearch((q) => filterGrid(grid, q));
    const letterNav = buildLetterNav(groups, (letter) => {
      const target = grid.querySelector(`#group-${CSS.escape(letter)}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    el.append(search, letterNav, grid);
  } catch {
    el.classList.remove('picker-loading');
    el.textContent = 'Unable to load company list.';
  }
}
