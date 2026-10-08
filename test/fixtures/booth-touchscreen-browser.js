/** Interactive local simulator checks; no native Windows keyboard or live services. */
export default async function verifyBoothTouchscreen(page, root = 'http://localhost:3001') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Touchscreen checks require the local simulator server.');
  }
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const actions = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/auth/')) actions.push(request.url());
  });
  await page.bringToFront();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(root);
  const frame = page.frameLocator('#preview');
  const ready = () => frame.locator('#email-form button[type="submit"]:not([disabled])').waitFor();
  const start = async () => { await page.locator('#show-entry').click(); await ready(); };
  const state = () => frame.locator('html').evaluate((html) => ({
    height: window.innerHeight,
    width: window.innerWidth,
    focus: document.activeElement.id,
    inset: html.style.getPropertyValue('--booth-keyboard-inset'),
    active: html.classList.contains('booth-keyboard-active'),
  }));
  const keyboardShown = () => page.locator('#keyboard:not([hidden])').waitFor();
  const settled = () => page.waitForTimeout(120);
  await ready();
  await frame.locator('#registration-email').evaluate((field) => {
    field.dataset.inputs = '0';
    field.addEventListener('input', () => {
      field.dataset.inputs = String(Number(field.dataset.inputs) + 1);
    });
  });
  await frame.locator('#registration-email').click();
  await keyboardShown();
  for (const key of 'visitor@example.test') await page.locator(`[data-key="${key}"]`).click();
  check(await frame.locator('#registration-email').inputValue() === 'visitor@example.test', 'Clickable keys must type the exact email');
  check((await state()).focus === 'registration-email', 'Keyboard keys stole email focus');
  check(await frame.locator('#registration-email').getAttribute('data-inputs') === '20', 'Keys must dispatch real input events');
  await page.locator('[data-key="Backspace"]').click();
  await page.locator('[data-key="t"]').click();
  check(await frame.locator('#registration-email').inputValue() === 'visitor@example.test', 'Backspace failed');
  await page.locator('[data-key="Space"]').click();
  check(await frame.locator('#registration-email').inputValue() === 'visitor@example.test', 'Email must retain native whitespace sanitization');
  await page.keyboard.type('x');
  await page.keyboard.press('Backspace');
  check(await frame.locator('#registration-email').inputValue() === 'visitor@example.test', 'Physical keyboard stopped working');
  const bounds = await frame.locator('#registration-email').evaluate((field) => ({
    top: field.labels[0].getBoundingClientRect().top,
    bottom: field.getBoundingClientRect().bottom,
    actionBottom: field.form.querySelector('button').getBoundingClientRect().bottom,
  }));
  check(bounds.top >= 0 && bounds.bottom <= 2112 && bounds.actionBottom <= 2112, 'Overlay covers email/label/action');
  check((await state()).height === 3840, 'Overlay must not shrink the CSS layout viewport');
  const modes = [];
  for (const scenario of ['resize', 'geometry', 'overlay']) {
    await page.selectOption('#keyboard-mode', scenario);
    await settled();
    await frame.locator('#registration-email').click();
    await keyboardShown();
    await settled();
    const shown = await state();
    check(shown.height === (scenario === 'resize' ? 2112 : 3840), 'Wrong actual keyboard viewport');
    await page.locator('#dismiss-keyboard').click();
    await page.locator('#keyboard').waitFor({ state: 'hidden' });
    await settled();
    const hidden = await state();
    check(hidden.height === 3840 && hidden.focus === 'registration-email', 'Dismissal must restore height without blurring');
    if (scenario !== 'overlay') {
      check(hidden.inset === '0px' && !hidden.active, 'Reported dismissal left phantom reserve');
    } else {
      check(await page.locator('#coverage-warning').textContent(), 'Unreported reserve must be visible');
    }
    await frame.locator('#registration-email').click();
    await keyboardShown();
    modes.push({ scenario, shown, hidden });
  }
  const presets = [[2160, 3840], [1728, 3072], [1440, 2560], [1080, 1920], [864, 1536]];
  for (const [width, height] of presets) {
    await page.selectOption('#resolution', `${width}x${height}`);
    await settled();
    const resting = await state();
    check(resting.width === width && resting.height === height, 'Wrong preset CSS viewport');
    await page.selectOption('#keyboard-mode', 'resize');
    await frame.locator('#registration-email').click();
    await keyboardShown();
    await settled();
    check((await state()).height === height - Math.round(height * 0.45), 'Wrong scaled resize baseline');
    await page.locator('#hide-keyboard').click();
    await settled();
    check((await state()).height === height && !(await state()).active, 'Scaled dismissal leaves phantom reserve');
  }
  await page.selectOption('#resolution', '1080x1920');
  await start();
  await page.locator('[data-email="visitor@example.test"]').click();
  await keyboardShown();
  await page.locator('[data-key="Enter"]').click();
  await frame.locator('#booth-return').waitFor();
  check(await page.locator('#keyboard').isHidden(), 'Navigation retained the keyboard');
  await frame.getByRole('link', { name: 'Finish reading my report' }).click();
  await frame.locator('#send-report:not([disabled])').waitFor();
  await frame.locator('#send-report').click();
  await frame.locator('#finish-status').filter({ hasText: 'was emailed' }).waitFor();
  await frame.getByRole('button', { name: 'Finish and clear this screen' }).click();
  await ready();
  check(await frame.locator('#registration-email').inputValue() === '', 'Reset retained visitor details');
  await page.locator('[data-email="multi@example.test"]').click();
  await page.locator('[data-key="Enter"]').click();
  await frame.locator('#report-options button').nth(1).waitFor();
  await frame.locator('#report-options button').nth(1).click();
  await frame.locator('#booth-return').waitFor();
  await frame.getByRole('button', { name: 'Clear for next visitor', exact: true }).click();
  await ready();
  await frame.getByRole('button', { name: 'Staff: show industry demos' }).click();
  await frame.locator('#demo-options button').nth(9).waitFor();
  await frame.locator('#demo-options button').first().click();
  await frame.locator('#booth-return').waitFor();
  check(await frame.locator('#booth-return').textContent().then((text) => text.includes('Not a report for your company')), 'Demo lost its synthetic example journey');
  await frame.getByRole('link', { name: 'Change industry', exact: true }).click();
  await frame.locator('#demo-options button').nth(9).waitFor();
  await start();
  await page.locator('#show-finish').click();
  await frame.locator('#send-report:not([disabled])').waitFor();
  await start();
  check(actions.length > 0 && actions.every((url) => new URL(url).origin === new URL(root).origin), 'A fixture action contacted a nonlocal backend');
  check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  check(await page.locator('#connection-error').isHidden(), 'Navigation lost the pre-init simulator hook');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Small host viewport overflows horizontally');
  check(await page.locator('#show-entry').isVisible(), 'Operator actions disappeared on a small host');
  await page.setViewportSize({ width: 1366, height: 900 });
  const resting = await state();
  for (const magnification of ['native', 'width', 'fit']) {
    await page.selectOption('#mode', magnification);
    await settled();
    const actual = await state();
    check(actual.width === resting.width && actual.height === resting.height, 'View magnification changed the CSS viewport');
  }
  await page.selectOption('#keyboard-mode', 'resize');
  await frame.locator('#registration-email').click();
  await keyboardShown();
  await page.locator('#keyboard-height').evaluate((slider) => {
    slider.value = '55';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settled();
  check((await state()).height === 864, '55% keyboard must leave 864px of a 1920px screen');
  await page.locator('#hide-keyboard').click();
  await settled();
  const alternate = new URL(root);
  alternate.hostname = alternate.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  alternate.pathname = '/content/index';
  await page.locator('#preview').evaluate((iframe, url) => { iframe.src = url; }, alternate.href);
  await page.locator('#connection-error:not([hidden])').waitFor();
  check(await page.locator('#connection-error').textContent().then((text) => /local fixture origin/.test(text)), 'Foreign frame origin was not visibly blocked');
  await start();
  return { modes, fixtureActions: actions.length, checked: 'Clickable and physical keys; overlay label bounds; actual shrink/geometry and retained-focus dismissal/reopen; five CSS presets; personal/picker/demo/Finish/fake-send/reset; local-only API actions; small host layout; no page errors.' };
}
