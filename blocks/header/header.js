import { getConfig, getMetadata } from '../../scripts/ak.js';
import { loadFragment } from '../fragment/fragment.js';
import { setColorScheme } from '../section-metadata/section-metadata.js';

const { locale } = getConfig();

const HEADER_PATH = '/fragments/nav/header';
const HEADER_ACTIONS = [
  '/tools/widgets/scheme',
  '/tools/widgets/language',
  '/tools/widgets/toggle',
];

function closeAllMenus() {
  const openMenus = document.body.querySelectorAll('header .is-open');
  for (const openMenu of openMenus) {
    openMenu.classList.remove('is-open');
  }
}

function docClose(e) {
  if (e.target.closest('header')) return;
  closeAllMenus();
}

function toggleMenu(menu) {
  const isOpen = menu.classList.contains('is-open');
  closeAllMenus();
  if (isOpen) {
    document.removeEventListener('click', docClose);
    return;
  }

  // Setup the global close event
  document.addEventListener('click', docClose);
  menu.classList.add('is-open');
}

function decorateLanguage(btn) {
  const section = btn.closest('.section');
  btn.addEventListener('click', async () => {
    let menu = section.querySelector('.language.menu');
    if (!menu) {
      const content = document.createElement('div');
      content.classList.add('block-content');
      const fragment = await loadFragment(`${locale.prefix}${HEADER_PATH}/languages`);
      menu = document.createElement('div');
      menu.className = 'language menu';
      menu.append(fragment);
      content.append(menu);
      section.append(content);
    }
    toggleMenu(section);
  });
}

function getStoredOrPreferredScheme() {
  const stored = localStorage.getItem('color-scheme');
  if (stored === 'light-scheme' || stored === 'dark-scheme') {
    return stored;
  }
  return matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark-scheme'
    : 'light-scheme';
}

/** Keeps the switch visuals in sync with body class / storage / system preference */
function syncSchemeToggle(btn) {
  if (!btn) return;
  const scheme = getStoredOrPreferredScheme();
  btn.setAttribute('aria-checked', scheme === 'dark-scheme' ? 'true' : 'false');
}

function decorateScheme(btn) {
  btn.setAttribute('type', 'button');
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-label', 'Color theme');

  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (localStorage.getItem('color-scheme')) return;
    syncSchemeToggle(btn);
  });

  btn.addEventListener('click', () => {
    const currPref = localStorage.getItem('color-scheme')
      || (mq.matches ? 'dark-scheme' : 'light-scheme');

    const theme = currPref === 'dark-scheme'
      ? { add: 'light-scheme', remove: 'dark-scheme' }
      : { add: 'dark-scheme', remove: 'light-scheme' };

    document.body.classList.remove(theme.remove);
    document.body.classList.add(theme.add);
    localStorage.setItem('color-scheme', theme.add);
    syncSchemeToggle(btn);

    const sections = document.querySelectorAll('.section');
    for (const section of sections) {
      setColorScheme(section);
    }
  });

  syncSchemeToggle(btn);
}

function decorateNavToggle(btn) {
  btn.addEventListener('click', () => {
    const header = document.body.querySelector('header');
    if (header) header.classList.toggle('is-mobile-open');
  });
}

const SCHEME_SUN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" focusable="false"><circle cx="12" cy="12" r="3.5"/><path d="M12 1v2.5M12 20.5V23M4.22 4.22l1.77 1.77M18.01 18.01l1.77 1.77M1 12h2.5M20.5 12H23M4.22 19.78l1.77-1.77M18.01 5.99l1.77-1.77"/></svg>';

async function decorateAction(header, pattern) {
  const link = header.querySelector(`[href*="${pattern}"]`);
  if (!link) return;

  const icon = link.querySelector('.icon');
  const text = link.textContent;
  const btn = document.createElement('button');

  if (pattern === '/tools/widgets/scheme') {
    const sun = document.createElement('span');
    sun.className = 'scheme-sun';
    sun.setAttribute('aria-hidden', 'true');
    sun.innerHTML = SCHEME_SUN_SVG;
    btn.append(sun);
  } else if (icon) {
    btn.append(icon);
  }

  if (text) {
    const textSpan = document.createElement('span');
    textSpan.className = 'text';
    textSpan.textContent = text;
    btn.append(textSpan);
  }
  const wrapper = document.createElement('div');
  const iconSlug = icon?.classList[1]?.replace('icon-', '') ?? 'widget';
  wrapper.className = `action-wrapper ${iconSlug}`;
  wrapper.append(btn);
  link.parentElement.parentElement.replaceChild(wrapper, link.parentElement);

  if (pattern === '/tools/widgets/language') {
    wrapper.classList.add('header-language');
    decorateLanguage(btn);
  }
  if (pattern === '/tools/widgets/scheme') {
    wrapper.classList.add('header-scheme');
    const track = document.createElement('span');
    track.className = 'scheme-switch-track';
    track.setAttribute('aria-hidden', 'true');
    const thumb = document.createElement('span');
    thumb.className = 'scheme-switch-thumb';
    track.append(thumb);
    btn.append(track);
    decorateScheme(btn);
  }
  if (pattern === '/tools/widgets/toggle') {
    wrapper.classList.add('header-nav-toggle');
    decorateNavToggle(btn);
  }
}

function decorateMenu() {
  // TODO: finish single menu support
  return null;
}

function decorateMegaMenu(li) {
  const menu = li.querySelector('.fragment-content');
  if (!menu) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'mega-menu';
  wrapper.append(menu);
  li.append(wrapper);
  return wrapper;
}

function decorateNavItem(li) {
  li.classList.add('main-nav-item');
  const link = li.querySelector(':scope > p > a');
  if (link) link.classList.add('main-nav-link');
  const menu = decorateMegaMenu(li) || decorateMenu(li);
  if (!(menu || link)) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    toggleMenu(li);
  });
}

function decorateBrandSection(section) {
  section.classList.add('brand-section');
  const brandLink = section.querySelector('a');
  const [, text] = brandLink.childNodes;
  const span = document.createElement('span');
  span.className = 'brand-text';
  span.append(text);
  brandLink.append(span);

  // Logo image is decorative — link text already describes the destination
  const logoImg = section.querySelector('img');
  if (logoImg && !logoImg.alt) logoImg.alt = '';
}

function decorateNavSection(section) {
  section.classList.add('main-nav-section');
  const navContent = section.querySelector('.default-content');
  const navList = section.querySelector('ul');
  if (!navList) return;
  navList.classList.add('main-nav-list');

  const nav = document.createElement('nav');
  nav.append(navList);
  navContent.append(nav);

  const mainNavItems = section.querySelectorAll('nav > ul > li');
  for (const navItem of mainNavItems) {
    decorateNavItem(navItem);
  }
}

async function decorateUserInfo(section) {
  const container = section.querySelector('.default-content');
  if (!container) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'user-info';

  let user;
  try {
    const resp = await fetch('/auth/me');
    user = resp.ok ? await resp.json() : null;
  } catch { user = null; }

  if (!user?.authenticated) {
    const signIn = document.createElement('a');
    signIn.href = '/login';
    signIn.className = 'user-sign-in';
    signIn.textContent = 'Sign in';
    wrapper.append(signIn);
  } else {
    const btn = document.createElement('button');
    btn.className = 'user-email';
    btn.textContent = user.email;

    const menu = document.createElement('div');
    menu.className = 'user-menu';
    const signOut = document.createElement('a');
    signOut.href = '/auth/logout';
    signOut.textContent = 'Sign out';
    const myPortal = document.createElement('a');
    myPortal.href = '/auth/portal';
    myPortal.textContent = 'My Portal';
    menu.append(signOut, myPortal);

    btn.addEventListener('click', () => toggleMenu(wrapper));
    wrapper.append(btn, menu);
  }

  container.append(wrapper);
}

async function decorateActionSection(section) {
  section.classList.add('actions-section');
  decorateUserInfo(section);
}

async function decorateHeader(fragment) {
  const sections = fragment.querySelectorAll(':scope > .section');
  if (sections[0]) decorateBrandSection(sections[0]);
  if (sections[1]) decorateNavSection(sections[1]);
  if (sections[2]) decorateActionSection(sections[2]);

  for (const pattern of HEADER_ACTIONS) {
    decorateAction(fragment, pattern);
  }
}

/**
 * loads and decorates the header
 * @param {Element} el The header element
 */
export default async function init(el) {
  const headerMeta = getMetadata('header');
  const path = headerMeta || HEADER_PATH;
  try {
    const fragment = await loadFragment(`${locale.prefix}${path}`);
    fragment.classList.add('header-content');
    await decorateHeader(fragment);
    el.append(fragment);
  } catch {
    // Fragment not found or failed to load — silently skip header
  }
}
