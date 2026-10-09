import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../scripts/booth-guide.js';
import banner from '../../blocks/booth-guide-banner/booth-guide-banner.js';

describe('responsive booth guide', () => {
  let root;
  let fetchStub;
  let guide;
  const storageKey = 'booth-guide-checks';

  beforeEach(async () => {
    const source = await fetch('/docs/demo-guide/plugin/guide.json').then((response) => response.json());
    guide = {
      ...source,
      screenshots: [...new Set(source.sections.flatMap((section) => (
        [...section.html.matchAll(/src="screenshots\/([^"]+)"/g)].map((match) => match[1])
      )))],
    };
    root = document.createElement('div');
    root.className = 'booth-guide';
    root.innerHTML = `
      <button id="guide-jump" disabled>Index</button>
      <aside class="bg-sidebar">
        <input id="guide-search" type="search" disabled>
        <button id="guide-clear-search" hidden>Clear</button>
        <p id="guide-search-status"></p>
        <details class="bg-navigation"><summary>Jump to a section</summary><nav id="guide-index"></nav></details>
      </aside>
      <main aria-busy="true">
        <p id="guide-load-status"></p><button id="guide-retry" hidden>Try again</button>
        <div id="guide-sections"></div>
      </main>
      <p id="guide-notice" hidden></p>`;
    document.body.append(root);
    localStorage.removeItem(storageKey);
    window.history.replaceState(null, '', window.location.pathname);
    fetchStub = sinon.stub(window, 'fetch').callsFake(async () => Response.json(guide));
  });

  afterEach(() => {
    sinon.restore();
    root.remove();
    localStorage.removeItem(storageKey);
  });

  it('renders all approved sections, protected full-size images and mobile-scrollable tables', async () => {
    await init(root);
    expect(root.querySelectorAll('.bg-section')).to.have.length(20);
    expect(root.querySelectorAll('#guide-index a')).to.have.length(20);
    expect(root.querySelectorAll('.bg-screenshot')).to.have.length(13);
    expect(root.querySelectorAll('h1')).to.have.length(1);
    expect(root.querySelector('#guide-index [href="#16-first-screen-setup-test"]')).to.exist;
    expect(root.querySelector('#guide-search').disabled).to.equal(false);
    expect(fetchStub.firstCall.args[1]).to.include({ credentials: 'same-origin', cache: 'no-store' });
    root.querySelectorAll('.bg-screenshot').forEach((link) => {
      expect(new URL(link.href).pathname).to.match(/^\/adobe\/booth-guide\/screenshots\/[a-z0-9-]+\.png$/);
      expect(new URL(link.href).searchParams.get('v')).to.equal(guide.contentVersion);
      expect(link.target).to.equal('_blank');
      expect(link.querySelector('img').loading).to.equal('lazy');
    });
    root.querySelectorAll('table').forEach((table) => {
      expect(table.parentElement.className).to.equal('bg-table');
      expect(table.parentElement.tabIndex).to.equal(0);
    });
    root.querySelectorAll('.bg-sensitive').forEach((details) => expect(details.open).to.equal(false));
  });

  it('searches approved non-sensitive text, clears it and navigates to numeric section IDs', async () => {
    await init(root);
    const search = root.querySelector('#guide-search');
    search.value = 'INP';
    search.dispatchEvent(new Event('input'));
    expect(root.querySelector('[id="12-how-to-explain-site-experience"]').hidden).to.equal(false);
    expect(root.querySelector('.bg-cover').hidden).to.equal(true);
    root.querySelector('#guide-clear-search').click();
    expect(root.querySelectorAll('.bg-section[hidden]')).to.have.length(0);
    search.value = 'no-such-guide-finding';
    search.dispatchEvent(new Event('input'));
    expect(root.querySelector('#guide-search-status').textContent).to.include('0 matching sections');
    root.querySelector('#guide-clear-search').click();
    root.querySelector('#guide-index [href="#1-staff-access-and-setup"]').click();
    expect(document.activeElement.id).to.equal('1-staff-access-and-setup');
    expect(window.location.hash).to.equal('#1-staff-access-and-setup');
  });

  it('keeps secrets collapsed and out of search, persists only current-revision checks and resets one section', async () => {
    guide.sections[2].html = guide.sections[2].html.replace('{{STAFF_PASSWORD}}', 'private-test-password');
    const setup = '16-first-screen-setup-test';
    const readiness = '15-readiness-and-recovery';
    localStorage.setItem(storageKey, JSON.stringify({
      [`old:${setup}:0`]: true,
      [`${guide.contentVersion}:${readiness}:0`]: true,
    }));
    await init(root);
    expect(root.querySelector('[id="16-first-screen-setup-test"] .bg-check input').checked).to.equal(false);
    expect(root.querySelector('[id="15-readiness-and-recovery"] .bg-check input').checked).to.equal(true);
    const input = root.querySelector('[id="16-first-screen-setup-test"] .bg-check input');
    input.click();
    expect(JSON.parse(localStorage.getItem(storageKey))[`${guide.contentVersion}:${setup}:0`]).to.equal(true);
    root.querySelector('[id="16-first-screen-setup-test"] .bg-reset').click();
    expect(input.checked).to.equal(false);
    expect(JSON.parse(localStorage.getItem(storageKey))[`${guide.contentVersion}:${readiness}:0`]).to.equal(true);
    const search = root.querySelector('#guide-search');
    search.value = 'private-test-password';
    search.dispatchEvent(new Event('input'));
    expect(root.querySelector('#guide-search-status').textContent).to.include('0 matching');
    expect(localStorage.getItem(storageKey)).not.to.include('private-test-password');
  });

  it('copies only a talk track, not credentials or other page content', async () => {
    const clipboard = sinon.stub(navigator.clipboard, 'writeText').resolves();
    await init(root);
    const button = root.querySelector('.bg-copy');
    const expected = button.parentElement.textContent.trim().replace(/^(Say|Ask):\s*/, '').replace(/Copy line$/, '');
    button.click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(clipboard.firstCall.args[0]).to.equal(expected);
    expect(root.querySelector('#guide-notice').textContent).to.equal('Talk track copied.');
  });

  it('opens the index without a mobile keyboard and rechecks access after browser restoration', async () => {
    await init(root);
    root.querySelector('.bg-navigation').open = false;
    root.querySelector('#guide-jump').click();
    expect(root.querySelector('.bg-navigation').open).to.equal(true);
    expect(document.activeElement).to.equal(root.querySelector('.bg-navigation summary'));
    fetchStub.callsFake(async () => new Response('Expired', { status: 401 }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(root.querySelectorAll('.bg-section')).to.have.length(0);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(root.querySelector('#guide-load-status a').href).to.include('/auth/portal?redirect=');
    expect(root.querySelector('#guide-jump').disabled).to.equal(true);
  });

  it('shows access errors and retryable service errors without rendering partial private content', async () => {
    for (const code of [401, 403, 503]) {
      fetchStub.callsFake(async () => new Response('Unavailable', { status: code }));
      await init(root);
      expect(root.querySelectorAll('.bg-section')).to.have.length(0);
      expect(root.querySelector('main').hasAttribute('aria-busy')).to.equal(false);
      if (code === 503) {
        expect(root.querySelector('#guide-retry').hidden).to.equal(false);
        expect(root.querySelector('#guide-load-status').textContent).to.include('Do not use an incomplete guide');
      } else {
        expect(root.querySelector('#guide-load-status a')).to.exist;
      }
    }
  });

  it('builds the dashboard entry without opening the kiosk or disturbing export tools', () => {
    const block = document.createElement('div');
    block.className = 'booth-guide-banner';
    banner(block);
    banner(block);
    expect(block.querySelectorAll('aside')).to.have.length(1);
    expect(block.querySelector('a').getAttribute('href')).to.equal('/adobe/booth-guide');
    expect(block.querySelectorAll('a')).to.have.length(1);
    expect(block.textContent).to.include('mobile or desktop');
    expect(block.querySelector('a[href="/booth"]')).to.equal(null);
  });
});
