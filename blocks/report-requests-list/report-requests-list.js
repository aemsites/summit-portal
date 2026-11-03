const API_PATH = '/api/report-requests';

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function detailsRow(label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value || '—';
  row.append(term, description);
  return row;
}

function requestRow(request) {
  const row = document.createElement('article');
  row.className = 'rrl-row';
  const top = document.createElement('div');
  top.className = 'rrl-contact';
  const name = document.createElement('h3');
  const email = document.createElement('p');
  const submitted = document.createElement('time');
  name.textContent = request.full_name;
  email.textContent = request.email;
  submitted.dateTime = request.submitted_at;
  submitted.textContent = formatDate(request.submitted_at);
  top.append(name, email, submitted);

  const details = document.createElement('dl');
  details.append(
    detailsRow('Company', request.company),
    detailsRow('Website', request.website),
    detailsRow('Request source', request.request_source),
  );
  if (request.job_title) details.append(detailsRow('Role', request.job_title));
  if (request.primary_market) details.append(detailsRow('Market', request.primary_market));
  row.append(top, details);
  return row;
}

function setMessage(root, className, message, retry) {
  root.replaceChildren();
  const state = document.createElement('section');
  state.className = `rrl-state ${className}`;
  const text = document.createElement('p');
  text.textContent = message;
  state.append(text);
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Try again';
    button.addEventListener('click', retry);
    state.append(button);
  }
  root.append(state);
}

function buildUrl(query, cursor) {
  const url = new URL(API_PATH, window.location.origin);
  if (query) url.searchParams.set('q', query);
  if (cursor) url.searchParams.set('cursor', cursor);
  return `${url.pathname}${url.search}`;
}

export default function init(el) {
  el.classList.add('dashboard-page');
  const shell = document.createElement('section');
  shell.className = 'rrl-shell dashboard-shell';
  shell.innerHTML = `
    <a class="rrl-back" href="/adobe/dashboard">← Back to dashboard</a>
    <div class="dashboard-heading">
      <div>
        <h1>Report requests</h1>
        <p class="dashboard-intro">Review customer requests, request a report, then share it from the dashboard.</p>
      </div>
      <nav class="rrl-request-actions dashboard-request-more" aria-label="Request reports in Digital Insights Hub">
        <span>Generate reports in Digital Insights Hub</span>
        <div>
          <a href="https://digital-insights.corp.adobe.com/request-report">Request one report</a>
          <a class="rrl-bulk" href="https://digital-insights.corp.adobe.com/insights-campaigns">Request in bulk</a>
        </div>
      </nav>
    </div>
    <a class="dashboard-jump" href="#rrl-guidance">How to send reports to customers</a>
    <div class="rrl-layout">
      <section class="rrl-list" aria-labelledby="rrl-list-title">
        <h2 id="rrl-list-title">Customer requests</h2>
        <div class="rrl-controls">
          <label><span>Search report requests</span><input type="search" placeholder="Name, company, website, or source"></label>
          <a class="rrl-export" href="/api/report-requests.csv">Export CSV</a>
        </div>
      </section>
      <aside id="rrl-guidance" class="dashboard-resources" aria-labelledby="rrl-guidance-title" tabindex="-1">
        <h2 id="rrl-guidance-title">Resources &amp; guidance</h2>
        <section class="dashboard-resource-card">
          <h3>Send a report to a customer</h3>
          <ol class="rrl-steps">
            <li>Request one report or a bulk campaign in Digital Insights Hub using the buttons above.</li>
            <li>Once the report is available in the dashboard, find the company and choose <strong>Share</strong>. Select the report format if prompted.</li>
            <li>Enter the customer's email and choose <strong>Send link</strong>, or use <strong>Copy link</strong> to share it yourself.</li>
          </ol>
          <p class="dashboard-resource-copy">Magic links work for one month, with no customer sign-in. This list does not generate or send reports.</p>
          <div class="dashboard-resource-actions">
            <a href="/adobe/dashboard?tab=insights">Find and share a report</a>
          </div>
        </section>
        <section class="dashboard-resource-card">
          <h3>Collect a customer request</h3>
          <p class="dashboard-resource-copy">Customers can use the public form without signing in. Their requests appear here for Adobe staff to follow up.</p>
          <div class="dashboard-resource-actions">
            <a href="/request-report">Open public request form</a>
          </div>
        </section>
      </aside>
    </div>
  `;

  const results = document.createElement('div');
  results.className = 'rrl-results';
  results.setAttribute('aria-live', 'polite');
  shell.querySelector('.rrl-list').append(results);
  el.replaceChildren(shell);

  const search = shell.querySelector('input');
  const exportLink = shell.querySelector('.rrl-export');
  let cursor = null;
  let query = '';

  const updateExport = () => {
    const url = new URL('/api/report-requests.csv', window.location.origin);
    if (query) url.searchParams.set('q', query);
    exportLink.href = `${url.pathname}${url.search}`;
  };

  const load = async (append = false) => {
    if (!append) setMessage(results, 'is-loading', 'Loading report requests...');
    try {
      const response = await fetch(buildUrl(query, append ? cursor : null), { headers: { Accept: 'application/json' } });
      if (response.status === 401) {
        setMessage(results, 'is-error', 'Sign in with Adobe ID to view report requests.', () => {
          window.location.assign(`/auth/portal?redirect=${encodeURIComponent(window.location.pathname)}`);
        });
        return;
      }
      if (response.status === 403) {
        setMessage(results, 'is-error', 'This area is available to Adobe employees signed in with Adobe ID.');
        return;
      }
      if (!response.ok) throw new Error('Requests could not be loaded.');
      const body = await response.json();
      cursor = body.nextCursor;
      const rows = append ? [...results.querySelectorAll('.rrl-row')] : [];
      if (!body.requests.length && !rows.length) {
        setMessage(results, 'is-empty', query
          ? `No report requests match “${query}”.`
          : 'No report requests yet. New customer requests will appear here.');
        return;
      }

      if (!append) results.replaceChildren();
      results.querySelector('.rrl-more')?.remove();
      body.requests.forEach((request) => results.append(requestRow(request)));
      if (cursor) {
        const more = document.createElement('button');
        more.className = 'rrl-more';
        more.type = 'button';
        more.textContent = 'Load more requests';
        more.addEventListener('click', () => load(true));
        results.append(more);
      }
    } catch {
      setMessage(results, 'is-error', 'We could not load report requests. Please try again.', () => load());
    }
  };

  let searchTimeout;
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => {
      query = search.value.trim();
      cursor = null;
      updateExport();
      load();
    }, 250);
  });

  load();
}
