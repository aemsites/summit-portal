const GUIDE_PATH = '/adobe/booth-guide';
const STORAGE_KEY = 'booth-guide-checks';

export default async function init(root = document.querySelector('.booth-guide')) {
  const content = root.querySelector('#guide-sections');
  const main = root.querySelector('main');
  const index = root.querySelector('#guide-index');
  const navigation = root.querySelector('.bg-navigation');
  const search = root.querySelector('#guide-search');
  const clearSearch = root.querySelector('#guide-clear-search');
  const searchStatus = root.querySelector('#guide-search-status');
  const loadStatus = root.querySelector('#guide-load-status');
  const retry = root.querySelector('#guide-retry');
  const notice = root.querySelector('#guide-notice');
  const jump = root.querySelector('#guide-jump');
  const desktop = window.matchMedia('(min-width: 1000px)');
  let guide;
  let checks = {};
  let noticeTimer;
  let observer;

  function notify(message) {
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 6000);
  }

  function saveChecks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checks));
    } catch (error) {
      notify('Checks could not be saved on this device. Keep this page open while testing.');
      console.warn('[booth-guide] Checklist storage unavailable', error.name);
    }
  }

  function decorateSection(article, section) {
    article.querySelectorAll('table').forEach((table) => {
      const headers = [...table.querySelectorAll('th')].map((cell) => cell.textContent);
      const wrapper = document.createElement('div');
      wrapper.className = 'bg-table';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', `${section.title} table; scroll horizontally if needed`);
      table.before(wrapper);
      wrapper.append(table);
      if (['Staff access', 'Setup test'].includes(headers[0])) {
        const details = document.createElement('details');
        details.className = 'bg-sensitive';
        const summary = document.createElement('summary');
        summary.textContent = headers[0] === 'Staff access'
          ? 'Show staff credentials — HIGHLY CONFIDENTIAL'
          : 'Show approved setup email — HIGHLY CONFIDENTIAL';
        const reminder = document.createElement('p');
        reminder.textContent = 'Staff device only. Close this before a visitor can see it.';
        wrapper.before(details);
        details.append(summary, reminder, wrapper);
      }
    });
    article.querySelectorAll('img').forEach((image) => {
      const name = image.getAttribute('src').split('/').pop();
      if (!guide.screenshots.includes(name)) throw new Error('Unlisted guide screenshot');
      image.src = `${GUIDE_PATH}/screenshots/${name}?v=${encodeURIComponent(guide.contentVersion)}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      const figure = document.createElement('figure');
      const link = document.createElement('a');
      link.className = 'bg-screenshot';
      link.href = image.src;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Open full-size screenshot: ${image.alt}`);
      const label = document.createElement('span');
      label.textContent = 'Open screenshot at full size';
      image.parentElement.replaceWith(figure);
      link.append(image, label);
      figure.append(link);
      image.addEventListener('error', () => {
        label.textContent = 'Screenshot unavailable. Sign in again if your session has expired.';
        label.setAttribute('role', 'status');
      });
    });
    const prefix = `${guide.contentVersion}:${section.id}:`;
    let count = 0;
    article.querySelectorAll('li, tbody td:first-child').forEach((element) => {
      if (!/^\[ \]/.test(element.textContent.trim())) return;
      const key = `${prefix}${count}`;
      count += 1;
      const label = document.createElement('label');
      label.className = 'bg-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checks[key] === true;
      const text = document.createElement('span');
      text.innerHTML = element.innerHTML.replace(/^\[ \]\s*/, '');
      label.append(input, text);
      element.replaceChildren(label);
      input.addEventListener('change', () => {
        checks[key] = input.checked;
        saveChecks();
      });
    });
    if (count) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'bg-reset';
      reset.textContent = 'Reset these guide checks (not the booth)';
      reset.addEventListener('click', () => {
        Object.keys(checks).filter((key) => key.startsWith(prefix))
          .forEach((key) => { delete checks[key]; });
        article.querySelectorAll('.bg-check input').forEach((input) => { input.checked = false; });
        saveChecks();
        notify('These guide checks were reset. The booth has not changed.');
      });
      article.append(reset);
    }
    article.querySelectorAll('p').forEach((paragraph) => {
      if (!/^(Say|Ask):/.test(paragraph.textContent.trim())) return;
      paragraph.classList.add('bg-talk-track');
      const text = paragraph.textContent.trim().replace(/^(Say|Ask):\s*/, '');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bg-copy';
      button.textContent = 'Copy line';
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(text);
          notify('Talk track copied.');
        } catch (error) {
          notify('Copy failed. Select and copy the line manually.');
          console.warn('[booth-guide] Clipboard unavailable', error.name);
        }
      });
      paragraph.append(button);
    });
    article.querySelectorAll('a[href^="https://"]').forEach((link) => {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
    article.querySelectorAll('a').forEach((link) => {
      const url = new URL(link.href, window.location.href);
      if (url.hostname === 'act.aem.now' && ['/booth', '/login'].includes(url.pathname)) {
        link.insertAdjacentText(
          'afterend',
          ' (on shared event devices, use a dedicated browser profile without a portal sign-in)',
        );
      }
    });
  }

  function filter() {
    const tokens = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    guide.sections.forEach((section) => {
      const matches = tokens.every(
        (token) => section.searchText.toLocaleLowerCase().includes(token),
      );
      content.querySelector(`[id="${section.id}"]`).hidden = !matches;
      index.querySelector(`[href="#${section.id}"]`).hidden = !matches;
      if (matches) count += 1;
    });
    clearSearch.hidden = tokens.length === 0;
    searchStatus.textContent = tokens.length
      ? `${count} matching ${count === 1 ? 'section' : 'sections'}.${count ? '' : ' Try a signal such as INP, or clear the search.'}`
      : '';
  }

  function goToSection(id) {
    const article = [...content.children].find((element) => element.id === id);
    if (!article) return;
    search.value = '';
    filter();
    if (!desktop.matches) navigation.open = false;
    article.scrollIntoView({ block: 'start' });
    article.focus({ preventScroll: true });
    index.querySelectorAll('a').forEach((link) => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function render() {
    const articles = document.createDocumentFragment();
    const links = document.createDocumentFragment();
    guide.sections.forEach((section, position) => {
      const article = document.createElement('article');
      article.className = 'bg-section';
      article.id = section.id;
      article.tabIndex = -1;
      article.setAttribute('aria-label', section.title);
      article.innerHTML = section.html;
      if (position === 0) {
        article.classList.add('bg-cover');
        // The generated Word contents list is represented by the page's section navigation.
        article.querySelectorAll('h3').forEach((heading) => {
          if (heading.textContent === 'Index' && heading.nextElementSibling?.tagName === 'UL') {
            heading.nextElementSibling.remove();
            heading.remove();
          }
        });
      }
      decorateSection(article, section);
      articles.append(article);
      const link = document.createElement('a');
      link.href = `#${section.id}`;
      link.textContent = section.title;
      links.append(link);
    });
    content.replaceChildren(articles);
    index.replaceChildren(links);
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      const entry = entries.find((item) => item.isIntersecting);
      if (!entry) return;
      index.querySelectorAll('a').forEach((link) => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-10% 0px -75% 0px' });
    [...content.children].forEach((article) => observer.observe(article));
    search.disabled = false;
    jump.disabled = false;
    loadStatus.hidden = true;
    main.removeAttribute('aria-busy');
    goToSection(window.location.hash.slice(1));
  }

  async function load() {
    content.replaceChildren();
    index.replaceChildren();
    observer?.disconnect();
    search.disabled = true;
    jump.disabled = true;
    main.setAttribute('aria-busy', 'true');
    retry.hidden = true;
    loadStatus.hidden = false;
    loadStatus.textContent = 'Loading the staff guide…';
    try {
      const response = await fetch(`${GUIDE_PATH}/data.json`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      if ([401, 403].includes(response.status)) {
        loadStatus.textContent = 'This guide requires an Adobe employee signed in with Adobe ID. ';
        const link = document.createElement('a');
        link.href = response.status === 401
          ? `/auth/portal?redirect=${encodeURIComponent(GUIDE_PATH)}` : '/auth/logout';
        link.textContent = response.status === 401 ? 'Sign in to continue.' : 'Sign out and use your Adobe account.';
        loadStatus.append(link);
        return;
      }
      if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type') || '')) {
        throw new Error(`Guide service returned ${response.status}`);
      }
      guide = await response.json();
      if (!guide.sections?.length || !Array.isArray(guide.screenshots) || !guide.contentVersion) {
        throw new Error('Incomplete guide content');
      }
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        checks = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
      } catch (error) {
        notify('Saved guide checks could not be read. This checklist starts unchecked.');
        console.warn('[booth-guide] Checklist storage unavailable', error.name);
      }
      render();
    } catch (error) {
      content.replaceChildren();
      index.replaceChildren();
      search.disabled = true;
      loadStatus.textContent = 'The staff guide could not load. Check your connection and try again. Do not use an incomplete guide for the event.';
      retry.hidden = false;
      console.error('[booth-guide] Guide unavailable', error.message);
    } finally {
      main.removeAttribute('aria-busy');
    }
  }

  navigation.open = desktop.matches;
  desktop.addEventListener('change', () => { navigation.open = desktop.matches; });
  search.addEventListener('input', filter);
  clearSearch.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  retry.addEventListener('click', load);
  jump.addEventListener('click', () => {
    navigation.open = true;
    root.querySelector('.bg-sidebar').scrollIntoView({ block: 'start' });
    navigation.querySelector('summary').focus({ preventScroll: true });
  });
  root.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (link && [...content.children].some((article) => article.id === link.hash.slice(1))) {
      event.preventDefault();
      window.history.pushState(null, '', link.hash);
      goToSection(link.hash.slice(1));
    }
  });
  window.addEventListener('hashchange', () => goToSection(window.location.hash.slice(1)));
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) load();
  });
  await load();
}

if (document.querySelector('.booth-guide')) init();
