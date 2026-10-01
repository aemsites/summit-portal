/** Mount only on the real selected report, never on a query-string opt-in. */
export default async function mountBoothReturn() {
  if (document.getElementById('booth-return')) return;
  const response = await fetch('/auth/booth/status', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return;
  const context = await response.json();
  if (context.selectedPath !== window.location.pathname || !context.expiresAt) return;
  if (document.getElementById('booth-return')) return;
  const control = document.createElement('aside');
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
  const html = document.documentElement;
  html.style.setProperty('--booth-original-padding', getComputedStyle(document.body).paddingBottom);
  html.classList.add('booth-report-active');
  document.body.append(control);
  const reserveSpace = () => html.style.setProperty('--booth-return-height', `${control.getBoundingClientRect().height}px`);
  new ResizeObserver(reserveSpace).observe(control);
  reserveSpace();
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
