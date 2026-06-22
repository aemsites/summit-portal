import { loadStyle } from '../ak.js';
import getViewerIdentity, { viewerMetadata } from './viewer-identity.js';

// Resolved viewer identity, merged into feedback events so a verified login's
// rating is attributable. Null (email omitted) for anonymous/link-borne views.
let identity = null;

const THUMB_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4.34-8.66A1.5 1.5 0 0 1 14 2a2 2 0 0 1 2 2v.12a4 4 0 0 1-1 1.76Z"/></svg>';
const THUMB_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17v12l-4.34 8.66A1.5 1.5 0 0 1 10 22a2 2 0 0 1-2-2v-.12a4 4 0 0 1 1-1.76Z"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

const DOWN_TAGS = [
  { key: 'not_my_business', label: "Doesn't match my business" },
  { key: 'too_generic', label: 'Too generic' },
  { key: 'already_knew', label: 'Already knew this' },
  { key: 'something_off', label: 'Something felt off' },
];

const SHOW_AFTER_MS = 12000;
const SCROLL_THRESHOLD = 0.2;
const AUTO_DISMISS_MS = 25000;

function getSlug() {
  const badge = document.querySelector('.rh-insight-badge');
  if (badge?.href) {
    try {
      return new URL(badge.href).hostname.replace(/^www\./, '');
    } catch { /* fall through */ }
  }
  return 'unknown';
}

function storageKey(slug) {
  return `insights-feedback:${slug}`;
}

function alreadyHandled(slug) {
  try {
    return sessionStorage.getItem(storageKey(slug)) !== null;
  } catch {
    return false;
  }
}

function markHandled(slug, state) {
  try {
    sessionStorage.setItem(storageKey(slug), state);
  } catch { /* ignore */ }
}

function track(event, metadata) {
  const debug = new URL(window.location.href).searchParams.has('debug-feedback');
  const enriched = {
    ...metadata,
    ...viewerMetadata(identity),
    max_scroll_pct: typeof window.insightsMaxScroll === 'function' ? window.insightsMaxScroll() : null,
  };
  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[insights-feedback]', event, enriched);
  }
  if (typeof window.sa_event === 'function') {
    window.sa_event(event, enriched);
  } else if (debug) {
    // eslint-disable-next-line no-console
    console.warn('[insights-feedback] sa_event not available — is Simple Analytics loaded?');
  }
}

function waitForTrigger() {
  return new Promise((resolve) => {
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      window.removeEventListener('scroll', onScroll, { passive: true });
      clearTimeout(timer);
      resolve();
    };
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if (max > 0 && window.scrollY / max >= SCROLL_THRESHOLD) fire();
    };
    const timer = setTimeout(fire, SHOW_AFTER_MS);
    window.addEventListener('scroll', onScroll, { passive: true });
  });
}

function buildCloseBtn(onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rf-close';
  btn.setAttribute('aria-label', 'Dismiss feedback prompt');
  btn.innerHTML = CLOSE_ICON;
  btn.addEventListener('click', onClick);
  return btn;
}

function render(block, slug) {
  const card = document.createElement('div');
  card.className = 'rf-card';

  const sparkle = document.createElement('span');
  sparkle.className = 'rf-sparkle';
  sparkle.setAttribute('aria-hidden', 'true');
  sparkle.textContent = '✨';

  const prompt = document.createElement('p');
  prompt.className = 'rf-prompt';
  prompt.innerHTML = 'Nailed it or missed the mark? <span class="rf-prompt-sub">Help us sharpen your next report.</span>';

  const buttons = document.createElement('div');
  buttons.className = 'rf-buttons';

  const dismissAnd = (fn) => () => {
    block.classList.add('is-dismissed');
    setTimeout(() => {
      block.remove();
      if (fn) fn();
    }, 250);
  };

  const autoDismissTimer = setTimeout(() => {
    track('insights_feedback_ignored', { slug, path: window.location.pathname });
    markHandled(slug, 'ignored');
    dismissAnd()();
  }, AUTO_DISMISS_MS);

  const close = buildCloseBtn(() => {
    clearTimeout(autoDismissTimer);
    track('insights_feedback_dismissed', { slug, path: window.location.pathname });
    markHandled(slug, 'dismissed');
    dismissAnd()();
  });

  const showDownFollowup = () => {
    clearTimeout(autoDismissTimer);
    block.classList.add('is-expanded');
    card.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'rf-header';

    const title = document.createElement('p');
    title.className = 'rf-prompt';
    title.textContent = 'Got it — what missed?';

    header.append(title, buildCloseBtn(() => {
      track('insights_feedback_tag_skipped', { slug, path: window.location.pathname });
      markHandled(slug, 'down_untagged');
      dismissAnd()();
    }));

    const tags = document.createElement('div');
    tags.className = 'rf-tags';
    DOWN_TAGS.forEach(({ key, label }) => {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'rf-tag';
      tag.textContent = label;
      tag.addEventListener('click', () => {
        track('insights_feedback_tag', { slug, path: window.location.pathname, tag: key });
        markHandled(slug, `down:${key}`);
        tags.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        tag.classList.add('rf-tag-selected');
        title.textContent = 'Thanks — noted.';
        setTimeout(() => dismissAnd()(), 1200);
      });
      tags.append(tag);
    });

    card.append(header, tags);
  };

  let submitted = false;

  [
    { key: 'up', svg: THUMB_UP, aria: 'Nailed it' },
    { key: 'down', svg: THUMB_DOWN, aria: 'Missed the mark' },
  ].forEach(({ key, svg, aria }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `rf-btn rf-btn-${key}`;
    btn.setAttribute('aria-label', aria);
    btn.innerHTML = svg;
    btn.addEventListener('click', () => {
      if (submitted) return;
      submitted = true;
      clearTimeout(autoDismissTimer);
      track(`insights_feedback_${key}`, { slug, path: window.location.pathname });

      buttons.querySelectorAll('button').forEach((b) => {
        b.disabled = true;
        if (b !== btn) b.classList.add('rf-btn-dimmed');
      });
      btn.classList.add('rf-btn-selected');
      block.classList.add('is-submitted');

      if (key === 'down') {
        setTimeout(showDownFollowup, 250);
      } else {
        markHandled(slug, 'up');
        prompt.innerHTML = '🎉 <span class="rf-prompt-sub">Glad it landed. Thank you!</span>';
        setTimeout(() => dismissAnd()(), 1800);
      }
    });
    buttons.append(btn);
  });

  card.append(sparkle, prompt, buttons, close);
  block.append(card);
}

export default async function mount() {
  const slug = getSlug();
  if (alreadyHandled(slug)) return;
  if (document.querySelector('.report-feedback')) return;

  // Resolve viewer identity up front (shared/cached with insights-tracking).
  // Never throws; the widget only appears after a 12s+ delay, so this is ready.
  getViewerIdentity().then((id) => { identity = id; });

  await waitForTrigger();
  if (alreadyHandled(slug)) return;

  loadStyle('/blocks/report-feedback/report-feedback.css');

  const block = document.createElement('div');
  block.className = 'report-feedback block';
  block.dataset.blockStatus = 'loaded';

  render(block, slug);
  document.body.append(block);
  document.body.classList.add('brand-chip-yield');

  // When the feedback block is removed (dismissed/submitted/auto), stop yielding
  // so the chip returns. dismissAnd() already calls block.remove().
  const observer = new MutationObserver(() => {
    if (!document.body.contains(block)) {
      document.body.classList.remove('brand-chip-yield');
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });

  requestAnimationFrame(() => block.classList.add('is-visible'));
}
