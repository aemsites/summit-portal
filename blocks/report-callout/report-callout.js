export default function init(el) {
  const row = el.querySelector(':scope > div');
  if (!row) return;

  const cells = [...row.children];
  const icon = cells[0]?.textContent.trim() || '';
  // EDS wraps cell text in a <p>. The bar template below puts this content
  // inside its own <p class="rcl-text">, and a <p> cannot nest in a <p> — the
  // browser would split it, leaving rcl-text empty and the real text in a stray
  // sibling (which breaks the flex layout). Unwrap a sole wrapping <p> so the
  // text lands directly inside rcl-text as intended.
  const textCell = cells[1];
  const soleP = textCell && textCell.children.length === 1
    && textCell.firstElementChild.tagName === 'P';
  const text = (soleP ? textCell.firstElementChild.innerHTML : textCell?.innerHTML || '').trim();

  el.textContent = '';
  const bar = document.createElement('div');
  bar.className = 'rcl-bar';
  bar.innerHTML = `
    <span class="rcl-icon">${icon}</span>
    <p class="rcl-text">${text}</p>
  `;
  el.append(bar);
}
