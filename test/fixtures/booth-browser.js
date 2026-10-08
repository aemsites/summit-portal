/** Explicit test-only network fixtures; never imported by runtime code. */
export default async function verifyBooth(page, root = 'http://localhost:3000') {
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
  const reportHTML = await (await page.request.get(`${root}/test/fixtures/booth-preview-report.html`)).text();
  await page.route('**/accounts/**', async (route) => {
    reportRequests += 1;
    const selected = new URL(route.request().url()).pathname;
    if (state.state !== 'report' || state.selectedPath !== selected) {
      await route.fulfill({ status: 302, headers: { Location: '/booth' } });
      return;
    }
    const marked = reportHTML.replace('<html lang="en">', '<html lang="en" class="booth-report-pending">')
      .replace('<head>', '<head><style>.booth-report-pending body > :not(#booth-return,#booth-recovery){display:none!important}</style>')
      .replace(/(<body[^>]*>)/, '$1<div id="booth-report-content" hidden>')
      .replace('</body>', '</div></body>')
      .replace('src="/scripts/booth-report.js"', `data-booth-mode="report" data-booth-expires-at="${state.expiresAt}" src="/scripts/booth-report.js"`);
    await route.fulfill({ contentType: 'text/html', body: marked });
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
      throw new Error('Retired contact action must not be requested');
    } else if (action === 'reset') {
      state = { state: 'entry' };
      result = state;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.setViewportSize({ width: 2160, height: 3840 });
  await page.goto(`${root}/content/index`);
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
  await page.locator('#report-preview .rh-insight-text h3').waitFor();
  check(lookups === 1 && reportRequests === 2, 'Finish must fetch the selected report without another lookup');
  check(await page.locator('#report-preview .rs-dark-value').first().textContent() === '61/100', 'Finish preview must use actual report scores');
  check(await page.getByRole('heading', { name: 'Talk through your report here' }).count() === 0, 'Removed guidance section returned');
  const finish = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    row: document.querySelector('.finish-action-row').getBoundingClientRect().height,
    reset: document.querySelector('.finish-clear').getBoundingClientRect().height,
    action: document.querySelector('#send-report').getBoundingClientRect().height,
    titleHeight: document.querySelector('#report-preview .rh-insight-text h3').getBoundingClientRect().height,
    titleLine: parseFloat(getComputedStyle(document.querySelector('#report-preview .rh-insight-text h3')).lineHeight),
  }));
  check(!finish.overflow && finish.row >= 130 && finish.action >= 130 && finish.reset >= 130, 'Figma portrait Finish sizing changed');
  check(finish.titleHeight >= (finish.titleLine * 2) - 1, 'Report preview clipped a partial title line');
  const bars = await page.locator('#report-preview .rav-hbar-row').evaluateAll(
    (rows) => rows.map((row) => {
      const fill = row.querySelector('.rav-hbar-fill');
      return {
        target: parseFloat(fill.style.getPropertyValue('--bar-w')),
        width: parseFloat(getComputedStyle(fill).width),
        track: parseFloat(getComputedStyle(fill.parentElement).width),
      };
    }),
  );
  check(
    bars.length === 6 && bars.every((bar) => bar.track > 0
      && Math.abs((bar.width / bar.track) * 100 - bar.target) < 0.02),
    'Finish competitor/platform bars must paint their actual values without scroll activation',
  );
  await page.getByRole('button', { name: 'Email my report' }).click();
  await page.waitForFunction(() => document.querySelector('#finish-status').textContent.includes('was emailed'));
  check(calls === 1 && await page.locator('#send-report').isDisabled(), 'Duplicate send UI protection failed');
  check(!state.contactRequested, 'Report email must not imply sales consent');
  check(await page.locator('#request-contact, #contact-status, #contact-privacy').count() === 0, 'Retired contact controls returned');
  check(await page.locator('.preview-card').count() === 3, 'Finish requires all three selected-report previews');
  await page.locator('.preview-montage').focus();
  await page.keyboard.press('ArrowRight');
  check(await page.locator('.preview-card[data-position="center"]').getAttribute('data-section') === 'briefing', 'Preview keyboard rotation failed');
  await page.waitForTimeout(400);
  const side = await page.locator('.preview-card[data-position="right"]').boundingBox();
  await page.mouse.click(side.x + side.width - 30, side.y + (side.height / 2));
  check(await page.locator('.preview-card[data-position="center"]').getAttribute('data-section') === 'visibility', 'Side preview tap failed');
  const touch = await page.context().newCDPSession(page);
  for (const section of ['overview', 'briefing', 'visibility']) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 1080, y: 650 }] });
    for (let i = 1; i <= 5; i += 1) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 1080 - (i * 60), y: 650 }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check(await page.locator('.preview-card[data-position="center"]').getAttribute('data-section') === section, 'Touch swipe/wrap failed');
  }
  await touch.detach();
  check(lookups === 1 && reportRequests === 2, 'Preview rotation fetched the report again');
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
  await page.getByRole('button', { name: 'Retry and clear screen' }).click();
  await page.waitForURL('**/booth');
  await page.goBack();
  await page.waitForURL('**/booth');
  check(await page.locator('#registration-email').inputValue() === '', 'Back navigation resurrected attendee');

  multiple = false;
  await page.goto(`${root}/content/index?entry=3&finish=2`);
  await page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  await page.locator('#registration-email').fill('visitor@example.com');
  await page.locator('#email-form button').click();
  await page.waitForURL(`**${path}`);
  await page.getByRole('link', { name: 'Finish reading my report' }).click();
  await page.waitForURL('**/booth?step=finish');
  await page.locator('[data-panel="finish"]:not([hidden])').waitFor();
  check(await page.locator('#stage').getAttribute('data-finish') === '6', 'Legacy query changed fixed Finish 6');
  await page.getByRole('button', { name: 'Finish and clear this screen' }).click();
  await page.waitForURL('**/booth');
  check(await page.locator('#stage').getAttribute('data-entry') === '3'
    && await page.locator('#registration-email').inputValue() === '', 'Reset lost variant or leaked email');
  return { entry, finish, mobile, checked: 'Final Entry → direct report → Finish 6 previews without another lookup → send → reset; horizontal actions; preview rotation; explicit picker; escaped labels; failed delivery; mobile; reduced motion; no client storage; ignored legacy variants. All emails are synthetic fixtures, no live email sent.' };
}
