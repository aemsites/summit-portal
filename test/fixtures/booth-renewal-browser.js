/** Verify non-destructive renewal recovery with public markup and local synthetic access. */
export default async function verifyBoothRenewal(page, root = 'http://localhost:3002') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Renewal checks must not drive production attendee sessions.');
  }
  const viewport = { width: 1440, height: 1100 };
  const context = await page.context().browser().newContext({ viewport, hasTouch: true });
  const calls = [];
  try {
    const target = await context.newPage();
    const errors = [];
    target.on('pageerror', (error) => errors.push(error.message));
    const publicResponse = await context.request.get('https://act.aem.now/example-report/frescopa/');
    if (!publicResponse.ok()) throw new Error('Public sample unavailable.');
    const publicHtml = await publicResponse.text();
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== root && (url.pathname.startsWith('/auth/')
        || !['GET', 'HEAD'].includes(request.method()))) return route.abort();
      if (url.hostname.includes('simpleanalytics') || url.pathname.startsWith('/.rum')) {
        return route.fulfill({ contentType: 'text/javascript', body: '' });
      }
      return route.continue();
    });
    await context.route(`${root}/auth/me`, (route) => route.fulfill({ contentType: 'application/json', body: '{"authenticated":false}' }));
    const selection = await context.request.post(`${root}/auth/booth/lookup`, { data: { email: 'visitor@example.test' } });
    if (!selection.ok()) throw new Error('Synthetic selection failed.');
    const visit = await selection.json();
    const path = visit.selectedPath;
    visit.expiresAt = Date.now() + 120000;
    await context.route(`${root}/auth/booth/status*`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(visit) }));
    const template = await (await context.request.get(root + path)).text();
    const safety = template.match(/<style id="booth-report-concealment">[\s\S]*?<\/style>/)?.[0];
    const recovery = template.match(/<aside id="booth-recovery">[\s\S]*?<\/aside><noscript>[\s\S]*?<\/noscript>/)?.[0];
    if (!safety || !recovery) throw new Error('Missing Worker concealment contract.');
    await context.route(`${root}${path}*`, (route) => {
      const bridge = new URL(route.request().url()).searchParams.get('touchscreen') === 'frame'
        ? '<script src="/scripts/booth-touchscreen-device.js"></script>' : '';
      const html = publicHtml.replace(/<html([^>]*)>/, '<html$1 class="booth-report-pending">')
        .replace('<head>', `<head>${bridge}${safety}<script type="module" data-booth-mode="report" data-booth-expires-at="${visit.expiresAt}" src="/scripts/booth-report.js?v=booth-transitions-1"></script>`)
        .replace(/(<body[^>]*>)/, `$1${recovery}<div id="booth-report-content" hidden>`)
        .replace('</body>', '</div></body>');
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    });
    await context.route('**/media_*', async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({ response: await context.request.get(`https://act.aem.now${url.pathname.replace(path, '/example-report/frescopa/')}${url.search}`) });
    });
    await context.route(`${root}/fragments/nav/**`, async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({ response: await context.request.get(`https://act.aem.now${url.pathname}`) });
    });
    await context.route(`${root}/auth/booth/activity`, (route) => {
      calls.push(Date.now());
      if (calls.length === 1) {
        return route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: '{"error":"Report authorization cannot be checked right now."}',
        });
      }
      const { idleMs } = JSON.parse(route.request().postData());
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ expiresAt: Date.now() + 900000 - idleMs }),
      });
    });
    await target.goto(`${root}/booth?touchscreen=1`);
    const report = target.frames().find((frame) => frame.url().includes(path));
    if (!report) throw new Error('Selected report did not open.');
    await report.waitForFunction(() => document.documentElement.matches(
      '.booth-report-active:not(.booth-report-pending):not(.booth-report-clearing)',
    ));
    await report.evaluate(() => {
      document.querySelector('.booth-kpi-toggle')
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    });
    const hint = report.locator('#booth-return [data-booth-connection]');
    try {
      await hint.waitFor({ state: 'visible', timeout: 5000 });
    } catch (error) {
      const state = await report.evaluate(() => ({
        classes: document.documentElement.className,
        remaining: Number(document.querySelector('script[data-booth-mode]')?.dataset.boothExpiresAt) - Date.now(),
        recovery: document.querySelector('#booth-recovery p')?.textContent,
        scripts: [...document.scripts].filter((script) => script.src.includes('booth-report')).map((script) => script.src),
      }));
      throw new Error(`${error.message}; calls=${calls.length}; state=${JSON.stringify(state)}`);
    }
    const during = await report.evaluate(() => ({
      viewport: [window.innerWidth, window.innerHeight],
      readable: getComputedStyle(document.querySelector('main')).display !== 'none',
      clearing: document.documentElement.classList.contains('booth-report-clearing'),
      recoveryHidden: document.querySelector('#booth-recovery').hidden,
      finishEnabled: !document.querySelector('#booth-return a').hidden,
    }));
    if (!during.readable || during.clearing || !during.recoveryHidden || !during.finishEnabled) {
      throw new Error('Temporary renewal failure interrupted the report.');
    }
    await hint.waitFor({ state: 'hidden', timeout: 45000 });
    if (calls.length !== 2 || calls[1] - calls[0] < 29500) {
      throw new Error('Automatic retry did not respect its backoff.');
    }
    if (errors.length) throw new Error(errors.join('; '));
    return { during, calls: calls.length, retryDelayMs: calls[1] - calls[0] };
  } finally {
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  }
}
