const contentTags = new Set(['DIV', 'SPAN', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'EM', 'SMALL', 'B', 'I', 'BR', 'A', 'PICTURE', 'IMG', 'UL', 'OL', 'LI']);

function contentURL(value, base) {
  if (!value) return null;
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (url.origin !== base.origin && url.protocol !== 'https:') return null;
  return url.href;
}

/** Copy authored content only, never scripts, event handlers, styles or report controls. */
function copyContent(node, base, doc) {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE || !contentTags.has(node.tagName)) return null;
  const copy = doc.createElement(node.tagName.toLowerCase());
  if (node.tagName === 'A') {
    const href = contentURL(node.getAttribute('href'), base);
    if (href) copy.setAttribute('href', href);
  }
  if (node.tagName === 'IMG') {
    const src = contentURL(node.getAttribute('src'), base);
    if (!src) return null;
    copy.setAttribute('src', src);
    copy.setAttribute('alt', node.getAttribute('alt') || '');
    copy.setAttribute('referrerpolicy', 'no-referrer');
    copy.setAttribute('decoding', 'async');
  }
  node.childNodes.forEach((child) => {
    const cleaned = copyContent(child, base, doc);
    if (cleaned) copy.append(cleaned);
  });
  return copy;
}

function previewCard(name, section, children, doc) {
  const card = doc.createElement('div');
  card.className = 'preview-card';
  card.dataset.section = section;
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', name);
  const surface = doc.createElement('div');
  surface.className = 'preview-surface';
  surface.inert = true;
  surface.append(...children);
  card.append(surface);
  return card;
}

function unavailable(section, doc) {
  const message = doc.createElement('p');
  message.className = 'preview-message';
  message.textContent = `${section} is unavailable in this preview.`;
  return message;
}

export function mountPreviewCarousel(montage) {
  const cards = [...montage.querySelectorAll('.preview-card')];
  const announcement = montage.querySelector('.preview-announcement');
  let center = 1;
  let gesture;
  let swiped = false;
  function select(index) {
    center = (index + cards.length) % cards.length;
    cards.forEach((card, i) => {
      const offset = (i - center + cards.length) % cards.length;
      card.dataset.position = ['center', 'right', 'left'][offset];
    });
    announcement.textContent = `${cards[center].getAttribute('aria-label')} in the center. Swipe horizontally, tap a side preview, or use the left and right arrow keys to change sections.`;
  }
  montage.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') select(0);
    else if (event.key === 'End') select(cards.length - 1);
    else select(center + (event.key === 'ArrowRight' ? 1 : -1));
  });
  montage.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    swiped = false;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, card: event.target.closest('.preview-card') };
    montage.setPointerCapture(event.pointerId);
  });
  montage.addEventListener('pointerup', (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const { card } = gesture;
    gesture = null;
    if (Math.hypot(dx, dy) < 10 && card) {
      select(cards.indexOf(card));
      swiped = true;
      return;
    }
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
    swiped = true;
    select(center + (dx < 0 ? 1 : -1));
  });
  montage.addEventListener('pointercancel', () => { gesture = null; });
  montage.addEventListener('lostpointercapture', () => { gesture = null; });
  montage.addEventListener('click', (event) => {
    if (swiped) {
      swiped = false;
      return;
    }
    const card = event.target.closest('.preview-card');
    if (card) select(cards.indexOf(card));
  });
  select(center);
}

function loadRenderers() {
  return Promise.all([
    import('../blocks/report-hero/report-hero.js?v=booth-preview-6'),
    import('../blocks/report-stats/report-stats.js?v=booth-preview-6'),
    import('../blocks/report-carousel/report-carousel.js?v=booth-preview-6'),
    import('../blocks/report-ai-visibility/rav-core.js?v=booth-preview-bars-1'),
  ]);
}

export async function renderBoothPreview(html, path, doc = document) {
  const base = new URL(path, window.location.origin);
  const source = new DOMParser().parseFromString(html, 'text/html');
  const authoredHero = source.querySelector('main .report-hero.insight');
  if (!authoredHero?.querySelector(':scope > div > div :is(h1, h2)')) {
    throw new Error('This report does not contain a supported preview hero.');
  }
  const [
    { buildInsightHero }, { buildDarkStats }, { buildBriefingPreview }, { buildVisibilityPreview },
  ] = await loadRenderers();
  const hero = copyContent(authoredHero, base, doc);
  hero.className = 'report-hero insight';
  if (authoredHero.dataset.lede) {
    const lede = source.createElement('div');
    lede.innerHTML = authoredHero.dataset.lede;
    hero.dataset.lede = copyContent(lede, base, doc).innerHTML;
  }
  if (authoredHero.dataset.date) hero.dataset.date = authoredHero.dataset.date;
  buildInsightHero(hero, [...hero.children]);
  hero.querySelector('.rh-insight-bg-svg')?.remove();
  const heading = hero.querySelector('.rh-insight-text :is(h1, h2)');
  const title = doc.createElement('h3');
  title.textContent = heading.textContent;
  heading.replaceWith(title);
  hero.querySelectorAll('a').forEach((anchor) => {
    const badge = doc.createElement('span');
    badge.className = anchor.className;
    badge.append(...anchor.childNodes);
    anchor.replaceWith(badge);
  });

  const stats = doc.createElement('div');
  stats.className = 'report-stats dark';
  const authoredStats = source.querySelector('main .report-stats.dark');
  const rows = authoredStats ? [...authoredStats.children].filter(
    (row) => row.tagName === 'DIV' && row.children.length >= 2
      && !row.matches('.report-callout, .rpt-widget-footer, .rav-panels-outer'),
  ) : [];
  if (rows.length) {
    const cleanRows = rows.map((row) => {
      const cleaned = doc.createElement('div');
      [...row.children].forEach((cell) => {
        const value = doc.createElement('div');
        value.textContent = cell.textContent.trim();
        cleaned.append(value);
      });
      return cleaned;
    });
    buildDarkStats(stats, cleanRows, { interactive: false, animate: false });
  } else {
    const message = doc.createElement('p');
    message.className = 'preview-message';
    message.textContent = 'Report metrics are unavailable in this preview.';
    stats.append(message);
  }
  const authoredVisibility = source.querySelector('main .report-ai-visibility');
  const visibility = authoredVisibility ? copyContent(authoredVisibility, base, doc) : doc.createElement('div');
  visibility.className = 'report-ai-visibility';
  if (!buildVisibilityPreview(visibility)) visibility.replaceChildren(unavailable('LLM visibility', doc));

  const authoredBriefing = source.querySelector('main .report-carousel');
  const briefing = authoredBriefing ? copyContent(authoredBriefing, base, doc) : doc.createElement('div');
  briefing.className = 'report-carousel';
  if (!buildBriefingPreview(briefing)) briefing.replaceChildren(unavailable('Your briefing', doc));
  const briefingTitle = doc.createElement('h3');
  briefingTitle.className = 'preview-section-title';
  briefingTitle.textContent = 'Your briefing';
  briefing.prepend(briefingTitle);
  [visibility, briefing].forEach((block) => {
    block.querySelectorAll('a').forEach((anchor) => {
      const text = doc.createElement('span');
      text.append(...anchor.childNodes);
      anchor.replaceWith(text);
    });
  });

  const montage = doc.createElement('div');
  montage.className = 'preview-montage';
  montage.tabIndex = 0;
  montage.setAttribute('role', 'group');
  montage.setAttribute('aria-roledescription', 'carousel');
  montage.setAttribute('aria-label', 'Three sections of your selected report');
  const announcement = doc.createElement('p');
  announcement.className = 'preview-announcement';
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  montage.append(
    previewCard('LLM visibility', 'visibility', [visibility], doc),
    previewCard('Report overview and summary metrics', 'overview', [hero, stats], doc),
    previewCard('Your briefing', 'briefing', [briefing], doc),
    announcement,
  );
  mountPreviewCarousel(montage);
  return [montage];
}

export function createBoothPreview(target, retry) {
  let request;
  let revision = 0;
  let context;

  function message(text) {
    const paragraph = target.ownerDocument.createElement('p');
    paragraph.className = 'preview-message';
    paragraph.setAttribute('role', 'status');
    paragraph.textContent = text;
    target.replaceChildren(paragraph);
  }

  function clear() {
    revision += 1;
    request?.abort();
    request = null;
    context = null;
    target.replaceChildren();
    target.setAttribute('aria-busy', 'false');
    if (retry) retry.hidden = true;
  }

  async function load(result) {
    clear();
    const current = revision;
    request = new AbortController();
    const { signal } = request;
    const path = result.selectedPath;
    context = result;
    target.setAttribute('aria-busy', 'true');
    const doc = target.ownerDocument;
    const loading = doc.createElement('div');
    loading.className = 'booth-loading';
    loading.setAttribute('role', 'status');
    const ring = doc.createElement('span');
    ring.className = 'booth-loading-ring';
    ring.setAttribute('aria-hidden', 'true');
    const title = doc.createElement('p');
    title.className = 'booth-loading-title';
    title.textContent = 'Loading your report preview...';
    loading.append(ring, title);
    target.replaceChildren(loading);
    try {
      const url = new URL(path, window.location.origin);
      if (result.state !== 'report' || !Number.isFinite(result.expiresAt)
        || result.expiresAt <= Date.now() || !path?.startsWith('/accounts/')
        || url.origin !== window.location.origin || url.pathname !== path) {
        throw new Error('A current selected report is required for the preview.');
      }
      const [html] = await Promise.all([
        (async () => {
          const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal });
          if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) {
            throw new Error('The selected report preview could not be loaded.');
          }
          return response.text();
        })(),
        loadRenderers(),
      ]);
      if (current !== revision || signal.aborted) return;
      const blocks = await renderBoothPreview(html, path, target.ownerDocument);
      if (current !== revision || signal.aborted) return;
      if (result.expiresAt <= Date.now()) {
        clear();
        message('Report preview expired. Clear this screen to start again.');
        return;
      }
      target.replaceChildren(...blocks);
    } catch (error) {
      if (current !== revision || signal.aborted) return;
      message('Report preview unavailable. You can still email your report.');
      if (retry) retry.hidden = false;
      // eslint-disable-next-line no-console
      console.warn('[booth] Report preview unavailable:', error.message);
    } finally {
      if (current === revision) target.setAttribute('aria-busy', 'false');
    }
  }

  retry?.addEventListener('click', () => { if (context) load(context); });
  return { load, clear };
}
