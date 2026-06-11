// blocks/portal-login/portal-login.js

function injectHeading(col, text) {
  const h3 = document.createElement('h3');
  h3.className = 'pl-card-title';
  h3.textContent = text;
  col.prepend(h3);
}

export default function init(el) {
  const [row] = [...el.children];
  row.classList.add('pl-row');

  const [colAdobe, colMagic] = [...row.children];
  colAdobe.classList.add('pl-col', 'pl-col-adobe');
  colMagic.classList.add('pl-col', 'pl-col-magic');

  injectHeading(colAdobe, 'Adobe ID');
  injectHeading(colMagic, 'Magic Link');
}
