export default function init(el) {
  // Block structure (DA authoring):
  //   Row 1: single cell containing <strong> subtitle + <ul> task list
  const cell = el.querySelector(':scope > div > div');
  if (!cell) return;

  // Extract title from <strong> inside first <p>
  const strongEl = cell.querySelector('p > strong');
  const titleText = strongEl?.textContent.trim() || 'To-Do';

  // Build header
  const header = document.createElement('div');
  header.className = 'todo-header';

  const titleEl = document.createElement('h3');
  titleEl.className = 'todo-title';
  titleEl.textContent = titleText;
  header.append(titleEl);

  // Build task list from <ul> > <li> items
  const list = document.createElement('ul');
  list.className = 'todo-list';

  const items = [...cell.querySelectorAll('ul > li')];
  items.forEach((li) => {
    const text = li.textContent.trim();
    if (!text) return;

    const item = document.createElement('li');
    item.className = 'todo-item';

    const span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = text;

    item.append(span);
    list.append(item);
  });

  el.textContent = '';
  el.append(header, list);
}
