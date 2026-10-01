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
    root.body.innerHTML = `<main id="stage">
      <p id="booth-status"></p><a id="staff-login" hidden></a>
      <button id="booth-retry" data-reset hidden>Retry and clear screen</button>
      <section data-panel="welcome"><form id="email-form">
        <input id="registration-email"><button>View my report</button>
      </form><p id="email-error"></p></section>
      <section data-panel="picker" hidden><div id="report-options"></div><p id="picker-status"></p></section>
      <section data-panel="finish" hidden><button id="send-report"></button><p id="finish-status"></p></section>
      <button id="motion-toggle"></button><span id="step-index"></span>
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
});
