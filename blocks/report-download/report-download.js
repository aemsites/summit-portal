/**
 * Report Download block
 *
 * Authoring structure (single row, two cells):
 *   Cell 1: Bold heading paragraph | description paragraph(s)
 *   Cell 2: Link (report title + download href) | metadata paragraphs (date, pages, …)
 */
export default function init(el) {
  const row = el.querySelector(':scope > div');
  if (!row) return;

  const [leftCell, rightCell] = [...row.children];

  // --- Left column: heading + description ---
  const left = document.createElement('div');
  left.className = 'rd-left';

  if (leftCell) {
    [...leftCell.children].forEach((child) => {
      if (child.tagName === 'P') {
        const strong = child.querySelector('strong');
        if (strong && child.textContent.trim() === strong.textContent.trim()) {
          // Bold-only paragraph → section heading
          const heading = document.createElement('h2');
          heading.className = 'rd-heading';
          heading.textContent = strong.textContent.trim();
          left.append(heading);
          return;
        }
        const desc = document.createElement('p');
        desc.className = 'rd-desc';
        desc.innerHTML = child.innerHTML;
        left.append(desc);
        return;
      }
      left.append(child);
    });
  }

  // --- Right column: PDF card ---
  const right = document.createElement('div');
  right.className = 'rd-right';

  let downloadHref = '#';
  let cardTitle = '';
  const metaItems = [];

  if (rightCell) {
    rightCell.querySelectorAll(':scope p').forEach((p) => {
      const anchor = p.querySelector('a');
      if (anchor && !cardTitle) {
        // First link → card title + download URL
        cardTitle = anchor.textContent.trim();
        downloadHref = anchor.href || '#';
      } else {
        const text = p.textContent.trim();
        if (text) metaItems.push(text);
      }
    });
  }

  // --- CTA button + metadata row below description ---
  const ctaRow = document.createElement('div');
  ctaRow.className = 'rd-cta-row';

  const ctaBtn = document.createElement('a');
  ctaBtn.className = 'rd-cta-btn';
  ctaBtn.href = downloadHref;
  ctaBtn.innerHTML = '\u2193 Download full report';
  ctaRow.append(ctaBtn);

  if (metaItems.length) {
    const metaRow = document.createElement('div');
    metaRow.className = 'rd-meta-row';
    metaItems.forEach((item) => {
      const span = document.createElement('span');
      span.className = 'rd-meta-item';
      span.textContent = item;
      metaRow.append(span);
    });
    ctaRow.append(metaRow);
  }

  left.append(ctaRow);

  // --- Right column: PDF card ---
  const card = document.createElement('div');
  card.className = 'rd-pdf-card';

  const titleEl = document.createElement('h3');
  titleEl.className = 'rd-pdf-title';
  titleEl.textContent = cardTitle;
  card.append(titleEl);

  const tagEl = document.createElement('a');
  tagEl.className = 'rd-pdf-tag';
  tagEl.href = downloadHref;
  tagEl.innerHTML = '\u2193 Full PDF report';
  card.append(tagEl);

  right.append(card);

  el.textContent = '';
  el.append(left, right);
}
