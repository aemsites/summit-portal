import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import decorate from '../../blocks/report-carousel/report-carousel.js';

describe('report carousel PDF activation', () => {
  let originalTracker;
  let tracker;

  beforeEach(() => {
    originalTracker = window.saAutomatedLink;
    tracker = sinon.spy();
    window.saAutomatedLink = tracker;
    document.body.innerHTML = `<main><div class="report-carousel">
      <div><div>Overview</div><div>Performance</div><div>Next steps</div>
        <div><a href="/test/fixtures/report.pdf" title="Full report">Download PDF</a></div>
      </div>
    </div></main>`;
  });

  afterEach(() => {
    if (originalTracker === undefined) delete window.saAutomatedLink;
    else window.saAutomatedLink = originalTracker;
    document.querySelector('main')?.remove();
    document.querySelector('meta[name="report-download-state"]')?.remove();
  });

  function clickCanceled(link) {
    let canceled;
    document.addEventListener('click', (event) => {
      canceled = event.defaultPrevented;
      // Suppress real navigation only after observing the block's click handling.
      event.preventDefault();
    }, { once: true });
    const target = link.querySelector('svg path') || link;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return canceled;
  }

  const selectors = ['.rc-tab-bar .rc-download-btn', '.rc-download-footer'];
  selectors.forEach((selector) => {
    it(`preserves native activation and tracking after early analytics: ${selector}`, () => {
      const block = document.querySelector('.report-carousel');
      block.querySelector('a').setAttribute('onclick', "saAutomatedLink(this, 'download'); return false;");
      decorate(block);
      const link = block.querySelector(selector);

      expect(clickCanceled(link)).to.equal(false);
      expect(tracker.calledOnceWithExactly(link, 'download')).to.equal(true);
      expect(link.getAttribute('href')).to.equal('/test/fixtures/report.pdf');
      expect(link.getAttribute('title')).to.equal('Full report');
      expect(link.target).to.equal('_blank');
      expect(link.rel).to.equal('noopener noreferrer');
      expect(link.hasAttribute('onclick')).to.equal(false);
    });

    it(`keeps activation when analytics attaches after decoration: ${selector}`, () => {
      const block = document.querySelector('.report-carousel');
      decorate(block);
      const link = block.querySelector(selector);
      link.setAttribute('onclick', "saAutomatedLink(this, 'download');");

      expect(clickCanceled(link)).to.equal(false);
      expect(tracker.calledOnceWithExactly(link, 'download')).to.equal(true);
    });

    it(`still honors explicit inherited preventDefault: ${selector}`, () => {
      const block = document.querySelector('.report-carousel');
      block.querySelector('a').setAttribute('onclick', "event.preventDefault(); saAutomatedLink(this, 'download');");
      decorate(block);
      const link = block.querySelector(selector);

      expect(clickCanceled(link)).to.equal(true);
      expect(tracker.calledOnceWithExactly(link, 'download')).to.equal(true);
    });
  });

  for (const state of ['disabled', 'unavailable']) {
    it(`continues preventing unavailable downloads: ${state}`, () => {
      const meta = document.createElement('meta');
      meta.name = 'report-download-state';
      meta.content = state;
      document.head.append(meta);
      const block = document.querySelector('.report-carousel');
      block.querySelector('a').setAttribute('onclick', "saAutomatedLink(this, 'download'); return false;");
      decorate(block);
      const link = block.querySelector('.rc-tab-bar .rc-download-btn');

      expect(clickCanceled(link)).to.equal(true);
      expect(link.getAttribute('href')).to.equal('#');
      expect(link.getAttribute('aria-disabled')).to.equal('true');
      expect(link.getAttribute('tabindex')).to.equal('-1');
      expect(block.querySelector('.rc-download-footer')).to.equal(null);
    });
  }
});
