export default function init(el) {
  const rows = el.querySelectorAll(':scope > div');
  const cards = [];

  rows.forEach((row) => {
    const cols = row.querySelectorAll(':scope > div');
    cols.forEach((col) => {
      const card = document.createElement('a');
      card.className = 'file-card-item';

      // Find image - could be in <picture> or standalone <img>
      const pic = col.querySelector('picture') || col.querySelector('img');
      if (pic) {
        const thumb = document.createElement('div');
        thumb.className = 'file-card-thumbnail';
        thumb.append(pic.tagName === 'IMG' ? pic : pic);
        card.append(thumb);
      }

      // Find the link paragraph (file name) and plain text paragraph (file type)
      const paras = col.querySelectorAll('p');
      let namePara = null;
      let typePara = null;

      [...paras].forEach((p) => {
        if (p.querySelector('picture') || p.querySelector('img')) return;
        const link = p.querySelector('a');
        if (link) {
          namePara = p;
        } else if (p.textContent.trim()) {
          typePara = p;
        }
      });

      // File name from link
      if (namePara) {
        const link = namePara.querySelector('a');
        const name = document.createElement('div');
        name.className = 'file-card-name';
        name.textContent = link ? link.textContent : namePara.textContent;
        if (link) card.href = link.href;
        card.append(name);
      }

      // File type
      if (typePara) {
        const type = document.createElement('div');
        type.className = 'file-card-type';
        const typeText = typePara.textContent.trim();
        const icon = document.createElement('span');
        icon.className = `file-card-icon file-card-icon-${typeText.toLowerCase().replace(/\s+/g, '-')}`;
        type.append(icon);
        type.append(document.createTextNode(typeText));
        card.append(type);
      }

      cards.push(card);
    });
  });

  el.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'file-card-grid';
  grid.style.setProperty('--file-card-count', cards.length);
  cards.forEach((card) => grid.append(card));
  el.append(grid);
}
