/** Exact picker geometry and asynchronous icon checks using synthetic local reports only. */
export default async function verifyBoothPicker(page, root = 'http://localhost:3000') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Picker checks require the local fixture server.');
  }
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const match = async (selector, expected) => {
    const actual = await page.locator(selector).evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    });
    Object.entries(expected).forEach(([key, value]) => {
      check(Math.abs(actual[key] - value) < 2, `${selector} ${key}: ${actual[key]} != ${value}`);
    });
    return actual;
  };
  await page.setViewportSize({ width: 2160, height: 2881 });
  await page.goto(`${root}/booth?preview=entry`);
  await page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  await page.locator('#registration-email').fill('figma-picker@example.test');
  await page.locator('#email-form button[type="submit"]').click();
  await page.locator('[data-panel="picker"]:not([hidden])').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.report-site-icon')].every((image) => !image.hidden));
  await page.waitForFunction(() => {
    const artwork = document.querySelector('.picker-illustration img');
    return artwork.complete && artwork.naturalWidth === 1140 && artwork.naturalHeight === 963;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await match('.picker-marquee', { x: 0, y: 277, width: 2160, height: 963 });
  await match('.picker-intro h2', { x: 100, y: 529.5, width: 840, height: 352 });
  await match('.picker-intro p', { x: 100, y: 921.5, width: 840, height: 66 });
  await match('.picker-illustration', { x: 1020, y: 341, width: 1140, height: 835 });
  await match('.picker-illustration img', { x: 1020, y: 277, width: 1140, height: 963 });
  await match('.report-option:nth-child(1)', { x: 112, y: 1352, width: 928, height: 180 });
  await match('.report-option:nth-child(2)', { x: 1120, y: 1352, width: 928, height: 180 });
  await match('.report-option:nth-child(3)', { x: 112, y: 1604, width: 928, height: 180 });
  await match('.report-option:first-child .report-icon', { x: 156, y: 1410, width: 64, height: 64 });
  await match('.report-option:first-child .report-label', { x: 252, y: 1418, width: 414, height: 48 });
  await match('.picker-panel [data-reset]', { x: 835.5, y: 1928, width: 489, height: 120 });
  check(await page.locator('.picker-panel [data-reset]').evaluate((button) => (
    parseFloat(getComputedStyle(button).borderRadius) >= button.getBoundingClientRect().height / 2
  )), 'Picker return action is not the approved outlined pill');
  await match('.stage-footer', { x: 0, y: 2652, width: 2160, height: 229 });
  check(await page.locator('.report-label').allTextContents().then((labels) => labels.join('|'))
    === 'Amazon — amazon.com|Amazon — amazon.co.uk|Unity — unity.com', 'Picker copy differs');
  const cards = await page.locator('.report-option').evaluateAll((elements) => elements.map((element) => {
    const css = getComputedStyle(element);
    return {
      background: css.backgroundColor,
      border: parseFloat(css.borderWidth),
      radius: parseFloat(css.borderRadius),
      padding: parseFloat(css.padding),
    };
  }));
  check(cards.every((card) => card.background === 'rgb(248, 248, 248)' && card.border === 4
    && card.radius === 26 && card.padding === 40), 'Native report-card styling differs');
  for (const [width, height] of [[2160, 3840], [1080, 1920], [390, 844]]) {
    await page.setViewportSize({ width, height });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Picker overflows horizontally');
    const button = await page.locator('.picker-panel [data-reset]').boundingBox();
    check(button.height >= 64, 'Picker return target is too small');
    const targets = await page.locator('.report-option').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    check(targets.every((value) => value >= 64), 'Report selection target is too small');
    if (width === 2160) {
      await match('.report-option:first-child', { x: 112, y: 1352, width: 928, height: 180 });
      await match('.stage-footer', { y: 3611, height: 229 });
    }
  }
  await page.locator('.picker-panel [data-reset]').click();
  await page.locator('[data-panel="welcome"]:not([hidden])').waitFor();
  check(await page.locator('.report-option').count() === 0, 'Reset retained previous website icons or reports');

  await page.setViewportSize({ width: 2160, height: 3840 });
  await page.route('**/auth/booth/icon?*', (route) => route.fulfill({ status: 404, body: 'Synthetic missing icon' }));
  await page.locator('#registration-email').fill('figma-picker@example.test');
  await page.locator('#email-form button[type="submit"]').click();
  await page.locator('.report-icon[title="Website icon unavailable"]').first().waitFor();
  check(await page.locator('.report-option:disabled').count() === 0, 'Missing icons blocked report selection');
  await page.route('**/auth/booth/select', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic selection failure"}' }));
  await page.locator('.report-option').first().click();
  await page.locator('#picker-status').filter({ hasText: 'Synthetic selection failure' }).waitFor();
  check(await page.locator('.report-option').first().isEnabled(), 'Failed selection did not restore its card');
  check(await page.locator('#booth-loading').isHidden(), 'Failed selection retained the loading overlay');
  await page.unroute('**/auth/booth/select');
  await page.unroute('**/auth/booth/icon?*');
  await page.locator('.picker-panel [data-reset]').click();
  await page.locator('[data-panel="welcome"]:not([hidden])').waitFor();
  return { cards, checked: 'Exact Figma reference and native/half-size/mobile geometry; first-party icons; missing-image recovery; selection failure; reset scrubbing. Synthetic local reports only.' };
}
