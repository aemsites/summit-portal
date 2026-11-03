import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setViewport } from '@web/test-runner-commands';
import init from '../../blocks/report-requests-list/report-requests-list.js';
import { loadStyle } from '../../scripts/ak.js';

const settle = () => new Promise((resolve) => { window.setTimeout(resolve, 80); });

function makeBlock() {
  const main = document.createElement('main');
  main.innerHTML = '<div class="section"><div class="block-content"></div></div>';
  const block = document.createElement('div');
  block.className = 'report-requests-list';
  main.querySelector('.block-content').append(block);
  document.body.append(main);
  return block;
}

describe('report-requests-list', () => {
  let fetchStub;

  before(async () => {
    await loadStyle('/styles/styles.css');
    await loadStyle('/blocks/report-requests-list/report-requests-list.css');
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    fetchStub?.restore();
    document.documentElement.style.removeProperty('color-scheme');
    await setViewport({ width: 800, height: 600 });
  });

  it('renders list records and keeps CSV export aligned with search', async () => {
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response(JSON.stringify({
      requests: [{
        request_id: 'internal-id',
        submitted_at: '2026-09-08T10:00:00.000Z',
        full_name: 'Jordan Lee',
        email: 'jordan@northstar.com',
        company: 'Northstar',
        website: 'northstar.com',
        job_title: 'VP, Digital',
        primary_market: 'North America',
        request_source: 'Adobe Summit, London',
      }],
      nextCursor: null,
    }), { status: 200 }));
    const block = makeBlock();
    init(block);
    await settle();

    expect(block.querySelector('.rrl-back').getAttribute('href')).to.equal('/adobe/dashboard');
    expect(block.textContent).to.include('Jordan Lee');
    expect(block.textContent).to.include('Request source');
    expect(block.textContent).to.include('Adobe Summit, London');
    expect(block.textContent).to.include('VP, Digital');
    expect(block.textContent).to.include('North America');
    expect(block.textContent).to.not.include('internal-id');
    const search = block.querySelector('input[type="search"]');
    search.value = 'northstar';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => { window.setTimeout(resolve, 300); });
    expect(block.querySelector('.rrl-export').getAttribute('href')).to.equal('/api/report-requests.csv?q=northstar');
    expect(fetchStub.lastCall.args[0]).to.equal('/api/report-requests?q=northstar');
  });

  it('clearly separates staff generation, customer intake and dashboard delivery', async () => {
    fetchStub = sinon.stub(window, 'fetch').resolves(Response.json({ requests: [], nextCursor: null }));
    const block = makeBlock();
    init(block);
    await settle();
    const actions = block.querySelector('nav[aria-label="Request reports in Digital Insights Hub"]');
    expect([...actions.querySelectorAll('a')].map((link) => [link.textContent, link.href])).to.deep.equal([
      ['Request one report', 'https://digital-insights.corp.adobe.com/request-report'],
      ['Request in bulk', 'https://digital-insights.corp.adobe.com/insights-campaigns'],
    ]);
    expect(block.querySelector('.dashboard-resource-actions a').getAttribute('href')).to.equal('/adobe/dashboard?tab=insights');
    expect(block.querySelector('a[href="/request-report"]').textContent).to.equal('Open public request form');
    ['Share', 'Send link', 'Copy link', 'one month', 'does not generate or send reports'].forEach((text) => {
      expect(block.querySelector('aside').textContent).to.include(text);
    });
    expect(block.querySelectorAll('h1')).to.have.length(1);
    expect(block.querySelector('.rrl-list > h2').textContent).to.equal('Customer requests');
  });

  it('appends cursor pages and resets pagination and export when search is cleared', async () => {
    const request = { full_name: 'First Example', email: 'first@example.com', submitted_at: '2026-11-03T10:00:00Z' };
    fetchStub = sinon.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves(Response.json({ requests: [request], nextCursor: 'page+2/=' }));
    fetchStub.onSecondCall().resolves(Response.json({ requests: [{ ...request, full_name: 'Second Example' }], nextCursor: null }));
    fetchStub.callsFake(async () => Response.json({ requests: [request], nextCursor: null }));
    const block = makeBlock();
    init(block);
    await settle();
    block.querySelector('.rrl-more').click();
    await settle();
    expect(fetchStub.secondCall.args[0]).to.equal('/api/report-requests?cursor=page%2B2%2F%3D');
    expect([...block.querySelectorAll('.rrl-row h3')].map((heading) => heading.textContent)).to.deep.equal(['First Example', 'Second Example']);
    expect(block.querySelector('.rrl-more')).to.equal(null);
    const search = block.querySelector('input');
    search.value = 'Partner & event';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => { window.setTimeout(resolve, 300); });
    expect(fetchStub.lastCall.args[0]).to.equal('/api/report-requests?q=Partner+%26+event');
    expect(block.querySelector('.rrl-export').getAttribute('href')).to.equal('/api/report-requests.csv?q=Partner+%26+event');
    expect(block.querySelectorAll('.rrl-row')).to.have.length(1);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => { window.setTimeout(resolve, 300); });
    expect(fetchStub.lastCall.args[0]).to.equal('/api/report-requests');
    expect(block.querySelector('.rrl-export').getAttribute('href')).to.equal('/api/report-requests.csv');
  });

  it('keeps historical requests readable without inventing their source', async () => {
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response(JSON.stringify({
      requests: [{ full_name: 'Jordan Lee', email: 'jordan@example.com', company: 'Northstar', website: 'northstar.com', submitted_at: '2026-09-08T10:00:00.000Z' }],
      nextCursor: null,
    })));
    const block = makeBlock();
    init(block);
    await settle();
    const source = [...block.querySelectorAll('dl > div')].find((row) => row.querySelector('dt').textContent === 'Request source');
    expect(source.querySelector('dd').textContent).to.equal('—');
    expect(block.textContent).to.not.include('Role');
    expect(block.textContent).to.not.include('Market');
  });

  it('shows a sign-in action for unauthenticated access', async () => {
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response('', { status: 401 }));
    const block = makeBlock();
    init(block);
    await settle();

    expect(block.textContent).to.include('Sign in with Adobe ID');
    expect(block.querySelector('.rrl-state button').textContent).to.equal('Try again');
  });

  it('does not expose request rows to non-Adobe staff', async () => {
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response('', { status: 403 }));
    const block = makeBlock();
    init(block);
    await settle();
    expect(block.textContent).to.include('available to Adobe employees signed in with Adobe ID');
    expect(block.querySelector('.rrl-row')).to.equal(null);
    expect(block.querySelector('.rrl-state button')).to.equal(null);
  });

  it('shows empty search feedback and recovers from a network error', async () => {
    fetchStub = sinon.stub(window, 'fetch');
    fetchStub.onFirstCall().rejects(new TypeError('Network unavailable'));
    fetchStub.callsFake(async () => Response.json({ requests: [], nextCursor: null }));
    const block = makeBlock();
    init(block);
    await settle();
    expect(block.querySelector('.rrl-state').textContent).to.include('We could not load report requests');
    block.querySelector('.rrl-state button').click();
    await settle();
    expect(block.querySelector('.is-empty').textContent).to.include('No report requests yet');
    const search = block.querySelector('input');
    search.value = '<no match>';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => { window.setTimeout(resolve, 300); });
    expect(block.querySelector('.is-empty').textContent).to.include('No report requests match “<no match>”');
    expect(block.querySelector('.is-empty').children).to.have.length(1);
  });

  [320, 375, 414, 768, 1440].forEach((width) => {
    ['light', 'dark'].forEach((theme) => {
      it(`uses dashboard styling without overflow at ${width}px in ${theme} mode`, async () => {
        await setViewport({ width, height: 900 });
        document.documentElement.style.colorScheme = theme;
        fetchStub = sinon.stub(window, 'fetch').resolves(Response.json({
          requests: [{
            full_name: 'A customer with a long name',
            email: 'long-customer-email-address@example.com',
            company: 'A long example company name',
            website: 'a-very-long-domain-name.example.com',
            request_source: 'Adobe Summit, London',
            job_title: 'Digital experience lead',
            primary_market: 'North America',
            submitted_at: '2026-11-03T10:00:00Z',
          }],
          nextCursor: null,
        }));
        const block = makeBlock();
        init(block);
        await settle();
        expect(document.documentElement.scrollWidth).to.be.at.most(width);
        expect(block.getBoundingClientRect().width).to.equal(width);
        expect(block.querySelector('.rrl-shell').getBoundingClientRect().width).to.be.at.most(1200);
        const title = getComputedStyle(block.querySelector('h1'));
        expect(title.fontFamily).to.include('Montserrat');
        expect(parseFloat(title.fontSize)).to.be.at.most(28);
        expect(getComputedStyle(block.querySelector('input')).borderRadius).to.equal('8px');
        expect(getComputedStyle(block.querySelector('.dashboard-jump')).display).to.equal(width >= 1000 ? 'none' : 'flex');
        expect(block.querySelector('.dashboard-jump').hash).to.equal('#rrl-guidance');
        expect(block.querySelector('#rrl-guidance').tabIndex).to.equal(-1);
        const columns = getComputedStyle(block.querySelector('.rrl-layout')).gridTemplateColumns.split(' ');
        expect(columns).to.have.length(width >= 1000 ? 2 : 1);
        const controlSelectors = '.rrl-request-actions a, .rrl-export, input, .dashboard-resource-actions a';
        block.querySelectorAll(controlSelectors).forEach((control) => {
          const box = control.getBoundingClientRect();
          expect(box.width).to.be.greaterThan(0);
          expect(box.height).to.be.at.least(44);
          expect(box.right).to.be.at.most(width);
          expect(box.left).to.be.at.least(0);
        });
        expect(getComputedStyle(block).backgroundColor).to.equal(theme === 'light' ? 'rgb(249, 250, 251)' : 'rgb(22, 22, 22)');
      });
    });
  });
});
