// ── Shared helpers for the report-ai-visibility block ───

/** Bar / platform icon fills — Adobe spectrum scale from styles/styles.css */
const COLORS = [
  'var(--color-purple-500)',
  'var(--color-magenta-500)',
  'var(--color-orange-400)',
  'var(--color-green-400)',
  'var(--color-blue-500)',
  'var(--color-teal-500)',
];

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Pixel size for brand marks in platform pills and bar rows */
const PLATFORM_ICON_PX = 20;

/** @param {string} name */
function platformIconKind(name) {
  const n = (name || '').trim().toLowerCase();
  if (n.includes('perplexity')) return 'perplexity';
  if (n.includes('chatgpt') || n.includes('openai')) return 'chatgpt';
  if (n.includes('google') || n.includes('gemini')) return 'google';
  return 'generic';
}

/** One pill per brand mark: skips duplicate names and extra Google/Gemini entries. */
function uniqueNamesForPlatformPills(names) {
  const seen = new Set();
  return names.filter((raw) => {
    const name = raw.trim();
    if (!name) return false;
    const kind = platformIconKind(name);
    const key = kind === 'generic' ? `name:${name.toLowerCase()}` : `kind:${kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createGooglePlatformSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'rav-platform-pill-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(PLATFORM_ICON_PX));
  svg.setAttribute('height', String(PLATFORM_ICON_PX));
  svg.setAttribute('aria-hidden', 'true');
  const paths = [
    ['#4285F4', 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'],
    ['#34A853', 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'],
    ['#FBBC05', 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'],
    ['#EA4335', 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'],
  ];
  paths.forEach(([fill, d]) => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('fill', fill);
    p.setAttribute('d', d);
    svg.append(p);
  });
  return svg;
}

/** ChatGPT mark derived from Wikimedia Commons (trademark OpenAI). */
function createChatGptPlatformSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'rav-platform-pill-icon');
  svg.setAttribute('viewBox', '0 0 2406 2406');
  svg.setAttribute('width', String(PLATFORM_ICON_PX));
  svg.setAttribute('height', String(PLATFORM_ICON_PX));
  svg.setAttribute('aria-hidden', 'true');

  const bg = document.createElementNS(SVG_NS, 'path');
  bg.setAttribute('d', 'M1 578.4C1 259.5 259.5 1 578.4 1h1249.1c319 0 577.5 258.5 577.5 577.4V2406H578.4C259.5 2406 1 2147.5 1 1828.6V578.4z');
  bg.setAttribute('fill', '#74aa9c');
  svg.append(bg);

  const armId = `rav-cgpt-arm-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 11)}`;
  const arm = document.createElementNS(SVG_NS, 'path');
  arm.setAttribute('id', armId);
  arm.setAttribute('fill', '#fff');
  arm.setAttribute('d', 'M1107.3 299.1c-197.999 0-373.9 127.3-435.2 315.3L650 743.5v427.9c0 21.4 11 40.4 29.4 51.4l344.5 198.515V833.3h.1v-27.9L1372.7 604c33.715-19.52 70.44-32.857 108.47-39.828L1447.6 450.3C1361 353.5 1237.1 298.5 1107.3 299.1zm0 117.5-.6.6c79.699 0 156.3 27.5 217.6 78.4-2.5 1.2-7.4 4.3-11 6.1L952.8 709.3c-18.4 10.4-29.4 30-29.4 51.4V1248l-155.1-89.4V755.8c-.1-187.099 151.601-338.9 339-339.2z');
  svg.append(arm);

  [60, 120, 180, 240, 300].forEach((deg) => {
    const u = document.createElementNS(SVG_NS, 'use');
    u.setAttributeNS(XLINK_NS, 'href', `#${armId}`);
    u.setAttribute('href', `#${armId}`);
    u.setAttribute('transform', `rotate(${deg} 1203 1203)`);
    svg.append(u);
  });

  return svg;
}

/** Perplexity mark: wireframe from brand wordmark SVG (trademark Perplexity). */
function createPerplexityPlatformSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'rav-platform-pill-icon');
  svg.setAttribute('viewBox', '0 0 24 38');
  svg.setAttribute('width', String(PLATFORM_ICON_PX));
  svg.setAttribute('height', String(PLATFORM_ICON_PX));
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', '#20808d');
  p.setAttribute('stroke-width', '1.85');
  p.setAttribute('stroke-miterlimit', '10');
  p.setAttribute('d', 'm23.566,1.398l-9.495,9.504h9.495V1.398v2.602V1.398Zm-9.496,9.504L4.574,1.398v9.504h9.496Zm-.021-10.902v36m9.517-15.596l-9.495-9.504v13.625l9.495,9.504v-13.625Zm-18.991,0l9.496-9.504v13.625l-9.496,9.504v-13.625ZM.5,10.9v13.57h4.074v-4.066l9.496-9.504H.5Zm13.57,0l9.495,9.504v4.066h4.075v-13.57h-13.57Z');
  svg.append(p);
  return svg;
}

function createGenericPlatformSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'rav-platform-pill-icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(PLATFORM_ICON_PX));
  svg.setAttribute('height', String(PLATFORM_ICON_PX));
  svg.setAttribute('aria-hidden', 'true');
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', '8');
  c.setAttribute('cy', '8');
  c.setAttribute('r', '6');
  c.setAttribute('fill', 'none');
  c.setAttribute('stroke', 'currentColor');
  c.setAttribute('stroke-width', '1.35');
  svg.append(c);
  return svg;
}

/** @param {string} name */
export function createPlatformIcon(name) {
  const kind = platformIconKind(name);
  if (kind === 'google') return createGooglePlatformSvg();
  if (kind === 'chatgpt') return createChatGptPlatformSvg();
  if (kind === 'perplexity') return createPerplexityPlatformSvg();
  return createGenericPlatformSvg();
}

/** Same brand detection as header platform pills — ChatGPT, Gemini/Google, Perplexity, etc. */
export function hasPlatformBrandLogo(name) {
  return platformIconKind(name) !== 'generic';
}

function parsePair(text) {
  const parts = text.split('|').map((s) => s.trim());
  return {
    label: parts[0] || '',
    value: parseFloat(parts[1]) || 0,
    /** Kept for parsing; not shown in `.rav-hbar-val` (that column is numeric only). */
    suffix: parts.find((p, i) => i > 1 && !p.startsWith('#') && Number.isNaN(parseFloat(p))) || '',
    color: parts.find((p) => p.startsWith('#')) || null,
    badge: parts[4] || '',
    raw: parts,
  };
}

/** Default bar value mode by chart type; `horizontalbars` can override in parseChartCell. */
const CHART_VALUE_DISPLAY = {
  horizontalbars: 'count',
  platformbars: 'percent',
};

/**
 * Share-style horizontal bar rows (e.g. 78 + 20 + 1 ≈ 100%) use the same chart type as raw counts.
 * Detect likely percentages so competitor “share” charts show % without a CMS change.
 * @param {Array<{ value: number }>} items
 */
function looksLikePercentageSeries(items) {
  const vals = items.map((d) => d.value).filter(Number.isFinite);
  if (!vals.length) return false;
  if (vals.some((v) => v < -1e-6 || v > 100 + 1e-6)) return false;
  const sum = vals.reduce((a, b) => a + b, 0);
  const max = Math.max(...vals);
  if (max > 100 + 1e-6) return false;
  // Mostly-complete distributions (omitted “other”); avoids tiny totals like 10+5+3.
  return sum >= 80 && sum <= 101.5;
}

function formatCountBarValue(n) {
  if (!Number.isFinite(n)) return '0';
  const whole = Math.abs(n - Math.round(n)) < 1e-6;
  if (whole) return Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const r = Math.round(n * 100) / 100;
  return r.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * @param {number} n
 * @param {number[]} seriesValues same chart’s item values (for 0–1 vs 0–100 scale)
 */
function formatPercentBarValue(n, seriesValues) {
  if (!Number.isFinite(n)) return '0%';
  const maxV = Math.max(0, ...seriesValues.filter(Number.isFinite));
  const asShare = maxV <= 1.000001;
  const p = asShare ? n * 100 : n;
  const rounded = Math.round(p * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
    return `${Math.round(rounded)}%`;
  }
  const core = rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${core}%`;
}

/**
 * @param {number} n
 * @param {'count' | 'percent'} mode
 * @param {number[]} seriesValues
 */
function formatBarEndValue(n, mode, seriesValues) {
  if (mode === 'percent') return formatPercentBarValue(n, seriesValues);
  return formatCountBarValue(n);
}

export function parseChartCell(cell) {
  if (!cell) return null;
  const paras = [...cell.querySelectorAll('p')];
  if (!paras.length) return null;
  const first = paras[0]?.textContent.trim().toLowerCase() || '';
  const [typeHead, ...typeFlagParts] = first.split('|').map((s) => s.trim().replace(/\s+/g, ''));
  const type = (typeHead || '').replace(/\s+/g, '');
  if (!type) return null;
  const chartFlags = new Set(typeFlagParts.filter(Boolean));
  const items = paras.slice(1).map((p) => p.textContent.trim()).filter(Boolean).map(parsePair);

  let valueDisplayMode = CHART_VALUE_DISPLAY[type] || 'count';
  if (type === 'horizontalbars') {
    if (chartFlags.has('count') || chartFlags.has('numbers')) {
      valueDisplayMode = 'count';
    } else if (chartFlags.has('percent') || chartFlags.has('pct')) {
      valueDisplayMode = 'percent';
    } else if (looksLikePercentageSeries(items)) {
      valueDisplayMode = 'percent';
    }
  }

  return { type, items, valueDisplayMode };
}

/**
 * Sentence-case stat headings: first word title or short acronym (2–4 caps); rest lowercase.
 * @param {string} text
 * @returns {string}
 */
export function toStatLabelSentenceCase(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/);
  return words.map((word, i) => {
    if (i === 0) {
      if (/^[A-Z]{2,4}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return word.toLowerCase();
  }).join(' ');
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
  const { items, valueDisplayMode = 'count' } = data;
  if (!items.length) return null;
  const rawMax = Math.max(...items.map((d) => d.value)) || 1;
  const seriesValues = items.map((d) => d.value);
  const showPlatformIcons = items.some((d) => hasPlatformBrandLogo(d.label));

  const wrap = document.createElement('div');
  wrap.className = showPlatformIcons ? 'rav-hbars rav-platform-bars' : 'rav-hbars';

  items.forEach((d, i) => {
    const pct = (d.value / rawMax) * 100;
    const color = d.color || COLORS[i % COLORS.length];
    const row = document.createElement('div');
    row.className = showPlatformIcons ? 'rav-hbar-row rav-platform-row' : 'rav-hbar-row';

    if (showPlatformIcons) {
      const iconWrap = document.createElement('span');
      iconWrap.className = 'rav-platform-icon';
      if (hasPlatformBrandLogo(d.label)) {
        iconWrap.append(createPlatformIcon(d.label));
      }
      row.append(iconWrap);
    }

    const label = document.createElement('span');
    label.className = showPlatformIcons ? 'rav-hbar-label rav-platform-label' : 'rav-hbar-label';
    label.textContent = d.label;

    const track = document.createElement('div');
    track.className = 'rav-hbar-track';
    const fill = document.createElement('div');
    fill.className = 'rav-hbar-fill';
    fill.style.setProperty('--bar-w', `${pct}%`);
    fill.style.background = color;
    fill.style.transitionDelay = `${i * 0.08}s`;
    track.append(fill);
    if (d.badge) {
      const badge = document.createElement('span');
      badge.className = 'rav-hbar-badge';
      badge.textContent = d.badge;
      track.append(badge);
    }

    const val = document.createElement('span');
    val.className = 'rav-hbar-val';
    val.textContent = formatBarEndValue(d.value, valueDisplayMode, seriesValues);

    row.append(label, track, val);
    wrap.append(row);
  });
  return wrap;
}

function renderPlatformBars(data) {
  const { items, valueDisplayMode = 'percent' } = data;
  if (!items.length) return null;
  const rawMax = Math.max(...items.map((d) => d.value)) || 1;
  const seriesValues = items.map((d) => d.value);
  const wrap = document.createElement('div');
  wrap.className = 'rav-hbars rav-platform-bars';
  items.forEach((d, i) => {
    const pct = (d.value / rawMax) * 100;
    const color = d.color || COLORS[i % COLORS.length];
    const row = document.createElement('div');
    row.className = 'rav-hbar-row rav-platform-row';

    const iconWrap = document.createElement('span');
    iconWrap.className = 'rav-platform-icon';
    iconWrap.append(createPlatformIcon(d.label));

    const label = document.createElement('span');
    label.className = 'rav-hbar-label rav-platform-label';
    label.textContent = d.label;

    const track = document.createElement('div');
    track.className = 'rav-hbar-track';
    const fill = document.createElement('div');
    fill.className = 'rav-hbar-fill';
    fill.style.setProperty('--bar-w', `${pct}%`);
    fill.style.background = color;
    fill.style.transitionDelay = `${i * 0.08}s`;
    track.append(fill);
    if (d.badge) {
      const badge = document.createElement('span');
      badge.className = 'rav-hbar-badge';
      badge.textContent = d.badge;
      track.append(badge);
    }

    const val = document.createElement('span');
    val.className = 'rav-hbar-val';
    val.textContent = formatBarEndValue(d.value, valueDisplayMode, seriesValues);

    row.append(iconWrap, label, track, val);

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

function renderMetricStrip(data) {
  const { items } = data;
  if (!items.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'rav-metric-strip';
  items.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'rav-ms-row';
    const note = d.raw?.[2] || '';
    row.innerHTML = `
      <div class="rav-ms-label">${d.label}</div>
      <div class="rav-ms-value">${d.raw?.[1] || d.value || ''}</div>
      ${note ? `<div class="rav-ms-note">${note}</div>` : ''}`;
    wrap.append(row);
  });
  return wrap;
}

const REC_TONE_ICONS = {
  growth: '↗',
  risk: '⏱',
  action: '✓',
  priority: '⚠',
  default: '📄',
};

function renderRecommendationList(data) {
  const { items } = data;
  if (!items.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'rav-rec-list';
  items.forEach((d) => {
    const tone = (d.raw?.[2] || 'default').trim().toLowerCase();
    const icon = REC_TONE_ICONS[tone] || REC_TONE_ICONS.default;
    const detail = d.raw?.[1] || '';
    const card = document.createElement('div');
    card.className = `rav-rec-card rav-rec-${tone}`;
    card.innerHTML = `
      <div class="rav-rec-icon">${icon}</div>
      <div class="rav-rec-body">
        <div class="rav-rec-title">${d.label}</div>
        ${detail ? `<div class="rav-rec-detail">${detail}</div>` : ''}
      </div>`;
    wrap.append(card);
  });
  return wrap;
}

export function renderChart(data) {
  if (!data) return null;
  if (data.type === 'bigfigure') return renderBigFigure(data);
  if (data.type === 'horizontalbars') return renderHorizontalBars(data);
  if (data.type === 'platformbars') return renderPlatformBars(data);
  if (data.type === 'scoretable') return renderScoreTable(data);
  if (data.type === 'metricstrip') return renderMetricStrip(data);
  if (data.type === 'recommendationlist') return renderRecommendationList(data);
  return null;
}

// ── Section renderers ───────────────────────────────────────────────────────

export function renderStats(rows) {
  const grid = document.createElement('div');
  grid.className = 'rav-stats';
  rows.forEach(({ cells }) => {
    const card = document.createElement('div');
    card.className = 'rav-stat-card';
    const label = document.createElement('div');
    label.className = 'rav-stat-label';
    label.textContent = toStatLabelSentenceCase(cells[1]?.textContent.trim() || '');
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

export function renderPlatforms({ cells }) {
  const wrap = document.createElement('div');
  wrap.className = 'rav-platforms';
  const lbl = document.createElement('span');
  lbl.className = 'rav-platforms-label';
  lbl.textContent = toStatLabelSentenceCase((cells[1]?.textContent || '').trim());
  const pills = document.createElement('div');
  pills.className = 'rav-platforms-pills';
  pills.setAttribute('role', 'list');
  const rawNames = (cells[2]?.textContent || '').split('|').map((s) => s.trim()).filter(Boolean);
  uniqueNamesForPlatformPills(rawNames).forEach((name) => {
    const pill = document.createElement('span');
    pill.className = 'rav-platform-pill';
    pill.setAttribute('role', 'listitem');
    pill.setAttribute('aria-label', name);
    pill.title = name;
    pill.append(createPlatformIcon(name));
    pills.append(pill);
  });
  wrap.append(lbl, pills);
  return wrap;
}

/** Canonical copy for legacy authored subtitles (CMS may still serve old text). */
const RAV_PANEL_SUB_NIKE_CITATIONS = 'How Nike\'s AI citations are split across each tracked platform for the prompts we monitor.';

export function renderPanel({ cells }, { skipChart = false } = {}) {
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
    let subText = subs.join(' ');
    if (/^share of nike['\u2019]s ai citations by platform\.?$/i.test(subText.trim())) {
      subText = RAV_PANEL_SUB_NIKE_CITATIONS;
    }
    sub.textContent = subText;
    panel.append(sub);
  }
  // Chart
  const chartData = skipChart ? null : parseChartCell(cells[2]);
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

/**
 * Removes legacy lead-in label in a leading strong element from gap/insight cell HTML
 * (the visible title is rendered separately).
 * @param {string} html
 * @returns {string}
 */
function stripLeadingStrongLabel(html) {
  const raw = (html || '').trim();
  if (!raw) return '';
  const host = document.createElement('div');
  host.innerHTML = raw;
  const first = host.firstElementChild;
  if (first?.tagName === 'STRONG') {
    first.remove();
  } else if (first?.tagName === 'P' && first.firstElementChild?.tagName === 'STRONG') {
    first.firstElementChild.remove();
  }
  return host.innerHTML.trim();
}

export function renderGap({ cells }) {
  const wrap = document.createElement('div');
  wrap.className = 'rav-gap';
  const badge = document.createElement('span');
  badge.className = 'rav-pane-badge';
  badge.textContent = 'Visibility gap';
  const content = document.createElement('div');
  content.className = 'rav-gap-content';
  const raw = (cells[1]?.innerHTML || cells[2]?.innerHTML || '').trim();
  content.innerHTML = stripLeadingStrongLabel(raw);
  const chevron = document.createElement('span');
  chevron.className = 'rav-pane-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  wrap.append(badge, content, chevron);
  wrap.dataset.sheetTitle = 'Visibility gap';
  return wrap;
}

export function renderCta({ cells }) {
  const wrap = document.createElement('div');
  wrap.className = 'rav-cta';
  const left = document.createElement('div');
  left.className = 'rav-cta-left';
  left.innerHTML = cells[1]?.innerHTML || '';
  const link = cells[2]?.querySelector('a');
  if (link) {
    link.className = 'rav-cta-btn';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    left.append(link);
  }
  const visual = document.createElement('div');
  visual.className = 'rav-cta-visual';
  const img = document.createElement('img');
  img.className = 'rav-cta-img';
  img.src = new URL('./rav-cta-illustration.png', import.meta.url).href;
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  visual.append(img);
  wrap.append(left, visual);
  return wrap;
}

export function renderInsight({ cells }) {
  const wrap = document.createElement('div');
  wrap.className = 'rav-insight';
  const badge = document.createElement('span');
  badge.className = 'rav-pane-badge';
  badge.textContent = 'Key insight';
  const content = document.createElement('div');
  content.className = 'rav-insight-content';
  content.innerHTML = stripLeadingStrongLabel(cells[1]?.innerHTML || '');
  const chevron = document.createElement('span');
  chevron.className = 'rav-pane-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  wrap.append(badge, content, chevron);
  wrap.dataset.sheetTitle = 'Key insight';
  return wrap;
}

/**
 * Parse authored block rows into { type, cells }.
 * @param {Element} block
 * @returns {Array<{ type: string, cells: Element[] }>}
 */
export function parseVisibilityRows(block) {
  return [...block.querySelectorAll(':scope > div')].map((el) => ({
    type: [...el.children][0]?.textContent.trim().toLowerCase() || '',
    cells: [...el.children],
  }));
}
