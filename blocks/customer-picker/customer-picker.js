const LETTERS = '0-9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(' ');

function getLetterGroup(name) {
  const first = name.trim().charAt(0).toUpperCase();
  return /\d/.test(first) ? '0-9' : first;
}

function buildSearch() {
  const wrapper = document.createElement('div');
  wrapper.className = 'cp-search';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search customers…';
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

function renderDialog(content, company, websiteMap, domainMap) {
  const websites = websiteMap.get(company.Company) || [];
  const domains = domainMap.get(company.Company) || [];

  let html = `<h3 class="cp-dialog-title">${company.Company}</h3>`;

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

  if (domains.length) {
    html += `<div class="cp-dialog-section">
      <h4>Email Domains</h4>
      <ul class="cp-dialog-list">
        ${domains.map((d) => `<li>${d}</li>`).join('')}
      </ul>
    </div>`;
  }

  if (company.Folder) {
    html += `<a class="cp-dialog-cta" href="${company.Folder}" target="_blank" rel="noopener">Go to dashboard &rarr;</a>`;
  }

  content.innerHTML = html;
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

function buildGrid(companies, websiteMap, domainMap) {
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

  const { backdrop, close, content } = buildDialog();
  let activeCard = null;

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
    renderDialog(content, company, websiteMap, domainMap);
    backdrop.hidden = false;
    close.focus();
  }

  close.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDialog(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) closeDialog(); });

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
      cards.append(buildCard(company, openDialog));
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

export default async function init(el) {
  const link = el.querySelector('a[href$=".json"]');
  if (!link) return;

  const origin = new URL(link.href).origin;
  const companyUrl = `${origin}/data/company-list.json`;
  const cugUrl = `${origin}/closed-user-groups.json`;

  const [mappingResp, companyResp, cugResp] = await Promise.all([
    fetch(link.href),
    fetch(companyUrl),
    fetch(cugUrl),
  ]);
  if (!mappingResp.ok) return;

  const companies = (await mappingResp.json()).data || [];
  const companyData = companyResp.ok ? await companyResp.json() : null;
  const cugData = cugResp.ok ? await cugResp.json() : null;

  const { websiteMap, domainMap } = buildLookupMaps(companyData, cugData);

  el.textContent = '';

  const { wrapper: searchWrapper, input: searchInput } = buildSearch();
  const { grid, groups } = buildGrid(companies, websiteMap, domainMap);
  const letterNav = buildLetterNav(groups);

  el.append(searchWrapper, letterNav, grid);

  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => applyFilter(grid, searchInput.value), 120);
  });
}
