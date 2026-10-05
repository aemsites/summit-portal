const SCREENS = [
  'login', 'no-match', 'sent', 'lookup-error', 'email-error', 'send-error',
  'auth-error', 'denied', 'request', 'request-plain', 'request-success', 'staff',
];

const VIEWPORTS = [
  [320, 568], [360, 800], [375, 667], [390, 844], [393, 852], [412, 915],
  [430, 932], [844, 390], [768, 1024], [999, 900], [1000, 900], [1440, 1000],
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

export default async function verifyRecovery(page, base = 'http://localhost:3000') {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let cases = 0;
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      for (const screen of SCREENS) {
        const label = `${width}x${height} / ${theme} / ${screen}`;
        await page.goto(`${base}/prototypes/qr-report-access/index.html?screen=${screen}&theme=${theme}`);
        await page.locator('#preview .portal-login, #preview .portal-recovery, #preview .report-request-form').waitFor();
        if (screen === 'no-match') {
          await page.locator('.pl-unavailable:not([hidden])').waitFor();
          check(await page.locator('.pl-success').count() === 0, `${label}: false success`);
          check(await page.locator('#pl-email').count() === 1, `${label}: retry input lost`);
        } else if (screen === 'sent') {
          await page.locator('.pl-success').waitFor();
          check(await page.locator('.pl-magic-form').count() === 0, `${label}: sent form remains`);
        } else if (['email-error', 'send-error'].includes(screen)) {
          await page.locator('.pl-error:not([hidden])').waitFor();
          check(await page.locator('.pl-success').count() === 0, `${label}: error became success`);
          check(!await page.locator('.pl-submit').isDisabled(), `${label}: retry blocked`);
        } else if (screen === 'request-success') {
          await page.locator('.rrf-success').waitFor();
          check(await page.locator('main form').count() === 0, `${label}: submission remains`);
        } else if (screen === 'staff') {
          check(await page.locator('#pl-email').count() === 0, `${label}: customer form leaked`);
          check(await page.locator('.pl-request').count() === 0, `${label}: staff flow changed`);
        } else if (screen === 'request') {
          check(await page.locator('.rrf-recovery').isVisible(), `${label}: contextual notice missing`);
        } else if (screen === 'request-plain') {
          check(
            await page.locator('.rrf-recovery').count() === 0,
            `${label}: public form changed`,
          );
        }

        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          primary: [...document.querySelectorAll(
            '.pl-submit, .pl-request-action, .pl-col-adobe a, .pr-primary, .rrf-action button',
          )]
            .filter((element) => element.getClientRects().length)
            .map((element) => ({
              height: element.getBoundingClientRect().height,
              label: element.textContent,
            })),
          inputs: [...document.querySelectorAll('main input:not([type="checkbox"]):not(.rrf-honeypot)')]
            .map((element) => parseFloat(getComputedStyle(element).fontSize)),
          fieldsContained: [...document.querySelectorAll('.rrf-field input')].every((input) => {
            if (!input.getClientRects().length) return true;
            const field = input.closest('.rrf-field').getBoundingClientRect();
            const bounds = input.getBoundingClientRect();
            return bounds.left >= field.left - 1 && bounds.right <= field.right + 1;
          }),
        }));
        check(!layout.overflow, `${label}: horizontal overflow`);
        check(layout.fieldsContained, `${label}: input exceeds its field`);
        check(
          layout.primary.every((action) => action.height >= 44),
          `${label}: primary touch target too small`,
        );
        check(layout.inputs.every((size) => size >= 16), `${label}: input text can trigger iOS zoom`);
        check(errors.length === 0, `${label}: ${errors.join(', ')}`);
        cases += 1;
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/prototypes/qr-report-access/index.html?screen=no-match`);
  await page.locator('.pl-unavailable:not([hidden])').waitFor();
  await page.locator('.pl-unavailable a').click();
  await page.locator('.rrf-recovery').waitFor();
  const form = page.locator('.report-request-form-form');
  await form.getByRole('button', { name: 'Request my report' }).click();
  await page.locator('.rrf-error-summary:not([hidden])').waitFor();
  check(await page.locator('.rrf-success').count() === 0, 'Invalid request must not submit');
  await form.getByRole('textbox', { name: 'Full name', exact: true }).fill('Jordan Lee');
  await form.getByRole('textbox', { name: 'Business email', exact: true }).fill('jordan@example.com');
  await form.getByRole('textbox', { name: 'Company', exact: true }).fill('Example Company');
  await form.getByRole('textbox', { name: 'Website or domain', exact: true }).fill('example.com');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Request my report' }).click();
  await page.locator('.rrf-success').waitFor();
  check(await page.locator('.rrf-recovery').count() === 0, 'Confirmation must replace recovery notice');

  // Exercise the actual route initializer, not just the isolated recovery block.
  await page.route('**/content/index', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/styles.css"></head><body class="no-header"><main><div><p>You are not authorized.</p></div></main></body></html>',
  }));
  await page.goto(`${base}/content/index`);
  await page.evaluate(async () => {
    const moduleUrl = new URL('/scripts/scripts.js', window.location.href);
    const { ensureRequiredRouteBlocks } = await import(moduleUrl.href);
    await ensureRequiredRouteBlocks('/403');
  });
  await page.locator('.portal-recovery h1').waitFor();
  check(await page.locator('.portal-recovery h1').isVisible(), 'Actual 403 route renders hidden');
  check(await page.locator('.pr-primary').getAttribute('href') === '/request-report', 'Actual 403 recovery link changed');
  await page.unroute('**/content/index');

  check(errors.length === 0, `Route initialization failed: ${errors.join(', ')}`);
  return {
    layoutCases: cases,
    engines: page.context().browser().browserType().name(),
    viewports: VIEWPORTS.length,
    screens: SCREENS.length,
    themes: 2,
  };
}
