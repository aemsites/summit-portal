export default function init(el) {
  const cell = el.querySelector(':scope > div > div');

  const picture = cell?.querySelector('picture');
  const titleEl = cell?.querySelector('strong');
  const link = cell?.querySelector('a');
  const desc = [...(cell?.querySelectorAll('p') || [])]
    .find((p) => !p.querySelector('strong') && !p.querySelector('a') && p.textContent.trim());

  el.textContent = '';

  if (picture) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'teaser-image';
    imgWrap.append(picture);
    el.append(imgWrap);
  }

  const body = document.createElement('div');
  body.className = 'teaser-body';

  if (titleEl) {
    const h = document.createElement('p');
    h.className = 'teaser-title';
    h.textContent = titleEl.textContent.trim();
    body.append(h);
  }

  if (desc) {
    const d = document.createElement('p');
    d.className = 'teaser-desc';
    d.textContent = desc.textContent.trim();
    body.append(d);
  }

  if (link) {
    const cta = document.createElement('a');
    cta.className = 'teaser-cta';
    cta.href = link.href;
    cta.textContent = link.textContent.trim();
    cta.target = link.target || '_self';
    body.append(cta);
  }

  el.append(body);
}
