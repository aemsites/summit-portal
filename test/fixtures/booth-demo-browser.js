/** Run against the explicitly enabled, local-only touchscreen fixture server. */
export default async function verifyBoothDemos(page, root = 'http://localhost:3000') {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.clock.install();
  const actions = [];
  page.on('request', (request) => {
    if (/\/auth\/booth\/(view|send|contact|request)$/.test(request.url())) actions.push(request.url());
  });
  const ready = async () => {
    await page.waitForFunction(() => !document.querySelector('#email-form button')?.disabled);
  };
  const actionProfiles = [];
  const checkActions = async (selector) => {
    const sizes = [[2160, 3840, selector.includes('demos') ? 120 : 129, 42], [1080, 1920, 72, 24], [390, 844, 64, 22]];
    for (const [width, height, minHeight, minFont] of sizes) {
      await page.setViewportSize({ width, height });
      const targets = page.locator(selector);
      const targetsProfile = await targets.evaluateAll((buttons) => buttons.map((button) => {
        const bounds = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          label: button.textContent,
          height: bounds.height,
          width: bounds.width,
          font: parseFloat(style.fontSize),
          border: parseFloat(style.borderWidth),
        };
      }));
      check(targetsProfile.length >= 1, 'Alternative actions disappeared');
      check(targetsProfile.every((action) => action.height >= minHeight
        && action.font >= minFont
        && action.border >= 2), `Alternative actions are too small at ${width}px`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Alternative actions overflow');
      actionProfiles.push({ selector, width, actions: targetsProfile });
    }
    await page.setViewportSize({ width: 2160, height: 3840 });
  };
  await page.route('https://act.aem.now/api/report-requests', (route) => route.abort());
  await page.goto(`${root}/content/index?preview=entry`);
  await ready();
  const footer = await page.locator('.stage-footer').textContent();
  check(!/lorem/i.test(footer), 'Placeholder progress returned');
  check(await page.locator('[data-request-report]').count() === 0, 'Retired request action returned');
  await checkActions('.entry-alternatives button');
  await page.locator('#registration-email').fill('unmatched@not-a-prepared-company.test');
  const lookup = page.waitForResponse((response) => response.url().endsWith('/auth/booth/lookup'));
  await page.locator('#email-form button').click();
  const missing = await lookup;
  check(
    missing.status() === 404 && (await missing.json()).code === 'no_report',
    'An arbitrary unmatched email must return no_report, not open the example report',
  );
  await page.locator('[data-panel="unavailable"]:not([hidden])').waitFor();
  check(new URL(page.url()).pathname === '/content/index', 'Unmatched email navigated to a report');
  check(!await page.locator('[data-panel="demos"]').isVisible(), 'Industry selection opened without a visitor action');
  check(await page.locator('#registration-email').inputValue() === '', 'Missing-report recovery retained email');
  await checkActions('[data-panel="unavailable"] .booth-alternative');
  await page.getByRole('button', { name: 'Show an industry demo', exact: true }).click();
  await page.locator('#demo-options button').nth(9).waitFor();
  check(await page.locator('#demo-recovery-copy').isVisible(), 'Unmatched chooser guidance disappeared');
  check(await page.locator('#demo-options button').count() === 10, 'Industry catalogue is incomplete');
  check(!await page.locator('#demo-intro').isVisible(), 'Unmatched guidance was duplicated');
  check(!await page.locator('.booth-progress').isVisible(), 'Industry screen retained the old progress footer');
  check(await page.locator('.demo-footer-note').isVisible(), 'Designed industry footer is missing');
  const icons = await page.locator('#demo-options .demo-icon').evaluateAll(
    (images) => Promise.all(images.map((image) => image.decode().then(
      () => image.naturalWidth === 64 && image.naturalHeight === 64,
    ))),
  );
  check(icons.length === 10 && icons.every(Boolean), 'The ten exported Figma icons must load');
  await page.setViewportSize({ width: 2160, height: 2881 });
  await page.evaluate(() => document.fonts.ready);
  const design = await page.evaluate(() => {
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      header: bounds('.stage-header'),
      title: bounds('#demos-heading'),
      grid: bounds('#demo-options'),
      first: bounds('.demo-option'),
      last: bounds('.demo-option:last-child'),
      icon: bounds('.demo-icon'),
      back: bounds('.industry-panel .booth-alternative'),
      footer: bounds('.stage-footer'),
    };
  });
  const figma = {
    header: { x: 0, y: 0, width: 2160, height: 277 },
    title: { x: 112, y: 397, width: 1936, height: 97 },
    grid: { x: 112, y: 754, width: 1936, height: 1193 },
    first: { x: 112, y: 754, width: 928, height: 181 },
    last: { x: 1120, y: 1766, width: 928, height: 181 },
    icon: { x: 156, y: 812.5, width: 64, height: 64 },
    back: { x: 835.5, y: 2147, width: 489, height: 120 },
    footer: { x: 0, y: 2728, width: 2160, height: 153 },
  };
  Object.entries(figma).forEach(([part, expected]) => {
    Object.entries(expected).forEach(([dimension, value]) => {
      check(Math.abs(design[part][dimension] - value) <= 1, `Figma ${part} ${dimension} changed`);
    });
  });
  await checkActions('[data-panel="demos"] .booth-alternative');
  for (const [width, height] of [[2160, 3840], [1080, 1920], [390, 844]]) {
    await page.setViewportSize({ width, height });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Industry chooser overflows');
    const target = await page.locator('#demo-options button').first().boundingBox();
    check(target.height >= 64, 'Industry targets are too small');
  }
  await page.setViewportSize({ width: 2160, height: 3840 });
  const { demos } = await (await page.request.get(`${root}/auth/booth/demos`)).json();
  for (const demo of demos) {
    await page.locator('#demo-options button').filter({ hasText: demo.industry }).click();
    await page.waitForURL(`**${demo.path}`);
    await page.locator('#booth-return').waitFor();
    await page.locator('.report-ai-visibility .rav-hbar-row').nth(5).waitFor();
    check(!await page.locator('main').innerText().then((text) => text.includes('horizontalbars | count')), 'Demo exposes raw authored chart data');
    check(await page.locator('.report-carousel .rc-tab').count() === 3, 'Demo carousel was not decorated');
    await page.locator('.report-carousel .rc-tab').nth(1).click();
    check(await page.locator('.rc-slide:not([hidden])').textContent().then((text) => text.includes('Visibility differs by platform')), 'Demo carousel tab does not switch its real content');
    check((await page.locator('#booth-return').textContent()).includes('Not a report for your company'), 'Demo is not clearly identified');
    check(await page.getByRole('link', { name: 'Finish reading my report' }).count() === 0, 'Demo incorrectly offers personal Finish');
    check(await page.locator('.booth-request-action').count() === 0, 'Demo offers retired request action');
    const context = await (await page.request.get(`${root}/auth/booth/status`)).json();
    check(context.state === 'demo' && context.demoId === demo.id && !context.email, 'Demo state leaks attendee details');
    if (demo !== demos.at(-1)) {
      await page.getByRole('link', { name: 'Change industry', exact: true }).click();
      await page.locator('#demo-options button').nth(9).waitFor();
    }
  }
  await page.getByRole('button', { name: 'Clear for next visitor', exact: true }).click();
  await page.waitForURL('**/booth');
  await ready();
  check(await page.locator('#registration-email').inputValue() === '', 'Demo reset retained attendee details');
  await page.getByRole('button', { name: 'Staff: show industry demos', exact: true }).click();
  await page.locator('#demo-options button').nth(9).waitFor();
  check(!await page.locator('#demo-recovery-copy').isVisible(), 'New visitor inherited missing-report messaging');
  check(await page.locator('#demo-intro').isVisible(), 'Staff shortcut lost its truthful introduction');
  await page.locator('#demo-options button').first().click();
  await page.locator('#booth-return').waitFor();
  await page.clock.fastForward(110000);
  await page.locator('#booth-return strong').click();
  await page.clock.fastForward(30000);
  check(new URL(page.url()).pathname.startsWith('/example-report/'), 'Touch activity did not renew demo idle time');
  await page.clock.fastForward(90001);
  await page.waitForURL('**/booth');
  await ready();
  await page.goBack();
  await page.waitForURL('**/booth');
  await ready();
  check(await page.locator('#registration-email').inputValue() === '', 'History restored attendee details');
  await page.clock.resume();
  await page.goto(`${root}/content/index?preview=entry`);
  await ready();
  await page.locator('#registration-email').fill('service-error@example.test');
  await page.locator('#email-form button').click();
  await page.locator('#email-error:not([hidden])').waitFor();
  check(!await page.locator('[data-panel="unavailable"]').isVisible(), 'An outage was reported as a missing report');
  check(await page.evaluate(() => !localStorage.length && !sessionStorage.length), 'Attendee data persisted in browser storage');
  check(actions.filter((url) => url.endsWith('/view')).length >= demos.length, 'Demo views were not recorded');
  check(actions.every((url) => url.endsWith('/view')), 'Demo flow attempted sending, contact or report requests');
  await page.getByRole('button', { name: 'Staff: show industry demos', exact: true }).click();
  await page.locator('#demo-options button').first().click();
  await page.locator('#booth-return').waitFor();
  await page.route('**/auth/booth/status', (route) => route.fulfill(
    { status: 503, contentType: 'application/json', body: '{"error":"Test verification outage"}' },
  ));
  await page.reload();
  await page.getByRole('button', { name: 'Retry and clear screen', exact: true }).waitFor();
  check(!await page.locator('main').isVisible(), 'Failed verification left demo content usable');
  return { demos: demos.length, design, actionProfiles, checked: 'Figma industry layout; exported icons; touch-sized alternatives; no-match guidance; all industries; no request flow; demo viewing; reset/idle/history privacy; outage distinction. No live data or submissions.' };
}
