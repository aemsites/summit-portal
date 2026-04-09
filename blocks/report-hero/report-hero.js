function buildInsightHero(el, rows) {
  // New authoring: single row, single cell
  // Children in order: heading(s), description p(s), standalone picture (→ right column),
  // then a p containing picture (favicon) + a (domain link) → brand badge
  const cell = rows[0]?.firstElementChild;
  if (!cell) return;

  const textCol = document.createElement('div');
  textCol.className = 'rh-insight-text';
  const imgCol = document.createElement('div');
  imgCol.className = 'rh-insight-image';

  [...cell.children].forEach((child) => {
    // Standalone <picture> → hero image on the right
    if (child.tagName === 'PICTURE') {
      imgCol.append(child);
      return;
    }

    if (child.tagName === 'P') {
      const pic = child.querySelector('picture');
      const anchor = child.querySelector('a');

      // <p> containing only a picture (EDS may wrap standalone pictures in <p>) → right image
      if (pic && !anchor) {
        imgCol.append(child);
        return;
      }

      // <p> with picture (favicon) + anchor → brand badge button
      if (pic && anchor) {
        const faviconImg = pic.querySelector('img');
        if (faviconImg) {
          faviconImg.alt = '';
          faviconImg.setAttribute('aria-hidden', 'true');
          faviconImg.width = 16;
          faviconImg.height = 16;
          anchor.prepend(faviconImg); // move img before link text
        }
        anchor.className = 'rh-insight-badge';
        textCol.append(anchor);
        return;
      }
    }

    // Everything else (h1, description paragraphs) → text column
    textCol.append(child);
  });

  rows[0].replaceWith(textCol, imgCol);
}

export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const isDashboard = el.classList.contains('dashboard');
  const isTransition = el.classList.contains('transition');
  const isInsight = el.classList.contains('insight');

  if (isInsight) {
    buildInsightHero(el, rows);
    return;
  }

  if (isDashboard) {
    const [headerRow, ...metricRows] = rows;
    const cells = [...headerRow.children];

    // Build gradient header
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

    // Build metrics strip
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

      el.append(strip);
    }
    return;
  }

  if (isTransition) {
    // Transition: badge | title | subtitle | metric rows...
    const [badgeRow, titleRow, subtitleRow, ...metricRows] = rows;

    badgeRow.classList.add('rh-badge');
    titleRow.classList.add('rh-title');
    subtitleRow.classList.add('rh-subtitle');

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
      el.append(metricsWrap);
    }
  } else {
    // Cover: label | company | title | subtitle | elements
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
}
