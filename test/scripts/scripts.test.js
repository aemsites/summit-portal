import { expect } from '@esm-bundle/chai';
import { ensureRequiredRouteBlocks, loadPage } from '../../scripts/scripts.js';

describe('scripts.js', () => {
  before(async () => {
    document.body.innerHTML = '<img src="test.jpg" loading="lazy">';
    await loadPage();
  });

  describe('decorateArea', () => {
    it('should remove loading attribute from first image', () => {
      const img = document.querySelector('img');
      expect(img.hasAttribute('loading')).to.be.false;
    });

    it('should set fetchPriority to high', () => {
      const img = document.querySelector('img');
      expect(img.fetchPriority).to.equal('high');
    });
  });

  it('ensures the authenticated report-request route initializes its required block', async () => {
    const block = document.createElement('div');
    block.className = 'report-requests-list';
    block.innerHTML = '<div><p>Loading report requests...</p></div>';
    document.body.append(block);
    await ensureRequiredRouteBlocks('/adobe/report-requests');

    expect(block.querySelector('.rrl-shell')).to.exist;
    expect(block.querySelector('.rrl-back').getAttribute('href')).to.equal('/adobe/dashboard');
    block.remove();
  });
});
