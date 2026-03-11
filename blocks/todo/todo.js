export default function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];

  // First row = header (title text), remaining rows = task items
  const headerRow = rows.shift();
  const title = headerRow?.textContent.trim() || 'To-Do';
  headerRow?.remove();

  // Build header
  const header = document.createElement('div');
  header.className = 'todo-header';

  const titleEl = document.createElement('h3');
  titleEl.className = 'todo-title';
  titleEl.textContent = title;
  header.append(titleEl);

  // Build task list
  const list = document.createElement('ul');
  list.className = 'todo-list';

  rows.forEach((row) => {
    const text = row.textContent.trim();
    if (!text) { row.remove(); return; }

    const li = document.createElement('li');
    li.className = 'todo-item';

    const span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = text;

    li.append(span);
    list.append(li);
    row.remove();
  });

  el.textContent = '';
  el.append(header, list);
}
