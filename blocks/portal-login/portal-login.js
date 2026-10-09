const MAGIC_LINK_ENDPOINT = '/auth/magiclink';
const STAFF_LOGIN_ENDPOINT = '/auth/staff-login';

/**
 * Read the `?redirect=` query param from the current URL and return it only
 * when it is a safe same-origin path (starts with `/`, not `//`). The worker
 * re-validates this on the server, so this is just a UX best-effort.
 */
function getRedirectPath(allowHomepage = false) {
  const raw = new URLSearchParams(window.location.search).get('redirect');
  if (!raw || (!allowHomepage && raw === '/') || !raw.startsWith('/') || raw.startsWith('//')) return null;
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
  const unavailable = document.createElement('div');
  unavailable.className = 'pl-unavailable';
  unavailable.hidden = true;
  unavailable.tabIndex = -1;
  unavailable.setAttribute('role', 'status');
  unavailable.innerHTML = `
    <h4>We couldn't find a report available to this email address.</h4>
    <p>Try another business email, or request a report. Adobe Sales will prepare it and follow up.</p>
    <a class="pl-request-action" href="/request-report?reason=unavailable">Request a report</a>
  `;
  form.append(unavailable);
  return form;
}

function attachSubmitHandler(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('#pl-email');
    const btn = form.querySelector('.pl-submit');
    const errorEl = form.querySelector('.pl-error');
    const unavailable = form.querySelector('.pl-unavailable');
    const email = input.value.trim();

    errorEl.hidden = true;
    unavailable.hidden = true;
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
      const result = await resp.json();
      if (result.code === 'lookup_unavailable' || (result.result === 'not_found' && result.reason)) {
        throw new Error("We couldn't check report availability. Please try again.");
      }
      if (!resp.ok) throw new Error("We couldn't send your login link. Please try again.");
      if (result.result === 'not_found') {
        unavailable.hidden = false;
        unavailable.focus();
        return;
      }
      if (result.result !== 'sent') {
        throw new Error("We couldn't confirm your login link was sent. Please try again.");
      }
      const msg = document.createElement('p');
      msg.className = 'pl-success';
      msg.tabIndex = -1;
      msg.setAttribute('role', 'status');
      msg.textContent = `Check your inbox — we've sent a login link to ${email}.`;
      form.replaceWith(msg);
      msg.focus();
    } catch (error) {
      errorEl.textContent = error.message?.startsWith("We couldn't")
        ? error.message
        : "We couldn't send your login link. Please try again.";
      errorEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send login link';
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

/**
 * The staff credential login is hidden by default. It renders only when the
 * login URL opts in via `?staff` (or `#staff`) — event iPads are bookmarked to
 * that URL, while customers signing in on their own devices never see it.
 */
function staffRequested() {
  const { search, hash } = window.location;
  const params = new URLSearchParams(search);
  return params.has('staff') || params.has('exit-booth') || hash.replace('#', '') === 'staff';
}

const LOCK_ICON = '<svg class="pl-staff-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
  + '<path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm3 8H9V7a3 3 0 0 1 6 0v3Zm-3 4a1.5 1.5 0 0 1 .75 2.8V19a.75.75 0 0 1-1.5 0v-2.2A1.5 1.5 0 0 1 12 14Z"/>'
  + '</svg>';

function createStaffForm(exitBooth) {
  const section = document.createElement('section');
  section.className = 'pl-staff';

  const header = document.createElement('div');
  header.className = 'pl-staff-header';
  header.innerHTML = LOCK_ICON;
  const title = document.createElement('h3');
  title.className = 'pl-staff-title';
  title.textContent = exitBooth ? 'Sign out and exit booth' : 'Event staff sign-in';
  header.append(title);

  const hint = document.createElement('p');
  hint.className = 'pl-staff-hint';
  hint.textContent = exitBooth
    ? 'Enter the staff credentials again to sign out and remove booth mode from this browser. This does not sign you in to the portal.'
    : 'For on-site event devices. Use the shared staff credentials.';

  section.append(header, hint);

  const form = document.createElement('form');
  form.className = 'pl-staff-form';
  if (exitBooth) form.autocomplete = 'off';

  const userLabel = document.createElement('label');
  userLabel.className = 'pl-label';
  userLabel.htmlFor = 'pl-staff-user';
  userLabel.textContent = 'Username';
  const userInput = document.createElement('input');
  userInput.className = 'pl-input';
  userInput.type = 'text';
  userInput.id = 'pl-staff-user';
  userInput.name = 'username';
  userInput.autocomplete = exitBooth ? 'off' : 'username';
  // Stop iOS from auto-capitalizing / autocorrecting the typed username.
  userInput.setAttribute('autocapitalize', 'none');
  userInput.setAttribute('autocorrect', 'off');
  userInput.setAttribute('spellcheck', 'false');
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
  passInput.autocomplete = exitBooth ? 'off' : 'current-password';
  passInput.required = true;

  const btn = document.createElement('button');
  btn.className = 'pl-submit';
  btn.type = 'submit';
  btn.textContent = exitBooth ? 'Sign out and exit booth' : 'Sign in';

  const error = document.createElement('p');
  error.className = 'pl-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  error.textContent = 'Incorrect username or password.';

  form.append(userLabel, userInput, passLabel, passInput, btn, error);
  section.append(form);
  if (exitBooth) {
    const cancel = document.createElement('a');
    cancel.className = 'pl-staff-cancel';
    const redirect = getRedirectPath(true);
    cancel.href = redirect?.split('?')[0] === '/booth' ? redirect : '/booth';
    cancel.textContent = 'Back to booth';
    section.append(cancel);
    window.addEventListener('pagehide', () => form.reset(), { once: true });
  }
  return { section, form };
}

function attachStaffHandler(form, exitBooth) {
  const cancel = form.parentElement.querySelector('.pl-staff-cancel');
  cancel?.addEventListener('click', (event) => {
    if (form.querySelector('.pl-submit').disabled) event.preventDefault();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.querySelector('#pl-staff-user').value.trim();
    const password = form.querySelector('#pl-staff-pass').value;
    const btn = form.querySelector('.pl-submit');
    const errorEl = form.querySelector('.pl-error');
    if (btn.disabled) return;

    errorEl.hidden = true;
    btn.disabled = true;
    cancel?.setAttribute('aria-disabled', 'true');
    btn.textContent = exitBooth ? 'Exiting booth…' : 'Signing in…';
    const controller = new AbortController();
    let timer;
    let exitError = 'Booth exit could not be confirmed. Try again or return to the booth.';

    try {
      const { resp, result } = await Promise.race([
        (async () => {
          const response = await fetch(STAFF_LOGIN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            signal: controller.signal,
            body: JSON.stringify({ username, password, ...(exitBooth ? { action: 'exit-booth' } : {}) }),
          });
          return { resp: response, result: exitBooth ? await response.json() : null };
        })(),
        new Promise((resolve, reject) => {
          timer = setTimeout(() => {
            exitError = 'Booth exit timed out. Try again or return to the booth.';
            controller.abort();
            reject(new Error('Staff authentication timed out'));
          }, 10000);
        }),
      ]);
      if (resp.status === 401) exitError = 'Incorrect username or password. Booth mode is still active.';
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (exitBooth) {
        if (result?.result !== 'exited') throw new Error('Booth exit was not confirmed');
        window.location.replace('/login');
        return;
      }
      window.location.assign(getRedirectPath(true) || '/adobe/dashboard');
    } catch {
      btn.disabled = false;
      cancel?.removeAttribute('aria-disabled');
      btn.textContent = exitBooth ? 'Sign out and exit booth' : 'Sign in';
      if (exitBooth) errorEl.textContent = exitError;
      errorEl.hidden = false;
    } finally {
      clearTimeout(timer);
      if (exitBooth) form.querySelector('#pl-staff-pass').value = '';
    }
  });
}

export default function init(el) {
  const [row] = [...el.children];

  // Event-device mode (/login?staff): show ONLY the staff form. The authored
  // customer row (Adobe ID + email) is dropped so the iPad gets a single,
  // focused sign-in rather than three stacked options.
  if (staffRequested()) {
    const exitBooth = new URLSearchParams(window.location.search).has('exit-booth');
    if (exitBooth) {
      const introduction = el.closest('.section')?.querySelector('.default-content, .default-content-wrapper');
      const heading = introduction?.querySelector('h1');
      const copy = introduction?.querySelector('p');
      if (heading) heading.textContent = 'Exit booth mode';
      if (copy) copy.textContent = 'Staff authorization is required to return this browser to the normal portal.';
    }
    el.classList.add('pl-staff-only');
    row.remove();
    const { section, form: staffForm } = createStaffForm(exitBooth);
    el.append(section);
    attachStaffHandler(staffForm, exitBooth);
    return;
  }

  // Default (customer) login: Adobe ID + email magic link, no staff form.
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

  const request = document.createElement('p');
  request.className = 'pl-request';
  request.innerHTML = 'Don\'t have a report yet? <a href="/request-report">Request a report</a>.';
  el.prepend(request);

  const reason = new URLSearchParams(window.location.search).get('reason');
  if (['lookup-unavailable', 'authentication-failed'].includes(reason)) {
    const notice = document.createElement('div');
    notice.className = 'pl-lookup-error';
    notice.setAttribute('role', 'alert');
    const message = reason === 'authentication-failed'
      ? "We couldn't sign you in. Please try again, or use the email login option below."
      : "We couldn't check report availability. Please try again.";
    const text = document.createElement('p');
    text.textContent = message;
    const retry = document.createElement('a');
    retry.href = '/auth/portal';
    retry.textContent = 'Try again';
    notice.append(text, retry);
    el.prepend(notice);
  }
}
