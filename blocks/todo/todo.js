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

  const saveBtn = document.createElement('button');
  saveBtn.className = 'todo-save';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    const items = el.querySelectorAll('.todo-checkbox');
    const state = [...items].map((cb) => cb.checked);
    localStorage.setItem(`todo-${title}`, JSON.stringify(state));
    saveBtn.textContent = 'Saved!';
    setTimeout(() => { saveBtn.textContent = 'Save'; }, 1500);
  });
  header.append(saveBtn);

  // Build task list
  const list = document.createElement('ul');
  list.className = 'todo-list';

  // Load saved state
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(`todo-${title}`)) || [];
  } catch { /* ignore */ }

  rows.forEach((row, i) => {
    const text = row.textContent.trim();
    if (!text) { row.remove(); return; }

    const li = document.createElement('li');
    li.className = 'todo-item';

    const label = document.createElement('label');
    label.className = 'todo-label';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'todo-checkbox';
    if (saved[i]) cb.checked = true;

    const span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = text;

    label.append(cb, span);
    li.append(label);
    list.append(li);
    row.remove();
  });

  el.textContent = '';
  el.append(header, list);
}
