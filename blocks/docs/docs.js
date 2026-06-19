/**
 * Docs theme block.
 *
 * A zero-output block that switches the page into the documentation theme:
 * it adds a `docs-page` class to <body> (so all styling in docs.css is scoped
 * to pages that explicitly opt in) and then removes itself from the DOM.
 *
 * Authoring: place an empty `docs` block anywhere on the page (typically the
 * first block). No cells required.
 */
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
}
