import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../blocks/portal-login/portal-login.js';

const settle = () => new Promise((resolve) => { window.setTimeout(resolve, 80); });

describe('portal-login recovery', () => {
  let fetchStub;
  let originalUrl;
  let block;

  beforeEach(() => {
    originalUrl = window.location.href;
    window.history.replaceState(null, '', '/login');
    document.body.innerHTML = '';
    block = document.createElement('div');
    block.className = 'portal-login';
    block.innerHTML = '<div><div><h3>Adobe ID</h3><p><strong><a href="/auth/portal">Login with Adobe ID</a></strong></p></div><div><h3>One Time Login</h3></div></div>';
    document.body.append(block);
    fetchStub = sinon.stub(window, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
    window.history.replaceState(null, '', originalUrl);
    block.remove();
  });

  async function submit(response) {
    fetchStub.resolves(response);
    init(block);
    block.querySelector('#pl-email').value = 'visitor@example.com';
    block.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  it('offers a report request before attempting authentication', () => {
    init(block);
    expect(block.querySelector('.pl-request a').getAttribute('href')).to.equal('/request-report');
  });

  it('keeps the form and offers recovery instead of false success for not_found', async () => {
    await submit(Response.json({ result: 'not_found' }));
    expect(block.querySelector('.pl-success')).to.equal(null);
    expect(block.querySelector('form')).to.exist;
    expect(block.querySelector('.pl-unavailable').hidden).to.equal(false);
    expect(block.querySelector('.pl-unavailable a').getAttribute('href')).to.equal('/request-report?reason=unavailable');
    expect(block.querySelector('.pl-submit').disabled).to.equal(false);
    expect(document.activeElement).to.equal(block.querySelector('.pl-unavailable'));
  });

  it('only shows link-sent confirmation for sent', async () => {
    await submit(Response.json({ result: 'sent' }));
    expect(block.querySelector('.pl-success').textContent).to.include("we've sent a login link");
    expect(block.querySelector('form')).to.equal(null);
    expect(block.querySelector('.pl-success').getAttribute('role')).to.equal('status');
  });

  it('does not claim a report is missing when a mapping outage occurs', async () => {
    await submit(Response.json({ code: 'lookup_unavailable' }, { status: 503 }));
    expect(block.querySelector('.pl-error').textContent).to.include('check report availability');
    expect(block.querySelector('.pl-unavailable').hidden).to.equal(true);
    expect(block.querySelector('form')).to.exist;
  });

  it('fails explicitly on an unexpected successful response', async () => {
    await submit(Response.json({}));
    expect(block.querySelector('.pl-error').hidden).to.equal(false);
    expect(block.querySelector('.pl-success')).to.equal(null);
  });

  it('shows a safe retry message when the network request fails', async () => {
    fetchStub.rejects(new TypeError('Failed to fetch'));
    init(block);
    block.querySelector('#pl-email').value = 'visitor@example.com';
    block.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(block.querySelector('.pl-error').textContent).to.include("We couldn't send your login link");
    expect(block.querySelector('.pl-submit').disabled).to.equal(false);
    expect(block.querySelector('.pl-success')).to.equal(null);
  });

  it('offers retry and email login after failed Adobe authentication', () => {
    window.history.replaceState(null, '', '/login?reason=authentication-failed');
    init(block);
    expect(block.querySelector('.pl-lookup-error').textContent).to.include("We couldn't sign you in");
    expect(block.querySelector('.pl-lookup-error a').getAttribute('href')).to.equal('/auth/portal');
    expect(block.querySelector('.pl-magic-form')).to.exist;
  });

  it('treats a legacy not_found response with an outage reason as retryable', async () => {
    await submit(Response.json({ result: 'not_found', reason: 'mapping failure' }));
    expect(block.querySelector('.pl-error').textContent).to.include('check report availability');
    expect(block.querySelector('.pl-unavailable').hidden).to.equal(true);
  });

  it('preserves real deep links for both login methods', async () => {
    window.history.replaceState(null, '', '/login?redirect=%2Faccounts%2Fc%2Fcustomer%2F');
    await submit(Response.json({ result: 'sent' }));
    expect(block.querySelector('.pl-col-adobe a').getAttribute('href'))
      .to.equal('/auth/portal?redirect=%2Faccounts%2Fc%2Fcustomer%2F');
    expect(JSON.parse(fetchStub.firstCall.args[1].body).redirect).to.equal('/accounts/c/customer/');
  });

  it('does not forward a homepage return instead of report lookup', async () => {
    window.history.replaceState(null, '', '/login?redirect=%2F');
    await submit(Response.json({ result: 'sent' }));
    expect(block.querySelector('.pl-col-adobe a').getAttribute('href')).to.equal('/auth/portal');
    expect(JSON.parse(fetchStub.firstCall.args[1].body)).to.deep.equal({ email: 'visitor@example.com' });
  });

  it('keeps the event staff form separate from customer recovery', () => {
    window.history.replaceState(null, '', '/login?staff&redirect=%2Fbooth');
    init(block);
    expect(block.querySelector('.pl-staff-form')).to.exist;
    expect(block.querySelector('.pl-request')).to.equal(null);
    expect(block.querySelector('#pl-email')).to.equal(null);
  });
});
