// blocks/portal-login/portal-login.js

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
}
