const SVG_NS = 'http://www.w3.org/2000/svg';

function grade(score) {
  const n = parseInt(score, 10);
  if (n >= 90) return 'good';
  if (n >= 50) return 'warning';
  return 'poor';
}

/** Circular score ring (0-100) with center label. */
function ring(scoreNum, scoreLabel, gradeKey) {
  const vb = 120;
  const c = vb / 2;
  const sw = 9;
  const r = c - sw - 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(1, Math.max(0, scoreNum / 100)) * circ;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pm-ring-svg');
  svg.setAttribute('viewBox', `0 0 ${vb} ${vb}`);
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(SVG_NS, 'circle');
  ['cx', 'cy'].forEach((a) => track.setAttribute(a, String(c)));
  track.setAttribute('r', String(r));
  track.setAttribute('class', 'pm-ring-track');
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke-width', String(sw));
  const arc = document.createElementNS(SVG_NS, 'circle');
  ['cx', 'cy'].forEach((a) => arc.setAttribute(a, String(c)));
  arc.setAttribute('r', String(r));
  arc.setAttribute('class', 'pm-ring-arc');
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke-width', String(sw));
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('transform', `rotate(-90 ${c} ${c})`);
  arc.setAttribute('stroke-dasharray', `${dash} ${circ}`);
  svg.append(track, arc);
  const wrap = document.createElement('div');
  wrap.className = `pm-ring pm-${gradeKey}`;
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `Score ${scoreLabel} out of 100`);
  const label = document.createElement('div');
  label.className = 'pm-ring-label';
  label.innerHTML = `<span class="pm-ring-num">${scoreLabel}</span><span class="pm-ring-out">/100</span>`;
  wrap.append(svg, label);
  return wrap;
}

/**
 * Clean mobile-first performance display.
 * Row 0: score | scoreLabel | summary   (the headline score ring + sentence)
 * Rows 1..n: metric | value | rating(Good|Needs Work|Failing) | plainLabel
 */
export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  if (!rows.length) return;

  const head = [...rows[0].children];
  const score = head[0]?.textContent.trim() || '0';
  const scoreNum = parseInt(score, 10) || 0;
  const summary = head[2]?.textContent.trim() || head[1]?.textContent.trim() || '';
  const gradeKey = grade(scoreNum);

  block.textContent = '';
  const card = document.createElement('div');
  card.className = 'pm-card';

  const hero = document.createElement('div');
  hero.className = 'pm-hero';
  hero.append(ring(scoreNum, score, gradeKey));
  const meta = document.createElement('div');
  meta.className = 'pm-hero-meta';
  meta.innerHTML = `<p class="pm-hero-label">Google Mobile Score</p><p class="pm-hero-summary">${summary}</p>`;
  hero.append(meta);
  card.append(hero);

  const metrics = document.createElement('div');
  metrics.className = 'pm-metrics';
  rows.slice(1).forEach((row) => {
    const cells = [...row.children];
    const name = cells[0]?.textContent.trim() || '';
    const value = cells[1]?.textContent.trim() || '';
    const rating = cells[2]?.textContent.trim() || '';
    const plain = cells[3]?.textContent.trim() || '';
    const r = (rating || '').toLowerCase();
    let g = 'warning';
    if (r.includes('good') || r.includes('pass')) g = 'good';
    else if (r.includes('fail') || r.includes('poor')) g = 'poor';

    const item = document.createElement('div');
    item.className = `pm-metric pm-${g}`;
    item.innerHTML = `
      <div class="pm-metric-top">
        <span class="pm-metric-name">${name}</span>
        <span class="pm-metric-rating">${rating}</span>
      </div>
      <div class="pm-metric-value">${value}</div>
      ${plain ? `<div class="pm-metric-plain">${plain}</div>` : ''}
    `;
    metrics.append(item);
  });
  card.append(metrics);
  block.append(card);
}
