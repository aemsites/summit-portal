import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../blocks/report-request-form/report-request-form.js';
import { BOOTH_DEMOS } from '../../scripts/booth-demos.js';

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
  let originalUrl;

  beforeEach(() => {
    originalUrl = window.location.href;
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
    window.history.replaceState(null, '', originalUrl);
  });

  it('collects first and last name and source, without role or market fields', () => {
    const block = makeBlock();
    init(block);

    expect([...block.querySelectorAll('input')].map((input) => input.name))
      .to.deep.equal(['firstName', 'lastName', 'email', 'company', 'website', 'requestSource', 'websiteConfirm', 'consent']);
    expect(block.querySelector('[name="firstName"]').autocomplete).to.equal('given-name');
    expect(block.querySelector('[name="lastName"]').autocomplete).to.equal('family-name');
    const source = block.querySelector('[name="requestSource"]');
    expect(source.required).to.equal(true);
    expect(source.maxLength).to.equal(200);
    expect(source.getAttribute('aria-describedby')).to.include(`${source.id}-hint`);
    expect(block.querySelector('.rrf-field-hint').textContent).to.include('event name and city');
    expect(block.querySelector('.rrf-optional')).to.equal(null);
    expect(block.textContent).to.not.include('DR ID');
    expect(block.textContent).to.not.include('event code');
  });

  it('places every public industry example below the form with booth icons and separate tabs', () => {
    const block = makeBlock();
    init(block);
    const demos = block.querySelector('.rrf-demos');
    expect(demos.previousElementSibling.contains(block.querySelector('form'))).to.equal(true);
    expect(demos.textContent).to.include('demo brands');
    const links = [...demos.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).to.deep.equal(BOOTH_DEMOS.map((demo) => demo.path));
    links.forEach((link, index) => {
      expect(link.target).to.equal('_blank');
      expect(link.rel).to.include('noopener');
      expect(link.querySelector('img').getAttribute('src')).to.equal(`/img/booth/industry-${BOOTH_DEMOS[index].id}.svg`);
      expect(link.getAttribute('aria-label')).to.include('opens in a new tab');
    });
  });

  it('opens coverage on desktop and collapses it on mobile', () => {
    const media = new EventTarget();
    media.matches = true;
    const stub = sinon.stub(window, 'matchMedia').returns(media);
    try {
      const block = makeBlock();
      init(block);
      const coverage = block.querySelector('.rrf-coverage');
      expect(coverage.open).to.equal(true);
      expect(coverage.querySelectorAll('li')).to.have.length(4);
      media.matches = false;
      media.dispatchEvent(new Event('change'));
      expect(coverage.open).to.equal(false);
    } finally {
      stub.restore();
    }
  });

  it('starts a booth request fresh without URL prefill, saved autofill or checked consent', () => {
    window.history.replaceState(null, '', '/request-report?email=previous@example.com&company=Previous&consent=true');
    const marker = document.createElement('script');
    marker.dataset.boothMode = 'request';
    document.head.append(marker);
    const block = makeBlock();
    init(block);
    ['firstName', 'lastName', 'email', 'company', 'website', 'requestSource'].forEach((name) => {
      const input = block.querySelector(`[name="${name}"]`);
      expect(input.value).to.equal('');
      expect(input.autocomplete).to.equal('off');
    });
    expect(block.querySelector('[name="consent"]').checked).to.equal(false);
  });

  it('shows field-level validation and a summary before submission', () => {
    const block = makeBlock();
    init(block);
    const form = block.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(block.querySelector('.rrf-error-summary').hidden).to.equal(false);
    expect(block.querySelector('.rrf-field-error').textContent).to.include('first name');
    expect(block.querySelector('[name="lastName"]').getAttribute('aria-invalid')).to.equal('true');
    expect(block.querySelector('[name="requestSource"]').getAttribute('aria-invalid')).to.equal('true');
    expect(fetchStub.called).to.equal(false);
  });

  it('rejects whitespace-only names and source before requesting verification', () => {
    const block = makeBlock();
    init(block);
    ['firstName', 'lastName', 'requestSource'].forEach((name) => {
      block.querySelector(`[name="${name}"]`).value = '   ';
    });
    block.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    ['firstName', 'lastName', 'requestSource'].forEach((name) => {
      expect(block.querySelector(`[name="${name}"]`).getAttribute('aria-invalid')).to.equal('true');
    });
    expect(fetchStub.called).to.equal(false);
  });

  it('explains an unavailable report without changing the intake fields', () => {
    window.history.replaceState(null, '', '/request-report?reason=unavailable');
    const block = makeBlock();
    init(block);
    expect(block.querySelector('.rrf-recovery-title').textContent).to.include('available to your email address');
    expect(block.querySelector('.rrf-recovery a').getAttribute('href')).to.equal('/auth/logout');
    expect(block.querySelector('form')).to.exist;
    expect(block.querySelector('[name="email"]').value).to.equal('');
  });

  it('does not show the contextual recovery notice for ordinary or unknown reasons', () => {
    window.history.replaceState(null, '', '/request-report?reason=anything');
    const block = makeBlock();
    init(block);
    expect(block.querySelector('.rrf-recovery')).to.equal(null);
  });

  it('submits with a retry-safe idempotency key and presents no customer-visible request ID', async () => {
    const block = makeBlock();
    init(block);
    await tick();
    const form = block.querySelector('form');
    form.elements.firstName.value = ' Jordan ';
    form.elements.lastName.value = ' Lee ';
    form.elements.email.value = 'jordan@example.com';
    form.elements.company.value = 'Northstar';
    form.elements.website.value = 'northstar.com';
    form.elements.requestSource.value = 'Adobe Summit, London';
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
      requestSource: 'Adobe Summit, London',
      consent: true,
      turnstileToken: 'turnstile-token',
    });
    expect(JSON.parse(options.body)).to.not.have.property('jobTitle');
    expect(JSON.parse(options.body)).to.not.have.property('primaryMarket');
    expect(block.querySelector('.rrf-success').textContent).to.include("We'll take it from here.");
    expect(block.querySelector('.rrf-success').textContent).to.not.include('internal-only-id');
    expect(block.querySelector('.rrf-shell > h1')).to.equal(null);
    expect(block.querySelector('.rrf-shell').children).to.have.length(1);
  });

  it('keeps entered details and the same retry key when submission fails', async () => {
    fetchStub.onFirstCall().resolves(new Response('{"error":"Please try again."}', { status: 503 }));
    const block = makeBlock();
    init(block);
    await tick();
    const form = block.querySelector('form');
    Object.entries({
      firstName: 'Jordan',
      lastName: 'Lee',
      email: 'jordan@example.com',
      company: 'Northstar',
      website: 'northstar.com',
      requestSource: 'Email',
    }).forEach(([name, value]) => { form.elements[name].value = value; });
    form.elements.consent.checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(block.querySelector('.rrf-submit-status').textContent).to.equal('Please try again.');
    expect(form.elements.requestSource.value).to.equal('Email');
    expect(form.querySelector('button').disabled).to.equal(false);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(fetchStub.callCount).to.equal(2);
    expect(fetchStub.firstCall.args[1].headers['Idempotency-Key'])
      .to.equal(fetchStub.secondCall.args[1].headers['Idempotency-Key']);
    expect(block.querySelector('.rrf-success')).to.exist;
  });
});
