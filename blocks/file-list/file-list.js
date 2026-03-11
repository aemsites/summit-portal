const FILE_ICONS = {
  pdf: { label: 'PDF', color: '#e60000' },
  docx: { label: 'DOCX', color: '#2176ff' },
  doc: { label: 'DOC', color: '#2176ff' },
  xlsx: { label: 'XLSX', color: '#22c55e' },
  xls: { label: 'XLS', color: '#22c55e' },
  pptx: { label: 'PPTX', color: '#f59e0b' },
  ppt: { label: 'PPT', color: '#f59e0b' },
  zip: { label: 'ZIP', color: '#6b7280' },
  csv: { label: 'CSV', color: '#22c55e' },
  png: { label: 'PNG', color: '#9d60d8' },
  jpg: { label: 'JPG', color: '#9d60d8' },
  mp4: { label: 'MP4', color: '#36a7b3' },
  default: { label: 'FILE', color: '#6b7280' },
};

const HEADERS = ['File', 'Description', 'Uploaded'];

function getExtFromPath(path) {
  const match = (path || '').match(/\.(\w+)$/);
  return match ? match[1].toLowerCase() : 'default';
}

function formatDate(dateStr) {
  const trimmed = (dateStr || '').trim();
  if (!trimmed) return '';
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function buildFileIcon(ext) {
  const info = FILE_ICONS[ext] || FILE_ICONS.default;
  const badge = document.createElement('span');
  badge.className = 'fl-file-badge';
  badge.textContent = info.label;
  badge.style.setProperty('--fl-badge-color', info.color);
  return badge;
}

function sortFiles(files, col, dir) {
  const sorted = [...files];
  sorted.sort((a, b) => {
    let valA;
    let valB;
    if (col === 0) {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (col === 1) {
      valA = a.description.toLowerCase();
      valB = b.description.toLowerCase();
    } else {
      valA = a.dateRaw;
      valB = b.dateRaw;
    }
    if (valA < valB) return dir === 'asc' ? -1 : 1;
    if (valA > valB) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

function renderTable(files, sortCol, sortDir) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // Header row
  const headTr = document.createElement('tr');
  HEADERS.forEach((text, idx) => {
    const th = document.createElement('th');
    th.textContent = text;
    th.dataset.col = idx;
    th.classList.add('fl-sortable');
    if (idx === sortCol) {
      th.classList.add('fl-sorted');
      th.dataset.dir = sortDir;
    }
    headTr.append(th);
  });
  thead.append(headTr);

  // Data rows
  files.forEach((file) => {
    const tr = document.createElement('tr');
    tr.classList.add('fl-row');

    // Cell 0: file badge + link
    const tdFile = document.createElement('td');
    tdFile.className = 'fl-cell-file';
    tdFile.append(buildFileIcon(file.ext));
    const a = document.createElement('a');
    a.href = file.href;
    a.textContent = file.name;
    tdFile.append(a);
    tr.append(tdFile);

    // Cell 1: description
    const tdDesc = document.createElement('td');
    tdDesc.textContent = file.description;
    tr.append(tdDesc);

    // Cell 2: date
    const tdDate = document.createElement('td');
    tdDate.className = 'fl-cell-date';
    tdDate.textContent = file.dateFormatted;
    tr.append(tdDate);

    tbody.append(tr);
  });

  table.append(thead, tbody);
  return table;
}

/**
 * Parse files from a JSON sheet response (EDS sheet format).
 * Expected columns in sheet: name, path, description, date
 */
function parseSheetData(json, baseUrl) {
  const rows = json.data || json;
  return rows.map((row) => {
    const path = row.path || '';
    const ext = getExtFromPath(path);
    // Resolve relative path against the sheet's base URL
    const href = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('./') ? path.slice(1) : `/${path}`}`;
    return {
      name: row.name || path.split('/').pop().replace(/\.\w+$/, '').replace(/-/g, ' '),
      href,
      ext,
      description: row.description || '',
      dateRaw: row.date || '',
      dateFormatted: formatDate(row.date),
    };
  });
}

/**
 * Parse files from inline DA block rows (fallback when no JSON link).
 * Row 0 = header labels, rows 1+ = [link | description | date]
 */
function parseBlockRows(rows) {
  return rows.slice(1).map((row) => {
    const cells = [...row.children];
    const anchor = cells[0]?.querySelector('a');
    const href = anchor?.getAttribute('href') || '';
    const ext = getExtFromPath(href);
    return {
      name: anchor?.textContent.trim() || cells[0]?.textContent.trim() || '',
      href,
      ext,
      description: cells[1]?.textContent.trim() || '',
      dateRaw: cells[2]?.textContent.trim() || '',
      dateFormatted: formatDate(cells[2]?.textContent.trim() || ''),
    };
  });
}

export default async function init(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  if (!rows.length) return;

  // Check if block contains a link to a JSON sheet
  const link = el.querySelector('a[href$=".json"]');
  let files;

  if (link) {
    // Dynamic mode: fetch file list from sheet
    try {
      const resp = await fetch(link.href);
      if (!resp.ok) throw new Error(`${resp.status}`);
      const json = await resp.json();
      // Derive base URL from the sheet link (parent folder)
      const baseUrl = link.href.replace(/\/[^/]+\.json.*$/, '');
      files = parseSheetData(json, baseUrl);
    } catch (e) {
      el.textContent = '';
      const msg = document.createElement('p');
      msg.className = 'fl-error';
      msg.textContent = 'Unable to load file list.';
      el.append(msg);
      return;
    }
  } else {
    // Inline mode: parse rows from DA block content
    files = parseBlockRows(rows);
  }

  if (!files.length) return;

  let sortCol = 2; // default sort by date
  let sortDir = 'desc'; // newest first

  function render() {
    const sorted = sortFiles(files, sortCol, sortDir);
    el.textContent = '';
    const table = renderTable(sorted, sortCol, sortDir);

    table.querySelectorAll('th.fl-sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const col = parseInt(th.dataset.col, 10);
        if (col === sortCol) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortCol = col;
          sortDir = 'asc';
        }
        render();
      });
    });

    el.append(table);
  }

  render();
}
