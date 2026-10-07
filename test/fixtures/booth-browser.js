/** Explicit test-only network fixtures; never imported by runtime code. */
export default async function verifyBooth(page) {
  const path = '/accounts/e/example/insights/example-com/portal-landing/';
  const other = '/accounts/e/example/insights/example-org/portal-landing/';
  let state = { state: 'entry' };
  let multiple = false;
  let failedSend = false;
  let calls = 0;
  let lookups = 0;
  let reportRequests = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const reportHTML = await (await page.request.get('http://localhost:3000/test/fixtures/booth-preview-report.html')).text();
  await page.route('**/accounts/**', async (route) => {
    reportRequests += 1;
    const selected = new URL(route.request().url()).pathname;
    if (state.state !== 'report' || state.selectedPath !== selected) {
      await route.fulfill({ status: 302, headers: { Location: '/booth' } });
      return;
    }
    await route.fulfill({ contentType: 'text/html', body: reportHTML });
  });
  await page.route('**/auth/booth/**', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').pop();
    let status = 200;
    let result = state;
    const expiresAt = Date.now() + 600000;
    if (action === 'lookup') {
      lookups += 1;
      const payload = JSON.parse(route.request().postData());
      check(!['entry', 'finish', 'brand', 'heading'].some((key) => key in payload), 'Cosmetics leaked into lookup');
      state = multiple ? {
        state: 'picker',
        candidates: [{ path, label: 'Example.com' }, { path: other, label: '<img src=x onerror=alert(1)> Example.org' }],
        expiresAt,
      } : { state: 'report', selectedPath: path, candidates: [], expiresAt, delivery: 'ready' };
      result = state;
    } else if (action === 'select') {
      check(JSON.parse(route.request().postData()).path === other, 'Picker must send explicit candidate path');
      state = { state: 'report', selectedPath: other, expiresAt, delivery: 'ready' };
      result = state;
    } else if (action === 'send') {
      calls += 1;
      check(route.request().postData() === '{}', 'Send must not accept email/path from client');
      if (failedSend) {
        status = 502;
        result = { error: 'Email delivery could not be confirmed. Ask the booth team; do not send again.' };
      } else {
        state.sent = true;
        result = { sent: true };
      }
    } else if (action === 'contact') {
      check(JSON.parse(route.request().postData()).consent === true, 'Contact requires explicit consent');
      state.contactRequested = true;
      result = { contactRequested: true };
    } else if (action === 'reset') {
      state = { state: 'entry' };
      result = state;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.setViewportSize({ width: 2160, height: 3840 });
  await page.goto('http://localhost:3000/content/index');
  await page.locator('#email-form button').waitFor();
  await page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  const entry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    inputText: getComputedStyle(document.querySelector('#registration-email')).fontSize,
    actionHeight: document.querySelector('#email-form button').getBoundingClientRect().height,
    keyboardFocus: document.activeElement.id,
  }));
  check(!entry.overflow && Math.abs(parseFloat(entry.inputText) - 68) < 1
    && entry.actionHeight >= 129, 'Figma portrait sizing changed');
  check(entry.keyboardFocus !== 'registration-email', 'Attract screen must not force keyboard');
  check(await page.locator('#motion-toggle, .review, #step-index').count() === 0, 'Preview-only controls shipped');
  await page.locator('#registration-email').fill('visitor@example.com');
  await page.locator('#email-form button').click();
  await page.waitForURL(`**${path}`);
  await page.locator('#booth-return').waitFor();
  check(await page.locator('#booth-return a').isVisible(), 'Finish must be visible at top of a long report');
  check(await page.evaluate(() => document.querySelector('#booth-return').getBoundingClientRect().bottom <= window.innerHeight), 'Finish is outside viewport');
  check(await page.locator('main h1').textContent() === 'Example prepared report — test fixture', 'Report content changed');
  await page.getByRole('link', { name: 'Finish reading my report' }).click();
  await page.waitForURL('**/booth?step=finish');
  await page.locator('[data-panel="finish"]:not([hidden])').waitFor();
  await page.locator('#report-preview h3').waitFor();
  check(lookups === 1 && reportRequests === 2, 'Finish must fetch the selected report without another lookup');
  check(await page.locator('#report-preview .rs-dark-value').first().textContent() === '61/100', 'Finish preview must use actual report scores');
  check(await page.getByRole('heading', { name: 'Talk through your report here' }).count() === 0, 'Removed guidance section returned');
  const finish = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    guidance: document.querySelector('.finish-guidance').getBoundingClientRect().height,
    action: document.querySelector('#send-report').getBoundingClientRect().height,
  }));
  check(!finish.overflow && finish.guidance >= 262 && finish.action >= 129, 'Figma portrait Finish sizing changed');
  await page.getByRole('button', { name: 'Email my report' }).click();
  await page.waitForFunction(() => document.querySelector('#finish-status').textContent.includes('was emailed'));
  check(calls === 1 && await page.locator('#send-report').isDisabled(), 'Duplicate send UI protection failed');
  check(!state.contactRequested, 'Report email must not imply sales consent');
  await page.getByRole('button', { name: 'Please contact me' }).click();
  await page.waitForFunction(() => document.querySelector('#contact-status').textContent.includes('recorded'));
  check(state.contactRequested && await page.locator('#request-contact').isDisabled(), 'Explicit contact request failed');
  await page.getByRole('button', { name: 'Finish and clear this screen' }).click();
  await page.waitForURL('**/booth');
  check(await page.locator('#registration-email').inputValue() === '', 'Reset leaked email');
  check(state.state === 'entry', 'Reset failed to clear server fixture context');
  check(await page.locator('#report-preview').textContent() === '', 'Reset leaked report preview');

  multiple = true;
  await page.locator('#registration-email').fill('visitor@example.com');
  await page.locator('#email-form button').click();
  await page.locator('[data-panel="picker"]:not([hidden])').waitFor();
  check(await page.locator('#report-options img').count() === 0, 'Picker label became executable HTML');
  await page.locator('#report-options button').nth(1).click();
  await page.waitForURL(`**${other}`);
  await page.locator('#booth-return').waitFor();
  await page.getByRole('link', { name: 'Finish reading my report' }).click();
  await page.locator('[data-panel="finish"]:not([hidden])').waitFor();
  failedSend = true;
  await page.locator('#send-report').click();
  await page.waitForFunction(() => document.querySelector('#finish-status').textContent.includes('could not be confirmed'));
  check(await page.locator('#send-report').isDisabled(), 'Uncertain send must not be retried');
  await page.getByRole('button', { name: 'Finish and clear this screen' }).click();
  await page.waitForURL('**/booth');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  check(await page.locator('#motion-toggle').count() === 0, 'Decorative motion controls must not ship');
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    actionHeight: document.querySelector('#email-form button').getBoundingClientRect().height,
  }));
  check(!mobile.overflow && mobile.actionHeight >= 62, 'Mobile entry overflow/touch target');
  await page.locator('#registration-email').fill('visitor@example.com');
  await page.locator('#email-form button').click();
  await page.locator('[data-panel="picker"]:not([hidden])').waitFor();
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile picker overflow');
  await page.locator('#report-options button').nth(1).click();
  await page.waitForURL(`**${other}`);
  await page.locator('#booth-return').waitFor();
  await page.getByRole('link', { name: 'Finish reading my report' }).click();
  await page.locator('[data-panel="finish"]:not([hidden])').waitFor();
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile Finish overflow');
  await page.getByRole('button', { name: 'Finish and clear this screen' }).click();
  await page.waitForURL('**/booth');
  check(await page.evaluate(() => !window.localStorage.length && !window.sessionStorage.length), 'Attendee state stored on client');
  await page.clock.install();
  await page.locator('#registration-email').fill('visitor@example.com');
  await page.locator('#registration-email').press('ArrowLeft');
  await page.clock.fastForward(120001);
  await page.waitForFunction(() => document.querySelector('#registration-email').value === '');
  check(state.state === 'entry', 'Idle timeout must reset server context');
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await page.waitForFunction(() => !document.querySelector('#stage').hidden);
  check(await page.locator('#registration-email').inputValue() === '', 'bfcache restored attendee state');
  await page.clock.resume();
  await page.locator('#registration-email').fill('visitor@example.com');
  await page.locator('#email-form button').click();
  await page.locator('[data-panel="picker"]:not([hidden])').waitFor();
  await page.locator('#report-options button').nth(1).click();
  await page.waitForURL(`**${other}`);
  await page.locator('#booth-return').waitFor();
  await page.route('**/auth/booth/reset', (route) => route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"Test reset failure"}' }));
  await page.getByRole('button', { name: 'Clear for next visitor' }).click();
  await page.locator('#booth-return p:not([hidden])').waitFor();
  check(!await page.locator('main').isVisible(), 'Reset failure must not reveal old report content');
  await page.unroute('**/auth/booth/reset');
  await page.getByRole('button', { name: 'Clear for next visitor' }).click();
  await page.waitForURL('**/booth');
  await page.goBack();
  await page.waitForURL('**/booth');
  check(await page.locator('#registration-email').inputValue() === '', 'Back navigation resurrected attendee');

  multiple = false;
  await page.goto('http://localhost:3000/content/index?entry=3&finish=2');
  await page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  await page.locator('#registration-email').fill('visitor@example.com');
  await page.locator('#email-form button').click();
  await page.waitForURL(`**${path}`);
  await page.getByRole('link', { name: 'Finish reading my report' }).click();
  await page.waitForURL('**/booth?step=finish');
  await page.locator('[data-panel="finish"]:not([hidden])').waitFor();
  check(await page.locator('#stage').getAttribute('data-finish') === '5', 'Legacy query changed fixed Finish 5');
  await page.getByRole('button', { name: 'Finish and clear this screen' }).click();
  await page.waitForURL('**/booth');
  check(await page.locator('#stage').getAttribute('data-entry') === '3'
    && await page.locator('#registration-email').inputValue() === '', 'Reset lost variant or leaked email');
  return { entry, finish, mobile, checked: 'Fixed Entry 3 → direct report → native Finish 5 preview without another lookup → send/contact → reset; explicit picker; escaped labels; failed delivery; mobile; reduced motion; no client storage; ignored legacy variants. All emails are synthetic fixtures, no live email sent.' };
}
