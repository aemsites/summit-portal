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
      logo.src = '/img/icons/adobe-logo.svg';
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

    // Replace Help link text with icon
    const helpLink = nav.querySelector('.nav-tools a[href="/help"]');
    if (helpLink) {
      helpLink.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" focusable="false" aria-hidden="true"><path fill="currentColor" d="M9.988 15.527c-.23.008-.455-.074-.627-.229-.33-.365-.33-.92 0-1.286.17-.158.395-.243.627-.235.236-.01.466.08.633.248.162.168.25.394.242.627.012.235-.07.466-.228.64-.174.165-.408.25-.647.235"/><path fill="currentColor" d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/><path fill="currentColor" d="M9.992 12.706c-.414 0-.75-.336-.75-.75 0-1.022.07-1.714 1.04-2.683.784-.786.917-1.101.917-1.65 0-.21-.066-1.259-1.374-1.259-1.365 0-1.51 1.156-1.526 1.388-.027.413-.393.72-.797.7-.414-.028-.727-.385-.7-.798.064-.965.777-2.79 3.023-2.79 1.887 0 2.874 1.388 2.874 2.758 0 1.144-.457 1.81-1.357 2.712-.576.576-.6.811-.6 1.622 0 .414-.336.75-.75.75"/></svg>';
      helpLink.setAttribute('aria-label', 'Help');
    }

    // Night mode toggle
    const nightBtn = document.createElement('button');
    nightBtn.type = 'button';
    nightBtn.className = 'nav-night-toggle';
    nightBtn.setAttribute('aria-label', 'Toggle dark mode');
    nightBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" focusable="false" aria-hidden="true"><path fill="currentColor" d="M10 18.78c-4.825 0-8.75-3.926-8.75-8.75S5.175 1.28 10 1.28s8.75 3.924 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.251-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.253 7.25-7.25S13.998 2.78 10 2.78"/><path fill="currentColor" d="M10 14.384c0 .653.615 1.121 1.251.973 2.435-.566 4.249-2.75 4.249-5.357s-1.814-4.79-4.249-5.357c-.636-.148-1.251.32-1.251.973z"/></svg>';

    const stored = localStorage.getItem('color-scheme');
    if (stored) {
      document.documentElement.classList.remove('light-scheme', 'dark-scheme');
      document.documentElement.classList.add(`${stored}-scheme`);
    }

    nightBtn.addEventListener('click', () => {
      const isDark = document.documentElement.classList.contains('dark-scheme');
      const next = isDark ? 'light' : 'dark';
      document.documentElement.classList.remove('light-scheme', 'dark-scheme');
      document.documentElement.classList.add(`${next}-scheme`);
      localStorage.setItem('color-scheme', next);
    });

    const tools = nav.querySelector('.nav-tools');
    if (tools) {
      tools.appendChild(nightBtn);
    }

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
