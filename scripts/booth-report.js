import { readBoothPresentation, withBoothPresentation } from './booth-presentation.js';
import { createBoothInactivity } from './booth-session.js';
import { mountBoothKeyboard } from './booth-keyboard.js?v=booth-keyboard-scroll-1';

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
      :is(.booth-report-pending, .booth-report-clearing) body { zoom: 1 !important; }
      :is(.booth-report-pending, .booth-report-clearing) body > :not(#booth-recovery),
      :is(.booth-report-pending, .booth-report-clearing) body > :not(#booth-recovery) * { visibility: hidden !important; pointer-events: none !important; }
      .booth-report-pending:not(.booth-report-clearing) #booth-report-content[hidden] { display: block !important; }
      .booth-report-clearing body > :not(#booth-return, #booth-recovery) { display: none !important; }
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
  recovery.querySelector('a[href="/booth?recover=1"]')
    ?.setAttribute('href', withBoothPresentation('/booth?recover=1', presentation));
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
  const loading = recovery.querySelector('[data-booth-loading]') || document.createElement('div');
  if (!loading.parentElement) {
    loading.dataset.boothLoading = 'true';
    const ring = document.createElement('span');
    ring.className = 'booth-loading-ring';
    ring.setAttribute('aria-hidden', 'true');
    loading.append(ring, recoveryMessage);
    recovery.prepend(loading);
  }
  const ring = loading.querySelector('.booth-loading-ring');
  const recoveryActions = recovery.querySelector('.booth-recovery-actions') || document.createElement('div');
  if (!recoveryActions.parentElement) {
    recoveryActions.className = 'booth-recovery-actions';
    recoveryActions.append(...[...recovery.childNodes].filter((node) => node !== loading));
    recovery.append(recoveryActions);
  }
  if (!document.querySelector('#booth-report-concealment, link[data-booth-loading]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/styles/booth-loading.css';
    stylesheet.dataset.boothLoading = 'true';
    document.head.append(stylesheet);
  }
  function pendingMessage(text) {
    recovery.hidden = false;
    loading.classList.add('booth-loading', 'booth-loading-overlay');
    loading.setAttribute('role', 'status');
    recoveryMessage.classList.add('booth-loading-title');
    recoveryMessage.removeAttribute('role');
    recoveryMessage.textContent = text;
    ring.hidden = false;
    recoveryActions.hidden = true;
  }
  pendingMessage('Opening your report...');
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
    loading.classList.remove('booth-loading', 'booth-loading-overlay');
    loading.removeAttribute('role');
    recoveryMessage.setAttribute('role', 'alert');
    recoveryMessage.textContent = error.message;
    ring.hidden = true;
    recoveryActions.hidden = false;
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
    pendingMessage('Clearing this screen...');
    recoveryButton.disabled = true;
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
    onConnectionChange(error) {
      const status = document.querySelector('#booth-return [data-booth-connection]');
      if (status) {
        status.textContent = error ? 'Connection interrupted. Reconnecting without clearing your report.' : '';
        status.hidden = !error;
      }
    },
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
    conceal() { hide(); pendingMessage('Opening your reports...'); },
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
    inactivity.activity(false);
  }
  return guard;
}

/** Keep readable KPI previews and one reversible control for each overview. */
export function createBoothKpiLayout(root) {
  const cards = new Map();
  const groups = new Map();
  const attributes = ['role', 'tabindex', 'aria-expanded'];
  let sequence = 0;

  const render = (group) => {
    const members = [...cards].filter(([, entry]) => entry.group === group);
    members.forEach(([, { panel }]) => { panel.dataset.expanded = String(group.expanded); });
    group.focusTarget = members[0]?.[0] || group.focusTarget;
    group.button.setAttribute('aria-controls', members.map(([, { panel }]) => panel.id).join(' '));
    group.button.setAttribute('aria-expanded', String(group.expanded));
    group.button.setAttribute('aria-label', group.expanded
      ? 'Show insight previews for all pillars' : 'Read full insights for all pillars');
    const label = group.expanded ? 'Show less' : 'Read full insights';
    const hint = group.expanded
      ? 'Showing all insights in full' : 'All insights expand together';
    if (group.button.textContent !== label) group.button.textContent = label;
    if (group.hint.textContent !== hint) group.hint.textContent = hint;
  };

  return (active) => {
    cards.forEach(({ panel, description, marker, original, group }, card) => {
      if (active && root.contains(card) && group.container.contains(card)
        && description.textContent.trim()) return;
      const focused = document.activeElement;
      const restoreFocus = panel.contains(focused);
      marker.replaceWith(description);
      panel.remove();
      original.forEach(([name, value]) => {
        if (value === null) card.removeAttribute(name);
        else card.setAttribute(name, value);
      });
      cards.delete(card);
      if (restoreFocus) focused.focus({ preventScroll: true });
    });
    if (active) {
      root.querySelectorAll('.report-stats.dark .rs-dark-card').forEach((card) => {
        if (cards.has(card)) return;
        const description = card.querySelector('.rs-dark-desc');
        const name = card.querySelector('.rs-dark-label')?.textContent;
        if (!name || !description?.textContent.trim()) return;
        const container = card.closest('.report-stats.dark');
        let group = groups.get(container);
        if (!group) {
          const controls = document.createElement('div');
          controls.className = 'booth-kpi-controls';
          const hint = document.createElement('p');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'booth-kpi-toggle';
          controls.append(hint, button);
          const strip = container.querySelector(':scope > .rs-dark-strip');
          if (strip) strip.after(controls);
          else container.append(controls);
          group = {
            container, controls, hint, button, expanded: false, focusTarget: card,
          };
          groups.set(container, group);
          button.addEventListener('click', () => {
            group.expanded = !group.expanded;
            render(group);
          });
        }
        const panel = document.createElement('div');
        panel.className = 'booth-kpi-insight';
        do {
          sequence += 1;
          panel.id = `booth-kpi-insight-${sequence}`;
        } while (document.getElementById(panel.id));
        const focused = document.activeElement;
        const restoreFocus = description.contains(focused);
        if (restoreFocus) group.expanded = true;
        const marker = document.createComment('Original KPI explanation position');
        description.before(marker);
        panel.append(description);
        marker.after(panel);
        const original = attributes.map((attribute) => [attribute, card.getAttribute(attribute)]);
        attributes.forEach((attribute) => card.removeAttribute(attribute));
        cards.set(card, { panel, description, marker, original, group });
        if (restoreFocus) focused.focus({ preventScroll: true });
      });
    }
    groups.forEach((group, container) => {
      const hasCards = [...cards.values()].some((entry) => entry.group === group);
      if (active && root.contains(container) && hasCards) {
        render(group);
        return;
      }
      const restoreFocus = document.activeElement === group.button;
      group.controls.remove();
      groups.delete(container);
      if (restoreFocus && group.focusTarget.isConnected) {
        group.focusTarget.focus({ preventScroll: true });
      }
    });
  };
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

function requiredReportStyles() {
  return [...document.querySelectorAll('link[rel="stylesheet"]')].filter((link) => {
    const { origin, pathname } = new URL(link.href, window.location.href);
    return (origin === window.location.origin
      && (pathname === '/styles/styles.css' || pathname.startsWith('/blocks/')))
      || link.hasAttribute('data-booth-report-layout')
      || link.href === 'https://use.typekit.net/pbq1nqa.css';
  });
}

function waitForReportStyles(signal) {
  return Promise.all(requiredReportStyles().map((link) => {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (link.sheet) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const complete = (event) => {
        link.removeEventListener('load', complete);
        link.removeEventListener('error', complete);
        signal.removeEventListener('abort', complete);
        if (signal.aborted) reject(signal.reason);
        else if (event?.type === 'error') {
          reject(new Error('The report styles could not be loaded. Retry and clear the screen.'));
        } else resolve();
      };
      link.addEventListener('load', complete, { once: true });
      link.addEventListener('error', complete, { once: true });
      signal.addEventListener('abort', complete, { once: true });
      if (signal.aborted || link.sheet) complete();
    });
  }));
}

async function waitForReportContent() {
  if (!document.querySelector('script[src="/scripts/scripts.js"]')) return;
  const controller = new AbortController();
  let timer;
  let onReady;
  const decorated = document.documentElement.dataset.boothContentReady !== 'true'
    ? new Promise((resolve) => {
      onReady = resolve;
      document.addEventListener('booth-content-ready', onReady, { once: true });
    }) : Promise.resolve();
  const ready = async () => {
    await decorated;
    await waitForReportStyles(controller.signal);
    // Hidden content must request its actual faces before the first visible paint.
    await Promise.all([
      document.fonts.load('400 36px adobe-clean'),
      document.fonts.load('700 36px adobe-clean'),
      document.fonts.load('900 96px adobe-clean-display'),
    ]);
    await document.fonts.ready;
    const first = document.querySelector('main > .section') || document.querySelector('main');
    await Promise.all([...(first?.querySelectorAll('img') || [])].map(async (image) => {
      image.loading = 'eager';
      try {
        await image.decode();
      } catch {
        // eslint-disable-next-line no-console
        console.warn('[booth] Report image unavailable; retaining its reserved layout.');
      }
    }));
    // Lazy report enhancements can add styles while fonts and images settle.
    do {
      await waitForReportStyles(controller.signal);
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    } while (requiredReportStyles().some((link) => !link.sheet));
  };
  try {
    await Promise.race([
      ready(),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('The report content timed out. Retry and clear the screen.')), 10000);
      }),
    ]);
  } finally {
    controller.abort();
    clearTimeout(timer);
    if (onReady) document.removeEventListener('booth-content-ready', onReady);
  }
}

/** Mount only on the server-selected booth document, never a query-string opt-in. */
export default async function mountBoothReturn() {
  if (document.querySelector('link[data-booth-report-layout]')) return;
  const marker = document.querySelector('script[data-booth-mode]');
  if (!marker) return;
  const presentation = readBoothPresentation(window.location.search);
  document.documentElement.classList.add('booth-report-pending');
  const expiresAt = Number(marker.dataset.boothExpiresAt);
  const guard = createReportGuard(
    marker,
    Number.isFinite(expiresAt) ? expiresAt : Date.now(),
    presentation,
    true,
  );
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    guard.fail(new Error('This booth report has expired. Retry and clear the screen.'));
    return;
  }
  let context;
  try {
    const response = await fetch('/auth/booth/status', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('This booth report could not be verified. Retry and clear the screen.');
    context = await response.json();
  } catch (error) {
    guard.fail(error);
    return;
  }
  const demo = context.state === 'demo' && context.demoId
    && context.selectedPath === `/example-report/${context.demoId}/`;
  if ((!demo && context.state !== 'report') || context.selectedPath !== window.location.pathname
    || !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now()) {
    guard.fail(new Error('This booth report is no longer active. Retry and clear the screen.'));
    return;
  }
  if (marker.dataset.boothMode !== context.state) {
    guard.fail(new Error('This booth report is no longer active. Retry and clear the screen.'));
    return;
  }
  if (guard.interrupted) return;
  if (document.querySelector('link[data-booth-report-layout]')) return;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/styles/booth-report.css';
  stylesheet.dataset.boothReportLayout = 'true';
  const layoutReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The report layout timed out. Retry and clear the screen.')), 10000);
    const complete = () => { clearTimeout(timer); resolve(); };
    stylesheet.addEventListener('load', complete, { once: true });
    stylesheet.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('The report layout could not be loaded. Retry and clear the screen.'));
    }, { once: true });
  });
  document.head.append(stylesheet);
  try {
    await layoutReady;
  } catch (error) {
    guard.fail(error);
    return;
  }
  if (guard.interrupted) return;
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
    html.style.setProperty('--booth-original-padding', getComputedStyle(document.body).paddingBottom);
    document.body.append(control);
  }
  if (!control.querySelector('p')) {
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.hidden = true;
    control.append(status);
  }
  if (!control.querySelector('[data-booth-connection]')) {
    const connection = document.createElement('p');
    connection.dataset.boothConnection = 'true';
    connection.setAttribute('role', 'status');
    connection.hidden = true;
    control.append(connection);
  }
  control.querySelector('a').href = withBoothPresentation(demo ? '/booth?step=demos' : '/booth?step=finish', presentation);
  restrictBoothLinks(document);
  html.classList.add('booth-report-active');
  html.classList.toggle('booth-report-composition', window.matchMedia(compositionQuery).matches);
  try {
    await waitForReportContent();
  } catch (error) {
    if (!guard.interrupted) guard.fail(error);
    return;
  }
  if (guard.interrupted || !guard.activate(context)) return;
  const concealedContent = document.getElementById('booth-report-content');
  if (concealedContent) concealedContent.replaceWith(...concealedContent.childNodes);
  html.classList.add('booth-report-active');
  html.classList.remove('booth-request-pending', 'booth-report-pending');
  const keyboard = mountBoothKeyboard(document, control);
  window.addEventListener('pagehide', () => keyboard.destroy(), { once: true });
  const portrait = window.matchMedia(portraitQuery);
  const composition = window.matchMedia(compositionQuery);
  const root = document.querySelector('main') || document.body;
  const layout = createBoothPerformanceLayout(root);
  const kpiLayout = createBoothKpiLayout(root);
  const reconcile = () => {
    restrictBoothLinks(document);
    formatBoothChartDates(root, portrait.matches);
    const active = composition.matches && html.classList.contains('booth-report-active')
      && !html.classList.contains('booth-report-clearing');
    html.classList.toggle('booth-report-composition', active);
    layout(active);
    kpiLayout(active);
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
    if (link.closest('#booth-recovery')
      && link.getAttribute('href') === withBoothPresentation('/booth?recover=1', presentation)) return;
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

if (document.querySelector('script[data-booth-mode]')) {
  mountBoothReturn().catch((error) => {
    const marker = document.querySelector('script[data-booth-mode]');
    if (marker) guards.get(marker)?.fail(error);
    // eslint-disable-next-line no-console
    console.warn('Booth report controls unavailable.');
  });
}
