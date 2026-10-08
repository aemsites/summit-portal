/** Synthetic local checks for the scaled Entry seam and shared booth controls. */
export default async function verifyBoothControls(page, root = 'http://localhost:3000') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Control checks require the local-only booth fixture server.');
  }
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const viewport = { width: 2160, height: 3840 };
  const scaled = await page.context().browser().newContext({ viewport, deviceScaleFactor: 0.4 });
  try {
    const preview = await scaled.newPage();
    await preview.goto(`${root}/booth`);
    await preview.waitForFunction(() => !document.querySelector('#email-form button').disabled);
    const bottom = await preview.locator('[data-panel="welcome"] .welcome-entry')
      .evaluate((element) => element.getBoundingClientRect().bottom);
    const clip = { x: 900, y: Math.floor(bottom) - 3, width: 100, height: 7 };
    const image = await preview.screenshot({ clip });
    const white = await preview.evaluate(async (png) => {
      const sample = new Image();
      sample.src = `data:image/png;base64,${png}`;
      await sample.decode();
      const canvas = document.createElement('canvas');
      canvas.width = sample.width;
      canvas.height = sample.height;
      const context = canvas.getContext('2d');
      context.drawImage(sample, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      return data.every((value) => value === 255);
    }, image.toString('base64'));
    check(white, 'Scaled Entry contains a gray seam at the white panel boundary');
  } finally {
    await scaled.close();
  }

  const ready = () => page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  const profiles = [[2160, 3840], [1080, 1920], [390, 844]];
  const buttonStyle = async (selector) => page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      height: bounds.height,
      underline: style.textDecorationLine.includes('underline'),
      border: parseFloat(style.borderWidth),
      radius: parseFloat(style.borderRadius),
      background: style.backgroundColor,
    };
  });
  await page.goto(`${root}/booth`);
  await ready();
  for (const [width, height] of profiles) {
    await page.setViewportSize({ width, height });
    const staff = await buttonStyle('#staff-exit');
    check(!staff.underline && staff.border >= 1 && staff.radius >= 24
      && staff.height >= 48 && staff.height <= 72, 'Staff signout is not a compact outlined button');
  }
  await page.getByRole('button', { name: 'Staff: show industry demos' }).click();
  const industryStaff = await buttonStyle('#staff-exit');
  check(!industryStaff.underline && industryStaff.border >= 1, 'Industry signout uses a different treatment');
  await page.locator('#demo-options button').first().click();
  await page.locator('#booth-return').waitFor();
  for (const [width, height] of profiles) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => (
      parseFloat(getComputedStyle(document.body).paddingBottom)
        >= document.querySelector('#booth-return').getBoundingClientRect().height - 0.01
    ));
    const primary = await buttonStyle('#booth-return a');
    const clear = await buttonStyle('#booth-return [data-booth-clear]');
    check(
      primary.background === 'rgb(59, 99, 251)' && primary.radius >= 24,
      'Report navigation does not use the shared blue pill treatment',
    );
    check(
      !clear.underline && clear.border >= 1 && clear.radius >= 24 && clear.height >= 64,
      'Report clearing is not a touch-sized outlined button',
    );
    check(await page.evaluate(() => (
      document.documentElement.scrollWidth <= window.innerWidth
        && document.querySelector('#booth-return').getBoundingClientRect().bottom === window.innerHeight
        && parseFloat(getComputedStyle(document.body).paddingBottom)
          >= document.querySelector('#booth-return').getBoundingClientRect().height - 0.01
    )), 'Report menu overlaps content or overflows the viewport');
  }
  await page.locator('#booth-return [data-booth-clear]').click();
  await page.waitForURL((url) => url.pathname === '/booth');
  await ready();
  check(await page.locator('#registration-email').inputValue() === '', 'Clear retained visitor state');
  return { checked: 'No gray seam at 40% scale; compact outlined staff controls; blue/outlined report pills; responsive fixed menu reservation; demo clearing. Synthetic data only.' };
}
