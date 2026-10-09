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
    close(art.left, 1020);
    close(art.top, 94.5);
    close(art.width, 1140);
    close(art.height, 881);
    close(glow.left, 1020);
    close(glow.top, 94.5);
    close(glow.width, 1140);
    close(glow.height, 881);
    expect(art.backgroundSize).to.equal('1278.96px 925.635px');
    expect(glow.backgroundSize).to.equal('1510.62px 1023.62px');
  });

  it('aligns the fixed Entry 3 headline and subtitle to native Figma coordinates', () => {
    close(hero.querySelector('h1').getBoundingClientRect().y, 555.5);
    close(hero.querySelector('.hero-bottom p').getBoundingClientRect().y, 880.5);
  });

  it('does not change the hero artwork even when a legacy entry parameter is present', () => {
    stage.dataset.entry = '6';
    expect(frame.contentWindow.getComputedStyle(hero, '::after').backgroundImage).to.include('entry-final-webpage.png');
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
    for (const [width, minHeight, minFont] of [[2160, 120, 44.9], [1080, 72, 24], [390, 64, 22]]) {
      frame.style.width = `${width}px`;
      frame.contentDocument.documentElement.getBoundingClientRect();
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
        if (group.classList.contains('recovery-actions')) expect(columns).to.have.length(width >= 1000 ? 2 : 1);
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
    close(preview.getBoundingClientRect().width, 1960);
    close(preview.getBoundingClientRect().height, 752);
    close(preview.querySelector('[data-position="center"]').getBoundingClientRect().width, 1410);
    close(preview.querySelector('[data-position="left"]').getBoundingClientRect().width, 910);
    close(preview.querySelector('[data-position="left"]').getBoundingClientRect().height, 696);
    close(preview.querySelector('[data-position="right"]').getBoundingClientRect().width, 853);
    const glow = frame.contentWindow.getComputedStyle(preview.querySelector('.preview-montage'), '::before');
    expect(glow.backgroundImage).to.include('finish-glow.svg');
    const scale = 1410 / 1950;
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
    close(style.fontSize, 30);
    expect(style.color).to.equal('rgb(143, 143, 143)');
    expect(frame.contentWindow.getComputedStyle(notice.querySelector('a')).color).to.equal('rgb(59, 99, 251)');
  });

  it('does not draw a full-width gray separator through the Entry reading area', async () => {
    const response = await fetch(new URL('../../booth.html', import.meta.url));
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    stage.replaceWith(source.querySelector('.stage').cloneNode(true));
    stage = frame.contentDocument.querySelector('.stage');
    stage.querySelector('[data-panel="welcome"]').hidden = false;
    stage.querySelector('#booth-status').hidden = true;
    const { contentWindow } = frame;
    const sizes = [
      [2160, 3840], [2160, 2881], [2048, 2732], [2732, 2048], [1080, 1920], [390, 844],
    ];
    for (const [width, height] of sizes) {
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      if (width >= 1000) {
        const style = frame.contentWindow.getComputedStyle(stage.querySelector('.welcome-layout'));
        expect(style.backgroundColor, 'White form backing must not bleed through at fractional scale')
          .to.equal('rgb(255, 255, 255)');
      }
      stage.querySelectorAll('.stage-main, .welcome-layout, .welcome-entry, .stage-footer')
        .forEach((element) => {
          const style = contentWindow.getComputedStyle(element);
          expect(parseFloat(style.borderTopWidth), `${element.className} top at ${width}`).to.equal(0);
          expect(parseFloat(style.borderBottomWidth), `${element.className} bottom at ${width}`).to.equal(0);
        });
    }
  });

  it('keeps the registration label, disclosure and adjacent actions usable across all designed sizes', async () => {
    const response = await fetch(new URL('../../booth.html', import.meta.url));
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    stage.replaceWith(source.querySelector('.stage').cloneNode(true));
    stage = frame.contentDocument.querySelector('.stage');
    stage.querySelector('[data-panel="welcome"]').hidden = false;
    stage.querySelector('#booth-status').hidden = true;
    const sizes = [
      [2160, 2881], [2048, 2732], [2732, 2048], [2160, 3840], [1080, 1920], [390, 844],
    ];
    for (const [width, height] of sizes) {
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      const input = stage.querySelector('#registration-email').getBoundingClientRect();
      const notice = stage.querySelector('#search-privacy').getBoundingClientRect();
      const primary = stage.querySelector('.entry-actions .primary').getBoundingClientRect();
      const demo = stage.querySelector('.entry-alternatives button').getBoundingClientRect();
      expect(notice.y).to.be.at.least(input.bottom);
      expect(notice.bottom).to.be.at.most(primary.y);
      expect(primary.height).to.be.at.least(width >= 1000 ? 72 : 62);
      expect(demo.height).to.be.at.least(width >= 1000 ? 72 : 64);
      expect(demo.x).to.be.closeTo(width >= 1000 ? primary.right + 24 : primary.x, 1);
      expect(demo.y).to.be.at.least(primary.y);
      expect(frame.contentDocument.documentElement.scrollWidth).to.be.at.most(width);
      if (width >= 1000) {
        expect(demo.y).to.be.closeTo(primary.y, 1);
        expect(primary.bottom).to.be.below(height - 100);
      }
    }
  });
});
