/**
 * Bold research stat showcase — a dark banner with a headline + a row of big
 * figures, for standout market/research data (not a wall of text).
 * Row 0: headline | source        (heading text | small source credit)
 * Rows 1..n: value | label         (e.g. "+393%" | "AI-driven retail traffic growth, YoY")
 */
export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  if (!rows.length) return;

  const head = [...rows[0].children];
  const headline = head[0]?.textContent.trim() || '';
  const source = head[1]?.textContent.trim() || '';

  block.textContent = '';
  const banner = document.createElement('div');
  banner.className = 'ssc-banner';

  if (headline) {
    const h = document.createElement('p');
    h.className = 'ssc-headline';
    h.textContent = headline;
    banner.append(h);
  }

  const grid = document.createElement('div');
  grid.className = 'ssc-grid';
  rows.slice(1).forEach((row) => {
    const cells = [...row.children];
    const value = cells[0]?.textContent.trim() || '';
    const label = cells[1]?.textContent.trim() || '';
    const stat = document.createElement('div');
    stat.className = 'ssc-stat';
    stat.innerHTML = `<div class="ssc-value">${value}</div><div class="ssc-label">${label}</div>`;
    grid.append(stat);
  });
  banner.append(grid);

  if (source) {
    const s = document.createElement('p');
    s.className = 'ssc-source';
    s.textContent = source;
    banner.append(s);
  }
  block.append(banner);
}
