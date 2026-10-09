import { expect } from '@esm-bundle/chai';
import { matchUrl, screens } from '../../docs/demo-guide/plugin/routes.js';

describe('staff companion live DOM detection', () => {
  it('distinguishes the overview, grouped AI panels, search and performance without reading data', async () => {
    const originalUrl = window.location.href;
    const originalChrome = window.chrome;
    const OriginalObserver = window.MutationObserver;
    const observers = [];
    let readMessage;
    const messages = [];
    const fixture = document.createElement('div');
    fixture.innerHTML = `
      <input value="visitor@example.test">
      <div class="report-hero"></div>
      <div class="report-stats dark"></div>
      <div class="report-ai-visibility">
        <div class="rav-panels-outer">
          <div class="rav-panels"><div class="rav-panel"></div><div class="rav-panel"></div></div>
          <div class="rav-panels"><div class="rav-panel"></div></div>
        </div>
      </div>
      <div class="report-stats"></div>
      <div class="report-ai-visibility rav-empty-shell"><div class="report-scores"></div></div>`;
    document.body.append(fixture);
    window.chrome = {
      runtime: {
        sendMessage: async (message) => { messages.push(message); },
        onMessage: { addListener: (listener) => { readMessage = listener; } },
      },
    };
    window.MutationObserver = class extends OriginalObserver {
      constructor(callback) {
        super(callback);
        observers.push(this);
      }
    };
    try {
      window.history.replaceState(null, '', '/example-report/frescopa/');
      await import('../../docs/demo-guide/plugin/bridge.js');
      [
        ['.report-hero', 'overview'],
        ['.report-stats.dark', 'overview'],
        ['.report-ai-visibility:not(.rav-empty-shell)', 'visibility'],
        ['.rav-panels:first-child', 'competitors'],
        ['.rav-panels:nth-child(2)', 'platforms'],
        ['.report-stats:not(.dark)', 'search'],
        ['.report-scores', 'performance'],
      ].forEach(([selector, screen]) => {
        [...fixture.querySelectorAll('div')].forEach((element) => {
          const active = element.matches(selector);
          element.getBoundingClientRect = () => new DOMRect(0, active ? 0 : 10000, 100, 500);
        });
        let response;
        readMessage({ type: 'READ_SCREEN' }, {}, (state) => { response = state; });
        expect(response).to.deep.equal({ screen, example: true });
      });
      expect(messages.length).to.be.greaterThan(0);
      messages.forEach((message) => {
        expect(Object.keys(message).sort()).to.deep.equal(['example', 'screen', 'type']);
        expect(JSON.stringify(message)).not.to.include('visitor@example.test');
      });
    } finally {
      observers.forEach((observer) => observer.disconnect());
      fixture.remove();
      window.history.replaceState(null, '', originalUrl);
      window.chrome = originalChrome;
      window.MutationObserver = OriginalObserver;
    }
  });
});

describe('staff companion route matching', () => {
  it('matches only the actual booth origin', () => {
    [
      'https://act.aem.now.evil.example/booth',
      'https://evil.example/booth?host=act.aem.now',
      'http://act.aem.now/booth',
      'file:///C:/demo/index.html',
      'chrome://extensions',
      'https://act.aem.now/adobe/dashboard',
      'https://act.aem.now/request-report',
      'not a URL',
    ].forEach((url) => expect(matchUrl(url)).to.equal(null));
  });

  it('matches the setup, selection, Finish and recovery screens', () => {
    [
      ['/login?staff&redirect=%2Fbooth', 'login'],
      ['/booth', 'entry'],
      ['/booth?step=picker', 'entry'],
      ['/booth?step=demos&brand=adobe', 'demos'],
      ['/booth?step=finish', 'finish'],
      ['/booth?recover=1', 'recovery'],
    ].forEach(([path, screen]) => expect(matchUrl(`https://act.aem.now${path}`)).to.equal(screen));
  });

  it('matches example and exact portal-landing reports, not other account pages', () => {
    expect(matchUrl('https://act.aem.now/example-report/frescopa/')).to.equal('overview');
    expect(matchUrl('https://act.aem.now/accounts/u/unity/insights/unity-com/portal-landing/')).to.equal('overview');
    expect(matchUrl('https://act.aem.now/accounts/u/unity/insights/unity-com/portal-landing/index.html')).to.equal('overview');
    expect(matchUrl('https://act.aem.now/accounts/u/unity/')).to.equal(null);
  });

  it('loads every guide section, current screenshot and reference definition', async () => {
    const response = await fetch('/docs/demo-guide/plugin/guide.json');
    expect(response.ok).to.equal(true);
    const guide = await response.json();
    expect(guide.redacted).to.equal(true);
    expect(guide.contentVersion).to.equal('2026-10-09-v4-availability');
    expect(guide.sourceDocument).to.equal('Amplify your brand visibility activation guide (4).docx');
    expect(guide.sections.find((section) => section.id === '2-open-the-right-company-report').searchText)
      .to.include('new website, limited traffic')
      .and.to.include('another website')
      .and.to.include('not a diagnosis');
    expect(guide.sections).to.have.length(20);
    Object.values(screens).forEach(({ sectionId }) => {
      expect(guide.sections.some((section) => section.id === sectionId)).to.equal(true);
    });
    const text = guide.sections.map((section) => section.html).join('\n');
    expect(text.match(/<img /g)).to.have.length(13);
    [
      '{{STAFF_USERNAME}}', '{{STAFF_PASSWORD}}', '{{SETUP_TEST_EMAIL}}',
      'What Adobe Brand Visibility helps you understand', 'Google PageSpeed Insights',
      '13. Statements to avoid', 'Objection handling: value and next steps', '30 days',
      'Click button to clear the screen', 'José Correia',
    ].forEach((phrase) => expect(text).to.include(phrase));
    expect(text).not.to.include('Semrush');
    expect(text).not.to.include('LLMO');
    expect(text).not.to.include('No email test is required on site');
    expect(guide.sections.find(({ id }) => id === '15-readiness-and-recovery').html.match(/\[ \]/g)).to.have.length(4);
    expect(text).not.to.include('Edge Delivery');
    expect(text).not.to.include('Request my report');
    const imagePaths = [...text.matchAll(/<img [^>]*src="([^"]+)"/g)]
      .map((match) => match[1]);
    expect(imagePaths).to.have.length(13);
    const base = new URL('/docs/demo-guide/plugin/sidepanel.html', window.location.origin);
    const images = await Promise.all(imagePaths.map((path) => fetch(new URL(path, base))));
    images.forEach((image) => expect(image.ok).to.equal(true));
    const sectionIds = guide.sections.map(({ id }) => id);
    [...text.matchAll(/href="#([^"]+)"/g)].forEach((match) => {
      expect(sectionIds).to.include(match[1]);
    });
  });
});
