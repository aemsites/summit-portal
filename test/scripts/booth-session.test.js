import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { BOOTH_INACTIVITY_MS, createBoothInactivity } from '../../scripts/booth-session.js';

describe('shared booth inactivity policy', () => {
  let sandbox;
  let clock;
  let reset;
  let onError;
  let fetchStub;
  let inactivity;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers();
    reset = sandbox.spy();
    onError = sandbox.spy();
    fetchStub = sandbox.stub(window, 'fetch').callsFake(async (url, options) => {
      const { idleMs } = JSON.parse(options.body);
      return Response.json({ expiresAt: Date.now() + BOOTH_INACTIVITY_MS - idleMs });
    });
    inactivity = createBoothInactivity({ reset, onError });
  });

  afterEach(() => {
    inactivity.stop();
    sandbox.restore();
  });

  it('waits exactly fifteen minutes before clearing idle Entry fields', async () => {
    expect(BOOTH_INACTIVITY_MS).to.equal(900000);
    inactivity.activity();
    await clock.tickAsync(899999);
    expect(reset.called).to.equal(false);
    await clock.tickAsync(1);
    expect(reset.calledOnce).to.equal(true);
    expect(fetchStub.called).to.equal(false);
  });

  it('keeps active reading past the original expiry and clears fifteen minutes after the last input', async () => {
    inactivity.setExpiry(BOOTH_INACTIVITY_MS);
    inactivity.activity(false);
    await clock.tickAsync(14 * 60000);
    inactivity.activity();
    await clock.tickAsync(0);
    expect(fetchStub.firstCall.args[0]).to.equal('/auth/booth/activity');
    expect(fetchStub.firstCall.args[1].body).to.equal('{"idleMs":0}');
    await clock.tickAsync(BOOTH_INACTIVITY_MS - 1);
    expect(reset.called).to.equal(false);
    expect(fetchStub.calledOnce).to.equal(true);
    await clock.tickAsync(1);
    expect(reset.called).to.equal(true);
    expect(onError.called).to.equal(false);
  });

  it('batches continuous input and reports the last real input, not the delayed request time', async () => {
    inactivity.setExpiry(BOOTH_INACTIVITY_MS);
    inactivity.activity();
    await clock.tickAsync(0);
    await clock.tickAsync(1000);
    inactivity.activity();
    await clock.tickAsync(1000);
    inactivity.activity();
    await clock.tickAsync(27999);
    expect(fetchStub.calledOnce).to.equal(true);
    await clock.tickAsync(1);
    expect(fetchStub.calledTwice).to.equal(true);
    expect(JSON.parse(fetchStub.secondCall.args[1].body).idleMs).to.equal(28000);
    await clock.tickAsync(BOOTH_INACTIVITY_MS - 28001);
    expect(reset.called).to.equal(false);
    await clock.tickAsync(1);
    expect(reset.called).to.equal(true);
    expect(fetchStub.calledTwice).to.equal(true);
  });

  it('sends the last input received during an in-flight renewal without concurrent requests', async () => {
    let complete;
    fetchStub.onFirstCall().returns(new Promise((resolve) => { complete = resolve; }));
    inactivity.setExpiry(BOOTH_INACTIVITY_MS);
    inactivity.activity();
    await clock.tickAsync(1000);
    inactivity.activity();
    await clock.tickAsync(1000);
    complete(Response.json({ expiresAt: BOOTH_INACTIVITY_MS }));
    await clock.tickAsync(27999);
    expect(fetchStub.calledOnce).to.equal(true);
    await clock.tickAsync(1);
    expect(fetchStub.calledTwice).to.equal(true);
    expect(JSON.parse(fetchStub.secondCall.args[1].body).idleMs).to.equal(29000);
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
    inactivity.setExpiry(BOOTH_INACTIVITY_MS);
    inactivity.activity();
    await clock.tickAsync(0);
    expect(onError.firstCall.args[0].status).to.equal(401);
    await clock.tickAsync(1000);
    inactivity.activity();
    await clock.tickAsync(30000);
    expect(fetchStub.calledOnce).to.equal(true);
    inactivity.stop();
    fetchStub.onSecondCall().resolves(Response.json({ state: 'entry' }));
    inactivity.setExpiry(Date.now() + BOOTH_INACTIVITY_MS);
    inactivity.activity();
    await clock.tickAsync(0);
    expect(onError.secondCall.args[0].message).to.include('expired');
  });

  it('does not reactivate cleared visits when a renewal responds late', async () => {
    let complete;
    fetchStub.returns(new Promise((resolve) => { complete = resolve; }));
    inactivity.setExpiry(BOOTH_INACTIVITY_MS);
    inactivity.activity();
    await clock.tickAsync(0);
    inactivity.stop();
    complete(Response.json({ expiresAt: Date.now() + BOOTH_INACTIVITY_MS }));
    await clock.tickAsync(0);
    expect(clock.countTimers()).to.equal(0);
    expect(reset.called).to.equal(false);
    expect(onError.called).to.equal(false);
  });

  ['fetch', 'body'].forEach((phase) => {
    it(`fails visibly after a ten-second stalled renewal ${phase}`, async () => {
      fetchStub.returns(phase === 'fetch'
        ? new Promise(() => {})
        : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }));
      inactivity.setExpiry(BOOTH_INACTIVITY_MS);
      inactivity.activity();
      await clock.tickAsync(10001);
      expect(onError.calledOnce).to.equal(true);
      expect(onError.firstCall.args[0].code).to.equal('timeout');
      expect(fetchStub.firstCall.args[1].signal.aborted).to.equal(true);
    });
  });
});
