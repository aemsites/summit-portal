const SCROLL_MILESTONES = [25, 50, 75, 100];

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
  const debug = new URL(window.location.href).searchParams.has('debug-feedback');
  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[insights-tracking]', event, metadata);
  }
  if (typeof window.sa_event === 'function') {
    window.sa_event(event, metadata);
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

export default function mount() {
  const slug = getSlug();
  track('insights_pageview', { slug, path: window.location.pathname });
  trackScrollDepth(slug);
  trackClicks(slug);
  trackSectionVisibility(slug);
}
