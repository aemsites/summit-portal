/** Local-only stalled Entry regression; never contacts real visitor services. */
export default async function verifyBoothRecovery(page, root = 'http://localhost:3000') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Recovery checks require the local-only booth fixture server.');
  }
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  let held;
  let resets = 0;
  const lookup = (route) => { held = route; };
  const reset = async (route) => { resets += 1; await route.continue(); };
  await page.clock.install();
  await page.route('**/auth/booth/lookup', lookup);
  await page.route('**/auth/booth/reset', reset);
  try {
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto(`${root}/booth?preview=entry`);
    await page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
    await page.locator('#registration-email').fill('visitor@example.test');
    const requested = page.waitForRequest('**/auth/booth/lookup');
    await page.getByRole('button', { name: 'View my report', exact: true }).click();
    await requested;
    await page.clock.fastForward(10001);
    await page.waitForFunction(() => !document.getElementById('booth-retry').hidden);
    check(await page.locator('#registration-email').inputValue() === '', 'Timeout retains visitor email');
    check(await page.locator('#email-form button[type="submit"]').isDisabled(), 'Timeout enables another visitor before reset');
    check((await page.locator('#booth-status').textContent()).includes('timed out'), 'Timeout lacks visible recovery');
    await page.clock.fastForward(901000);
    await page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
    check(resets > 0, 'Idle reset still waits indefinitely for lookup');
    await held.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"Late lookup failure"}' });
    check(await page.locator('#registration-email').inputValue() === '', 'Late response restores visitor email');
  } finally {
    await page.unroute('**/auth/booth/lookup', lookup);
    await page.unroute('**/auth/booth/reset', reset);
    await page.clock.resume();
  }
  return { checked: 'Stalled lookup timeout, visible fail-closed recovery, idle reset without releasing lookup, stale response suppression. Local fixtures only.' };
}

/** Replay the Worker's recovery HTML, not the simplified local fixture markup. */
export async function verifyBoothReportRecovery(page, root = 'http://localhost:3000') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Report recovery checks require the local-only booth fixture server.');
  }
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const response = await page.request.get(`${root}/workers/cloudflare/cug-adobe-oauth-worker/src/booth-shell.js`);
  check(response.ok(), 'Worker report injection source is unavailable');
  const recovery = (await response.text()).match(/<aside id="booth-recovery">.*?<\/aside>/s)?.[0];
  check(recovery, 'Worker recovery HTML is unavailable');
  const legacy = '<aside id="booth-recovery">Your report is concealed while access is checked. <button type="button" data-booth-recover>Retry and clear screen</button> If this screen does not recover, <a href="/booth?recover=1">return to booth recovery</a> and ask staff to reset the visit.</aside>';
  let markup = recovery;
  let rejectStatus = false;
  let rejectReset = false;
  let resets = 0;
  const errors = [];
  const onError = (error) => errors.push(error.message);
  const inject = async (route) => {
    const document = await route.fetch();
    const body = (await document.text()).replace(/<aside id="booth-recovery">.*?<\/aside>/s, markup);
    await route.fulfill({ response: document, body });
  };
  const status = (route) => (rejectStatus
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic verification failure"}' })
    : route.continue());
  const reset = (route) => {
    resets += 1;
    if (!rejectReset) return route.continue();
    rejectReset = false;
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic reset failure"}' });
  };
  const ready = () => page.waitForFunction(() => (
    document.querySelector('#registration-email')
      && !document.querySelector('#email-form button').disabled
  ));
  page.on('pageerror', onError);
  await page.route(`${root}/accounts/**`, inject);
  await page.route(`${root}/example-report/**`, inject);
  await page.route('**/auth/booth/status', status);
  await page.route('**/auth/booth/reset', reset);
  try {
    await page.setViewportSize({ width: 2160, height: 3840 });
    for (const journey of ['personal', 'demo', 'legacy-personal', 'legacy-demo', 'finish', 'failed-reset', 'failed-status', 'idle']) {
      markup = journey === 'personal' || journey === 'demo' ? recovery : legacy;
      rejectStatus = false;
      await page.goto(`${root}/booth?preview=entry`);
      await ready();
      if (journey.includes('demo')) {
        await page.getByRole('button', { name: 'Staff: show industry demos', exact: true }).click();
        await page.locator('#demo-options button').first().click();
      } else {
        await page.getByLabel('Registration email').fill('visitor@example.test');
        await page.getByRole('button', { name: 'View my report', exact: true }).click();
      }
      await page.locator('#booth-return').waitFor();
      const before = resets;
      if (journey === 'failed-status') {
        rejectStatus = true;
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#booth-recovery p')?.textContent.includes('could not be verified'));
        check(!await page.locator('main').isVisible(), 'Failed verification exposed report content');
        rejectStatus = false;
        await page.getByRole('button', { name: 'Retry and clear screen', exact: true }).click();
      } else if (journey === 'finish') {
        await page.getByRole('link', { name: 'Finish reading my report' }).click();
        await page.locator('[data-panel="finish"]:not([hidden])').waitFor();
        await page.locator('[data-panel="finish"] [data-reset]').click();
      } else if (journey === 'idle') {
        await page.clock.install();
        await page.reload();
        await page.locator('#booth-return').waitFor();
        await page.clock.fastForward(900001);
        await page.clock.resume();
      } else {
        rejectReset = journey === 'failed-reset';
        await page.getByRole('button', { name: 'Clear for next visitor', exact: true }).click();
        if (journey === 'failed-reset') {
          await page.waitForFunction(() => document.querySelector('#booth-recovery p')?.textContent.includes('Could not clear'));
          check(!await page.locator('main').isVisible(), 'Failed reset exposed report content');
          check(!await page.locator('[data-booth-recover]').isDisabled(), 'Failed reset left recovery disabled');
          await page.getByRole('button', { name: 'Retry and clear screen', exact: true }).click();
        }
      }
      await page.waitForURL((url) => url.pathname === '/booth' && !url.searchParams.has('step'), { timeout: 10000 });
      await ready();
      check(resets - before === (journey === 'failed-reset' ? 2 : 1), `Unexpected reset count for ${journey}`);
      check(await page.getByLabel('Registration email').inputValue() === '', `${journey} retained attendee data`);
      check(await page.locator('#booth-recovery').count() === 0, `${journey} remained on report recovery`);
    }
    check(!errors.length, `Report recovery threw: ${errors.join('; ')}`);
  } finally {
    page.off('pageerror', onError);
    await page.unroute(`${root}/accounts/**`, inject);
    await page.unroute(`${root}/example-report/**`, inject);
    await page.unroute('**/auth/booth/status', status);
    await page.unroute('**/auth/booth/reset', reset);
  }
  return { resets, checked: 'Personal/demo clearing with current and legacy Worker HTML, Finish-to-entry, reset retry, failed verification and idle cleanup. No real customer requests or email.' };
}
