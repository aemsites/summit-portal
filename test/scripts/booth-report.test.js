import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import sinon from 'sinon';
import mountBoothReturn, { createBoothPerformanceLayout, formatBoothChartDates, restrictBoothLinks } from '../../scripts/booth-report.js';
import decorateCarousel from '../../blocks/report-carousel/report-carousel.js';
import decorateScores from '../../blocks/report-scores/report-scores.js';
import decorateHero from '../../blocks/report-hero/report-hero.js';
import { parseVisibilityRows, renderPanel } from '../../blocks/report-ai-visibility/rav-core.js';

class TestObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    TestObserver.instances.push(this);
  }

  observe(target) { this.targets.push(target); }
}

describe('confirmed booth report portrait layout', () => {
  let sandbox;
  let timers;
  const styles = [];
  // Viewport commands also create runner-owned timeouts.
  const resetTimerCount = () => timers.getCalls().filter((call) => call.args[0].name === 'reset').length;

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
    sandbox.spy(document.body, 'addEventListener');
  });

  afterEach(() => {
    timers.getCalls().filter((call) => call.args[0]?.name === 'reset')
      .forEach((call) => window.clearTimeout(call.returnValue));
    document.body.addEventListener.getCalls().forEach(({ args }) => (
      document.body.removeEventListener(...args)
    ));
    document.querySelector('#booth-test-footer')?.remove();
    document.querySelector('#booth-return')?.remove();
    document.querySelector('#booth-recovery')?.remove();
    document.querySelector('style[data-booth-report-safety]')?.remove();
    document.querySelectorAll('script[data-booth-mode]').forEach((marker) => marker.remove());
    document.querySelector('link[href="/styles/booth-report.css"]')?.remove();
    document.querySelectorAll('style[data-booth-test]').forEach((style) => style.remove());
    document.querySelector('main')?.remove();
    document.querySelector('#booth-report-content')?.remove();
    document.documentElement.style.visibility = '';
    document.documentElement.classList.remove('booth-report-active', 'booth-report-composition', 'booth-report-clearing', 'booth-request-active', 'booth-report-pending');
    TestObserver.instances = [];
    sandbox.restore();
  });

  after(() => styles.forEach((link) => link.remove()));

  async function reportFixture() {
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
    await decorateScores(main.querySelector('.report-scores'));
    const visibility = main.querySelector('.report-ai-visibility');
    const panels = document.createElement('div');
    panels.className = 'rav-panels';
    panels.append(...parseVisibilityRows(visibility).map((row) => renderPanel(row)));
    const outer = document.createElement('div');
    outer.className = 'rav-panels-outer';
    outer.append(panels);
    visibility.replaceChildren(outer);
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    return main;
  }

  async function mount(context = {}) {
    const nativeMatchMedia = window.matchMedia.bind(window);
    sandbox.stub(window, 'matchMedia').callsFake((query) => ({
      get matches() { return nativeMatchMedia(query).matches; },
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

  function legacyRecoveryFixture() {
    document.body.insertAdjacentHTML('beforeend', '<aside id="booth-recovery">Your report is concealed while access is checked. <button type="button" data-booth-recover>Retry and clear screen</button> If this screen does not recover, <a href="/booth?recover=1">return to booth recovery</a> and ask staff to reset the visit.</aside>');
    return document.getElementById('booth-recovery');
  }

  function markReport(expiresAt = Date.now() + 600000) {
    const marker = document.createElement('script');
    marker.dataset.boothMode = 'report';
    marker.dataset.boothExpiresAt = String(expiresAt);
    document.head.append(marker);
    return marker;
  }

  const font = (selector) => parseFloat(
    getComputedStyle(document.querySelector(selector)).fontSize,
  );
  const rect = (selector) => document.querySelector(selector).getBoundingClientRect();

  it('mounts demo controls without a personal Finish or request action and records demo viewing', async () => {
    const previous = window.location.href;
    window.history.replaceState(null, '', '/example-report/luma/');
    try {
      await reportFixture();
      await mount({ state: 'demo', demoId: 'luma', company: 'Luma' });
      const control = document.getElementById('booth-return');
      expect(control.textContent).to.include('Not a report for your company');
      expect(control.textContent).not.to.include('Finish reading my report');
      expect(control.querySelector('a').getAttribute('href')).to.equal('/booth?step=demos');
      expect(control.querySelector('.booth-request-action')).to.equal(null);
      expect(window.fetch.calledTwice).to.equal(true);
      expect(window.fetch.secondCall.args[0]).to.equal('/auth/booth/view');
    } finally {
      window.history.replaceState(null, '', previous);
    }
  });

  it('contains report links and downloads while preserving same-page navigation and booth controls', async () => {
    const main = await reportFixture();
    await mount();
    main.insertAdjacentHTML('beforeend', `<a href="https://business.adobe.com/">Product</a>
      <a href="/report.pdf" target="_blank" download>Download</a>
      <a href="mailto:team@example.test">Contact</a>
      <a href="#analysis">Analysis</a>
      <div id="analysis"></div>`);
    const links = [...main.querySelectorAll('a')].slice(-4);
    const footer = document.createElement('footer');
    footer.id = 'booth-test-footer';
    footer.innerHTML = '<a href="https://example.com/footer">Footer link</a>';
    document.body.append(footer);
    const activation = sandbox.spy((event) => event.preventDefault());
    links.forEach((link) => link.addEventListener('click', activation));
    links.slice(0, 3).forEach((link) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented).to.equal(true);
    });
    expect(activation.called).to.equal(false);
    const footerClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    footer.querySelector('a').addEventListener('click', activation);
    footer.querySelector('a').dispatchEvent(footerClick);
    expect(footerClick.defaultPrevented).to.equal(true);
    expect(activation.called).to.equal(false);
    expect(document.querySelector('#booth-return p').hidden).to.equal(false);
    expect(document.querySelector('#booth-return p').textContent).to.include('shared screen');
    const fragment = new MouseEvent('click', { bubbles: true, cancelable: true });
    links[3].addEventListener('click', (event) => event.preventDefault());
    links[3].dispatchEvent(fragment);
    expect(activation.calledOnce).to.equal(true);
    [
      new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }),
      new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
      new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }),
      new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }),
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }),
    ].forEach((event) => {
      links[3].dispatchEvent(event);
      expect(event.defaultPrevented).to.equal(true);
    });
    expect(activation.calledOnce).to.equal(true);
    const control = document.querySelector('#booth-return a');
    const finish = new MouseEvent('click', { bubbles: true, cancelable: true });
    control.addEventListener('click', (event) => event.preventDefault(), { once: true });
    control.dispatchEvent(finish);
    expect(control.getAttribute('href')).to.equal('/booth?step=finish');
  });

  it('rejects the retired request profile even with server-confirmed request state', async () => {
    const previous = window.location.href;
    window.history.replaceState(null, '', '/request-report');
    try {
      await reportFixture();
      await mount({ state: 'request' });
      expect(document.documentElement.classList.contains('booth-request-active')).to.equal(false);
      expect(window.fetch.calledOnce).to.equal(true);
      expect(document.querySelector('#booth-return')).to.equal(null);
    } finally {
      window.history.replaceState(null, '', previous);
    }
  });

  it('scrubs visitor fields immediately and serializes repeated clear actions on failure', async () => {
    const previous = window.location.href;
    window.history.replaceState(null, '', '/report/');
    try {
      const main = await reportFixture();
      const form = document.createElement('form');
      form.innerHTML = '<input name="email"><input name="consent" type="checkbox">';
      main.append(form);
      await mount();
      form.querySelector('[name="email"]').value = 'visitor@example.test';
      form.querySelector('[name="consent"]').checked = true;
      let finishReset;
      window.fetch.onThirdCall().returns(new Promise((resolve) => { finishReset = resolve; }));
      const clear = document.querySelector('[data-booth-clear]');
      clear.click();
      clear.click();
      expect(form.querySelector('[name="email"]').value).to.equal('');
      expect(form.querySelector('[name="consent"]').checked).to.equal(false);
      await new Promise((resolve) => { window.setTimeout(resolve, 0); });
      expect(window.fetch.callCount).to.equal(3);
      expect(window.fetch.thirdCall.args[0]).to.equal('/auth/booth/reset');
      finishReset(new Response('', { status: 503 }));
      await new Promise((resolve) => { window.setTimeout(resolve, 0); });
      expect(document.querySelector('#booth-return p').textContent).to.include('Could not clear');
      expect(document.querySelector('#booth-return a').hidden).to.equal(true);
      expect(document.documentElement.classList.contains('booth-report-clearing')).to.equal(true);
      expect(document.documentElement.style.visibility).to.equal('');
    } finally {
      window.history.replaceState(null, '', previous);
    }
  });

  it('clears reports with legacy Worker recovery markup and keeps failed resets retryable', async () => {
    const main = await reportFixture();
    const recovery = legacyRecoveryFixture();
    markReport();
    await mount();
    window.fetch.onCall(2).resolves(new Response('', { status: 503 }));
    window.fetch.onCall(3).resolves(new Response('', { status: 503 }));
    const clear = document.querySelector('[data-booth-clear]');
    clear.click();
    clear.click();
    await new Promise((resolve) => { window.setTimeout(resolve, 0); });
    expect(window.fetch.callCount).to.equal(3);
    expect(window.fetch.thirdCall.args[0]).to.equal('/auth/booth/reset');
    expect(recovery.querySelector('p').textContent).to.include('Could not clear');
    expect(recovery.querySelector('[data-booth-recover]').disabled).to.equal(false);
    expect(recovery.querySelector('a').getAttribute('href')).to.equal('/booth?recover=1');
    expect(getComputedStyle(main).display).to.equal('none');
    const manualRecovery = sandbox.spy((event) => event.preventDefault());
    const fallback = recovery.querySelector('a');
    fallback.addEventListener('click', manualRecovery);
    fallback.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(manualRecovery.calledOnce).to.equal(true);
    recovery.querySelector('[data-booth-recover]').click();
    await new Promise((resolve) => { window.setTimeout(resolve, 0); });
    expect(window.fetch.callCount).to.equal(4);
    expect(window.fetch.getCall(3).args[0]).to.equal('/auth/booth/reset');
    expect(recovery.querySelector('[data-booth-recover]').disabled).to.equal(false);
  });

  for (const invalid of [
    { state: 'entry' }, { state: 'picker' }, { expiresAt: 1 },
    { expiresAt: '9999999999999' }, { expiresAt: null }, { selectedPath: '/another-report/' },
  ]) {
    it(`does not opt in with invalid context ${JSON.stringify(invalid)}`, async () => {
      await reportFixture();
      await mount(invalid);
      expect(document.getElementById('booth-return')).to.equal(null);
      expect(document.documentElement.classList.contains('booth-report-active')).to.equal(false);
      expect(document.querySelector('link[href="/styles/booth-report.css"]')).to.equal(null);
      expect(document.querySelector('.booth-score-analysis')).to.equal(null);
      expect(document.documentElement.classList.contains('booth-report-composition')).to.equal(false);
    });
  }

  it('carries cosmetic settings to Finish only after exact server-context validation', async () => {
    const previousUrl = window.location.href;
    const url = new URL(previousUrl);
    url.search = '?heading=Amplify+your+brand+visibility&brand=semrush&portrait=true';
    window.history.replaceState(null, '', url);
    try {
      await setViewport({ width: 1080, height: 1920 });
      await reportFixture();
      await mount();
      expect(document.querySelector('#booth-return a').getAttribute('href')).to.equal('/booth?step=finish&heading=Amplify+your+brand+visibility&brand=semrush');
      expect(document.documentElement.classList.contains('booth-report-composition')).to.equal(true);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('does not grant report controls or a portrait profile through cosmetic/query parameters', async () => {
    const previousUrl = window.location.href;
    const url = new URL(previousUrl);
    url.search = '?heading=Amplify&brand=semrush&state=report&selectedPath=/report/&expiresAt=9999999999999&portrait=true';
    window.history.replaceState(null, '', url);
    try {
      await setViewport({ width: 2160, height: 3840 });
      await reportFixture();
      await mount({ state: 'entry' });
      expect(document.getElementById('booth-return')).to.equal(null);
      expect(document.documentElement.classList.contains('booth-report-composition')).to.equal(false);
      expect(document.querySelector('.booth-score-analysis')).to.equal(null);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  for (const [width, height, portrait] of [
    [2160, 3840, true], [1080, 1920, true], [390, 844, false],
    [1440, 900, false], [2160, 1400, false], [2160, 2600, false], [1000, 1599, false],
  ]) {
    it(`uses the complete portrait bounds at ${width}x${height}`, async () => {
      await setViewport({ width, height });
      await reportFixture();
      await mount();
      expect(document.documentElement.scrollWidth).to.equal(width);
      const baseline = width < 1000 ? 14 : 18;
      const readingSize = width === 2160 ? 36 : 24;
      expect(font('.rc-desc')).to.equal(portrait ? readingSize : baseline);
      if (portrait) {
        expect(rect('.rc-tab').height).to.be.at.least(width === 2160 ? 96 : 64);
        expect(rect('.rc-dot').width).to.be.at.least(width === 2160 ? 96 : 64);
        expect(font('.rsc-summary')).to.equal(width === 2160 ? 36 : 24);
        expect(font('.rav-hbar-val')).to.equal(width === 2160 ? 32 : 22);
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
      const navigation = getComputedStyle(document.querySelector('#booth-return a'));
      const clearing = getComputedStyle(document.querySelector('#booth-return [data-booth-clear]'));
      expect(navigation.backgroundColor).to.equal('rgb(59, 99, 251)');
      expect(parseFloat(navigation.borderRadius)).to.be.at.least(24);
      expect(clearing.textDecorationLine).not.to.contain('underline');
      expect(parseFloat(clearing.borderWidth)).to.equal(1);
      expect(rect('#booth-return [data-booth-clear]').height).to.be.at.least(64);
      expect(rect('#booth-return [data-booth-clear]').height).to.be.at.most(72);
      expect(parseFloat(getComputedStyle(document.body).paddingBottom))
        .to.be.closeTo(rect('#booth-return').height, 0.01);
    });
  }

  it('uses the ordinary exact-resolution profile without cached booth styling', async () => {
    await setViewport({ width: 2160, height: 3840 });
    await reportFixture();
    await mount();
    document.documentElement.classList.remove('booth-report-active');
    expect(font('.rc-desc')).to.equal(18);
    expect(rect('main > .section').width).to.equal(1920);
    await setViewport({ width: 2160, height: 3841 });
    expect(rect('main > .section').width).to.equal(1200);
  });

  it('mounts controls/styles once and keeps real tabs, navigation and details usable', async () => {
    await setViewport({ width: 2160, height: 3840 });
    await reportFixture();
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

  it('reuses chart hit testing without requests beyond initial status and view', async () => {
    await setViewport({ width: 2160, height: 3840 });
    await reportFixture();
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
    expect(window.fetch.callCount).to.equal(2);
    expect(window.fetch.secondCall.args[0]).to.equal('/auth/booth/view');
  });

  it('keeps the restyled menu above a reported keyboard inset', async () => {
    await setViewport({ width: 2160, height: 3840 });
    await reportFixture();
    await mount();
    const html = document.documentElement;
    html.classList.add('booth-keyboard-active');
    html.style.setProperty('--booth-keyboard-inset', '600px');
    try {
      expect(rect('#booth-return').bottom).to.equal(3240);
      expect(parseFloat(getComputedStyle(document.body).paddingBottom))
        .to.be.closeTo(rect('#booth-return').height + 600, 0.01);
    } finally {
      html.classList.remove('booth-keyboard-active');
      html.style.removeProperty('--booth-keyboard-inset');
    }
  });

  it('upgrades an existing older Finish control without duplicating reset timers or padding', async () => {
    await setViewport({ width: 2160, height: 3840 });
    await reportFixture();
    const existing = document.createElement('aside');
    existing.id = 'booth-return';
    existing.innerHTML = '<a href="/booth?step=finish">Finish</a><button>Clear</button>';
    const oldStyle = document.createElement('style');
    oldStyle.dataset.boothTest = 'true';
    oldStyle.textContent = `
      .booth-report-active body { padding-bottom: calc(var(--booth-original-padding) + var(--booth-return-height)); }
      #booth-return { background: #1d1d1d; color: #fff; }
      #booth-return a { border-radius: 12px; background: #eb1000; }
      #booth-return button { border: 0; text-decoration: underline; }
    `;
    document.head.append(oldStyle);
    document.body.append(existing);
    document.documentElement.classList.add('booth-report-active');
    document.documentElement.style.setProperty('--booth-original-padding', '0px');
    document.documentElement.style.setProperty('--booth-return-height', '180px');
    const timerCount = resetTimerCount();
    await mount();
    expect(document.querySelector('#booth-return')).to.equal(existing);
    expect(document.querySelectorAll('link[data-booth-report-layout]')).to.have.length(1);
    expect(font('.rc-desc')).to.equal(36);
    expect(getComputedStyle(existing).backgroundColor).to.equal('rgb(255, 255, 255)');
    expect(getComputedStyle(existing.querySelector('button')).textDecorationLine)
      .not.to.contain('underline');
    expect(document.documentElement.style.getPropertyValue('--booth-original-padding')).to.equal('0px');
    expect(resetTimerCount()).to.equal(timerCount);
    expect(parseFloat(getComputedStyle(document.body).paddingBottom))
      .to.be.closeTo(rect('#booth-return').height, 0.01);
    await mountBoothReturn();
    expect(window.fetch.callCount).to.equal(2);
    expect(window.fetch.secondCall.args[0]).to.equal('/auth/booth/view');
  });

  it('does not upgrade an older control without fresh selected-report authorization', async () => {
    await setViewport({ width: 2160, height: 3840 });
    await reportFixture();
    const existing = document.createElement('aside');
    existing.id = 'booth-return';
    document.body.append(existing);
    document.documentElement.classList.add('booth-report-active');
    await mount({ expiresAt: Date.now() - 1 });
    expect(document.querySelector('link[data-booth-report-layout]')).to.equal(null);
    expect(font('.rc-desc')).to.equal(18);
    expect(document.querySelector('[data-booth-date]')).to.equal(null);
  });

  it('restores original ISO ticks outside portrait and handles later-rendered charts', async () => {
    const main = await reportFixture();
    formatBoothChartDates(main, true);
    const tick = main.querySelector('.rc-line-svg text[data-booth-date]');
    expect(tick.textContent).to.equal('Jan2026');
    formatBoothChartDates(main, true);
    expect(tick.querySelectorAll('tspan')).to.have.length(2);
    formatBoothChartDates(main, false);
    expect(tick.textContent).to.equal('2026-01');
    expect(tick.hasAttribute('data-booth-date')).to.equal(false);
  });

  for (const [width, height, exact] of [
    [2160, 3840, true], [1080, 1920, true],
    [1008, 1792, true], [999, 1776, false], [900, 1600, false],
    [1280, 1920, false], [1440, 1920, false], [1920, 1080, false],
    [320, 700, false], [375, 812, false], [414, 896, false], [768, 1024, false],
    [2160, 3841, false], [2160, 3600, false],
  ]) {
    it(`restricts reversible composition to exact eligible 9:16 at ${width}x${height}`, async () => {
      await setViewport({ width, height });
      const main = await reportFixture();
      restrictBoothLinks(main);
      const before = main.innerHTML;
      await mount();
      expect(document.documentElement.classList.contains('booth-report-composition')).to.equal(exact);
      expect(main.querySelectorAll('.booth-score-analysis')).to.have.length(exact ? 1 : 0);
      if (exact) {
        const grid = main.querySelector('.rsc-grid');
        expect(getComputedStyle(grid).gridTemplateColumns.split(' ')).to.have.length(2);
        expect(rect('.booth-score-analysis > summary').height).to.be.at.least(width >= 2160 ? 96 : 64);
        expect(font('.rsc-page-name')).to.equal(width >= 2160 ? 48 : 36);
        expect(font('.rsc-metric-value')).to.equal(width >= 2160 ? 36 : 24);
        const target = main.querySelector('.rsc-metric-target');
        expect(getComputedStyle(target).gridColumnStart).to.equal(width < 1600 ? '2' : 'auto');
        const panels = main.querySelector('.rav-panels');
        expect(getComputedStyle(panels).gridTemplateColumns.split(' ')).to.have.length(2);
      } else {
        // ISO ticks still use the separate, original broad portrait profile.
        formatBoothChartDates(main, false);
        expect(main.innerHTML).to.equal(before);
      }
    });
  }

  it('keeps the complete long URL visible outside closed native analysis', async () => {
    await setViewport({ width: 1080, height: 1920 });
    await reportFixture();
    const url = document.querySelector('.rsc-page-url');
    const text = `example.com/${'long-page-path/'.repeat(20)}`;
    url.textContent = text;
    url.href = `https://${text}`;
    await mount();
    const details = url.closest('.rsc-card').querySelector('details');
    expect(url.closest('details')).to.equal(null);
    expect(details.open).to.equal(false);
    expect(url.getBoundingClientRect().height).to.be.greaterThan(0);
    expect(getComputedStyle(url).whiteSpace).to.equal('normal');
    expect(url.scrollWidth).to.be.at.most(url.clientWidth + 1);
    expect(url.textContent).to.equal(text);
    expect(url.href).to.equal(`https://${text}`);
    expect(details.querySelector('.rsc-verify-link')).not.to.equal(null);
  });

  it('restores identical nodes, order, markup and listeners on profile exit', async () => {
    const main = await reportFixture();
    const layout = createBoothPerformanceLayout(main);
    const card = main.querySelector('.rsc-card');
    const before = card.innerHTML;
    const nodes = [...card.querySelectorAll('.rsc-summary, .rsc-suggestion, .rsc-verify-link')];
    const click = sandbox.spy();
    nodes[0].addEventListener('click', click);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      layout(true);
      layout(true);
      expect(card.querySelectorAll('.booth-score-analysis')).to.have.length(1);
      const details = card.querySelector('.booth-score-analysis');
      expect([...details.querySelector('.booth-score-analysis-content').children]).to.deep.equal(nodes);
      expect(card.querySelectorAll('.rsc-metric')).to.have.length(3);
      details.querySelector('summary').click();
      expect(details.open).to.equal(true);
      layout(false);
      expect(card.innerHTML).to.equal(before);
      expect([...card.querySelectorAll('.rsc-summary, .rsc-suggestion, .rsc-verify-link')])
        .to.deep.equal(nodes);
    }
    nodes[0].dispatchEvent(new Event('click'));
    expect(click.callCount).to.equal(1);
  });

  it('enhances later cards, releases removed cards and restores focus when leaving a disclosure', async () => {
    const main = await reportFixture();
    const layout = createBoothPerformanceLayout(main);
    const card = main.querySelector('.rsc-card');
    const before = card.innerHTML;
    layout(true);
    card.querySelector('.booth-score-analysis > summary').focus();
    layout(false);
    expect(document.activeElement).to.equal(card.querySelector('.rsc-page-name a'));
    const later = card.cloneNode(true);
    card.parentElement.append(later);
    layout(true);
    expect(main.querySelectorAll('.booth-score-analysis')).to.have.length(2);
    card.remove();
    layout(true);
    expect(card.innerHTML).to.equal(before);
    layout(false);
    expect(later.innerHTML).to.equal(before);
  });

  ['.rsc-page-url', '.rsc-verify-link'].forEach((selector) => {
    it(`preserves focused ${selector} through exact-profile activation, exit and reentry`, async () => {
      await setViewport({ width: 2160, height: 3841 });
      const main = await reportFixture();
      const first = main.querySelector('.rsc-card');
      const card = first.cloneNode(true);
      first.parentElement.append(card);
      await mount();
      const before = card.innerHTML;
      const nodes = [...card.querySelectorAll('.rsc-summary, .rsc-suggestion, .rsc-verify-link')];
      const focused = card.querySelector(selector);
      const click = sandbox.spy((event) => event.preventDefault());
      focused.addEventListener('click', click);
      focused.focus();
      expect(document.activeElement).to.equal(focused);
      const count = resetTimerCount();
      expect(count).to.equal(2);
      for (let cycle = 0; cycle < 2; cycle += 1) {
        await setViewport({ width: 2160, height: 3840 });
        TestObserver.instances.forEach((observer) => observer.callback());
        expect(document.activeElement).to.equal(focused);
        const details = card.querySelector('.booth-score-analysis');
        expect(details.open).to.equal(selector === '.rsc-verify-link');
        expect(first.querySelector('.booth-score-analysis').open).to.equal(false);
        expect([...details.querySelector('.booth-score-analysis-content').children]).to.deep.equal(nodes);
        expect(resetTimerCount()).to.equal(count);
        await setViewport({ width: 2160, height: 3841 });
        TestObserver.instances.forEach((observer) => observer.callback());
        expect(document.activeElement).to.equal(focused);
        expect(card.innerHTML).to.equal(before);
        expect([...card.querySelectorAll('.rsc-summary, .rsc-suggestion, .rsc-verify-link')])
          .to.deep.equal(nodes);
        expect(resetTimerCount()).to.equal(count);
      }
      const event = new Event('click', { cancelable: true });
      focused.dispatchEvent(event);
      expect(event.defaultPrevented).to.equal(true);
      expect(click.callCount).to.equal(0);
      document.documentElement.classList.remove('booth-report-active');
      focused.dispatchEvent(new Event('click', { cancelable: true }));
      expect(click.callCount).to.equal(1);
    });
  });

  it('reconciles resize and clearing without adding reset timers', async () => {
    await setViewport({ width: 2160, height: 3840 });
    await reportFixture();
    await mount();
    const count = timers.callCount;
    document.documentElement.classList.add('booth-report-clearing');
    TestObserver.instances.forEach((observer) => observer.callback());
    expect(document.querySelector('.booth-score-analysis')).to.equal(null);
    expect(document.documentElement.classList.contains('booth-report-composition')).to.equal(false);
    expect(timers.callCount).to.equal(count);
  });

  ['missing', 'unavailable'].forEach((failure) => {
    it(`does not opt in when status is ${failure}`, async () => {
      await setViewport({ width: 2160, height: 3840 });
      const main = await reportFixture();
      const before = main.innerHTML;
      const fetch = sandbox.stub(window, 'fetch');
      if (failure === 'missing') fetch.resolves(new Response(null, { status: 404 }));
      else fetch.rejects(new Error('Status network failure'));
      let error;
      try {
        await mountBoothReturn();
      } catch (caught) {
        error = caught;
      }
      if (failure === 'unavailable') expect(error.message).to.equal('Status network failure');
      expect(document.querySelector('link[data-booth-report-layout]')).to.equal(null);
      expect(document.documentElement.classList.contains('booth-report-composition')).to.equal(false);
      expect(main.innerHTML).to.equal(before);
    });
  });

  it('restores direct-body report nodes after verifying the server concealment wrapper', async () => {
    const main = await reportFixture();
    const content = document.createElement('div');
    content.id = 'booth-report-content';
    content.hidden = true;
    document.body.append(content);
    content.append(main);
    markReport();
    const action = main.querySelector('.rsc-page-name a');
    const click = sandbox.spy((event) => event.preventDefault());
    action.addEventListener('click', click);
    await mount();
    expect(document.querySelector('body > main')).to.equal(main);
    expect(document.querySelector('#booth-report-content')).to.equal(null);
    expect(document.querySelector('body > #booth-return')).not.to.equal(null);
    expect(getComputedStyle(main).display).not.to.equal('none');
    document.documentElement.classList.remove('booth-report-active');
    action.dispatchEvent(new Event('click', { cancelable: true }));
    expect(click.calledOnce).to.equal(true);
  });

  it('conceals and scrubs historical request documents instead of reactivating the retired form', async () => {
    const previous = window.location.href;
    window.history.replaceState(null, '', '/request-report');
    try {
      const main = await reportFixture();
      main.insertAdjacentHTML('beforeend', '<form><input type="email" value="visitor@example.test"></form>');
      markReport().dataset.boothMode = 'request';
      const input = main.querySelector('input');
      input.focus();
      await mount({ state: 'request' });
      const html = document.documentElement;
      expect(input.value).to.equal('');
      expect(document.activeElement).not.to.equal(input);
      expect(html.classList.contains('booth-report-active')).to.equal(false);
      expect(document.querySelector('#booth-return')).to.equal(null);
      expect(main.getClientRects()).to.have.length(0);
      expect(document.querySelector('#booth-recovery').hidden).to.equal(false);
      expect(document.querySelector('#booth-recovery p').textContent).to.include('no longer active');
    } finally {
      window.history.replaceState(null, '', previous);
    }
  });

  it('keeps the server concealment wrapper intact when verification fails', async () => {
    const main = await reportFixture();
    const content = document.createElement('div');
    content.id = 'booth-report-content';
    content.hidden = true;
    document.body.append(content);
    content.append(main);
    markReport();
    await mount({ state: 'entry' });
    expect(document.getElementById('booth-report-content')).to.equal(content);
    expect(content.hidden).to.equal(true);
    expect(main.getClientRects()).to.have.length(0);
    expect(document.getElementById('booth-recovery').hidden).to.equal(false);
  });

  it('shows loading, not recovery instructions, until access verification fails', async () => {
    const main = await reportFixture();
    markReport();
    let finish;
    sandbox.stub(window, 'fetch').returns(new Promise((resolve) => { finish = resolve; }));
    const mounted = mountBoothReturn();
    const recovery = document.getElementById('booth-recovery');
    try {
      expect(recovery.querySelector('.booth-loading-ring')).not.to.equal(null);
      expect(recovery.querySelector('[role="status"]').textContent).to.include('Opening your report');
      expect(recovery.querySelector('.booth-recovery-actions').hidden).to.equal(true);
      expect(getComputedStyle(main).display).to.equal('none');
    } finally {
      finish(new Response('', { status: 503 }));
      await mounted;
    }
    expect(recovery.querySelector('.booth-recovery-actions').hidden).to.equal(false);
    expect(recovery.querySelector('.booth-loading-ring').hidden).to.equal(true);
    expect(recovery.querySelector('[role="alert"]').textContent).to.include('could not be verified');
    expect(getComputedStyle(main).display).to.equal('none');
  });

  ['timeout', 'expiry'].forEach((failure) => {
    it(`keeps a late stylesheet from revealing report content after ${failure}`, async () => {
      const main = await reportFixture();
      const clock = sandbox.useFakeTimers();
      const expiresAt = Date.now() + (failure === 'expiry' ? 5000 : 600000);
      markReport(expiresAt);
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: async () => ({ state: 'report', selectedPath: window.location.pathname, expiresAt }),
      });
      fetchStub.onSecondCall().resolves(new Response('', { status: 503 }));
      let stylesheet;
      const append = document.head.append.bind(document.head);
      sandbox.stub(document.head, 'append').callsFake((element) => {
        if (element.dataset.boothReportLayout) stylesheet = element;
        else append(element);
      });
      const mounted = mountBoothReturn();
      await clock.tickAsync(0);
      expect(stylesheet).not.to.equal(undefined);
      expect(getComputedStyle(main).display).to.equal('none');
      await clock.tickAsync(failure === 'expiry' ? 5001 : 10001);
      if (failure === 'expiry') stylesheet.dispatchEvent(new Event('load'));
      await mounted;
      expect(getComputedStyle(main).display).to.equal('none');
      expect(document.documentElement.classList.contains('booth-report-active')).to.equal(false);
      expect(document.getElementById('booth-return')).to.equal(null);
      expect(document.querySelector('#booth-recovery p').textContent).to.include(
        failure === 'expiry' ? 'Could not clear' : 'layout timed out',
      );
      stylesheet.dispatchEvent(new Event('load'));
      expect(getComputedStyle(main).display).to.equal('none');
    });
  });

  ['http', 'network', 'invalid-json', 'entry', 'expired', 'wrong-path'].forEach((failure) => {
    it(`conceals a server-marked report and requires confirmed clearing after ${failure}`, async () => {
      const main = await reportFixture();
      legacyRecoveryFixture();
      markReport();
      sandbox.stub(document, 'addEventListener');
      sandbox.stub(window, 'addEventListener');
      const fetchStub = sandbox.stub(window, 'fetch');
      const context = {
        state: failure === 'entry' ? 'entry' : 'report',
        selectedPath: failure === 'wrong-path' ? '/another-report/' : window.location.pathname,
        expiresAt: failure === 'expired' ? 1 : Date.now() + 600000,
      };
      if (failure === 'network') fetchStub.onFirstCall().rejects(new TypeError('Load failed'));
      else if (failure === 'invalid-json') fetchStub.onFirstCall().resolves(new Response('not JSON'));
      else fetchStub.onFirstCall().resolves(Response.json(context, { status: failure === 'http' ? 503 : 200 }));
      fetchStub.onSecondCall().resolves(new Response('', { status: 503 }));
      const mounted = mountBoothReturn();
      expect(getComputedStyle(main).display).to.equal('none');
      await mounted;
      expect(getComputedStyle(main).display).to.equal('none');
      expect(document.getElementById('booth-recovery').hidden).to.equal(false);
      expect(document.querySelector('link[data-booth-report-layout]')).to.equal(null);
      document.querySelector('[data-booth-recover]').click();
      await new Promise((resolve) => { window.setTimeout(resolve, 0); });
      expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/reset');
      expect(getComputedStyle(main).display).to.equal('none');
      expect(document.querySelector('#booth-recovery p').textContent).to.include('Could not clear');
    });
  });

  it('never reveals a late verified response after the absolute cleanup deadline', async () => {
    const main = await reportFixture();
    sandbox.stub(document, 'addEventListener');
    sandbox.stub(window, 'addEventListener');
    const clock = sandbox.useFakeTimers();
    const expiresAt = Date.now() + 5000;
    markReport(expiresAt);
    let completeStatus;
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().returns(new Promise((resolve) => { completeStatus = resolve; }));
    fetchStub.onSecondCall().resolves(new Response('', { status: 503 }));
    const mounted = mountBoothReturn();
    await clock.tickAsync(5001);
    expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/reset');
    completeStatus(Response.json({ state: 'report', selectedPath: window.location.pathname, expiresAt: Date.now() + 600000 }));
    await mounted;
    expect(getComputedStyle(main).display).to.equal('none');
    expect(document.querySelector('link[data-booth-report-layout]')).to.equal(null);
    expect(document.querySelector('#booth-recovery p').textContent).to.include('Could not clear');
  });

  it('renews touch and scroll activity beyond the injected deadline, then conceals after fifteen idle minutes', async () => {
    const main = await reportFixture();
    const clock = sandbox.useFakeTimers({ now: Date.now() });
    const expiresAt = Date.now() + 900000;
    markReport(expiresAt);
    await mount({ expiresAt });
    window.fetch.callsFake(async (url, options) => (
      url.endsWith('/activity')
        ? Response.json({ expiresAt: Date.now() + 900000 - JSON.parse(options.body).idleMs })
        : Response.json({ error: 'Synthetic reset failure' }, { status: 503 })
    ));
    const scroll = document.addEventListener.getCalls().find(({ args }) => args[0] === 'scroll');
    const touch = document.addEventListener.getCalls().find(({ args }) => args[0] === 'pointerdown');
    await clock.tickAsync(840000);
    touch.args[1]();
    await clock.tickAsync(0);
    expect(window.fetch.lastCall.args[0]).to.equal('/auth/booth/activity');
    await clock.tickAsync(120000);
    expect(getComputedStyle(main).display).not.to.equal('none');
    scroll.args[1]();
    await clock.tickAsync(1);
    expect(window.fetch.lastCall.args[0]).to.equal('/auth/booth/activity');
    expect(document.documentElement.classList.contains('booth-report-clearing')).to.equal(false);
    await clock.tickAsync(899998);
    expect(getComputedStyle(main).display).not.to.equal('none');
    await clock.tickAsync(1);
    expect(window.fetch.lastCall.args[0]).to.equal('/auth/booth/reset');
    expect(getComputedStyle(main).display).to.equal('none');
    expect(document.querySelector('#booth-recovery p').textContent).to.include('Could not clear');
  });

  it('conceals a report immediately if activity renewal loses staff authentication', async () => {
    const main = await reportFixture();
    const clock = sandbox.useFakeTimers({ now: Date.now() });
    markReport(Date.now() + 900000);
    await mount({ expiresAt: Date.now() + 900000 });
    window.fetch.callsFake(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Staff authentication required' }),
    }));
    const input = document.addEventListener.getCalls().find(({ args }) => args[0] === 'input');
    input.args[1]();
    await clock.tickAsync(10);
    expect(window.fetch.lastCall.args[0]).to.equal('/auth/booth/activity');
    expect(document.querySelector('#booth-recovery p').textContent).to.equal('Staff authentication required');
    expect(getComputedStyle(main).display).to.equal('none');
  });

  it('rejects status verification after a ten-second deadline without exposing the report', async () => {
    const main = await reportFixture();
    sandbox.stub(document, 'addEventListener');
    sandbox.stub(window, 'addEventListener');
    const clock = sandbox.useFakeTimers();
    markReport();
    const timeout = sandbox.stub(AbortSignal, 'timeout').callsFake((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Verification timed out', 'TimeoutError')), milliseconds);
      return controller.signal;
    });
    sandbox.stub(window, 'fetch').callsFake((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    }));
    const mounted = mountBoothReturn();
    await clock.tickAsync(9999);
    expect(getComputedStyle(main).display).to.equal('none');
    expect(document.documentElement.classList.contains('booth-report-clearing')).to.equal(false);
    await clock.tickAsync(1);
    await mounted;
    expect(timeout.firstCall.args[0]).to.equal(10000);
    expect(document.documentElement.classList.contains('booth-report-clearing')).to.equal(true);
    expect(document.querySelector('#booth-recovery p').textContent).to.include('timed out');
    expect(getComputedStyle(main).display).to.equal('none');
  });

  it('reveals a marked report only after verification and offers authorized report switching', async () => {
    const main = await reportFixture();
    markReport();
    await mount({ canChooseAnother: true });
    expect(document.documentElement.classList.contains('booth-report-pending')).to.equal(false);
    expect(getComputedStyle(main).display).not.to.equal('none');
    expect(document.getElementById('booth-recovery').hidden).to.equal(true);
    const picker = document.querySelector('[data-booth-picker]');
    expect(picker.hidden).to.equal(false);
    window.fetch.onCall(2).resolves(new Response('', { status: 503 }));
    picker.click();
    picker.click();
    await new Promise((resolve) => { window.setTimeout(resolve, 0); });
    expect(window.fetch.callCount).to.equal(3);
    expect(window.fetch.thirdCall.args[0]).to.equal('/auth/booth/picker');
    expect(window.fetch.thirdCall.args[1].body).to.equal('{}');
    expect(getComputedStyle(main).display).to.equal('none');
    expect(document.querySelector('#booth-recovery p').textContent).to.include('could not be checked');
  });

  it('removes PDF/download and new-tab actions, including later-decorated links', async () => {
    const main = await reportFixture();
    main.insertAdjacentHTML('beforeend', '<a href="/report.PDF?version=1" target="_blank">Download PDF</a><a href="/export" download>Export</a><a class="rd-cta-btn" href="/content/opaque-export" target="_blank">PDF</a><a class="rd-pdf-tag" href="/media_opaque-export">Full PDF</a>');
    await mount();
    const pdf = main.querySelector('[data-booth-download-disabled]');
    expect(pdf.hasAttribute('href')).to.equal(false);
    expect(getComputedStyle(pdf).display).to.equal('none');
    expect(main.querySelector('[download], [target]')).to.equal(null);
    expect(main.querySelectorAll('[data-booth-download-disabled]')).to.have.length(4);
    expect(document.querySelector('.booth-download-note').textContent).to.include('emailed report');
    expect(TestObserver.instances.some((observer) => observer.targets.includes(document.body)))
      .to.equal(true);
    const later = document.createElement('a');
    later.href = '/later.pdf';
    later.target = '_blank';
    main.append(later);
    TestObserver.instances.forEach((observer) => observer.callback());
    expect(later.hasAttribute('href')).to.equal(false);
    expect(later.hasAttribute('target')).to.equal(false);
    expect(getComputedStyle(later).display).to.equal('none');
  });

  it('preserves downloads and new-tab links without booth authorization', async () => {
    const main = await reportFixture();
    main.insertAdjacentHTML('beforeend', '<a href="/report.pdf" target="_blank" download>Download PDF</a>');
    await mount({ state: 'entry' });
    const pdf = main.querySelector('[download]');
    expect(pdf.getAttribute('href')).to.equal('/report.pdf');
    expect(pdf.target).to.equal('_blank');
    expect(pdf.hidden).to.equal(false);
  });
});
