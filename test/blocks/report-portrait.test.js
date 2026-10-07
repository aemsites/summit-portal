import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
import decorateScores from '../../blocks/report-scores/report-scores.js';

describe('exact portrait report layout and tested-page links', () => {
  const styles = [];
  const pageUrl = 'https://www.example.com/coffee/brewing/a-long-tested-page?region=uk&campaign=autumn#details';

  before(async () => {
    await Promise.all([
      '/styles/styles.css', '/blocks/report-hero/report-hero.css',
      '/blocks/report-carousel/report-carousel.css', '/blocks/report-scores/report-scores.css',
      '/blocks/cobrand/cobrand.css',
      '/blocks/cannes-stripe/cannes-stripe.css',
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
    document.body.innerHTML = `<main>
      <div class="section"><div class="block-content">
        <div class="report-hero insight"><h1>Example report</h1></div>
      </div></div>
      <div class="section"><div class="block-content"><div class="report-carousel">
        <p class="rc-desc">The report narrative.</p>
      </div></div></div>
      <div class="cannes-stripe"></div>
    </main>`;
  });

  afterEach(() => {
    document.querySelector('main')?.remove();
    document.documentElement.classList.remove('booth-report-active');
  });

  after(async () => {
    styles.forEach((link) => link.remove());
    await setViewport({ width: 800, height: 600 });
  });

  it('enlarges the shared column and content only at 2160 × 3840', async () => {
    const column = document.querySelector('main > .section');
    const text = document.querySelector('.rc-desc');
    await setViewport({ width: 2160, height: 3841 });
    const originalTextHeight = text.getBoundingClientRect().height;
    expect(column.getBoundingClientRect().width).to.equal(1200);
    await setViewport({ width: 2160, height: 3840 });
    expect(column.getBoundingClientRect().width).to.equal(1920);
    expect(text.getBoundingClientRect().height).to.be.closeTo(originalTextHeight * 1.6, 1);
    expect(document.documentElement.scrollWidth).to.equal(2160);

    for (const [width, height] of [[2160, 3839], [2159, 3840], [2161, 3840],
      [1080, 1920], [3840, 2160], [1440, 900], [390, 844]]) {
      await setViewport({ width, height });
      expect(getComputedStyle(document.body).zoom, `${width} × ${height}`).to.equal('1');
    }
  });

  it('does not enlarge unrelated pages or double-scale authorized booth reports', async () => {
    await setViewport({ width: 2160, height: 3840 });
    document.querySelector('.report-hero').classList.remove('insight');
    expect(getComputedStyle(document.body).zoom).to.equal('1');
    document.querySelector('.report-hero').classList.add('insight');
    document.documentElement.classList.add('booth-report-active');
    expect(getComputedStyle(document.body).zoom).to.equal('1');
  });

  it('keeps the complete tested URL visible and linked, including query and fragment', async () => {
    const block = document.createElement('div');
    block.className = 'report-scores';
    block.innerHTML = `<div><div>Brewing guide</div><div><a href="${pageUrl}">Tested page</a></div>
      <div>58</div><div>2.9s</div><div>110ms</div><div>0.08</div></div>
      <div><div>Page without a URL</div><div></div>
      <div>90</div><div>1s</div><div>90ms</div><div>0.01</div></div>`;
    document.querySelector('main > .section:nth-child(2) .block-content').append(block);
    await decorateScores(block);
    const link = block.querySelector('.rsc-page-url');
    expect(link.textContent).to.equal(block.querySelector('.rsc-page-name a').href);
    expect(link.href).to.equal(pageUrl);
    expect(link.target).to.equal('_blank');
    expect(link.rel).to.equal('noopener noreferrer');
    expect(getComputedStyle(link).whiteSpace).to.equal('normal');
    expect(getComputedStyle(link).overflowWrap).to.equal('anywhere');
    expect(block.querySelectorAll('.rsc-page-url').length).to.equal(1);
  });
});
