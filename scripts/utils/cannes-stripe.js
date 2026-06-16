import { loadStyle } from '../ak.js';

export default function mount() {
  const main = document.querySelector('main');
  if (!main || main.querySelector(':scope > .cannes-stripe')) return;

  loadStyle('/blocks/cannes-stripe/cannes-stripe.css');

  const stripe = document.createElement('div');
  stripe.className = 'cannes-stripe';
  stripe.setAttribute('aria-hidden', 'true');
  main.append(stripe);
}
