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

function isDateRow(text) {
  return /^\d{4}-\d{2}/.test(text);
}

function buildChart(data) {
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

  const gridCount = 5;
  let gridLines = '';
  for (let i = 0; i <= gridCount; i += 1) {
    const val = minV + (range * i) / gridCount;
    const yy = y(val);
    gridLines += `<line x1="${pad.left}" y1="${yy}" x2="${w - pad.right}" y2="${yy}" stroke="#e5e7eb" stroke-dasharray="4 4"/>`;
    gridLines += `<text x="${pad.left - 8}" y="${yy + 4}" text-anchor="end" fill="#9ca3af" font-size="11">${formatValue(val)}</text>`;
  }

  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`);
  const linePath = `M${pts.join(' L')}`;
  const areaPath = `${linePath} L${x(data.length - 1)},${pad.top + ch} L${x(0)},${pad.top + ch} Z`;
  const dots = data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.value)}" r="3.5" fill="#e60000"/>`).join('');

  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data
    .filter((_, i) => i % step === 0 || i === data.length - 1)
    .map((d) => {
      const i = data.indexOf(d);
      return `<text x="${x(i)}" y="${h - 4}" text-anchor="middle" fill="#9ca3af" font-size="11">${formatDate(d.date)}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="rch-svg">
    ${gridLines}
    <path d="${areaPath}" fill="rgba(230,0,0,0.08)" />
    <path d="${linePath}" fill="none" stroke="#e60000" stroke-width="2" stroke-linejoin="round" />
    ${dots}
    ${xLabels}
  </svg>`;
}

function buildPanelCard(icon, heading, content) {
  const card = document.createElement('div');
  card.className = 'rch-panel-card';
  const header = document.createElement('div');
  header.className = 'rch-panel-header';
  header.innerHTML = `<span class="rch-panel-icon">${icon}</span><h4>${heading}</h4>`;
  card.append(header);
  card.append(content);
  return card;
}

export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const chartData = [];
  const panelSections = [];

  // Parse rows: date rows → chart data, others → panel content
  // Rows with 2 cells that aren't dates → panel section header
  // Rows with 1 cell (non-date) → list item for current panel
  let currentPanel = null;
  rows.forEach((row) => {
    const cells = [...row.children];
    const first = cells[0]?.textContent.trim() || '';

    if (isDateRow(first)) {
      chartData.push({
        date: first,
        value: parseInt(cells[1]?.textContent.trim() || '0', 10),
      });
    } else if (first && cells.length >= 2) {
      // Panel section header row (has 2 cells): title | description
      const second = cells[1]?.textContent.trim() || '';
      currentPanel = { title: first, icon: '', items: [], text: second };
      const emojiMatch = first.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*/u);
      if (emojiMatch) {
        currentPanel.icon = emojiMatch[0].trim();
        currentPanel.title = first.slice(emojiMatch[0].length).trim();
      }
      panelSections.push(currentPanel);
    } else if (first && currentPanel) {
      // Single-cell row → list item for the current panel
      currentPanel.items.push(first);
    }
  });

  if (!chartData.length) return;

  const hasPanel = panelSections.length > 0;
  if (hasPanel) el.classList.add('rch-with-panel');

  el.textContent = '';

  // Layout wrapper
  const layout = document.createElement('div');
  layout.className = hasPanel ? 'rch-layout' : '';

  // Chart card
  const container = document.createElement('div');
  container.className = 'rch-container';

  const title = document.createElement('h3');
  title.className = 'rch-title';
  title.textContent = 'Traffic Trend (12 months)';

  const chartDiv = document.createElement('div');
  chartDiv.className = 'rch-chart';
  chartDiv.innerHTML = buildChart(chartData);

  container.append(title, chartDiv);
  layout.append(container);

  // Panel (right side)
  if (hasPanel) {
    const panel = document.createElement('div');
    panel.className = 'rch-panel';

    panelSections.forEach((section) => {
      const content = document.createElement('div');
      content.className = 'rch-panel-content';

      if (section.text) {
        const p = document.createElement('p');
        p.className = 'rch-panel-text';
        p.textContent = section.text;
        content.append(p);
      }

      if (section.items.length) {
        const ul = document.createElement('ul');
        ul.className = 'rch-panel-list';
        section.items.forEach((item) => {
          const li = document.createElement('li');
          li.textContent = item;
          ul.append(li);
        });
        content.append(ul);
      }

      const icon = section.icon || (section.title.toLowerCase().includes('opportunit') ? '💡' : '📊');
      panel.append(buildPanelCard(icon, section.title, content));
    });

    layout.append(panel);
  }

  el.append(layout);
}
