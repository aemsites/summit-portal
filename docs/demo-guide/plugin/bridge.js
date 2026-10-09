/* global chrome */
(() => {
  let previous = '';
  let scheduled = false;
  let stale = false;
  const visible = (element) => element && !element.closest('[hidden]')
    && element.getBoundingClientRect().height > 0
    && getComputedStyle(element).visibility !== 'hidden';

  function readScreen() {
    const path = window.location.pathname.replace(/\/$/, '');
    const example = path.startsWith('/example-report/');
    let screen = null;
    if (path === '/login') screen = 'login';
    else if (path === '/booth') {
      if ([...document.querySelectorAll('#booth-recovery, [data-panel="recovery"]')].some(visible)) screen = 'recovery';
      else if (visible(document.querySelector('[data-panel="finish"]'))) screen = 'finish';
      else if (visible(document.querySelector('[data-panel="demos"]'))) screen = 'demos';
      else screen = 'entry';
    } else if (example || path.includes('/portal-landing')) {
      screen = 'overview';
      if (visible(document.querySelector('#booth-recovery'))
        || document.documentElement.classList.contains('booth-report-clearing')) screen = 'recovery';
      else {
        const candidates = [
          ['.report-carousel, .report-hero, .report-stats.dark', 'overview'],
          ['.report-ai-visibility:not(.rav-empty-shell)', 'visibility'],
          ['.report-ai-visibility .rav-panels-outer > .rav-panels:first-child', 'competitors'],
          ['.report-ai-visibility .rav-panels-outer > .rav-panels:nth-child(2)', 'platforms'],
          ['.report-stats:not(.dark)', 'search'],
          ['.report-scores', 'performance'],
        ].flatMap(([selector, name]) => [...document.querySelectorAll(selector)]
          .filter(visible).map((element) => ({ element, name })));
        const readingLine = Math.min(220, window.innerHeight * 0.3);
        const current = candidates.filter(({ element }) => {
          const rect = element.getBoundingClientRect();
          return rect.top <= readingLine && rect.bottom > readingLine;
        }).at(-1);
        if (current) screen = current.name;
      }
    }
    return { screen, example };
  }

  function report() {
    scheduled = false;
    if (stale) return;
    const state = readScreen();
    if (!state.screen || JSON.stringify(state) === previous) return;
    previous = JSON.stringify(state);
    try {
      chrome.runtime.sendMessage({ type: 'BOOTH_SCREEN', ...state }).catch((error) => {
        if (/Extension context invalidated/.test(error.message)) {
          stale = true;
          console.warn('[Booth guide] Reload this tab after updating the extension.');
        } else console.error('[Booth guide] Cannot sync screen', error);
      });
    } catch (error) {
      stale = true;
      console.warn('[Booth guide] Reload this tab after updating the extension.', error.message);
    }
  }

  function schedule() {
    if (scheduled || stale) return;
    scheduled = true;
    requestAnimationFrame(report);
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'READ_SCREEN') respond(readScreen());
  });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('resize', schedule);
  report();
})();
