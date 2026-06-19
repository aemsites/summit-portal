/**
 * Docs theme block.
 *
 * A zero-output block that switches the page into the documentation theme:
 *  - adds a `docs-page` class to <body> (so all styling in docs.css is scoped
 *    to pages that explicitly opt in),
 *  - structures "provenance" runs (an <h3> followed by How we extract it /
 *    How to frame it / Caveat paragraphs) into labelled source cards,
 *  - builds a sticky, scroll-spying table of contents from the page's <h2>s,
 *  - then removes itself from the DOM.
 *
 * Authoring: place an empty `docs` block as the first block on the page.
 * No cells required.
 */

/* A small, self-consistent monoline icon family (24×24, currentColor stroke),
   composed from simple primitives so every glyph shares the same weight and
   feel. Replaces emoji, which render inconsistently and read as "internal
   tool". Keyed by the emoji authors use in the CMS, with a neutral dot
   fallback for anything unmapped. */
const ICON_BODY = {
  '⚡': '<path d="M13 3 5 13h5l-1 8 8-11h-5l1-7z"/>',
  '🧩': '<path d="M5 6h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H5v-4a2 2 0 1 0 0-4V6z"/>',
  '📈': '<polyline points="4 16 10 10 13 13 20 6"/><polyline points="15 6 20 6 20 11"/>',
  '✅': '<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/>',
  '🔍': '<circle cx="11" cy="11" r="6"/><line x1="20" y1="20" x2="15.5" y2="15.5"/>',
  '⚙️': '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  '🤖': '<rect x="5" y="8" width="14" height="11" rx="2.5"/><line x1="12" y1="4" x2="12" y2="8"/><circle cx="12" cy="4" r="1.2"/><circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/>',
  '🌐': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.4 3.8 5.6 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3z"/>',
  '📚': '<path d="M5 5h5a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H5z"/><path d="M19 5h-5a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h5z"/>',
  '🏆': '<path d="M8 5h8v4a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3"/><line x1="12" y1="13" x2="12" y2="17"/><line x1="8.5" y1="20" x2="15.5" y2="20"/>',
  '✍️': '<path d="M4 20l1-4L16 5l3 3L8 19z"/><line x1="14" y1="7" x2="17" y2="10"/>',
  '📄': '<path d="M7 3h7l4 4v14H7z"/><polyline points="14 3 14 7 18 7"/><line x1="10" y1="12" x2="15" y2="12"/><line x1="10" y1="16" x2="15" y2="16"/>',
  '📑': '<rect x="5" y="4" width="14" height="16" rx="2"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>',
  '🎯': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>',
  '🧭': '<circle cx="12" cy="12" r="9"/><polygon points="16 8 11 11 8 16 13 13"/>',
  '🛰️': '<path d="M12 4a8 8 0 0 1 8 8"/><path d="M12 8a4 4 0 0 1 4 4"/><circle cx="12" cy="16" r="2"/>',
  '💬': '<path d="M5 6h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3v-3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/>',
  '🏷️': '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
  '🔑': '<circle cx="8" cy="12" r="4"/><line x1="11.5" y1="12" x2="20" y2="12"/><line x1="17" y1="12" x2="17" y2="15"/><line x1="20" y1="12" x2="20" y2="16"/>',
  '💸': '<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  '💡': '<path d="M9 16a5 5 0 1 1 6 0c-.6.5-1 1-1 2H10c0-1-.4-1.5-1-2z"/><line x1="10" y1="21" x2="14" y2="21"/>',
};

/** Wrap icon inner-paths in a consistent SVG shell. */
function svgIcon(body) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
    + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Replace emoji icons inside report-cards with the monoline SVG family. */
function replaceCardIcons(main) {
  main.querySelectorAll('.report-cards .rc-icon').forEach((icon) => {
    const glyph = (icon.textContent || '').trim();
    const body = ICON_BODY[glyph] || '<circle cx="12" cy="12" r="3.2"/>';
    icon.innerHTML = svgIcon(body);
    icon.classList.add('docs-icon');
  });

  // Tag "Conditional" status pills so only they keep the red treatment;
  // "Always" pills read as neutral.
  main.querySelectorAll('.report-cards .rc-tag').forEach((tag) => {
    if (/conditional/i.test(tag.textContent || '')) tag.classList.add('rc-tag-conditional');
  });
}

/** Slugify a heading's text into a stable id. */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'section';
}

/** Ensure an element has a unique id; returns it. */
function ensureId(el, used) {
  let id = el.id || slugify(el.textContent);
  let n = 2;
  while (used.has(id)) { id = `${slugify(el.textContent)}-${n}`; n += 1; }
  used.add(id);
  el.id = id;
  return id;
}

/**
 * Find paragraphs that lead with a known label ("How we extract it:",
 * "How to frame it:", "Caveat:") and tag them so CSS can render the label as
 * a chip. Returns the matched label key or null.
 */
const LABELS = [
  { key: 'extract', re: /^how we extract it\s*:?/i, text: 'How we extract it' },
  { key: 'frame', re: /^how to frame it\s*:?/i, text: 'How to frame it' },
  { key: 'caveat', re: /^caveat\s*:?/i, text: 'Caveat' },
];

function labelFor(p) {
  const raw = (p.textContent || '').trim();
  return LABELS.find((l) => l.re.test(raw)) || null;
}

/**
 * Walk each default-content group and convert provenance runs into cards.
 * A run = an <h3> immediately followed by one or more labelled paragraphs.
 * Everything is wrapped in `.docs-source` with a `.docs-source-body`.
 */
function buildSourceCards(main) {
  const groups = main.querySelectorAll('.section > .default-content');
  groups.forEach((group) => {
    const children = [...group.children];
    children.forEach((node) => {
      if (node.tagName !== 'H3') return;

      // Collect the labelled paragraphs that follow this h3.
      const labelled = [];
      let sib = node.nextElementSibling;
      while (sib && sib.tagName === 'P' && labelFor(sib)) {
        labelled.push(sib);
        sib = sib.nextElementSibling;
      }
      if (!labelled.length) return; // not a provenance run — leave as-is

      const card = document.createElement('div');
      card.className = 'docs-source';

      const head = document.createElement('div');
      head.className = 'docs-source-head';
      // move the h3 into the card head
      group.insertBefore(card, node);
      head.append(node);
      card.append(head);

      const body = document.createElement('div');
      body.className = 'docs-source-body';
      labelled.forEach((p) => {
        const label = labelFor(p);
        // Strip the leading label from the HTML, whether or not it's wrapped in
        // <strong> (e.g. "<strong>How we extract it:</strong> …" or "Caveat: …").
        const rawHtml = p.innerHTML
          .replace(/^\s*<strong>\s*[^<]*?:?\s*<\/strong>\s*/i, '')
          .replace(label.re, '')
          .trim();
        const rowEl = document.createElement('div');
        rowEl.className = `docs-source-row docs-source-row-${label.key}`;
        rowEl.innerHTML = `<span class="docs-source-label">${label.text}</span>`
          + `<p class="docs-source-text">${rawHtml}</p>`;
        body.append(rowEl);
        p.remove();
      });
      card.append(body);
    });
  });
}

/** Build a sticky TOC from the page's section <h2>s with scroll-spy. */
function buildToc(main) {
  const heads = [...main.querySelectorAll('.section > .default-content > h2')];
  if (heads.length < 3) return; // not worth a TOC

  const used = new Set();
  const items = heads.map((h) => ({ id: ensureId(h, used), label: h.textContent.trim(), h }));

  const nav = document.createElement('nav');
  nav.className = 'docs-toc';
  nav.setAttribute('aria-label', 'On this page');
  nav.innerHTML = '<p class="docs-toc-title">On this page</p>';
  const list = document.createElement('ul');
  list.className = 'docs-toc-list';
  items.forEach(({ id, label }) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${id}`;
    a.textContent = label;
    a.dataset.target = id;
    li.append(a);
    list.append(li);
  });
  nav.append(list);

  // Layout: wrap main's sections + the nav in a two-column shell.
  const layout = document.createElement('div');
  layout.className = 'docs-layout';
  const content = document.createElement('div');
  content.className = 'docs-content';
  // Move every current child of <main> into the content column.
  [...main.children].forEach((c) => content.append(c));
  const aside = document.createElement('aside');
  aside.className = 'docs-aside';
  aside.append(nav);
  layout.append(aside, content);
  main.append(layout);

  // Scroll-spy: highlight the TOC entry for the section currently in view.
  const links = [...list.querySelectorAll('a')];
  const byId = new Map(links.map((a) => [a.dataset.target, a]));
  let active = null;
  const setActive = (id) => {
    if (id === active) return;
    active = id;
    links.forEach((a) => a.classList.toggle('is-active', a.dataset.target === id));
  };
  const observer = new IntersectionObserver((entries) => {
    // Pick the topmost intersecting heading.
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) setActive(visible[0].target.id);
  }, { rootMargin: '-80px 0px -65% 0px', threshold: 0 });
  items.forEach(({ h }) => observer.observe(h));

  // Smooth-scroll with offset for any sticky header.
  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = byId.get(a.dataset.target)?.dataset.target;
      const el = target && document.getElementById(target);
      if (!el) return;
      e.preventDefault();
      const top = el.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top, behavior: 'smooth' });
      setActive(target);
      window.history.replaceState(null, '', `#${target}`);
    });
  });
}

/** Add a small red eyebrow above the page's H1 ("SALES PLAYBOOK" pattern). */
function decorateHero(main) {
  const h1 = main.querySelector('h1');
  if (!h1 || h1.previousElementSibling?.classList.contains('docs-eyebrow')) return;
  const eyebrow = document.createElement('p');
  eyebrow.className = 'docs-eyebrow';
  eyebrow.textContent = 'Internal sales playbook';
  h1.before(eyebrow);
}

/** Run the whole-page transforms once all blocks have decorated. */
function decoratePage() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('.docs-layout')) return; // guard re-entry
  decorateHero(main);
  replaceCardIcons(main);
  buildSourceCards(main);
  buildToc(main);
}

export default function init(el) {
  document.body.classList.add('docs-page');

  const section = el.closest('.section');
  const blockContent = el.closest('.block-content');
  el.remove();

  // Clean up the now-empty wrapper/section so it doesn't leave a blank gap,
  // but only when nothing else shares them.
  if (blockContent && !blockContent.querySelector('div[class]') && !blockContent.textContent.trim()) {
    blockContent.remove();
  }
  if (section && !section.children.length) section.remove();

  // The `docs` block is authored first, so when it decorates the later
  // sections' blocks (report-cards, table, …) may not be decorated yet.
  // Defer the page-wide transforms until the document has finished loading so
  // every .rc-tag / table / provenance run exists before we restructure.
  if (document.readyState === 'complete') {
    decoratePage();
  } else {
    window.addEventListener('load', decoratePage, { once: true });
  }
}
