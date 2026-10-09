/** Real public markup/modules, local synthetic visits only; never send attendee requests. */
export default async function verifyBoothStyles(page, root, publicReport) {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)
    || !publicReport?.includes('src="/scripts/scripts.js"')) {
    throw new Error('Use the local fixture server and the published public report HTML.');
  }
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  const cases = [
    { mode: 'demo', framed: false, outcome: 'load' },
    { mode: 'demo', framed: true, outcome: 'load' },
    { mode: 'report', framed: false, outcome: 'load' },
    { mode: 'report', framed: true, outcome: 'load' },
    { mode: 'demo', framed: false, outcome: 'error' },
    { mode: 'report', framed: true, outcome: 'timeout' },
  ];
  for (const test of cases) {
    const context = await page.context().browser().newContext({
      viewport: test.framed ? { width: 1366, height: 900 } : { width: 2160, height: 3840 },
      hasTouch: true,
    });
    let release;
    try {
      const target = await context.newPage();
      const errors = [];
      target.on('pageerror', (error) => errors.push(error.message));
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
      const selection = await context.request.post(`${root}/auth/booth/${test.mode === 'demo' ? 'demo' : 'lookup'}`, { data: test.mode === 'demo' ? { id: 'frescopa' } : { email: 'visitor@example.test' } });
      check(selection.ok(), 'Synthetic report selection failed');
      const visit = await selection.json();
      const path = visit.selectedPath;
      const template = await (await context.request.get(`${root}${path}`)).text();
      const concealment = template.match(/<style id="booth-report-concealment">[\s\S]*?<\/style>/)?.[0];
      const recovery = template.match(/<aside id="booth-recovery">[\s\S]*?<\/aside><noscript>[\s\S]*?<\/noscript>/)?.[0];
      check(concealment && recovery, 'Missing real server concealment contract');
      await context.route(`${root}${path}*`, (route) => {
        const bridge = new URL(route.request().url()).searchParams.get('touchscreen') === 'frame'
          ? '<script src="/scripts/booth-touchscreen-device.js"></script>' : '';
        const html = publicReport.replace(/<html([^>]*)>/, '<html$1 class="booth-report-pending">')
          .replace('<head>', `<head>${bridge}${concealment}<script type="module" data-booth-mode="${visit.state}" data-booth-expires-at="${visit.expiresAt}" src="/scripts/booth-report.js"></script>`)
          .replace(/(<body[^>]*>)/, `$1${recovery}<div id="booth-report-content" hidden>`)
          .replace('</body>', '</div></body>');
        return route.fulfill({ contentType: 'text/html', body: html });
      });
      await context.route('**/media_*', async (route) => {
        const url = new URL(route.request().url());
        const publicPath = url.pathname.replace(path, '/example-report/frescopa/');
        const response = await context.request.get(`https://act.aem.now${publicPath}${url.search}`);
        check(response.ok(), `Public media unavailable: ${publicPath}`);
        await route.fulfill({ response });
      });
      await context.route(`${root}/fragments/nav/**`, async (route) => {
        const url = new URL(route.request().url());
        const response = await context.request.get(`https://act.aem.now${url.pathname}`);
        await route.fulfill({ response });
      });
      await context.addInitScript(() => {
        document.addEventListener('booth-content-ready', () => {
          const stripe = document.querySelector('link[href="/blocks/cannes-stripe/cannes-stripe.css"]');
          window.boothStyleReadiness = { pendingStripe: Boolean(stripe && !stripe.sheet) };
        }, { once: true });
      });
      let held;
      const requested = new Promise((resolve) => { held = resolve; });
      const continueStyle = new Promise((resolve) => { release = resolve; });
      await context.route(`${root}/blocks/cannes-stripe/cannes-stripe.css`, async (route) => {
        held(route.request().frame());
        await continueStyle;
        if (test.outcome === 'error') {
          await route.fulfill({
            status: 503,
            contentType: 'text/plain',
            headers: { 'x-content-type-options': 'nosniff' },
            body: 'Synthetic stylesheet outage',
          });
        } else await route.continue();
      });
      await target.bringToFront();
      await target.goto(test.framed ? `${root}/booth?touchscreen=1` : `${root}${path}`, { waitUntil: 'domcontentloaded' });
      const report = await requested;
      await report.waitForFunction(() => document.documentElement.dataset.boothContentReady === 'true');
      const pending = await report.evaluate(() => ({
        atReadiness: window.boothStyleReadiness,
        pendingStripe: !document.querySelector('link[href="/blocks/cannes-stripe/cannes-stripe.css"]').sheet,
        hidden: getComputedStyle(document.querySelector('main')).visibility === 'hidden',
        recoveryActionsVisible: !document.querySelector('.booth-recovery-actions').hidden,
        failed: document.documentElement.classList.contains('booth-report-clearing'),
      }));
      check(
        pending.pendingStripe && pending.hidden
          && !pending.recoveryActionsVisible && !pending.failed,
        `Pending stylesheet did not retain loading safely: ${JSON.stringify(pending)}`,
      );
      if (test.outcome !== 'timeout') {
        await target.waitForTimeout(2000);
        check(await report.evaluate(() => document.documentElement.matches(
          '.booth-report-pending:not(.booth-report-clearing)',
        )), 'Report did not remain loading while its stylesheet was held');
        release();
      }
      await report.waitForFunction(() => (
        !document.documentElement.classList.contains('booth-report-pending')
        || document.documentElement.classList.contains('booth-report-clearing')
      ), null, { timeout: 15000 });
      const result = await report.evaluate(() => {
        const stripe = document.querySelector('link[href="/blocks/cannes-stripe/cannes-stripe.css"]');
        const main = document.querySelector('main');
        const hero = document.querySelector('.report-hero');
        const box = hero.getBoundingClientRect();
        return {
          message: document.querySelector('#booth-recovery p').textContent,
          recoveryHidden: document.querySelector('#booth-recovery').hidden,
          visible: getComputedStyle(main).visibility === 'visible'
            && getComputedStyle(main).display !== 'none',
          stripeLoaded: Boolean(stripe.sheet),
          viewport: [window.innerWidth, window.innerHeight],
          hero: [box.x, box.y, box.width, box.height, getComputedStyle(hero).fontFamily],
          pending: document.documentElement.classList.contains('booth-report-pending'),
        };
      });
      check(errors.length === 0, `Unexpected page exceptions: ${errors.join('; ')}`);
      if (test.outcome === 'load') {
        check(
          result.visible && result.recoveryHidden && result.stripeLoaded && !result.pending,
          `Successful CSS failed to reveal the report: ${JSON.stringify(result)}`,
        );
        check(result.viewport[0] === 2160 && result.viewport[1] === 3840, 'Wrong report CSS viewport');
        const direct = results.find((item) => item.mode === test.mode && !item.framed);
        if (direct) {
          check(
            JSON.stringify(direct.hero) === JSON.stringify(result.hero),
            'Direct and production-frame report geometry differs',
          );
        }
      } else {
        check(
          !result.visible && !result.recoveryHidden
          && result.message.includes(test.outcome === 'error' ? 'styles could not be loaded' : 'content timed out'),
          `Genuine stylesheet failure did not remain concealed: ${JSON.stringify(result)}`,
        );
        release();
        if (test.outcome === 'timeout') {
          await report.waitForFunction(() => document.querySelector(
            'link[href="/blocks/cannes-stripe/cannes-stripe.css"]',
          ).sheet, null, { timeout: 5000 });
        }
        check(
          await report.evaluate(() => document.documentElement.classList.contains('booth-report-clearing')),
          'Late CSS reactivated a failed report',
        );
      }
      results.push({ ...test, ...result });
    } finally {
      release?.();
      // Cancel optional lazy-asset callbacks when closing this isolated scenario.
      await context.unrouteAll({ behavior: 'ignoreErrors' });
      await context.close();
    }
  }
  return results;
}
