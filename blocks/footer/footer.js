import { getMetadata } from '../../scripts/ak.js';

export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/content/footer';
  const resp = await fetch(`${footerPath}.html`);
  if (resp.ok) {
    const html = await resp.text();
    block.innerHTML = html;
  }
}
