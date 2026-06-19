import { loadStyle } from '../ak.js';

/**
 * Account "Your resources" enhancer.
 *
 * Account landing pages (`/accounts/<letter>/<slug>/`) are authored from one
 * template: a hero, then a default-content section that is a "Sitemap" heading
 * followed by a <ul> of links to the customer's resources (insight report,
 * portal landing, …). Raw, it renders as a bullet list of link text — looks
 * like unstyled HTML. This upgrades that section into a card grid, in place,
 * with no content re-authoring across the ~2,150 account pages.
 *
 * Two behaviours, both keyed off the link href:
 *   1. Per website, a `portal-landing` link WINS — the bare report link for the
 *      same site (`.../insights/<site>/` with no variant) is dropped entirely.
 *      Mirrors the existing customer-picker rule.
 *   2. The surviving links become titled, described, icon-bearing cards.
 *
 * Conservative: only acts on `/accounts/` pages, only on a section whose lead
 * line is "Sitemap" with a following list of insight links. Anything else is a
 * no-op so unrelated pages are never touched.
 */

const REPORT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/><path d="M9 9h2"/></svg>';
const PORTAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 4v5"/></svg>';
const ARROW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';

/** Same-origin pathname for a link, or '' when it can't be parsed. */
function toPath(href) {
  try {
    return new URL(href, window.location.origin).pathname;
  } catch {
    return '';
  }
}

/**
 * Classify an insight link by its path. Returns
 * `{ kind: 'portal' | 'report' | 'other', site }` where `site` is the website
 * slug (e.g. `sky-com`) for insight links, used to pair report ↔ portal-landing.
 */
function classify(href) {
  const path = toPath(href).replace(/\/+$/, '');
  const marker = '/insights/';
  const idx = path.indexOf(marker);
  if (idx < 0) return { kind: 'other', site: '' };
  const parts = path.slice(idx + marker.length).split('/').filter(Boolean);
  const [site = '', variant = ''] = parts;
  if (variant === 'portal-landing') return { kind: 'portal', site };
  if (!variant) return { kind: 'report', site };
  return { kind: 'other', site };
}

/** Human-friendly title/description per link kind, falling back to authored text. */
function describe(kind, authoredText) {
  if (kind === 'portal') {
    return { title: 'Your portal', desc: 'Your personalized Adobe portal' };
  }
  if (kind === 'report') {
    return { title: 'Digital opportunity report', desc: 'Your full performance & SEO analysis' };
  }
  return { title: authoredText || 'Open', desc: '' };
}

/** Is this section the authored "Sitemap" block (lead <p>Sitemap</p> + a <ul>)? */
function findSitemap(main) {
  const blocks = [...main.querySelectorAll(':scope > div')];
  return blocks.find((div) => {
    const lead = div.querySelector(':scope > p');
    const list = div.querySelector(':scope > ul');
    return lead && list && lead.textContent.trim().toLowerCase() === 'sitemap';
  }) || null;
}

function buildCard({ href, kind }, authoredText) {
  const { title, desc } = describe(kind, authoredText);
  const card = document.createElement('a');
  card.className = `ar-card ar-card--${kind}`;
  card.href = href;

  const icon = document.createElement('span');
  icon.className = 'ar-card-icon';
  icon.innerHTML = kind === 'portal' ? PORTAL_ICON : REPORT_ICON;

  const body = document.createElement('span');
  body.className = 'ar-card-body';
  const h = document.createElement('span');
  h.className = 'ar-card-title';
  h.textContent = title;
  body.append(h);
  if (desc) {
    const p = document.createElement('span');
    p.className = 'ar-card-desc';
    p.textContent = desc;
    body.append(p);
  }

  const arrow = document.createElement('span');
  arrow.className = 'ar-card-arrow';
  arrow.innerHTML = ARROW_ICON;

  card.append(icon, body, arrow);
  return card;
}

export default function mount() {
  if (!window.location.pathname.startsWith('/accounts/')) return;
  const main = document.querySelector('main');
  if (!main || main.querySelector('.account-resources')) return;

  const section = findSitemap(main);
  if (!section) return;
  const list = section.querySelector(':scope > ul');
  const lead = section.querySelector(':scope > p');

  // Collect authored links with their classification.
  const items = [...list.querySelectorAll('a[href]')].map((a) => ({
    href: a.getAttribute('href'),
    text: a.textContent.trim(),
    ...classify(a.getAttribute('href')),
  }));
  if (!items.length) return;

  // Rule 1: if a site has a portal-landing, drop its bare report link.
  const portalSites = new Set(items.filter((i) => i.kind === 'portal').map((i) => i.site));
  const visible = items.filter((i) => !(i.kind === 'report' && portalSites.has(i.site)));
  if (!visible.length) return;

  loadStyle('/blocks/account-resources/account-resources.css');

  const wrap = document.createElement('div');
  wrap.className = 'account-resources';

  const heading = document.createElement('h2');
  heading.className = 'ar-heading';
  heading.textContent = 'Your resources';
  wrap.append(heading);

  const grid = document.createElement('div');
  grid.className = 'ar-grid';
  visible.forEach((item) => grid.append(buildCard(item, item.text)));
  wrap.append(grid);

  // Replace the raw sitemap section content in place.
  lead.remove();
  list.remove();
  section.append(wrap);
}
