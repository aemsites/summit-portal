function createGauge(score, maxScore, loadTime) {
  const pct = score / maxScore;
  const startAngle = -225;
  const endAngle = 45;
  const range = endAngle - startAngle;
  const needleAngle = startAngle + range * pct;

  const r = 90;
  const cx = 120;
  const cy = 120;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const arcPoint = (angle) => ({
    x: cx + r * Math.cos(toRad(angle)),
    y: cy + r * Math.sin(toRad(angle)),
  });

  const trackStart = arcPoint(startAngle);
  const trackEnd = arcPoint(endAngle);
  const needleTip = arcPoint(needleAngle);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 240 180');
  svg.setAttribute('class', 'gauge');

  svg.innerHTML = `
    <defs>
      <linearGradient id="gauge-track" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#e60000"/>
        <stop offset="50%" stop-color="#f5a623"/>
        <stop offset="100%" stop-color="#7ed321"/>
      </linearGradient>
    </defs>
    <path d="M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}"
      fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="14" stroke-linecap="round"/>
    <path d="M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}"
      fill="none" stroke="url(#gauge-track)" stroke-width="14" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${needleTip.x}" y2="${needleTip.y}"
      stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="#fff"/>
  `;

  const wrapper = document.createElement('div');
  wrapper.className = 'gauge-wrapper';
  wrapper.append(svg);

  const scoreEl = document.createElement('div');
  scoreEl.className = 'gauge-score';
  scoreEl.innerHTML = `<span class="gauge-value">${score}</span><span class="gauge-max">/ ${maxScore}</span>`;
  wrapper.append(scoreEl);

  if (loadTime) {
    const timeEl = document.createElement('div');
    timeEl.className = 'gauge-time';
    timeEl.innerHTML = `<span class="gauge-time-value">${loadTime}</span><span class="gauge-time-label">Load Time</span>`;
    wrapper.append(timeEl);
  }

  return wrapper;
}

function parseScoreFromHeading(text) {
  const match = text.match(/\[(\d+)\s*\/\s*(\d+)\]/);
  if (match) return { score: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  return null;
}

export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];

  // Extract background picture from wherever it is
  const pic = el.querySelector('picture');
  if (pic) {
    const picP = pic.closest('p') || pic.parentElement;
    const bg = document.createElement('div');
    bg.className = 'dashboard-hero-background';
    bg.append(pic);
    if (picP && picP.parentElement) picP.remove();
    el.prepend(bg);
  }

  // Build foreground from remaining content
  const fg = document.createElement('div');
  fg.className = 'dashboard-hero-foreground';

  // Separate cells: first row cells go to left, second row cells to right (gauge data)
  const leftContent = [];
  let gaugeTitle = '';
  let loadTime = '';

  rows.forEach((row) => {
    const cells = [...row.querySelectorAll(':scope > div')];
    if (cells.length >= 2) {
      // Two-column row: cell 1 = left content, cell 2 = gauge data
      leftContent.push(...cells[0].childNodes);

      // Parse gauge data from cell 2
      const title = cells[1].querySelector('h2, h3, h4, h5, h6');
      if (title) gaugeTitle = title.textContent;
      const paragraphs = [...cells[1].querySelectorAll('p')];
      if (paragraphs.length) loadTime = paragraphs[0].textContent.trim();
    } else if (cells.length === 1) {
      leftContent.push(...cells[0].childNodes);
    }
    row.remove();
  });

  // Left column
  const left = document.createElement('div');
  left.className = 'dashboard-hero-content';
  leftContent.forEach((node) => left.append(node));

  // Find the score heading and split into greeting + callout
  const scoreHeading = left.querySelector('h4, h5, h6');
  let score = 30;
  let maxScore = 100;

  if (scoreHeading) {
    const parsed = parseScoreFromHeading(scoreHeading.textContent);
    if (parsed) {
      score = parsed.score;
      maxScore = parsed.max;
    }

    // Wrap scoreHeading and everything after it into a callout
    const callout = document.createElement('div');
    callout.className = 'dashboard-hero-callout';
    let sibling = scoreHeading;
    while (sibling) {
      const next = sibling.nextElementSibling;
      callout.append(sibling);
      sibling = next;
    }
    left.append(callout);
  }

  fg.append(left);

  // Right column: gauge
  const right = document.createElement('div');
  right.className = 'dashboard-hero-gauge';

  if (gaugeTitle) {
    const titleEl = document.createElement('div');
    titleEl.className = 'gauge-title';
    titleEl.textContent = gaugeTitle;
    right.append(titleEl);
  }
  right.append(createGauge(score, maxScore, loadTime));

  fg.append(right);
  el.append(fg);
}
