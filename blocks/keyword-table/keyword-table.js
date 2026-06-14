/**
 * Keyword table with explicit column headers (so values are self-explanatory).
 * Row 0 = headers: Category | Intent | Monthly searches | Rank
 * Rows 1..n = data: Casual outerwear | Purchase | 201K | 10
 * Rank cell is rendered as a chip; intent as a subtle tag.
 */
function rankClass(rank) {
  const n = parseInt(rank, 10);
  if (Number.isNaN(n)) return 'neutral';
  if (n <= 3) return 'good';
  if (n <= 10) return 'warning';
  return 'poor';
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  if (!rows.length) return;
  const headers = [...rows[0].children].map((c) => c.textContent.trim());

  block.textContent = '';
  const table = document.createElement('div');
  table.className = 'kwt-table';

  const head = document.createElement('div');
  head.className = 'kwt-head';
  headers.forEach((t, i) => {
    const h = document.createElement('span');
    h.className = `kwt-h kwt-col-${i}`;
    h.textContent = t;
    head.append(h);
  });
  table.append(head);

  rows.slice(1).forEach((row) => {
    const cells = [...row.children].map((c) => c.textContent.trim());
    const rowEl = document.createElement('div');
    rowEl.className = 'kwt-row';
    cells.forEach((t, i) => {
      const cell = document.createElement('span');
      cell.className = `kwt-cell kwt-col-${i}`;
      if (i === 1) {
        // intent tag
        cell.innerHTML = `<span class="kwt-intent">${t}</span>`;
      } else if (i === cells.length - 1) {
        // rank chip
        cell.innerHTML = `<span class="kwt-rank kwt-${rankClass(t)}">#${t.replace(/^#/, '')}</span>`;
      } else {
        cell.textContent = t;
      }
      rowEl.append(cell);
    });
    table.append(rowEl);
  });

  block.append(table);
}
