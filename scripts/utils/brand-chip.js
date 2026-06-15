import { loadStyle } from '../ak.js';

const DISMISS_KEY = 'cannes-brand-chip-dismissed';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

function isDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) !== null;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch { /* ignore */ }
}

function render(block) {
  const label = document.createElement('span');
  label.className = 'bc-label';
  label.textContent = 'Powered by Adobe Brand Visibility';

  const logos = document.createElement('span');
  logos.className = 'bc-logos';

  const adobe = document.createElement('img');
  adobe.className = 'bc-adobe';
  adobe.src = '/img/cannes/adobe-logo.svg';
  adobe.alt = 'Adobe';

  const divider = document.createElement('span');
  divider.className = 'bc-divider';
  divider.setAttribute('aria-hidden', 'true');

  const semrush = document.createElement('img');
  semrush.className = 'bc-semrush';
  semrush.src = '/img/cannes/semrush-logo.png';
  semrush.alt = 'Semrush — An Adobe Company';

  logos.append(adobe, divider, semrush);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'bc-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.innerHTML = CLOSE_ICON;
  close.addEventListener('click', () => {
    block.classList.add('is-dismissed');
    markDismissed();
    setTimeout(() => block.remove(), 250);
  });

  block.append(label, logos, close);
}

export default function mount() {
  // Cannes-only: the cobrand lockup marks a Cannes page (summit pages don't use it).
  if (!document.querySelector('.cobrand')) return;
  if (isDismissed()) return;
  if (document.querySelector('.brand-chip')) return;

  loadStyle('/blocks/brand-chip/brand-chip.css');

  const block = document.createElement('div');
  block.className = 'brand-chip';
  render(block);
  document.body.append(block);

  requestAnimationFrame(() => block.classList.add('is-visible'));
}
