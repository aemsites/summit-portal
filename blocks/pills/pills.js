/**
 * Tag pills. One row; each cell becomes a pill. (Also tolerates one cell per row.)
 */
export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const labels = [];
  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length > 1) {
      cells.forEach((cell) => {
        const t = cell.textContent.trim();
        if (t) labels.push(t);
      });
    } else {
      const t = row.textContent.trim();
      if (t) labels.push(t);
    }
  });

  block.textContent = '';
  const wrap = document.createElement('div');
  wrap.className = 'pills-row';
  labels.forEach((t) => {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = t;
    wrap.append(pill);
  });
  block.append(wrap);
}
