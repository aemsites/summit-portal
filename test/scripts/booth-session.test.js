import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createBoothInactivity } from '../../scripts/booth-session.js';

const VISIT_MS = 24 * 60 * 60 * 1000;
const RENEW_AT_MS = VISIT_MS - 3 * 60 * 1000;

describe('shared booth inactivity policy', () => {
  let sandbox;
  let clock;
  let reset;
  let onError;
  let connection;
  let fetchStub;
  let inactivity;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers();
    reset = sandbox.spy();
    onError = sandbox.spy();
    connection = sandbox.spy();
    fetchStub = sandbox.stub(window, 'fetch').callsFake(async (url, options) => {
      const { idleMs } = JSON.parse(options.body);
      return Response.json({ expiresAt: Date.now() + VISIT_MS - idleMs });
    });
    inactivity = createBoothInactivity({ reset, onError, onConnectionChange: connection });
  });

  afterEach(() => {
    inactivity.stop();
    sandbox.restore();
  });

  it('waits exactly one day before clearing idle Entry fields', async () => {
    inactivity.activity();
    await clock.tickAsync(VISIT_MS - 1);
    expect(reset.called).to.equal(false);
    await clock.tickAsync(1);
    expect(reset.calledOnce).to.equal(true);
    expect(fetchStub.called).to.equal(false);
  });

  it('keeps active reading past the original expiry and clears one day after the last input', async () => {
    inactivity.setExpiry(VISIT_MS);
    inactivity.activity(false);
    await clock.tickAsync(VISIT_MS - 60000);
    inactivity.activity();
    await clock.tickAsync(0);
    expect(fetchStub.firstCall.args[0]).to.equal('/auth/booth/activity');
    expect(fetchStub.firstCall.args[1].body).to.equal('{"idleMs":0}');
    await clock.tickAsync(VISIT_MS - 1);
    expect(reset.called).to.equal(false);
    expect(fetchStub.calledOnce).to.equal(true);
    await clock.tickAsync(1);
    expect(reset.called).to.equal(true);
    expect(onError.called).to.equal(false);
  });

  it('waits until three minutes before expiry and reports real input rather than renewal time', async () => {
    inactivity.setExpiry(VISIT_MS);
    inactivity.activity();
    await clock.tickAsync(1000);
    inactivity.activity();
    await clock.tickAsync(1000);
    inactivity.activity();
    await clock.tickAsync(RENEW_AT_MS - 2001);
    expect(fetchStub.called).to.equal(false);
    await clock.tickAsync(1);
    expect(fetchStub.calledOnce).to.equal(true);
    expect(JSON.parse(fetchStub.firstCall.args[1].body).idleMs).to.equal(RENEW_AT_MS - 2000);
    await clock.tickAsync(181999);
    expect(reset.called).to.equal(false);
    await clock.tickAsync(1);
    expect(reset.called).to.equal(true);
    expect(fetchStub.calledOnce).to.equal(true);
  });

  it('sends the last input received during an in-flight renewal without concurrent requests', async () => {
    let complete;
    fetchStub.onFirstCall().returns(new Promise((resolve) => { complete = resolve; }));
    inactivity.setExpiry(VISIT_MS);
    inactivity.activity();
    await clock.tickAsync(RENEW_AT_MS - 1);
    inactivity.activity();
    await clock.tickAsync(1);
    await clock.tickAsync(1000);
    inactivity.activity();
    await clock.tickAsync(1000);
    complete(Response.json({ expiresAt: VISIT_MS + RENEW_AT_MS - 1 }));
    await clock.tickAsync(RENEW_AT_MS - 2002);
    expect(fetchStub.calledOnce).to.equal(true);
    await clock.tickAsync(1);
    expect(fetchStub.calledTwice).to.equal(true);
    expect(JSON.parse(fetchStub.secondCall.args[1].body).idleMs).to.equal(RENEW_AT_MS - 1001);
  });

  it('keeps verification and passive status from renewing the visit', async () => {
    inactivity.setExpiry(5000, false);
    inactivity.activity();
    await clock.tickAsync(4999);
    expect(fetchStub.called).to.equal(false);
    expect(reset.called).to.equal(false);
    await clock.tickAsync(1);
    expect(reset.calledOnce).to.equal(true);
  });

  it('surfaces lost authentication and invalid renewal responses rather than extending access locally', async () => {
    fetchStub.onFirstCall().resolves(Response.json({ error: 'Staff authentication required' }, { status: 401 }));
    inactivity.setExpiry(VISIT_MS);
    inactivity.activity();
    await clock.tickAsync(RENEW_AT_MS);
    expect(onError.firstCall.args[0].status).to.equal(401);
    await clock.tickAsync(1000);
    inactivity.activity();
    await clock.tickAsync(30000);
    expect(fetchStub.calledOnce).to.equal(true);
    inactivity.stop();
    fetchStub.onSecondCall().resolves(Response.json({ state: 'entry' }));
    inactivity.setExpiry(Date.now() + VISIT_MS);
    inactivity.activity();
    await clock.tickAsync(RENEW_AT_MS);
    expect(onError.secondCall.args[0].message).to.include('expired');
  });

  it('does not reactivate cleared visits when a renewal responds late', async () => {
    let complete;
    fetchStub.returns(new Promise((resolve) => { complete = resolve; }));
    inactivity.setExpiry(VISIT_MS);
    inactivity.activity();
    await clock.tickAsync(RENEW_AT_MS);
    inactivity.stop();
    complete(Response.json({ expiresAt: Date.now() + VISIT_MS }));
    await clock.tickAsync(0);
    expect(clock.countTimers()).to.equal(0);
    expect(reset.called).to.equal(false);
    expect(onError.called).to.equal(false);
  });

  ['fetch', 'body'].forEach((phase) => {
    it(`reports a stalled renewal ${phase} without clearing valid access and recovers on retry`, async () => {
      fetchStub.returns(phase === 'fetch'
        ? new Promise(() => {})
        : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }));
      inactivity.setExpiry(VISIT_MS);
      inactivity.activity();
      await clock.tickAsync(RENEW_AT_MS + 10001);
      expect(onError.called).to.equal(false);
      expect(reset.called).to.equal(false);
      expect(connection.firstCall.args[0].code).to.equal('timeout');
      expect(fetchStub.firstCall.args[1].signal.aborted).to.equal(true);
      fetchStub.callsFake(async () => Response.json({ expiresAt: VISIT_MS }));
      await clock.tickAsync(29998);
      expect(fetchStub.calledOnce).to.equal(true);
      await clock.tickAsync(1);
      expect(fetchStub.calledTwice).to.equal(true);
      expect(connection.lastCall.args[0]).to.equal(null);
      expect(onError.called).to.equal(false);
    });
  });

  it('never extends access locally while transient failures continue and visitors keep interacting', async () => {
    fetchStub.resolves(Response.json({ error: 'Temporarily unavailable' }, { status: 502 }));
    inactivity.setExpiry(VISIT_MS);
    inactivity.activity();
    await clock.tickAsync(RENEW_AT_MS);
    expect(connection.calledOnce).to.equal(true);
    await clock.tickAsync(10000);
    inactivity.activity();
    await clock.tickAsync(169999);
    expect(reset.called).to.equal(false);
    expect(onError.called).to.equal(false);
    await clock.tickAsync(1);
    expect(reset.called).to.equal(true);
    expect(fetchStub.callCount).to.be.at.most(6);
  });

  [401, 403, 410].forEach((status) => {
    it(`preserves definitive ${status} denial even when its response body is not JSON`, async () => {
      fetchStub.resolves(new Response('<html>Denied</html>', { status }));
      inactivity.setExpiry(VISIT_MS);
      inactivity.activity();
      await clock.tickAsync(RENEW_AT_MS);
      expect(onError.calledOnce).to.equal(true);
      expect(onError.firstCall.args[0].status).to.equal(status);
      expect(connection.called).to.equal(false);
      await clock.tickAsync(30000);
      expect(fetchStub.calledOnce).to.equal(true);
    });
  });

  it('retains a known authentication denial even if its JSON body stalls', async () => {
    fetchStub.resolves({ status: 401, ok: false, json: () => new Promise(() => {}) });
    inactivity.setExpiry(VISIT_MS);
    inactivity.activity();
    await clock.tickAsync(RENEW_AT_MS + 10001);
    expect(onError.calledOnce).to.equal(true);
    expect(onError.firstCall.args[0].status).to.equal(401);
    expect(connection.called).to.equal(false);
  });

  it('keeps network failure retryable without losing the confirmed expiry', async () => {
    fetchStub.rejects(new TypeError('Failed to fetch'));
    inactivity.setExpiry(VISIT_MS);
    inactivity.activity();
    await clock.tickAsync(RENEW_AT_MS);
    expect(connection.calledOnce).to.equal(true);
    expect(onError.called).to.equal(false);
    inactivity.stop();
    await clock.tickAsync(VISIT_MS);
    expect(fetchStub.calledOnce).to.equal(true);
    expect(reset.called).to.equal(false);
  });

  it('rejects a late success after confirmed access expired, even before the deadline callback runs', async () => {
    let complete;
    fetchStub.returns(new Promise((resolve) => { complete = resolve; }));
    inactivity.setExpiry(VISIT_MS);
    await clock.tickAsync(VISIT_MS - 10000);
    inactivity.activity();
    await clock.tickAsync(0);
    clock.setSystemTime(VISIT_MS + 10000);
    complete(Response.json({ expiresAt: Date.now() + VISIT_MS }));
    await clock.tickAsync(0);
    expect(reset.calledOnce).to.equal(true);
    expect(connection.called).to.equal(false);
  });

  it('does not refresh access through passive status reads or repeat renewals without new input', async () => {
    inactivity.setExpiry(VISIT_MS);
    inactivity.activity(false);
    await clock.tickAsync(RENEW_AT_MS);
    expect(fetchStub.called).to.equal(false);
    inactivity.activity();
    await clock.tickAsync(0);
    expect(fetchStub.calledOnce).to.equal(true);
    await clock.tickAsync(VISIT_MS - 1);
    expect(fetchStub.calledOnce).to.equal(true);
    expect(reset.called).to.equal(false);
    await clock.tickAsync(1);
    expect(reset.called).to.equal(true);
  });
});
