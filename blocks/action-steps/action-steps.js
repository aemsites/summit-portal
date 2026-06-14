/**
 * Numbered action steps with bullets + a product attribution line.
 * One row per step: number | title | bullets (semicolon-separated) | product | tone
 *   tone (optional): accent color key for the step rail (positive|warning|negative|neutral)
 */
function toneClass(tone) {
  const t = (tone || '').toLowerCase();
  if (t === 'positive' || t === 'growth') return 'positive';
  if (t === 'negative' || t === 'risk' || t === 'critical') return 'negative';
  if (t === 'warning' || t === 'priority' || t === 'action') return 'warning';
  return 'neutral';
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  block.textContent = '';
  const list = document.createElement('div');
  list.className = 'ast-list';

  rows.forEach((row, i) => {
    const cells = [...row.children];
    const num = cells[0]?.textContent.trim() || String(i + 1);
    const title = cells[1]?.textContent.trim() || '';
    const bulletsRaw = cells[2]?.textContent.trim() || '';
    const product = cells[3]?.textContent.trim() || '';
    const cls = toneClass(cells[4]?.textContent.trim());

    const item = document.createElement('div');
    item.className = `ast-item ast-${cls}`;

    // Header: number badge + title on one row
    const header = document.createElement('div');
    header.className = 'ast-header';
    const badge = document.createElement('div');
    badge.className = 'ast-num';
    badge.textContent = num;
    const t = document.createElement('p');
    t.className = 'ast-title';
    t.textContent = title;
    header.append(badge, t);
    item.append(header);

    const bullets = bulletsRaw.split(';').map((b) => b.trim()).filter(Boolean);
    if (bullets.length) {
      const ul = document.createElement('ul');
      ul.className = 'ast-bullets';
      bullets.forEach((b) => {
        const li = document.createElement('li');
        li.textContent = b;
        ul.append(li);
      });
      item.append(ul);
    }

    if (product) {
      const p = document.createElement('div');
      p.className = 'ast-product';
      p.textContent = product;
      item.append(p);
    }

    list.append(item);
  });

  block.append(list);
}
