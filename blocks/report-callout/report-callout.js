export default function init(el) {
  const row = el.querySelector(':scope > div');
  if (!row) return;

  const cells = [...row.children];
  const icon = cells[0]?.textContent.trim() || '';
  const text = cells[1]?.innerHTML.trim() || '';

  el.textContent = '';
  const bar = document.createElement('div');
  bar.className = 'rcl-bar';
  bar.innerHTML = `
    <span class="rcl-icon">${icon}</span>
    <p class="rcl-text">${text}</p>
  `;
  el.append(bar);
}
