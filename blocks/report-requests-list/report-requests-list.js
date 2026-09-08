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
    detailsRow('Role', request.job_title),
    detailsRow('Market', request.primary_market),
  );
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
  const shell = document.createElement('section');
  shell.className = 'rrl-shell';
  shell.innerHTML = `
    <p class="rrl-kicker">Adobe internal</p>
    <div class="rrl-title-row"><h1>Report requests</h1></div>
    <div class="rrl-controls">
      <label><span class="visually-hidden">Search report requests</span><input type="search" placeholder="Search name, company, or website"></label>
      <a class="rrl-export" href="/api/report-requests.csv">Export CSV</a>
    </div>
  `;

  const results = document.createElement('div');
  results.className = 'rrl-results';
  results.setAttribute('aria-live', 'polite');
  shell.append(results);
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
