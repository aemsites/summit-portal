const COLORS = ['#e60000', '#3b82f6', '#f59e0b', '#22c55e'];

export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const segments = rows.map((row, i) => {
    const cells = [...row.children];
    return {
      label: cells[0]?.textContent.trim() || '',
      pct: parseFloat(cells[1]?.textContent.trim() || '0'),
      desc: cells[2]?.textContent.trim() || '',
      color: COLORS[i % COLORS.length],
    };
  });

  el.textContent = '';

  const container = document.createElement('div');
  container.className = 'rb-container';

  // Bar
  const bar = document.createElement('div');
  bar.className = 'rb-bar';
  segments.forEach((seg) => {
    const s = document.createElement('div');
    s.className = 'rb-segment';
    s.style.width = `${seg.pct}%`;
    s.style.background = seg.color;
    if (seg.pct >= 10) {
      s.innerHTML = `<span class="rb-seg-label">${seg.label}</span><span class="rb-seg-pct">${seg.pct}%</span>`;
    }
    bar.append(s);
  });

  // Scale
  const scale = document.createElement('div');
  scale.className = 'rb-scale';
  ['0%', '25%', '50%', '75%', '100%'].forEach((t) => {
    const sp = document.createElement('span');
    sp.textContent = t;
    scale.append(sp);
  });

  // Legend
  const legend = document.createElement('div');
  legend.className = 'rb-legend';
  segments.forEach((seg) => {
    const item = document.createElement('div');
    item.className = 'rb-legend-item';
    const dot = document.createElement('span');
    dot.className = 'rb-legend-dot';
    dot.style.background = seg.color;
    const label = document.createElement('span');
    label.className = 'rb-legend-label';
    label.textContent = seg.label;
    item.append(dot, label);
    if (seg.desc) {
      const desc = document.createElement('span');
      desc.className = 'rb-legend-desc';
      desc.textContent = `\u2014 ${seg.desc}`;
      item.append(desc);
    }
    legend.append(item);
  });

  container.append(bar, scale, legend);
  el.append(container);
}
