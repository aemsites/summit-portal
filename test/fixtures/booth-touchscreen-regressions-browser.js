/** Drives the user's real clicks against local fake services, not synthetic submit events. */
export default async function verifyTouchscreenRegressions(page, root = 'http://localhost:3002') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Touchscreen regressions require local-only fixtures.');
  }
  await page.bringToFront();
  await page.setViewportSize({ width: 1366, height: 900 });
  const failures = [];
  const observations = {};
  const lookups = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/auth/booth/lookup') lookups.push(request.url());
  });
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const frame = page.frameLocator('#preview');
  const ready = () => frame.locator('#email-form button:not([disabled])').waitFor();
  const start = async () => {
    await page.goto(root);
    await ready();
    await page.selectOption('#resolution', '1080x1920');
    await page.waitForTimeout(100);
  };
  const typing = async (email = 'visitor@example.test') => {
    await frame.locator('#registration-email').click();
    await page.locator('#keyboard:not([hidden])').waitFor();
    for (const key of email) await page.locator(`[data-key="${key}"]`).click();
    await page.waitForTimeout(100);
  };
  await start();
  const before = await frame.locator('#registration-email').evaluate((field) => ({ top: field.getBoundingClientRect().top, scroll: window.scrollY }));
  await typing();
  observations.editing = await frame.locator('#registration-email').evaluate((field) => ({
    top: field.getBoundingClientRect().top,
    labelTop: field.labels[0].getBoundingClientRect().top,
    actionBottom: field.form.querySelector('button').getBoundingClientRect().bottom,
    scroll: window.scrollY,
  }));
  check(observations.editing.top >= 264, 'Email snapped too high instead of minimally scrolling');
  check(
    observations.editing.labelTop >= 0 && observations.editing.actionBottom <= 1056,
    'Label and primary submit must fit above the keyboard',
  );
  await page.locator('#hide-keyboard').click();
  await page.locator('#keyboard').waitFor({ state: 'hidden' });
  await page.waitForTimeout(150);
  observations.dismissed = await frame.locator('#registration-email').evaluate((field) => ({
    top: field.getBoundingClientRect().top,
    scroll: window.scrollY,
    inset: document.documentElement.style.getPropertyValue('--booth-keyboard-inset'),
    active: document.documentElement.classList.contains('booth-keyboard-active'),
  }));
  check(
    !observations.dismissed.active && parseFloat(observations.dismissed.inset || '0') === 0,
    'Hide leaves a phantom keyboard reserve',
  );
  check(
    Math.abs(observations.dismissed.scroll - before.scroll) <= 2
    && Math.abs(observations.dismissed.top - before.top) <= 2,
    'Hide does not restore the pre-edit presentation',
  );

  await start();
  await typing();
  let count = lookups.length;
  await page.locator('[data-key="Enter"]').click();
  await page.waitForTimeout(500);
  observations.enter = {
    lookups: lookups.length - count,
    route: await page.locator('#preview').evaluate((iframe) => iframe.contentWindow.location.pathname),
  };
  check(
    observations.enter.lookups === 1 && observations.enter.route.startsWith('/accounts/'),
    'On-screen Enter must perform the View my report action once',
  );
  await start();
  await typing();
  count = lookups.length;
  await frame.getByRole('button', { name: 'View my report', exact: true }).click({ delay: 180 });
  await page.waitForTimeout(500);
  observations.button = {
    lookups: lookups.length - count,
    route: await page.locator('#preview').evaluate((iframe) => iframe.contentWindow.location.pathname),
  };
  check(
    observations.button.lookups === 1 && observations.button.route.startsWith('/accounts/'),
    'First View my report tap only dismisses the keyboard instead of submitting',
  );

  await start();
  await typing('jose');
  count = lookups.length;
  await page.locator('[data-key="Enter"]').click();
  check(
    lookups.length === count && !await frame.locator('#registration-email').evaluate((field) => field.validity.valid),
    'Name-only input must use native email validation, not send a lookup',
  );
  const matrix = [];
  for (const preset of ['2160x3840', '1728x3072', '1440x2560', '1080x1920', '864x1536']) {
    for (const scenario of ['overlay', 'resize', 'geometry']) {
      await start();
      await page.selectOption('#resolution', preset);
      await page.selectOption('#keyboard-mode', scenario);
      await page.waitForTimeout(120);
      const height = Number(preset.split('x')[1]);
      const original = await frame.locator('#registration-email').evaluate((field) => ({ top: field.getBoundingClientRect().top, scroll: window.scrollY }));
      await frame.locator('#registration-email').click();
      await page.locator('#keyboard:not([hidden])').waitFor();
      await page.keyboard.type('visitor@example.test');
      await page.waitForTimeout(120);
      const editing = await frame.locator('#registration-email').evaluate((field) => ({
        top: field.getBoundingClientRect().top,
        label: field.labels[0].getBoundingClientRect().top,
        help: document.querySelector('#email-help').getBoundingClientRect().bottom,
        action: field.form.querySelector('button').getBoundingClientRect().bottom,
      }));
      const bottom = height - Math.round(height * 0.45);
      check(
        editing.label >= 0 && editing.help <= bottom && editing.action <= bottom,
        `${preset}/${scenario}: field context or submit is covered`,
      );
      const screen = await page.locator('#preview').boundingBox();
      await page.mouse.move(screen.x + screen.width / 2, screen.y + screen.height / 3);
      const scroll = await frame.locator('html').evaluate(() => window.scrollY);
      const limit = await frame.locator('html').evaluate(
        () => document.scrollingElement.scrollHeight - window.innerHeight,
      );
      await page.mouse.wheel(0, scroll >= limit - 1 ? -80 : 80);
      await page.waitForTimeout(120);
      check(
        await frame.locator('html').evaluate(() => window.scrollY) !== scroll,
        `${preset}/${scenario}: scrolling inside the editing screen is blocked`,
      );
      await page.locator('[data-key="Hide"]').click();
      await page.waitForTimeout(160);
      const hidden = await frame.locator('#registration-email').evaluate((field) => ({
        top: field.getBoundingClientRect().top,
        scroll: window.scrollY,
        height: window.innerHeight,
        active: document.documentElement.classList.contains('booth-keyboard-active'),
        focused: document.activeElement === field,
      }));
      check(
        !hidden.active && !hidden.focused && hidden.height === height
        && Math.abs(hidden.scroll - original.scroll) <= 2
        && Math.abs(hidden.top - original.top) <= 2,
        `${preset}/${scenario}: explicit Hide did not restore the resting presentation`,
      );
      await frame.locator('#registration-email').click();
      await page.locator('#keyboard:not([hidden])').waitFor();
      count = lookups.length;
      await frame.getByRole('button', { name: 'View my report', exact: true }).click({ delay: 180 });
      await frame.locator('#booth-return').waitFor();
      check(
        lookups.length - count === 1,
        `${preset}/${scenario}: one submit tap must cause exactly one lookup`,
      );
      await frame.locator('.report-ai-visibility .rav-hbar-row').nth(5).waitFor();
      const scores = await frame.locator('.rs-dark-value-row').evaluateAll((rows) => rows.map((row) => ({ width: row.clientWidth, scrollWidth: row.scrollWidth })));
      check(
        scores.every((score) => score.scrollWidth <= score.width + 1),
        `${preset}: metric values overflow`,
      );
      matrix.push({ preset, scenario, editing, hidden });
    }
  }
  observations.matrix = matrix;

  for (const direct of [false, true]) {
    if (direct) {
      await page.setViewportSize({ width: 728, height: 1296 });
      await page.goto(`${root}/content/index?preview=entry`);
      await page.locator('#email-form button:not([disabled])').waitFor();
      await page.getByRole('button', { name: 'Staff: show industry demos' }).click();
      await page.locator('#demo-options button').first().click();
      await page.locator('#booth-return').waitFor();
    } else {
      await start();
      await frame.getByRole('button', { name: 'Staff: show industry demos' }).click();
      await frame.locator('#demo-options button').first().click();
      await frame.locator('#booth-return').waitFor();
    }
    const main = direct ? page.locator('main') : frame.locator('main');
    const raw = await main.innerText();
    const bars = await main.locator('.report-ai-visibility .rav-hbar-row').count();
    observations[direct ? 'directDemo' : 'framedDemo'] = { bars, rawChartSource: raw.includes('horizontalbars | count') };
    check(bars === 6 && !raw.includes('horizontalbars | count'), 'Demo report exposes undecorated authored chart data');
  }
  if (failures.length) throw new Error(JSON.stringify({ failures, observations }));
  return observations;
}
