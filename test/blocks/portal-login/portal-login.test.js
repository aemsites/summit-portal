import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
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
      const col = el.querySelector('.pl-row .pl-col-magic');
      expect(col).to.exist;
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

  describe('Adobe ID button', () => {
    let el;
    before(() => {
      el = makeBlock();
      init(el);
    });

    it('adds .btn and .btn-primary to the Adobe ID link', () => {
      const link = el.querySelector('.pl-col-adobe a');
      expect(link.classList.contains('btn')).to.be.true;
      expect(link.classList.contains('btn-primary')).to.be.true;
    });
  });

  describe('magic link form', () => {
    let el;
    before(() => {
      el = makeBlock();
      init(el);
    });

    it('injects a form with class pl-magic-form into col-magic', () => {
      const form = el.querySelector('.pl-col-magic .pl-magic-form');
      expect(form).to.exist;
      expect(form.tagName).to.equal('FORM');
    });

    it('form contains an email input with id pl-email', () => {
      const input = el.querySelector('.pl-magic-form #pl-email');
      expect(input).to.exist;
      expect(input.type).to.equal('email');
      expect(input.required).to.be.true;
    });

    it('form contains a label associated with pl-email', () => {
      const label = el.querySelector('.pl-magic-form .pl-label');
      expect(label).to.exist;
      expect(label.htmlFor).to.equal('pl-email');
    });

    it('form contains a submit button with class pl-submit', () => {
      const btn = el.querySelector('.pl-magic-form .pl-submit');
      expect(btn).to.exist;
      expect(btn.type).to.equal('submit');
    });

    it('form contains a hidden error element with role alert', () => {
      const err = el.querySelector('.pl-magic-form .pl-error');
      expect(err).to.exist;
      expect(err.hidden).to.be.true;
      expect(err.getAttribute('role')).to.equal('alert');
    });
  });

  describe('form submit', () => {
    let el;
    let fetchStub;

    beforeEach(() => {
      el = makeBlock();
      init(el);
      fetchStub = sinon.stub(window, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
    });

    it('calls fetch with POST and the entered email on submit', async () => {
      fetchStub.resolves(new Response('{}', { status: 200 }));
      const form = el.querySelector('.pl-magic-form');
      form.querySelector('#pl-email').value = 'user@example.com';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchStub.calledOnce).to.be.true;
      const [, options] = fetchStub.firstCall.args;
      expect(options.method).to.equal('POST');
      expect(JSON.parse(options.body).email).to.equal('user@example.com');
    });

    it('replaces form with success message on 200 response', async () => {
      fetchStub.resolves(new Response('{}', { status: 200 }));
      const col = el.querySelector('.pl-col-magic');
      const form = col.querySelector('.pl-magic-form');
      form.querySelector('#pl-email').value = 'user@example.com';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(col.querySelector('.pl-magic-form')).to.be.null;
      const msg = col.querySelector('.pl-success');
      expect(msg).to.exist;
      expect(msg.textContent).to.include('user@example.com');
    });

    it('shows error element on failed fetch (non-2xx)', async () => {
      fetchStub.resolves(new Response('{}', { status: 500 }));
      const form = el.querySelector('.pl-magic-form');
      form.querySelector('#pl-email').value = 'user@example.com';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(form.querySelector('.pl-error').hidden).to.be.false;
      expect(form.querySelector('.pl-submit').disabled).to.be.false;
    });

    it('shows error element on network failure', async () => {
      fetchStub.rejects(new Error('Network error'));
      const form = el.querySelector('.pl-magic-form');
      form.querySelector('#pl-email').value = 'user@example.com';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(form.querySelector('.pl-error').hidden).to.be.false;
    });
  });

  describe('mobile divider', () => {
    let el;
    before(() => {
      el = makeBlock();
      init(el);
    });

    it('injects a .pl-divider between the two cards', () => {
      const row = el.querySelector('.pl-row');
      const divider = row.querySelector('.pl-divider');
      expect(divider).to.exist;
      expect(divider.previousElementSibling.classList.contains('pl-col-adobe')).to.be.true;
      expect(divider.nextElementSibling.classList.contains('pl-col-magic')).to.be.true;
    });

    it('divider contains the text "or"', () => {
      const divider = el.querySelector('.pl-divider');
      expect(divider.textContent.trim()).to.equal('or');
    });
  });
});
