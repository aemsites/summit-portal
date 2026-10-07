/** Use an authorized staff page without booth cookies; customer content stays read-only. */
export default async function verifyExistingBoothReport(page, reportURL, assetRoot = 'http://localhost:3000') {
  const report = new URL(reportURL);
  const assets = new URL(assetRoot);
  if (!report.pathname.startsWith('/accounts/')
    || !['localhost', '127.0.0.1'].includes(assets.hostname)) {
    throw new Error('Use an existing protected report and the local-only booth asset server.');
  }
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const initialPages = page.context().pages().length;
  check(await page.evaluate(() => navigator.maxTouchPoints > 0), 'Use hasTouch: true');
  let state = {
    state: 'report',
    selectedPath: report.pathname,
    expiresAt: Date.now() + 600000,
    delivery: 'ready',
  };
  const suppressedActions = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => (
    ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort()
  ));
  const paths = [
    '/scripts/booth.js', '/scripts/booth-report.js', '/scripts/booth-keyboard.js',
    '/styles/booth.css', '/styles/booth-report.css', '/styles/booth-keyboard.css',
  ];
  for (const path of paths) {
    const response = await page.request.get(new URL(path, assets).href);
    check(response.ok(), `Missing local branch asset ${path}`);
    const body = await response.text();
    await page.route(`**${path}*`, (route) => route.fulfill(
      { contentType: path.endsWith('.css') ? 'text/css' : 'text/javascript', body },
    ));
  }
  const shell = await page.request.get(new URL('/booth.html', assets).href);
  check(shell.ok(), 'Local booth shell is unavailable');
  const shellHTML = await shell.text();
  await page.route(`${report.origin}/booth*`, (route) => route.fulfill(
    { contentType: 'text/html', body: shellHTML },
  ));
  await page.route(`${report.origin}/auth/booth/**`, async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').pop();
    if (action === 'status') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) });
    } else if (action === 'view') {
      suppressedActions.push(action);
      await route.fulfill({ contentType: 'application/json', body: '{}' });
    } else if (action === 'reset') {
      suppressedActions.push(action);
      state = { state: 'entry' };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) });
    } else {
      suppressedActions.push(action);
      await route.abort();
      throw new Error(`Unexpected booth action ${action}; no live request was sent.`);
    }
  });
  const profiles = [];
  await page.setViewportSize({ width: 2160, height: 3840 });
  const response = await page.goto(report.href);
  check(response.ok() && new URL(page.url()).pathname === report.pathname, 'Protected report did not open');
  await page.locator('#booth-return').waitFor();
  await page.waitForFunction(() => {
    const heading = document.querySelector('main h1');
    return heading && !heading.classList.contains('rh-typing');
  });
  const title = (await page.locator('main h1').textContent()).trim();
  check(title.length > 0, 'Existing report has no heading');
  for (const [width, height] of [[2160, 3840], [1080, 1920]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    const profile = await page.evaluate(() => {
      const bar = document.querySelector('#booth-return').getBoundingClientRect();
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        controlTop: bar.top,
        controlBottom: bar.bottom,
      };
    });
    check(!profile.overflow && profile.controlTop >= 0 && profile.controlBottom <= height, 'Report or controls overflow');
    profiles.push(profile);
  }
  const carousel = page.locator('.report-carousel .rc-tab').nth(1);
  if (await carousel.count()) {
    await carousel.tap();
    check(await carousel.evaluate((button) => button.classList.contains('active')), 'Touch tab selection failed');
    check(await page.locator('.report-carousel [data-tab="1"]:not([hidden])').isVisible(), 'Selected tab content stayed hidden');
  }
  const analysis = page.locator('.booth-score-analysis summary').first();
  if (await analysis.count()) {
    await analysis.tap();
    check(await analysis.evaluate((summary) => summary.parentElement.open), 'Performance analysis did not open');
  }
  const link = page.locator('main a[href^="http"]').first();
  check(await link.count() > 0, 'Existing report has no external link to exercise');
  await link.tap();
  await page.getByRole('status').filter({ hasText: 'shared screen' }).waitFor();
  const download = page.locator('main a[href*=".pdf"]').first();
  if (await download.count()) await download.tap();
  check(new URL(page.url()).pathname === report.pathname
    && page.context().pages().length === initialPages, 'Report link or download escaped');
  await page.getByRole('link', { name: 'Finish reading my report' }).tap();
  await page.waitForURL((url) => url.pathname === '/booth' && url.searchParams.get('step') === 'finish');
  await page.locator('[data-panel="finish"]:not([hidden])').waitFor();
  await page.locator('#report-preview .rh-insight-text h3').waitFor();
  const previewTitle = (await page.locator('#report-preview .rh-insight-text h3').textContent()).trim();
  check(previewTitle === title, `Finish preview title differs: ${previewTitle} / ${title}`);
  check(await page.locator('#send-report').isVisible(), 'Finish email action disappeared');
  await page.locator('[data-panel="finish"] [data-reset]').tap();
  await page.waitForURL((url) => url.pathname === '/booth' && !url.searchParams.has('step'));
  await page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  check(await page.locator('#registration-email').inputValue() === '', 'Reset retained attendee data');
  check(!errors.length, `Page errors: ${errors.join('; ')}`);
  check(!suppressedActions.includes('send'), 'Email delivery was attempted');
  return {
    title,
    previewTitle,
    profiles,
    suppressedActions,
    checked: 'Existing authenticated customer content, touch tabs/disclosures, report link containment, matching real Finish preview and reset. Booth state/shell and backend mutations are intercepted; no lookup, email or live context mutation.',
  };
}
