import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../blocks/report-request-form/report-request-form.js';

const tick = () => new Promise((resolve) => { window.setTimeout(resolve, 0); });
const settle = () => new Promise((resolve) => { window.setTimeout(resolve, 80); });

function makeBlock() {
  const block = document.createElement('div');
  block.className = 'report-request-form';
  document.body.append(block);
  return block;
}

describe('report-request-form', () => {
  let fetchStub;

  beforeEach(() => {
    document.head.innerHTML = '<meta name="turnstile-sitekey" content="site-key">';
    document.body.innerHTML = '';
    let callback;
    window.turnstile = {
      render: (_element, options) => {
        callback = options.callback;
        return 'widget-id';
      },
      execute: () => callback('turnstile-token'),
      reset: () => {},
    };
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response(JSON.stringify({
      requestId: 'internal-only-id',
      submittedAt: '2026-09-08T10:00:00.000Z',
    }), { status: 201 }));
  });

  afterEach(() => {
    fetchStub.restore();
    delete window.turnstile;
  });

  it('renders exactly the customer fields, consent, and optional disclosure', () => {
    const block = makeBlock();
    init(block);

    expect([...block.querySelectorAll('input')].map((input) => input.name))
      .to.deep.equal(['fullName', 'email', 'company', 'website', 'jobTitle', 'primaryMarket', 'websiteConfirm', 'consent']);
    expect(block.querySelector('details summary').textContent).to.equal('Add optional details');
    const example = block.querySelector('.rrf-example');
    expect(example.textContent).to.include('Want to see what you\'ll receive?');
    expect(example.querySelector('a').getAttribute('href')).to.equal('/example-report/frescopa/');
    expect(block.textContent).to.not.include('DR ID');
    expect(block.textContent).to.not.include('event code');
  });

  it('shows field-level validation and a summary before submission', () => {
    const block = makeBlock();
    init(block);
    const form = block.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(block.querySelector('.rrf-error-summary').hidden).to.equal(false);
    expect(block.querySelector('.rrf-field-error').textContent).to.include('full name');
    expect(fetchStub.called).to.equal(false);
  });

  it('submits with a retry-safe idempotency key and presents no customer-visible request ID', async () => {
    const block = makeBlock();
    init(block);
    await tick();
    const form = block.querySelector('form');
    form.elements.fullName.value = 'Jordan Lee';
    form.elements.email.value = 'jordan@example.com';
    form.elements.company.value = 'Northstar';
    form.elements.website.value = 'northstar.com';
    form.elements.consent.checked = true;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(fetchStub.calledOnce).to.equal(true);
    const [url, options] = fetchStub.firstCall.args;
    expect(url).to.equal('https://act.aem.now/api/report-requests');
    expect(options.headers['Idempotency-Key']).to.match(/^[A-Za-z0-9-]+$/);
    expect(JSON.parse(options.body)).to.include({
      fullName: 'Jordan Lee',
      website: 'northstar.com',
      consent: true,
      turnstileToken: 'turnstile-token',
    });
    expect(block.querySelector('.rrf-success').textContent).to.include("We'll take it from here.");
    expect(block.querySelector('.rrf-success').textContent).to.not.include('internal-only-id');
  });
});
