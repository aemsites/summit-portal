/**
 * Adobe × Semrush co-brand lockup. No authored content needed — renders the
 * two logos with a divider. Variant `footer` centers it. The Semrush mark is a
 * dark PNG; CSS inverts it in dark mode.
 */
export default function decorate(block) {
  const isFooter = block.classList.contains('footer');
  block.textContent = '';
  const row = document.createElement('div');
  row.className = 'cb-row';

  const adobe = document.createElement('img');
  adobe.className = 'cb-adobe';
  adobe.src = '/img/cannes/adobe-logo.png';
  adobe.alt = 'Adobe';

  const divider = document.createElement('span');
  divider.className = 'cb-divider';
  divider.setAttribute('aria-hidden', 'true');

  const semrush = document.createElement('img');
  semrush.className = 'cb-semrush';
  semrush.src = '/img/cannes/semrush-logo.png';
  semrush.alt = 'Semrush — An Adobe Company';

  row.append(adobe, divider, semrush);
  if (isFooter) row.classList.add('cb-center');
  block.append(row);
}
