export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];

  // Block header row ("For You") becomes the CSS class in EDS — not a DOM row.
  // All child divs are product cards.
  const titleText = 'For You';

  // Build header
  const header = document.createElement('div');
  header.className = 'fy-header';
  const title = document.createElement('h3');
  title.className = 'fy-title';
  title.textContent = titleText;
  header.append(title);

  // Build card grid
  const grid = document.createElement('div');
  grid.className = 'fy-grid';

  rows.forEach((row) => {
    const cells = [...row.querySelectorAll(':scope > div')];
    const card = document.createElement('div');
    card.className = 'fy-card';

    // Cell 0: icon/image
    if (cells[0]) {
      const pic = cells[0].querySelector('picture');
      if (pic) {
        const iconWrap = document.createElement('div');
        iconWrap.className = 'fy-card-icon';
        iconWrap.append(pic);
        card.append(iconWrap);
      }
    }

    // Cell 1: content (title + description + CTA)
    if (cells[1]) {
      const content = document.createElement('div');
      content.className = 'fy-card-content';

      const heading = cells[1].querySelector('h2, h3, h4, h5, h6, strong');
      if (heading) {
        const cardTitle = document.createElement('h4');
        cardTitle.className = 'fy-card-title';
        cardTitle.textContent = heading.textContent;
        content.append(cardTitle);
      }

      // Description: all paragraphs except the one with a CTA link
      const paras = [...cells[1].querySelectorAll('p')];
      paras.forEach((p) => {
        const link = p.querySelector('a');
        if (link && link.textContent.trim()) {
          // CTA link
          const cta = document.createElement('a');
          cta.className = 'fy-card-cta';
          cta.href = link.href;
          cta.textContent = link.textContent;
          content.append(cta);
        } else if (p.textContent.trim() && !p.querySelector('strong, h1, h2, h3, h4, h5, h6')) {
          const desc = document.createElement('p');
          desc.className = 'fy-card-desc';
          desc.textContent = p.textContent;
          content.append(desc);
        }
      });

      card.append(content);
    }

    grid.append(card);
    row.remove();
  });

  el.textContent = '';
  el.append(header, grid);
}
