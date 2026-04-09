import { getMetadata } from '../../scripts/ak.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    if (nav) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, isDesktop);
      nav.querySelector('button.nav-hamburger-btn')?.focus();
    }
  }
}

function toggleMenu(nav, desktop, forceExpanded = null) {
  const expanded = forceExpanded !== null
    ? !forceExpanded
    : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.nav-hamburger button');
  document.body.style.overflowY = expanded || desktop.matches ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  if (button) button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');

  // enable/disable esc key listener
  if (expanded || desktop.matches) {
    window.removeEventListener('keydown', closeOnEscape);
  } else {
    window.addEventListener('keydown', closeOnEscape);
  }
}

/**
 * loads and decorates the header, mainly combating the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  // load nav as fragment
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  let resp = await fetch(`/content${navPath}.html`);
  if (!resp.ok) resp = await fetch(`${navPath}.plain.html`);

  if (resp.ok) {
    const html = await resp.text();

    // decorate nav DOM
    const nav = document.createElement('nav');
    nav.id = 'nav';
    nav.innerHTML = html;

    const classes = ['brand', 'sections', 'tools'];
    classes.forEach((c, i) => {
      const section = nav.children[i];
      if (section) section.classList.add(`nav-${c}`);
    });

    // Insert Adobe logo into brand link
    const brandLink = nav.querySelector('.nav-brand a');
    if (brandLink) {
      const logo = document.createElement('img');
      logo.src = '/blocks/header/adobe-logo.svg';
      logo.alt = 'Adobe';
      logo.width = 32;
      logo.height = 32;
      brandLink.prepend(logo);
    }

    // hamburger for mobile
    const hamburger = document.createElement('div');
    hamburger.classList.add('nav-hamburger');
    hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation">
      <span class="nav-hamburger-icon"></span>
    </button>`;
    hamburger.addEventListener('click', () => toggleMenu(nav, isDesktop));
    nav.prepend(hamburger);
    nav.setAttribute('aria-expanded', 'false');
    isDesktop.addEventListener('change', () => toggleMenu(nav, isDesktop, isDesktop.matches));

    // decorate nav sections (dropdowns, etc.)
    const navSections = nav.querySelector('.nav-sections');
    if (navSections) {
      navSections.querySelectorAll(':scope .default-content-wrapper > ul > li').forEach((navSection) => {
        if (navSection.querySelector('ul')) navSection.classList.add('nav-drop');
        navSection.addEventListener('click', () => {
          if (isDesktop.matches) {
            const expanded = navSection.getAttribute('aria-expanded') === 'true';
            navSections.querySelectorAll('[aria-expanded="true"]')
              .forEach((el) => el.setAttribute('aria-expanded', 'false'));
            navSection.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          }
        });
      });
    }

    // set initial state on desktop
    toggleMenu(nav, isDesktop, isDesktop.matches);
    block.append(nav);
    block.parentElement.classList.add('header-wrapper');
  }
}
