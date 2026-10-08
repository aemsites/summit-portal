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
    check(await page.locator('#email-form button').isDisabled(), 'Timeout enables another visitor before reset');
    check((await page.locator('#booth-status').textContent()).includes('timed out'), 'Timeout lacks visible recovery');
    await page.clock.fastForward(601000);
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
