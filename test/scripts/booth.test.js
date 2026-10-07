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
        </section>
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

  it('counts virtual-keyboard input and change as Entry activity without key or pointer events', async () => {
    const root = recoveryFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch').callsFake(async () => (
      { ok: true, json: async () => ({ state: 'entry' }) }
    ));
    mountBooth(root);
    await clock.tickAsync(110000);
    const email = root.getElementById('registration-email');
    email.value = 'still-typing@example.test';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    await clock.tickAsync(11000);
    expect(email.value).to.equal('still-typing@example.test');
    email.dispatchEvent(new Event('change', { bubbles: true }));
    await clock.tickAsync(110000);
    expect(email.value).to.equal('still-typing@example.test');
    expect(fetchStub.calledOnce).to.equal(true);
    await clock.tickAsync(10001);
    expect(email.value).to.equal('');
    expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/reset');
  });

  it('retains absolute expiry even when virtual-keyboard activity keeps renewing idle time', async () => {
    const root = recoveryFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch').callsFake(async (url) => (
      {
        ok: true,
        json: async () => (url.endsWith('/status')
          ? { state: 'picker', candidates: [], expiresAt: 180000 }
          : { state: 'entry' }),
      }
    ));
    mountBooth(root);
    await clock.tickAsync(110000);
    const email = root.getElementById('registration-email');
    email.value = 'active@example.test';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    await clock.tickAsync(50000);
    email.dispatchEvent(new Event('change', { bubbles: true }));
    await clock.tickAsync(20001);
    expect(email.value).to.equal('');
    expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/reset');
  });

  async function productionFixture() {
    const response = await fetch(new URL('../../booth.html', import.meta.url));
    const root = new DOMParser().parseFromString(await response.text(), 'text/html');
    sandbox.stub(window, 'addEventListener');
    return root;
  }

  it('offers explicit demo/request recovery only for a confirmed no-report lookup', async () => {
    const root = await productionFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onSecondCall().resolves({ ok: false, status: 404, json: async () => ({ code: 'no_report', error: 'No report' }) });
    mountBooth(root);
    await clock.tickAsync(0);
    root.getElementById('registration-email').value = 'no-report@example.test';
    root.getElementById('email-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await clock.tickAsync(0);
    expect(root.querySelector('[data-panel="unavailable"]').hidden).to.equal(false);
    expect(root.getElementById('registration-email').value).to.equal('');
    expect(root.querySelector('[data-panel="unavailable"] [data-show-demos]')).to.exist;
    expect(root.querySelector('[data-panel="unavailable"] [data-request-report]')).to.exist;
  });

  it('does not describe a lookup outage as a missing report', async () => {
    const root = await productionFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onSecondCall().resolves({ ok: false, status: 502, json: async () => ({ error: 'Lookup unavailable' }) });
    mountBooth(root);
    await clock.tickAsync(0);
    root.getElementById('email-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await clock.tickAsync(0);
    expect(root.querySelector('[data-panel="unavailable"]').hidden).to.equal(true);
    expect(root.getElementById('email-error').textContent).to.equal('Lookup unavailable');
  });

  it('clears attendee UI and server state before rendering safe industry choices', async () => {
    const root = await productionFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onSecondCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onThirdCall().resolves({
      ok: true,
      json: async () => ({ demos: [{ id: 'luma', industry: 'Retail / apparel', company: '<img src=x> Luma' }] }),
    });
    mountBooth(root);
    await clock.tickAsync(0);
    root.getElementById('registration-email').value = 'previous@example.com';
    root.querySelector('[data-show-demos]').click();
    await clock.tickAsync(0);
    expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/reset');
    expect(fetchStub.thirdCall.args[0]).to.equal('/auth/booth/demos');
    expect(root.getElementById('registration-email').value).to.equal('');
    expect(root.getElementById('demo-options').querySelector('img')).to.equal(null);
    expect(root.getElementById('demo-options').textContent).to.include('Retail / apparel');
    expect(root.querySelector('[data-panel="demos"]').hidden).to.equal(false);
  });

  it('hides attendee panels before scripts load and while Finish status is pending', async () => {
    const root = await productionFixture();
    const previousUrl = window.location.href;
    const panels = [...root.querySelectorAll('[data-panel]')];
    expect(panels.every((panel) => panel.hidden)).to.equal(true);
    expect(root.getElementById('booth-status').textContent).to.include('Checking this booth');
    window.history.replaceState(null, '', '/booth?step=finish');
    const clock = sandbox.useFakeTimers();
    let resolveStatus;
    const pending = new Promise((resolve) => { resolveStatus = resolve; });
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.withArgs('/auth/booth/status').returns(pending);
    fetchStub.withArgs('/accounts/e/example/insights/example-com/portal-landing/').callsFake(async () => new Response('<main></main>', { headers: { 'Content-Type': 'text/html' } }));
    try {
      mountBooth(root);
      await clock.tickAsync(5000);
      expect(panels.every((panel) => panel.hidden)).to.equal(true);
      expect(root.getElementById('booth-status').hidden).to.equal(false);
      expect(root.getElementById('stage').getAttribute('aria-busy')).to.equal('true');
      expect(fetchStub.callCount).to.equal(1);
      resolveStatus({
        ok: true,
        json: async () => ({
          state: 'report',
          selectedPath: '/accounts/e/example/insights/example-com/portal-landing/',
          expiresAt: Date.now() + 600000,
        }),
      });
      await clock.tickAsync(0);
      expect(root.querySelector('[data-panel="welcome"]').hidden).to.equal(true);
      expect(root.querySelector('[data-panel="finish"]').hidden).to.equal(false);
      expect(root.getElementById('stage').getAttribute('aria-busy')).to.equal('false');
      expect(root.getElementById('booth-status').hidden).to.equal(true);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

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
    fetchStub.withArgs('/accounts/e/example/insights/example-com/portal-landing/').callsFake(async () => new Response('<main></main>', { headers: { 'Content-Type': 'text/html' } }));
    fetchStub.withArgs('/auth/booth/send').resolves({ ok: true, json: async () => ({ sent: true }) });
    fetchStub.withArgs('/auth/booth/reset').resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    try {
      mountBooth(root);
      await clock.tickAsync(0);
      const finish = root.querySelector('[data-panel="finish"]');
      expect(finish.hidden).to.equal(false);
      expect(root.querySelector('.brand span').textContent).to.equal('Amplify your brand visibility');
      expect(root.getElementById('stage').dataset.brand).to.equal('semrush');
      expect(finish.querySelector('.finish-intro')).to.equal(null);
      expect(root.getElementById(finish.getAttribute('aria-labelledby')).textContent).to.equal('Email your report');
      expect(finish.textContent).not.to.include('Talk through your report here');
      expect(finish.querySelector('#send-privacy')).to.equal(null);
      expect(root.getElementById('send-report').hasAttribute('aria-describedby')).to.equal(false);
      expect(finish.querySelector('.finish-artwork')).to.equal(null);
      expect(finish.querySelector('#report-preview').compareDocumentPosition(root.getElementById('send-report'))).to.equal(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(root.querySelector('#request-contact, #contact-privacy, #contact-status')).to.equal(null);
      expect(root.querySelector('.finish-guidance').textContent).to.include('Ask the team about a follow-up conversation.');
      expect(fetchStub.callCount).to.equal(2);
      root.getElementById('send-report').click();
      await clock.tickAsync(0);
      expect(fetchStub.thirdCall.args[0]).to.equal('/auth/booth/send');
      expect(fetchStub.thirdCall.args[1].body).to.equal('{}');
      expect(root.getElementById('finish-status').textContent).to.include('was emailed');
      const reset = finish.querySelector('[data-reset]');
      expect(reset.textContent).to.equal('Finish and clear this screen');
      expect(reset.classList.contains('secondary')).to.equal(true);
      reset.click();
      await clock.tickAsync(0);
      expect(fetchStub.getCall(3).args[0]).to.equal('/auth/booth/reset');
      expect(root.querySelector('[data-panel="welcome"]').hidden).to.equal(false);
      expect(window.location.pathname + window.location.search).to.equal('/booth?heading=Amplify+your+brand+visibility&brand=semrush');
      expect(fetchStub.callCount).to.equal(4);
      expect(root.getElementById('report-preview').textContent).to.equal('');
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('preserves the search privacy notice but never treats follow-up guidance as consent', async () => {
    const root = await productionFixture();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/booth?step=finish');
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({
      ok: true,
      json: async () => ({ state: 'report', selectedPath: '/accounts/e/example/insights/example-com/portal-landing/', expiresAt: Date.now() + 600000 }),
    });
    fetchStub.withArgs('/accounts/e/example/insights/example-com/portal-landing/').callsFake(async () => new Response('<main></main>', { headers: { 'Content-Type': 'text/html' } }));
    try {
      expect(root.getElementById('search-privacy').textContent).to.include('90 days');
      expect(root.getElementById('search-privacy').textContent).to.include('does not request sales contact');
      expect(root.getElementById('search-privacy').querySelector('a').href).to.equal('https://www.adobe.com/privacy/policy.html');
      mountBooth(root);
      await clock.tickAsync(0);
      root.querySelector('.finish-guidance').click();
      await clock.tickAsync(0);
      expect(fetchStub.callCount).to.equal(2);
      expect(root.querySelector('.finish-guidance button, .finish-guidance a')).to.equal(null);
      expect(root.getElementById('send-report').disabled).to.equal(false);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('does not restore retired contact controls for historical contact requests or reporting delays', async () => {
    const root = await productionFixture();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/booth?step=finish');
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({
      ok: true,
      json: async () => ({ state: 'report', selectedPath: '/accounts/e/example/insights/example-com/portal-landing/', expiresAt: Date.now() + 600000, contactRequested: true, activityPending: true }),
    });
    fetchStub.withArgs('/accounts/e/example/insights/example-com/portal-landing/').callsFake(async () => new Response('<main></main>', { headers: { 'Content-Type': 'text/html' } }));
    try {
      mountBooth(root);
      await clock.tickAsync(0);
      expect(root.querySelector('#request-contact, #contact-status, #contact-privacy')).to.equal(null);
      expect(root.getElementById('finish-status').textContent).to.include('reporting is delayed');
      expect(fetchStub.callCount).to.equal(2);
      expect(root.getElementById('send-report').disabled).to.equal(false);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });
});
