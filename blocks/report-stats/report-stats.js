export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
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
