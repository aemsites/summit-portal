/** Compare live synthetic screens to the final Figma frames, never attendee data. */
export default async function verifyBoothFinalDesign(page, root = 'http://localhost:3000') {
  if (!['localhost', '127.0.0.1'].includes(new URL(root).hostname)) {
    throw new Error('Design checks require the local-only booth fixture server.');
  }
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const bounds = async (selector) => page.locator(selector).evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  });
  const match = async (selector, expected) => {
    const actual = await bounds(selector);
    Object.entries(expected).forEach(([dimension, value]) => {
      check(Math.abs(actual[dimension] - value) < 1, `${selector} ${dimension}: ${actual[dimension]} != ${value}`);
    });
    return actual;
  };
  const ready = () => page.waitForFunction(() => !document.querySelector('#email-form button').disabled);
  await page.setViewportSize({ width: 2160, height: 2881 });
  await page.goto(`${root}/content/index?preview=entry`);
  await ready();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await match('.stage-header', { x: 0, y: 0, width: 2160, height: 277 });
  await match('.brand-icon', { x: 100, y: 64, width: 264.858, height: 64 });
  await match('.welcome-intro h1', { x: 100, y: 555.5, width: 840, height: 285 });
  await match('.hero-bottom p', { x: 100, y: 880.5, width: 840, height: 150 });
  await match('[data-panel="welcome"] .welcome-entry .lead', { x: 112, y: 1667, width: 1936, height: 97 });
  await match('.email-form label', { x: 112, y: 1820, width: 1936, height: 66 });
  await match('.email-form input', { x: 112, y: 1904, width: 1936, height: 144 });
  await match('.form-help', { x: 112, y: 2066, width: 1936, height: 66 });
  await match('.email-form .primary', { x: 112, y: 2212, width: 454, height: 120 });
  await match('.stage-footer', { x: 0, y: 2652, width: 2160, height: 229 });
  const field = await page.locator('.email-form input').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      font: parseFloat(style.fontSize),
      border: parseFloat(style.borderWidth),
      color: style.borderColor,
      radius: parseFloat(style.borderRadius),
    };
  });
  check(Math.abs(field.font - 54) < 1 && field.border === 6
    && field.color === 'rgb(218, 218, 218)' && Math.abs(field.radius - 30) < 1, 'Final email-field styling differs');
  check(await page.locator('.arrow').getAttribute('src') === '/img/booth/finish-open-in.svg', 'Entry uses the wrong action glyph');
  check(await page.locator('#search-privacy').isVisible(), 'Design corrections removed the privacy disclosure');
  check(await page.getByRole('button', { name: 'Staff: show industry demos' }).isVisible(), 'Design corrections removed the staff shortcut');
  const staffStyle = await page.locator('.entry-alternatives button').evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, border: style.borderColor };
  });
  check(staffStyle.background === 'rgb(255, 255, 255)'
    && staffStyle.color === 'rgb(80, 80, 80)'
    && staffStyle.border === 'rgb(143, 143, 143)', 'Staff shortcut is not a quiet outlined action');
  const staff = await bounds('.entry-alternatives button');
  check(Math.abs(staff.y - 2212) < 1 && staff.height === 120
    && Math.abs(staff.x + staff.width - 2048) < 1, 'Staff shortcut is not aligned to the right of the lookup action');
  for (const [width, height] of [[2160, 3840], [1080, 1920], [390, 844]]) {
    await page.setViewportSize({ width, height });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Entry overflows horizontally');
    const input = await bounds('.email-form input');
    check(input.height >= 64, 'Entry field is too small for touch');
    const primary = await bounds('.email-form .primary');
    const alternative = await bounds('.entry-alternatives button');
    const row = await bounds('.entry-actions');
    check(alternative.height >= 64
      && Math.abs(alternative.x + alternative.width - row.x - row.width) < 1, 'Staff shortcut loses its right alignment or touch target');
    const aligned = width < 1000
      ? alternative.y >= primary.y + primary.height : Math.abs(alternative.y - primary.y) < 1;
    check(aligned, 'Entry actions do not adapt from a shared desktop row to stacked mobile rows');
  }

  await page.setViewportSize({ width: 2160, height: 2881 });
  await page.goto(`${root}/booth?preview=finish&step=finish`);
  await page.locator('.preview-montage').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await match('#report-preview', { x: 100, y: 341, width: 1960, height: 752 });
  await match('.preview-card[data-position="center"]', { x: 375, y: 369, width: 1410, height: 724 });
  await match('.preview-card[data-position="left"]', { x: 100, y: 397, width: 910, height: 696 });
  await match('.preview-card[data-position="right"]', { x: 1207, y: 397, width: 853, height: 696 });
  await match('#send-report', { x: 506, y: 1389, width: 467, height: 120 });
  await match('.finish-clear', { x: 1053, y: 1389, width: 601, height: 120 });
  await match('.send-hint', { x: 112, y: 1589, width: 1936, height: 66 });
  await match('.stage-footer', { x: 0, y: 2652, width: 2160, height: 229 });
  check(await page.locator('.preview-montage').evaluate((element) => (
    getComputedStyle(element, '::before').backgroundImage.includes('finish-glow.svg')
  )), 'Finish is missing the exact Figma glow');
  const glow = await page.request.get(`${root}/img/booth/finish-glow.svg`);
  check(glow.ok() && (await glow.text()).includes('<svg'), 'Finish glow does not load');
  for (const [width, height] of [[2160, 3840], [1080, 1920], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.preview-card').evaluateAll(async (cards) => {
      cards.forEach((card) => card.getBoundingClientRect());
      await Promise.all(cards.flatMap((card) => card.getAnimations())
        .map((animation) => animation.finished.catch(() => {})));
    });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Finish overflows horizontally');
    for (const selector of ['#send-report', '.finish-clear']) {
      const action = await bounds(selector);
      check(action.height >= 62, 'Finish action is too small for touch');
    }
  }
  return { checked: 'Final Entry/Finish native Figma coordinates within one pixel, typography, field styling, exact assets, truthful staff/privacy additions and responsive touch targets.' };
}
