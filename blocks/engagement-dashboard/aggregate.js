/**
 * Shared read-side aggregation for the engagement dashboard POC backends
 * (Google Sheet CSV and localStorage). Both produce the SAME shapes the Worker
 * endpoint returns, so the dashboard UI is identical regardless of source:
 *   aggregateGlobal(events)      -> { total, data: [row], totals }
 *   aggregateDetail(events, path)-> { summary, data: [event], total }
 *
 * `events` is an array of plain objects with fields: timestamp (ISO string),
 * path, event, v, view_id, depth, duration_seconds, device, href.
 */

function summarize(path, events) {
  const visitors = new Set();
  const maxDepthByView = new Map();
  let totalViews = 0;
  let ctaClicks = 0;
  let totalDuration = 0;
  let durationCount = 0;
  let first = null;
  let last = null;

  events.forEach((ev) => {
    if (ev.v) visitors.add(ev.v);
    const ts = ev.timestamp || '';
    if (ts) {
      if (!first || ts < first) first = ts;
      if (!last || ts > last) last = ts;
    }
    if (ev.event === 'page_view') {
      totalViews += 1;
    } else if (ev.event === 'cta_click') {
      ctaClicks += 1;
    } else if (ev.event === 'scroll_depth') {
      const d = Number(ev.depth);
      if (Number.isFinite(d)) {
        const view = ev.view_id || 'anon';
        if (d > (maxDepthByView.get(view) || 0)) maxDepthByView.set(view, d);
      }
    } else if (ev.event === 'time_on_page') {
      const s = Number(ev.duration_seconds);
      if (Number.isFinite(s)) { totalDuration += s; durationCount += 1; }
    }
  });

  const maxes = [...maxDepthByView.values()];
  return {
    path,
    total_views: totalViews,
    unique_visitors: visitors.size,
    avg_scroll_depth: maxes.length
      ? Math.round(maxes.reduce((a, b) => a + b, 0) / maxes.length) : 0,
    cta_clicks: ctaClicks,
    avg_time_seconds: durationCount ? Math.round(totalDuration / durationCount) : 0,
    first_viewed: first || '',
    last_viewed: last || '',
    visitors,
  };
}

function groupByPath(events) {
  const byPath = new Map();
  events.forEach((ev) => {
    if (!ev.path) return;
    if (!byPath.has(ev.path)) byPath.set(ev.path, []);
    byPath.get(ev.path).push(ev);
  });
  return byPath;
}

export function aggregateGlobal(events) {
  const byPath = groupByPath(events);
  const summaries = [...byPath.entries()].map(([path, evs]) => summarize(path, evs));

  const globalVisitors = new Set();
  let globalViews = 0;
  let scrollAcc = 0;
  let scrollPages = 0;
  summaries.forEach((s) => {
    s.visitors.forEach((v) => globalVisitors.add(v));
    globalViews += s.total_views;
    if (s.avg_scroll_depth) { scrollAcc += s.avg_scroll_depth; scrollPages += 1; }
  });

  const data = summaries
    .sort((a, b) => (b.last_viewed || '').localeCompare(a.last_viewed || ''))
    .map(({ visitors, ...row }) => row);

  return {
    total: data.length,
    data,
    totals: {
      total_views: globalViews,
      unique_visitors: globalVisitors.size,
      avg_scroll_depth: scrollPages ? Math.round(scrollAcc / scrollPages) : 0,
    },
  };
}

export function aggregateDetail(events, path) {
  const forPath = events.filter((ev) => ev.path === path);
  const summary = summarize(path, forPath);
  delete summary.visitors;
  // newest first; ISO timestamps sort lexicographically as chronological.
  const sorted = [...forPath].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const data = sorted.slice(0, 200).map((ev) => ({
    timestamp: ev.timestamp,
    event: ev.event,
    auth_method: '',
    viewer_domain: '',
    viewer_email: ev.v || '',
    device: ev.device,
    depth: ev.depth,
    duration_seconds: ev.duration_seconds,
    href: ev.href,
  }));
  return { summary, data, total: forPath.length };
}
