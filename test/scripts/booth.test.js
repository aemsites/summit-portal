import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { boothRequest, mountBooth } from '../../scripts/booth.js';
import mountBoothReturn from '../../scripts/booth-report.js';

describe('booth runtime boundary', () => {
  let sandbox;
  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  it('uses same-origin no-store POST JSON, never puts an email in the URL', async () => {
    const stub = sandbox.stub(window, 'fetch').resolves(new Response('{"state":"picker"}'));
    await boothRequest('lookup', { email: 'visitor@example.com' });
    expect(stub.firstCall.args[0]).to.equal('/auth/booth/lookup');
    expect(stub.firstCall.args[1].credentials).to.equal('same-origin');
    expect(stub.firstCall.args[1].cache).to.equal('no-store');
    expect(stub.firstCall.args[1].body).to.equal('{"email":"visitor@example.com"}');
  });

  it('surfaces failed delivery instead of inventing success', async () => {
    sandbox.stub(window, 'fetch').resolves(new Response('{"error":"Delivery unavailable"}', { status: 502 }));
    let failure;
    try {
      await boothRequest('send', {});
    } catch (error) {
      failure = error;
    }
    expect(failure.message).to.equal('Delivery unavailable');
    expect(failure.status).to.equal(502);
  });

  it('does not mount Finish on ordinary reports or a different selected pathname', async () => {
    sandbox.stub(window, 'fetch').resolves(new Response(JSON.stringify({
      selectedPath: '/accounts/e/example/insights/example-com/portal-landing/',
      expiresAt: Date.now() + 10000,
    })));
    await mountBoothReturn();
    expect(document.getElementById('booth-return')).to.equal(null);
  });

  it('does not mount Finish without a staff-authorized server context', async () => {
    sandbox.stub(window, 'fetch').resolves(new Response('{}', { status: 401 }));
    await mountBoothReturn();
    expect(document.getElementById('booth-return')).to.equal(null);
  });

  function recoveryFixture() {
    const root = document.implementation.createHTMLDocument();
    root.body.innerHTML = `<main id="stage" data-notice-version="booth-privacy-v1">
      <p id="booth-status"></p><a id="staff-login" hidden></a>
      <button id="booth-retry" data-reset hidden>Retry and clear screen</button>
      <section data-panel="welcome"><form id="email-form">
        <input id="registration-email"><button>View my report</button>
      </form><p id="email-error"></p></section>
      <section data-panel="picker" hidden><div id="report-options"></div><p id="picker-status"></p></section>
      <section data-panel="finish" hidden><button id="send-report"></button><p id="finish-status"></p>
        <button id="request-contact"></button><p id="contact-status"></p></section>
      <button id="staff-exit"></button>
    </main>`;
    sandbox.stub(window, 'addEventListener');
    sandbox.stub(window.history, 'replaceState');
    return root;
  }

  it('recovers an initial status failure only after a confirmed retry/clear request', async () => {
    const root = recoveryFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().rejects(new TypeError('Load failed'));
    fetchStub.onSecondCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    mountBooth(root);
    await clock.tickAsync(0);
    expect(root.querySelector('#email-form button').disabled).to.equal(true);
    expect(root.getElementById('booth-retry').hidden).to.equal(false);
    root.getElementById('booth-retry').click();
    await clock.tickAsync(0);
    expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/reset');
    expect(fetchStub.secondCall.args[1].body).to.equal('{}');
    expect(root.querySelector('#email-form button').disabled).to.equal(false);
    expect(root.getElementById('booth-retry').hidden).to.equal(true);
  });

  it('keeps failed idle reset fail-closed but exposes a successful manual recovery', async () => {
    const root = recoveryFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onSecondCall().rejects(new TypeError('Load failed'));
    fetchStub.onThirdCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    mountBooth(root);
    await clock.tickAsync(0);
    root.getElementById('registration-email').value = 'visitor@example.com';
    await clock.tickAsync(120000);
    expect(root.getElementById('registration-email').value).to.equal('');
    expect(root.getElementById('booth-status').textContent).to.equal('Load failed');
    expect(root.querySelector('#email-form button').disabled).to.equal(true);
    expect(root.getElementById('booth-retry').hidden).to.equal(false);
    root.getElementById('booth-retry').click();
    await clock.tickAsync(0);
    expect(fetchStub.thirdCall.args[0]).to.equal('/auth/booth/reset');
    expect(root.querySelector('#email-form button').disabled).to.equal(false);
    expect(root.getElementById('booth-status').textContent).to.equal('');
  });

  async function productionFixture() {
    const response = await fetch(new URL('../../booth.html', import.meta.url));
    const root = new DOMParser().parseFromString(await response.text(), 'text/html');
    sandbox.stub(window, 'addEventListener');
    return root;
  }

  it('retains approved copy, accessible attribution and accurate business-email lookup without review chrome', async () => {
    const root = await productionFixture();
    expect(root.querySelector('.brand span').textContent).to.equal('Adobe Brand Visibility');
    expect(root.querySelector('.brand-icon').alt).to.equal('Adobe');
    expect(root.getElementById('welcome-heading').textContent).to.equal('Turn your brand content into an AI search advantage.');
    expect(root.querySelector('.hero-bottom p').textContent).to.equal('See where your brand appears in AI search.');
    expect(root.querySelector('.welcome-entry .lead').textContent).to.equal('Open your customized report.');
    expect(root.querySelector('label[for="registration-email"]').textContent).to.equal('Business email');
    expect(root.getElementById('email-help').textContent).to.include('This is not a sign-in.');
    expect(root.querySelector('.review, #motion-toggle, .signal-field, #step-index')).to.equal(null);
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch').resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    expect(() => mountBooth(root)).not.to.throw();
    await clock.tickAsync(0);
    expect(root.querySelector('#email-form button').disabled).to.equal(false);
    expect(fetchStub.calledOnce).to.equal(true);
  });

  it('keeps customized picker lookup on business email without dispatching or generating reports', async () => {
    const root = await productionFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onSecondCall().resolves({
      ok: true,
      json: async () => ({
        state: 'picker',
        candidates: [{ label: 'Company website', path: '/accounts/e/example/insights/example-com/portal-landing/' }],
      }),
    });
    mountBooth(root);
    await clock.tickAsync(0);
    root.getElementById('registration-email').value = 'visitor@example.com';
    root.getElementById('email-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await clock.tickAsync(0);
    expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/lookup');
    expect(JSON.parse(fetchStub.secondCall.args[1].body)).to.deep.equal({ email: 'visitor@example.com', noticeVersion: 'booth-privacy-v1' });
    expect(root.getElementById('registration-email').value).to.equal('');
    expect(root.querySelector('[data-panel="picker"]').hidden).to.equal(false);
    expect(root.getElementById('report-options').textContent).to.equal('Company website');
    expect(fetchStub.callCount).to.equal(2);
  });

  it('keeps Finish reset-only and never infers contact opt-in from Email my report', async () => {
    const root = await productionFixture();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/booth?step=finish&heading=Amplify+your+brand+visibility&brand=semrush');
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({
      ok: true,
      json: async () => ({
        state: 'report',
        selectedPath: '/accounts/e/example/insights/example-com/portal-landing/',
        expiresAt: Date.now() + 600000,
      }),
    });
    fetchStub.onSecondCall().resolves({ ok: true, json: async () => ({ sent: true }) });
    fetchStub.onThirdCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    try {
      mountBooth(root);
      await clock.tickAsync(0);
      const finish = root.querySelector('[data-panel="finish"]');
      expect(finish.hidden).to.equal(false);
      expect(root.querySelector('.brand span').textContent).to.equal('Amplify your brand visibility');
      expect(root.getElementById('stage').dataset.brand).to.equal('semrush');
      expect(finish.querySelector('.finish-intro')).to.equal(null);
      expect(root.getElementById(finish.getAttribute('aria-labelledby')).textContent).to.equal('Your report');
      expect(root.getElementById('request-contact').textContent).to.equal('Please contact me');
      expect(root.getElementById('contact-privacy').textContent).to.include('contact you by email about this report');
      expect(fetchStub.calledOnce).to.equal(true);
      root.getElementById('send-report').click();
      await clock.tickAsync(0);
      expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/send');
      expect(fetchStub.secondCall.args[1].body).to.equal('{}');
      expect(root.getElementById('finish-status').textContent).to.include('was emailed');
      const reset = finish.querySelector('[data-reset]');
      expect(reset.textContent).to.equal('Finish');
      expect(reset.classList.contains('secondary')).to.equal(true);
      reset.click();
      await clock.tickAsync(0);
      expect(fetchStub.thirdCall.args[0]).to.equal('/auth/booth/reset');
      expect(root.querySelector('[data-panel="welcome"]').hidden).to.equal(false);
      expect(window.location.pathname + window.location.search).to.equal('/booth?heading=Amplify+your+brand+visibility&brand=semrush');
      expect(fetchStub.callCount).to.equal(3);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('places compact privacy notices at search and both Finish decisions, with independent explicit contact consent', async () => {
    const root = await productionFixture();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/booth?step=finish');
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({
      ok: true,
      json: async () => ({ state: 'report', selectedPath: '/accounts/e/example/insights/example-com/portal-landing/', expiresAt: Date.now() + 600000 }),
    });
    fetchStub.onSecondCall().resolves({ ok: true, json: async () => ({ contactRequested: true }) });
    try {
      expect(root.getElementById('search-privacy').textContent).to.include('90 days');
      expect(root.getElementById('search-privacy').textContent).to.include('does not request sales contact');
      expect(root.getElementById('send-privacy').textContent).to.include('not a request for sales contact');
      ['search-privacy', 'contact-privacy'].forEach((id) => {
        expect(root.getElementById(id).querySelector('a').href).to.equal('https://www.adobe.com/privacy/policy.html');
      });
      mountBooth(root);
      await clock.tickAsync(0);
      root.getElementById('request-contact').click();
      await clock.tickAsync(0);
      expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/contact');
      expect(JSON.parse(fetchStub.secondCall.args[1].body)).to.deep.equal({ consent: true, noticeVersion: 'booth-privacy-v1' });
      expect(root.getElementById('contact-status').textContent).to.include('Your request is recorded');
      expect(root.getElementById('request-contact').disabled).to.equal(true);
      expect(root.getElementById('send-report').disabled).to.equal(false);
      root.getElementById('request-contact').click();
      expect(fetchStub.callCount).to.equal(2);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('keeps a confirmed contact request disabled when export reporting is delayed', async () => {
    const root = await productionFixture();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/booth?step=finish');
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({
      ok: true,
      json: async () => ({ state: 'report', selectedPath: '/accounts/e/example/insights/example-com/portal-landing/', expiresAt: Date.now() + 600000 }),
    });
    fetchStub.onSecondCall().resolves({
      ok: false,
      status: 503,
      json: async () => ({
        error: 'Your contact request is recorded. Activity reporting is delayed. The booth team can help.',
        contactRequested: true,
        activityPending: true,
      }),
    });
    try {
      mountBooth(root);
      await clock.tickAsync(0);
      root.getElementById('request-contact').click();
      await clock.tickAsync(0);
      expect(root.getElementById('contact-status').textContent).to.include('recorded');
      expect(root.getElementById('contact-status').textContent).to.include('reporting is delayed');
      expect(root.getElementById('request-contact').disabled).to.equal(true);
      expect(root.getElementById('send-report').disabled).to.equal(false);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });
});
