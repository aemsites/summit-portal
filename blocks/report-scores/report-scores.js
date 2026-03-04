function gradeClass(score) {
  const n = parseInt(score, 10);
  if (n >= 90) return 'good';
  if (n >= 50) return 'warning';
  return 'poor';
}

function metricStatus(label, val) {
  const n = parseFloat(val);
  if (label === 'LCP' && n > 2.5) return 'poor';
  if (label === 'FID' && n > 100) return 'poor';
  if (label === 'CLS' && n > 0.1) return 'poor';
  return 'good';
}

export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const grid = document.createElement('div');
  grid.className = 'rsc-grid';

  rows.forEach((row) => {
    const cells = [...row.children];
    const pageName = cells[0]?.textContent.trim() || '';
    const score = cells[1]?.textContent.trim() || '';
    const lcp = cells[2]?.textContent.trim() || '';
    const fid = cells[3]?.textContent.trim() || '';
    const cls = cells[4]?.textContent.trim() || '';
    const summary = cells[5]?.textContent.trim() || '';
    const rec = cells[6]?.textContent.trim() || '';

    const gc = gradeClass(score);

    const card = document.createElement('div');
    card.className = 'rsc-card';

    const badge = document.createElement('div');
    badge.className = `rsc-score-badge rsc-${gc}`;
    badge.textContent = score;

    const name = document.createElement('h3');
    name.className = 'rsc-page-name';
    name.textContent = pageName;

    const metrics = document.createElement('div');
    metrics.className = 'rsc-metrics';
    [['LCP', lcp], ['FID', fid], ['CLS', cls]].forEach(([label, val]) => {
      const m = document.createElement('div');
      m.className = 'rsc-metric';
      const ml = document.createElement('span');
      ml.className = 'rsc-metric-label';
      ml.textContent = label;
      const mv = document.createElement('span');
      mv.className = `rsc-metric-value rsc-mv-${metricStatus(label, val)}`;
      mv.textContent = val;
      m.append(ml, mv);
      metrics.append(m);
    });

    const sum = document.createElement('p');
    sum.className = 'rsc-summary';
    sum.textContent = summary;

    card.append(badge, name, metrics, sum);

    if (rec) {
      const tag = document.createElement('span');
      tag.className = 'rsc-recommendation';
      tag.textContent = rec;
      card.append(tag);
    }

    grid.append(card);
  });

  el.textContent = '';
  el.append(grid);
}
