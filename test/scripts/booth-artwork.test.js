import { expect } from '@esm-bundle/chai';

describe('Figma booth artwork', () => {
  let frame;
  let hero;
  let stage;

  beforeEach(async () => {
    frame = document.createElement('iframe');
    frame.style.cssText = 'position: fixed; left: -10000px; width: 2160px; height: 2881px; border: 0';
    const loaded = new Promise((resolve) => { frame.onload = resolve; });
    const css = new URL('../../styles/booth.css', import.meta.url);
    frame.srcdoc = `<link rel="stylesheet" href="${css}">
      <body class="booth"><main class="stage" data-entry="3">
        <header class="stage-header"></header>
        <section class="welcome-intro">
          <div class="eyebrow">Digital Opportunity Report</div>
          <h1>First<br>Second<br>Third</h1>
          <div class="hero-bottom"><p>See where your brand appears in AI search.</p></div>
        </section>
      </main></body>`;
    document.body.append(frame);
    await loaded;
    stage = frame.contentDocument.querySelector('.stage');
    hero = stage.querySelector('.welcome-intro');
  });

  afterEach(() => { frame.remove(); });

  const close = (value, expected) => {
    expect(parseFloat(value)).to.be.closeTo(expected, 0.1);
  };

  it('places the website and its glow against native frame bounds, not hero-height percentages', () => {
    stage.dataset.entry = '3';
    const art = frame.contentWindow.getComputedStyle(hero, '::after');
    const glow = frame.contentWindow.getComputedStyle(hero, '::before');
    close(art.left, 909.23);
    close(art.top, 241);
    close(art.width, 1278.94);
    close(art.height, 925.5);
    expect(art.transformOrigin).to.equal('0px 0px');
    close(glow.left, 756.1);
    close(glow.top, 233.08);
    close(glow.width, 1485.33);
    close(glow.height, 1027.81);
  });

  it('aligns the fixed Entry 3 headline and subtitle to native Figma coordinates', () => {
    close(hero.querySelector('.eyebrow').getBoundingClientRect().x, 95);
    close(hero.querySelector('h1').getBoundingClientRect().y, 517);
    close(hero.querySelector('.hero-bottom p').getBoundingClientRect().y, 887);
  });

  it('does not change the hero artwork even when a legacy entry parameter is present', () => {
    stage.dataset.entry = '6';
    expect(frame.contentWindow.getComputedStyle(hero, '::after').backgroundImage).to.include('entry-webpage.png');
    expect(frame.contentWindow.getComputedStyle(hero).backgroundImage).to.equal('none');
  });

  it('keeps real entry and recovery actions large, separated and responsive without placeholder progress', async () => {
    const response = await fetch(new URL('../../booth.html', import.meta.url));
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    expect(source.body.textContent).not.to.match(/lorem/i);
    const groups = [
      '.entry-alternatives',
      '[data-panel="demos"] .recovery-actions',
      '[data-panel="unavailable"] .recovery-actions',
    ];
    const actions = groups.map((selector) => source.querySelector(selector).cloneNode(true));
    stage.replaceChildren(...actions);
    const { contentWindow } = frame;
    for (const [width, minHeight, minFont] of [[2160, 129, 51], [1080, 72, 25], [390, 64, 22]]) {
      frame.style.width = `${width}px`;
      // Let the iframe viewport and its responsive rules settle.
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      stage.querySelectorAll('.booth-alternative').forEach((button) => {
        const style = contentWindow.getComputedStyle(button);
        expect(button.getBoundingClientRect().height).to.be.at.least(minHeight);
        expect(parseFloat(style.fontSize)).to.be.at.least(minFont);
        expect(parseFloat(style.borderWidth)).to.be.at.least(2);
        expect(style.textDecorationLine).to.equal('none');
      });
      stage.querySelectorAll('.entry-alternatives, .recovery-actions').forEach((group) => {
        expect(parseFloat(contentWindow.getComputedStyle(group).gap)).to.be.at.least(16);
        const columns = contentWindow.getComputedStyle(group).gridTemplateColumns.split(' ');
        expect(columns).to.have.length(width >= 1000 ? 2 : 1);
      });
      expect(frame.contentDocument.documentElement.scrollWidth).to.be.at.most(width);
    }
  });

  it('scopes the native Finish 6 montage and report excerpt to the booth', () => {
    stage.insertAdjacentHTML('beforeend', `<section class="finish-content">
      <div class="finish-preview">
        <div class="preview-montage">
        <div class="preview-card" data-position="left"><div class="preview-surface"></div></div>
        <div class="preview-card" data-position="center"><div class="preview-surface">
        <div class="report-hero insight">
          <div class="rh-insight-text"><h3>Your report</h3></div>
          <div class="rh-insight-image"></div>
        </div>
        <div class="report-stats dark"><div class="rs-dark-strip">
          ${Array.from({ length: 4 }, () => '<div class="rs-dark-card">Metric</div>').join('')}
        </div></div>
        </div></div>
        <div class="preview-card" data-position="right"><div class="preview-surface"></div></div>
        </div>
      </div>
    </section>`);
    const preview = stage.querySelector('.finish-preview');
    const reportHero = preview.querySelector('.report-hero');
    const stats = preview.querySelector('.rs-dark-strip');
    const style = (element) => frame.contentWindow.getComputedStyle(element);
    expect(style(reportHero).display).to.equal('grid');
    expect(style(reportHero).gridTemplateColumns.split(' ')).to.have.length(2);
    expect(style(stats).gridTemplateColumns.split(' ')).to.have.length(4);
    close(preview.getBoundingClientRect().width, 1950);
    close(preview.getBoundingClientRect().height, 725);
    close(preview.querySelector('[data-position="center"]').getBoundingClientRect().width, 1411.094);
    const scale = 1411.094 / 1950;
    close(reportHero.getBoundingClientRect().height, 552.5 * scale);
    close(stats.getBoundingClientRect().height, 447.65 * scale);
    close(style(preview.querySelector('h3')).fontSize, 73.125 * scale);
  });

  it('keeps the complete privacy disclosure visible on one native line without clipping', async () => {
    const response = await fetch(new URL('../../booth.html', import.meta.url));
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    stage.replaceChildren(source.querySelector('.welcome-entry').cloneNode(true));
    const notice = stage.querySelector('#search-privacy');
    const style = frame.contentWindow.getComputedStyle(notice);
    expect(notice.textContent).to.include('Adobe records your email and report activity');
    expect(notice.textContent).to.include('90 days to measure booth interest');
    expect(notice.textContent).to.include('does not request sales contact');
    expect(notice.querySelector('a').href).to.equal('https://www.adobe.com/privacy/policy.html');
    expect(notice.getBoundingClientRect().height).to.be.at.most(parseFloat(style.lineHeight) + 1);
    expect(style.overflow).to.equal('visible');
    expect(parseFloat(style.fontSize)).to.be.at.least(19.9);
    expect(style.color).to.equal('rgb(91, 91, 91)');
  });
});
