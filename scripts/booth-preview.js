const contentTags = new Set(['DIV', 'SPAN', 'P', 'H1', 'H2', 'STRONG', 'EM', 'B', 'I', 'BR', 'A', 'PICTURE', 'IMG']);

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

export async function renderBoothPreview(html, path, doc = document) {
  const base = new URL(path, window.location.origin);
  const source = new DOMParser().parseFromString(html, 'text/html');
  const authoredHero = source.querySelector('main .report-hero.insight');
  if (!authoredHero?.querySelector(':scope > div > div :is(h1, h2)')) {
    throw new Error('This report does not contain a supported preview hero.');
  }
  const [{ buildInsightHero }, { buildDarkStats }] = await Promise.all([
    import('../blocks/report-hero/report-hero.js?v=booth-preview-1'),
    import('../blocks/report-stats/report-stats.js?v=booth-preview-1'),
  ]);
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
  return [hero, stats];
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
    message('Loading your report preview...');
    try {
      const url = new URL(path, window.location.origin);
      if (result.state !== 'report' || !Number.isFinite(result.expiresAt)
        || result.expiresAt <= Date.now() || !path?.startsWith('/accounts/')
        || url.origin !== window.location.origin || url.pathname !== path) {
        throw new Error('A current selected report is required for the preview.');
      }
      const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal });
      if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) {
        throw new Error('The selected report preview could not be loaded.');
      }
      const blocks = await renderBoothPreview(await response.text(), path, target.ownerDocument);
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
