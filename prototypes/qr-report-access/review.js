import initLogin from '../../blocks/portal-login/portal-login.js';
import initRequest from '../../blocks/report-request-form/report-request-form.js';
import initRecovery from '../../blocks/portal-recovery/portal-recovery.js';

const params = new URLSearchParams(window.location.search);
const screen = document.getElementById('screen');
const theme = document.getElementById('theme');
const preview = document.getElementById('preview');
let selected = params.get('screen') || 'login';
if (![...screen.options].some((option) => option.value === selected)) selected = 'login';
screen.value = selected;
theme.value = params.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.style.colorScheme = theme.value;

function navigate(next) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ screen: next, theme: theme.value });
  window.location.assign(url.href);
}

screen.addEventListener('change', () => navigate(screen.value));
theme.addEventListener('change', () => {
  document.documentElement.style.colorScheme = theme.value;
  const url = new URL(window.location.href);
  url.searchParams.set('theme', theme.value);
  window.history.replaceState(null, '', url);
});

const url = new URL(window.location.href);
if (selected === 'request') url.searchParams.set('reason', 'unavailable');
else if (selected === 'lookup-error') url.searchParams.set('reason', 'lookup-unavailable');
else if (selected === 'auth-error') url.searchParams.set('reason', 'authentication-failed');
else url.searchParams.delete('reason');
if (selected === 'staff') url.searchParams.set('staff', '');
else url.searchParams.delete('staff');
window.history.replaceState(null, '', url);

// Every application request is intercepted locally; this review never calls production APIs.
window.fetch = async (input) => {
  const path = new URL(input, window.location.href).pathname;
  if (path === '/auth/magiclink') {
    if (selected === 'email-error') return Response.json({ code: 'lookup_unavailable' }, { status: 503 });
    if (selected === 'send-error') return Response.json({ error: 'Delivery failed' }, { status: 502 });
    return Response.json({ result: selected === 'sent' ? 'sent' : 'not_found' });
  }
  if (path === '/api/report-requests') {
    return Response.json({ requestId: 'review-only', submittedAt: new Date().toISOString() }, { status: 201 });
  }
  throw new Error(`No review fixture for ${path}`);
};

let turnstileCallback;
window.turnstile = {
  render: (_holder, options) => { turnstileCallback = options.callback; return 'review-widget'; },
  execute: () => turnstileCallback('review-only-token'),
  reset: () => {},
};
const metadata = document.createElement('meta');
metadata.name = 'turnstile-sitekey';
metadata.content = 'review-only';
document.head.append(metadata);

const section = document.createElement('div');
section.className = 'section';
const wrapper = document.createElement('div');
wrapper.className = 'block-content';
section.append(wrapper);
preview.append(section);
const block = document.createElement('div');
wrapper.append(block);

if (selected === 'denied') {
  block.className = 'portal-recovery';
  initRecovery(block);
} else if (selected.startsWith('request')) {
  block.className = 'report-request-form';
  initRequest(block);
  if (selected === 'request-success') {
    const form = block.querySelector('form');
    form.elements.fullName.value = 'Jordan Lee';
    form.elements.email.value = 'jordan@example.com';
    form.elements.company.value = 'Example Company';
    form.elements.website.value = 'example.com';
    form.elements.consent.checked = true;
    form.requestSubmit();
  }
} else {
  const intro = document.createElement('div');
  intro.className = 'review-intro';
  intro.innerHTML = '<h1>Insights Portal Login</h1><p>Welcome to the Adobe Insights Portal. Log in with one of the two options to get your brand visibility report.</p>';
  section.prepend(intro);
  block.className = 'portal-login';
  block.innerHTML = `
    <div>
      <div>
        <h3>Adobe ID</h3>
        <p>If you already have an Adobe ID, you can use this one to log in to your brand report.</p>
        <p><strong><a href="/auth/portal">Login with Adobe ID</a></strong></p>
      </div>
      <div>
        <h3>One Time Login</h3>
        <p>If you don't have an Adobe ID, you can request a one-time login link with your corporate email address.</p>
      </div>
    </div>
  `;
  initLogin(block);
  if (['no-match', 'sent', 'email-error', 'send-error'].includes(selected)) {
    block.querySelector('#pl-email').value = 'jordan@example.com';
    block.querySelector('form').requestSubmit();
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  const target = new URL(link.href);
  if (target.origin !== window.location.origin) return;
  const destinations = {
    '/request-report': target.searchParams.has('reason') ? 'request' : 'request-plain',
    '/auth/portal': 'request',
    '/auth/logout': 'login',
  };
  if (destinations[target.pathname]) {
    event.preventDefault();
    navigate(destinations[target.pathname]);
  }
});
