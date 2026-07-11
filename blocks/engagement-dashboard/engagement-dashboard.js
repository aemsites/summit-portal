import { ANALYTICS_MODE } from '../../scripts/utils/analytics-config.js';
import { loadGlobalPoc, loadDetailPoc } from './poc-datasource.js';
import { loadGlobalLocal, loadDetailLocal, clearLocal } from './local-datasource.js';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDate(iso);
}

function barClass(pct) {
  if (pct >= 75) return 'ed-bar-good';
  if (pct >= 40) return 'ed-bar-mid';
  return 'ed-bar-low';
}

function scrollBar(pct) {
  const capped = Math.min(100, Math.max(0, pct || 0));
  return `<span class="ed-bar ${barClass(capped)}" style="--pct:${capped}%" title="${capped}%"></span><span class="ed-bar-label">${capped}%</span>`;
}

// Prefer the server-computed totals: unique_visitors is de-duplicated across
// pages there, so a domain seen on two pages counts once. Summing the per-page
// column client-side would double-count it. Falls back to a client roll-up only
// if the endpoint predates the totals field.
function buildGlobals(data, totals) {
  const totalViews = totals?.total_views ?? data.reduce((s, r) => s + (r.total_views || 0), 0);
  const totalVisitors = totals?.unique_visitors
    ?? Math.max(0, ...data.map((r) => r.unique_visitors || 0));
  const avgScroll = totals?.avg_scroll_depth ?? (data.length
    ? Math.round(data.reduce((s, r) => s + (r.avg_scroll_depth || 0), 0) / data.length)
    : 0);
  const last = data.reduce((d, r) => {
    if (!r.last_viewed) return d;
    const t = new Date(r.last_viewed);
    return (!d || t > d) ? t : d;
  }, null);
  return { totalViews, totalVisitors, avgScroll, last };
}

function renderSummary(el, { totalViews, totalVisitors, avgScroll, last }) {
  const lastStr = last ? last.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  el.innerHTML = `
    <div class="ed-stat"><span class="ed-stat-value">${totalViews.toLocaleString()}</span><span class="ed-stat-label">Total Views</span></div>
    <div class="ed-stat"><span class="ed-stat-value">${totalVisitors.toLocaleString()}</span><span class="ed-stat-label">Visitor Domains</span></div>
    <div class="ed-stat"><span class="ed-stat-value">${avgScroll}%</span><span class="ed-stat-label">Avg Scroll</span></div>
    <div class="ed-stat"><span class="ed-stat-value">${lastStr}</span><span class="ed-stat-label">Last Activity</span></div>
  `;
}

function renderRows(data, tbody, onToggle) {
  if (!data.length) {
    tbody.innerHTML = '<tr class="ed-empty-row"><td colspan="7"><span>No engagement data recorded yet. Share a page with a customer to start tracking.</span></td></tr>';
    return;
  }
  tbody.innerHTML = data.map((row) => {
    const path = row.path || '';
    const escaped = CSS.escape(path);
    return `
      <tr class="ed-row" data-path="${path}">
        <td class="ed-cell-path"><span title="${path}">${path}</span></td>
        <td class="ed-cell-num">${(row.total_views || 0).toLocaleString()}</td>
        <td class="ed-cell-num">${(row.unique_visitors || 0).toLocaleString()}</td>
        <td class="ed-cell-scroll">${scrollBar(row.avg_scroll_depth)}</td>
        <td class="ed-cell-num">${(row.cta_clicks || 0).toLocaleString()}</td>
        <td class="ed-cell-date" title="${row.last_viewed || ''}">${formatRelative(row.last_viewed)}</td>
        <td class="ed-cell-action"><button class="ed-expand-btn" data-path="${path}" aria-expanded="false" aria-label="View events for ${path}">Details</button></td>
      </tr>
      <tr class="ed-detail-row" data-for="${escaped}" hidden>
        <td colspan="7"><div class="ed-detail-body" data-loaded=""></div></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.ed-expand-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggle(btn.dataset.path);
    });
  });
  tbody.querySelectorAll('.ed-row').forEach((tr) => {
    tr.addEventListener('click', () => onToggle(tr.dataset.path));
  });
}

async function loadDetail(path, detailRow) {
  const body = detailRow.querySelector('.ed-detail-body');
  if (body.dataset.loaded === 'done') return;

  body.innerHTML = '<span class="ed-loading">Loading events…</span>';

  try {
    let summary; let data; let total;
    if (ANALYTICS_MODE === 'local') {
      ({ summary, data, total } = await loadDetailLocal(path));
    } else if (ANALYTICS_MODE === 'sheet') {
      ({ summary, data, total } = await loadDetailPoc(path));
    } else {
      const resp = await fetch(`/auth/analytics?path=${encodeURIComponent(path)}`, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      ({ summary, data, total } = await resp.json());
    }

    if (!data?.length) {
      body.innerHTML = '<span class="ed-empty-msg">No events recorded for this page yet.</span>';
      body.dataset.loaded = 'done';
      return;
    }

    const avgPct = summary?.avg_scroll_depth || 0;
    const avgTime = summary?.avg_time_seconds || 0;

    const rows = data.map((ev) => {
      const ts = new Date(ev.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      let detail = '';
      if (ev.event === 'scroll_depth') detail = `${ev.depth ?? ''}%`;
      else if (ev.event === 'time_on_page') detail = ev.duration_seconds != null ? `${ev.duration_seconds}s` : '';
      else if (ev.event === 'cta_click') detail = ev.href || '';
      // event names use underscores (page_view); CSS class modifiers are kebab-case.
      const evClass = (ev.event || '').replace(/_/g, '-');
      return `<tr>
        <td>${ts}</td>
        <td class="ed-ev ed-ev-${evClass}">${(ev.event || '').replace(/_/g, ' ')}</td>
        <td>${ev.auth_method || '—'}</td>
        <td>${ev.viewer_domain || '—'}</td>
        <td>${ev.viewer_email || '—'}</td>
        <td>${ev.device || '—'}</td>
        <td class="ed-ev-detail">${detail}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `
      <div class="ed-detail-meta">
        <span>Avg scroll <strong>${avgPct}%</strong></span>
        <span>Avg time <strong>${avgTime}s</strong></span>
        <span>First viewed <strong>${formatDate(summary?.first_viewed || null)}</strong></span>
        <span>Showing ${data.length} of ${total} events (newest first)</span>
      </div>
      <div class="ed-event-scroll">
        <table class="ed-event-table">
          <thead><tr><th>Time</th><th>Event</th><th>Auth</th><th>Domain</th><th>Email</th><th>Device</th><th>Detail</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    body.dataset.loaded = 'done';
  } catch {
    body.innerHTML = '<span class="ed-error">Failed to load event details. Are you logged in as staff?</span>';
  }
}

export default async function init(el) {
  el.innerHTML = `
    <div class="ed-header">
      <h2 class="ed-title">Engagement Analytics</h2>
      <p class="ed-subtitle">100% capture — every interaction from customers who access pages via share or magic links</p>
    </div>
    <div class="ed-summary"></div>
    <div class="ed-toolbar">
      <input class="ed-search" type="search" placeholder="Filter by page path…" aria-label="Filter by page path">
      <span class="ed-count" aria-live="polite"></span>
    </div>
    <div class="ed-table-container">
      <table class="ed-table" role="grid">
        <thead>
          <tr>
            <th class="ed-th ed-th-sortable" data-col="path">Page</th>
            <th class="ed-th ed-th-sortable ed-th-num" data-col="total_views">Views</th>
            <th class="ed-th ed-th-sortable ed-th-num" data-col="unique_visitors">Domains</th>
            <th class="ed-th ed-th-sortable" data-col="avg_scroll_depth">Avg Scroll</th>
            <th class="ed-th ed-th-sortable ed-th-num" data-col="cta_clicks">CTA Clicks</th>
            <th class="ed-th ed-th-sortable" data-col="last_viewed">Last Viewed</th>
            <th class="ed-th"></th>
          </tr>
        </thead>
        <tbody class="ed-tbody"></tbody>
      </table>
    </div>
    <p class="ed-status" aria-live="polite"></p>
  `;

  const summaryEl = el.querySelector('.ed-summary');
  const tbody = el.querySelector('.ed-tbody');
  const searchInput = el.querySelector('.ed-search');
  const countEl = el.querySelector('.ed-count');
  const statusEl = el.querySelector('.ed-status');

  let allData = [];
  let sortCol = 'last_viewed';
  let sortAsc = false;
  const expanded = new Set();

  function filtered() {
    const q = searchInput.value.toLowerCase();
    return q ? allData.filter((r) => r.path.toLowerCase().includes(q)) : allData;
  }

  function sorted(data) {
    return [...data].sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      if (typeof av === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc
        ? String(av || '').localeCompare(String(bv || ''))
        : String(bv || '').localeCompare(String(av || ''));
    });
  }

  function toggle(path) {
    const btn = tbody.querySelector(`.ed-expand-btn[data-path="${CSS.escape(path)}"]`);
    const detailRow = tbody.querySelector(`.ed-detail-row[data-for="${CSS.escape(CSS.escape(path))}"]`);
    if (!detailRow) return;
    const open = !detailRow.hidden;
    if (open) {
      detailRow.hidden = true;
      btn?.setAttribute('aria-expanded', 'false');
      expanded.delete(path);
    } else {
      detailRow.hidden = false;
      btn?.setAttribute('aria-expanded', 'true');
      expanded.add(path);
      loadDetail(path, detailRow);
    }
  }

  function refresh() {
    const rows = sorted(filtered());
    countEl.textContent = `${rows.length} page${rows.length === 1 ? '' : 's'}`;
    renderRows(rows, tbody, toggle);
    // Re-open previously expanded rows after re-render
    expanded.forEach((p) => {
      const detailRow = tbody.querySelector(`.ed-detail-row[data-for="${CSS.escape(CSS.escape(p))}"]`);
      if (detailRow) {
        detailRow.hidden = false;
        const b = tbody.querySelector(`.ed-expand-btn[data-path="${CSS.escape(p)}"]`);
        if (b) b.setAttribute('aria-expanded', 'true');
      }
    });
  }

  // Sortable column headers
  el.querySelectorAll('.ed-th-sortable').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const { col } = th.dataset;
      sortAsc = sortCol === col ? !sortAsc : (col === 'path');
      sortCol = col;
      el.querySelectorAll('.ed-th-sortable').forEach((h) => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', sortAsc ? 'ascending' : 'descending');
      refresh();
    });
  });

  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 200);
  });

  // Initial data load
  statusEl.textContent = 'Loading engagement data…';
  try {
    let data; let totals;
    if (ANALYTICS_MODE === 'local') {
      ({ data, totals } = await loadGlobalLocal());
    } else if (ANALYTICS_MODE === 'sheet') {
      ({ data, totals } = await loadGlobalPoc());
    } else {
      const resp = await fetch('/auth/analytics', { credentials: 'same-origin' });
      if (resp.status === 403) {
        el.innerHTML = '<div class="ed-access-denied"><strong>Staff access required</strong><p>Sign in with an Adobe or Semrush account to view engagement analytics.</p></div>';
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      ({ data, totals } = await resp.json());
    }
    allData = data || [];
    statusEl.textContent = '';

    renderSummary(summaryEl, buildGlobals(allData, totals));
    refresh();

    // Set initial sort indicator on last_viewed column
    const lastViewedTh = el.querySelector('.ed-th[data-col="last_viewed"]');
    if (lastViewedTh) lastViewedTh.setAttribute('aria-sort', 'descending');

    // Local-mode only: a Clear button to wipe this device's captured events.
    if (ANALYTICS_MODE === 'local') {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'ed-clear-btn';
      clearBtn.textContent = 'Clear local data';
      clearBtn.addEventListener('click', async () => {
        clearLocal();
        const reloaded = await loadGlobalLocal();
        allData = reloaded.data || [];
        renderSummary(summaryEl, buildGlobals(allData, reloaded.totals));
        refresh();
      });
      el.querySelector('.ed-toolbar').append(clearBtn);
    }
  } catch (err) {
    statusEl.textContent = `Failed to load analytics data: ${err.message}`;
  }
}
