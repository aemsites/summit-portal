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
  check(geometry.stripHeight < 650, `Preview KPI strip is too dense: ${geometry.stripHeight}px`);
  const insights = report.locator('.rs-dark-card .booth-kpi-insight');
  check(await insights.count() === 4, 'Expected four readable KPI preview panels');
  for (const panel of await insights.all()) {
    check(await panel.evaluate((element) => (
      Math.abs(element.getBoundingClientRect().width
        - element.parentElement.getBoundingClientRect().width) <= 1
    )), 'Reading panel overlaps its neighboring KPI column');
  }
  const descriptions = report.locator('.booth-kpi-insight .rs-dark-desc');
  const original = await descriptions.allTextContents();
  for (const description of await descriptions.all()) {
    check(await description.isVisible(), 'Insight preview is hidden before tapping');
    check(await description.evaluate((element) => getComputedStyle(element).color === 'rgb(224, 224, 224)'), 'Insight copy is not legible on its charcoal panel');
  }
  const button = report.locator('.booth-kpi-toggle');
  check(await button.count() === 1, 'Expected one control for all insights');
  const height = await button.evaluate((element) => element.getBoundingClientRect().height);
  check(height >= (geometry.viewport[0] >= 2160 ? 96 : 64), 'Shared insight button is too small');
  for (const operation of ['tap', 'Space', 'Enter', 'tap']) {
    if (operation === 'tap') await button.tap();
    else await button.press(operation);
    const expanded = await button.getAttribute('aria-expanded') === 'true';
    check(JSON.stringify(await descriptions.allTextContents()) === JSON.stringify(original), 'Full authored insight text was changed');
    for (const description of await descriptions.all()) {
      check(await description.isVisible(), 'Insight preview disappeared after collapse');
      check(await description.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'Insight copy overflows');
      if (expanded) check(await description.evaluate((element) => Math.abs(element.clientHeight - element.scrollHeight) <= 1), 'One tap did not reveal every full insight');
    }
  }
  await report.evaluate(() => window.scrollTo(0, 0));
  return geometry;
}
