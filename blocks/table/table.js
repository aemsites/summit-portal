function decorateNativeTable(table) {
  let thead = table.querySelector(':scope > thead');
  const rows = [...table.querySelectorAll('tr')];

  if (!thead) {
    thead = document.createElement('thead');
    table.prepend(thead);

    const headingRow = rows.shift();
    if (headingRow) {
      thead.append(headingRow);
      const tds = headingRow.querySelectorAll(':scope > td');
      for (const td of tds) {
        const th = document.createElement('th');
        th.className = td.className;
        th.innerHTML = td.innerHTML;
        td.parentElement.replaceChild(th, td);
      }
    }
  }

  for (const row of rows) {
    row.classList.add('table-content-row');
  }
}

function buildTableFromDivs(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  if (!rows.length) return;

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  rows.forEach((row, idx) => {
    const cells = [...row.children];
    const tr = document.createElement('tr');
    if (idx > 0) tr.classList.add('table-content-row');

    cells.forEach((cell) => {
      const tag = idx === 0 ? 'th' : 'td';
      const el = document.createElement(tag);
      el.innerHTML = cell.innerHTML;
      tr.append(el);
    });

    if (idx === 0) {
      thead.append(tr);
    } else {
      tbody.append(tr);
    }
  });

  table.append(thead, tbody);
  el.textContent = '';
  el.append(table);
}

export default function init(el) {
  const nativeTables = el.querySelectorAll('table');
  if (nativeTables.length) {
    for (const table of nativeTables) {
      decorateNativeTable(table);
    }
  } else {
    // DA block tables produce div structures — convert to table
    buildTableFromDivs(el);
  }
}
