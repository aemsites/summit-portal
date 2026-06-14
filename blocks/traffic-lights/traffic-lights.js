/**
 * Traffic-light status rows (real-user experience).
 * One row per metric: label | status(Good|Needs Work|Failing)
 */
function statusClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('good') || s.includes('pass')) return 'good';
  if (s.includes('fail') || s.includes('poor') || s.includes('critical')) return 'poor';
  return 'warning';
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  block.textContent = '';
  const list = document.createElement('div');
  list.className = 'tfl-list';

  rows.forEach((row) => {
    const cells = [...row.children];
    const label = cells[0]?.textContent.trim() || '';
    const status = cells[1]?.textContent.trim() || '';
    const cls = statusClass(status);

    const item = document.createElement('div');
    item.className = `tfl-row tfl-${cls}`;

    const l = document.createElement('span');
    l.className = 'tfl-label';
    l.textContent = label;

    const badge = document.createElement('span');
    badge.className = 'tfl-badge';
    badge.textContent = status;

    item.append(l, badge);
    list.append(item);
  });

  block.append(list);
}
