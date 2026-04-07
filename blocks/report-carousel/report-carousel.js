const DEFAULT_COLORS = ['#818cf8', '#fb7185', '#fb923c', '#34d399', '#60a5fa', '#a78bfa'];

function parsePair(line) {
  // Preferred format: "Label | value | #color" (pipe-separated, color optional)
  if (line.includes('|')) {
    const parts = line.split('|').map((s) => s.trim());
    return {
      label: parts[0] || '',
      value: parseFloat(parts[1]) || 0,
      color: parts[2] || null,
    };
  }
  // Fallback: "Label: value" (colon-separated, no color)
  const colonIdx = line.indexOf(':');
  if (colonIdx > 0) {
    return {
      label: line.slice(0, colonIdx).trim(),
      value: parseFloat(line.slice(colonIdx + 1).trim()) || 0,
      color: null,
    };
  }
  return { label: line.trim(), value: 0, color: null };
}

function parseChartData(cell) {
  if (!cell) return null;
  const paras = [...cell.querySelectorAll('p')];
  if (!paras.length) return null;
  const type = paras[0]?.textContent.trim().toLowerCase();
  if (!type) return null;
  const items = paras.slice(1)
    .map((p) => p.textContent.trim())
    .filter(Boolean)
    .map(parsePair);
  return { type, items };
}

function renderBarChart(chartData) {
  const { items } = chartData;
  if (!items.length) return null;

  const chartH = 160;
  const barW = 64;
  const gap = 28;
  const padX = 16;
  const padTop = 32;
  const labelH = 44;
  const rawMax = Math.max(...items.map((d) => Math.abs(d.value)));
  if (rawMax === 0) return null;
  const maxVal = rawMax;
  const totalW = padX * 2 + items.length * barW + (items.length - 1) * gap;
  const totalH = padTop + chartH + labelH;

  const barsHtml = items.map((d, i) => {
    const color = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    const x = padX + i * (barW + gap);
    const barH = Math.max(2, (Math.abs(d.value) / maxVal) * chartH);
    const y = padTop + chartH - barH;
    const labelLines = d.label.split(' ');
    const labelY1 = padTop + chartH + 18;
    const labelY2 = padTop + chartH + 32;
    const labelHtml = labelLines.length > 2
      ? `<text x="${x + barW / 2}" y="${labelY1}" text-anchor="middle" font-size="11" fill="#888">${labelLines.slice(0, 2).join(' ')}</text>
         <text x="${x + barW / 2}" y="${labelY2}" text-anchor="middle" font-size="11" fill="#888">${labelLines.slice(2).join(' ')}</text>`
      : `<text x="${x + barW / 2}" y="${labelY1}" text-anchor="middle" font-size="11" fill="#888">${d.label}</text>`;

    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="5"/>
      <text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${d.value}</text>
      ${labelHtml}
    `;
  }).join('');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
  svg.setAttribute('class', 'rc-chart-svg');
  svg.setAttribute('role', 'img');
  svg.innerHTML = barsHtml;
  return svg;
}

function buildSlideEl(slide) {
  const slideEl = document.createElement('div');
  slideEl.className = 'rc-slide';
  slideEl.dataset.tab = slide.tabIdx;

  // Content column
  const content = document.createElement('div');
  content.className = 'rc-slide-content';

  if (slide.badge) {
    const badge = document.createElement('span');
    badge.className = 'rc-badge';
    const bl = slide.badge.toLowerCase();
    // eslint-disable-next-line no-nested-ternary
    badge.dataset.type = bl.includes('key') ? 'key'
      : bl.includes('no') ? 'no'
        : bl.includes('critical') ? 'critical' : 'insight';
    badge.textContent = slide.badge;
    content.append(badge);
  }

  const titleEl = document.createElement('div');
  titleEl.className = 'rc-title';
  titleEl.innerHTML = slide.titleHtml;
  content.append(titleEl);

  if (slide.descHtml) {
    const descEl = document.createElement('div');
    descEl.className = 'rc-desc';
    descEl.innerHTML = slide.descHtml;
    content.append(descEl);
  }

  if (slide.source) {
    const sourceEl = document.createElement('p');
    sourceEl.className = 'rc-source';
    sourceEl.textContent = slide.source;
    content.append(sourceEl);
  }

  slideEl.append(content);

  // Visual column (chart or picture)
  if (slide.chartData) {
    const visual = document.createElement('div');
    visual.className = 'rc-slide-visual';
    const chart = renderBarChart(slide.chartData);
    if (chart) visual.append(chart);
    slideEl.append(visual);
  } else if (slide.picture) {
    const visual = document.createElement('div');
    visual.className = 'rc-slide-visual';
    visual.append(slide.picture);
    slideEl.append(visual);
  }

  if (slide.footnote) {
    const footnoteEl = document.createElement('div');
    footnoteEl.className = 'rc-footnote';
    footnoteEl.textContent = slide.footnote;
    slideEl.append(footnoteEl);
  }

  return slideEl;
}

export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  if (!rows.length) return;

  // First row = tabs (3 cells for tab labels, optional 4th for download link)
  const tabRow = rows[0];
  const tabCells = [...tabRow.children];
  const tabLabels = tabCells.slice(0, 3).map((c) => c.textContent.trim()).filter(Boolean);
  const downloadCell = tabCells[3];
  const downloadLink = downloadCell?.querySelector('a');

  // Parse slide rows (row 1 onward)
  const slides = rows.slice(1).map((row) => {
    const cells = [...row.children];
    // Cell 0: meta — paragraph 1 = tab index (1-3), paragraph 2 = badge text
    const metaParas = cells[0] ? [...cells[0].querySelectorAll('p')] : [];
    const tabIdx = Math.max(0, parseInt(metaParas[0]?.textContent.trim() || '1', 10) - 1);
    const badge = metaParas[1]?.textContent.trim() || '';

    // Cell 1: text content — heading = title, p = description, em = source
    const textCell = cells[1];
    const heading = textCell?.querySelector('h1,h2,h3,h4,h5,h6');
    const titleHtml = heading?.innerHTML || textCell?.querySelector('p strong,p b')?.innerHTML || '';
    const descParas = textCell ? [...textCell.querySelectorAll('p')] : [];
    const descHtml = descParas.map((p) => p.outerHTML).join('');
    const source = textCell?.querySelector('em,small')?.textContent.trim() || '';

    // Cell 2: chart data or picture
    const chartCell = cells[2];
    const picture = chartCell?.querySelector('picture');
    const chartData = picture ? null : parseChartData(chartCell);

    // Cell 3: optional footnote
    const footnote = cells[3]?.textContent.trim() || '';

    return { tabIdx, badge, titleHtml, descHtml, source, chartData, picture, footnote };
  });

  // Group slides by tab index
  const tabSlides = tabLabels.map((_, ti) => slides.filter((s) => s.tabIdx === ti));

  // Current state
  let currentTab = 0;
  const currentIdxByTab = tabLabels.map(() => 0);

  // Clear block and rebuild
  el.textContent = '';

  // ── Tab bar ────────────────────────────────────────────────
  const tabBar = document.createElement('div');
  tabBar.className = 'rc-tab-bar';

  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'rc-tabs';

  const tabBtns = tabLabels.map((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'rc-tab';
    btn.textContent = label;
    if (i === 0) btn.classList.add('active');
    btn.addEventListener('click', () => switchTab(i));
    tabsWrap.append(btn);
    return btn;
  });

  tabBar.append(tabsWrap);

  if (downloadLink) {
    const dlBtn = downloadLink.cloneNode(true);
    dlBtn.className = 'rc-download-btn';
    tabBar.append(dlBtn);
  }

  el.append(tabBar);

  // ── Slides wrapper ─────────────────────────────────────────
  const slidesWrap = document.createElement('div');
  slidesWrap.className = 'rc-slides-wrap';

  const slideEls = slides.map((slide) => {
    const slideEl = buildSlideEl(slide);
    const localIdx = tabSlides[slide.tabIdx].indexOf(slide);
    slideEl.dataset.localIdx = localIdx;
    slideEl.hidden = slide.tabIdx !== 0 || localIdx !== 0;
    slidesWrap.append(slideEl);
    return slideEl;
  });

  el.append(slidesWrap);

  // ── Navigation ─────────────────────────────────────────────
  const nav = document.createElement('div');
  nav.className = 'rc-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'rc-nav-btn rc-nav-prev';
  prevBtn.innerHTML = '&#8592; Previous slide';

  const dotsEl = document.createElement('div');
  dotsEl.className = 'rc-dots';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'rc-nav-btn rc-nav-next';
  nextBtn.innerHTML = 'Next slide &#8594;';

  nav.append(prevBtn, dotsEl, nextBtn);
  el.append(nav);

  // ── State helpers ──────────────────────────────────────────
  function updateNav() {
    const count = tabSlides[currentTab].length;
    const curr = currentIdxByTab[currentTab];

    dotsEl.textContent = '';
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button');
      dot.className = 'rc-dot';
      dot.setAttribute('aria-label', `Slide ${i + 1} of ${count}`);
      if (i === curr) dot.classList.add('active');
      const ci = i;
      dot.addEventListener('click', () => goToSlide(ci));
      dotsEl.append(dot);
    }

    prevBtn.disabled = curr === 0;
    nextBtn.disabled = curr === count - 1;
  }

  function goToSlide(localIdx) {
    slideEls.forEach((slideEl) => {
      const inTab = parseInt(slideEl.dataset.tab, 10) === currentTab;
      const isTarget = parseInt(slideEl.dataset.localIdx, 10) === localIdx;
      slideEl.hidden = !(inTab && isTarget);
    });
    currentIdxByTab[currentTab] = localIdx;
    updateNav();
  }

  function switchTab(tabIdx) {
    currentTab = tabIdx;
    tabBtns.forEach((btn, i) => btn.classList.toggle('active', i === tabIdx));
    const curr = currentIdxByTab[tabIdx];
    slideEls.forEach((slideEl) => {
      const inTab = parseInt(slideEl.dataset.tab, 10) === tabIdx;
      const isActive = parseInt(slideEl.dataset.localIdx, 10) === curr;
      slideEl.hidden = !(inTab && isActive);
    });
    updateNav();
  }

  prevBtn.addEventListener('click', () => {
    const curr = currentIdxByTab[currentTab];
    if (curr > 0) goToSlide(curr - 1);
  });

  nextBtn.addEventListener('click', () => {
    const curr = currentIdxByTab[currentTab];
    if (curr < tabSlides[currentTab].length - 1) goToSlide(curr + 1);
  });

  updateNav();
}
