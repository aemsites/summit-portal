/** Synthetic navigation checks; never use live attendee services. */
export default async function verifyBoothTransition(
  page,
  root = 'http://localhost:3000',
  size = { width: 2160, height: 3840 },
  email = 'multi@example.test',
) {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Transition checks require the local fixture server.');
  }
  const sample = (selector) => page.locator(selector).evaluate((element) => {
    const css = getComputedStyle(element);
    const { x, y, width, height } = element.getBoundingClientRect();
    return {
      font: css.fontFamily,
      size: css.fontSize,
      weight: css.fontWeight,
      line: css.lineHeight,
      color: css.color,
      x,
      y,
      width,
      height,
    };
  });
  let selection;
  let verification;
  let decoration;
  let typography;
  let illustration;
  await page.addInitScript(() => {
    window.boothVisibleShifts = [];
    new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (document.documentElement.matches('.booth-report-active:not(.booth-report-pending)')) {
          window.boothVisibleShifts.push(entry.value);
        }
      });
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const parser = await page.context().newPage();
  // Use the production Author Kit boot sequence rather than the predecorated demo.
  await page.route('**/accounts/**', async (route) => {
    const response = await route.fetch();
    const html = await parser.evaluate((source) => {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      doc.querySelectorAll('main > .section > .block-content, main > .section > .default-content')
        .forEach((wrapper) => wrapper.replaceWith(...wrapper.childNodes));
      doc.querySelectorAll('script:not([src]), script[src="/scripts/booth-report.js"]:not([data-booth-mode]), link[href*="use.typekit.net"], link[href^="/blocks/"]')
        .forEach((element) => element.remove());
      const boot = doc.createElement('script');
      boot.type = 'module';
      boot.src = '/scripts/scripts.js';
      doc.head.append(boot);
      return `<!doctype html>${doc.documentElement.outerHTML}`;
    }, await response.text());
    await route.fulfill({ response, body: html });
  });
  await page.route('**/blocks/report-hero/report-hero.js', (route) => { decoration = route; });
  await page.route('**/img/booth/entry-webpage.png', (route) => { illustration = route; });
  await page.route('https://use.typekit.net/pbq1nqa.css', (route) => {
    if (new URL(page.url()).pathname.startsWith('/accounts/')) typography = route;
    else route.continue();
  });
  await page.setViewportSize(size);
  await page.route('**/auth/booth/select', (route) => { selection = route; });
  await page.route('**/auth/booth/status', (route) => {
    if (new URL(page.url()).pathname.startsWith('/accounts/')) verification = route;
    else route.continue();
  });
  try {
    await page.goto(`${root}/booth?preview=entry`);
    await page.waitForFunction(() => !document.querySelector('#email-form button[type="submit"]').disabled);
    await page.locator('#registration-email').fill(email);
    await page.locator('#email-form button[type="submit"]').click();
    let entry;
    if (email.startsWith('multi@')) {
      await page.locator('[data-panel="picker"]:not([hidden])').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const selected = page.waitForRequest('**/auth/booth/select');
      await page.locator('.report-option').first().click();
      await selected;
      entry = await sample('#booth-loading .booth-loading-title');
      const pending = page.waitForRequest('**/auth/booth/status');
      await selection.continue();
      await pending;
    } else if (!verification) {
      await page.waitForRequest('**/auth/booth/status');
    }
    const report = await sample('#booth-recovery .booth-loading-title');
    if (entry && JSON.stringify(entry) !== JSON.stringify(report)) {
      throw new Error(`Loading text changes across navigation: ${JSON.stringify({ entry, report })}`);
    }
    const decorating = decoration ? Promise.resolve() : page.waitForRequest('**/blocks/report-hero/report-hero.js');
    await verification.continue();
    if (!decoration) await decorating;
    await page.locator('html.booth-report-active.booth-report-pending').waitFor();
    if (await page.locator('main').isVisible()) throw new Error('Report revealed before decoration.');
    const fonts = page.waitForRequest('https://use.typekit.net/pbq1nqa.css');
    await decoration.continue();
    await fonts;
    if (await page.locator('main').isVisible()) throw new Error('Report revealed before typography.');
    if (JSON.stringify(report) !== JSON.stringify(await sample('#booth-recovery .booth-loading-title'))) {
      throw new Error('Decoration resized the report loader.');
    }
    await typography.continue();
    await page.waitForFunction(() => document.documentElement.dataset.boothContentReady === 'true');
    if (await page.locator('main').isVisible()) throw new Error('Report revealed before its first image.');
    await illustration.continue();
    await page.locator('html.booth-report-active:not(.booth-report-pending)').waitFor();
    const layout = await page.evaluate(async () => {
      const selectors = ['.rh-insight-text h1', '.report-hero', '.report-stats', '#booth-return'];
      const measure = () => selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing decorated content: ${selector}`);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { selector, x, y, width, height };
      });
      const first = measure();
      for (let frame = 0; frame < 90; frame += 1) {
        await new Promise((resolve) => { requestAnimationFrame(resolve); });
        const next = measure();
        if (first.some((initial, index) => ['x', 'y', 'width', 'height']
          .some((dimension) => Math.abs(initial[dimension] - next[index][dimension]) > 1))) {
          throw new Error(`Report shifted after reveal: ${JSON.stringify({ first, next })}`);
        }
      }
      const shifts = window.boothVisibleShifts.reduce((total, value) => total + value, 0);
      if (shifts > 0.001) throw new Error(`Visible report layout shift score: ${shifts}`);
      return first;
    });
    return { entry, report, layout };
  } finally {
    await parser.close();
    await page.unroute('**/accounts/**');
    await page.unroute('**/blocks/report-hero/report-hero.js');
    await page.unroute('**/img/booth/entry-webpage.png');
    await page.unroute('https://use.typekit.net/pbq1nqa.css');
    await page.unroute('**/auth/booth/select');
    await page.unroute('**/auth/booth/status');
  }
}
