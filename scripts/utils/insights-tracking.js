import getViewerIdentity, { viewerMetadata } from './viewer-identity.js';

const SCROLL_MILESTONES = [25, 50, 75, 100];

// Populated once /auth/me resolves; merged into every event so we can answer
// "which signed-in customer viewed this report?". Stays null (email omitted)
// for anonymous and link-borne sessions — see viewer-identity.js.
let identity = null;

function getSlug() {
  const badge = document.querySelector('.rh-insight-badge');
  if (badge?.href) {
    try {
      return new URL(badge.href).hostname.replace(/^www\./, '');
    } catch { /* fall through */ }
  }
  return 'unknown';
}

function track(event, metadata) {
  const enriched = { ...metadata, ...viewerMetadata(identity) };
  const debug = new URL(window.location.href).searchParams.has('debug-feedback');
  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[insights-tracking]', event, enriched);
  }
  if (typeof window.sa_event === 'function') {
    window.sa_event(event, enriched);
  }
}

function trackScrollDepth(slug) {
  const fired = new Set();
  let maxPct = 0;

  const onScroll = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    if (max <= 0) return;
    const pct = Math.min(100, Math.round((window.scrollY / max) * 100));
    if (pct > maxPct) maxPct = pct;

    SCROLL_MILESTONES.forEach((m) => {
      if (pct >= m && !fired.has(m)) {
        fired.add(m);
        track('insights_scroll_depth', { slug, path: window.location.pathname, milestone: m });
      }
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.insightsMaxScroll = () => maxPct;
}

function trackClicks(slug) {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    if (link.classList.contains('rd-cta-btn')) {
      track('insights_download_click', {
        slug,
        path: window.location.pathname,
        href: link.href,
      });
      return;
    }

    if (link.classList.contains('rav-cta-btn')) {
      track('insights_cta_click', {
        slug,
        path: window.location.pathname,
        href: link.href,
      });
    }
  });
}

function trackSectionVisibility(slug) {
  if (typeof IntersectionObserver === 'undefined') return;

  const seen = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const name = entry.target.dataset.trackSection;
      if (!name || seen.has(name)) return;
      seen.add(name);
      track('insights_section_view', { slug, path: window.location.pathname, section: name });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.4 });

  document.querySelectorAll('main .block').forEach((block) => {
    const name = [...block.classList].find((c) => c.startsWith('report-')) || block.classList[0];
    if (!name) return;
    block.dataset.trackSection = name;
    observer.observe(block);
  });
}

export default async function mount() {
  const slug = getSlug();
  // Resolve who's viewing before the pageview fires so a verified login is
  // attributed from the first event. Identity resolution never throws and is
  // capped so a slow/unreachable /auth/me can't hold up tracking indefinitely.
  identity = await Promise.race([
    getViewerIdentity(),
    new Promise((resolve) => { setTimeout(() => resolve(null), 2000); }),
  ]);
  track('insights_pageview', { slug, path: window.location.pathname });
  trackScrollDepth(slug);
  trackClicks(slug);
  trackSectionVisibility(slug);
}
