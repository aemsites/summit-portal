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

function buildCard(company) {
  const card = document.createElement('a');
  card.className = 'cp-card';
  card.href = company.Folder;

  const name = document.createElement('span');
  name.className = 'cp-card-name';
  name.textContent = company.Company;
  card.append(name);

  const arrow = document.createElement('span');
  arrow.className = 'cp-card-arrow';
  arrow.textContent = '→';
  card.append(arrow);

  return card;
}

function buildGrid(companies) {
  const grouped = new Map();
  for (const c of companies) {
    const letter = getLetterGroup(c.Company);
    if (!grouped.has(letter)) grouped.set(letter, []);
    grouped.get(letter).push(c);
  }

  // Sort groups in LETTERS order
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
      cards.append(buildCard(company));
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

export default async function init(el) {
  // Find JSON source link
  const link = el.querySelector('a[href$=".json"]');
  if (!link) return;

  const resp = await fetch(link.href);
  if (!resp.ok) return;
  const json = await resp.json();
  const companies = json.data || [];

  // Clear block content
  el.textContent = '';

  // Build UI
  const { wrapper: searchWrapper, input: searchInput } = buildSearch();
  const { grid, groups } = buildGrid(companies);
  const letterNav = buildLetterNav(groups);

  el.append(searchWrapper, letterNav, grid);

  // Search handler
  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => applyFilter(grid, searchInput.value), 120);
  });
}
