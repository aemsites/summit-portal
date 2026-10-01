import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { boothRequest } from '../../scripts/booth.js';
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
});
