import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import sinon from 'sinon';
import mountBoothReturn, { formatBoothChartDates } from '../../scripts/booth-report.js';
import decorateCarousel from '../../blocks/report-carousel/report-carousel.js';
import decorateScores from '../../blocks/report-scores/report-scores.js';
import decorateHero from '../../blocks/report-hero/report-hero.js';
import { parseVisibilityRows, renderPanel } from '../../blocks/report-ai-visibility/rav-core.js';

class TestObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    TestObserver.instances.push(this);
  }

  observe() {}
}

describe('confirmed booth report portrait layout', () => {
  let sandbox;
  let timers;
  const styles = [];

  before(async () => {
    await Promise.all([
      '/styles/styles.css', '/blocks/report-hero/report-hero.css',
      '/blocks/report-carousel/report-carousel.css', '/blocks/report-scores/report-scores.css',
      '/blocks/report-ai-visibility/report-ai-visibility.css',
      '/blocks/report-stats/report-stats.css',
    ].map((href) => new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      styles.push(link);
      document.head.append(link);
    })));
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    timers = sandbox.spy(window, 'setTimeout');
  });

  afterEach(() => {
    timers.getCalls().forEach((call) => window.clearTimeout(call.returnValue));
    document.querySelector('#booth-return')?.remove();
    document.querySelector('link[href="/styles/booth-report.css"]')?.remove();
    document.querySelectorAll('style[data-booth-test]').forEach((style) => style.remove());
    document.querySelector('main')?.remove();
    document.documentElement.classList.remove('booth-report-active');
    TestObserver.instances = [];
    sandbox.restore();
  });

  after(() => styles.forEach((link) => link.remove()));

  function reportFixture() {
    const main = document.createElement('main');
    main.innerHTML = `<div class="section"><div class="block-content">
      <div class="report-hero insight"><div><div>
        <h1>Example international organization with a longer report name</h1>
        <p>Digital Opportunity Report</p>
        <p><a href="https://example.com">example.com</a></p>
        <p>Measured: October 2026</p>
      </div><div></div></div></div>
      <div class="report-stats dark"><div class="rs-dark-card">
        <div class="rs-dark-label">Organic growth</div><div class="rs-dark-value">61</div>
        <div class="rs-dark-badge">Up since the previous measurement</div>
        <p class="rs-dark-desc">Measured category demand.</p>
      </div></div>
      <div class="report-carousel">
        <div><div>Search</div><div>Experience</div></div>
        <div><div>Search</div></div>
        <div><div>Trend</div><div><h3>Measured demand</h3><p>Monthly demand over time.</p><em>Example source</em></div>
          <div><p>linechart</p>${Array.from({ length: 12 }, (_, i) => `<p>2026-${String(i + 1).padStart(2, '0')} | ${100 + i}</p>`).join('')}</div></div>
        <div><div>Next insight</div><div><h3>Second insight</h3><p>Additional narrative.</p></div><div><p>bigfigure</p><p>61 | out of 100 | Example measure</p></div></div>
        <div><div>Experience</div></div>
        <div><div>Quality</div><div><h3>Site experience</h3><p>Experience narrative.</p></div><div><p>metricstrip</p><p>Load | 2.9s | Target 2.5s</p></div></div>
      </div>
      <div class="report-scores" data-metrics="field"><div>
        <div>Homepage</div><div><a href="https://example.com/">example.com</a></div>
        <div>53</div><div>2.9s</div><div>98ms</div><div>0.35</div>
        <div>Measured performance narrative.</div><div>Improve layout stability.</div>
      </div></div>
      <div class="report-ai-visibility">
        <div><div>comparison</div><div><h3>AI platforms</h3><p>Example AI visibility narrative.</p></div>
          <div><p>platformbars</p><p>ChatGPT | 45</p><p>Google Gemini | 35</p><p>Perplexity | 20</p></div></div>
        <div><div>competitors</div><div><h3>Brand comparison</h3><p>Tracked category prompts.</p></div>
          <div><p>scoretable</p><p>Example brand with a longer name | 1200 | 350 | 61</p></div></div>
      </div>
    </div></div>`;
    document.body.append(main);
    decorateHero(main.querySelector('.report-hero'));
    window.clearTimeout(timers.lastCall.returnValue);
    const heading = main.querySelector('.rh-insight-text h1');
    heading.textContent = 'Example international organization with a longer report name';
    heading.classList.remove('rh-typing');
    decorateCarousel(main.querySelector('.report-carousel'));
    decorateScores(main.querySelector('.report-scores'));
    const visibility = main.querySelector('.report-ai-visibility');
    const panels = document.createElement('div');
    panels.className = 'rav-panels';
    panels.append(...parseVisibilityRows(visibility).map((row) => renderPanel(row)));
    visibility.replaceChildren(panels);
    return main;
  }

  async function mount(context = {}) {
    const nativeMatchMedia = window.matchMedia.bind(window);
    sandbox.stub(window, 'matchMedia').callsFake((query) => ({
      matches: nativeMatchMedia(query).matches,
      addEventListener() {},
    }));
    sandbox.stub(window, 'MutationObserver').value(TestObserver);
    sandbox.stub(window, 'ResizeObserver').value(TestObserver);
    sandbox.stub(document, 'addEventListener');
    sandbox.stub(window, 'addEventListener');
    sandbox.stub(window, 'fetch').resolves(new Response(JSON.stringify({
      state: 'report',
      selectedPath: window.location.pathname,
      expiresAt: Date.now() + 600000,
      ...context,
    })));
    await mountBoothReturn();
    const link = document.querySelector('link[href="/styles/booth-report.css"]');
    if (link && !link.sheet) {
      await new Promise((resolve, reject) => {
        link.onload = resolve;
        link.onerror = reject;
      });
    }
    TestObserver.instances.forEach((observer) => observer.callback());
    const style = [...document.querySelectorAll('style')]
      .find((el) => el.textContent.includes('--booth-original-padding'));
    if (style) style.dataset.boothTest = 'true';
  }

  const font = (selector) => parseFloat(
    getComputedStyle(document.querySelector(selector)).fontSize,
  );
  const rect = (selector) => document.querySelector(selector).getBoundingClientRect();

  for (const invalid of [
    { state: 'entry' }, { state: 'picker' }, { expiresAt: 1 },
    { expiresAt: '9999999999999' }, { expiresAt: null }, { selectedPath: '/another-report/' },
  ]) {
    it(`does not opt in with invalid context ${JSON.stringify(invalid)}`, async () => {
      reportFixture();
      await mount(invalid);
      expect(document.getElementById('booth-return')).to.equal(null);
      expect(document.documentElement.classList.contains('booth-report-active')).to.equal(false);
      expect(document.querySelector('link[href="/styles/booth-report.css"]')).to.equal(null);
    });
  }

  for (const [width, height, portrait] of [
    [2160, 3840, true], [1080, 1920, true], [390, 844, false],
    [1440, 900, false], [2160, 1400, false], [2160, 2600, false], [1000, 1599, false],
  ]) {
    it(`uses the complete portrait bounds at ${width}x${height}`, async () => {
      await setViewport({ width, height });
      reportFixture();
      await mount();
      expect(document.documentElement.scrollWidth).to.equal(width);
      const baseline = width < 1000 ? 14 : 18;
      const readingSize = width === 2160 ? 40 : 24;
      expect(font('.rc-desc')).to.equal(portrait ? readingSize : baseline);
      if (portrait) {
        expect(rect('.rc-tab').height).to.be.at.least(width === 2160 ? 96 : 64);
        expect(rect('.rc-dot').width).to.be.at.least(width === 2160 ? 96 : 64);
        expect(font('.rsc-summary')).to.equal(width === 2160 ? 40 : 24);
        expect(font('.rav-hbar-val')).to.equal(width === 2160 ? 32 : 18);
        expect(font('.rav-panel-sub')).to.equal(readingSize);
        expect(font('.rav-st-brand')).to.equal(width === 2160 ? 32 : 18);
        expect(font('.rs-dark-badge')).to.equal(width === 2160 ? 32 : 18);
        const hero = rect('.report-hero.insight');
        document.querySelectorAll('.rh-insight-text > *, .rh-insight-badge').forEach((child) => {
          const bounds = child.getBoundingClientRect();
          expect(bounds.top).to.be.at.least(hero.top);
          expect(bounds.bottom).to.be.at.most(hero.bottom);
          expect(bounds.left).to.be.at.least(hero.left);
          expect(bounds.right).to.be.at.most(hero.right);
        });
        const platform = document.querySelector('.rav-platform-row');
        expect(getComputedStyle(platform).gridTemplateColumns.split(' ')).to.have.length(4);
        const track = platform.querySelector('.rav-hbar-track').getBoundingClientRect();
        const value = platform.querySelector('.rav-hbar-val').getBoundingClientRect();
        expect(track.width).to.be.greaterThan(100);
        expect(value.top).to.be.lessThan(track.bottom);
        expect(value.bottom).to.be.greaterThan(track.top);
        expect(rect('.rc-slide-visual').width).to.be.greaterThan(width * 0.7);
        const tick = document.querySelector('.rc-line-svg text[data-booth-date]');
        expect(tick.getAttribute('aria-label')).to.equal('2026-01');
        expect(tick.querySelectorAll('tspan')).to.have.length(2);
      }
      expect(rect('#booth-return').bottom).to.equal(height);
      expect(parseFloat(getComputedStyle(document.body).paddingBottom))
        .to.be.closeTo(rect('#booth-return').height, 0.01);
    });
  }

  it('leaves large ordinary portrait reports unchanged, even if the stylesheet is cached', async () => {
    await setViewport({ width: 2160, height: 3840 });
    reportFixture();
    await mount();
    document.documentElement.classList.remove('booth-report-active');
    expect(font('.rc-desc')).to.equal(18);
    expect(rect('main > .section').width).to.equal(1200);
  });

  it('mounts controls/styles once and keeps real tabs, navigation and details usable', async () => {
    await setViewport({ width: 2160, height: 3840 });
    reportFixture();
    await mount();
    await mountBoothReturn();
    expect(document.querySelectorAll('#booth-return')).to.have.length(1);
    expect(document.querySelectorAll('link[href="/styles/booth-report.css"]')).to.have.length(1);
    document.querySelector('.rc-nav-next').click();
    await new Promise((resolve) => { window.setTimeout(resolve, 400); });
    expect(document.querySelector('.rc-slide:not([hidden]) .rc-title').textContent).to.equal('Second insight');
    document.querySelectorAll('.rc-tab')[1].click();
    expect(document.querySelector('.rc-slide:not([hidden]) .rc-title').textContent).to.equal('Site experience');
    const details = document.querySelector('.rsc-howto');
    details.querySelector('summary').click();
    expect(details.open).to.equal(true);
  });

  it('reuses real chart hit testing for a touch value without sending requests', async () => {
    await setViewport({ width: 2160, height: 3840 });
    reportFixture();
    await mount();
    const handler = document.addEventListener.getCalls()
      .find((call) => call.args[0] === 'pointerup').args[1];
    handler({
      target: document.querySelector('.rc-line-hit'),
      pointerType: 'touch',
      clientX: 200,
      clientY: 400,
    });
    expect(document.querySelector('.rc-tooltip').textContent).to.equal('2026-01: 100');
    expect(window.fetch.callCount).to.equal(1);
  });

  it('upgrades an existing older Finish control without duplicating reset timers or padding', async () => {
    await setViewport({ width: 2160, height: 3840 });
    reportFixture();
    const existing = document.createElement('aside');
    existing.id = 'booth-return';
    existing.innerHTML = '<a href="/booth?step=finish">Finish</a><button>Clear</button>';
    const oldStyle = document.createElement('style');
    oldStyle.dataset.boothTest = 'true';
    oldStyle.textContent = '.booth-report-active body { padding-bottom: calc(var(--booth-original-padding) + var(--booth-return-height)); }';
    document.head.append(oldStyle);
    document.body.append(existing);
    document.documentElement.classList.add('booth-report-active');
    document.documentElement.style.setProperty('--booth-original-padding', '0px');
    document.documentElement.style.setProperty('--booth-return-height', '180px');
    const timerCount = timers.callCount;
    await mount();
    expect(document.querySelector('#booth-return')).to.equal(existing);
    expect(document.querySelectorAll('link[data-booth-report-layout]')).to.have.length(1);
    expect(font('.rc-desc')).to.equal(40);
    expect(document.documentElement.style.getPropertyValue('--booth-original-padding')).to.equal('0px');
    expect(timers.callCount).to.equal(timerCount);
    expect(parseFloat(getComputedStyle(document.body).paddingBottom))
      .to.be.closeTo(rect('#booth-return').height, 0.01);
    await mountBoothReturn();
    expect(window.fetch.callCount).to.equal(1);
  });

  it('does not upgrade an older control without fresh selected-report authorization', async () => {
    await setViewport({ width: 2160, height: 3840 });
    reportFixture();
    const existing = document.createElement('aside');
    existing.id = 'booth-return';
    document.body.append(existing);
    document.documentElement.classList.add('booth-report-active');
    await mount({ expiresAt: Date.now() - 1 });
    expect(document.querySelector('link[data-booth-report-layout]')).to.equal(null);
    expect(font('.rc-desc')).to.equal(18);
    expect(document.querySelector('[data-booth-date]')).to.equal(null);
  });

  it('restores original ISO ticks outside portrait and handles later-rendered charts', () => {
    const main = reportFixture();
    formatBoothChartDates(main, true);
    const tick = main.querySelector('.rc-line-svg text[data-booth-date]');
    expect(tick.textContent).to.equal('Jan2026');
    formatBoothChartDates(main, true);
    expect(tick.querySelectorAll('tspan')).to.have.length(2);
    formatBoothChartDates(main, false);
    expect(tick.textContent).to.equal('2026-01');
    expect(tick.hasAttribute('data-booth-date')).to.equal(false);
  });
});
