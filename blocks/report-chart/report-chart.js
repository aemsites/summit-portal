function formatValue(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatDate(dateStr) {
  const [y, m] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const data = rows.map((row) => {
    const cells = [...row.children];
    return {
      date: cells[0]?.textContent.trim() || '',
      value: parseInt(cells[1]?.textContent.trim() || '0', 10),
    };
  });

  if (!data.length) return;

  const pad = { top: 20, right: 20, bottom: 40, left: 60 };
  const w = 600;
  const h = 300;
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const values = data.map((d) => d.value);
  const minV = Math.min(...values) * 0.9;
  const maxV = Math.max(...values) * 1.05;
  const range = maxV - minV || 1;

  function x(i) { return pad.left + (i / (data.length - 1)) * cw; }
  function y(v) { return pad.top + ch - ((v - minV) / range) * ch; }

  // Grid lines
  const gridCount = 5;
  let gridLines = '';
  for (let i = 0; i <= gridCount; i += 1) {
    const val = minV + (range * i) / gridCount;
    const yy = y(val);
    gridLines += `<line x1="${pad.left}" y1="${yy}" x2="${w - pad.right}" y2="${yy}" stroke="#e5e7eb" stroke-dasharray="4 4"/>`;
    gridLines += `<text x="${pad.left - 8}" y="${yy + 4}" text-anchor="end" fill="#9ca3af" font-size="11">${formatValue(val)}</text>`;
  }

  // Path + area
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`);
  const linePath = `M${pts.join(' L')}`;
  const areaPath = `${linePath} L${x(data.length - 1)},${pad.top + ch} L${x(0)},${pad.top + ch} Z`;

  // Dots
  const dots = data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.value)}" r="3.5" fill="#e60000"/>`).join('');

  // X-axis labels
  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data
    .filter((_, i) => i % step === 0 || i === data.length - 1)
    .map((d, _, arr) => {
      const i = data.indexOf(d);
      return `<text x="${x(i)}" y="${h - 4}" text-anchor="middle" fill="#9ca3af" font-size="11">${formatDate(d.date)}</text>`;
    })
    .join('');

  const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="rch-svg">
    ${gridLines}
    <path d="${areaPath}" fill="rgba(230,0,0,0.08)" />
    <path d="${linePath}" fill="none" stroke="#e60000" stroke-width="2" stroke-linejoin="round" />
    ${dots}
    ${xLabels}
  </svg>`;

  el.textContent = '';
  const container = document.createElement('div');
  container.className = 'rch-container';

  const title = document.createElement('h3');
  title.className = 'rch-title';
  title.textContent = 'Traffic Trend (12 months)';

  const chartDiv = document.createElement('div');
  chartDiv.className = 'rch-chart';
  chartDiv.innerHTML = svg;

  container.append(title, chartDiv);
  el.append(container);
}
