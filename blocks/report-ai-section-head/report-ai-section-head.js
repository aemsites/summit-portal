/**
 * Section title strip above AI report blocks (visibility, carousel, etc.).
 * Same chrome as report-carousel persona tab bar — title only, no actions.
 * @param {Element} block
 */
export default function decorate(block) {
  const row = block.querySelector(':scope > div');
  const cells = row ? [...row.children] : [];
  const col = cells[1] ?? cells[0];

  block.textContent = '';
  const strip = document.createElement('div');
  strip.className = 'rai-section-head-strip';

  const fromHeading = col?.querySelector('h2, h3, h4');
  if (fromHeading) {
    const h = fromHeading.cloneNode(true);
    h.className = 'rai-section-head-title';
    strip.append(h);
  } else {
    const text = (col?.textContent || '').trim();
    if (!text) return;
    const h = document.createElement('h2');
    h.className = 'rai-section-head-title';
    h.textContent = text;
    strip.append(h);
  }

  block.append(strip);
}
