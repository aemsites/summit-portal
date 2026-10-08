import { readBoothPresentation, withBoothPresentation } from './booth-presentation.js';
import { createBoothInactivity } from './booth-session.js';

const portraitQuery = '(min-width: 1000px) and (min-height: 1600px) and (max-aspect-ratio: 3/4)';
const compositionQuery = '(min-width: 1000px) and (min-height: 1600px) and (aspect-ratio: 9/16)';
const guards = new WeakMap();

function clearVisitorFields(root) {
  if (root.contains(document.activeElement)) document.activeElement.blur();
  root.querySelectorAll('form').forEach((form) => form.reset());
  root.querySelectorAll('input, textarea').forEach((input) => {
    if (['checkbox', 'radio'].includes(input.type)) input.checked = false;
    else input.value = '';
  });
}

function isBoothDownload(link) {
  const href = link.getAttribute('href') || '';
  const path = URL.canParse(href, window.location.href) ? new URL(href, window.location.href).pathname : '';
  return link.hasAttribute('download') || /\.pdf$/i.test(path)
    || link.matches('.rc-download-btn, .rd-cta-btn, .rd-pdf-tag')
    || (link.closest('.report-download') && /\/content\/|media_/.test(path));
}

export function restrictBoothLinks(root) {
  root.querySelectorAll('a').forEach((link) => {
    if (isBoothDownload(link)) {
      link.hidden = true;
      link.dataset.boothDownloadDisabled = 'true';
      link.removeAttribute('href');
      link.removeAttribute('download');
    }
    if (link.hasAttribute('target')) link.removeAttribute('target');
  });
  root.querySelectorAll('form[target]').forEach((form) => form.removeAttribute('target'));
}

function createReportGuard(key, expiresAt, presentation, pendingVerification = false) {
  if (guards.has(key)) return guards.get(key);
  const html = document.documentElement;
  let revision = 0;
  let resetting = false;
  let interrupted = false;
  let pending = Promise.resolve();
  let inactivity;
  if (!document.querySelector('style[data-booth-report-safety]')) {
    const style = document.createElement('style');
    style.dataset.boothReportSafety = 'true';
    style.textContent = `
      :is(.booth-report-pending, .booth-report-clearing) body > :not(#booth-return, #booth-recovery) { display: none !important; }
      :is(.booth-report-active, .booth-report-pending) [data-booth-download-disabled] { display: none !important; }
      #booth-recovery { position: fixed; inset: 0; z-index: 101; padding: 32px; background: #fff; color: #222; font: 700 clamp(22px, 2.6vw, 56px)/1.4 adobe-clean, sans-serif; }
      #booth-recovery[hidden] { display: none !important; }
      #booth-recovery button { min-height: 64px; padding: 24px; font: inherit; cursor: pointer; }
    `;
    document.head.append(style);
  }
  const recovery = document.getElementById('booth-recovery') || document.createElement('aside');
  if (!recovery.id) {
    recovery.id = 'booth-recovery';
    recovery.setAttribute('aria-label', 'Booth recovery');
    recovery.innerHTML = '<p role="alert">Checking this booth report...</p><button type="button" data-booth-recover>Retry and clear screen</button>';
    document.body.append(recovery);
  }
  const recoveryButton = recovery.querySelector('[data-booth-recover]');
  const recoveryMessage = recovery.querySelector('p') || document.createElement('p');
  if (!recoveryMessage.parentElement) {
    recoveryMessage.setAttribute('role', 'alert');
    if (recovery.firstChild?.nodeType === Node.TEXT_NODE) {
      recoveryMessage.append(recovery.firstChild);
    } else {
      recoveryMessage.textContent = 'Checking this booth report...';
    }
    recovery.prepend(recoveryMessage);
  }
  const hide = () => {
    interrupted = true;
    inactivity.stop();
    html.classList.add('booth-report-clearing');
    clearVisitorFields(document);
    const control = document.getElementById('booth-return');
    control?.querySelectorAll('a, button:not([data-booth-clear])').forEach((action) => { action.hidden = true; });
  };
  const fail = (error) => {
    hide();
    html.style.visibility = '';
    recovery.hidden = false;
    recoveryMessage.textContent = error.message;
    recoveryButton.disabled = false;
    const control = document.getElementById('booth-return');
    const status = control?.querySelector('p');
    if (status) {
      status.textContent = error.message;
      status.hidden = false;
    }
  };
  async function reset() {
    if (resetting) return;
    resetting = true;
    revision += 1;
    hide();
    recovery.hidden = false;
    recoveryButton.disabled = true;
    recoveryMessage.textContent = 'Clearing this screen...';
    try {
      await pending;
      const result = await fetch('/auth/booth/reset', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok || (await result.json()).state !== 'entry') {
        throw new Error('Could not clear the booth. Retry or ask the booth team.');
      }
      window.location.replace(withBoothPresentation('/booth', presentation));
    } catch (error) {
      resetting = false;
      fail(error);
    }
  }
  function activity() {
    if (interrupted || resetting) return;
    inactivity.activity();
  }
  inactivity = createBoothInactivity({
    reset,
    onError: fail,
    track(operation) {
      pending = Promise.allSettled([pending, operation]).then(() => undefined);
    },
  });
  const guard = {
    fail,
    reset,
    get revision() { return revision; },
    get interrupted() { return interrupted; },
    get resetting() { return resetting; },
    track(operation) {
      pending = Promise.allSettled([pending, operation]).then(() => undefined);
    },
    conceal() { hide(); },
    activate(context) {
      if (interrupted) return false;
      const remaining = Math.min(expiresAt, context.expiresAt) - Date.now();
      if (remaining <= 0) {
        fail(new Error('This booth report has expired. Retry and clear the screen.'));
        return false;
      }
      inactivity.setExpiry(Date.now() + remaining);
      recovery.hidden = true;
      inactivity.activity(false);
      return true;
    },
  };
  guards.set(key, guard);
  recoveryButton.addEventListener('click', reset);
  ['pointerdown', 'pointermove', 'keydown', 'input', 'change', 'scroll']
    .forEach((name) => document.addEventListener(name, activity, { capture: true, passive: true }));
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a');
    if (!link) return;
    if (link.dataset.boothDownloadDisabled || isBoothDownload(link)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (link.hasAttribute('target')) link.removeAttribute('target');
  }, true);
  window.addEventListener('pagehide', () => {
    revision += 1;
    hide();
    html.style.visibility = 'hidden';
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reset();
  });
  window.addEventListener('popstate', reset);
  if (pendingVerification) {
    inactivity.setExpiry(expiresAt, false);
    activity();
  }
  return guard;
}

/** Move the original analysis nodes into native disclosures, reversibly. */
export function createBoothPerformanceLayout(root) {
  const cards = new Map();

  function restore(card, { details, origins }) {
    const focused = document.activeElement;
    const restoreFocus = details.contains(focused);
    origins.forEach(({ node, marker }) => marker.replaceWith(node));
    details.remove();
    cards.delete(card);
    if (restoreFocus) {
      const target = focused === details.firstElementChild
        ? card.querySelector('.rsc-page-name a') : focused;
      target?.focus({ preventScroll: true });
    }
  }

  return (active) => {
    cards.forEach((state, card) => {
      if (!active || !root.contains(card)) restore(card, state);
    });
    if (!active) return;
    root.querySelectorAll('.report-scores .rsc-card').forEach((card) => {
      if (cards.has(card)) return;
      const body = card.querySelector('.rsc-body');
      const name = card.querySelector('.rsc-page-name')?.textContent;
      const nodes = [...card.querySelectorAll('.rsc-summary, .rsc-suggestion, .rsc-verify-link')];
      if (!body || !name || !nodes.length) return;
      const focused = document.activeElement;
      const restoreFocus = nodes.some((node) => node.contains(focused));
      const details = document.createElement('details');
      details.className = 'booth-score-analysis';
      details.open = restoreFocus;
      const summary = document.createElement('summary');
      const label = () => {
        summary.textContent = details.open ? 'Close analysis' : 'Read analysis';
        summary.setAttribute('aria-label', `${summary.textContent} for ${name}`);
      };
      label();
      details.addEventListener('toggle', label);
      const content = document.createElement('div');
      content.className = 'booth-score-analysis-content';
      details.append(summary, content);
      const origins = nodes.map((node) => {
        const marker = document.createComment('Original performance analysis position');
        node.before(marker);
        content.append(node);
        return { node, marker };
      });
      body.append(details);
      cards.set(card, { details, origins });
      if (restoreFocus) focused.focus({ preventScroll: true });
    });
  };
}

/** Split ISO month ticks without changing their dates or the chart's data. */
export function formatBoothChartDates(root, portrait) {
  root.querySelectorAll('.report-carousel .rc-line-svg text').forEach((tick) => {
    const date = tick.dataset.boothDate || tick.textContent;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return;
    if (!portrait) {
      if (tick.dataset.boothDate) {
        tick.textContent = date;
        delete tick.dataset.boothDate;
        tick.removeAttribute('aria-label');
      }
      return;
    }
    if (tick.dataset.boothDate) return;
    tick.dataset.boothDate = date;
    tick.setAttribute('aria-label', date);
    const [year, month] = date.split('-');
    const monthName = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })
      .format(new Date(`${year}-${month}-01T00:00:00Z`));
    tick.replaceChildren();
    [monthName, year].forEach((line, index) => {
      const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      span.setAttribute('x', tick.getAttribute('x'));
      span.setAttribute('dy', index ? '1.15em' : '0');
      span.textContent = line;
      tick.append(span);
    });
  });
}

/** Mount only on the server-selected booth document, never a query-string opt-in. */
export default async function mountBoothReturn() {
  if (document.querySelector('link[data-booth-report-layout]')) return;
  const marker = document.querySelector('script[data-booth-mode]');
  const presentation = readBoothPresentation(window.location.search);
  let guard;
  let response;
  let context;
  if (marker) {
    document.documentElement.classList.add('booth-report-pending');
    const expiresAt = Number(marker.dataset.boothExpiresAt);
    guard = createReportGuard(
      marker,
      Number.isFinite(expiresAt) ? expiresAt : Date.now(),
      presentation,
      true,
    );
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      guard.fail(new Error('This booth report has expired. Retry and clear the screen.'));
      return;
    }
  }
  try {
    response = await fetch('/auth/booth/status', {
      credentials: 'same-origin',
      cache: 'no-store',
      ...(marker ? { signal: AbortSignal.timeout(10000) } : {}),
    });
    if (!response.ok) throw new Error('This booth report could not be verified. Retry and clear the screen.');
    context = await response.json();
  } catch (error) {
    if (guard) guard.fail(error);
    else if (response?.ok !== false) throw error;
    return;
  }
  const demo = context.state === 'demo' && context.demoId
    && context.selectedPath === `/example-report/${context.demoId}/`;
  if ((!demo && context.state !== 'report') || context.selectedPath !== window.location.pathname
    || !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now()) {
    guard?.fail(new Error('This booth report is no longer active. Retry and clear the screen.'));
    return;
  }
  if (marker && marker.dataset.boothMode !== context.state) {
    guard.fail(new Error('This booth report is no longer active. Retry and clear the screen.'));
    return;
  }
  if (guard?.interrupted) return;
  if (document.querySelector('link[data-booth-report-layout]')) return;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/styles/booth-report.css';
  stylesheet.dataset.boothReportLayout = 'true';
  stylesheet.addEventListener('error', () => {
    // eslint-disable-next-line no-console
    console.warn('Booth portrait layout unavailable.');
  });
  document.head.append(stylesheet);
  const existingControl = document.getElementById('booth-return');
  const html = document.documentElement;
  const control = existingControl || document.createElement('aside');
  if (!existingControl) {
    control.id = 'booth-return';
    control.setAttribute('aria-label', 'Booth report controls');
    if (demo) {
      control.innerHTML = '<div class="booth-demo-notice"><strong>Example report</strong><span>Not a report for your company.</span></div><a href="/booth?step=demos">Change industry</a><button data-booth-clear type="button">Clear for next visitor</button><p role="status" hidden></p>';
      control.querySelector('strong').textContent = `${context.company} · Example report`;
    } else {
      control.innerHTML = '<a href="/booth?step=finish">Finish reading my report ↗</a><button data-booth-picker type="button" hidden>Choose another report</button><button data-booth-clear type="button">Clear for next visitor</button><small class="booth-download-note">PDFs are available in your emailed report.</small><p role="status" hidden></p>';
    }
    const style = document.createElement('style');
    style.textContent = `
    .booth-report-active body { padding-bottom: calc(var(--booth-original-padding) + var(--booth-return-height)); }
    #booth-return { position: fixed; inset: auto 0 0; z-index: 100; display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: space-between; padding: 24px; background: #1d1d1d; color: #fff; font: 700 clamp(20px, 2.6vw, 56px)/1.3 adobe-clean, sans-serif; }
    #booth-return a { display: block; padding: 24px 32px; border-radius: 12px; background: #eb1000; color: #fff; text-decoration: none; }
    #booth-return button { min-height: 64px; border: 0; background: transparent; color: #fff; font: inherit; text-decoration: underline; cursor: pointer; }
    #booth-return :focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
    #booth-return p { width: 100%; margin: 0; }
    #booth-return .booth-demo-notice { width: 100%; display: grid; gap: 8px; }
    #booth-return .booth-demo-notice span { font-size: .65em; font-weight: 400; }
    #booth-return .booth-download-note { width: 100%; font-size: .65em; font-weight: 400; }
  `;
    document.head.append(style);
    html.style.setProperty('--booth-original-padding', getComputedStyle(document.body).paddingBottom);
    document.body.append(control);
  }
  if (!control.querySelector('p')) {
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.hidden = true;
    control.append(status);
  }
  control.querySelector('a').href = withBoothPresentation(demo ? '/booth?step=demos' : '/booth?step=finish', presentation);
  restrictBoothLinks(document);
  if (!existingControl) {
    guard ||= createReportGuard(control, context.expiresAt, presentation);
    if (!guard.activate(context)) return;
  } else if (guard && !guard.activate(context)) return;
  const concealedContent = document.getElementById('booth-report-content');
  if (concealedContent) concealedContent.replaceWith(...concealedContent.childNodes);
  html.classList.add('booth-report-active');
  html.classList.remove('booth-request-pending', 'booth-report-pending');
  const portrait = window.matchMedia(portraitQuery);
  const composition = window.matchMedia(compositionQuery);
  const root = document.querySelector('main') || document.body;
  const layout = createBoothPerformanceLayout(root);
  const reconcile = () => {
    restrictBoothLinks(document);
    formatBoothChartDates(root, portrait.matches);
    const active = composition.matches && html.classList.contains('booth-report-active')
      && !html.classList.contains('booth-report-clearing');
    html.classList.toggle('booth-report-composition', active);
    layout(active);
  };
  const charts = new MutationObserver(reconcile);
  charts.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'target', 'download'] });
  charts.observe(html, { attributes: true, attributeFilter: ['class'] });
  portrait.addEventListener('change', reconcile);
  composition.addEventListener('change', reconcile);
  reconcile();
  document.addEventListener('pointerup', (event) => {
    if (!portrait.matches || event.pointerType === 'mouse') return;
    const point = event.target.closest('.report-carousel .rc-line-hit, .report-carousel .rc-chart-hover');
    if (!point) return;
    // Reuse the chart renderer's value formatting and hit testing on touch.
    point.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: event.clientX,
      clientY: event.clientY,
    }));
  });
  const reserveSpace = () => html.style.setProperty('--booth-return-height', `${control.getBoundingClientRect().height}px`);
  new ResizeObserver(reserveSpace).observe(control);
  reserveSpace();
  const containNavigation = (event) => {
    if (!html.classList.contains('booth-report-active')) return;
    const link = event.target.closest?.('a[href]');
    if (!link || control.contains(link)) return;
    if (link.closest('#booth-recovery') && link.getAttribute('href') === '/booth?recover=1') return;
    if (link.getAttribute('href').trim().startsWith('#')
      && !link.hasAttribute('download') && (!link.target || link.target === '_self')
      && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
      && event.type !== 'auxclick') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = control.querySelector('p');
    status.textContent = 'Links and downloads stay closed on this shared screen. Ask the booth team to help you open them on your own device.';
    status.hidden = false;
  };
  ['click', 'auxclick'].forEach((name) => document.body.addEventListener(name, containNavigation, true));
  fetch('/auth/booth/view', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: window.location.pathname }),
  }).then((result) => {
    if (!result.ok) throw new Error('Booth report activity could not be recorded. Ask the booth team.');
  }).catch((error) => {
    if (html.classList.contains('booth-report-clearing')) return;
    const status = control.querySelector('p');
    status.textContent = error.message;
    status.hidden = false;
  });
  if (existingControl) return;
  (control.querySelector('[data-booth-clear]') || control.querySelector('button')).addEventListener('click', guard.reset);
  const picker = control.querySelector('[data-booth-picker]');
  if (picker) {
    picker.hidden = context.canChooseAnother !== true;
    picker.addEventListener('click', async () => {
      if (guard.interrupted || guard.resetting) return;
      const current = guard.revision;
      guard.conceal();
      const transition = fetch('/auth/booth/picker', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(10000),
      });
      guard.track(transition);
      try {
        const result = await transition;
        if (!result.ok || (await result.json()).state !== 'picker') {
          throw new Error('Your reports could not be checked. Retry and clear this screen.');
        }
        if (current === guard.revision) {
          window.location.replace(withBoothPresentation('/booth?step=picker', presentation));
        }
      } catch (error) {
        if (current === guard.revision) guard.fail(error);
      }
    });
  }
}

if (window.location.pathname.startsWith('/accounts/')
  || document.querySelector('script[data-booth-mode]')) {
  mountBoothReturn().catch((error) => {
    const marker = document.querySelector('script[data-booth-mode]');
    if (marker) guards.get(marker)?.fail(error);
    // eslint-disable-next-line no-console
    console.warn('Booth report controls unavailable.');
  });
}
