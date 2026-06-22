import { expect } from '@esm-bundle/chai';
import { viewerMetadata } from '../../scripts/utils/viewer-identity.js';

describe('viewer-identity: viewerMetadata', () => {
  it('returns empty object for null identity', () => {
    expect(viewerMetadata(null)).to.deep.equal({});
  });

  it('includes auth_method and viewer_email for a verified login', () => {
    const meta = viewerMetadata({ email: 'alice@adobe.com', method: 'oauth' });
    expect(meta).to.deep.equal({ auth_method: 'oauth', viewer_email: 'alice@adobe.com' });
  });

  it('includes the method but NEVER the email for a link-borne (magiclink) view', () => {
    // The whole point: a magic link can be opened by anyone, so we record that
    // the view came via a magic link but withhold the email — we can't prove who
    // is actually looking. (viewer-identity sets email:null for unverified.)
    const meta = viewerMetadata({ email: null, method: 'magiclink' });
    expect(meta).to.deep.equal({ auth_method: 'magiclink' });
    expect(meta).to.not.have.property('viewer_email');
  });

  it('omits both fields for an anonymous view', () => {
    expect(viewerMetadata({ email: null, method: null })).to.deep.equal({});
  });
});
