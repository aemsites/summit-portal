const portraitQuery = '(min-width: 1000px) and (min-height: 1600px) and (max-aspect-ratio: 3/4)';

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

/** Mount only on the real selected report, never on a query-string opt-in. */
export default async function mountBoothReturn() {
  if (document.querySelector('link[data-booth-report-layout]')) return;
  const response = await fetch('/auth/booth/status', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return;
  const context = await response.json();
  if (context.state !== 'report' || context.selectedPath !== window.location.pathname
    || !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now()) return;
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
    control.innerHTML = '<a href="/booth?step=finish">Finish reading my report ↗</a><button type="button">Clear for next visitor</button><p role="status" hidden></p>';
    const style = document.createElement('style');
    style.textContent = `
    .booth-report-active body { padding-bottom: calc(var(--booth-original-padding) + var(--booth-return-height)); }
    .booth-report-clearing body > :not(#booth-return) { display: none !important; }
    #booth-return { position: fixed; inset: auto 0 0; z-index: 100; display: flex; flex-wrap: wrap; gap: 20px; align-items: center; justify-content: space-between; padding: 24px; background: #1d1d1d; color: #fff; font: 700 clamp(20px, 2.6vw, 56px)/1.3 adobe-clean, sans-serif; }
    #booth-return a { display: block; padding: 24px 32px; border-radius: 12px; background: #eb1000; color: #fff; text-decoration: none; }
    #booth-return button { min-height: 64px; border: 0; background: transparent; color: #fff; font: inherit; text-decoration: underline; cursor: pointer; }
    #booth-return :focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
    #booth-return p { width: 100%; margin: 0; }
  `;
    document.head.append(style);
    html.style.setProperty('--booth-original-padding', getComputedStyle(document.body).paddingBottom);
    document.body.append(control);
  }
  html.classList.add('booth-report-active');
  const portrait = window.matchMedia(portraitQuery);
  const formatDates = () => formatBoothChartDates(document, portrait.matches);
  const charts = new MutationObserver(formatDates);
  charts.observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
  portrait.addEventListener('change', formatDates);
  formatDates();
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
  if (existingControl) return;
  let idle;
  async function reset() {
    html.classList.add('booth-report-clearing');
    document.documentElement.style.visibility = 'hidden';
    try {
      const result = await fetch('/auth/booth/reset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!result.ok) throw new Error('Could not clear the booth. Ask the booth team.');
      window.location.replace('/booth');
    } catch (error) {
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
  control.querySelector('button').addEventListener('click', reset);
  ['pointerdown', 'keydown'].forEach((name) => document.addEventListener(name, activity));
  window.addEventListener('pagehide', () => {
    clearTimeout(idle);
    document.documentElement.style.visibility = 'hidden';
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reset();
  });
  setTimeout(reset, Math.max(0, context.expiresAt - Date.now()));
  activity();
}

if (window.location.pathname.startsWith('/accounts/')) {
  mountBoothReturn().catch(() => {
    // eslint-disable-next-line no-console
    console.warn('Booth report controls unavailable.');
  });
}
