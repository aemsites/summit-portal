function parseValue(text) {
  const t = text.trim();
  const m = t.match(/^([\d.]+)(M|K|%)?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  return { num, suffix: m[2] || '' };
}

function formatValue(num, suffix, decimals) {
  const s = decimals > 0 ? num.toFixed(decimals) : Math.round(num).toString();
  return `${s}${suffix}`;
}

function easeOutExpo(t) {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

/**
 * Semicircle gauge (viewBox 0 0 72 44): sweep ≤ 180°, so SVG large-arc flag is always 0.
 */
const RSC_GAUGE = { cx: 34, cy: 36, outerR: 26, needleR: 16 };

/**
 * @param {number} ratio 0–1
 * @returns {string} `d` for the red fill stroke (same sweep as `.rs-gauge-track`).
 */
function speedometerFillPathD(ratio) {
  const { cx, cy, outerR } = RSC_GAUGE;
  const pct = Math.max(0, Math.min(1, ratio));
  const angle = Math.PI - pct * Math.PI;
  const sx = cx + outerR * Math.cos(Math.PI);
  const sy = cy - outerR * Math.sin(Math.PI);
  const ex = cx + outerR * Math.cos(angle);
  const ey = cy - outerR * Math.sin(angle);
  return `M ${sx} ${sy} A ${outerR} ${outerR} 0 0 1 ${ex} ${ey}`;
}

/**
 * @param {number} ratio 0–1
 * @returns {{ x: number, y: number }}
 */
function speedometerNeedleTip(ratio) {
  const { cx, cy, needleR } = RSC_GAUGE;
  const pct = Math.max(0, Math.min(1, ratio));
  const angle = Math.PI - pct * Math.PI;
  return {
    x: cx + needleR * Math.cos(angle),
    y: cy - needleR * Math.sin(angle),
  };
}

function animateValue(el, targetText, duration) {
  const parsed = parseValue(targetText);
  if (!parsed) return;
  const { num: target, suffix } = parsed;
  const decimals = targetText.includes('.') ? (targetText.match(/\.(\d+)/)?.[1].length || 0) : 0;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const val = easeOutExpo(t) * target;
    el.textContent = formatValue(val, suffix, decimals);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateSpeedometer(svg, targetRatio, duration) {
  if (!svg) return;
  const fillPath = svg.querySelector('.rs-gauge-fill') || svg.querySelectorAll('path')[1];
  const needle = svg.querySelector('.rs-gauge-needle') || svg.querySelector('line');
  if (!fillPath || !needle) return;
  const safeTarget = Number.isFinite(targetRatio) ? targetRatio : 0;

  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ratio = easeOutExpo(t) * safeTarget;
    fillPath.setAttribute('d', speedometerFillPathD(ratio));
    const tip = speedometerNeedleTip(ratio);
    needle.setAttribute('x2', tip.x);
    needle.setAttribute('y2', tip.y);

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      fillPath.setAttribute('d', speedometerFillPathD(safeTarget));
      const endTip = speedometerNeedleTip(safeTarget);
      needle.setAttribute('x2', endTip.x);
      needle.setAttribute('y2', endTip.y);
    }
  }
  requestAnimationFrame(tick);
}

function makeSpeedometer(ratio, label) {
  const pct = Math.max(0, Math.min(1, ratio));
  const { cx, cy, outerR } = RSC_GAUGE;
  const innerR = 18;

  const arcEnd = (r, a) => ({
    x: cx + r * Math.cos(a),
    y: cy - r * Math.sin(a),
  });

  // Outer arc endpoints
  const outerStart = arcEnd(outerR, Math.PI);
  const outerEnd = arcEnd(outerR, 0);

  // Inner arc endpoints
  const innerStart = arcEnd(innerR, Math.PI);
  const innerEnd = arcEnd(innerR, 0);

  const fillD = speedometerFillPathD(pct);
  const needle = speedometerNeedleTip(pct);

  const ariaLabel = label || `Score ${Math.round(pct * 100)} out of 100`;

  return `<svg width="72" height="44" viewBox="0 0 72 44" role="img" aria-label="${ariaLabel}" class="rs-speedometer">
    <title>${ariaLabel}</title>
    <path d="M ${outerStart.x} ${outerStart.y} A ${outerR} ${outerR} 0 0 1 ${outerEnd.x} ${outerEnd.y}" fill="none" class="rs-gauge-track" stroke-width="5" stroke-linecap="round"/>
    <path d="${fillD}" fill="none" class="rs-gauge-fill" stroke="#ff5c5c" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${innerStart.x} ${innerStart.y} A ${innerR} ${innerR} 0 0 1 ${innerEnd.x} ${innerEnd.y}" fill="none" class="rs-gauge-inner" stroke-width="1"/>
    <line x1="${cx}" y1="${cy}" x2="${needle.x}" y2="${needle.y}" class="rs-gauge-needle" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="3.5" class="rs-gauge-pivot"/>
    <circle cx="${cx}" cy="${cy}" r="2" fill="#ff5c5c" opacity="0.45"/>
  </svg>`;
}

const SORT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">'
  + '<path fill="currentColor" d="M18.28 13.22c-.293-.293-.767-.293-1.06 0L16 14.44V3.75c0-.414-.336-.75-.75-.75s-.75.336-.75.75v10.69l-1.22-1.22c-.293-.293-.767-.293-1.06 0s-.293.767 0 1.06l2.5 2.5q.105.105.243.162c.138.057.19.058.287.058s.195-.02.287-.058.174-.093.243-.162l2.5-2.5c.293-.293.293-.767 0-1.06M7.25 14.5h-4.5c-.414 0-.75-.336-.75-.75s.336-.75.75-.75h4.5c.414 0 .75.336.75.75s-.336.75-.75.75M9.25 10.5h-6.5c-.414 0-.75-.336-.75-.75S2.336 9 2.75 9h6.5c.414 0 .75.336.75.75s-.336.75-.75.75M11.25 6.5h-8.5c-.414 0-.75-.336-.75-.75S2.336 5 2.75 5h8.5c.414 0 .75.336.75.75s-.336.75-.75.75"/></svg>';

const CRITICAL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 18.795c-.601 0-1.166-.234-1.591-.66l-6.545-6.544c-.876-.877-.876-2.305 0-3.182l6.545-6.545c.849-.85 2.333-.85 3.182 0l6.545 6.545c.876.877.876 2.305 0 3.182l-6.545 6.545c-.425.425-.99.659-1.591.659m0-16.09c-.2 0-.389.078-.53.22L2.925 9.47c-.292.292-.292.768 0 1.06l6.545 6.545c.283.283.778.283 1.06 0l6.545-6.545c.292-.292.292-.768 0-1.06L10.53 2.925c-.141-.142-.33-.22-.53-.22"/><path fill="currentColor" d="M10 14.998c-.231.008-.456-.073-.627-.228-.33-.365-.33-.92 0-1.285.17-.158.395-.242.626-.234.237-.01.466.08.633.247.162.168.25.394.242.627.012.235-.07.465-.228.639-.174.164-.408.25-.647.234M10 11.625c-.414 0-.75-.336-.75-.75v-5c0-.414.336-.75.75-.75s.75.336.75.75v5c0 .414-.336.75-.75.75"/></svg>';

const CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M7.864 15.734c-.222 0-.433-.098-.576-.27l-3.747-4.497c-.266-.319-.222-.792.096-1.057.317-.265.79-.223 1.056.096l3.154 3.786 7.44-9.469c.255-.326.728-.382 1.052-.127.326.256.383.728.127 1.053L8.454 15.447c-.14.179-.352.284-.579.287z"/></svg>';

const TREND_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M3 17.75c-.155 0-.312-.048-.445-.146-.334-.247-.405-.716-.159-1.05l2.298-3.113c.238-.322.69-.402 1.022-.176l2.05 1.379 1.621-6.985c.07-.299.314-.524.617-.571.304-.049.604.097.76.36l1.932 3.277 3.62-8.034c.17-.378.614-.545.992-.375s.546.615.376.993l-4.215 9.352c-.115.255-.363.425-.643.44-.276.03-.545-.126-.687-.368l-1.715-2.908-1.444 6.219c-.056.24-.226.437-.456.528-.23.09-.488.063-.693-.076L5.475 14.91l-1.871 2.535c-.147.2-.374.305-.604.305"/></svg>';

/** Same four SVGs as the original dark strip; `warning` / `nodata` map onto that set only. */
const BADGE_ICONS = {
  positive: CHECK_ICON,
  negative: SORT_ICON,
  neutral: TREND_ICON,
  critical: CRITICAL_ICON,
  warning: SORT_ICON,
  nodata: TREND_ICON,
};

/** When the sheet omits badge copy, show these labels (tone from status column). */
const DEFAULT_DARK_BADGE_LABELS = {
  positive: 'Strong',
  negative: 'Declining',
  critical: 'Critical',
  neutral: 'Stable',
  warning: 'Needs work',
  nodata: 'No data',
};

const NO_DATA_VALUE_RE = /^(n\/?a|no\s*data|n\/d|—|--|-|…|\.\.\.)$/i;

/**
 * @param {string} value
 * @returns {boolean}
 */
function isNoDataStatValue(value) {
  const v = (value || '').trim();
  if (!v) return true;
  if (NO_DATA_VALUE_RE.test(v)) return true;
  return false;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeDarkBadgeStatus(raw) {
  const s = (raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return 'neutral';
  if (s === 'poor' || s === 'declining' || s === 'bad') return 'negative';
  if (s === 'good' || s === 'optimal' || s === 'strong' || s === 'excellent') return 'positive';
  if (s === 'warning' || s === 'warn' || s === 'caution') return 'warning';
  if (s === 'nodata' || s === 'empty' || s === 'unknown') return 'nodata';
  if (BADGE_ICONS[s]) return s;
  return 'neutral';
}

/**
 * @param {string} displayText
 * @param {string} statusKey
 * @returns {HTMLDivElement}
 */
function buildDarkBadgeEl(displayText, statusKey) {
  const el = document.createElement('div');
  el.className = 'rs-dark-badge';
  el.dataset.status = statusKey;
  el.setAttribute('role', 'status');
  const trimmed = displayText.trim();
  const fallback = DEFAULT_DARK_BADGE_LABELS[statusKey] || DEFAULT_DARK_BADGE_LABELS.neutral;
  const label = trimmed || fallback;
  el.setAttribute('aria-label', label);
  const icon = BADGE_ICONS[statusKey] || BADGE_ICONS.neutral;
  el.insertAdjacentHTML('afterbegin', icon);
  el.append(document.createTextNode(label));
  return el;
}

function animateDarkStats(strip) {
  const cards = strip.querySelectorAll('.rs-dark-card');
  cards.forEach((card, i) => {
    const valueEl = card.querySelector('.rs-dark-value');
    if (!valueEl) return;
    const mainSpan = valueEl.querySelector('.rs-dark-value-main');
    const meter = card.querySelector('.rs-speedometer');
    const duration = 3000 + Math.random() * 2000;
    const delay = 1000 + i * 120;

    if (mainSpan) {
      const target = mainSpan.textContent;
      mainSpan.textContent = '0';
      const parsed = parseValue(target);
      const targetRatio = parsed && Number.isFinite(parsed.num) ? parsed.num / 100 : 0;

      if (meter) animateSpeedometer(meter, 0, 0.001);

      setTimeout(() => {
        animateValue(mainSpan, target, duration);
        if (meter) animateSpeedometer(meter, targetRatio, duration);
      }, delay);
    } else {
      const target = valueEl.textContent.trim();
      if (isNoDataStatValue(target) || target === 'No data') {
        return;
      }
      const parsed = parseValue(target);
      if (!parsed) return;
      valueEl.textContent = '0';
      setTimeout(() => animateValue(valueEl, target, duration), delay);
    }
  });
}

/**
 * Dark strip: performance score first, monthly visits second; other rows keep
 * their relative order. Matches labels case-insensitively on first cell text.
 * @param {Element[]} rows
 * @returns {Element[]}
 */
function sortDarkStatRows(rows) {
  const labelOf = (row) => (row.children[0]?.textContent.trim().toLowerCase() || '');
  const isPerformanceScore = (row) => {
    const l = labelOf(row);
    return l.includes('performance') && l.includes('score');
  };
  const isMonthlyVisits = (row) => {
    const l = labelOf(row);
    return l.includes('monthly') && (l.includes('visit') || l.includes('visits'));
  };

  const perf = rows.filter(isPerformanceScore);
  const monthly = rows.filter(isMonthlyVisits);
  const rest = rows.filter((row) => !isPerformanceScore(row) && !isMonthlyVisits(row));
  return [...perf, ...monthly, ...rest];
}

function openDarkSheet(sheet, trigger) {
  const titleEl = sheet.querySelector('.rs-sheet-label');
  const valueEl = sheet.querySelector('.rs-sheet-value');
  const badgeSlot = sheet.querySelector('.rs-sheet-badge-slot');
  const descEl = sheet.querySelector('.rs-sheet-desc');

  titleEl.textContent = trigger.dataset.sheetLabel || '';
  valueEl.textContent = trigger.dataset.sheetValue || '';
  badgeSlot.replaceChildren(
    buildDarkBadgeEl(trigger.dataset.sheetBadgeLabel || '', trigger.dataset.sheetBadgeStatus || 'neutral'),
  );
  descEl.textContent = trigger.dataset.sheetDesc || '';

  sheet.dataset.open = 'true';
  sheet.setAttribute('aria-hidden', 'false');
  trigger.setAttribute('aria-expanded', 'true');
  sheet.activeTrigger = trigger;
  document.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    sheet.querySelector('.rs-sheet-close')?.focus();
  });
}

function closeDarkSheet(sheet) {
  sheet.dataset.open = 'false';
  sheet.setAttribute('aria-hidden', 'true');
  if (sheet.activeTrigger) {
    sheet.activeTrigger.setAttribute('aria-expanded', 'false');
    sheet.activeTrigger.focus();
    sheet.activeTrigger = null;
  }
  document.documentElement.style.overflow = '';
}

function attachDarkSheet(el) {
  if (el.dataset.sheetAttached === 'true') return;
  el.dataset.sheetAttached = 'true';

  const sheet = document.createElement('div');
  sheet.className = 'rs-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.dataset.open = 'false';
  sheet.innerHTML = `
    <div class="rs-sheet-backdrop" data-close="true"></div>
    <div class="rs-sheet-panel" role="document">
      <button type="button" class="rs-sheet-close" aria-label="Close" data-close="true">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
      <div class="rs-sheet-grabber" aria-hidden="true"></div>
      <div class="rs-sheet-label"></div>
      <div class="rs-sheet-value-row">
        <div class="rs-sheet-value"></div>
        <div class="rs-sheet-badge-slot"></div>
      </div>
      <p class="rs-sheet-desc"></p>
    </div>
  `;
  el.append(sheet);

  el.addEventListener('click', (e) => {
    const trigger = e.target.closest('.rs-dark-card');
    if (trigger && window.matchMedia('(width < 1000px)').matches) {
      openDarkSheet(sheet, trigger);
      return;
    }
    if (e.target.closest('[data-close]')) closeDarkSheet(sheet);
  });

  el.addEventListener('keydown', (e) => {
    const trigger = e.target.closest?.('.rs-dark-card');
    if (trigger && (e.key === 'Enter' || e.key === ' ') && window.matchMedia('(width < 1000px)').matches) {
      e.preventDefault();
      openDarkSheet(sheet, trigger);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.dataset.open === 'true') closeDarkSheet(sheet);
  });
}

function buildDarkStats(el, rows) {
  const strip = document.createElement('div');
  strip.className = 'rs-dark-strip';

  sortDarkStatRows(rows).forEach((row) => {
    const cells = [...row.children];
    const label = cells[0]?.textContent.trim() || '';
    const value = cells[1]?.textContent.trim() || '';
    const badgeText = cells[2]?.textContent.trim() || '';
    const badgeStatus = cells[3]?.textContent.trim().toLowerCase() || '';
    const desc = cells[4]?.textContent.trim() || '';
    const showMeter = cells[5]?.textContent.trim().toLowerCase() === 'speedometer';
    const noData = isNoDataStatValue(value);

    const card = document.createElement('div');
    card.className = 'rs-dark-card';

    const labelEl = document.createElement('div');
    labelEl.className = 'rs-dark-label';
    labelEl.textContent = label;

    const valueRow = document.createElement('div');
    valueRow.className = 'rs-dark-value-row';

    const valueEl = document.createElement('div');
    valueEl.className = 'rs-dark-value';
    const useMeter = showMeter && !noData && value.includes('/');
    if (useMeter) {
      const [num, denom] = value.split('/');
      const mainSpan = document.createElement('span');
      mainSpan.className = 'rs-dark-value-main';
      mainSpan.textContent = num;
      const denomSpan = document.createElement('span');
      denomSpan.className = 'rs-dark-value-denom';
      denomSpan.textContent = `/${denom}`;
      valueEl.append(mainSpan, denomSpan);
    } else {
      valueEl.textContent = noData ? 'No data' : value;
    }
    valueRow.append(valueEl);

    if (useMeter) {
      const parts = value.split('/');
      const ratio = parts.length === 2
        ? parseFloat(parts[0]) / parseFloat(parts[1])
        : parseFloat(parts[0]) / 100;
      const meterWrap = document.createElement('div');
      meterWrap.className = 'rs-dark-meter';
      const ariaLabel = `${label} ${value}`;
      meterWrap.innerHTML = makeSpeedometer(Number.isFinite(ratio) ? ratio : 0, ariaLabel);
      valueRow.append(meterWrap);
    }

    const statusKey = noData ? 'nodata' : normalizeDarkBadgeStatus(badgeStatus);
    let badgeLabel = badgeText.trim();
    if (noData) {
      badgeLabel = badgeLabel || DEFAULT_DARK_BADGE_LABELS.nodata;
    } else if (!badgeLabel) {
      badgeLabel = DEFAULT_DARK_BADGE_LABELS[statusKey] || DEFAULT_DARK_BADGE_LABELS.neutral;
    }

    const badgeEl = buildDarkBadgeEl(badgeLabel, statusKey);

    const descEl = document.createElement('div');
    descEl.className = 'rs-dark-desc';
    descEl.textContent = desc;

    card.append(labelEl, valueRow, badgeEl);
    if (desc) card.append(descEl);

    // On mobile (<1000px) the card acts as a button that opens a bottom sheet
    // with the KPI description. Keep content identical for desktop.
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-expanded', 'false');
    card.dataset.sheetLabel = label;
    card.dataset.sheetValue = value;
    card.dataset.sheetBadgeLabel = badgeLabel;
    card.dataset.sheetBadgeStatus = statusKey;
    card.dataset.sheetDesc = desc;

    strip.append(card);
  });

  el.textContent = '';
  el.append(strip);
  attachDarkSheet(el);
  animateDarkStats(strip);
}

export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];

  if (el.classList.contains('dark')) {
    buildDarkStats(el, rows);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'rs-grid';

  rows.forEach((row) => {
    const cells = [...row.children];
    const card = document.createElement('div');
    card.className = 'rs-card';

    const value = cells[0]?.textContent.trim() || '';
    const label = cells[1]?.textContent.trim() || '';
    const severity = cells[2]?.textContent.trim().toLowerCase() || '';
    const desc = cells[3]?.textContent.trim() || '';

    if (severity) card.classList.add(`rs-${severity}`);

    card.innerHTML = `
      <div class="rs-header">
        <span class="rs-label">${label}</span>
        ${severity ? `<span class="rs-indicator rs-indicator-${severity}"></span>` : ''}
      </div>
      <div class="rs-value">${value}</div>
      ${desc ? `<p class="rs-desc">${desc}</p>` : ''}
    `;
    grid.append(card);
  });

  el.textContent = '';
  el.append(grid);
}
