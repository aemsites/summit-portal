/**
 * Engagement tracking for pages accessed via share links or magic links.
 *
 * Unlike Simple Analytics (which samples), this pipeline captures 100% of
 * interactions by posting directly to /auth/analytics on the Cloudflare Worker,
 * which stores every event in KV. It is a no-op for Adobe/Semrush staff sessions
 * and for anonymous visitors — only link-borne customer sessions are tracked.
 */

import getViewerIdentity from './viewer-identity.js';

const LINK_BORNE = new Set(['sharelink', 'magiclink']);
const SCROLL_MILESTONES = [25, 50, 75, 100];

let identity = null;

async function resolveIdentity() {
  if (identity) return identity;
  identity = await Promise.race([
    getViewerIdentity(),
    new Promise((resolve) => { setTimeout(() => resolve(null), 2000); }),
  ]);
  return identity;
}

function isTrackedSession(id) {
  return id && LINK_BORNE.has(id.method);
}

/**
 * Post a tracking event to /auth/analytics.
 * Uses keepalive so the request survives page navigation/unload.
 * This is a fire-and-forget call — never throws or blocks the caller.
 */
function postEvent(payload) {
  fetch('/auth/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => {});
}

// A random id for this page load, sent with every event so the server can
// group a visit's events — e.g. average the FURTHEST scroll depth per view
// rather than every cumulative milestone.
const viewId = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64);

function buildBase(id) {
  return {
    path: window.location.pathname,
    auth_method: id.method,
    device: window.innerWidth < 1000 ? 'mobile' : 'desktop',
    view_id: viewId,
  };
}

function trackScrollDepth(id) {
  const fired = new Set();
  const onScroll = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    if (max <= 0) return;
    const pct = Math.min(100, Math.round((window.scrollY / max) * 100));
    SCROLL_MILESTONES.forEach((m) => {
      if (pct >= m && !fired.has(m)) {
        fired.add(m);
        postEvent({ event: 'scroll_depth', depth: m, ...buildBase(id) });
      }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

function trackCtaClicks(id) {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const isCta = href.startsWith('mailto:')
      || href.endsWith('.pdf')
      || link.classList.contains('rd-cta-btn')
      || link.classList.contains('rav-cta-btn')
      || link.classList.contains('rcl-cta');
    if (isCta) postEvent({ event: 'cta_click', href, ...buildBase(id) });
  });
}

function trackTimeOnPage(id) {
  const startTime = Date.now();
  // pagehide fires on both tab close and navigation — more reliable than beforeunload
  window.addEventListener('pagehide', () => {
    const duration = Math.round((Date.now() - startTime) / 1000);
    postEvent({ event: 'time_on_page', duration_seconds: duration, ...buildBase(id) });
  });
}

export default async function mount() {
  const id = await resolveIdentity();
  if (!isTrackedSession(id)) return;

  // Page view — fire first after identity resolves
  postEvent({ event: 'page_view', referrer: document.referrer || '', ...buildBase(id) });

  trackScrollDepth(id);
  trackCtaClicks(id);
  trackTimeOnPage(id);
}
