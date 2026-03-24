import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const DA_SOURCE_BASE = 'https://admin.da.live/source';
const ADMIN_BASE = 'https://admin.hlx.page';
const COMPANY_LIST_PATH = 'data/company-list';
const PORTAL_TEMPLATE = 'docs/library/templates/portal';
const FILE_INDEX_TEMPLATE = 'docs/library/templates/files/file-index';

// ─── Slug helpers ────────────────────────────────────────────────────────────

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || 'untitled';
}

function getFirstChar(slug) {
  return /^[0-9]/.test(slug) ? '0-9' : slug[0];
}

// ─── DA Source API ────────────────────────────────────────────────────────────

async function daGet(org, site, path, token) {
  const url = `${DA_SOURCE_BASE}/${org}/${site}/${path}`;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function daPost(org, site, path, html, token) {
  const blob = new Blob([html], { type: 'text/html' });
  const fd = new FormData();
  fd.append('data', blob);
  return fetch(`${DA_SOURCE_BASE}/${org}/${site}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

async function createFolder(org, site, path, token) {
  const resp = await fetch(`${DA_SOURCE_BASE}/${org}/${site}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 200, 201, 409 all mean the folder exists or was created
  if (!resp.ok && resp.status !== 409) {
    throw new Error(`Failed to create folder /${path}: ${resp.status}`);
  }
}

async function checkExists(org, site, path, token) {
  const resp = await daGet(org, site, path, token);
  if (resp.status === 200) return true;
  if (resp.status === 404) return false;
  throw new Error(`Unexpected status checking /${path}: ${resp.status}`);
}

// ─── Company list ─────────────────────────────────────────────────────────────

async function fetchCompanyListHtml(org, site, token) {
  const resp = await daGet(org, site, COMPANY_LIST_PATH, token);
  if (resp.status === 404) return null; // sheet doesn't exist yet
  if (!resp.ok) throw new Error(`Cannot read company-list: ${resp.status}`);
  return resp.text();
}

function parseTableRows(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll('table tr')];
  return rows.map((r) => [...r.querySelectorAll('th,td')].map((c) => c.textContent.trim()));
}

function companyExists(html, companyName) {
  if (!html) return false;
  const name = companyName.trim().toLowerCase();
  const rows = parseTableRows(html);
  // first row is header; check column 0 of data rows
  return rows.slice(1).some((cols) => (cols[0] || '').toLowerCase() === name);
}

function appendRow(existingHtml, { company, website, emailDomains, roles }) {
  if (!existingHtml) {
    // Build new sheet from scratch
    return `<body><main><div>
<table>
<thead><tr><th>Company</th><th>Website</th><th>Email Domains</th><th>Roles</th></tr></thead>
<tbody>
<tr><td>${esc(company)}</td><td>${esc(website)}</td><td>${esc(emailDomains)}</td><td>${esc(roles)}</td></tr>
</tbody>
</table>
</div></main></body>`;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(existingHtml, 'text/html');
  const tbody = doc.querySelector('tbody') || doc.querySelector('table');
  const tr = doc.createElement('tr');
  [company, website, emailDomains, roles].forEach((val) => {
    const td = doc.createElement('td');
    td.textContent = val;
    tr.append(td);
  });
  tbody.append(tr);
  return doc.documentElement.outerHTML;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Template copy ────────────────────────────────────────────────────────────

async function copyTemplate(org, site, srcPath, dstPath, token) {
  const resp = await daGet(org, site, srcPath, token);
  if (!resp.ok) throw new Error(`Cannot read template /${srcPath}: ${resp.status}`);
  const html = await resp.text();
  const postResp = await daPost(org, site, dstPath, html, token);
  if (!postResp.ok) throw new Error(`Cannot write /${dstPath}: ${postResp.status}`);
}

// ─── Preview + publish ────────────────────────────────────────────────────────

async function previewAndPublish(org, site, paths, token) {
  const headers = { Authorization: `Bearer ${token}` };
  for (const path of paths) {
    await fetch(`${ADMIN_BASE}/preview/${org}/${site}/main/${path}`, { method: 'POST', headers });
    await fetch(`${ADMIN_BASE}/live/${org}/${site}/main/${path}`, { method: 'POST', headers });
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  children.flat().forEach((c) => node.append(c));
  return node;
}

function makeMultiField(placeholder) {
  const values = [];
  const wrapper = el('div', { className: 'multi-field-wrapper' });
  const input = el('input', { className: 'multi-input', type: 'text', placeholder });

  function addTag(raw) {
    raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((val) => {
      if (values.includes(val)) return;
      values.push(val);
      const tag = el('span', { className: 'tag' }, val);
      const rm = el('button', { className: 'tag-remove', type: 'button' }, '×');
      rm.addEventListener('click', () => {
        values.splice(values.indexOf(val), 1);
        tag.remove();
      });
      tag.append(rm);
      wrapper.insertBefore(tag, input);
    });
  }

  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      addTag(input.value);
      input.value = '';
    }
    if (e.key === 'Backspace' && !input.value && values.length) {
      const last = values[values.length - 1];
      const tags = wrapper.querySelectorAll('.tag');
      tags[tags.length - 1]?.remove();
      values.splice(values.indexOf(last), 1);
    }
  });

  input.addEventListener('blur', () => {
    if (input.value.trim()) { addTag(input.value); input.value = ''; }
  });

  wrapper.addEventListener('click', () => input.focus());

  return {
    wrapper,
    getValues: () => [...values],
    getValue: () => values.join(', '),
    setInvalid: (v) => wrapper.classList.toggle('invalid', v),
  };
}

function showBanner(banner, type, msg) {
  banner.className = `banner visible ${type}`;
  banner.textContent = msg;
}

function hideBanner(banner) {
  banner.className = 'banner';
}

function logStep(stepLog, msg, state = 'pending') {
  const p = el('p', { className: state }, msg);
  stepLog.append(p);
  return p;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderUI(onSubmit) {
  const card = el('div', { className: 'card' });

  const heading = el('h1', { className: 'card-heading' }, 'Onboard a new customer');
  const subtitle = el('p', { className: 'card-subtitle' }, 'Fill in the details below to create a new customer workspace.');

  const banner = el('div', { className: 'banner' });

  // Company Name
  const nameInput = el('input', {
    className: 'form-input',
    type: 'text',
    placeholder: 'Acme Corporation',
    required: '',
  });
  const slugPreview = el('div', { className: 'slug-preview' }, 'Folder will be created at: /customers/…');
  const nameError = el('div', { className: 'form-error' }, 'Company name is required.');
  const nameGroup = el('div', { className: 'form-group' },
    el('label', { className: 'form-label' }, 'Company Name', el('span', { className: 'required' }, '*')),
    nameInput, slugPreview, nameError,
  );

  nameInput.addEventListener('input', () => {
    const slug = toSlug(nameInput.value);
    const fc = getFirstChar(slug);
    slugPreview.textContent = nameInput.value.trim()
      ? `Folder will be created at: /customers/${fc}/${slug}`
      : 'Folder will be created at: /customers/…';
  });

  // Website
  const websiteInput = el('input', {
    className: 'form-input',
    type: 'url',
    placeholder: 'https://acme.com',
    required: '',
  });
  const websiteError = el('div', { className: 'form-error' }, 'A valid website URL is required.');
  const websiteGroup = el('div', { className: 'form-group' },
    el('label', { className: 'form-label' }, 'Website', el('span', { className: 'required' }, '*')),
    websiteInput, websiteError,
  );

  // Email Domains
  const emailField = makeMultiField('acme.com');
  const emailError = el('div', { className: 'form-error' }, 'At least one email domain is required.');
  const emailGroup = el('div', { className: 'form-group' },
    el('label', { className: 'form-label' }, 'Email Domains', el('span', { className: 'required' }, '*')),
    emailField.wrapper,
    el('div', { className: 'form-helper' }, 'Press Enter or comma to add. Users with these domains will have access.'),
    emailError,
  );

  // Roles
  const rolesField = makeMultiField('admin, editor, viewer');
  const rolesGroup = el('div', { className: 'form-group' },
    el('label', { className: 'form-label' }, 'Roles'),
    rolesField.wrapper,
    el('div', { className: 'form-helper' }, 'Optional. Press Enter or comma to add.'),
  );

  // Submit
  const spinner = el('div', { className: 'spinner' });
  const btnLabel = el('span', {}, 'Create Customer Workspace');
  const submitBtn = el('button', { className: 'submit-btn', type: 'submit' }, spinner, btnLabel);

  // Step log
  const stepLog = el('div', { className: 'step-log' });

  card.append(heading, subtitle, banner, nameGroup, websiteGroup, emailGroup, rolesGroup, submitBtn, stepLog);
  document.body.append(card);

  submitBtn.addEventListener('click', async () => {
    // Clear previous state
    hideBanner(banner);
    nameError.classList.remove('visible'); nameInput.classList.remove('invalid');
    websiteError.classList.remove('visible'); websiteInput.classList.remove('invalid');
    emailError.classList.remove('visible'); emailField.setInvalid(false);
    stepLog.className = 'step-log';
    stepLog.innerHTML = '';

    // Validate
    let valid = true;
    if (!nameInput.value.trim()) {
      nameError.classList.add('visible'); nameInput.classList.add('invalid'); valid = false;
    }
    if (!websiteInput.value.trim()) {
      websiteError.classList.add('visible'); websiteInput.classList.add('invalid'); valid = false;
    }
    if (!emailField.getValues().length) {
      emailError.classList.add('visible'); emailField.setInvalid(true); valid = false;
    }
    if (!valid) return;

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    btnLabel.textContent = 'Creating…';
    stepLog.className = 'step-log visible';

    try {
      await onSubmit({
        company: nameInput.value.trim(),
        website: websiteInput.value.trim(),
        emailDomains: emailField.getValue(),
        roles: rolesField.getValue(),
      }, stepLog, banner);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
      btnLabel.textContent = 'Create Customer Workspace';
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async function init() {
  const { context, token } = await DA_SDK;

  const org = context.org || context.organization || context.owner;
  const site = context.site || context.repo || context.repository;

  if (!org || !site) {
    const errCard = el('div', { className: 'card' },
      el('h1', { className: 'card-heading' }, 'Initialization Error'),
      el('p', { className: 'card-subtitle' }, 'Could not determine org/site from DA context. Please open this app from within a DA site.'),
    );
    document.body.append(errCard);
    return;
  }

  renderUI(async (data, stepLog, banner) => {
    const { company, website, emailDomains, roles } = data;
    const slug = toSlug(company);
    const firstChar = getFirstChar(slug);
    const customerPath = `customers/${firstChar}/${slug}`;

    // Step 1: Check company-list for duplicate
    let step = logStep(stepLog, 'Checking company list for duplicates…');
    let listHtml = await fetchCompanyListHtml(org, site, token);
    if (companyExists(listHtml, company)) {
      step.className = 'fail';
      step.textContent = `✗ Company "${company}" already exists in the company list.`;
      showBanner(banner, 'error', `"${company}" is already onboarded. Please use a different company name.`);
      return;
    }
    step.className = 'done';
    step.textContent = `✓ No duplicate found.`;

    // Step 2: Update company-list
    step = logStep(stepLog, 'Updating company list…');
    const updatedHtml = appendRow(listHtml, { company, website, emailDomains, roles });
    const listResp = await daPost(org, site, COMPANY_LIST_PATH, updatedHtml, token);
    if (!listResp.ok) throw new Error(`Failed to update company list: ${listResp.status}`);
    step.className = 'done';
    step.textContent = '✓ Company list updated.';

    // Step 3: Check target folder doesn't already exist
    step = logStep(stepLog, `Checking if /customers/${firstChar}/${slug} is available…`);
    const alreadyExists = await checkExists(org, site, customerPath, token);
    if (alreadyExists) {
      step.className = 'fail';
      showBanner(banner, 'error', `Folder /customers/${firstChar}/${slug} already exists.`);
      return;
    }
    step.className = 'done';
    step.textContent = `✓ Path /customers/${firstChar}/${slug} is available.`;

    // Step 4: Create folders
    step = logStep(stepLog, 'Creating folder structure…');
    await createFolder(org, site, `customers/${firstChar}`, token);
    await createFolder(org, site, customerPath, token);
    step.className = 'done';
    step.textContent = '✓ Folders created.';

    // Step 5: Copy portal template → index
    step = logStep(stepLog, 'Copying portal template…');
    await copyTemplate(org, site, PORTAL_TEMPLATE, `${customerPath}/index`, token);
    step.className = 'done';
    step.textContent = '✓ Portal template copied as index.';

    // Step 6: Copy file-index template
    step = logStep(stepLog, 'Copying file-index template…');
    await copyTemplate(org, site, FILE_INDEX_TEMPLATE, `${customerPath}/file-index`, token);
    step.className = 'done';
    step.textContent = '✓ File-index template copied.';

    // Step 7: Preview and publish
    step = logStep(stepLog, 'Publishing pages…');
    try {
      await previewAndPublish(org, site, [
        `${customerPath}/index`,
        `${customerPath}/file-index`,
      ], token);
      step.className = 'done';
      step.textContent = '✓ Pages previewed and published.';
    } catch {
      step.className = 'fail';
      step.textContent = '⚠ Publish step failed — continuing to editor.';
    }

    // Step 8: Redirect
    logStep(stepLog, 'Opening DA editor…', 'done');
    setTimeout(() => {
      window.top.location.href = `https://da.live/edit#/${org}/${site}/${customerPath}/index`;
    }, 800);
  });
}());
