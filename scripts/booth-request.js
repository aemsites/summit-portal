import { boothRequest } from './booth-session.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STAFF_EMAIL = /@(?:[^@\s]+\.)?(?:adobe|semrush)\.com$/i;
const RETRY = 'We could not confirm your request yet. Your details are still here. Tap Request my report to try again; it will not be sent twice.';
const FIELDS = ['firstName', 'lastName', 'email', 'company', 'website'];

function fieldError(input) {
  const value = input.type === 'checkbox' ? input.checked : input.value.trim();
  if (input.name === 'consent') {
    return value ? '' : 'Please agree that Adobe may contact you about your requested report.';
  }
  if (!value) return `Please enter your ${input.labels[0].textContent.trim().toLowerCase()}.`;
  if (input.name === 'email' && !EMAIL.test(value)) return 'Enter a valid business email address.';
  if (input.name === 'email' && STAFF_EMAIL.test(value)) {
    return 'Adobe and Semrush employees should use the internal platform. This form is only for customer requests.';
  }
  if (input.name === 'website' && (!value.includes('.') || /\s/.test(value))) {
    return 'Enter a website such as company.com.';
  }
  return '';
}

function failureMessage(error) {
  if (error.status === 400 || error.status === 429) return error.message;
  if (error.status === 401 || error.status === 403) {
    return 'This booth needs the booth team to sign in again. Your details are still here.';
  }
  return RETRY;
}

/**
 * The embedded booth request form. One idempotency key covers every retry of
 * the same details, so an unconfirmed submission can be retried safely.
 */
export function mountBoothRequest(root, { onSubmitted, onSending = () => {}, track = () => {} }) {
  const form = root.getElementById('request-form');
  if (!form) return { clear() {} };
  const submit = root.getElementById('request-submit');
  const status = root.getElementById('request-status');
  const summary = root.getElementById('request-summary');
  const inputs = [...form.querySelectorAll('input')];
  let generation = 0;
  let submitting = false;
  let attempt = null;

  function show(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function mark(input, message) {
    input.setAttribute('aria-invalid', String(Boolean(message)));
    input.closest('.request-field, .request-consent')?.classList.toggle('is-invalid', Boolean(message));
    show(root.getElementById(`${input.id}-error`), message);
  }

  function complete() {
    return inputs.every((input) => (input.type === 'checkbox' ? input.checked : input.value.trim()));
  }

  function sync() {
    submit.disabled = submitting || !complete();
  }

  function payload() {
    const data = Object.fromEntries(FIELDS.map((name) => [name, form.elements[name].value.trim()]));
    return {
      fullName: `${data.firstName} ${data.lastName}`,
      email: data.email,
      company: data.company,
      website: data.website,
      consent: form.elements.consent.checked,
    };
  }

  function clear() {
    generation += 1;
    if (submitting) onSending(false);
    submitting = false;
    attempt = null;
    inputs.forEach((input) => {
      if (input.type === 'checkbox') input.checked = false;
      else input.value = '';
      input.readOnly = false;
      mark(input, '');
    });
    show(status, '');
    show(summary, '');
    submit.textContent = 'Request my report';
    sync();
  }

  inputs.forEach((input) => {
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') mark(input, fieldError(input));
      sync();
    });
    input.addEventListener('change', () => {
      if (input.type === 'checkbox') mark(input, '');
      sync();
    });
  });

  form.querySelectorAll('a[data-booth-external]').forEach((link) => link.addEventListener('click', (event) => {
    event.preventDefault();
    show(status, 'Read Adobe Privacy at adobe.com/privacy on your own device. '
      + 'Links stay closed on this shared screen.');
  }));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    const errors = inputs.map((input) => {
      const message = fieldError(input);
      mark(input, message);
      return message;
    }).filter(Boolean);
    if (errors.length) {
      show(summary, `Please check ${errors.length === 1 ? 'this field' : `${errors.length} fields`} before requesting your report.`);
      inputs.find((input) => input.getAttribute('aria-invalid') === 'true')?.focus();
      return;
    }
    show(summary, '');
    const body = payload();
    const snapshot = JSON.stringify(body);
    // Same details reuse the key so retries never duplicate; edited details are a new request.
    if (attempt?.snapshot !== snapshot) attempt = { snapshot, key: crypto.randomUUID() };
    const current = generation;
    submitting = true;
    onSending(true);
    inputs.forEach((input) => { input.readOnly = true; });
    submit.textContent = 'Sending request…';
    sync();
    show(status, '');
    root.activeElement?.blur();
    const operation = boothRequest('request', body, { headers: { 'Idempotency-Key': attempt.key } });
    track(operation);
    try {
      await operation;
      if (current !== generation) return;
      const { company, website } = body;
      clear();
      onSubmitted({ company, website });
    } catch (error) {
      if (current !== generation) return;
      submitting = false;
      onSending(false);
      inputs.forEach((input) => { input.readOnly = false; });
      submit.textContent = 'Request my report';
      sync();
      show(status, failureMessage(error));
      // eslint-disable-next-line no-console
      console.warn('[booth] Report request not confirmed.', { status: error.status, code: error.code });
    }
  });

  clear();
  return { clear };
}
