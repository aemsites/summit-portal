/** Run against decorated public markup in a local, synthetic booth visit. */
export default async function verifyBoothReportLayout(report) {
  if (!['localhost', '127.0.0.1'].includes(new URL(report.url()).hostname)) {
    throw new Error('Report layout checks must not drive a production attendee visit.');
  }
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await report.waitForFunction(() => document.documentElement.matches(
    '.booth-report-active.booth-report-composition:not(.booth-report-pending)',
  ));
  for (const section of await report.locator('main > .section').all()) {
    await section.scrollIntoViewIfNeeded();
  }
  await report.evaluate(() => document.fonts.ready);
  const geometry = await report.evaluate(() => {
    const bounds = (element) => element.getBoundingClientRect();
    const space = parseFloat(getComputedStyle(document.querySelector('main')).paddingLeft);
    const callouts = [...document.querySelectorAll('main .rcl-bar')].map((bar) => {
      const parent = bounds(bar.parentElement);
      const box = bounds(bar);
      const text = bounds(bar.querySelector('.rcl-text'));
      const padding = parseFloat(getComputedStyle(bar).paddingRight);
      return {
        standalone: bar.parentElement.matches('main'),
        widthDelta: parent.width - box.width,
        unusedTextWidth: box.right - padding - text.right,
      };
    });
    const headings = [...document.querySelectorAll(
      'main .rai-section-head-title, main .rav-section-title',
    )].map((heading) => {
      const box = bounds(heading);
      const parent = bounds(heading.parentElement);
      return { text: heading.textContent, left: box.left - parent.left, top: box.top - parent.top };
    });
    const gauges = [...document.querySelectorAll('.rsc-hero:has(.rsc-ring)')].map((hero) => {
      const ring = bounds(hero.querySelector('.rsc-ring'));
      const verdict = bounds(hero.querySelector('.rsc-verdict'));
      return Math.abs((ring.left + ring.width / 2) - (verdict.left + verdict.width / 2));
    });
    return {
      viewport: [window.innerWidth, window.innerHeight],
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      space,
      callouts,
      headings,
      gauges,
      stripHeight: bounds(document.querySelector('.rs-dark-strip')).height,
    };
  });
  check(!geometry.overflow, 'Report overflows its viewport');
  check(geometry.callouts.length >= 3, 'Use complete report markup with summary and How to act callouts');
  geometry.callouts.forEach(({ standalone, widthDelta, unusedTextWidth }) => {
    check(standalone || Math.abs(widthDelta) <= 1, `Callout does not fill its parent: ${widthDelta}px`);
    check(Math.abs(unusedTextWidth) <= 1, `Narrative leaves unused width: ${unusedTextWidth}px`);
  });
  check(geometry.headings.length >= 4, 'Use report markup with all four major headings');
  geometry.headings.forEach(({ text, left, top }) => {
    check(left >= geometry.space - 1 && top >= geometry.space / 2 - 1, `Cramped ${text} heading: ${left}px / ${top}px`);
  });
  check(geometry.gauges.length > 0, 'Use report markup with performance gauges');
  geometry.gauges.forEach((delta) => check(delta <= 1, `Gauge verdict is off-center: ${delta}px`));
  check(geometry.stripHeight < 600, `Collapsed KPI strip is too dense: ${geometry.stripHeight}px`);
  const insights = report.locator('.rs-dark-card .booth-kpi-insight');
  check(await insights.count() === 4, 'Expected four touch-friendly KPI explanations');
  for (const details of await insights.all()) {
    const summary = details.locator('summary');
    const description = details.locator('.rs-dark-desc');
    const original = await description.textContent();
    check(await details.getAttribute('open') === null, 'KPI insight should start closed');
    check(!(await description.isVisible()), 'Closed insight still displays full copy');
    const targetHeight = await summary.evaluate((element) => (
      element.getBoundingClientRect().height
    ));
    check(targetHeight >= (geometry.viewport[0] >= 2160 ? 96 : 64), 'KPI disclosure touch target is too small');
    await summary.tap();
    await description.waitFor({ state: 'visible' });
    check(await description.textContent() === original, 'KPI disclosure lost full insight text');
    check(await description.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'Expanded KPI copy overflows');
    await summary.press('Space');
    await description.waitFor({ state: 'hidden' });
    await summary.press('Enter');
    await description.waitFor({ state: 'visible' });
    await summary.tap();
    await description.waitFor({ state: 'hidden' });
  }
  await report.evaluate(() => window.scrollTo(0, 0));
  return geometry;
}
