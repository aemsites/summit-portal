function gradeClass(score) {
  const n = parseInt(score, 10);
  if (n >= 90) return 'good';
  if (n >= 50) return 'warning';
  return 'poor';
}

function formatPageUrl(href) {
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '/' : u.pathname);
  } catch {
    return href;
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Ring-style score meter (stroke from 12 o'clock, clockwise; round caps).
 * @param {string} scoreLabel Displayed score text
 * @param {number} scoreNum 0–100
 * @param {'poor'|'warning'|'good'} gradeKey
 * @returns {HTMLDivElement}
 */
function createScoreMeterWrap(scoreLabel, scoreNum, gradeKey) {
  const vb = 40;
  const c = vb / 2;
  /* Ring r = discR - stroke/2 so stroke outer edge meets disc edge. */
  const discR = 15;
  const strokeW = 2.5;
  const ringR = discR - strokeW / 2;
  const circumference = 2 * Math.PI * ringR;
  const pct = Math.min(1, Math.max(0, scoreNum / 100));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'rsc-score-svg');
  svg.setAttribute('viewBox', `0 0 ${vb} ${vb}`);
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');

  const disc = document.createElementNS(SVG_NS, 'circle');
  disc.setAttribute('class', 'rsc-score-disc');
  disc.setAttribute('cx', String(c));
  disc.setAttribute('cy', String(c));
  disc.setAttribute('r', String(discR));

  const arc = document.createElementNS(SVG_NS, 'circle');
  arc.setAttribute('class', 'rsc-score-arc');
  arc.setAttribute('cx', String(c));
  arc.setAttribute('cy', String(c));
  arc.setAttribute('r', String(ringR));
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke-width', String(strokeW));
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('transform', `rotate(-90 ${c} ${c})`);
  const dash = pct * circumference;
  arc.setAttribute('stroke-dasharray', `${dash} ${circumference}`);
  if (scoreNum <= 0) {
    arc.setAttribute('opacity', '0');
  }

  svg.append(disc, arc);

  const wrap = document.createElement('div');
  wrap.className = `rsc-score-wrap rsc-${gradeKey}`;
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `Score ${scoreLabel} out of 100`);

  const badge = document.createElement('div');
  badge.className = 'rsc-score-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = scoreLabel;

  wrap.append(svg, badge);
  return wrap;
}

function metricStatus(label, val) {
  const n = parseFloat(val);
  if (label === 'LCP') {
    if (n <= 2.5) return 'good';
    if (n <= 4) return 'warning';
    return 'poor';
  }
  if (label === 'INP') {
    if (n <= 200) return 'good';
    if (n <= 500) return 'warning';
    return 'poor';
  }
  if (label === 'CLS') {
    if (n <= 0.1) return 'good';
    if (n <= 0.25) return 'warning';
    return 'poor';
  }
  return 'good';
}

const METRIC_DEFS = [
  {
    key: 'LCP',
    plain: 'Load time',
    desc: 'How long visitors wait for the main content to appear. Target: under 2.5s.',
  },
  {
    key: 'INP',
    plain: 'Responsiveness',
    desc: 'How quickly the page reacts when visitors tap or click. Target: under 200ms.',
  },
  {
    key: 'CLS',
    plain: 'Layout stability',
    desc: 'How much the page jumps around as it loads. Target: under 0.1.',
  },
];

function buildLegend() {
  const legend = document.createElement('div');
  legend.className = 'rsc-legend';
  const intro = document.createElement('p');
  intro.className = 'rsc-legend-intro';
  intro.textContent = 'Each card measures three Core Web Vitals:';
  legend.append(intro);

  const list = document.createElement('div');
  list.className = 'rsc-legend-list';
  METRIC_DEFS.forEach(({ plain, desc }) => {
    const item = document.createElement('div');
    item.className = 'rsc-legend-item';
    const term = document.createElement('div');
    term.className = 'rsc-legend-term';
    term.textContent = plain;
    const body = document.createElement('div');
    body.className = 'rsc-legend-desc';
    body.textContent = desc;
    item.append(term, body);
    list.append(item);
  });
  legend.append(list);
  return legend;
}

export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const grid = document.createElement('div');
  grid.className = 'rsc-grid';

  rows.forEach((row) => {
    const cells = [...row.children];
    const pageName = cells[0]?.textContent.trim() || '';
    const pageUrl = cells[1]?.querySelector('a')?.href || cells[1]?.textContent.trim() || '';
    const score = cells[2]?.textContent.trim() || '';
    const lcp = cells[3]?.textContent.trim() || '';
    const fid = cells[4]?.textContent.trim() || '';
    const cls = cells[5]?.textContent.trim() || '';
    const summary = cells[6]?.textContent.trim() || '';
    const rec = cells[7]?.textContent.trim() || '';

    const gc = gradeClass(score);
    const scoreNum = Math.min(100, Math.max(0, parseInt(score, 10) || 0));

    const card = document.createElement('div');
    card.className = 'rsc-card';

    const header = document.createElement('div');
    header.className = 'rsc-card-header';

    const headerText = document.createElement('div');
    headerText.className = 'rsc-card-header-text';

    const name = document.createElement('h3');
    name.className = 'rsc-page-name';
    if (pageUrl) {
      const link = document.createElement('a');
      link.href = pageUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = pageName;
      link.title = pageName;
      name.append(link);
    } else {
      name.textContent = pageName;
    }

    headerText.append(name);

    if (pageUrl) {
      const urlLine = document.createElement('a');
      urlLine.className = 'rsc-page-url';
      urlLine.href = pageUrl;
      urlLine.target = '_blank';
      urlLine.rel = 'noopener noreferrer';
      urlLine.textContent = formatPageUrl(pageUrl);
      urlLine.title = pageUrl;
      headerText.append(urlLine);
    }

    const scoreWrap = createScoreMeterWrap(score, scoreNum, gc);
    header.append(headerText, scoreWrap);

    const metrics = document.createElement('div');
    metrics.className = 'rsc-metrics';
    const vals = { LCP: lcp, INP: fid, CLS: cls };
    METRIC_DEFS.forEach(({ key, plain }) => {
      const val = vals[key];
      const m = document.createElement('div');
      m.className = 'rsc-metric';
      const mv = document.createElement('span');
      mv.className = `rsc-metric-value rsc-mv-${metricStatus(key, val)}`;
      mv.textContent = val;
      const ml = document.createElement('span');
      ml.className = 'rsc-metric-label';
      ml.textContent = plain;
      m.append(mv, ml);
      metrics.append(m);
    });

    const footer = document.createElement('div');
    footer.className = 'rsc-card-footer';

    const sum = document.createElement('p');
    sum.className = 'rsc-summary';
    sum.textContent = summary;
    footer.append(sum);

    if (rec) {
      const tag = document.createElement('span');
      tag.className = 'rsc-recommendation';
      tag.textContent = rec;
      footer.append(tag);
    }

    if (pageUrl) {
      const verify = document.createElement('a');
      verify.className = 'rsc-verify-link';
      verify.href = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(pageUrl)}`;
      verify.target = '_blank';
      verify.rel = 'noopener noreferrer';
      verify.setAttribute('aria-label', `Verify ${pageName} score on Google PageSpeed Insights (opens in new tab)`);
      verify.innerHTML = '<svg class="rsc-verify-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11.25 3.75h5v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.25 3.75 9.375 10.625" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 11.25v4.375A1.875 1.875 0 0 1 13.125 17.5h-8.75A1.875 1.875 0 0 1 2.5 15.625v-8.75A1.875 1.875 0 0 1 4.375 5H8.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Verify on Google PageSpeed Insights</span>';
      footer.append(verify);
    }

    card.append(header, metrics, footer);

    grid.append(card);
  });

  el.textContent = '';
  el.append(grid, buildLegend());
}
