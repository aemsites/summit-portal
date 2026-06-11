import { expect } from '@esm-bundle/chai';
import init from '../../../blocks/portal-login/portal-login.js';

function makeBlock() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div>
      <div>
        <p>If you already have an Adobe ID, you can use this one to log in to your brand report.</p>
        <p><strong><a href="/auth/portal">Login with Adobe ID</a></strong></p>
      </div>
      <div>If you don't have an Adobe ID, you can request a one-time login link with your corporate email address.</div>
    </div>
  `;
  return el;
}

describe('portal-login', () => {
  describe('column decoration', () => {
    let el;
    before(() => {
      el = makeBlock();
      init(el);
    });

    it('adds pl-row to the row div', () => {
      expect(el.children[0].classList.contains('pl-row')).to.be.true;
    });

    it('adds pl-col and pl-col-adobe to first column', () => {
      const col = el.querySelector('.pl-row').children[0];
      expect(col.classList.contains('pl-col')).to.be.true;
      expect(col.classList.contains('pl-col-adobe')).to.be.true;
    });

    it('adds pl-col and pl-col-magic to second column', () => {
      const col = el.querySelector('.pl-row').children[1];
      expect(col.classList.contains('pl-col')).to.be.true;
      expect(col.classList.contains('pl-col-magic')).to.be.true;
    });
  });

  describe('card headings', () => {
    let el;
    before(() => {
      el = makeBlock();
      init(el);
    });

    it('injects "Adobe ID" heading as first child of col-adobe', () => {
      const col = el.querySelector('.pl-col-adobe');
      const h3 = col.querySelector('h3.pl-card-title');
      expect(h3).to.exist;
      expect(h3.textContent).to.equal('Adobe ID');
      expect(col.firstElementChild).to.equal(h3);
    });

    it('injects "Magic Link" heading as first child of col-magic', () => {
      const col = el.querySelector('.pl-col-magic');
      const h3 = col.querySelector('h3.pl-card-title');
      expect(h3).to.exist;
      expect(h3.textContent).to.equal('Magic Link');
      expect(col.firstElementChild).to.equal(h3);
    });
  });
});
