const MAGIC_LINK_ENDPOINT = 'https://act.aem.now/auth/magiclink';
const STAFF_LOGIN_ENDPOINT = '/auth/staff-login';

/**
 * Read the `?redirect=` query param from the current URL and return it only
 * when it is a safe same-origin path (starts with `/`, not `//`). The worker
 * re-validates this on the server, so this is just a UX best-effort.
 */
function getRedirectPath() {
  const raw = new URLSearchParams(window.location.search).get('redirect');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

function decorateAdobeButton(col) {
  const link = col.querySelector('strong > a');
  if (!link) return;
  link.classList.add('btn', 'btn-primary');
  // Forward the deep-link target through the OAuth flow so the user lands on
  // the originally requested page after signing in with Adobe ID.
  const redirect = getRedirectPath();
  if (redirect) {
    try {
      const url = new URL(link.getAttribute('href'), window.location.origin);
      url.searchParams.set('redirect', redirect);
      link.setAttribute('href', `${url.pathname}${url.search}`);
    } catch {
      // leave href untouched on parse failure
    }
  }
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
      const redirect = getRedirectPath();
      const payload = redirect ? { email, redirect } : { email };
      const resp = await fetch(MAGIC_LINK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

function createStaffForm() {
  const details = document.createElement('details');
  details.className = 'pl-staff';

  const summary = document.createElement('summary');
  summary.className = 'pl-staff-summary';
  summary.textContent = 'Event staff access';
  details.append(summary);

  const form = document.createElement('form');
  form.className = 'pl-staff-form';

  const userLabel = document.createElement('label');
  userLabel.className = 'pl-label';
  userLabel.htmlFor = 'pl-staff-user';
  userLabel.textContent = 'Username';
  const userInput = document.createElement('input');
  userInput.className = 'pl-input';
  userInput.type = 'text';
  userInput.id = 'pl-staff-user';
  userInput.name = 'username';
  userInput.autocomplete = 'username';
  // Stop iOS from auto-capitalizing / autocorrecting the typed username.
  userInput.autocapitalize = 'none';
  userInput.setAttribute('autocorrect', 'off');
  userInput.spellcheck = false;
  userInput.required = true;

  const passLabel = document.createElement('label');
  passLabel.className = 'pl-label';
  passLabel.htmlFor = 'pl-staff-pass';
  passLabel.textContent = 'Password';
  const passInput = document.createElement('input');
  passInput.className = 'pl-input';
  passInput.type = 'password';
  passInput.id = 'pl-staff-pass';
  passInput.name = 'password';
  passInput.autocomplete = 'current-password';
  passInput.required = true;

  const btn = document.createElement('button');
  btn.className = 'pl-submit';
  btn.type = 'submit';
  btn.textContent = 'Sign in';

  const error = document.createElement('p');
  error.className = 'pl-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  error.textContent = 'Incorrect username or password.';

  form.append(userLabel, userInput, passLabel, passInput, btn, error);
  details.append(form);
  return { details, form };
}

function attachStaffHandler(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.querySelector('#pl-staff-user').value.trim();
    const password = form.querySelector('#pl-staff-pass').value;
    const btn = form.querySelector('.pl-submit');
    const errorEl = form.querySelector('.pl-error');

    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const resp = await fetch(STAFF_LOGIN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      window.location.assign(getRedirectPath() || '/adobe/dashboard');
    } catch {
      btn.disabled = false;
      btn.textContent = 'Sign in';
      errorEl.hidden = false;
    }
  });
}

export default function init(el) {
  const [row] = [...el.children];
  row.classList.add('pl-row');

  const [colAdobe, colMagic] = [...row.children];
  colAdobe.classList.add('pl-col', 'pl-col-adobe');
  colMagic.classList.add('pl-col', 'pl-col-magic');

  colAdobe.querySelector('h3')?.classList.add('pl-card-title');
  colMagic.querySelector('h3')?.classList.add('pl-card-title');

  decorateAdobeButton(colAdobe);

  const form = createMagicForm();
  colMagic.append(form);
  attachSubmitHandler(form);

  injectDivider(row);

  const { details, form: staffForm } = createStaffForm();
  el.append(details);
  attachStaffHandler(staffForm);
}
