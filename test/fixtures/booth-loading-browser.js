/** Local synthetic journeys only; never exercise live attendee services. */
export default async function verifyBoothLoading(page, root = 'http://localhost:3000') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Loading checks require the local-only booth fixture server.');
  }
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const ready = () => page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  let selection;
  const holdSelection = (route) => { selection = route; };
  await page.route('**/auth/booth/select', holdSelection);
  try {
    await page.setViewportSize({ width: 2160, height: 3840 });
    await page.goto(`${root}/content/index?preview=entry`);
    await ready();
    await page.locator('#registration-email').fill('multi@example.test');
    await page.locator('#email-form button').click();
    await page.locator('[data-panel="picker"]:not([hidden])').waitFor();
    for (const [width, height, minimumHeight, font] of [
      [2160, 3840, 120, 45], [1080, 1920, 72, 24], [390, 844, 64, 22],
    ]) {
      await page.setViewportSize({ width, height });
      const back = await page.locator('[data-panel="picker"] [data-reset]').evaluate((button) => ({
        height: button.getBoundingClientRect().height,
        font: parseFloat(getComputedStyle(button).fontSize),
        border: parseFloat(getComputedStyle(button).borderWidth),
        label: button.textContent,
      }));
      check(
        back.height >= minimumHeight && back.font >= font && back.border >= 2,
        `Picker back action is too small at ${width}px: ${JSON.stringify(back)}`,
      );
      check(back.label === 'Back to email lookup', 'Picker return copy differs from the industry chooser');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Picker overflows');
    }
    await page.setViewportSize({ width: 2160, height: 3840 });
    let requested = page.waitForRequest('**/auth/booth/select');
    await page.locator('#report-options button').first().click();
    await requested;
    check(await page.locator('#booth-loading').isVisible(), 'Selection has no immediate loading feedback');
    check(await page.locator('#stage').evaluate((stage) => stage.inert), 'Selection leaves covered controls active');
    await selection.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic selection failure"}' });
    await page.locator('#picker-status').filter({ hasText: 'Synthetic selection failure' }).waitFor();
    check(!await page.locator('#booth-loading').isVisible(), 'Failed selection leaves loading stuck');
    check(!await page.locator('#stage').evaluate((stage) => stage.inert), 'Failed selection keeps controls inert');
    check(await page.locator('#report-options button').first().evaluate((button) => (
      document.activeElement === button
    )), 'Failed selection does not restore focus');

    let verification;
    let stylesheet;
    const holdVerification = (route) => {
      if (new URL(page.url()).pathname.startsWith('/accounts/')) verification = route;
      else route.continue();
    };
    const holdStylesheet = (route) => { stylesheet = route; };
    await page.route('**/auth/booth/status', holdVerification);
    await page.route('**/styles/booth-report.css', holdStylesheet);
    try {
      requested = page.waitForRequest('**/auth/booth/select');
      await page.locator('#report-options button').first().click();
      await requested;
      const statusRequested = page.waitForRequest('**/auth/booth/status');
      await selection.continue();
      await statusRequested;
      await page.locator('#booth-recovery .booth-loading').waitFor();
      check(!await page.locator('main').isVisible(), 'Pending verification exposes report content');
      check(!await page.locator('[data-booth-recover]').isVisible(), 'Pending verification flashes recovery instructions');
      const loading = await page.locator('#booth-recovery .booth-loading').boundingBox();
      check(loading.width === 2160 && loading.height === 3840, 'Worker loading does not cover the touchscreen');
      const cssRequested = page.waitForRequest('**/styles/booth-report.css');
      await verification.continue();
      await cssRequested;
      check(!await page.locator('main').isVisible(), 'Report appears before portrait styling is ready');
      await stylesheet.continue();
      await page.locator('html.booth-report-active').waitFor();
      check(await page.locator('main').isVisible(), 'Verified, styled report stays concealed');
    } finally {
      await page.unroute('**/auth/booth/status', holdVerification);
      await page.unroute('**/styles/booth-report.css', holdStylesheet);
    }
  } finally {
    await page.unroute('**/auth/booth/select', holdSelection);
  }

  const timing = {};
  const delayReport = async (route) => {
    timing.htmlStart = Date.now();
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    timing.htmlReleased = Date.now();
    await route.continue();
  };
  const delayRenderer = async (route) => {
    timing.rendererStart = Date.now();
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    await route.continue();
  };
  await page.route('**/accounts/**', delayReport);
  await page.route('**/report-hero.js?v=booth-preview-6', delayRenderer);
  try {
    await page.locator('#booth-return a').first().click();
    await page.locator('#report-preview .booth-loading').waitFor();
    check(await page.locator('#send-report').isEnabled(), 'Preview loading blocks email delivery');
    const before = await page.locator('#report-preview').boundingBox();
    await page.locator('#report-preview .rh-insight-text h3').waitFor();
    await page.waitForFunction(() => document.querySelector('#report-preview').getAttribute('aria-busy') === 'false');
    timing.complete = Date.now();
    const after = await page.locator('#report-preview').boundingBox();
    check(Math.abs(before.height - after.height) < 2, 'Preview loading shifts Finish controls');
    check(timing.rendererStart < timing.htmlReleased, 'Renderer download still waits for the report HTML');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const ringAnimation = await page.evaluate(() => {
      const ring = document.querySelector('#booth-loading .booth-loading-ring');
      return getComputedStyle(ring).animationName;
    });
    check(ringAnimation === 'none', 'Reduced motion still animates the loader');
  } finally {
    await page.unroute('**/accounts/**', delayReport);
    await page.unroute('**/report-hero.js?v=booth-preview-6', delayRenderer);
  }
  return {
    checked: 'Touchscreen return sizing, pending/failed selection, concealed verification, styled reveal, stable Finish loading, concurrent renderer download, reduced motion. Synthetic data only.',
    previewMilliseconds: timing.complete - timing.htmlStart,
    rendererStartOffset: timing.rendererStart - timing.htmlStart,
  };
}
