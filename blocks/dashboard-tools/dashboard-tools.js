const EXPORTS = [
  ['', 'All booth activity'],
  ['search', 'Emails that searched'],
  ['no_report', 'Searches with no report'],
  ['report_selected', 'Reports selected'],
  ['report_viewed', 'Reports opened'],
  ['report_sent', 'Report emails sent'],
  ['demo_selected', 'Industry demos selected'],
  ['demo_viewed', 'Industry demos opened'],
  ['contact_requested', 'Historical contact opt-ins'],
];

export default function init(el) {
  if (el.querySelector('.dt-usage')) return;
  el.innerHTML = `
    <details class="dt-usage">
      <summary>Booth usage export <span class="dt-summary-meta">CSV / 90-day history</span></summary>
      <p class="dt-description">Download business emails and recorded actions from the booth touchscreen experience.</p>
      <p class="dt-description"><a href="/booth" aria-describedby="booth-experience-warning">View the booth experience</a>. <span id="booth-experience-warning">Booth access is separate from portal access. On shared event devices, use a dedicated browser profile without a portal sign-in.</span></p>
      <form class="dt-export">
        <label for="booth-activity-kind">Activity to include</label>
        <div class="dt-export-controls">
          <select id="booth-activity-kind" name="kind"></select>
          <button class="dt-download" type="submit">Download CSV</button>
        </div>
        <p class="dt-retention">Portal records are deleted after 90 days. Downloaded copies are your responsibility.</p>
        <p class="dt-export-status" role="status"></p>
      </form>
      <div class="dt-guidance">
        <p>Each row is an action, not a unique person. Use Email and Visit to correlate activity. Searches include unsuccessful lookups; report opens do not prove reading, and report emails sent mean mail-service acceptance, not confirmed delivery.</p>
        <p>Booth activity is not sales-contact consent. Only historical contact opt-ins record that separate action. Handle downloaded emails according to Adobe policy.</p>
      </div>
    </details>
  `;

  const form = el.querySelector('.dt-export');
  const select = form.querySelector('select');
  EXPORTS.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
  const download = form.querySelector('.dt-download');
  const status = form.querySelector('.dt-export-status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (download.disabled) return;
    const kind = select.value;
    const url = new URL('/api/booth-activity.csv', window.location.origin);
    if (kind) url.searchParams.set('kind', kind);
    download.disabled = true;
    select.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Preparing CSV...';
    try {
      const response = await fetch(`${url.pathname}${url.search}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'text/csv' },
        signal: AbortSignal.timeout(60000),
      });
      if (response.status === 401) {
        status.textContent = 'Your session has expired. ';
        const login = document.createElement('a');
        login.href = '/auth/portal?redirect=%2Fadobe%2Fdashboard';
        login.textContent = 'Sign in with Adobe ID to download.';
        status.append(login);
        return;
      }
      if (response.status === 403) {
        status.textContent = 'Downloads require an Adobe employee signed in with Adobe ID, not a booth or shared-link login.';
        return;
      }
      if (!response.ok || !/^text\/csv(?:;|$)/i.test(response.headers.get('Content-Type') || '')) {
        throw new Error('CSV unavailable');
      }
      // Wait for the complete stream so a database failure cannot download a partial CSV.
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `booth-activity${kind ? `-${kind}` : ''}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      status.textContent = 'CSV ready. Rows represent actions, not unique people.';
    } catch {
      status.textContent = 'Could not download the complete CSV. Please try again.';
    } finally {
      download.disabled = false;
      select.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}
