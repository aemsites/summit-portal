function makeSpeedometer(ratio) {
  const pct = Math.max(0, Math.min(1, ratio));
  // 180° arc from left (π) to right (0) via top of gauge
  const angle = Math.PI - pct * Math.PI;
  const r = 28;
  const cx = 36;
  const cy = 36; // pivot sits at bottom of viewBox (0 0 72 40)

  // y is flipped: cy - r*sin(a) draws the arc through the upper half (y < cy)
  // sweep=1 (SVG clockwise) traces left→top→right
  const arcPath = (a1, a2, color, strokeW) => {
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy - r * Math.sin(a2);
    const large = Math.abs(a2 - a1) > Math.PI ? 1 : 0;
    return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
  };

  // Needle tip (same y-flip so it tracks the arc)
  const nx = cx + (r - 6) * Math.cos(angle);
  const ny = cy - (r - 6) * Math.sin(angle);

  return `<svg viewBox="0 0 72 40" width="72" height="40" aria-hidden="true" class="rs-speedometer">
    ${arcPath(Math.PI, 0, 'rgba(255,255,255,0.15)', 4)}
    ${arcPath(Math.PI, angle, '#f87171', 4)}
    <circle cx="${cx}" cy="${cy}" r="4" fill="#fff"/>
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

const BADGE_ICONS = {
  negative: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none"><path d="M6 2v7M3 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  positive: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none"><path d="M2 6.5l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  neutral: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none"><path d="M1 8.5l3-3 2 2 5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function buildDarkStats(el, rows) {
  const strip = document.createElement('div');
  strip.className = 'rs-dark-strip';

  rows.forEach((row) => {
    const cells = [...row.children];
    const label = cells[0]?.textContent.trim() || '';
    const value = cells[1]?.textContent.trim() || '';
    const badgeText = cells[2]?.textContent.trim() || '';
    const badgeStatus = cells[3]?.textContent.trim().toLowerCase() || '';
    const desc = cells[4]?.textContent.trim() || '';
    const showMeter = cells[5]?.textContent.trim().toLowerCase() === 'speedometer';

    const card = document.createElement('div');
    card.className = 'rs-dark-card';

    const labelEl = document.createElement('div');
    labelEl.className = 'rs-dark-label';
    labelEl.textContent = label;

    const valueRow = document.createElement('div');
    valueRow.className = 'rs-dark-value-row';

    const valueEl = document.createElement('div');
    valueEl.className = 'rs-dark-value';
    if (showMeter && value.includes('/')) {
      const [num, denom] = value.split('/');
      const mainSpan = document.createElement('span');
      mainSpan.className = 'rs-dark-value-main';
      mainSpan.textContent = num;
      const denomSpan = document.createElement('span');
      denomSpan.className = 'rs-dark-value-denom';
      denomSpan.textContent = `/${denom}`;
      valueEl.append(mainSpan, denomSpan);
    } else {
      valueEl.textContent = value;
    }
    valueRow.append(valueEl);

    if (showMeter) {
      // Parse "22/100" → ratio
      const parts = value.split('/');
      const ratio = parts.length === 2
        ? parseFloat(parts[0]) / parseFloat(parts[1])
        : parseFloat(parts[0]) / 100;
      const meterWrap = document.createElement('div');
      meterWrap.className = 'rs-dark-meter';
      meterWrap.innerHTML = makeSpeedometer(Number.isFinite(ratio) ? ratio : 0);
      valueRow.append(meterWrap);
    }

    const badgeEl = document.createElement('div');
    badgeEl.className = 'rs-dark-badge';
    badgeEl.textContent = badgeText;
    // Derive badge color
    const bl = (badgeText + badgeStatus).toLowerCase();
    let status = 'neutral';
    if (bl.includes('negative') || bl.includes('down') || bl.includes('critical') || bl.includes('poor')) {
      status = 'negative';
    } else if (bl.includes('positive') || bl.includes('optimal') || bl.includes('good')) {
      status = 'positive';
    }
    badgeEl.dataset.status = status;
    badgeEl.innerHTML = (BADGE_ICONS[status] || '') + badgeEl.textContent;

    const descEl = document.createElement('div');
    descEl.className = 'rs-dark-desc';
    descEl.textContent = desc;

    card.append(labelEl, valueRow, badgeEl);
    if (desc) card.append(descEl);
    strip.append(card);
  });

  el.textContent = '';
  el.append(strip);
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
