import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import decorateScores from '../../blocks/report-scores/report-scores.js';
import decorateCallout from '../../blocks/report-callout/report-callout.js';
import decorateStats from '../../blocks/report-stats/report-stats.js';
import {
  relocateAllSectionFooters,
  scheduleRelocateSectionFooter,
} from '../../blocks/report-ai-visibility/relocate-section-footer.js';

describe('performance section footer decoration order', () => {
  let sandbox;
  let frames;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    frames = [];
    sandbox.stub(window, 'requestAnimationFrame').callsFake((callback) => {
      frames.push(callback);
      return frames.length;
    });
    document.body.innerHTML = `<main>
      <div class="report-hero insight"></div>
      <div class="section">
        <div class="block-content">
          <div class="report-scores" data-metrics="field">
            <div><div>Homepage</div><div>https://example.com/</div><div>60</div>
              <div>1.5s</div><div>321ms</div><div>0.00</div>
              <div>Original page analysis.</div><div>Original recommendation.</div></div>
            <div><div>Solutions</div><div>https://example.com/solutions</div><div>40</div>
              <div>1.4s</div><div>178ms</div><div>0.00</div>
              <div>Second page analysis.</div><div>Second recommendation.</div></div>
          </div>
          <div class="report-callout"><div><div>Info</div>
            <div><p><strong>How to act:</strong> Keep this authentic callout.</p></div></div></div>
        </div>
        <div class="default-content"><p>Data source: Google Chrome UX Report</p></div>
      </div>
    </main>`;
  });

  afterEach(() => {
    sandbox.restore();
    document.querySelector('main')?.remove();
  });

  function flushFrames() {
    while (frames.length) frames.shift()();
  }

  for (const early of [true, false]) {
    it(`preserves page rows and footer nodes when relocation runs ${early ? 'before' : 'after'} scores decoration`, async () => {
      const scores = document.querySelector('.report-scores');
      const callout = document.querySelector('.report-callout');
      const source = document.querySelector('.default-content');
      decorateCallout(callout);
      if (early) {
        flushFrames();
        relocateAllSectionFooters();
      }
      await decorateScores(scores);
      flushFrames();
      relocateAllSectionFooters();
      scheduleRelocateSectionFooter(scores);
      flushFrames();
      expect([...scores.querySelectorAll('.rsc-page-name')].map((el) => el.textContent))
        .to.deep.equal(['Homepage', 'Solutions']);
      expect(scores.querySelectorAll('.rsc-metric')).to.have.length(6);
      expect(document.querySelectorAll('.report-callout')).to.have.length(1);
      expect(document.querySelector('.report-callout')).to.equal(callout);
      expect(document.querySelector('.default-content')).to.equal(source);
      expect(callout.textContent).to.include('How to act: Keep this authentic callout.');
      const host = scores.closest('.rav-empty-shell').querySelector('.rav-panels-outer');
      expect(host.contains(callout)).to.equal(true);
      expect(host.contains(source)).to.equal(true);
      expect(source.querySelectorAll('.cannes-source-logo')).to.have.length(1);
      expect(scores.querySelector(':scope > .rpt-widget-footer')).to.equal(null);
    });
  }

  it('does not append footer divs to undecorated score rows or consume their siblings', () => {
    const scores = document.querySelector('.report-scores');
    const rows = [...scores.children];
    const callout = document.querySelector('.report-callout');
    const source = document.querySelector('.default-content');
    scheduleRelocateSectionFooter(callout);
    flushFrames();
    relocateAllSectionFooters();
    expect([...scores.children]).to.deep.equal(rows);
    expect(callout.parentElement.className).to.equal('block-content');
    expect(source.parentElement.className).to.equal('section');
  });

  for (const early of [true, false]) {
    it(`retains the original stats callout and source when relocation runs ${early ? 'before' : 'after'} stats decoration`, async () => {
      const stats = document.querySelector('.report-scores');
      stats.className = 'report-stats dark';
      stats.innerHTML = '<div><div>AI Visibility</div><div>61/100</div><div>positive</div><div>Improved</div><div>Original insight.</div></div>';
      const callout = document.querySelector('.report-callout');
      const source = document.querySelector('.default-content');
      const clicked = sinon.spy();
      callout.addEventListener('click', clicked);
      decorateCallout(callout);
      if (early) {
        flushFrames();
        relocateAllSectionFooters();
        expect(stats.contains(callout)).to.equal(true);
      }
      await decorateStats(stats);
      flushFrames();
      relocateAllSectionFooters();
      expect(stats.querySelectorAll('.rs-dark-card')).to.have.length(1);
      expect(stats.contains(callout)).to.equal(true);
      expect(stats.contains(source)).to.equal(true);
      expect(document.querySelectorAll('.report-callout')).to.have.length(1);
      expect(callout.textContent).to.include('Keep this authentic callout.');
      callout.click();
      expect(clicked.calledOnce).to.equal(true);
    });
  }

  it('retains a footer relocated while insight stats await their stylesheet', async () => {
    const stats = document.querySelector('.report-scores');
    stats.className = 'report-stats';
    stats.innerHTML = '<div><div>AI Visibility</div><div>61/100</div><div>positive</div><div>Improved</div><div>Original insight.</div></div>';
    const callout = document.querySelector('.report-callout');
    const source = document.querySelector('.default-content');
    decorateCallout(callout);
    const decoration = decorateStats(stats);
    flushFrames();
    relocateAllSectionFooters();
    expect(stats.contains(callout)).to.equal(true);
    await decoration;
    flushFrames();
    expect(stats.contains(callout)).to.equal(true);
    expect(stats.contains(source)).to.equal(true);
    expect(stats.querySelectorAll('.rav-stat-card')).to.have.length(1);
  });
});
