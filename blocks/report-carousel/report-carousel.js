const DEFAULT_COLORS = ['#818cf8', '#fb7185', '#fb923c', '#34d399', '#60a5fa', '#a78bfa'];
let chartUid = 0;

function triggerCascade(container) {
  const items = container.querySelectorAll('[data-anim]');
  items.forEach((el) => {
    el.classList.remove(el.dataset.anim);
    el.style.opacity = '0';
  });
  items.forEach((el, i) => {
    setTimeout(() => {
      el.style.opacity = '';
      el.classList.add(el.dataset.anim);
    }, i * 200);
  });
  // Line chart special handling
  const lp = container.querySelector('.rc-line-path');
  if (lp) {
    const len = lp.getTotalLength();
    lp.style.strokeDasharray = len;
    lp.style.strokeDashoffset = len;
    lp.classList.remove('rc-anim-line');
    requestAnimationFrame(() => { lp.classList.add('rc-anim-line'); });
  }
}

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

function formatVal(v) {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return String(v);
}

function niceScale(rawMax, ticks) {
  if (rawMax <= 0) return { max: ticks, step: 1 };
  const rough = rawMax / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / mag;
  let nice;
  if (residual <= 1) nice = 1;
  else if (residual <= 2) nice = 2;
  else if (residual <= 2.5) nice = 2.5;
  else if (residual <= 5) nice = 5;
  else nice = 10;
  const step = nice * mag;
  const max = Math.ceil(rawMax / step) * step;
  return { max, step };
}

function renderColumnChart(chartData) {
  const { items } = chartData;
  if (!items.length) return null;

  const rawMax = Math.max(...items.map((d) => Math.abs(d.value)));
  if (rawMax === 0) return null;
  const yTicks = 5;
  const { max: niceMax, step: tickStep } = niceScale(rawMax, yTicks);
  const actualTicks = Math.round(niceMax / tickStep);
  chartUid += 1;
  const uid = `cc${chartUid}`;

  const W = 420;
  const H = 280;
  const padL = 44;
  const padR = 16;
  const padTop = 32;
  const labelH = 44;
  const chartH = H - padTop - labelH;
  const barW = Math.min(64, Math.floor((W - padL - padR - 24) / items.length) - 16);
  const gap = Math.min(28, barW / 2);
  const barsW = items.length * barW + (items.length - 1) * gap;
  const barsStart = padL + (W - padL - padR - barsW) / 2;

  // Horizontal grid lines + y-axis labels (zero-based)
  const gridLines = Array.from({ length: actualTicks + 1 }, (_, i) => {
    const v = tickStep * i;
    const y = padTop + chartH - (v / niceMax) * chartH;
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#ccc" stroke-width="0.7" stroke-dasharray="4 3"/>
      <text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10" font-weight="600" fill="#666">${formatVal(v)}</text>`;
  }).join('');

  const gradients = items.map((d, i) => {
    const color = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    return `<linearGradient id="${uid}g${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.6"/>
    </linearGradient>`;
  }).join('');

  const barsHtml = items.map((d, i) => {
    const x = barsStart + i * (barW + gap);
    const barH = Math.max(2, (Math.abs(d.value) / niceMax) * chartH);
    const y = padTop + chartH - barH;
    const words = d.label.split(' ');
    const labelY = padTop + chartH + 16;
    const labelHtml = words.length > 2
      ? `<text x="${x + barW / 2}" y="${labelY}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${words.slice(0, 2).join(' ')}</text>
         <text x="${x + barW / 2}" y="${labelY + 13}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${words.slice(2).join(' ')}</text>`
      : `<text x="${x + barW / 2}" y="${labelY}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${d.label}</text>`;
    const r = Math.min(4, barW / 2);
    const barPath = `M ${x} ${padTop + chartH} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + barW - r} ${y} Q ${x + barW} ${y} ${x + barW} ${y + r} L ${x + barW} ${padTop + chartH} Z`;
    const baseline = padTop + chartH;
    return `
      <g data-anim="rc-anim-bar" style="transform-origin:${x + barW / 2}px ${baseline}px;opacity:0">
        <path class="rc-chart-hover" d="${barPath}" fill="url(#${uid}g${i})"><title>${d.label}: ${d.value}</title></path>
        <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${d.value}</text>
      </g>
      ${labelHtml}`;
  }).join('');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'rc-chart-svg');
  svg.setAttribute('role', 'img');
  svg.innerHTML = `<defs>${gradients}</defs>${gridLines}${barsHtml}`;
  return svg;
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  // Monotone cubic Hermite — smooth, never overshoots
  const n = pts.length;
  const dx = [];
  const dy = [];
  const m = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dy[i] / dx[i]);
  }
  const tangents = [m[0]];
  for (let i = 1; i < n - 1; i += 1) {
    if (m[i - 1] * m[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push((m[i - 1] + m[i]) / 2);
    }
  }
  tangents.push(m[n - 2]);
  // Ensure monotonicity
  for (let i = 0; i < n - 1; i += 1) {
    if (Math.abs(m[i]) < 1e-6) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / m[i];
      const b = tangents[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tangents[i] = t * a * m[i];
        tangents[i + 1] = t * b * m[i];
      }
    }
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const seg = dx[i] / 3;
    d += ` C ${pts[i].x + seg} ${pts[i].y + tangents[i] * seg}, ${pts[i + 1].x - seg} ${pts[i + 1].y - tangents[i + 1] * seg}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

function renderLineChart(chartData) {
  const { items } = chartData;
  if (items.length < 2) return null;
  const W = 420;
  const H = 280;
  const padL = 48;
  const padR = 16;
  const padTop = 20;
  const padBot = 40;
  const chartW = W - padL - padR;
  const chartH = H - padTop - padBot;
  const rawMax = Math.max(...items.map((d) => d.value));
  const yTicks = 5;
  const { max: niceMax, step: tickStep } = niceScale(rawMax, yTicks);
  const actualTicks = Math.round(niceMax / tickStep);
  const color = items[0].color || '#818cf8';
  chartUid += 1;
  const uid = `lc${chartUid}`;

  const pts = items.map((d, i) => {
    const x = padL + (i / (items.length - 1)) * chartW;
    const y = padTop + ((niceMax - d.value) / niceMax) * chartH;
    return { x, y, label: d.label, value: d.value };
  });

  // Smooth curve
  const curveD = smoothPath(pts);
  const areaD = `${curveD} L ${pts[pts.length - 1].x} ${padTop + chartH} L ${pts[0].x} ${padTop + chartH} Z`;

  // Month labels only (vertical lines shown on hover)
  const gridLines = '';
  const monthLabels = pts.map((p) => `<text x="${p.x}" y="${H - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${p.label}</text>`).join('');

  // Horizontal axis ticks (zero-based, nice round numbers)
  const hLines = Array.from({ length: actualTicks + 1 }, (_, i) => {
    const v = tickStep * i;
    const y = padTop + chartH - (v / niceMax) * chartH;
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#ccc" stroke-width="0.7" stroke-dasharray="4 3"/>
      <text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10" font-weight="600" fill="#666">${formatVal(v)}</text>`;
  }).join('');

  // Dots (hidden by default, shown on hover via the hover dot)
  const dots = '';

  // Invisible wider hit areas per data point for hover
  const hitAreas = pts.map((p, i) => {
    const hw = chartW / items.length;
    return `<rect x="${p.x - hw / 2}" y="${padTop}" width="${hw}" height="${chartH}" fill="transparent" data-idx="${i}" class="rc-line-hit"/>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'rc-line-wrap';
  wrap.style.position = 'relative';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'rc-chart-svg rc-line-svg');
  svg.setAttribute('role', 'img');
  svg.innerHTML = `
    <defs>
      <linearGradient id="${uid}area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${hLines}${gridLines}
    <path d="${areaD}" fill="url(#${uid}area)" class="rc-anim-area"/>
    <path d="${curveD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" class="rc-line-path"/>
    ${dots}
    <line class="rc-line-hover-rule" x1="0" y1="${padTop}" x2="0" y2="${padTop + chartH}" stroke="${color}" stroke-width="1.5" opacity="0"/>
    <circle class="rc-line-hover-dot" cx="0" cy="0" r="5" fill="${color}" opacity="0"/>
    ${hitAreas}
    ${monthLabels}`;
  wrap.append(svg);

  // Animate the line drawing
  requestAnimationFrame(() => {
    const linePath = svg.querySelector('.rc-line-path');
    if (linePath) {
      const len = linePath.getTotalLength();
      linePath.style.setProperty('--path-length', len);
      linePath.style.strokeDasharray = len;
      linePath.style.strokeDashoffset = len;
      linePath.classList.add('rc-anim-line');
    }
  });

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'rc-tooltip';
  wrap.append(tooltip);

  const hoverRule = svg.querySelector('.rc-line-hover-rule');
  const hoverDot = svg.querySelector('.rc-line-hover-dot');

  svg.addEventListener('mousemove', (e) => {
    const hit = e.target.closest('.rc-line-hit');
    if (hit) {
      const idx = parseInt(hit.dataset.idx, 10);
      const p = pts[idx];
      hoverRule.setAttribute('x1', p.x);
      hoverRule.setAttribute('x2', p.x);
      hoverRule.setAttribute('opacity', '0.5');
      hoverDot.setAttribute('cx', p.x);
      hoverDot.setAttribute('cy', p.y);
      hoverDot.setAttribute('opacity', '1');
      tooltip.textContent = `${p.label}: ${formatVal(p.value)}`;
      tooltip.style.opacity = '1';
      const rect = wrap.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left + 12}px`;
      tooltip.style.top = `${e.clientY - rect.top - 28}px`;
    }
  });
  svg.addEventListener('mouseleave', () => {
    hoverRule.setAttribute('opacity', '0');
    hoverDot.setAttribute('opacity', '0');
    tooltip.style.opacity = '0';
  });

  return wrap;
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
    seg.className = 'rc-stacked-seg rc-chart-hover';
    seg.dataset.anim = 'rc-anim-stacked-seg';
    seg.style.opacity = '0';
    const pct = (d.value / total) * 100;
    seg.style.width = `${pct}%`;
    const segColor = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    seg.style.background = `linear-gradient(180deg, ${segColor}, ${segColor}bb)`;
    seg.title = `${d.label}: ${d.value}%`;
    bar.append(seg);
  });
  wrap.append(bar);

  const legend = document.createElement('div');
  legend.className = 'rc-stacked-legend';
  items.forEach((d, i) => {
    const item = document.createElement('div');
    item.className = 'rc-stacked-legend-item';
    item.dataset.anim = 'rc-anim-fade-in';
    item.style.opacity = '0';
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
  chartUid += 1;
  const uid = `dn${chartUid}`;

  const wrap = document.createElement('div');
  wrap.className = 'rc-donut-wrap';

  if (centerLabel) {
    const titleEl = document.createElement('div');
    titleEl.className = 'rc-chart-title';
    titleEl.textContent = centerLabel;
    wrap.append(titleEl);
  }

  const cx = 110;
  const cy = 110;
  const r = 90;
  const innerR = 54;
  let angle = -Math.PI / 2;

  const arcs = segments.map((d, i) => {
    const slice = (d.value / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const xi1 = cx + innerR * Math.cos(angle);
    const yi1 = cy + innerR * Math.sin(angle);
    angle += slice;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const xi2 = cx + innerR * Math.cos(angle);
    const yi2 = cy + innerR * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    const fill = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    const gradId = `${uid}g${i}`;
    const glowId = `${uid}w${i}`;
    const arcPath = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${innerR} ${innerR} 0 ${large} 0 ${xi1} ${yi1} Z`;
    return {
      path: `<path class="rc-donut-seg" data-anim="rc-anim-donut-seg" style="transform-origin:${cx}px ${cy}px;opacity:0" data-label="${d.label}" data-value="${d.value}%" d="${arcPath}" fill="url(#${gradId})" stroke="url(#${glowId})" stroke-width="1.5" stroke-linejoin="round"/>`,
      grad: `<radialGradient id="${gradId}" cx="30%" cy="30%" r="70%"><stop offset="0%" stop-color="${fill}" stop-opacity="1"/><stop offset="100%" stop-color="${fill}" stop-opacity="0.82"/></radialGradient>
        <linearGradient id="${glowId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity="0.25"/><stop offset="100%" stop-color="#fff" stop-opacity="0.05"/></linearGradient>`,
    };
  });

  const arcsHtml = arcs.map((a) => a.path).join('');
  const gradsHtml = arcs.map((a) => a.grad).join('');

  const centerHtml = centerValue
    ? `<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="28" font-weight="800" fill="currentColor" data-anim="rc-anim-fade-in" style="opacity:0">${centerValue}</text>`
    : '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${cx * 2} ${cy * 2}`);
  svg.setAttribute('class', 'rc-chart-svg rc-donut-svg');
  svg.setAttribute('role', 'img');
  const filterHtml = '<filter id="donutShadow"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.12"/></filter>';
  svg.innerHTML = `<defs>${gradsHtml}${filterHtml}</defs><g filter="url(#donutShadow)">${arcsHtml}</g>${centerHtml}`;
  wrap.append(svg);

  // Floating tooltip on hover
  const tooltip = document.createElement('div');
  tooltip.className = 'rc-tooltip';
  wrap.append(tooltip);
  wrap.style.position = 'relative';

  svg.addEventListener('mousemove', (e) => {
    const seg = e.target.closest('.rc-donut-seg');
    if (seg) {
      tooltip.textContent = `${seg.dataset.label}: ${seg.dataset.value}`;
      tooltip.style.opacity = '1';
      const rect = wrap.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left + 12}px`;
      tooltip.style.top = `${e.clientY - rect.top - 28}px`;
    } else {
      tooltip.style.opacity = '0';
    }
  });
  svg.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });

  return wrap;
}

function renderHorizontalBars(chartData) {
  const { items } = chartData;
  if (!items.length) return null;

  const rawMax = Math.max(...items.map((d) => d.value));
  const xTicks = 4;
  const { max: niceMax, step: tickStep } = niceScale(rawMax || 1, xTicks);
  const actualTicks = Math.round(niceMax / tickStep);

  const labelW = 120;
  const barH = 32;
  const barGap = 20;
  const chartL = labelW + 8;
  const chartR = 16;
  const W = 420;
  const barsH = items.length * barH + (items.length - 1) * barGap;
  const barPad = 20;
  const padTop = 12;
  const padBot = 32;
  const H = padTop + barPad + barsH + barPad + padBot;
  const chartW = W - chartL - chartR;
  chartUid += 1;
  const uid = `hb${chartUid}`;

  const wrap = document.createElement('div');
  wrap.className = 'rc-hbars-wrap';
  wrap.style.position = 'relative';

  // Gradients
  const gradients = items.map((d, i) => {
    const color = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    return `<linearGradient id="${uid}g${i}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.65"/>
    </linearGradient>`;
  }).join('');

  // Vertical grid lines + x-axis labels
  const unit = items[0]?.suffix || '';
  const gridLines = Array.from({ length: actualTicks + 1 }, (_, i) => {
    const v = tickStep * i;
    const x = chartL + (v / niceMax) * chartW;
    return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${H - padBot}" stroke="#ccc" stroke-width="0.7" stroke-dasharray="4 3"/>
      <text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10" font-weight="600" fill="#666">${v}${unit}</text>`;
  }).join('');

  // Bars + labels
  const barsHtml = items.map((d, i) => {
    const suffix = d.suffix || '';
    const barW = Math.max(2, (d.value / niceMax) * chartW);
    const y = padTop + barPad + i * (barH + barGap);
    const r = Math.min(8, barH / 2);
    const barPath = `M ${chartL} ${y} L ${chartL + barW - r} ${y} Q ${chartL + barW} ${y} ${chartL + barW} ${y + r} L ${chartL + barW} ${y + barH - r} Q ${chartL + barW} ${y + barH} ${chartL + barW - r} ${y + barH} L ${chartL} ${y + barH} Z`;
    return `<text x="${labelW}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="11" font-weight="700" fill="currentColor">${d.label}</text>
      <g data-anim="rc-anim-hbar" style="transform-origin:${chartL}px ${y + barH / 2}px;opacity:0"><path class="rc-hbar-path" d="${barPath}" fill="url(#${uid}g${i})" data-label="${d.label}" data-value="${d.value}${suffix}"><title>${d.label}: ${d.value}${suffix}</title></path></g>`;
  }).join('');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'rc-chart-svg rc-hbars-svg');
  svg.setAttribute('role', 'img');
  svg.innerHTML = `<defs>${gradients}</defs>${gridLines}${barsHtml}`;
  wrap.append(svg);

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'rc-tooltip';
  wrap.append(tooltip);

  svg.addEventListener('mousemove', (e) => {
    const bar = e.target.closest('.rc-hbar-path');
    if (bar) {
      tooltip.textContent = `${bar.dataset.label}: ${bar.dataset.value}`;
      tooltip.style.opacity = '1';
      const rect = wrap.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left + 12}px`;
      tooltip.style.top = `${e.clientY - rect.top - 28}px`;
    } else {
      tooltip.style.opacity = '0';
    }
  });
  svg.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });

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
    <div class="rc-bigfigure-value" data-anim="rc-anim-bigfig" style="opacity:0">${val}</div>
    ${unit ? `<div class="rc-bigfigure-unit" data-anim="rc-anim-fade-in" style="opacity:0">${unit}</div>` : ''}
    ${ctx ? `<div class="rc-bigfigure-ctx" data-anim="rc-anim-fade-in" style="opacity:0">${ctx}</div>` : ''}`;
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
    row.dataset.anim = 'rc-anim-rec';
    row.style.opacity = '0';
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
    growth: '↗',
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
    card.dataset.anim = 'rc-anim-rec';
    card.style.opacity = '0';
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
    const dlIcon = document.createElement('span');
    dlIcon.className = 'rc-download-icon';
    dlIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M13.53 9.427c-.292-.292-.766-.294-1.06 0l-1.717 1.714V2.75c0-.414-.336-.75-.75-.75s-.75.336-.75.75v8.4L7.53 9.426c-.293-.293-.767-.293-1.06 0s-.293.767 0 1.06l2.998 2.998c.146.147.338.22.53.22.191 0 .384-.073.53-.22l3.002-2.998c.293-.292.293-.767 0-1.06"/><path fill="currentColor" d="M15.75 18H4.25C3.01 18 2 16.99 2 15.75v-2.021c0-.415.336-.75.75-.75s.75.335.75.75v2.021c0 .413.337.75.75.75h11.5c.413 0 .75-.337.75-.75v-2.021c0-.415.336-.75.75-.75s.75.335.75.75v2.021c0 1.24-1.01 2.25-2.25 2.25"/></svg>';
    dlBtn.prepend(dlIcon);
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
  slideFooter.append(counterLeft);
  if (downloadLink) {
    const dlBtnFooter = downloadLink.cloneNode(true);
    dlBtnFooter.className = 'rc-download-btn rc-download-footer';
    const dlIconFooter = document.createElement('span');
    dlIconFooter.className = 'rc-download-icon';
    dlIconFooter.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M13.53 9.427c-.292-.292-.766-.294-1.06 0l-1.717 1.714V2.75c0-.414-.336-.75-.75-.75s-.75.336-.75.75v8.4L7.53 9.426c-.293-.293-.767-.293-1.06 0s-.293.767 0 1.06l2.998 2.998c.146.147.338.22.53.22.191 0 .384-.073.53-.22l3.002-2.998c.293-.292.293-.767 0-1.06"/><path fill="currentColor" d="M15.75 18H4.25C3.01 18 2 16.99 2 15.75v-2.021c0-.415.336-.75.75-.75s.75.335.75.75v2.021c0 .413.337.75.75.75h11.5c.413 0 .75-.337.75-.75v-2.021c0-.415.336-.75.75-.75s.75.335.75.75v2.021c0 1.24-1.01 2.25-2.25 2.25"/></svg>';
    dlBtnFooter.prepend(dlIconFooter);
    slideFooter.append(dlBtnFooter);
  }
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

    prevBtn.disabled = false;
    nextBtn.disabled = false;

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
    const outDir = direction === 'prev' ? 80 : -80;
    const inDir = direction === 'prev' ? -80 : 80;
    const currIdx = currentIdxByTab[currentTab];

    slideEls.forEach((slideEl) => {
      const inTab = parseInt(slideEl.dataset.tab, 10) === currentTab;
      const isCurrent = parseInt(slideEl.dataset.localIdx, 10) === currIdx;
      const isTarget = parseInt(slideEl.dataset.localIdx, 10) === localIdx;

      if (inTab && isCurrent) {
        // Animate out
        slideEl.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.4, 0, 1, 1)';
        slideEl.style.opacity = '0';
        slideEl.style.transform = `translateX(${outDir}px)`;
        setTimeout(() => { slideEl.hidden = true; }, 350);
      } else if (inTab && isTarget) {
        // Animate in immediately (overlaps outgoing briefly)
        slideEl.hidden = false;
        slideEl.style.transition = 'none';
        slideEl.style.opacity = '0';
        slideEl.style.transform = `translateX(${inDir}px)`;
        // Trigger cascading chart animations
        triggerCascade(slideEl);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            slideEl.style.transition = 'opacity 0.35s ease, transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
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
      if (inTab && isActive) triggerCascade(slideEl);
    });
    updateNav();
  }

  prevBtn.addEventListener('click', () => {
    const curr = currentIdxByTab[currentTab];
    const count = tabSlides[currentTab].length;
    const target = curr > 0 ? curr - 1 : count - 1;
    goToSlide(target, 'prev');
  });

  nextBtn.addEventListener('click', () => {
    const curr = currentIdxByTab[currentTab];
    const count = tabSlides[currentTab].length;
    const target = curr < count - 1 ? curr + 1 : 0;
    goToSlide(target, 'next');
  });

  updateNav();

  // Trigger cascade on the initial visible slide
  const initialSlide = slideEls.find((s) => !s.hidden);
  if (initialSlide) triggerCascade(initialSlide);
}
