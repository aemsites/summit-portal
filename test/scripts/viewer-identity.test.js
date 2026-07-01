import { expect } from '@esm-bundle/chai';
import { viewerMetadata } from '../../scripts/utils/viewer-identity.js';

describe('viewer-identity: viewerMetadata', () => {
  it('returns empty object for null identity', () => {
    expect(viewerMetadata(null)).to.deep.equal({});
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
