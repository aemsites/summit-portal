import { getMetadata, loadStyle } from '../../scripts/ak.js';
import { BOOTH_DEMOS } from '../../scripts/booth-demos.js';

const API_PATH = 'https://act.aem.now/api/report-requests';
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const fieldSpecs = [
  {
    id: 'first-name', key: 'firstName', label: 'First name', autocomplete: 'given-name', maxLength: 60, required: true,
  },
  {
    id: 'last-name', key: 'lastName', label: 'Last name', autocomplete: 'family-name', maxLength: 60, required: true,
  },
  {
    id: 'business-email', key: 'email', label: 'Business email', type: 'email', inputmode: 'email', autocomplete: 'email', maxLength: 254, required: true,
  },
  {
    id: 'company', key: 'company', label: 'Company', autocomplete: 'organization', maxLength: 160, required: true,
  },
  {
    id: 'website', key: 'website', label: 'Website or domain', inputmode: 'url', autocomplete: 'url', placeholder: 'company.com', maxLength: 253, required: true, wide: true,
  },
  {
    id: 'request-source',
    key: 'requestSource',
    label: 'Where did you hear about this report?',
    hint: 'At an event? Include the event name and city. Otherwise, tell us if it was an email, a colleague, or the web.',
    autocomplete: 'off',
    maxLength: 200,
    required: true,
    wide: true,
  },
];

let turnstileLoading;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoading) return turnstileLoading;
  turnstileLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error('Turnstile could not load.'));
    document.head.append(script);
  });
  return turnstileLoading;
}

function metadataValue(key) {
  const existing = getMetadata(key);
  if (existing) return existing;
  const row = [...document.querySelectorAll('.metadata > div')].find((item) => {
    const [name] = item.children;
    return name?.textContent.trim().toLowerCase() === key;
  });
  return row?.children[1]?.textContent.trim() || '';
}

function errorMessage(input) {
  const { validity } = input;
  const missing = validity.valueMissing
    || (input.required && input.type !== 'checkbox' && !input.value.trim());
  if (input.name === 'consent' && missing) {
    return 'Please agree that Adobe may contact you about your requested report.';
  }
  if (input.name === 'requestSource' && missing) {
    return 'Please tell us where you heard about this report.';
  }
  if (missing) return `Please enter your ${input.dataset.label.toLowerCase()}.`;
  if (validity.typeMismatch) return 'Enter a valid business email address.';
  if (validity.patternMismatch) return 'Enter a website such as company.com.';
  if (validity.tooLong) return `Use ${input.maxLength} characters or fewer.`;
  return '';
}

function setFieldError(input) {
  const message = errorMessage(input);
  const field = input.closest('.rrf-field');
  const consent = input.closest('.rrf-consent');
  const error = field
    ? document.getElementById(`${input.id}-error`)
    : consent.querySelector('.rrf-consent-error');
  field?.classList.toggle('is-invalid', Boolean(message));
  consent?.classList.toggle('is-invalid', Boolean(message));
  input.setAttribute('aria-invalid', Boolean(message));
  error.textContent = message;
  return message;
}

function createField(spec, prefix) {
  const wrapper = document.createElement('div');
  wrapper.className = spec.wide ? 'rrf-field rrf-field-wide' : 'rrf-field';
  const label = document.createElement('label');
  const input = document.createElement('input');
  const error = document.createElement('span');
  input.id = `${prefix}-${spec.id}`;
  input.name = spec.key;
  input.type = spec.type || 'text';
  input.dataset.label = spec.label;
  input.autocomplete = document.querySelector('script[data-booth-mode="request"]')
    ? 'off' : spec.autocomplete;
  if (spec.inputmode) input.inputMode = spec.inputmode;
  if (spec.required) input.required = true;
  if (spec.maxLength) input.maxLength = spec.maxLength;
  if (spec.placeholder) input.placeholder = spec.placeholder;
  if (spec.key === 'website') input.pattern = '.*\\..*';
  label.htmlFor = input.id;
  label.textContent = spec.label;
  error.id = `${input.id}-error`;
  error.className = 'rrf-field-error';
  input.setAttribute('aria-describedby', error.id);
  input.addEventListener('blur', () => setFieldError(input));
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') setFieldError(input);
  });
  wrapper.append(label, input, error);
  if (spec.hint) {
    const hint = document.createElement('p');
    hint.className = 'rrf-field-hint';
    hint.id = `${input.id}-hint`;
    hint.textContent = spec.hint;
    input.setAttribute('aria-describedby', `${hint.id} ${error.id}`);
    input.after(hint);
  }
  return wrapper;
}

function createTurnstile(form, siteKey) {
  const holder = document.createElement('div');
  holder.className = 'rrf-turnstile';
  form.append(holder);

  let token = '';
  let widgetId;
  const ready = loadTurnstile().then((turnstile) => {
    if (!turnstile) throw new Error('Turnstile is unavailable.');
    widgetId = turnstile.render(holder, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      execution: 'execute',
      callback: (value) => { token = value; },
      'expired-callback': () => { token = ''; },
      'error-callback': () => { token = ''; },
    });
    return turnstile;
  });

  return {
    async token() {
      const turnstile = await ready;
      if (!token) turnstile.execute(widgetId);
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Verification timed out.')), 10000);
        const check = () => {
          if (token) {
            window.clearTimeout(timeout);
            resolve();
          } else {
            window.setTimeout(check, 50);
          }
        };
        check();
      });
      return token;
    },
    reset() {
      token = '';
      if (widgetId !== undefined && window.turnstile) window.turnstile.reset(widgetId);
    },
  };
}

function successView(form) {
  const success = document.createElement('section');
  success.className = 'rrf-success';
  success.tabIndex = -1;
  success.setAttribute('aria-live', 'polite');
  success.innerHTML = `
    <div class="rrf-success-hero"><h2>We'll take it from here.</h2></div>
    <p>Your report request is with Adobe. There's nothing else you need to do right now.</p>
    <h3>What happens next</h3>
    <ol>
      <li><strong>We review your website</strong><span>We use the site you shared to prepare your Digital Opportunity Report.</span></li>
      <li><strong>Adobe Sales follows up</strong><span>We'll share your report and help you decide what to explore next.</span></li>
    </ol>
  `;
  const shell = form.closest('.rrf-shell');
  if (shell) shell.replaceChildren(success);
  else form.replaceWith(success);
  success.focus();
  document.dispatchEvent(new Event('booth-request-complete'));
}

function buildPayload(form, turnstileToken) {
  const formData = new FormData(form);
  return {
    fullName: `${formData.get('firstName').trim()} ${formData.get('lastName').trim()}`,
    email: formData.get('email'),
    company: formData.get('company'),
    website: formData.get('website'),
    requestSource: formData.get('requestSource'),
    consent: formData.get('consent') === 'on',
    websiteConfirm: formData.get('websiteConfirm'),
    turnstileToken,
  };
}

function validForm(form) {
  const inputs = [...form.querySelectorAll('input[required]')];
  const errors = inputs.map(setFieldError).filter(Boolean);
  const summary = form.querySelector('.rrf-error-summary');
  summary.hidden = errors.length === 0;
  if (errors.length) {
    summary.textContent = `Please check ${errors.length === 1 ? 'this field' : `${errors.length} fields`} before requesting your report.`;
    summary.focus();
    return false;
  }
  return true;
}

function createForm(siteKey) {
  const prefix = `report-request-${crypto.randomUUID().slice(0, 8)}`;
  const form = document.createElement('form');
  form.className = 'report-request-form-form';
  form.noValidate = true;

  const summary = document.createElement('p');
  summary.className = 'rrf-error-summary';
  summary.hidden = true;
  summary.tabIndex = -1;
  summary.setAttribute('role', 'alert');
  form.append(summary);

  const fields = document.createElement('div');
  fields.className = 'rrf-fields';
  fieldSpecs.forEach((spec) => fields.append(createField(spec, prefix)));
  form.append(fields);

  const honeypot = document.createElement('input');
  honeypot.name = 'websiteConfirm';
  honeypot.tabIndex = -1;
  honeypot.autocomplete = 'off';
  honeypot.setAttribute('aria-hidden', 'true');
  honeypot.className = 'rrf-honeypot';
  form.append(honeypot);

  const consent = document.createElement('label');
  consent.className = 'rrf-consent';
  consent.innerHTML = '<input type="checkbox" name="consent" required><span>I agree that Adobe may contact me about my requested report. See <a href="https://www.adobe.com/privacy/policy.html">Adobe Privacy</a>.</span><span class="rrf-consent-error"></span>';
  const consentInput = consent.querySelector('input');
  const consentError = consent.querySelector('.rrf-consent-error');
  consentError.id = `${prefix}-consent-error`;
  consentInput.setAttribute('aria-describedby', consentError.id);
  consentInput.dataset.label = 'contact consent';
  consentInput.addEventListener('change', () => setFieldError(consentInput));
  form.append(consent);

  const action = document.createElement('div');
  action.className = 'rrf-action';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Request my report';
  const status = document.createElement('p');
  status.className = 'rrf-submit-status';
  status.setAttribute('aria-live', 'polite');
  action.append(submit, status);
  form.append(action);

  const turnstile = createTurnstile(form, siteKey);
  const idempotencyKey = crypto.randomUUID();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validForm(form)) return;

    submit.disabled = true;
    submit.textContent = 'Sending request...';
    status.textContent = '';
    try {
      const turnstileToken = await turnstile.token();
      const response = await fetch(API_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(buildPayload(form, turnstileToken)),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'We could not send your request.');
      }
      successView(form);
    } catch (error) {
      turnstile.reset();
      submit.disabled = false;
      submit.textContent = 'Request my report';
      status.textContent = error.message || 'We could not send your request. Please try again.';
    }
  });

  return form;
}

function createDemos() {
  const section = document.createElement('section');
  section.className = 'rrf-demos';
  section.innerHTML = `
    <div class="rrf-demos-inner">
      <h2>Explore a report from your industry.</h2>
      <p>See what a Digital Opportunity Report looks like. These examples use demo brands, not your company's data.</p>
      <nav class="rrf-demo-links" aria-label="Industry example reports"></nav>
    </div>
  `;
  const links = section.querySelector('nav');
  BOOTH_DEMOS.forEach(({ id, label, path }) => {
    const link = document.createElement('a');
    link.href = path;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${label} example report (opens in a new tab)`);
    const icon = document.createElement('img');
    icon.src = `/img/booth/industry-${id}.svg`;
    icon.alt = '';
    icon.width = 24;
    icon.height = 24;
    icon.loading = 'lazy';
    const text = document.createElement('span');
    text.textContent = label;
    link.append(icon, text);
    links.append(link);
  });
  return section;
}

export default function init(el) {
  loadStyle('https://use.typekit.net/hah7vzn.css');
  loadStyle('https://use.typekit.net/pbq1nqa.css');
  const siteKey = metadataValue('turnstile-sitekey');
  const header = document.createElement('div');
  header.className = 'rrf-masthead';
  header.innerHTML = `
    <div class="rrf-masthead-inner">
      <a class="rrf-adobe" href="https://www.adobe.com/"><img src="/img/booth/adobe-wordmark.svg" alt="Adobe" width="106" height="26"></a>
      <span>Amplify your brand visibility</span>
      <a class="rrf-sign-in" href="/login?redirect=%2Frequest-report">Sign in</a>
    </div>
  `;
  const main = document.createElement('section');
  main.className = 'rrf-shell';
  main.innerHTML = `
    <div class="rrf-hero">
      <div class="rrf-hero-inner">
        <div class="rrf-hero-copy">
          <h1>See where your brand can grow.</h1>
          <p>A personalized Digital Opportunity Report for your website, with clear opportunities to act on.</p>
          <details class="rrf-coverage">
            <summary>Explore report coverage</summary>
            <ul class="rrf-topics" aria-label="Report coverage">
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4Z"/><path d="m9 10 2 2 4-5"/></svg><span>AI search visibility</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M7 12l2-3 2 2 2-3"/></svg><span>Search engine optimization</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18a9 9 0 1 1 16 0M5 10l2 1m10 0 2-1M12 5v2m0 9 5-7"/><circle cx="12" cy="16" r="1"/></svg><span>Website performance</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5Z"/><path d="M14 3v5h5M8 12h8m-8 4h5"/></svg><span>Adobe solution recommendations</span></li>
            </ul>
          </details>
        </div>
        <div class="rrf-art" aria-hidden="true"></div>
      </div>
    </div>
    <div class="rrf-content">
      <div class="rrf-intro">
        <h2>Request your Digital Opportunity Report.</h2>
        <p>Tell us a little about you and your website. Adobe Sales will prepare your report and follow up with you.</p>
      </div>
    </div>
  `;
  const coverage = main.querySelector('.rrf-coverage');
  const desktop = window.matchMedia('(min-width: 1000px)');
  const setCoverage = () => { coverage.open = desktop.matches; };
  setCoverage();
  desktop.addEventListener('change', setCoverage);
  const content = main.querySelector('.rrf-content');
  if (new URLSearchParams(window.location.search).get('reason') === 'unavailable') {
    const notice = document.createElement('aside');
    notice.className = 'rrf-recovery';
    notice.innerHTML = `
      <p class="rrf-recovery-title"><strong>We couldn't find a report available to your email address.</strong></p>
      <p>You can request one below, or <a href="/auth/logout">sign out and use another account</a>.</p>
    `;
    content.prepend(notice);
  }
  if (!siteKey) {
    const unavailable = document.createElement('p');
    unavailable.className = 'rrf-unavailable';
    unavailable.setAttribute('role', 'alert');
    unavailable.textContent = 'Report requests are not available right now. Please speak with an Adobe representative.';
    content.append(unavailable);
  } else {
    content.append(createForm(siteKey));
  }
  main.append(createDemos());
  el.replaceChildren(header, main);
}
