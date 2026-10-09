/** Local-only checks: real modules/public report, synthetic API replies, no live mutations. */
export default async function verifyLiveTouchscreen(page, root, publicReport) {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Use an isolated local fixture server, never the live booth.');
  }
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const actions = [];
  const safety = async (target) => {
    await target.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method()) && url.origin !== root) return route.abort();
      if (url.hostname.includes('simpleanalytics') || url.pathname.startsWith('/.rum')) {
        return route.fulfill({ contentType: 'text/javascript', body: '' });
      }
      return route.continue();
    });
    await target.route(`${root}/auth/me`, (route) => route.fulfill({ contentType: 'application/json', body: '{"authenticated":false}' }));
    await target.route(`${root}/login**`, (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>Local sign-in destination</title><h1>Fixture staff sign-in</h1>',
    }));
    await target.route(`${root}/fragments/nav/**`, async (route) => {
      const url = new URL(route.request().url());
      const response = await page.request.get(`https://act.aem.now${url.pathname}`);
      await route.fulfill({ response });
    });
  };
  await safety(page);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/auth/booth/')) actions.push(request.url());
  });
  const frame = page.frameLocator('#booth-screen');
  const ready = () => frame.locator('#email-form button[type="submit"]:not([disabled])').waitFor();
  const settle = async (target) => {
    await target.locator('html').evaluate(async () => {
      await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => {
        if (link.sheet) return Promise.resolve();
        return new Promise((resolve, reject) => {
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', () => reject(new Error(`Stylesheet failed: ${link.href}`)), { once: true });
        });
      }));
      document.body.getBoundingClientRect();
      await document.fonts.ready;
    });
    await page.waitForTimeout(100);
  };
  const resting = () => frame.locator('#email-form').evaluate((form) => ({
    top: form.getBoundingClientRect().top,
    scroll: window.scrollY,
    width: window.innerWidth,
    height: window.innerHeight,
    inset: document.documentElement.style.getPropertyValue('--booth-keyboard-inset'),
    keyboard: document.documentElement.classList.contains('booth-keyboard-active'),
    value: document.getElementById('registration-email').value,
  }));
  const open = async () => {
    await frame.locator('#registration-email').click();
    await page.locator('.touchscreen-keyboard:not([hidden])').waitFor();
    await page.waitForTimeout(80);
  };
  const clear = async () => {
    await frame.locator('[data-reset]:visible').last().click();
    await ready();
    await settle(frame);
  };
  await page.request.post(`${root}/auth/booth/reset`, { data: {} });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${root}/booth?touchscreen=1`);
  await ready();
  await settle(frame);
  const initial = await resting();
  check(initial.width === 2160 && initial.height === 3840, 'Wrong resting CSS viewport');
  check(initial.scroll === 0 && !initial.keyboard && !initial.inset, 'Entry starts with stale editing state');
  const host = await page.evaluate(() => {
    const el = document.querySelector('.touchscreen-frame');
    return { width: el.clientWidth, height: el.clientHeight };
  });
  check(await page.locator('main > .touchscreen-frame').count() === 1, 'Missing minimal screen');
  check(await page.locator('select, [data-email], #show-entry, #show-finish').count() === 0, 'Operator controls leaked into presentation');
  await open();
  for (const key of 'visitor@example.test') await page.locator(`[data-key="${key}"]`).click();
  check(await frame.locator('#registration-email').inputValue() === 'visitor@example.test', 'Keys did not type full email');
  await page.locator('[data-key="Backspace"]').click();
  await page.locator('[data-key="Shift"]').click();
  await page.locator('[data-key="t"]').click();
  check(await frame.locator('#registration-email').inputValue() === 'visitor@example.tesT', 'Shift or Backspace failed');
  await page.locator('[data-key="Shift"]').click();
  await page.keyboard.press('Backspace');
  await page.keyboard.type('t');
  check(await frame.locator('#registration-email').inputValue() === 'visitor@example.test', 'Physical keys lost iframe focus');
  const editing = await frame.locator('#registration-email').evaluate((field) => ({
    top: field.labels[0].getBoundingClientRect().top,
    bottom: field.form.querySelector('button[type="submit"]').getBoundingClientRect().bottom,
    height: window.innerHeight,
    inset: document.documentElement.style.getPropertyValue('--booth-keyboard-inset'),
  }));
  check(editing.top >= 24 && editing.bottom <= 2112 - 24, 'Keyboard covers the real form');
  check(editing.height === 3840 && editing.inset === '1728px', 'Overlay changed the layout viewport');
  await page.locator('[data-key="Hide"]').click();
  await page.waitForTimeout(100);
  const closed = await resting();
  check(closed.top === initial.top && closed.scroll === 0 && !closed.inset, 'Close did not restore resting bounds');
  check(closed.value === 'visitor@example.test', 'Close deleted email');
  await open();
  const beforeLookup = actions.filter((url) => url.endsWith('/lookup')).length;
  await page.locator('[data-key="Enter"]').click();
  await frame.locator('#booth-return').waitFor();
  check(actions.filter((url) => url.endsWith('/lookup')).length === beforeLookup + 1, 'Enter must submit once');
  await frame.locator('#booth-return [data-booth-clear]').click();
  await ready();
  await settle(frame);
  check(JSON.stringify(await resting()) === JSON.stringify(initial), 'Report return shifted or retained email');

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await open();
    await frame.locator('#registration-email').fill('visitor@example.test');
    const button = frame.locator('#email-form button[type="submit"]');
    await button.hover();
    const count = actions.filter((url) => url.endsWith('/lookup')).length;
    await page.mouse.down();
    await page.waitForTimeout(180);
    await page.mouse.up();
    await frame.locator('#booth-return').waitFor();
    check(actions.filter((url) => url.endsWith('/lookup')).length === count + 1, 'Held submit did not submit exactly once');
    await frame.locator('#booth-return a').click();
    await frame.locator('[data-panel="finish"]:not([hidden])').waitFor();
    await clear();
    check(JSON.stringify(await resting()) === JSON.stringify(initial), `Return cycle ${cycle} shifted Entry`);
    check(await page.locator('.touchscreen-keyboard').isHidden(), 'Return retained keyboard');
    check(await page.evaluate(() => {
      const el = document.querySelector('.touchscreen-frame');
      return el.clientWidth;
    }) === host.width, 'Outer frame changed width across navigation');
  }
  await open();
  await frame.locator('#registration-email').fill('invalid');
  const invalidCount = actions.filter((url) => url.endsWith('/lookup')).length;
  await page.locator('[data-key="Enter"]').click();
  await page.waitForTimeout(100);
  check(actions.filter((url) => url.endsWith('/lookup')).length === invalidCount, 'Invalid email bypassed native validation');
  await frame.locator('#registration-email').fill('multi@example.test');
  await page.locator('[data-key="Enter"]').click();
  await frame.locator('[data-panel="picker"]:not([hidden])').waitFor();
  await settle(frame);

  const direct = await page.context().newPage();
  await safety(direct);
  await direct.setViewportSize({ width: 2160, height: 3840 });
  const comparisons = [];
  const compare = async (path, selectors) => {
    await direct.goto(`${root}${path}`);
    if (path.startsWith('/example-report/')) {
      for (const target of [direct, frame]) {
        await target.locator('.report-ai-visibility .rav-rec-list').waitFor();
        await target.locator('link[href="https://use.typekit.net/pbq1nqa.css"]').waitFor({ state: 'attached' });
        await target.locator('main .section[data-status]').waitFor({ state: 'detached' });
        await target.locator('.rh-insight-text h1:not(.rh-typing)').waitFor();
      }
    }
    await settle(direct);
    await settle(frame);
    const bounds = (target) => target.locator('html').evaluate((html, list) => {
      const values = list.map((selector) => {
        const el = html.querySelector(selector);
        if (!el) throw new Error(`Missing real element ${selector}`);
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return [selector, rect.x, rect.y, rect.width, rect.height,
          style.fontFamily, style.fontSize, style.lineHeight, style.color, style.display];
      });
      return { values, width: window.innerWidth, height: window.innerHeight };
    }, selectors);
    const a = await bounds(direct);
    const b = await bounds(frame);
    check(JSON.stringify(a) === JSON.stringify(b), `Direct/frame geometry or styles differ on ${path}: ${JSON.stringify({ a, b })}`);
    comparisons.push({ path, selectors: selectors.length, identical: true });
  };
  const comparePixels = async () => {
    await page.setViewportSize({ width: 2192, height: 3872 });
    await page.mouse.move(0, 0);
    await settle(frame);
    const framedPixels = await page.locator('#booth-screen').screenshot({ animations: 'disabled', caret: 'hide' });
    const directPixels = await direct.screenshot({ animations: 'disabled', caret: 'hide' });
    const raster = await page.evaluate(async ({ framed, standalone }) => {
      const decode = async (image) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${image}`)).blob());
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const a = await decode(framed);
      const b = await decode(standalone);
      let maxDelta = 0;
      let changed = 0;
      for (let index = 0; index < a.data.length; index += 4) {
        const delta = Math.max(...[0, 1, 2, 3]
          .map((channel) => Math.abs(a.data[index + channel] - b.data[index + channel])));
        maxDelta = Math.max(maxDelta, delta);
        if (delta) changed += 1;
      }
      return {
        width: a.width,
        height: a.height,
        sameSize: a.width === b.width && a.height === b.height,
        maxDelta,
        changedFraction: changed / (a.width * a.height),
      };
    }, { framed: framedPixels.toString('base64'), standalone: directPixels.toString('base64') });
    // Chromium's iframe compositor differs by 1-3 channel levels, not geometry.
    check(
      raster.sameSize && raster.width === 2160 && raster.height === 3840
      && raster.maxDelta <= 3 && raster.changedFraction < 0.01,
      `Native-sized Entry raster differs or clips: ${JSON.stringify(raster)}`,
    );
    comparisons.push({ path: '/booth', raster });
    await page.setViewportSize({ width: 1366, height: 900 });
  };
  await compare('/booth?step=picker', ['.stage-header', '#picker-heading', '#report-options', '.booth-progress']);
  await frame.locator('.report-option').first().click();
  await frame.locator('#booth-return').waitFor();
  await frame.locator('#booth-return a').click();
  await frame.locator('[data-panel="finish"]:not([hidden])').waitFor();
  await frame.locator('#report-preview[aria-busy="false"] .preview-card').first().waitFor();
  await compare('/booth?step=finish', ['.stage-header', '#finish-heading', '#send-report', '.finish-clear', '.booth-progress']);
  const sends = actions.filter((url) => url.endsWith('/send')).length;
  await frame.locator('#send-report').click();
  await frame.locator('#finish-status').filter({ hasText: 'Your report link was emailed.' }).waitFor();
  check(actions.filter((url) => url.endsWith('/send')).length === sends + 1, 'Email action must use the real send endpoint exactly once');
  await clear();
  await compare('/booth', ['.stage-header', '#welcome-heading', '#email-form', '#registration-email', '.booth-progress']);
  await comparePixels();
  check(await direct.evaluate(() => !Object.hasOwn(navigator, 'virtualKeyboard')), 'Ordinary page got a keyboard facade');
  await direct.goto(`${root}/booth?touchscreen=frame`);
  await settle(direct);
  check(await direct.evaluate(() => !Object.hasOwn(navigator, 'virtualKeyboard')), 'Top-level frame flag installed a facade');

  if (publicReport) {
    const path = '/example-report/frescopa/';
    let guardedDocument;
    const publicDocument = async (route) => {
      const context = await (await page.request.get(`${root}/auth/booth/status`)).json();
      const template = await (await page.request.get(`${root}${path}`)).text();
      const concealment = template.match(/<style id="booth-report-concealment">[\s\S]*?<\/style>/)[0];
      const recovery = template.match(/<aside id="booth-recovery">[\s\S]*?<\/aside><noscript>[\s\S]*?<\/noscript>/)[0];
      const url = new URL(route.request().url());
      const bridge = url.searchParams.get('touchscreen') === 'frame'
        ? '<script src="/scripts/booth-touchscreen-device.js"></script>' : '';
      const html = publicReport.replace('<html>', '<html class="booth-report-pending">')
        .replace('<head>', `<head>${bridge}${concealment}<script type="module" data-booth-mode="demo" data-booth-expires-at="${context.expiresAt}" src="/scripts/booth-report.js"></script>`)
        .replace(/(<body[^>]*>)/, `$1${recovery}<div id="booth-report-content" hidden>`)
        .replace('</body>', '</div></body>');
      guardedDocument = html;
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    };
    await page.route(`${root}${path}*`, publicDocument);
    // Public source assets only. Mutations never leave this local fixture origin.
    const media = async (route) => {
      const url = new URL(route.request().url());
      const response = await page.request.get(`https://act.aem.now${url.pathname}${url.search}`);
      await route.fulfill({ response });
    };
    await page.route(`${root}/example-report/frescopa/media_*`, media);
    await page.route(`${root}/media_*`, media);
    await frame.locator('[data-show-demos]').first().click();
    await frame.locator('.demo-option').filter({ hasText: 'FrescoPa' }).click();
    await frame.locator('html.booth-report-active').waitFor();
    await direct.route(`${root}${path}*`, publicDocument);
    await direct.route(`${root}/example-report/frescopa/media_*`, media);
    await direct.route(`${root}/media_*`, media);
    await compare(path, ['main h1', '.report-hero', '.report-stats', '.report-carousel', '.report-ai-visibility', '#booth-return']);
    await frame.locator('#booth-return [data-booth-clear]').click();
    await ready();
    await settle(frame);
    check(JSON.stringify(await resting()) === JSON.stringify(initial), 'Public report return shifted Entry');
    for (const proof of ['expired', 'no-context']) {
      const expiresAt = proof === 'expired' ? 1 : Date.now() + 60000;
      const guarded = guardedDocument.replace(/data-booth-expires-at="\d+"/, `data-booth-expires-at="${expiresAt}"`)
        .replace('<head>', '<head><script src="/scripts/booth-touchscreen-device.js"></script>');
      const target = `${root}${path}?touchscreen=frame&proof=${proof}`;
      await page.route(target, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: guarded }));
      await frame.locator('html').evaluate((html, url) => { window.location.replace(url); }, target);
      await frame.locator('#booth-recovery p[role="alert"]').waitFor();
      check(!(await frame.locator('main').isVisible()), `${proof} report exposed content`);
      check(await frame.locator('#booth-return').count() === 0, `${proof} report installed authorized controls`);
      await frame.locator('[data-booth-recover]').click();
      await ready();
      await settle(frame);
      check(JSON.stringify(await resting()) === JSON.stringify(initial), `${proof} recovery shifted Entry`);
    }
  }
  await direct.goto(`${root}/booth?touchscreen=1`);
  const secondFrame = direct.frameLocator('#booth-screen');
  await secondFrame.locator('#email-form button[type="submit"]:not([disabled])').waitFor();
  await open();
  check(await direct.locator('.touchscreen-keyboard').isHidden(), 'Editing in one tab opened another keyboard');
  await page.locator('[data-key="Hide"]').click();
  await page.evaluate(() => {
    const unexpected = document.createElement('iframe');
    unexpected.id = 'unexpected-frame';
    unexpected.src = '/booth?touchscreen=frame';
    document.body.append(unexpected);
  });
  const unexpected = page.frameLocator('#unexpected-frame');
  await unexpected.locator('#email-form button[type="submit"]:not([disabled])').waitFor();
  check(await unexpected.locator('html').evaluate(() => !Object.hasOwn(navigator, 'virtualKeyboard')), 'Unowned iframe installed a keyboard facade');
  await page.locator('#unexpected-frame').evaluate((iframe) => iframe.remove());
  await open();
  await frame.locator('html').evaluate((html) => {
    html.dataset.previousDocument = 'true';
    window.location.replace('/booth?touchscreen=frame');
  });
  await page.waitForFunction(() => {
    const doc = document.getElementById('booth-screen').contentDocument;
    return doc?.documentElement?.dataset.previousDocument !== 'true'
      && doc?.querySelector('#email-form button[type="submit"]:not([disabled])');
  });
  await settle(frame);
  check(JSON.stringify(await resting()) === JSON.stringify(initial), 'Navigation while editing retained geometry or scrolling');
  await frame.locator('#staff-exit').click();
  await page.waitForURL('**/login?staff**');
  check(new URL(page.url()).searchParams.get('redirect') === '/booth?touchscreen=1', 'Staff exit did not return to top-level presentation sign-in');
  await direct.close();
  check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  return { viewport: [2160, 3840], editing, returnCycles: 4, comparisons, errors };
}
