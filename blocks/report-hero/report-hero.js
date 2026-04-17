function typeText(el) {
  const full = el.textContent;
  el.textContent = '';
  el.classList.add('rh-typing');
  let i = 0;
  function tick() {
    if (i < full.length) {
      el.textContent += full[i];
      i += 1;
      const delay = 70 + Math.random() * 120;
      setTimeout(tick, delay);
    } else {
      el.classList.remove('rh-typing');
    }
  }
  tick();
}

function buildInsightHero(block, rows) {
  const row = rows[0];
  if (!row) return;

  const [textCell, imgCell] = [...row.children];

  const textCol = document.createElement('div');
  textCol.className = 'rh-insight-text';
  const imgCol = document.createElement('div');
  imgCol.className = 'rh-insight-image';

  // Decorative SVG background image (top-right of the hero block)
  const bgImg = document.createElement('img');
  bgImg.src = '/img/icons/hero-bg.svg';
  bgImg.alt = '';
  bgImg.setAttribute('aria-hidden', 'true');
  bgImg.className = 'rh-insight-bg-svg';
  block.prepend(bgImg);

  // Process text cell: transform favicon+link p into brand badge
  if (textCell) {
    [...textCell.children].forEach((child) => {
      if (child.tagName === 'P') {
        const pic = child.querySelector('picture');
        const anchor = child.querySelector('a');
        if (pic && anchor) {
          const faviconImg = pic.querySelector('img');
          if (faviconImg) {
            faviconImg.alt = '';
            faviconImg.setAttribute('aria-hidden', 'true');
            faviconImg.width = 16;
            faviconImg.height = 16;
            anchor.prepend(faviconImg);
          }
          anchor.className = 'rh-insight-badge';
          textCol.append(anchor);
          return;
        }
      }
      // h1, description paragraphs → text column
      textCol.append(child);
    });
  }

  // Image cell → image column
  if (imgCell) {
    [...imgCell.childNodes].forEach((n) => imgCol.append(n));
  }

  row.replaceWith(textCol, imgCol);
}

function buildDashboardHero(block, rows) {
  const [headerRow, ...metricRows] = rows;
  const cells = [...headerRow.children];

  const header = document.createElement('div');
  header.className = 'rh-header';

  const textWrap = document.createElement('div');
  textWrap.className = 'rh-header-text';
  [...cells[0].childNodes].forEach((n) => textWrap.append(n));
  textWrap.querySelectorAll('a').forEach((a) => a.classList.add('rh-cta'));
  header.append(textWrap);

  if (cells[1]) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'rh-header-image';
    [...cells[1].childNodes].forEach((n) => imgWrap.append(n));
    header.append(imgWrap);
  }

  headerRow.replaceWith(header);

  if (metricRows.length) {
    const strip = document.createElement('div');
    strip.className = 'rh-metrics-strip';

    metricRows.forEach((row) => {
      const [valueCell, infoCell] = [...row.children];
      const card = document.createElement('div');
      card.className = 'rh-metric-card';

      const valueEl = document.createElement('div');
      valueEl.className = 'rh-metric-value';
      valueEl.textContent = valueCell?.textContent.trim() || '';

      const paras = infoCell ? [...infoCell.querySelectorAll('p')] : [];

      const labelEl = document.createElement('div');
      labelEl.className = 'rh-metric-label';
      labelEl.textContent = paras[0]?.textContent.trim() || '';

      const badgeText = paras[1]?.textContent.trim() || '';
      const badgeEl = document.createElement('span');
      badgeEl.className = 'rh-metric-badge';
      badgeEl.textContent = badgeText;
      const bl = badgeText.toLowerCase();
      // eslint-disable-next-line no-nested-ternary
      badgeEl.dataset.status = (bl.includes('poor') || bl.includes('critical')) ? 'bad'
        : (bl.includes('under') || bl.includes('warn')) ? 'warn' : 'good';

      const descEl = document.createElement('div');
      descEl.className = 'rh-metric-desc';
      descEl.textContent = paras[2]?.textContent.trim() || '';

      card.append(valueEl, labelEl, badgeEl, descEl);
      strip.append(card);
      row.remove();
    });

    block.append(strip);
  }
}

function buildTransitionHero(block, rows) {
  const [badgeRow, titleRow, subtitleRow, ...metricRows] = rows;

  if (badgeRow) badgeRow.classList.add('rh-badge');
  if (titleRow) titleRow.classList.add('rh-title');
  if (subtitleRow) subtitleRow.classList.add('rh-subtitle');

  if (metricRows.length) {
    const metricsWrap = document.createElement('div');
    metricsWrap.className = 'rh-metrics';
    metricRows.forEach((row) => {
      const cells = [...row.children];
      row.classList.add('rh-metric');
      if (cells[0]) cells[0].classList.add('rh-metric-value');
      if (cells[1]) cells[1].classList.add('rh-metric-label');
    });
    metricsWrap.append(...metricRows);
    block.append(metricsWrap);
  }
}

function buildCoverHero(block, rows) {
  const [labelRow, companyRow, titleRow, subtitleRow, elementsRow] = rows;

  if (labelRow) labelRow.classList.add('rh-label');
  if (companyRow) companyRow.classList.add('rh-company');
  if (titleRow) {
    titleRow.classList.add('rh-title');
    const accent = document.createElement('div');
    accent.className = 'rh-accent';
    titleRow.append(accent);
  }
  if (subtitleRow) subtitleRow.classList.add('rh-subtitle');
  if (elementsRow) {
    elementsRow.classList.add('rh-elements');
    const cells = [...elementsRow.children];
    cells.forEach((cell) => cell.classList.add('rh-element-card'));
  }
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  const isInsight = block.classList.contains('insight');
  const isDashboard = block.classList.contains('dashboard');
  const isTransition = block.classList.contains('transition');

  if (isInsight) {
    buildInsightHero(block, rows);
    const heading = block.querySelector('.rh-insight-text h1, .rh-insight-text h2');
    if (heading) typeText(heading);
  } else if (isDashboard) {
    buildDashboardHero(block, rows);
  } else if (isTransition) {
    buildTransitionHero(block, rows);
  } else {
    buildCoverHero(block, rows);
  }
}
