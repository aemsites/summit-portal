/** Local fixture checks; no native keyboard, customer lookup or real submission. */
export default async function verifyBoothKeyboard(page, root = 'http://localhost:3000') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Keyboard checks require the local-only booth fixture server.');
  }
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  check(await page.evaluate(() => navigator.maxTouchPoints > 0), 'Use a browser context with hasTouch: true');
  const ready = () => page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  const entry = async (width, height) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${root}/booth?preview=entry&heading=Amplify+your+brand+visibility`);
    await ready();
    await page.evaluate(() => document.fonts.ready);
  };
  const fieldVisible = (selector, occlusion = 0) => page.evaluate(({ target, covered }) => {
    const element = document.querySelector(target);
    const bounds = element.getBoundingClientRect();
    const label = element.labels?.[0]?.getBoundingClientRect();
    const bar = document.querySelector('#booth-return')?.getBoundingClientRect();
    return Math.min(bounds.top, label?.top ?? bounds.top) >= 0
      && bounds.bottom <= Math.min(window.innerHeight - covered, bar?.top ?? window.innerHeight);
  }, { target: selector, covered: occlusion });
  for (const [width, height, reducedHeight] of [
    [2160, 3840, 2240], [1728, 3072, 1750], [1440, 2560, 1460],
    [1080, 1920, 1100], [1080, 1920, 960], [864, 1536, 875],
  ]) {
    await entry(width, height);
    await page.locator('#registration-email').focus();
    await page.setViewportSize({ width, height: reducedHeight });
    await page.waitForTimeout(100);
    check(await fieldVisible('#registration-email'), `Focused Entry email is hidden at ${width}x${reducedHeight}`);
    await page.keyboard.insertText('visitor@example.test');
    check(await fieldVisible('#registration-email'), 'Typing moved Entry below the visible viewport');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    check(await fieldVisible('#email-form button[type="submit"]'), 'Entry action cannot scroll above a resized keyboard');
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => !document.documentElement.classList.contains('booth-keyboard-active'));
    check(
      await page.locator('#registration-email').evaluate((field) => document.activeElement === field),
      'Viewport restoration must retain field focus for the dismissal regression',
    );
    check(
      await page.evaluate(() => document.documentElement.style.getPropertyValue('--booth-keyboard-inset') === '0px'),
      `Dismissed keyboard leaves phantom inset at ${width}x${height}`,
    );
  }
  await entry(1080, 1920);
  await page.locator('#registration-email').focus();
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'test-keyboard-overlay';
    overlay.style.cssText = 'position:fixed;inset:auto 0 0;height:820px;z-index:2147483647;background:#303030';
    document.body.append(overlay);
  });
  await page.waitForTimeout(100);
  check(await fieldVisible('#registration-email', 820), 'An overlay keyboard covers the focused Entry field');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  check(await fieldVisible('#email-form button[type="submit"]', 820), 'Entry action cannot scroll above an overlay keyboard');
  await page.locator('#registration-email').evaluate((field) => field.blur());
  await page.evaluate(() => document.getElementById('test-keyboard-overlay').remove());
  await page.waitForTimeout(100);
  check(!await page.locator('html.booth-keyboard-active').count(), 'Keyboard space remains after blur');
  await page.clock.install();
  await entry(1080, 1920);
  await page.locator('#registration-email').click();
  await page.clock.fastForward(890000);
  await page.keyboard.insertText('still-typing@example.test');
  await page.clock.fastForward(11000);
  check(await page.locator('#registration-email').inputValue() === 'still-typing@example.test', 'Active virtual-keyboard typing was cleared as idle');
  await page.clock.fastForward(889001);
  await page.waitForFunction(() => document.querySelector('#registration-email').value === '');
  await page.clock.resume();
  return { checked: 'Entry email after resize and dismissal without blur at native/scaled sizes; overlay reachability for email and action; blur cleanup; input-only activity and eventual idle reset. Retired booth requests are not reintroduced. Local fixtures only.' };
}
