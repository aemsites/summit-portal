import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../blocks/report-request-form/report-request-form.js';
import { BOOTH_DEMOS } from '../../scripts/booth-demos.js';

const tick = () => new Promise((resolve) => { window.setTimeout(resolve, 0); });
const settle = () => new Promise((resolve) => { window.setTimeout(resolve, 80); });
const PUBLIC_CAMPAIGN_ID = '2a6aa96b-8078-4efb-8d16-cd0d79645589';
const STAGE_TOKEN = `${PUBLIC_CAMPAIGN_ID}.38aaa507a2e8fcaba0f1c6ef44906a6f12424296363c6dee9d287c4b4fe24932`;
const TEST_URL = 'https://act.aem.now/api/report-requests/test';

function submitSample(form) {
  form.elements.firstName.value = 'Sample';
  form.elements.lastName.value = 'Attendee';
  form.elements.email.value = 'sample@example.test';
  form.elements.company.value = 'Synthetic';
  form.elements.website.value = 'example.test';
  form.elements.consent.checked = true;
  form.requestSubmit();
}

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

  it('collects five required details without asking for the source', () => {
    const block = makeBlock();
    init(block);

    expect([...block.querySelectorAll('input')].map((input) => input.name))
      .to.deep.equal(['firstName', 'lastName', 'email', 'company', 'website', 'websiteConfirm', 'consent']);
    expect(block.querySelector('[name="firstName"]').autocomplete).to.equal('given-name');
    expect(block.querySelector('[name="lastName"]').autocomplete).to.equal('family-name');
    expect(block.textContent).not.to.include('Where did you hear about this report?');
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
    ['firstName', 'lastName', 'email', 'company', 'website'].forEach((name) => {
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
    expect(form.textContent).not.to.include('where you heard about this report');
    expect(fetchStub.called).to.equal(false);
  });

  it('rejects whitespace-only names before requesting verification', () => {
    const block = makeBlock();
    init(block);
    ['firstName', 'lastName'].forEach((name) => {
      block.querySelector(`[name="${name}"]`).value = '   ';
    });
    block.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    ['firstName', 'lastName'].forEach((name) => {
      expect(block.querySelector(`[name="${name}"]`).getAttribute('aria-invalid')).to.equal('true');
    });
    expect(fetchStub.called).to.equal(false);
  });

  it('blocks internal emails before verification and clears the error for a customer email', async () => {
    const block = makeBlock();
    init(block);
    await tick();
    const form = block.querySelector('form');
    Object.entries({
      firstName: 'Jordan',
      lastName: 'Lee',
      company: 'Northstar',
      website: 'northstar.com',
    }).forEach(([name, value]) => { form.elements[name].value = value; });
    form.elements.consent.checked = true;
    const execute = sinon.spy(window.turnstile, 'execute');
    const { email } = form.elements;
    [
      'employee@adobe.com',
      ' Employee+report@SEMRUSH.COM ',
      'employee@team.adobe.com',
      'employee@team.eu.semrush.com',
    ].forEach((value) => {
      email.value = value;
      email.dispatchEvent(new Event('blur'));
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(email.getAttribute('aria-invalid')).to.equal('true');
      expect(document.getElementById(`${email.id}-error`).textContent)
        .to.equal('Adobe and Semrush employees should use the internal platform. This form is only for tracking report requests directly from customers.');
      expect(block.querySelector('.rrf-error-summary').hidden).to.equal(false);
    });
    expect(execute.called).to.equal(false);
    expect(fetchStub.called).to.equal(false);

    email.value = 'customer@notadobe.com';
    email.dispatchEvent(new Event('input'));
    expect(email.getAttribute('aria-invalid')).to.equal('false');
    expect(document.getElementById(`${email.id}-error`).textContent).to.equal('');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(fetchStub.calledOnce).to.equal(true);
    expect(block.querySelector('.rrf-success')).to.exist;
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
    window.history.replaceState(null, '', `/request-report?campaign=${PUBLIC_CAMPAIGN_ID}`);
    const block = makeBlock();
    init(block);
    await tick();
    window.history.replaceState(null, '', '/request-report');
    const form = block.querySelector('form');
    form.elements.firstName.value = ' Jordan ';
    form.elements.lastName.value = ' Lee ';
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
      publicCampaignId: PUBLIC_CAMPAIGN_ID,
      consent: true,
      turnstileToken: 'turnstile-token',
    });
    expect(JSON.parse(options.body)).to.not.have.property('requestSource');
    expect(JSON.parse(options.body)).to.not.have.property('jobTitle');
    expect(JSON.parse(options.body)).to.not.have.property('primaryMarket');
    expect(block.querySelector('.rrf-success').textContent).to.include("We'll take it from here.");
    expect(block.querySelector('.rrf-success').textContent).to.not.include('internal-only-id');
    expect(block.querySelector('.rrf-shell > h1')).to.equal(null);
    expect(block.querySelector('.rrf-shell').children).to.have.length(1);
  });

  [
    ['', 'direct visit'],
    ['?campaign=not-a-uuid', 'malformed UUID'],
    [`?campaign=${PUBLIC_CAMPAIGN_ID.toUpperCase()}`, 'uppercase UUID'],
    [`?campaign=${PUBLIC_CAMPAIGN_ID}%0A`, 'UUID with trailing whitespace'],
    [`?campaign=${PUBLIC_CAMPAIGN_ID}&campaign=`, 'repeated parameter'],
  ].forEach(([query, label]) => {
    it(`omits attribution for a ${label}`, async () => {
      window.history.replaceState(null, '', `/request-report${query}`);
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
      }).forEach(([name, value]) => { form.elements[name].value = value; });
      form.elements.consent.checked = true;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      expect(fetchStub.calledOnce).to.equal(true);
      expect(JSON.parse(fetchStub.firstCall.args[1].body)).not.to.have.property('publicCampaignId');
    });
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
    }).forEach(([name, value]) => { form.elements[name].value = value; });
    form.elements.consent.checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(block.querySelector('.rrf-submit-status').textContent).to.equal('Please try again.');
    expect(form.elements.email.value).to.equal('jordan@example.com');
    expect(form.querySelector('button').disabled).to.equal(false);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(fetchStub.callCount).to.equal(2);
    expect(fetchStub.firstCall.args[1].headers['Idempotency-Key'])
      .to.equal(fetchStub.secondCall.args[1].headers['Idempotency-Key']);
    expect(block.querySelector('.rrf-success')).to.exist;
  });

  it('shows test mode and confirms only an explicit receipt from the isolated endpoint', async () => {
    window.history.replaceState(null, '', `/request-report?stage=${STAGE_TOKEN}&campaign=${PUBLIC_CAMPAIGN_ID}`);
    fetchStub.resolves(Response.json({ testOnly: true }));
    const block = makeBlock();
    const completion = sinon.spy();
    document.addEventListener('booth-request-complete', completion);
    try {
      init(block);
      expect(block.textContent).to.include('Test mode');
      expect(block.textContent).to.include('Use sample details. This form won’t save your information or request a report.');
      const form = block.querySelector('form');
      expect(form.querySelector('button').textContent).to.equal('Submit test request');
      submitSample(form);
      await settle();
      expect(fetchStub.calledOnce).to.equal(true);
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal(TEST_URL);
      expect(options.redirect).to.equal('error');
      const payload = JSON.parse(options.body);
      expect(payload.stageToken).to.equal(STAGE_TOKEN);
      expect(payload).not.to.have.property('publicCampaignId');
      expect(block.textContent).to.include('Test complete. No report was requested.');
      expect(block.textContent).to.include('Your information was not saved, and nothing was added to the staff request list.');
      expect(document.activeElement).to.equal(block.querySelector('.rrf-success'));
      expect(completion.called).to.equal(false);
    } finally {
      document.removeEventListener('booth-request-complete', completion);
    }
  });

  [
    '?stage', '?stage=', '?stage=malformed',
    `?stage=${STAGE_TOKEN}%0A`, `?stage=${STAGE_TOKEN}&stage=${STAGE_TOKEN}`,
    `?stage=${STAGE_TOKEN}&stage=`,
  ].forEach((query) => {
    it(`does not render a live form when Stage parameters are invalid (${query.length} characters)`, () => {
      window.history.replaceState(null, '', `/request-report${query}`);
      const block = makeBlock();
      init(block);
      expect(block.textContent).to.include('This test link doesn’t work.');
      expect(block.textContent).to.include('Open the campaign in Stage and copy its test request link again. No report was requested.');
      expect(block.querySelector('form')).to.equal(null);
      expect(fetchStub.called).to.equal(false);
    });
  });

  [new Response(null, { status: 503 }), Response.json({ requestId: 'live-shape' }), new Response(null, { status: 403 })]
    .forEach((response, i) => {
      it(`never falls back to live or shows success without a test receipt (${i + 1})`, async () => {
        window.history.replaceState(null, '', `/request-report?stage=${STAGE_TOKEN}`);
        fetchStub.resolves(response);
        const block = makeBlock();
        init(block);
        submitSample(block.querySelector('form'));
        await settle();
        expect(fetchStub.calledOnce).to.equal(true);
        expect(fetchStub.firstCall.args[0]).to.equal(TEST_URL);
        expect(block.querySelector('.rrf-success')).to.equal(null);
        if (response.status === 403) expect(block.textContent).to.include('This test link doesn’t work.');
        else expect(block.querySelector('.rrf-submit-status').textContent).not.to.equal('');
      });
    });
});
