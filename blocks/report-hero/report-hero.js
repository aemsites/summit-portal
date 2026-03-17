export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const isTransition = el.classList.contains('transition');

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
