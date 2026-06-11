const MAGIC_LINK_ENDPOINT = 'https://act.aem.now/auth/magiclink';

function injectHeading(col, text) {
  const h3 = document.createElement('h3');
  h3.className = 'pl-card-title';
  h3.textContent = text;
  col.prepend(h3);
}

function decorateAdobeButton(col) {
  const link = col.querySelector('strong > a');
  if (!link) return;
  link.classList.add('btn', 'btn-primary');
}

function createMagicForm() {
  const form = document.createElement('form');
  form.className = 'pl-magic-form';

  const label = document.createElement('label');
  label.className = 'pl-label';
  label.htmlFor = 'pl-email';
  label.textContent = 'Email address';

  const input = document.createElement('input');
  input.className = 'pl-input';
  input.type = 'email';
  input.id = 'pl-email';
  input.name = 'email';
  input.placeholder = 'your@company.com';
  input.required = true;
  input.autocomplete = 'email';

  const btn = document.createElement('button');
  btn.className = 'pl-submit';
  btn.type = 'submit';
  btn.textContent = 'Send login link';

  const error = document.createElement('p');
  error.className = 'pl-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  error.textContent = 'Something went wrong. Please try again.';

  form.append(label, input, btn, error);
  return form;
}

function attachSubmitHandler(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('#pl-email');
    const btn = form.querySelector('.pl-submit');
    const errorEl = form.querySelector('.pl-error');
    const email = input.value.trim();

    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const resp = await fetch(MAGIC_LINK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const msg = document.createElement('p');
      msg.className = 'pl-success';
      msg.textContent = `Check your inbox — we've sent a login link to ${email}.`;
      form.replaceWith(msg);
    } catch {
      btn.disabled = false;
      btn.textContent = 'Send login link';
      errorEl.hidden = false;
    }
  });
}

function injectDivider(row) {
  const divider = document.createElement('div');
  divider.className = 'pl-divider';
  const span = document.createElement('span');
  span.textContent = 'or';
  divider.append(span);
  const [colAdobe] = [...row.children];
  colAdobe.after(divider);
}

export default function init(el) {
  const [row] = [...el.children];
  row.classList.add('pl-row');

  const [colAdobe, colMagic] = [...row.children];
  colAdobe.classList.add('pl-col', 'pl-col-adobe');
  colMagic.classList.add('pl-col', 'pl-col-magic');

  injectHeading(colAdobe, 'Adobe ID');
  injectHeading(colMagic, 'Magic Link');

  decorateAdobeButton(colAdobe);

  const form = createMagicForm();
  colMagic.append(form);
  attachSubmitHandler(form);

  injectDivider(row);
}
