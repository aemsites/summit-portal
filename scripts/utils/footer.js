import { getMetadata, loadBlock } from '../ak.js';

/** Skip synthetic `<footer>` on local dev — fragment fetch is meant for preview/live. */
function isLocalDevHost() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export default async function loadFooter() {
  const meta = getMetadata('footer') || 'footer';
  if (meta === 'off') {
    document.querySelector('footer')?.remove();
    return;
  }

  let footer = document.querySelector('footer');
  if (!footer) {
    if (isLocalDevHost()) return;
    footer = document.createElement('footer');
    document.body.append(footer);
  }
  footer.className = meta;
  await loadBlock(footer);
}
