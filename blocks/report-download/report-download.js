/**
 * Report Download block
 *
 * Authoring structure (rows):
 *   Row 1: Heading text  |  Card title
 *   Row 2: Description   |  (empty)
 *   Row 3: CTA link      |  (empty)
 *   Row 4: Updated date  |  Page count
 */
export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const [headingRow, descRow, ctaRow, metaRow] = rows;

  const [headingCell, cardTitleCell] = headingRow ? [...headingRow.children] : [];
  const descCell = descRow?.children[0];
  const ctaCell = ctaRow?.children[0];
  const [dateCell, pagesCell] = metaRow ? [...metaRow.children] : [];

  // Left content column
  const left = document.createElement('div');
  left.className = 'rd-left';

  const heading = document.createElement('h2');
  heading.className = 'rd-heading';
  heading.textContent = headingCell?.textContent.trim() || '';
  left.append(heading);

  if (descCell) {
    const desc = document.createElement('p');
    desc.className = 'rd-desc';
    desc.innerHTML = descCell.innerHTML;
    left.append(desc);
  }

  if (ctaCell) {
    const link = ctaCell.querySelector('a');
    if (link) {
      link.className = 'rd-cta';
      left.append(link);
    }
  }

  // Metadata row (date + pages)
  const meta = document.createElement('div');
  meta.className = 'rd-meta';
  if (dateCell?.textContent.trim()) {
    meta.innerHTML += `<span class="rd-meta-item"><span class="rd-meta-icon">🕐</span>${dateCell.textContent.trim()}</span>`;
  }
  if (pagesCell?.textContent.trim()) {
    meta.innerHTML += `<span class="rd-meta-item"><span class="rd-meta-icon">📄</span>${pagesCell.textContent.trim()}</span>`;
  }
  if (meta.innerHTML) left.append(meta);

  // Right PDF card
  const right = document.createElement('div');
  right.className = 'rd-right';

  const cardTitle = cardTitleCell?.textContent.trim() || '';
  const card = document.createElement('div');
  card.className = 'rd-pdf-card';
  card.innerHTML = `
    <div class="rd-pdf-card-inner">
      <h3 class="rd-pdf-title">${cardTitle}</h3>
      <div class="rd-pdf-footer">
        <span class="rd-pdf-badge">Full PDF report</span>
      </div>
    </div>`;
  right.append(card);

  el.textContent = '';
  el.append(left, right);
}
