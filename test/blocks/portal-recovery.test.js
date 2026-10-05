import { expect } from '@esm-bundle/chai';
import init from '../../blocks/portal-recovery/portal-recovery.js';

describe('portal-recovery', () => {
  it('offers intake, portal lookup and account switching without claiming no report exists', () => {
    const block = document.createElement('div');
    init(block);
    expect(block.querySelector('h1').textContent).to.include("isn't available to the account");
    expect([...block.querySelectorAll('a')].map((link) => link.getAttribute('href')))
      .to.deep.equal(['/request-report', '/auth/portal', '/auth/logout']);
    expect(block.querySelector('.pr-note').textContent).to.include("doesn't unlock this page");
  });
});
