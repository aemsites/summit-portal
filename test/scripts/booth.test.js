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

  ['fetch', 'body'].forEach((phase) => {
    it(`bounds a stalled ${phase} for every Entry API operation`, async () => {
      const clock = sandbox.useFakeTimers();
      const pending = new Promise(() => {});
      const fetchStub = sandbox.stub(window, 'fetch').returns(phase === 'fetch'
        ? pending : Promise.resolve({ ok: true, json: () => pending }));
      const actions = ['status', 'lookup', 'demo-picker', 'demos', 'demo', 'select', 'send', 'picker', 'reset', 'exit', 'activity'];
      const failures = actions.map((action) => boothRequest(action, {}).catch((error) => error));
      await clock.tickAsync(10001);
      const errors = await Promise.all(failures);
      errors.forEach((error) => {
        expect(error.code).to.equal('timeout');
        expect(error.message).to.include('timed out');
      });
      expect(errors[actions.indexOf('send')].message).to.include('could not be confirmed');
      expect(fetchStub.getCalls().every((call) => call.args[1].signal.aborted)).to.equal(true);
      expect(clock.countTimers()).to.equal(0);
    });
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

  async function productionFixture() {
    const response = await fetch(new URL('../../booth.html', import.meta.url));
    const root = new DOMParser().parseFromString(await response.text(), 'text/html');
    sandbox.stub(window, 'addEventListener');
    return root;
  }

  it('uses the industry return action for the report picker', async () => {
    const root = await productionFixture();
    const back = root.querySelector('[data-panel="picker"] [data-reset]');
    expect(back.classList.contains('booth-alternative')).to.equal(true);
    expect(back.textContent).to.equal('Back to email lookup');
    expect(back.closest('.recovery-actions')).not.to.equal(null);
  });

  it('shows opening feedback immediately and restores the picker after failed selection', async () => {
    const root = await productionFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({
      ok: true,
      json: async () => ({
        state: 'picker',
        candidates: [{ label: 'Example report', path: '/accounts/example/' }],
      }),
    });
    let rejectSelection;
    fetchStub.onSecondCall().returns(new Promise((resolve, reject) => {
      rejectSelection = reject;
    }));
    mountBooth(root);
    await clock.tickAsync(0);
    const button = root.querySelector('#report-options button');
    let focusedWhileDisabled;
    sandbox.stub(button, 'focus').callsFake(() => { focusedWhileDisabled = button.disabled; });
    button.click();
    expect(root.getElementById('booth-loading').hidden).to.equal(false);
    expect(root.getElementById('stage').inert).to.equal(true);
    expect(root.getElementById('booth-loading').textContent).to.include('Opening your report');
    rejectSelection(new Error('Selection unavailable'));
    await clock.tickAsync(0);
    expect(root.getElementById('booth-loading').hidden).to.equal(true);
    expect(root.getElementById('stage').inert).to.equal(false);
    expect(button.disabled).to.equal(false);
    expect(focusedWhileDisabled).to.equal(false);
    expect(root.getElementById('picker-status').textContent).to.equal('Selection unavailable');
  });

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
    await clock.tickAsync(900000);
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

  it('scrubs a stalled lookup, shows recovery, and serializes idle clear behind its bounded lifetime', async () => {
    const root = recoveryFixture();
    const clock = sandbox.useFakeTimers();
    let releaseLookup;
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onSecondCall().returns(new Promise((resolve) => { releaseLookup = resolve; }));
    fetchStub.onThirdCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    mountBooth(root);
    await clock.tickAsync(899000);
    root.getElementById('registration-email').value = 'visitor@example.test';
    root.getElementById('email-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await clock.tickAsync(1001);
    expect(root.getElementById('registration-email').value).to.equal('');
    expect(root.getElementById('booth-status').textContent).to.include('Clearing');
    expect(fetchStub.callCount).to.equal(2);
    await clock.tickAsync(9000);
    expect(fetchStub.thirdCall.args[0]).to.equal('/auth/booth/reset');
    expect(root.querySelector('#email-form button').disabled).to.equal(false);
    releaseLookup({ ok: true, json: async () => ({ state: 'picker', candidates: [{ label: 'Stale visitor' }] }) });
    await clock.tickAsync(0);
    expect(root.getElementById('report-options').textContent).to.equal('');
  });

  it('requires a confirmed reset after a lookup timeout rather than enabling another visitor', async () => {
    const root = recoveryFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onSecondCall().returns(new Promise(() => {}));
    fetchStub.onThirdCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    mountBooth(root);
    await clock.tickAsync(0);
    root.getElementById('registration-email').value = 'visitor@example.test';
    root.getElementById('email-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await clock.tickAsync(10001);
    expect(root.getElementById('registration-email').value).to.equal('');
    expect(root.getElementById('booth-status').textContent).to.include('timed out');
    expect(root.getElementById('booth-retry').hidden).to.equal(false);
    expect(root.querySelector('#email-form button').disabled).to.equal(true);
    root.getElementById('booth-retry').click();
    await clock.tickAsync(0);
    expect(fetchStub.thirdCall.args[0]).to.equal('/auth/booth/reset');
    expect(root.querySelector('#email-form button').disabled).to.equal(false);
  });

  ['status', 'demo-picker', 'select', 'demos', 'demo', 'picker', 'exit'].forEach((action) => {
    it(`exposes fail-closed recovery for stalled ${action} without replaying the operation`, async () => {
      const root = await productionFixture();
      root.getElementById('report-preview').remove();
      const previousUrl = window.location.href;
      window.history.replaceState(null, '', action === 'picker' ? '/booth?step=finish' : '/booth');
      const clock = sandbox.useFakeTimers();
      const fetchStub = sandbox.stub(window, 'fetch').callsFake(async (url) => {
        if (url.endsWith(`/${action}`)) return new Promise(() => {});
        if (url.endsWith('/status')) {
          return {
            ok: true,
            json: async () => ({
              state: action === 'picker' ? 'report' : 'picker',
              selectedPath: action === 'picker' ? '/selected/' : undefined,
              canChooseAnother: true,
              candidates: [{ label: 'Selected company', path: '/selected/' }],
              expiresAt: Date.now() + 600000,
            }),
          };
        }
        if (url.endsWith('/demo-picker')) {
          return { ok: true, json: async () => ({ state: 'demos', expiresAt: Date.now() + 600000, unmatched: true }) };
        }
        return {
          ok: true,
          json: async () => (
            url.endsWith('/demos') ? { demos: [{ id: 'luma', industry: 'Retail', company: 'Luma' }] } : { state: 'entry' }
          ),
        };
      });
      try {
        mountBooth(root);
        await clock.tickAsync(0);
        if (action === 'select') root.querySelector('#report-options button').click();
        if (['demo-picker', 'demos', 'demo'].includes(action)) {
          root.querySelector('[data-show-demos]').click();
          await clock.tickAsync(0);
          if (action === 'demo') root.querySelector('#demo-options button').click();
        }
        if (action === 'picker') root.getElementById('choose-another-report').click();
        if (action === 'exit') root.getElementById('staff-exit').click();
        await clock.tickAsync(10001);
        expect(root.getElementById('booth-status').textContent).to.include('timed out');
        expect(root.getElementById('booth-retry').hidden).to.equal(false);
        expect(root.querySelector('#email-form button').disabled).to.equal(true);
        expect(root.querySelector('[data-panel="finish"]').hidden).to.equal(true);
        expect(root.getElementById('report-options').children).to.have.length(0);
        expect(root.getElementById('demo-options').children).to.have.length(0);
        expect(fetchStub.getCalls().filter((call) => call.args[0].endsWith(`/${action}`))).to.have.length(1);
        root.getElementById('booth-retry').click();
        await clock.tickAsync(0);
        expect(root.querySelector('#email-form button').disabled).to.equal(false);
        expect(fetchStub.lastCall.args[0]).to.equal('/auth/booth/reset');
      } finally {
        window.history.replaceState(null, '', previousUrl);
      }
    });
  });

  it('shows bounded recovery for a stalled reset and keeps controls blocked until the retry is confirmed', async () => {
    const root = recoveryFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onSecondCall().resolves({ ok: true, json: () => new Promise(() => {}) });
    fetchStub.onThirdCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    mountBooth(root);
    await clock.tickAsync(900000);
    expect(root.getElementById('booth-status').textContent).to.include('Clearing');
    await clock.tickAsync(10001);
    expect(root.querySelector('#email-form button').disabled).to.equal(true);
    expect(root.getElementById('booth-retry').hidden).to.equal(false);
    expect(root.getElementById('booth-status').textContent).to.include('timed out');
    root.getElementById('booth-retry').click();
    await clock.tickAsync(0);
    expect(root.querySelector('#email-form button').disabled).to.equal(false);
  });

  it('does not continue loading demos after their chooser request was superseded by reset', async () => {
    const root = await productionFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    let clearDemos;
    fetchStub.onSecondCall().returns(new Promise((resolve) => { clearDemos = resolve; }));
    fetchStub.onThirdCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    mountBooth(root);
    await clock.tickAsync(119000);
    root.querySelector('[data-show-demos]').click();
    root.querySelector('[data-reset]').click();
    await clock.tickAsync(1001);
    clearDemos({ ok: true, json: async () => ({ state: 'demos', unmatched: true, expiresAt: Date.now() + 600000 }) });
    await clock.tickAsync(0);
    expect(fetchStub.getCalls().map((call) => call.args[0])).to.deep.equal([
      '/auth/booth/status', '/auth/booth/demo-picker', '/auth/booth/reset',
    ]);
    expect(root.querySelector('[data-panel="welcome"]').hidden).to.equal(false);
  });

  it('treats a stalled send as uncertain without another send or success, even on a late response', async () => {
    const root = await productionFixture();
    root.getElementById('report-preview').remove();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/booth?step=finish');
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({
      ok: true,
      json: async () => ({ state: 'report', selectedPath: '/selected/', expiresAt: Date.now() + 600000 }),
    });
    let lateSend;
    fetchStub.onSecondCall().returns(new Promise((resolve) => { lateSend = resolve; }));
    try {
      mountBooth(root);
      await clock.tickAsync(0);
      root.getElementById('send-report').click();
      await clock.tickAsync(10001);
      expect(root.querySelector('[data-panel="finish"]').hidden).to.equal(true);
      expect(root.getElementById('booth-status').textContent).to.include('Delivery could not be confirmed');
      expect(root.getElementById('booth-retry').hidden).to.equal(false);
      root.getElementById('send-report').click();
      lateSend({ ok: true, json: async () => ({ sent: true }) });
      await clock.tickAsync(0);
      expect(fetchStub.callCount).to.equal(2);
      expect(root.getElementById('finish-status').textContent).to.equal('');
      expect(root.querySelector('#email-form button').disabled).to.equal(true);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('counts virtual-keyboard input and change as Entry activity without key or pointer events', async () => {
    const root = recoveryFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch').callsFake(async () => (
      { ok: true, json: async () => ({ state: 'entry' }) }
    ));
    mountBooth(root);
    await clock.tickAsync(890000);
    const email = root.getElementById('registration-email');
    email.value = 'still-typing@example.test';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    await clock.tickAsync(11000);
    expect(email.value).to.equal('still-typing@example.test');
    email.dispatchEvent(new Event('change', { bubbles: true }));
    await clock.tickAsync(890000);
    expect(email.value).to.equal('still-typing@example.test');
    expect(fetchStub.calledOnce).to.equal(true);
    await clock.tickAsync(10001);
    expect(email.value).to.equal('');
    expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/reset');
  });

  it('renews server expiry for input and change instead of cutting an active visitor off at the original deadline', async () => {
    const root = recoveryFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch').callsFake(async (url) => (
      {
        ok: true,
        json: async () => {
          if (url.endsWith('/status')) return { state: 'picker', candidates: [], expiresAt: 900000 };
          if (url.endsWith('/activity')) return { expiresAt: Date.now() + 900000 };
          return { state: 'entry' };
        },
      }
    ));
    mountBooth(root);
    await clock.tickAsync(890000);
    const email = root.getElementById('registration-email');
    email.value = 'active@example.test';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    await clock.tickAsync(50000);
    expect(email.value).to.equal('active@example.test');
    email.dispatchEvent(new Event('change', { bubbles: true }));
    await clock.tickAsync(899999);
    expect(email.value).to.equal('active@example.test');
    await clock.tickAsync(1);
    expect(email.value).to.equal('');
    expect(fetchStub.getCalls().map((call) => call.args[0])).to.deep.equal([
      '/auth/booth/status', '/auth/booth/activity', '/auth/booth/activity', '/auth/booth/reset',
    ]);
  });

  function jsonReply(body, status = 200) {
    return { ok: status < 400, status, json: async () => body };
  }

  it('waits for renewal before clearing even when a concurrent send fails first', async () => {
    const root = await productionFixture();
    root.getElementById('report-preview').remove();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/booth?step=finish');
    const clock = sandbox.useFakeTimers();
    let completeRenewal;
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.withArgs('/auth/booth/status').resolves(jsonReply({ state: 'report', selectedPath: '/selected/', expiresAt: 900000 }));
    fetchStub.withArgs('/auth/booth/activity').returns(new Promise((resolve) => {
      completeRenewal = resolve;
    }));
    fetchStub.withArgs('/auth/booth/send').resolves(jsonReply({ error: 'Delivery unavailable' }, 502));
    fetchStub.withArgs('/auth/booth/reset').resolves(jsonReply({ state: 'entry' }));
    try {
      mountBooth(root);
      await clock.tickAsync(0);
      root.dispatchEvent(new Event('pointerdown'));
      await clock.tickAsync(0);
      root.getElementById('send-report').click();
      await clock.tickAsync(0);
      expect(root.getElementById('finish-status').textContent).to.equal('Delivery unavailable');
      root.querySelector('[data-panel="finish"] [data-reset]').click();
      await clock.tickAsync(0);
      expect(fetchStub.getCalls().map((call) => call.args[0])).to.deep.equal([
        '/auth/booth/status', '/auth/booth/activity', '/auth/booth/send',
      ]);
      expect(root.getElementById('booth-status').textContent).to.include('Clearing');
      completeRenewal(jsonReply({ expiresAt: 900000 }));
      await clock.tickAsync(0);
      expect(fetchStub.lastCall.args[0]).to.equal('/auth/booth/reset');
      expect(root.querySelector('#email-form button').disabled).to.equal(false);
      expect(clock.countTimers()).to.equal(0);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('renews the no-report screen from its confirmed server expiry until fifteen minutes of inactivity', async () => {
    const root = await productionFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch').callsFake(async (url, options) => {
      if (url.endsWith('/lookup')) return jsonReply({ code: 'no_report', error: 'No report', expiresAt: 900000 }, 404);
      if (url.endsWith('/activity')) {
        return jsonReply({ expiresAt: Date.now() + 900000 - JSON.parse(options.body).idleMs });
      }
      return jsonReply({ state: 'entry' });
    });
    mountBooth(root);
    await clock.tickAsync(0);
    root.getElementById('registration-email').value = 'no-report@example.test';
    root.getElementById('email-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await clock.tickAsync(840000);
    root.dispatchEvent(new Event('pointerdown'));
    await clock.tickAsync(0);
    expect(fetchStub.lastCall.args[0]).to.equal('/auth/booth/activity');
    await clock.tickAsync(899999);
    expect(root.querySelector('[data-panel="unavailable"]').hidden).to.equal(false);
    await clock.tickAsync(1);
    expect(fetchStub.lastCall.args[0]).to.equal('/auth/booth/reset');
    expect(root.querySelector('[data-panel="welcome"]').hidden).to.equal(false);
  });

  it('offers explicit demo recovery without a request form for a confirmed no-report lookup', async () => {
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
    expect(root.querySelector('[data-request-report]')).to.equal(null);
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
    fetchStub.onSecondCall().resolves({ ok: true, json: async () => ({ state: 'demos', unmatched: true }) });
    fetchStub.onThirdCall().resolves({
      ok: true,
      json: async () => ({ demos: [{ id: 'luma', industry: 'Retail / apparel', company: '<img src=x> Luma' }] }),
    });
    mountBooth(root);
    await clock.tickAsync(0);
    root.getElementById('registration-email').value = 'previous@example.com';
    root.querySelector('[data-show-demos]').click();
    await clock.tickAsync(0);
    expect(fetchStub.secondCall.args[0]).to.equal('/auth/booth/demo-picker');
    expect(fetchStub.thirdCall.args[0]).to.equal('/auth/booth/demos');
    expect(root.getElementById('registration-email').value).to.equal('');
    const icon = root.getElementById('demo-options').querySelector('img');
    expect(icon.getAttribute('src')).to.equal('/img/booth/industry-luma.svg');
    expect(icon.alt).to.equal('');
    expect(icon.width).to.equal(64);
    expect(icon.height).to.equal(64);
    expect(root.getElementById('demo-options').querySelectorAll('img')).to.have.length(1);
    expect(root.getElementById('demo-options').querySelector('.demo-copy').textContent).to.include('<img src=x> Luma');
    expect(root.getElementById('demo-options').textContent).to.include('Retail / apparel');
    expect(root.querySelector('[data-panel="demos"]').hidden).to.equal(false);
    expect(root.getElementById('demo-recovery-copy').hidden).to.equal(false);
    expect(root.getElementById('demo-intro').hidden).to.equal(true);
    expect(root.getElementById('stage').dataset.screen).to.equal('demos');
    expect(root.getElementById('staff-exit').textContent).to.equal('Staff: Sign out and leave booth mode');
  });

  it('keeps staff shortcut guidance truthful and restores the Entry footer after clearing', async () => {
    const root = await productionFixture();
    const clock = sandbox.useFakeTimers();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    fetchStub.onSecondCall().resolves({ ok: true, json: async () => ({ state: 'demos', unmatched: false }) });
    fetchStub.onThirdCall().resolves({
      ok: true,
      json: async () => ({ demos: [{ id: 'carvelo', industry: 'Automotive', company: 'Carvelo' }] }),
    });
    fetchStub.onCall(3).resolves({ ok: true, json: async () => ({ state: 'entry' }) });
    mountBooth(root);
    await clock.tickAsync(0);
    root.querySelector('[data-show-demos]').click();
    await clock.tickAsync(0);
    expect(root.getElementById('demo-intro').hidden).to.equal(false);
    expect(root.getElementById('demo-recovery-copy').hidden).to.equal(true);
    expect(root.getElementById('demo-options').querySelector('img').getAttribute('src')).to.equal('/img/booth/industry-carvelo.svg');
    root.querySelector('[data-panel="demos"] [data-reset]').click();
    await clock.tickAsync(0);
    expect(root.getElementById('stage').dataset.screen).to.equal('welcome');
    expect(root.getElementById('staff-exit').textContent).to.equal('Staff: sign out this device');
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
    expect(root.querySelector('.brand span').textContent).to.equal('Amplify your brand visibility');
    expect(root.querySelector('.brand-icon').alt).to.equal('Adobe');
    expect(root.getElementById('welcome-heading').textContent).to.equal('Turn your brand content into an AI search advantage.');
    expect(root.querySelector('.hero-bottom p').textContent).to.equal('See where your brand appears in AI search.');
    expect(root.querySelector('.welcome-entry .lead').textContent).to.equal('Open your customized report.');
    expect(root.querySelector('label[for="registration-email"]').textContent).to.equal('Registration email');
    expect(root.getElementById('email-help').textContent).to.equal('Use the same address you used for this event.');
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
      expect(root.querySelector('.finish-guidance, .finish-step')).to.equal(null);
      expect(root.querySelector('.booth-progress [aria-current]').textContent).to.equal('Save and share');
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
      root.querySelector('.booth-progress').click();
      await clock.tickAsync(0);
      expect(fetchStub.callCount).to.equal(2);
      expect(root.querySelector('.finish-guidance')).to.equal(null);
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

  it('returns from Finish to the authorized picker without a new email lookup or delivery', async () => {
    const root = await productionFixture();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/booth?step=finish&brand=semrush');
    const clock = sandbox.useFakeTimers();
    const path = '/accounts/e/example/insights/example-com/portal-landing/';
    const expiresAt = Date.now() + 600000;
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.withArgs('/auth/booth/status').resolves(jsonReply({ state: 'report', selectedPath: path, expiresAt, canChooseAnother: true, sent: true }));
    fetchStub.withArgs(path).resolves(new Response('<main></main>', { headers: { 'Content-Type': 'text/html' } }));
    let completePicker;
    fetchStub.withArgs('/auth/booth/picker').returns(new Promise((resolve) => { completePicker = resolve; }));
    try {
      mountBooth(root);
      await clock.tickAsync(0);
      const choose = root.getElementById('choose-another-report');
      expect(choose.hidden).to.equal(false);
      expect(root.getElementById('send-report').disabled).to.equal(true);
      root.getElementById('report-preview').textContent = 'Previous company report preview';
      choose.click();
      choose.click();
      await clock.tickAsync(0);
      expect(root.querySelector('[data-panel="finish"]').hidden).to.equal(true);
      expect(root.getElementById('report-preview').textContent).to.equal('');
      const pickerCalls = fetchStub.getCalls().filter((call) => call.args[0] === '/auth/booth/picker');
      expect(pickerCalls).to.have.length(1);
      expect(pickerCalls[0].args[1].body).to.equal('{}');
      completePicker(jsonReply({
        state: 'picker',
        expiresAt,
        candidates: [{ path, label: 'Example.com' }, { path: '/authorized-other/', label: '<img src=x> Example.org' }],
      }));
      await clock.tickAsync(0);
      expect(root.querySelector('[data-panel="picker"]').hidden).to.equal(false);
      expect(root.getElementById('report-options').children).to.have.length(2);
      expect(root.getElementById('report-options').querySelector('img')).to.equal(null);
      expect(root.getElementById('registration-email').value).to.equal('');
      expect(window.location.pathname + window.location.search).to.equal('/booth?step=picker&brand=semrush');
      expect(fetchStub.getCalls().some((call) => /lookup|send/.test(call.args[0]))).to.equal(false);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('keeps Finish hidden after failed switching until confirmed attendee clearing', async () => {
    const root = await productionFixture();
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '/booth?step=finish');
    const clock = sandbox.useFakeTimers();
    const path = '/accounts/e/example/insights/example-com/portal-landing/';
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.withArgs('/auth/booth/status').resolves(jsonReply({ state: 'report', selectedPath: path, expiresAt: Date.now() + 600000, canChooseAnother: true }));
    fetchStub.withArgs(path).resolves(new Response('<main></main>', { headers: { 'Content-Type': 'text/html' } }));
    fetchStub.withArgs('/auth/booth/picker').resolves(jsonReply({ error: 'Permission check unavailable' }, 503));
    fetchStub.withArgs('/auth/booth/reset').resolves(jsonReply({ state: 'entry' }));
    try {
      mountBooth(root);
      await clock.tickAsync(0);
      root.getElementById('choose-another-report').click();
      await clock.tickAsync(0);
      expect(root.querySelector('[data-panel="finish"]').hidden).to.equal(true);
      expect(root.querySelector('#email-form button').disabled).to.equal(true);
      expect(root.getElementById('booth-retry').hidden).to.equal(false);
      expect(root.getElementById('booth-status').textContent).to.equal('Permission check unavailable');
      root.getElementById('booth-retry').click();
      await clock.tickAsync(0);
      expect(root.querySelector('[data-panel="welcome"]').hidden).to.equal(false);
      expect(root.querySelector('#email-form button').disabled).to.equal(false);
      expect(root.getElementById('choose-another-report').hidden).to.equal(true);
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });
});
