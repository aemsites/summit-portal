import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../blocks/report-requests-list/report-requests-list.js';

const settle = () => new Promise((resolve) => { window.setTimeout(resolve, 80); });

function makeBlock() {
  const block = document.createElement('div');
  block.className = 'report-requests-list';
  document.body.append(block);
  return block;
}

describe('report-requests-list', () => {
  let fetchStub;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    fetchStub?.restore();
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
      }],
      nextCursor: null,
    }), { status: 200 }));
    const block = makeBlock();
    init(block);
    await settle();

    expect(block.textContent).to.include('Jordan Lee');
    expect(block.textContent).to.not.include('internal-id');
    const search = block.querySelector('input[type="search"]');
    search.value = 'northstar';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => { window.setTimeout(resolve, 300); });
    expect(block.querySelector('.rrl-export').getAttribute('href')).to.equal('/api/report-requests.csv?q=northstar');
  });

  it('shows a sign-in action for unauthenticated access', async () => {
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response('', { status: 401 }));
    const block = makeBlock();
    init(block);
    await settle();

    expect(block.textContent).to.include('Sign in with Adobe ID');
    expect(block.querySelector('.rrl-state button').textContent).to.equal('Try again');
  });
});
