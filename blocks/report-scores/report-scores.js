import { getConfig, loadStyle } from '../../scripts/ak.js';
import {
  attachReportScoresToPerformanceShell,
  createPerformanceInsightsShell,
} from '../report-ai-visibility/report-ai-visibility.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function gradeClass(score) {
  const n = parseInt(score, 10);
  if (n >= 90) return 'good';
  if (n >= 50) return 'warning';
  return 'poor';
}

const VERDICT_LABEL = {
  good: 'Good',
  warning: 'Needs work',
  poor: 'Poor',
};

function formatPageUrl(href) {
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '/' : u.pathname);
  } catch {
    return href;
  }
}

/**
 * Ring-style score meter with numeric label inside (e.g. "42" / "of 100").
 * @param {string} scoreLabel
 * @param {number} scoreNum 0–100
 * @param {'poor'|'warning'|'good'} gradeKey
 * @returns {HTMLDivElement}
 */
function createScoreMeterWrap(scoreLabel, scoreNum, gradeKey) {
  const vb = 100;
  const c = vb / 2;
  const strokeW = 8;
  const r = c - strokeW - 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, scoreNum / 100));
  const dash = pct * circumference;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'rsc-ring-svg');
  svg.setAttribute('viewBox', `0 0 ${vb} ${vb}`);
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');

  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('class', 'rsc-ring-track');
  track.setAttribute('cx', String(c));
  track.setAttribute('cy', String(c));
  track.setAttribute('r', String(r));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke-width', String(strokeW));

  const arc = document.createElementNS(SVG_NS, 'circle');
  arc.setAttribute('class', 'rsc-ring-arc');
  arc.setAttribute('cx', String(c));
  arc.setAttribute('cy', String(c));
  arc.setAttribute('r', String(r));
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke-width', String(strokeW));
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('transform', `rotate(-90 ${c} ${c})`);
  arc.setAttribute('stroke-dasharray', `${dash} ${circumference}`);
  if (scoreNum <= 0) arc.setAttribute('opacity', '0');

  svg.append(track, arc);

  const wrap = document.createElement('div');
  wrap.className = `rsc-ring rsc-${gradeKey}`;
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `Score ${scoreLabel} out of 100`);

  const label = document.createElement('div');
  label.className = 'rsc-ring-label';
  label.innerHTML = `<span class="rsc-ring-num">${scoreLabel}</span><span class="rsc-ring-out-of">of 100</span>`;

  wrap.append(svg, label);
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
    target: 'target ≤ 2.5s',
    desc: 'How long visitors wait for the main content to appear.',
    targetDesc: 'Target ≤ 2.5s',
  },
  {
    key: 'INP',
    plain: 'Responsiveness',
    target: 'target ≤ 200ms',
    desc: 'How quickly the page reacts when visitors tap or click.',
    targetDesc: 'Target ≤ 200ms',
  },
  {
    key: 'CLS',
    plain: 'Layout stability',
    target: 'target ≤ 0.1',
    desc: 'How much the page jumps around as it loads.',
    targetDesc: 'Target ≤ 0.1',
  },
];

const SCORE_BANDS = [
  { range: '90–100', label: 'Good', grade: 'good' },
  { range: '50–89', label: 'Needs work', grade: 'warning' },
  { range: '0–49', label: 'Poor', grade: 'poor' },
];

function buildSummaryPills(counts) {
  const wrap = document.createElement('div');
  wrap.className = 'rsc-summary-pills';
  SCORE_BANDS.forEach(({ label, grade }) => {
    const n = counts[grade] || 0;
    const pill = document.createElement('span');
    pill.className = `rsc-summary-pill rsc-${grade}`;
    pill.innerHTML = `<span class="rsc-summary-dot" aria-hidden="true"></span>${n} ${label.toLowerCase()}`;
    wrap.append(pill);
  });
  return wrap;
}

function buildLightbulbIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.3 1 2.1V17h6v-.2c0-.8.3-1.6 1-2.1A7 7 0 0 0 12 2Z');
  svg.append(p);
  return svg;
}

function buildVerifyIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'rsc-verify-icon');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M11.25 3.75h5v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.25 3.75 9.375 10.625" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 11.25v4.375A1.875 1.875 0 0 1 13.125 17.5h-8.75A1.875 1.875 0 0 1 2.5 15.625v-8.75A1.875 1.875 0 0 1 4.375 5H8.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

function buildHowTo() {
  const details = document.createElement('details');
  details.className = 'rsc-howto';

  const summary = document.createElement('summary');
  summary.textContent = 'How we measure performance';
  details.append(summary);

  const content = document.createElement('div');
  content.className = 'rsc-howto-content';

  const metricsTitle = document.createElement('p');
  metricsTitle.className = 'rsc-howto-section-title';
  metricsTitle.textContent = 'The three things we check';

  const metricsGrid = document.createElement('div');
  metricsGrid.className = 'rsc-howto-metrics';
  METRIC_DEFS.forEach(({ plain, desc, targetDesc }) => {
    const item = document.createElement('div');
    item.className = 'rsc-howto-metric';
    item.innerHTML = `
      <div class="rsc-howto-metric-name">${plain}</div>
      <div class="rsc-howto-metric-target">${targetDesc}</div>
      <div class="rsc-howto-metric-desc">${desc}</div>
    `;
    metricsGrid.append(item);
  });

  const bandsTitle = document.createElement('p');
  bandsTitle.className = 'rsc-howto-section-title';
  bandsTitle.textContent = 'How we score each page';

  const bandsGrid = document.createElement('div');
  bandsGrid.className = 'rsc-howto-bands';
  SCORE_BANDS.forEach(({ range, label, grade }) => {
    const band = document.createElement('div');
    band.className = `rsc-howto-band rsc-${grade}`;
    band.innerHTML = `
      <span class="rsc-howto-swatch" aria-hidden="true"></span>
      <div>
        <div class="rsc-howto-band-name">${label}</div>
        <div class="rsc-howto-band-range">${range}</div>
      </div>
    `;
    bandsGrid.append(band);
  });

  const note = document.createElement('p');
  note.className = 'rsc-howto-note';
  note.textContent = 'Scores are based on synthetic lab measurements — a standardized mid-tier mobile device on a throttled 4G connection, first-visit conditions. Real-world performance for returning visitors on faster networks will typically be better.';

  const metricsSection = document.createElement('div');
  metricsSection.append(metricsTitle, metricsGrid);
  const bandsSection = document.createElement('div');
  bandsSection.append(bandsTitle, bandsGrid);

  content.append(metricsSection, bandsSection, note);
  details.append(content);
  return details;
}

function buildCard(data) {
  const {
    pageName, pageUrl, score, scoreNum, gradeKey, lcp, fid, cls, summary, rec,
  } = data;

  const card = document.createElement('article');
  card.className = `rsc-card rsc-${gradeKey}`;

  // Hero: ring + verdict pill
  const hero = document.createElement('div');
  hero.className = 'rsc-hero';
  hero.append(createScoreMeterWrap(score, scoreNum, gradeKey));
  const verdict = document.createElement('span');
  verdict.className = 'rsc-verdict';
  verdict.textContent = VERDICT_LABEL[gradeKey];
  hero.append(verdict);

  // Body
  const body = document.createElement('div');
  body.className = 'rsc-body';

  // Title (use div — global styles target body > header for site chrome only)
  const title = document.createElement('div');
  title.className = 'rsc-title';
  const name = document.createElement('h3');
  name.className = 'rsc-page-name';
  if (pageUrl) {
    const a = document.createElement('a');
    a.href = pageUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = pageName;
    a.title = pageName;
    name.append(a);
  } else {
    name.textContent = pageName;
  }
  title.append(name);
  if (pageUrl) {
    const urlLine = document.createElement('a');
    urlLine.className = 'rsc-page-url';
    urlLine.href = pageUrl;
    urlLine.target = '_blank';
    urlLine.rel = 'noopener noreferrer';
    urlLine.textContent = formatPageUrl(pageUrl);
    urlLine.title = pageUrl;
    title.append(urlLine);
  }
  body.append(title);

  if (summary) {
    const p = document.createElement('p');
    p.className = 'rsc-summary';
    p.textContent = summary;
    body.append(p);
  }

  // Metrics list
  const metrics = document.createElement('div');
  metrics.className = 'rsc-metrics';
  const vals = { LCP: lcp, INP: fid, CLS: cls };
  METRIC_DEFS.forEach(({ key, plain, target }) => {
    const val = vals[key];
    const status = metricStatus(key, val);
    const row = document.createElement('div');
    row.className = `rsc-metric rsc-${status}`;
    row.innerHTML = `
      <span class="rsc-metric-dot" aria-hidden="true"></span>
      <span class="rsc-metric-label">${plain}</span>
      <span class="rsc-metric-value">${val || '—'}</span>
      <span class="rsc-metric-target">${target}</span>
    `;
    metrics.append(row);
  });
  body.append(metrics);

  if (rec) {
    const sug = document.createElement('div');
    sug.className = 'rsc-suggestion';
    const icon = document.createElement('span');
    icon.className = 'rsc-suggestion-icon';
    icon.append(buildLightbulbIcon());
    const sb = document.createElement('div');
    sb.className = 'rsc-suggestion-body';
    sb.innerHTML = `
      <span class="rsc-suggestion-label">How to improve</span>
      <span class="rsc-suggestion-text"></span>
    `;
    sb.querySelector('.rsc-suggestion-text').textContent = rec;
    sug.append(icon, sb);
    body.append(sug);
  }

  if (pageUrl) {
    const verify = document.createElement('a');
    verify.className = 'rsc-verify-link';
    verify.href = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(pageUrl)}`;
    verify.target = '_blank';
    verify.rel = 'noopener noreferrer';
    verify.setAttribute('aria-label', `Verify ${pageName} score on Google PageSpeed Insights (opens in new tab)`);
    verify.append(buildVerifyIcon());
    const span = document.createElement('span');
    span.textContent = 'Verify on Google PageSpeed Insights';
    verify.append(span);
    body.append(verify);
  }

  card.append(hero, body);
  return card;
}

/**
 * When the section has no authored report-ai-visibility block, that decorator
 * never creates the Performance insights shell — mirror it here so layout matches.
 * @param {Element} scoresEl
 */
async function ensureStandalonePerformanceShell(scoresEl) {
  if (scoresEl.closest('.report-ai-visibility.rav-empty-shell')) return;
  const section = scoresEl.closest('.section');
  const hasAiVisibility = Boolean(
    section?.querySelector(':scope .report-ai-visibility:not(.rav-empty-shell)'),
  );
  if (hasAiVisibility) return;

  await loadStyle(`${getConfig().codeBase}/blocks/report-ai-visibility/report-ai-visibility.css`);
  const shell = createPerformanceInsightsShell();
  scoresEl.before(shell);
  attachReportScoresToPerformanceShell(scoresEl, shell);
}

export default async function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const grid = document.createElement('div');
  grid.className = 'rsc-grid';
  const counts = { good: 0, warning: 0, poor: 0 };

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

    const gradeKey = gradeClass(score);
    const scoreNum = Math.min(100, Math.max(0, parseInt(score, 10) || 0));
    counts[gradeKey] = (counts[gradeKey] || 0) + 1;

    grid.append(buildCard({
      pageName, pageUrl, score, scoreNum, gradeKey, lcp, fid, cls, summary, rec,
    }));
  });

  el.textContent = '';
  const summaryPills = buildSummaryPills(counts);
  el.append(summaryPills, grid, buildHowTo());

  await ensureStandalonePerformanceShell(el);

  const perfShell = el.closest('.report-ai-visibility.rav-empty-shell');
  const sectionHead = perfShell?.querySelector(':scope .rav-container > .rav-section-head');
  if (sectionHead && summaryPills.parentElement === el) {
    sectionHead.append(summaryPills);
  }
}
