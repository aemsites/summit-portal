import { getConfig, getMetadata } from '../../scripts/ak.js';
import { loadFragment } from '../fragment/fragment.js';
import { setColorScheme } from '../section-metadata/section-metadata.js';

const { locale } = getConfig();

// Map EDS locale path segment -> Google Translate language code
const GOOGLE_LANG_MAP = {
  de: 'de',
  fr: 'fr',
  es: 'es',
  zh: 'zh-CN',
  ja: 'ja',
  hi: 'hi',
};

function getLangCodeFromHref(href) {
  const match = new URL(href).pathname.match(/^\/([a-z]{2})\/?$/);
  return match ? (GOOGLE_LANG_MAP[match[1]] || match[1]) : null; // null = English (reset)
}

function loadGoogleTranslate() {
  if (document.getElementById('google_translate_element')) return;
  const el = document.createElement('div');
  el.id = 'google_translate_element';
  el.style.display = 'none';
  document.body.append(el);

  window.googleTranslateElementInit = () => {
    // eslint-disable-next-line no-new
    new window.google.translate.TranslateElement(
      { pageLanguage: 'en', autoDisplay: false },
      'google_translate_element',
    );
  };

  const script = document.createElement('script');
  script.src = '//translate.googleapis.com/translate_a/element.js?cb=googleTranslateElementInit';
  document.head.append(script);
}

function applyTranslation(langCode) {
  loadGoogleTranslate();
  // Poll until the select is fully populated (Google Translate loads ~249 languages)
  const attempt = (tries = 0) => {
    const select = document.querySelector('.goog-te-combo');
    if (select && select.options.length > 10) {
      select.value = langCode;
      select.dispatchEvent(new Event('change'));
    } else if (tries < 30) {
      setTimeout(() => attempt(tries + 1), 200);
    }
  };
  attempt();
}

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

      // Intercept each language link — use Google Translate instead of navigation
      menu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          closeAllMenus();
          const langCode = getLangCodeFromHref(link.href);
          if (!langCode) {
            // English selected — restore original page
            window.location.reload();
          } else {
            applyTranslation(langCode);
          }
        });
      });
    }
    toggleMenu(section);
  });
}

function decorateScheme(btn) {
  btn.addEventListener('click', async () => {
    const { body } = document;

    let currPref = localStorage.getItem('color-scheme');
    if (!currPref) {
      currPref = matchMedia('(prefers-color-scheme: dark)')
        .matches ? 'dark-scheme' : 'light-scheme';
    }

    const theme = currPref === 'dark-scheme'
      ? { add: 'light-scheme', remove: 'dark-scheme' }
      : { add: 'dark-scheme', remove: 'light-scheme' };

    body.classList.remove(theme.remove);
    body.classList.add(theme.add);
    localStorage.setItem('color-scheme', theme.add);
    // Re-calculatie section schemes
    const sections = document.querySelectorAll('.section');
    for (const section of sections) {
      setColorScheme(section);
    }
  });
}

function decorateNavToggle(btn) {
  btn.addEventListener('click', () => {
    const header = document.body.querySelector('header');
    if (header) header.classList.toggle('is-mobile-open');
  });
}

async function decorateAction(header, pattern) {
  const link = header.querySelector(`[href*="${pattern}"]`);
  if (!link) return;

  const icon = link.querySelector('.icon');
  const text = link.textContent;
  const btn = document.createElement('button');
  if (icon) btn.append(icon);
  if (text) {
    const textSpan = document.createElement('span');
    textSpan.className = 'text';
    textSpan.textContent = text;
    btn.append(textSpan);
  }
  const wrapper = document.createElement('div');
  wrapper.className = `action-wrapper ${icon.classList[1].replace('icon-', '')}`;
  wrapper.append(btn);
  link.parentElement.parentElement.replaceChild(wrapper, link.parentElement);

  if (pattern === '/tools/widgets/language') decorateLanguage(btn);
  if (pattern === '/tools/widgets/scheme') decorateScheme(btn);
  if (pattern === '/tools/widgets/toggle') decorateNavToggle(btn);
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
  try {
    const resp = await fetch('/auth/me');
    if (!resp.ok) return;
    const user = await resp.json();
    if (!user.authenticated) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'user-info';
    wrapper.textContent = user.email;
    section.querySelector('.default-content')?.append(wrapper);
  } catch { /* not authenticated or endpoint unavailable */ }
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
  } catch (e) {
    // Fragment not found or failed to load — silently skip header
  }
}
