import { getMetadata } from '../../scripts/ak.js';

const API_PATH = '/api/report-requests';
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const fieldSpecs = [
  { id: 'full-name', key: 'fullName', label: 'Full name', autocomplete: 'name', required: true },
  {
    id: 'business-email', key: 'email', label: 'Business email', type: 'email', inputmode: 'email', autocomplete: 'email', required: true,
  },
  { id: 'company', key: 'company', label: 'Company', autocomplete: 'organization', required: true },
  {
    id: 'website', key: 'website', label: 'Website or domain', inputmode: 'url', autocomplete: 'url', required: true,
  },
];

const optionalFieldSpecs = [
  { id: 'role', key: 'jobTitle', label: 'Role or job title', autocomplete: 'organization-title' },
  { id: 'market', key: 'primaryMarket', label: 'Primary market', autocomplete: 'country-name' },
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
  if (input.name === 'consent' && validity.valueMissing) {
    return 'Please agree that Adobe may contact you about your requested report.';
  }
  if (validity.valueMissing) return `Please enter your ${input.dataset.label.toLowerCase()}.`;
  if (validity.typeMismatch) return 'Enter a valid business email address.';
  if (validity.patternMismatch) return 'Enter a website such as company.com.';
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
  wrapper.className = 'rrf-field';
  const label = document.createElement('label');
  const input = document.createElement('input');
  const error = document.createElement('span');
  input.id = `${prefix}-${spec.id}`;
  input.name = spec.key;
  input.type = spec.type || 'text';
  input.dataset.label = spec.label;
  input.autocomplete = spec.autocomplete;
  if (spec.inputmode) input.inputMode = spec.inputmode;
  if (spec.required) input.required = true;
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
  form.replaceWith(success);
  success.focus();
}

function buildPayload(form, turnstileToken) {
  const formData = new FormData(form);
  return {
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    company: formData.get('company'),
    website: formData.get('website'),
    jobTitle: formData.get('jobTitle'),
    primaryMarket: formData.get('primaryMarket'),
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

  const optional = document.createElement('details');
  optional.className = 'rrf-optional';
  optional.innerHTML = '<summary>Add optional details</summary>';
  const optionalFields = document.createElement('div');
  optionalFields.className = 'rrf-fields';
  optionalFieldSpecs.forEach((spec) => optionalFields.append(createField(spec, prefix)));
  optional.append(optionalFields);
  form.append(optional);

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

export default function init(el) {
  const siteKey = metadataValue('turnstile-sitekey');
  const main = document.createElement('section');
  main.className = 'rrf-shell';
  main.innerHTML = `
    <p class="rrf-kicker">Digital Opportunity Report</p>
    <h1>See where your digital experience can grow.</h1>
    <p class="rrf-intro">Request a report now. Adobe Sales will prepare it and follow up with you.</p>
  `;
  if (!siteKey) {
    const unavailable = document.createElement('p');
    unavailable.className = 'rrf-unavailable';
    unavailable.setAttribute('role', 'alert');
    unavailable.textContent = 'Report requests are not available right now. Please speak with an Adobe representative.';
    main.append(unavailable);
  } else {
    main.append(createForm(siteKey));
  }
  el.replaceChildren(main);
}
