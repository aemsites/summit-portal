/** Run against the explicitly enabled, local-only touchscreen fixture server. */
export default async function verifyBoothDemos(page, root = 'http://localhost:3000') {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.clock.install();
  const personalActions = [];
  page.on('request', (request) => {
    if (/\/auth\/booth\/(view|send|contact)$/.test(request.url())) personalActions.push(request.url());
  });
  const ready = async () => {
    await page.waitForFunction(() => !document.querySelector('#email-form button')?.disabled);
  };
  const actionProfiles = [];
  const checkActions = async (selector) => {
    const sizes = [[2160, 3840, 129, 51], [1080, 1920, 72, 25], [390, 844, 64, 22]];
    for (const [width, height, minHeight, minFont] of sizes) {
      await page.setViewportSize({ width, height });
      const targets = page.locator(selector);
      const actions = await targets.evaluateAll((buttons) => buttons.map((button) => {
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
      check(actions.length >= 2, 'Alternative actions disappeared');
      check(actions.every((action) => action.height >= minHeight
        && action.font >= minFont
        && action.border >= 2), `Alternative actions are too small at ${width}px`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Alternative actions overflow');
      actionProfiles.push({ selector, width, actions });
    }
    await page.setViewportSize({ width: 2160, height: 3840 });
  };
  await page.route('https://act.aem.now/api/report-requests', (route) => route.abort());
  await page.goto(`${root}/content/index?preview=entry`);
  await ready();
  const footer = await page.locator('.stage-footer').textContent();
  check(!/lorem/i.test(footer), 'Placeholder progress returned');
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
  check(await page.locator('#demo-options button').count() === 10, 'Industry catalogue is incomplete');
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
    check((await page.locator('#booth-return').textContent()).includes('Not a report for your company'), 'Demo is not clearly identified');
    check(await page.getByRole('link', { name: 'Finish reading my report' }).count() === 0, 'Demo incorrectly offers personal Finish');
    const context = await (await page.request.get(`${root}/auth/booth/status`)).json();
    check(context.state === 'demo' && context.demoId === demo.id && !context.email, 'Demo state leaks attendee details');
    if (demo !== demos.at(-1)) {
      await page.getByRole('link', { name: 'Change industry', exact: true }).click();
      await page.locator('#demo-options button').nth(9).waitFor();
    }
  }
  await page.getByRole('button', { name: 'Request my report', exact: true }).click();
  await page.waitForURL('**/request-report');
  await page.locator('html.booth-request-active').waitFor();
  check(await page.locator('[name="email"]').inputValue() === '', 'Request form was not fresh');
  check(!await page.locator('[name="consent"]').isChecked(), 'Consent was inferred from demo viewing');
  const profiles = [];
  for (const [width, height] of [[2160, 3840], [1080, 1920], [1080, 1100], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const profile = await page.evaluate(() => {
      const input = document.querySelector('[name="email"]');
      const bounds = input.getBoundingClientRect();
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        inputWidth: bounds.width,
        inputHeight: bounds.height,
        font: parseFloat(getComputedStyle(input).fontSize),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        controlBottom: document.querySelector('#booth-return').getBoundingClientRect().bottom,
      };
    });
    check(!profile.overflow, `Request form overflows at ${width}x${height}`);
    check(profile.controlBottom <= height, 'Booth controls are off screen');
    if (width >= 1000) check(profile.font >= 32 && profile.inputHeight >= 76, 'Portrait request fields are not touch-sized');
    profiles.push(profile);
  }
  await page.setViewportSize({ width: 2160, height: 3840 });
  await page.getByRole('button', { name: 'Request my report', exact: true }).click();
  check(await page.locator('.rrf-error-summary').isVisible(), 'Required fields/consent were bypassed');
  await page.locator('[name="fullName"]').fill('Booth Test Visitor');
  await page.locator('[name="email"]').fill('visitor@example.test');
  await page.locator('[name="company"]').fill('Booth Fixture');
  await page.locator('[name="website"]').fill('example.test');
  await page.locator('[name="consent"]').check();
  await page.getByRole('button', { name: 'Request my report', exact: true }).click();
  await page.locator('.rrf-success').waitFor();
  await page.getByRole('button', { name: 'Finish and clear this screen' }).click();
  await page.waitForURL('**/booth');
  await ready();
  check(await page.locator('#registration-email').inputValue() === '', 'Submission reset retained attendee details');
  await page.getByRole('button', { name: 'Request my report', exact: true }).click();
  await page.waitForURL('**/request-report');
  await page.locator('html.booth-request-active').waitFor();
  await page.locator('[name="email"]').fill('abandoned@example.test');
  await page.locator('[name="consent"]').check();
  await page.clock.fastForward(110000);
  await page.locator('[name="email"]').fill('still-typing@example.test');
  await page.clock.fastForward(30000);
  check(new URL(page.url()).pathname === '/request-report', 'Virtual-keyboard input did not renew the idle timer');
  await page.clock.fastForward(90001);
  await page.waitForURL('**/booth');
  await ready();
  await page.goBack();
  check(await page.locator('[name="email"]').count() === 0
    || await page.locator('[name="email"]').inputValue() === '', 'History restored abandoned form details');
  await page.clock.resume();
  await page.goto(`${root}/content/index?preview=entry`);
  await ready();
  await page.locator('#registration-email').fill('service-error@example.test');
  await page.locator('#email-form button').click();
  await page.locator('#email-error:not([hidden])').waitFor();
  check(!await page.locator('[data-panel="unavailable"]').isVisible(), 'An outage was reported as a missing report');
  check(await page.evaluate(() => !localStorage.length && !sessionStorage.length), 'Attendee data persisted in browser storage');
  check(personalActions.length === 0, 'Demo/request flow recorded a personal report action');
  await page.route('**/auth/booth/status', (route) => route.fulfill(
    { status: 503, contentType: 'application/json', body: '{"error":"Test verification outage"}' },
  ));
  await page.goto(`${root}/request-report`);
  await page.getByRole('button', { name: 'Retry and clear screen', exact: true }).waitFor();
  check(!await page.locator('main').isVisible(), 'Failed booth verification left a usable request form');
  check(await page.locator('[name="email"]').inputValue() === '', 'Failed verification retained request fields');
  return { demos: demos.length, profiles, actionProfiles, checked: 'Touch-sized entry/recovery/list alternatives; no placeholder progress; no-match recovery; all industries; separate demo mode; fresh form; consent and validation; synthetic submission; reset/idle/history privacy; outage distinction. No real submissions.' };
}
