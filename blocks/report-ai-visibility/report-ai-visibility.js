// ── Shared helpers ──────────────────────────────────────────────────────────

const COLORS = ['#818cf8', '#fb7185', '#fb923c', '#34d399', '#60a5fa', '#a78bfa'];

function parsePair(text) {
  const parts = text.split('|').map((s) => s.trim());
  return {
    label: parts[0] || '',
    value: parseFloat(parts[1]) || 0,
    suffix: parts.find((p, i) => i > 1 && !p.startsWith('#') && Number.isNaN(parseFloat(p))) || '',
    color: parts.find((p) => p.startsWith('#')) || null,
    badge: parts[4] || '',
    raw: parts,
  };
}

function parseChartCell(cell) {
  if (!cell) return null;
  const paras = [...cell.querySelectorAll('p')];
  if (!paras.length) return null;
  const type = paras[0]?.textContent.trim().toLowerCase().replace(/\s+/g, '');
  if (!type) return null;
  const items = paras.slice(1).map((p) => p.textContent.trim()).filter(Boolean).map(parsePair);
  return { type, items };
}

// ── Chart renderers ─────────────────────────────────────────────────────────

function renderBigFigure(data) {
  const item = data.items[0];
  if (!item) return null;
  const wrap = document.createElement('div');
  wrap.className = 'rav-bigfigure';
  wrap.innerHTML = `
    <div class="rav-bf-value">${item.raw[0] || ''}</div>
    ${item.raw[1] ? `<div class="rav-bf-unit">${item.raw[1]}</div>` : ''}
    ${item.raw[2] ? `<div class="rav-bf-ctx">${item.raw[2]}</div>` : ''}`;
  return wrap;
}

function renderHorizontalBars(data) {
  const { items } = data;
  if (!items.length) return null;
  const rawMax = Math.max(...items.map((d) => d.value)) || 1;
  const wrap = document.createElement('div');
  wrap.className = 'rav-hbars';
  items.forEach((d, i) => {
    const pct = (d.value / rawMax) * 100;
    const color = d.color || COLORS[i % COLORS.length];
    const row = document.createElement('div');
    row.className = 'rav-hbar-row';
    row.innerHTML = `
      <span class="rav-hbar-label">${d.label}</span>
      <div class="rav-hbar-track">
        <div class="rav-hbar-fill" style="--bar-w:${pct}%;background:${color};transition-delay:${i * 0.08}s"></div>
      </div>
      <span class="rav-hbar-val">${d.value}${d.suffix}</span>
      ${d.badge ? `<span class="rav-hbar-badge">${d.badge}</span>` : ''}`;
    wrap.append(row);
  });
  return wrap;
}

function renderPlatformBars(data) {
  const { items } = data;
  if (!items.length) return null;
  const rawMax = Math.max(...items.map((d) => d.value)) || 1;
  const wrap = document.createElement('div');
  wrap.className = 'rav-hbars rav-platform-bars';
  items.forEach((d, i) => {
    const pct = (d.value / rawMax) * 100;
    const color = d.color || COLORS[i % COLORS.length];
    const initial = d.label.charAt(0).toUpperCase();
    const row = document.createElement('div');
    row.className = 'rav-hbar-row rav-platform-row';
    row.innerHTML = `
      <span class="rav-platform-icon" style="background:${color}">${initial}</span>
      <span class="rav-hbar-label rav-platform-label">${d.label}</span>
      <div class="rav-hbar-track">
        <div class="rav-hbar-fill" style="--bar-w:${pct}%;background:${color};transition-delay:${i * 0.08}s"></div>
      </div>
      <span class="rav-hbar-val">${d.value}${d.suffix}</span>
      ${d.badge ? `<span class="rav-hbar-badge">${d.badge}</span>` : ''}`;
    wrap.append(row);
  });
  return wrap;
}

function renderScoreTable(data) {
  const { items } = data;
  if (!items.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'rav-scoretable';
  const hdr = document.createElement('div');
  hdr.className = 'rav-st-row rav-st-header';
  hdr.innerHTML = '<span></span><span>MENTIONS</span><span>CITATIONS</span><span>SCORE</span>';
  wrap.append(hdr);
  items.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = `rav-st-row${i === 0 ? ' rav-st-highlight' : ''}`;
    row.innerHTML = `
      <span class="rav-st-brand">${d.label}</span>
      <span>${d.raw[1] ?? '—'}</span>
      <span>${d.raw[2] ?? '—'}</span>
      <span>${d.raw[3] ?? '—'}</span>`;
    wrap.append(row);
  });
  return wrap;
}

function renderChart(data) {
  if (!data) return null;
  if (data.type === 'bigfigure') return renderBigFigure(data);
  if (data.type === 'horizontalbars') return renderHorizontalBars(data);
  if (data.type === 'platformbars') return renderPlatformBars(data);
  if (data.type === 'scoretable') return renderScoreTable(data);
  return null;
}

// ── Section renderers ───────────────────────────────────────────────────────

function renderStats(rows) {
  const grid = document.createElement('div');
  grid.className = 'rav-stats';
  rows.forEach(({ cells }, i) => {
    const card = document.createElement('div');
    card.className = `rav-stat-card${i === 0 ? ' rav-stat-accent' : ''}`;
    const label = document.createElement('div');
    label.className = 'rav-stat-label';
    label.textContent = cells[1]?.textContent.trim() || '';
    const valueParagraphs = [...(cells[2]?.querySelectorAll('p') || [])];
    const valueEl = document.createElement('div');
    valueEl.className = 'rav-stat-value';
    valueEl.textContent = (valueParagraphs[0]?.textContent || cells[2]?.textContent || '').trim();
    card.append(label, valueEl);
    if (valueParagraphs[1]) {
      const delta = document.createElement('div');
      delta.className = 'rav-stat-delta';
      delta.textContent = valueParagraphs[1].textContent.trim();
      card.append(delta);
    }
    const sub = (cells[3]?.textContent || '').trim();
    if (sub) {
      const subEl = document.createElement('div');
      subEl.className = 'rav-stat-sublabel';
      subEl.textContent = sub;
      card.append(subEl);
    }
    grid.append(card);
  });
  return grid;
}

function renderPlatforms({ cells }) {
  const wrap = document.createElement('div');
  wrap.className = 'rav-platforms';
  const lbl = document.createElement('span');
  lbl.className = 'rav-platforms-label';
  lbl.textContent = (cells[1]?.textContent || '').trim();
  const pills = document.createElement('div');
  pills.className = 'rav-platforms-pills';
  (cells[2]?.textContent || '').split('|').map((s) => s.trim()).filter(Boolean).forEach((name) => {
    const pill = document.createElement('span');
    pill.className = 'rav-platform-pill';
    pill.textContent = name;
    pills.append(pill);
  });
  wrap.append(lbl, pills);
  return wrap;
}

function renderPanel({ cells }) {
  const panel = document.createElement('div');
  panel.className = 'rav-panel';
  // Title
  const titleEl = cells[1]?.querySelector('h2,h3,h4');
  if (titleEl) {
    const h = document.createElement('h3');
    h.className = 'rav-panel-title';
    h.textContent = titleEl.textContent.trim();
    panel.append(h);
  }
  // Subtitle: paragraphs in col2
  const subs = [...(cells[1]?.querySelectorAll('p') || [])].map((p) => p.textContent.trim()).filter(Boolean);
  if (subs.length) {
    const sub = document.createElement('p');
    sub.className = 'rav-panel-sub';
    sub.textContent = subs.join(' ');
    panel.append(sub);
  }
  // Chart
  const chartData = parseChartCell(cells[2]);
  const chart = renderChart(chartData);
  if (chart) {
    const cw = document.createElement('div');
    cw.className = 'rav-panel-chart';
    cw.append(chart);
    panel.append(cw);
  }
  // Footnote
  const footnote = (cells[3]?.textContent || '').trim();
  if (footnote) {
    const fn = document.createElement('p');
    fn.className = 'rav-panel-footnote';
    fn.textContent = footnote;
    panel.append(fn);
  }
  return panel;
}

function renderGap({ cells }) {
  const wrap = document.createElement('div');
  wrap.className = 'rav-gap';
  const icon = document.createElement('span');
  icon.className = 'rav-gap-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⚠';
  const content = document.createElement('div');
  content.className = 'rav-gap-content';
  content.innerHTML = (cells[1]?.innerHTML || cells[2]?.innerHTML || '');
  wrap.append(icon, content);
  return wrap;
}

function renderCta({ cells }) {
  const wrap = document.createElement('div');
  wrap.className = 'rav-cta';
  const left = document.createElement('div');
  left.className = 'rav-cta-left';
  left.innerHTML = cells[1]?.innerHTML || '';
  wrap.append(left);
  const link = cells[2]?.querySelector('a');
  if (link) {
    link.className = 'rav-cta-btn';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    wrap.append(link);
  }
  return wrap;
}

function renderInsight({ cells }) {
  const wrap = document.createElement('div');
  wrap.className = 'rav-insight';
  const icon = document.createElement('span');
  icon.className = 'rav-insight-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '💡';
  const content = document.createElement('div');
  content.className = 'rav-insight-content';
  content.innerHTML = cells[1]?.innerHTML || '';
  wrap.append(icon, content);
  return wrap;
}

// ── Main decorator ──────────────────────────────────────────────────────────

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')].map((el) => ({
    type: [...el.children][0]?.textContent.trim().toLowerCase() || '',
    cells: [...el.children],
  }));

  const container = document.createElement('div');
  container.className = 'rav-container';

  let i = 0;
  while (i < rows.length) {
    const { type } = rows[i];

    if (type === 'stats') {
      const group = [];
      while (i < rows.length && rows[i].type === 'stats') { group.push(rows[i]); i += 1; }
      container.append(renderStats(group));
    } else if (type === 'platforms') {
      container.append(renderPlatforms(rows[i]));
      i += 1;
    } else if (type === 'headline' || type === 'comparison') {
      const panelWrap = document.createElement('div');
      panelWrap.className = 'rav-panels';
      while (i < rows.length && (rows[i].type === 'headline' || rows[i].type === 'comparison')) {
        panelWrap.append(renderPanel(rows[i]));
        i += 1;
      }
      container.append(panelWrap);
    } else if (type === 'gap') {
      container.append(renderGap(rows[i]));
      i += 1;
    } else if (type === 'cta') {
      container.append(renderCta(rows[i]));
      i += 1;
    } else if (type === 'insight') {
      container.append(renderInsight(rows[i]));
      i += 1;
    } else {
      i += 1;
    }
  }

  block.textContent = '';
  block.append(container);

  // Trigger bar animations on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('rav-animate');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  observer.observe(block);
}
