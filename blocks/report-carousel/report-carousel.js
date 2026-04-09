const DEFAULT_COLORS = ['#818cf8', '#fb7185', '#fb923c', '#34d399', '#60a5fa', '#a78bfa'];

function parsePair(line) {
  if (line.includes('|')) {
    const parts = line.split('|').map((s) => s.trim());
    return {
      label: parts[0] || '',
      value: parseFloat(parts[1]) || 0,
      value2: parseFloat(parts[2]) || 0,
      suffix: (() => {
        if (parts[2] && Number.isNaN(parseFloat(parts[2]))) return parts[2];
        if (parts[3] && Number.isNaN(parseFloat(parts[3]))) return parts[3];
        return '';
      })(),
      color: parts.find((p) => p.startsWith('#')) || null,
      color2: parts.filter((p) => p.startsWith('#'))[1] || null,
      extra: parts[4] || '',
      raw: parts,
    };
  }
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
  const type = paras[0]?.textContent.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!type) return null;
  let callout = '';
  const items = paras.slice(1)
    .map((p) => p.textContent.trim())
    .filter((t) => {
      if (t.toLowerCase().startsWith('callout:')) {
        callout = t.substring(8).trim();
        return false;
      }
      return Boolean(t);
    })
    .map(parsePair);
  return { type, items, callout };
}

function renderColumnChart(chartData) {
  const { items } = chartData;
  if (!items.length) return null;
  const chartH = 160;
  const barW = Math.min(64, Math.floor(280 / items.length) - 16);
  const gap = Math.min(28, barW / 2);
  const padX = 16;
  const padTop = 32;
  const labelH = 44;
  const maxVal = Math.max(...items.map((d) => Math.abs(d.value)));
  if (maxVal === 0) return null;
  const totalW = padX * 2 + items.length * barW + (items.length - 1) * gap;
  const totalH = padTop + chartH + labelH;

  const barsHtml = items.map((d, i) => {
    const color = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    const x = padX + i * (barW + gap);
    const barH = Math.max(2, (Math.abs(d.value) / maxVal) * chartH);
    const y = padTop + chartH - barH;
    const words = d.label.split(' ');
    const labelY = padTop + chartH + 16;
    const labelHtml = words.length > 2
      ? `<text x="${x + barW / 2}" y="${labelY}" text-anchor="middle" font-size="10" fill="#888">${words.slice(0, 2).join(' ')}</text>
         <text x="${x + barW / 2}" y="${labelY + 13}" text-anchor="middle" font-size="10" fill="#888">${words.slice(2).join(' ')}</text>`
      : `<text x="${x + barW / 2}" y="${labelY}" text-anchor="middle" font-size="10" fill="#888">${d.label}</text>`;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="4"/>
      <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${d.value}</text>
      ${labelHtml}`;
  }).join('');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
  svg.setAttribute('class', 'rc-chart-svg');
  svg.setAttribute('role', 'img');
  svg.innerHTML = barsHtml;
  return svg;
}

function renderLineChart(chartData) {
  const { items } = chartData;
  if (items.length < 2) return null;
  const W = 320;
  const H = 160;
  const padX = 24;
  const padTop = 16;
  const padBot = 32;
  const minVal = Math.min(...items.map((d) => d.value));
  const maxVal = Math.max(...items.map((d) => d.value));
  const range = maxVal - minVal || 1;
  const color = items[0].color || '#818cf8';

  const pts = items.map((d, i) => {
    const x = padX + (i / (items.length - 1)) * (W - padX * 2);
    const y = padTop + ((maxVal - d.value) / range) * (H - padTop - padBot);
    return { x, y, label: d.label, value: d.value };
  });

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${H - padBot} L ${pts[0].x} ${H - padBot} Z`;

  const dots = pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}"/>`).join('');
  const labels = [0, pts.length - 1].map((i) => {
    const p = pts[i];
    const anchor = i === 0 ? 'start' : 'end';
    return `<text x="${p.x}" y="${H - padBot + 16}" text-anchor="${anchor}" font-size="10" fill="#888">${p.label}</text>`;
  }).join('');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'rc-chart-svg');
  svg.setAttribute('role', 'img');
  svg.innerHTML = `
    <defs>
      <linearGradient id="rcArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaD}" fill="url(#rcArea)"/>
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${labels}`;
  return svg;
}

function renderStackedBar(chartData) {
  const { items } = chartData;
  if (!items.length) return null;
  const total = items.reduce((s, d) => s + d.value, 0) || 1;

  const wrap = document.createElement('div');
  wrap.className = 'rc-stacked-bar-wrap';

  const bar = document.createElement('div');
  bar.className = 'rc-stacked-bar';
  items.forEach((d, i) => {
    const seg = document.createElement('div');
    seg.className = 'rc-stacked-seg';
    const pct = (d.value / total) * 100;
    seg.style.width = `${pct}%`;
    seg.style.background = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    seg.title = `${d.label}: ${d.value}%`;
    bar.append(seg);
  });
  wrap.append(bar);

  const legend = document.createElement('div');
  legend.className = 'rc-stacked-legend';
  items.forEach((d, i) => {
    const item = document.createElement('div');
    item.className = 'rc-stacked-legend-item';
    const dot = document.createElement('span');
    dot.className = 'rc-stacked-dot';
    dot.style.background = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    const lbl = document.createElement('span');
    lbl.textContent = `${d.label} ${d.value}%`;
    item.append(dot, lbl);
    legend.append(item);
  });
  wrap.append(legend);
  return wrap;
}

function renderDonutChart(chartData) {
  const { items } = chartData;
  let centerLabel = '';
  let centerValue = '';
  const segments = items.filter((d) => {
    if (d.label.toLowerCase().startsWith('center:')) {
      centerLabel = d.label.slice(7).trim();
      centerValue = d.raw?.[1] || String(d.value);
      return false;
    }
    return true;
  });
  if (!segments.length) return null;
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;

  const cx = 80;
  const cy = 80;
  const r = 60;
  const innerR = 38;
  let angle = -Math.PI / 2;

  const arcs = segments.map((d, i) => {
    const slice = (d.value / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += slice;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const xi1 = cx + innerR * Math.cos(angle - slice);
    const yi1 = cy + innerR * Math.sin(angle - slice);
    const xi2 = cx + innerR * Math.cos(angle);
    const yi2 = cy + innerR * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    const fill = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${innerR} ${innerR} 0 ${large} 0 ${xi1} ${yi1} Z" fill="${fill}" opacity="0.9"/>`;
  }).join('');

  const centerHtml = centerValue
    ? `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="20" font-weight="800" fill="currentColor">${centerValue}</text>
       <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="9" fill="#888">${centerLabel}</text>`
    : '';

  const legend = segments.map((d, i) => {
    const fill = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    return `<text x="170" y="${20 + i * 18}" font-size="11" fill="currentColor">
      <tspan style="fill:${fill}">■</tspan> ${d.label} ${d.value}%
    </text>`;
  }).join('');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 280 160');
  svg.setAttribute('class', 'rc-chart-svg');
  svg.setAttribute('role', 'img');
  svg.innerHTML = `${arcs}${centerHtml}${legend}`;
  return svg;
}

function renderHorizontalBars(chartData) {
  const { items } = chartData;
  if (!items.length) return null;
  const maxVal = Math.max(...items.map((d) => d.value));
  const wrap = document.createElement('div');
  wrap.className = 'rc-hbars';
  items.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'rc-hbar-row';
    const color = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    const pct = maxVal ? (d.value / maxVal) * 100 : 0;
    const suffix = d.suffix || '';
    row.innerHTML = `
      <div class="rc-hbar-label">${d.label}</div>
      <div class="rc-hbar-track"><div class="rc-hbar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="rc-hbar-value">${d.value}${suffix}</div>`;
    wrap.append(row);
  });
  return wrap;
}

function renderBigFigure(chartData) {
  const { items } = chartData;
  const val = items[0]?.label || '';
  const unit = items[1]?.label || '';
  const ctx = items[2]?.label || '';
  const wrap = document.createElement('div');
  wrap.className = 'rc-bigfigure';
  wrap.innerHTML = `
    <div class="rc-bigfigure-value">${val}</div>
    ${unit ? `<div class="rc-bigfigure-unit">${unit}</div>` : ''}
    ${ctx ? `<div class="rc-bigfigure-ctx">${ctx}</div>` : ''}`;
  return wrap;
}

function renderMetricStrip(chartData) {
  const { items } = chartData;
  if (!items.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'rc-metric-strip';
  items.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'rc-metric-strip-row';
    const note = d.raw?.[2] || '';
    row.innerHTML = `
      <div class="rc-ms-label">${d.label}</div>
      <div class="rc-ms-value">${d.raw?.[1] || d.value || ''}</div>
      ${note ? `<div class="rc-ms-note">${note}</div>` : ''}`;
    wrap.append(row);
  });
  return wrap;
}

function renderRecommendationList(chartData) {
  const { items } = chartData;
  if (!items.length) return null;
  const TONE_ICONS = {
    growth: '📈',
    risk: '⏱',
    action: '✓',
    priority: '⚠',
    default: '📄',
  };
  const wrap = document.createElement('div');
  wrap.className = 'rc-rec-list';
  items.forEach((d) => {
    const tone = (d.raw?.[2] || 'default').trim().toLowerCase();
    const icon = TONE_ICONS[tone] || TONE_ICONS.default;
    const detail = d.raw?.[1] || '';
    const card = document.createElement('div');
    card.className = `rc-rec-card rc-rec-${tone}`;
    card.innerHTML = `
      <div class="rc-rec-icon">${icon}</div>
      <div class="rc-rec-body">
        <div class="rc-rec-title">${d.label}</div>
        ${detail ? `<div class="rc-rec-detail">${detail}</div>` : ''}
      </div>`;
    wrap.append(card);
  });
  return wrap;
}

function renderChart(chartData) {
  if (!chartData) return null;
  const { type } = chartData;
  if (type === 'linechart') return renderLineChart(chartData);
  if (type === 'stackedbar') return renderStackedBar(chartData);
  if (type === 'donutchart') return renderDonutChart(chartData);
  if (type === 'horizontalbars' || type === 'horizontalmetrics') return renderHorizontalBars(chartData);
  if (type === 'bigfigure') return renderBigFigure(chartData);
  if (type === 'metricstrip') return renderMetricStrip(chartData);
  if (type === 'recommendationlist') return renderRecommendationList(chartData);
  return renderColumnChart(chartData);
}

function buildSlideEl(slide) {
  const slideEl = document.createElement('div');
  slideEl.className = 'rc-slide';
  slideEl.dataset.tab = slide.tabIdx;

  const content = document.createElement('div');
  content.className = 'rc-slide-content';

  if (slide.badge) {
    const badge = document.createElement('span');
    badge.className = 'rc-badge';
    const bl = slide.badge.toLowerCase();
    let badgeType = 'insight';
    if (bl.includes('key')) badgeType = 'key';
    else if (bl.includes('no')) badgeType = 'no';
    else if (bl.includes('critical')) badgeType = 'critical';
    badge.dataset.type = badgeType;
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

  if (slide.chartData) {
    const visual = document.createElement('div');
    visual.className = 'rc-slide-visual';
    const chart = renderChart(slide.chartData);
    if (chart) visual.append(chart);
    if (slide.chartData.callout) {
      const calloutEl = document.createElement('p');
      calloutEl.className = 'rc-callout';
      calloutEl.textContent = slide.chartData.callout;
      visual.append(calloutEl);
    }
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
  // A row with a single cell whose text matches a tab label is a separator → advances the tab.
  // All other rows are slides belonging to the current tab.
  let currentTabIdx = 0;
  const slides = [];
  const tabSlides = tabLabels.map(() => []);

  rows.slice(1).forEach((row) => {
    const cells = [...row.children];

    // Separator row: 1 cell, text matches a tab label
    if (cells.length === 1) {
      const text = cells[0].textContent.trim().toLowerCase();
      const matchIdx = tabLabels.findIndex((l) => l.toLowerCase() === text);
      if (matchIdx !== -1) {
        currentTabIdx = matchIdx;
        return;
      }
    }

    // Slide row
    const badge = cells[0]?.textContent.trim() || '';

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

    const slide = {
      tabIdx: currentTabIdx, badge, titleHtml, descHtml, source, chartData, picture, footnote,
    };
    slides.push(slide);
    tabSlides[currentTabIdx].push(slide);
  });

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
    btn.addEventListener('click', () => switchTab(i)); // eslint-disable-line no-use-before-define
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

  const prevWrap = document.createElement('div');
  prevWrap.className = 'rc-nav-prev-wrap';
  const prevBtn = document.createElement('button');
  prevBtn.className = 'rc-nav-btn rc-nav-prev';
  prevBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  prevBtn.setAttribute('aria-label', 'Previous slide');
  const prevLabel = document.createElement('span');
  prevLabel.className = 'rc-nav-label';
  prevLabel.textContent = 'Previous slide';
  prevWrap.append(prevBtn, prevLabel);

  const dotsEl = document.createElement('div');
  dotsEl.className = 'rc-dots';

  const nextWrap = document.createElement('div');
  nextWrap.className = 'rc-nav-next-wrap';
  const nextLabel = document.createElement('span');
  nextLabel.className = 'rc-nav-label';
  nextLabel.textContent = 'Next slide';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'rc-nav-btn rc-nav-next';
  nextBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  nextBtn.setAttribute('aria-label', 'Next slide');
  nextWrap.append(nextLabel, nextBtn);

  nav.append(prevWrap, dotsEl, nextWrap);

  // Insert nav BEFORE slides (between tab bar and slides)
  el.insertBefore(nav, slidesWrap);

  // ── Slide counter footer ───────────────────────────────────
  const slideFooter = document.createElement('div');
  slideFooter.className = 'rc-slide-counter';
  const counterLeft = document.createElement('span');
  counterLeft.className = 'rc-counter-label';
  const counterRight = document.createElement('span');
  counterRight.className = 'rc-counter-desc';
  counterRight.textContent = 'Leadership view \u2014 portfolio risk, demand, and funding trade-offs.';
  slideFooter.append(counterLeft, counterRight);
  el.append(slideFooter);

  // ── State helpers ──────────────────────────────────────────
  function updateNav() {
    const count = tabSlides[currentTab].length;
    const curr = currentIdxByTab[currentTab];

    dotsEl.textContent = '';
    for (let i = 0; i < count; i += 1) {
      const dot = document.createElement('button');
      dot.className = 'rc-dot';
      dot.setAttribute('aria-label', `Slide ${i + 1} of ${count}`);
      if (i === curr) dot.classList.add('active');
      const ci = i;
      dot.addEventListener('click', () => goToSlide(ci)); // eslint-disable-line no-use-before-define
      dotsEl.append(dot);
    }

    prevBtn.disabled = curr === 0;
    nextBtn.disabled = curr === count - 1;

    // Update slide counter — count findings vs recommendations
    const currentSlide = tabSlides[currentTab][curr];
    const isRec = currentSlide && currentSlide.badge.toLowerCase() === 'recommendation';
    const allSlides = tabSlides[currentTab];
    if (isRec) {
      const recs = allSlides.filter((s) => s.badge.toLowerCase() === 'recommendation');
      const recIdx = recs.indexOf(currentSlide) + 1;
      counterLeft.textContent = `Recommendation ${recIdx} of ${recs.length}`;
    } else {
      const findings = allSlides.filter((s) => s.badge.toLowerCase() !== 'recommendation');
      const findIdx = findings.indexOf(currentSlide) + 1;
      counterLeft.textContent = `Finding ${findIdx} of ${findings.length}`;
    }
  }

  function goToSlide(localIdx, direction) {
    slideEls.forEach((slideEl) => {
      const inTab = parseInt(slideEl.dataset.tab, 10) === currentTab;
      const isTarget = parseInt(slideEl.dataset.localIdx, 10) === localIdx;
      if (inTab && isTarget) {
        slideEl.hidden = false;
        // Animate in
        const dir = direction === 'prev' ? -40 : 40;
        slideEl.style.opacity = '0';
        slideEl.style.transform = `translateX(${dir}px)`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            slideEl.style.opacity = '1';
            slideEl.style.transform = 'translateX(0)';
          });
        });
      } else {
        slideEl.hidden = true;
      }
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
    if (curr > 0) goToSlide(curr - 1, 'prev');
  });

  nextBtn.addEventListener('click', () => {
    const curr = currentIdxByTab[currentTab];
    if (curr < tabSlides[currentTab].length - 1) goToSlide(curr + 1, 'next');
  });

  updateNav();
}
