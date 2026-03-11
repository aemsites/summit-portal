export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const isSteps = el.classList.contains('steps');
  const isFeatures = el.classList.contains('features');
  const isCaps = el.classList.contains('capabilities');

  const grid = document.createElement('div');
  grid.className = 'rc-grid';

  rows.forEach((row) => {
    const cells = [...row.children];
    const card = document.createElement('div');
    card.className = 'rc-card';

    if (isSteps) {
      const num = cells[0]?.textContent.trim() || '';
      const title = cells[1]?.textContent.trim() || '';
      const desc = cells[2]?.textContent.trim() || '';
      card.innerHTML = `
        <div class="rc-step-num">${num}</div>
        <div class="rc-step-body">
          <h3 class="rc-title">${title}</h3>
          <p class="rc-desc">${desc}</p>
        </div>
      `;
    } else if (isCaps) {
      const icon = cells[0]?.textContent.trim() || '';
      const title = cells[1]?.textContent.trim() || '';
      const desc = cells[2]?.textContent.trim() || '';
      const impactVal = cells[3]?.textContent.trim() || '';
      const impactLabel = cells[4]?.textContent.trim() || '';
      card.innerHTML = `
        <div class="rc-header">
          <span class="rc-icon">${icon}</span>
          <h3 class="rc-title">${title}</h3>
        </div>
        <p class="rc-desc">${desc}</p>
        ${impactVal ? `<div class="rc-impact"><span class="rc-impact-value">${impactVal}</span> <span class="rc-impact-label">${impactLabel}</span></div>` : ''}
      `;
    } else if (isFeatures) {
      const icon = cells[0]?.textContent.trim() || '';
      const title = cells[1]?.textContent.trim() || '';
      const desc = cells[2]?.textContent.trim() || '';
      const features = cells[3]?.textContent.trim() || '';
      const impact = cells[4]?.textContent.trim() || '';
      const featureItems = features ? features.split(',').map((f) => `<li>${f.trim()}</li>`).join('') : '';
      card.innerHTML = `
        <div class="rc-header">
          <span class="rc-icon">${icon}</span>
          <h3 class="rc-title">${title}</h3>
        </div>
        <p class="rc-desc">${desc}</p>
        ${featureItems ? `<ul class="rc-features">${featureItems}</ul>` : ''}
        ${impact ? `<div class="rc-impact-badge">${impact}</div>` : ''}
      `;
    } else {
      // Default: icon | title | description | tag
      const icon = cells[0]?.textContent.trim() || '';
      const title = cells[1]?.textContent.trim() || '';
      const desc = cells[2]?.textContent.trim() || '';
      const tag = cells[3]?.textContent.trim() || '';
      card.innerHTML = `
        <div class="rc-header">
          <span class="rc-icon">${icon}</span>
          <h3 class="rc-title">${title}</h3>
        </div>
        <p class="rc-desc">${desc}</p>
        ${tag ? `<span class="rc-tag">${tag}</span>` : ''}
      `;
    }

    grid.append(card);
  });

  el.textContent = '';
  el.append(grid);
}
