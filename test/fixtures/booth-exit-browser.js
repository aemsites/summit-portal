/** Synthetic navigation checks; never use live attendee services. */
export default async function runBoothExit(page, origin = 'http://localhost:3000') {
  if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) {
    throw new Error('Exit checks require the local fixture server.');
  }
  const browser = page.context().browser();
  const results = [];
  const fixturePath = '/test/fixtures/portal-login.html?staff&exit-booth';
  const fixture = await (await page.request.get(`${origin}${fixturePath}`)).text();
  const check = (condition, message) => { if (!condition) throw new Error(message); };

  for (const viewport of [
    { width: 2160, height: 3840 },
    { width: 1080, height: 1920 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    try {
      let mode = 'credentials';
      let release;
      let waitStarted;
      const waitingRequest = new Promise((resolve) => { waitStarted = resolve; });
      const submissions = [];
      const resets = [];
      await context.route((url) => url.origin === origin && url.pathname === '/login', (route) => (
        route.fulfill({ status: 200, contentType: 'text/html', body: fixture })
      ));
      await context.route('**/auth/booth/reset', async (route) => {
        resets.push(route.request().postDataJSON());
        await route.continue();
      });
      await context.route('**/auth/staff-login', async (route) => {
        const body = route.request().postDataJSON();
        check(body.action === 'exit-booth', 'Exit must submit its explicit action');
        check(body.username === 'fixture-staff', 'Exit username was not submitted');
        check(body.password === 'synthetic-password', 'Exit credential was not submitted');
        submissions.push(body.action);
        const outcome = mode;
        if (outcome === 'waiting') {
          await new Promise((resolve) => {
            release = resolve;
            waitStarted();
          });
        }
        let status = 200;
        if (outcome === 'credentials') status = 401;
        else if (['cleanup', 'waiting'].includes(outcome)) status = 503;
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({ result: outcome === 'success' ? 'exited' : 'ok' }),
        });
      });
      const screen = await context.newPage();
      await screen.goto(`${origin}${fixturePath}&redirect=%2Fadobe%2Fdashboard`);
      await screen.getByRole('button', { name: 'Sign out and exit booth' }).waitFor();
      const geometry = await screen.evaluate(() => {
        const bounds = (selector) => {
          const element = document.querySelector(selector);
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            font: parseFloat(getComputedStyle(element).fontSize),
          };
        };
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          input: bounds('#pl-staff-pass'),
          submit: bounds('.pl-submit'),
          cancel: bounds('.pl-staff-cancel'),
          title: document.querySelector('main h1').textContent,
        };
      });
      check(!geometry.overflow, 'Reauthentication must not overflow horizontally');
      check(geometry.title === 'Exit booth mode', 'Exit must not retain the customer login introduction');
      check(geometry.cancel.height >= 44, 'Cancel must remain a usable touch target');
      if (viewport.width === 2160) {
        check(geometry.input.height >= 144, 'Native-resolution inputs are too small');
        check(geometry.submit.height >= 120 && geometry.submit.font >= 40, 'Native exit button is too small');
      }
      await screen.locator('#pl-staff-user').fill('fixture-staff');
      for (const failure of ['credentials', 'cleanup', 'unconfirmed']) {
        mode = failure;
        await screen.locator('#pl-staff-pass').fill('synthetic-password');
        await screen.getByRole('button', { name: 'Sign out and exit booth' }).click();
        await screen.waitForFunction(() => !document.querySelector('.pl-submit').disabled);
        check(await screen.locator('#pl-staff-pass').inputValue() === '', 'Password must be cleared after an attempt');
        check(await screen.locator('.pl-error').isVisible(), 'Failed exit must show recovery feedback');
        check(new URL(screen.url()).searchParams.has('exit-booth'), 'Failure must not leave reauthentication');
      }
      mode = 'waiting';
      await screen.locator('#pl-staff-pass').fill('synthetic-password');
      await screen.getByRole('button', { name: 'Sign out and exit booth' }).click();
      await waitingRequest;
      await screen.waitForFunction(() => document.querySelector('.pl-submit').disabled);
      const blocked = await screen.evaluate(() => {
        const click = new MouseEvent('click', { cancelable: true });
        document.querySelector('.pl-staff-cancel').dispatchEvent(click);
        document.querySelector('.pl-staff-form').dispatchEvent(new Event('submit', { cancelable: true }));
        return click.defaultPrevented;
      });
      check(blocked && submissions.length === 4, 'Pending exit must block cancellation and duplicate submission');
      release();
      await screen.waitForFunction(() => !document.querySelector('.pl-submit').disabled);
      await screen.getByRole('link', { name: 'Back to booth' }).click();
      await screen.waitForFunction(() => document.querySelector('#stage')?.dataset.screen === 'welcome');
      await screen.locator('#registration-email').fill('visitor@example.com');
      await screen.locator('#staff-exit').click();
      await screen.waitForURL(`${origin}/login?staff&exit-booth`);
      check(resets.at(-1)?.prepareExit === true, 'Entry exit must clear and retire the visit before reauthentication');
      await screen.locator('#pl-staff-user').fill('fixture-staff');
      await screen.locator('#pl-staff-pass').fill('synthetic-password');
      mode = 'success';
      await screen.getByRole('button', { name: 'Sign out and exit booth' }).click();
      await screen.waitForURL(`${origin}/login`);
      await screen.locator('#pl-email').waitFor();
      check(await screen.locator('.pl-staff-only').count() === 0, 'Successful exit must return to ordinary login');
      results.push({ viewport, geometry, submissions: submissions.length, normalLogin: true });
    } finally {
      await context.close();
    }
  }
  return results;
}
