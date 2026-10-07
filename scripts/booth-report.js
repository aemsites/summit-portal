import { readBoothPresentation, withBoothPresentation } from './booth-presentation.js';

const portraitQuery = '(min-width: 1000px) and (min-height: 1600px) and (max-aspect-ratio: 3/4)';
const compositionQuery = '(min-width: 1000px) and (min-height: 1600px) and (aspect-ratio: 9/16)';

function clearRequestFields(root) {
  root.querySelectorAll('form').forEach((form) => form.reset());
  root.querySelectorAll('input, textarea').forEach((input) => {
    if (['checkbox', 'radio'].includes(input.type)) input.checked = false;
    else input.value = '';
  });
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
  const requestMarker = document.querySelector('script[data-booth-mode="request"]');
  if (requestMarker) {
    document.documentElement.classList.add('booth-request-pending');
    window.addEventListener('pagehide', () => clearRequestFields(document));
  }
  const response = await fetch('/auth/booth/status', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    if (requestMarker) throw new Error('This booth request could not be verified. Return to the booth and try again.');
    return;
  }
  const context = await response.json();
  const demo = context.state === 'demo' && context.demoId
    && context.selectedPath === `/example-report/${context.demoId}/`;
  const requesting = context.state === 'request' && context.selectedPath === '/request-report';
  if ((!demo && !requesting && context.state !== 'report') || context.selectedPath !== window.location.pathname
    || !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now()) {
    if (requestMarker) throw new Error('This booth request has expired. Return to the booth to start again.');
    return;
  }
  if (requestMarker && !requesting) throw new Error('This booth request is no longer active. Return to the booth.');
  if (document.querySelector('link[data-booth-report-layout]')) return;
  const presentation = readBoothPresentation(window.location.search);
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
      control.innerHTML = '<div class="booth-demo-notice"><strong>Example report</strong><span>Not a report for your company.</span></div><button class="booth-request-action" type="button">Request my report</button><a href="/booth?step=demos">Change industry</a><button data-booth-clear type="button">Clear for next visitor</button><p role="status" hidden></p>';
      control.querySelector('strong').textContent = `${context.company} · Example report`;
    } else if (requesting) {
      control.innerHTML = '<a href="/booth?step=demos">Back to industry demos</a><button data-booth-clear type="button">Clear for next visitor</button><p role="status" hidden></p>';
    } else {
      control.innerHTML = '<a href="/booth?step=finish">Finish reading my report ↗</a><button type="button">Clear for next visitor</button><p role="status" hidden></p>';
    }
    const style = document.createElement('style');
    style.textContent = `
    .booth-report-active body { padding-bottom: calc(var(--booth-original-padding) + var(--booth-return-height)); }
    .booth-report-clearing body > :not(#booth-return) { display: none !important; }
    #booth-return { position: fixed; inset: auto 0 0; z-index: 100; display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: space-between; padding: 24px; background: #1d1d1d; color: #fff; font: 700 clamp(20px, 2.6vw, 56px)/1.3 adobe-clean, sans-serif; }
    #booth-return a { display: block; padding: 24px 32px; border-radius: 12px; background: #eb1000; color: #fff; text-decoration: none; }
    #booth-return button { min-height: 64px; border: 0; background: transparent; color: #fff; font: inherit; text-decoration: underline; cursor: pointer; }
    #booth-return :focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
    #booth-return p { width: 100%; margin: 0; }
    #booth-return .booth-demo-notice { width: 100%; display: grid; gap: 8px; }
    #booth-return .booth-demo-notice span { font-size: .65em; font-weight: 400; }
    #booth-return .booth-request-action { padding: 24px 32px; border-radius: 12px; background: #3b63fb; text-decoration: none; }
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
  control.querySelector('a').href = withBoothPresentation(demo || requesting ? '/booth?step=demos' : '/booth?step=finish', presentation);
  html.classList.add('booth-report-active');
  if (requesting) html.classList.add('booth-request-active');
  html.classList.remove('booth-request-pending');
  const portrait = window.matchMedia(portraitQuery);
  const composition = window.matchMedia(compositionQuery);
  const root = document.querySelector('main') || document.body;
  const layout = createBoothPerformanceLayout(root);
  const reconcile = () => {
    formatBoothChartDates(root, portrait.matches);
    const active = composition.matches && html.classList.contains('booth-report-active')
      && !html.classList.contains('booth-report-clearing');
    html.classList.toggle('booth-report-composition', active);
    layout(active);
  };
  const charts = new MutationObserver(reconcile);
  charts.observe(root, { childList: true, subtree: true });
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
  if (!demo && !requesting) {
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
  }
  if (existingControl) return;
  let idle;
  let revision = 0;
  let resetting = false;
  let pending = Promise.resolve();
  const clearFields = () => {
    if (!requesting) return;
    clearRequestFields(root);
  };
  async function reset() {
    if (resetting) return;
    resetting = true;
    clearTimeout(idle);
    revision += 1;
    clearFields();
    html.classList.add('booth-report-clearing');
    document.documentElement.style.visibility = 'hidden';
    try {
      await pending;
      const result = await fetch('/auth/booth/reset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!result.ok) throw new Error('Could not clear the booth. Ask the booth team.');
      window.location.replace(withBoothPresentation('/booth', presentation));
    } catch (error) {
      resetting = false;
      document.documentElement.style.visibility = '';
      control.querySelector('a').hidden = true;
      const status = control.querySelector('p');
      status.textContent = error.message;
      status.hidden = false;
    }
  }
  function activity() {
    clearTimeout(idle);
    idle = setTimeout(reset, 120000);
  }
  (control.querySelector('[data-booth-clear]') || control.querySelector('button')).addEventListener('click', reset);
  if (demo) {
    const requestButton = control.querySelector('.booth-request-action');
    requestButton.addEventListener('click', async () => {
      if (requestButton.disabled || html.classList.contains('booth-report-clearing')) return;
      requestButton.disabled = true;
      const current = revision;
      const status = control.querySelector('p');
      status.textContent = 'Opening a fresh report request...';
      status.hidden = false;
      const transition = fetch('/auth/booth/request', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      pending = transition.then(() => undefined, () => undefined);
      try {
        const result = await transition;
        if (!result.ok) throw new Error('The request form could not be opened. Retry or ask the booth team.');
        const next = await result.json();
        if (next.state !== 'request' || next.selectedPath !== '/request-report') {
          throw new Error('The request form could not be opened.');
        }
        if (current === revision) {
          window.location.assign(withBoothPresentation(next.selectedPath, presentation));
        }
      } catch (error) {
        if (current === revision) {
          status.textContent = error.message;
          requestButton.disabled = false;
        }
      }
    });
  }
  if (requesting) {
    document.addEventListener('booth-request-complete', () => {
      control.querySelector('[data-booth-clear]').textContent = 'Finish and clear this screen';
    });
  }
  ['pointerdown', 'keydown', ...(requesting ? ['input', 'change'] : [])]
    .forEach((name) => document.addEventListener(name, activity));
  window.addEventListener('pagehide', () => {
    revision += 1;
    clearFields();
    clearTimeout(idle);
    document.documentElement.style.visibility = 'hidden';
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reset();
  });
  setTimeout(reset, Math.max(0, context.expiresAt - Date.now()));
  activity();
}

if (window.location.pathname.startsWith('/accounts/')
  || document.querySelector('script[data-booth-mode]')) {
  mountBoothReturn().catch((error) => {
    if (document.querySelector('script[data-booth-mode="request"]')) {
      clearRequestFields(document);
      document.documentElement.classList.remove('booth-request-pending');
      const root = document.querySelector('main');
      const notice = document.createElement('p');
      notice.setAttribute('role', 'alert');
      notice.textContent = error.message;
      const back = document.createElement('a');
      back.href = withBoothPresentation('/booth', readBoothPresentation(window.location.search));
      back.textContent = 'Return to the booth';
      root.replaceChildren(notice, back);
    }
    // eslint-disable-next-line no-console
    console.warn('Booth report controls unavailable.');
  });
}
