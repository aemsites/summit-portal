/**
 * Shared engagement-capture core, used by every tracking backend
 * (Worker, Google Sheet POC, localStorage POC).
 *
 * A backend calls startCapture({ sink, viewer }): `sink(event)` receives each
 * event (page_view / scroll_depth / cta_click / time_on_page) and does whatever
 * transport it wants (POST, sendBeacon, localStorage append). The capture logic
 * — scroll milestones, generic block-aware click tracking, time-on-page — lives
 * here once so the backends can't drift.
 */

const SCROLL_MILESTONES = [25, 50, 75, 100];

/** Random id for this page load so a visit's events can be grouped server-side. */
export function makeViewId() {
  const raw = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return raw.slice(0, 64);
}

/** The ?v= attribution marker staff add when sharing a link (or null). */
export function getAttribution() {
  try {
    const v = new URL(window.location.href).searchParams.get('v');
    return v ? v.slice(0, 128) : null;
  } catch {
    return null;
  }
}

/** Nearest block name for an element, so a click is attributed to a block. */
function blockOf(el) {
  const block = el.closest('.block-content > div[class], [class*="-wrapper"], main > div > div[class]');
  if (!block) return '';
  const name = [...block.classList].find((c) => !c.endsWith('-wrapper') && c !== 'block-content');
  return name || block.classList[0] || '';
}

/**
 * Start capturing engagement on the current page.
 * @param {object} opts
 * @param {(event: object) => void} opts.sink   receives each event
 * @param {string|null} opts.viewer             attribution value (?v=), or a mode default
 */
export function startCapture({ sink, viewer }) {
  const viewId = makeViewId();
  const base = () => ({
    path: window.location.pathname,
    v: viewer,
    view_id: viewId,
    device: window.innerWidth < 1000 ? 'mobile' : 'desktop',
  });

  // Page view — fire immediately.
  sink({ event: 'page_view', referrer: document.referrer || '', ...base() });

  // Scroll depth — 25/50/75/100 milestones, once each.
  const fired = new Set();
  window.addEventListener('scroll', () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    if (max <= 0) return;
    const pct = Math.min(100, Math.round((window.scrollY / max) * 100));
    SCROLL_MILESTONES.forEach((m) => {
      if (pct >= m && !fired.has(m)) {
        fired.add(m);
        sink({ event: 'scroll_depth', depth: m, ...base() });
      }
    });
  }, { passive: true });

  // Generic, block-aware interaction capture — any link/button, so a file-card
  // PDF download or an account-page CTA is tracked without hardcoding classes.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('a[href], button');
    if (!el) return;
    const isLink = el.tagName === 'A';
    const href = isLink ? el.getAttribute('href') || '' : '';
    const download = isLink
      && (el.hasAttribute('download') || /\.(pdf|zip|docx?|pptx?|xlsx?|csv)(\?|$)/i.test(href));
    sink({
      event: 'cta_click',
      href: href.slice(0, 512),
      text: (el.textContent || '').trim().slice(0, 120),
      block: blockOf(el),
      download: download || undefined,
      ...base(),
    });
  });

  // Time on page — on pagehide (survives navigation + tab close).
  const start = Date.now();
  window.addEventListener('pagehide', () => {
    const duration = Math.round((Date.now() - start) / 1000);
    sink({ event: 'time_on_page', duration_seconds: duration, ...base() });
  });
}
