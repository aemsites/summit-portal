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

  const card = document.createElement('div');
  card.className = 'rd-pdf-card';

  const cardInner = document.createElement('div');
  cardInner.className = 'rd-pdf-card-inner';

  const titleEl = document.createElement('h3');
  titleEl.className = 'rd-pdf-title';
  titleEl.textContent = cardTitle;
  cardInner.append(titleEl);

  if (metaItems.length) {
    const meta = document.createElement('div');
    meta.className = 'rd-pdf-meta';
    metaItems.forEach((item) => {
      const span = document.createElement('span');
      span.className = 'rd-pdf-meta-item';
      span.textContent = item;
      meta.append(span);
    });
    cardInner.append(meta);
  }

  const footer = document.createElement('div');
  footer.className = 'rd-pdf-footer';
  const downloadBtn = document.createElement('a');
  downloadBtn.className = 'rd-pdf-btn';
  downloadBtn.href = downloadHref;
  downloadBtn.textContent = 'Full PDF report';
  footer.append(downloadBtn);
  cardInner.append(footer);

  card.append(cardInner);
  right.append(card);

  el.textContent = '';
  el.append(left, right);
}
