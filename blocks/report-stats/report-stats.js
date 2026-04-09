function parseValue(text) {
  const t = text.trim();
  const m = t.match(/^([\d.]+)(M|K|%)?$/);
  if (!m) return null;
  return { num: parseFloat(m[1]), suffix: m[2] || '' };
}

function formatValue(num, suffix, decimals) {
  const s = decimals > 0 ? num.toFixed(decimals) : Math.round(num).toString();
  return `${s}${suffix}`;
}

function easeOutExpo(t) {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
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
  const fillPath = svg.querySelectorAll('path')[1];
  const needle = svg.querySelector('line');
  if (!fillPath || !needle) return;

  const cx = 34;
  const cy = 36;
  const outerR = 26;
  const needleR = outerR - 10;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const pct = easeOutExpo(t) * targetRatio;
    const angle = Math.PI - pct * Math.PI;
    const large = pct > 0.5 ? 1 : 0;

    const sx = cx + outerR * Math.cos(Math.PI);
    const sy = cy - outerR * Math.sin(Math.PI);
    const ex = cx + outerR * Math.cos(angle);
    const ey = cy - outerR * Math.sin(angle);
    fillPath.setAttribute('d', `M ${sx} ${sy} A ${outerR} ${outerR} 0 ${large} 1 ${ex} ${ey}`);

    const nx = cx + needleR * Math.cos(angle);
    const ny = cy - needleR * Math.sin(angle);
    needle.setAttribute('x2', nx);
    needle.setAttribute('y2', ny);

    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateDarkStats(strip) {
  const cards = strip.querySelectorAll('.rs-dark-card');
  cards.forEach((card, i) => {
    const valueEl = card.querySelector('.rs-dark-value');
    const mainSpan = valueEl.querySelector('.rs-dark-value-main');
    const meter = card.querySelector('.rs-speedometer');
    const duration = 3000 + Math.random() * 2000;
    const delay = 1000 + i * 120;

    if (mainSpan) {
      const target = mainSpan.textContent;
      mainSpan.textContent = '0';
      const parsed = parseValue(target);
      const targetRatio = parsed ? parsed.num / 100 : 0;

      // Zero the speedometer initially
      if (meter) animateSpeedometer(meter, 0, 0.001);

      setTimeout(() => {
        animateValue(mainSpan, target, duration);
        if (meter) animateSpeedometer(meter, targetRatio, duration);
      }, delay);
    } else {
      const target = valueEl.textContent;
      valueEl.textContent = '0';
      setTimeout(() => animateValue(valueEl, target, duration), delay);
    }
  });
}

function makeSpeedometer(ratio, label) {
  const pct = Math.max(0, Math.min(1, ratio));
  const angle = Math.PI - pct * Math.PI;
  const cx = 34;
  const cy = 36;
  const outerR = 26;
  const innerR = 18;
  const needleR = outerR - 10; // needle length from center

  const arcEnd = (r, a) => ({
    x: cx + r * Math.cos(a),
    y: cy - r * Math.sin(a),
  });

  // Outer arc endpoints
  const outerStart = arcEnd(outerR, Math.PI);
  const outerEnd = arcEnd(outerR, 0);
  const outerFill = arcEnd(outerR, angle);
  const outerLarge = pct > 0.5 ? 1 : 0;

  // Inner arc endpoints
  const innerStart = arcEnd(innerR, Math.PI);
  const innerEnd = arcEnd(innerR, 0);

  // Needle tip
  const needle = arcEnd(needleR, angle);

  const ariaLabel = label || `Score ${Math.round(pct * 100)} out of 100`;

  return `<svg width="72" height="44" viewBox="0 0 72 44" role="img" aria-label="${ariaLabel}" class="rs-speedometer">
    <title>${ariaLabel}</title>
    <path d="M ${outerStart.x} ${outerStart.y} A ${outerR} ${outerR} 0 0 1 ${outerEnd.x} ${outerEnd.y}" fill="none" class="rs-gauge-track" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${outerStart.x} ${outerStart.y} A ${outerR} ${outerR} 0 ${outerLarge} 1 ${outerFill.x} ${outerFill.y}" fill="none" stroke="#ff5c5c" stroke-width="5" stroke-linecap="round"/>
    <path d="M ${innerStart.x} ${innerStart.y} A ${innerR} ${innerR} 0 0 1 ${innerEnd.x} ${innerEnd.y}" fill="none" class="rs-gauge-inner" stroke-width="1"/>
    <line x1="${cx}" y1="${cy}" x2="${needle.x}" y2="${needle.y}" class="rs-gauge-needle" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="3.5" class="rs-gauge-pivot"/>
    <circle cx="${cx}" cy="${cy}" r="2" fill="#ff5c5c" opacity="0.45"/>
  </svg>`;
}

const SORT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M18.28 13.22c-.293-.293-.767-.293-1.06 0L16 14.44V3.75c0-.414-.336-.75-.75-.75s-.75.336-.75.75v10.69l-1.22-1.22c-.293-.293-.767-.293-1.06 0s-.293.767 0 1.06l2.5 2.5q.105.105.243.162c.138.057.19.058.287.058s.195-.02.287-.058.174-.093.243-.162l2.5-2.5c.293-.293.293-.767 0-1.06M7.25 14.5h-4.5c-.414 0-.75-.336-.75-.75s.336-.75.75-.75h4.5c.414 0 .75.336.75.75s-.336.75-.75.75M9.25 10.5h-6.5c-.414 0-.75-.336-.75-.75S2.336 9 2.75 9h6.5c.414 0 .75.336.75.75s-.336.75-.75.75M11.25 6.5h-8.5c-.414 0-.75-.336-.75-.75S2.336 5 2.75 5h8.5c.414 0 .75.336.75.75s-.336.75-.75.75"/></svg>';

const CRITICAL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 18.795c-.601 0-1.166-.234-1.591-.66l-6.545-6.544c-.876-.877-.876-2.305 0-3.182l6.545-6.545c.849-.85 2.333-.85 3.182 0l6.545 6.545c.876.877.876 2.305 0 3.182l-6.545 6.545c-.425.425-.99.659-1.591.659m0-16.09c-.2 0-.389.078-.53.22L2.925 9.47c-.292.292-.292.768 0 1.06l6.545 6.545c.283.283.778.283 1.06 0l6.545-6.545c.292-.292.292-.768 0-1.06L10.53 2.925c-.141-.142-.33-.22-.53-.22"/><path fill="currentColor" d="M10 14.998c-.231.008-.456-.073-.627-.228-.33-.365-.33-.92 0-1.285.17-.158.395-.242.626-.234.237-.01.466.08.633.247.162.168.25.394.242.627.012.235-.07.465-.228.639-.174.164-.408.25-.647.234M10 11.625c-.414 0-.75-.336-.75-.75v-5c0-.414.336-.75.75-.75s.75.336.75.75v5c0 .414-.336.75-.75.75"/></svg>';

const CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M7.864 15.734c-.222 0-.433-.098-.576-.27l-3.747-4.497c-.266-.319-.222-.792.096-1.057.317-.265.79-.223 1.056.096l3.154 3.786 7.44-9.469c.255-.326.728-.382 1.052-.127.326.256.383.728.127 1.053L8.454 15.447c-.14.179-.352.284-.579.287z"/></svg>';

const TREND_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M3 17.75c-.155 0-.312-.048-.445-.146-.334-.247-.405-.716-.159-1.05l2.298-3.113c.238-.322.69-.402 1.022-.176l2.05 1.379 1.621-6.985c.07-.299.314-.524.617-.571.304-.049.604.097.76.36l1.932 3.277 3.62-8.034c.17-.378.614-.545.992-.375s.546.615.376.993l-4.215 9.352c-.115.255-.363.425-.643.44-.276.03-.545-.126-.687-.368l-1.715-2.908-1.444 6.219c-.056.24-.226.437-.456.528-.23.09-.488.063-.693-.076L5.475 14.91l-1.871 2.535c-.147.2-.374.305-.604.305"/></svg>';

const BADGE_ICONS = {
  negative: SORT_ICON,
  positive: CHECK_ICON,
  neutral: TREND_ICON,
  critical: CRITICAL_ICON,
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
      const ariaLabel = `${label} ${value}`;
      meterWrap.innerHTML = makeSpeedometer(Number.isFinite(ratio) ? ratio : 0, ariaLabel);
      valueRow.append(meterWrap);
    }

    const badgeEl = document.createElement('div');
    badgeEl.className = 'rs-dark-badge';
    badgeEl.textContent = badgeText;
    // Use 4th column directly for status: negative, critical, positive, neutral
    const status = badgeStatus || 'neutral';
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
