import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { viewerMetadata } from '../../scripts/utils/viewer-identity.js';

describe('viewer-identity: viewerMetadata', () => {
  it('returns empty object for null identity', () => {
    expect(viewerMetadata(null)).to.deep.equal({});
  });

  describe('viewer-identity: separate booth and portal authentication', () => {
    let fetch;
    let marker;

    afterEach(() => {
      fetch.restore();
      marker?.remove();
      marker = undefined;
    });

    it('does not attribute a booth report to an ordinary portal session', async () => {
      marker = document.createElement('script');
      marker.dataset.boothMode = 'report';
      document.head.append(marker);
      fetch = sinon.stub(window, 'fetch').resolves(Response.json({ authenticated: false }, { status: 401 }));
      const { default: identity } = await import('../../scripts/utils/viewer-identity.js?test=booth-isolation');
      expect(await identity()).to.deep.equal({ method: null });
      expect(fetch.firstCall.args[0]).to.equal('/auth/me?booth=1');
    });

    it('keeps ordinary portal identity resolution unchanged', async () => {
      fetch = sinon.stub(window, 'fetch').resolves(Response.json({ authenticated: true, method: 'oauth' }));
      const { default: identity } = await import('../../scripts/utils/viewer-identity.js?test=portal-isolation');
      expect(await identity()).to.deep.equal({ method: 'oauth' });
      expect(fetch.firstCall.args[0]).to.equal('/auth/me');
    });
  });

  it('includes auth_method but never an email for a verified login', () => {
    const meta = viewerMetadata({ method: 'oauth' });
    expect(meta).to.deep.equal({ auth_method: 'oauth' });
    expect(meta).to.not.have.property('viewer_email');
  });

  it('includes the method but never an email for a link-borne (magiclink) view', () => {
    const meta = viewerMetadata({ method: 'magiclink' });
    expect(meta).to.deep.equal({ auth_method: 'magiclink' });
    expect(meta).to.not.have.property('viewer_email');
  });

  it('omits auth_method for an anonymous view', () => {
    expect(viewerMetadata({ method: null })).to.deep.equal({});
  });
});
