import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setViewport } from '@web/test-runner-commands';
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

  it('preserves staff credential submission and retry feedback', async () => {
    window.history.replaceState(null, '', '/login?staff&redirect=%2Fbooth');
    fetchStub.resolves(Response.json({}, { status: 401 }));
    init(block);
    block.querySelector('#pl-staff-user').value = ' fixture-staff ';
    block.querySelector('#pl-staff-pass').value = 'synthetic-password';
    block.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(fetchStub.firstCall.args[0]).to.equal('/auth/staff-login');
    expect(JSON.parse(fetchStub.firstCall.args[1].body))
      .to.deep.equal({ username: 'fixture-staff', password: 'synthetic-password' });
    expect(block.querySelector('.pl-error').hidden).to.equal(false);
    expect(block.querySelector('.pl-submit').disabled).to.equal(false);
  });
});

describe('portrait staff login layout', () => {
  let originalUrl;
  let originalViewport;
  let block;
  const styles = [];
  const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
  const font = (selector) => parseFloat(
    getComputedStyle(document.querySelector(selector)).fontSize,
  );

  before(async () => {
    originalViewport = { width: window.innerWidth, height: window.innerHeight };
    await Promise.all(['/styles/styles.css', '/blocks/portal-login/portal-login.css'].map((href) => (
      new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = reject;
        styles.push(link);
        document.head.append(link);
      })
    )));
  });

  after(async () => {
    styles.forEach((link) => link.remove());
    await setViewport(originalViewport);
  });

  beforeEach(() => {
    originalUrl = window.location.href;
    window.history.replaceState(null, '', '/login?staff&redirect=%2Fbooth');
    document.body.innerHTML = `
      <main><div class="section">
        <div class="default-content"><h1>Insights Portal Login</h1><p>Local login fixture.</p></div>
        <div class="block-content"><div class="portal-login">
          <div><div><h3>Adobe ID</h3></div><div><h3>One Time Login</h3></div></div>
        </div></div>
      </div></main>`;
    block = document.querySelector('.portal-login');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', originalUrl);
  });

  [
    [2160, 3840, true], [1080, 1920, true], [1440, 900, false],
    [390, 844, false], [1080, 1599, false],
  ].forEach(([width, height, portrait]) => {
    it(`scopes readable staff sizing at ${width} × ${height}`, async () => {
      await setViewport({ width, height });
      init(block);
      expect(document.documentElement.scrollWidth).to.be.at.most(width);
      expect(rect('.pl-staff').left).to.be.at.least(0);
      expect(rect('.pl-staff').right).to.be.at.most(width);
      expect(block.querySelector('.pl-error').hidden).to.equal(true);
      if (portrait) {
        expect(rect('.pl-staff').width).to.be.closeTo(width === 2160 ? 1440 : 968, 1);
        expect(font('main h1')).to.be.closeTo(width === 2160 ? 80 : 48, 0.01);
        expect(font('#pl-staff-user')).to.be.closeTo(width === 2160 ? 44 : 24, 0.01);
        expect(font('.pl-label')).to.be.closeTo(width === 2160 ? 32 : 24, 0.01);
        expect(rect('#pl-staff-user').height).to.be.closeTo(width === 2160 ? 144 : 80, 0.01);
        expect(rect('.pl-submit').height).to.be.closeTo(width === 2160 ? 120 : 80, 0.01);
        expect(rect('.pl-submit').bottom).to.be.lessThan(height);
      } else {
        expect(font('#pl-staff-user')).to.equal(16);
        expect(font('.pl-label')).to.equal(14);
        expect(rect('#pl-staff-user').height).to.be.lessThan(60);
      }
    });
  });

  it('does not enlarge customer login at the native touchscreen resolution', async () => {
    await setViewport({ width: 2160, height: 3840 });
    window.history.replaceState(null, '', '/login');
    init(block);
    expect(font('main h1')).to.equal(32.44);
    expect(font('#pl-email')).to.equal(16);
    expect(block.querySelector('.pl-staff')).to.equal(null);
  });

  it('supports the aem.js wrapper convention and visible error feedback', async () => {
    await setViewport({ width: 2160, height: 3840 });
    document.querySelector('.block-content').className = 'portal-login-wrapper';
    document.querySelector('.default-content').className = 'default-content-wrapper';
    init(block);
    block.querySelector('.pl-error').hidden = false;
    expect(rect('.pl-staff').width).to.equal(1440);
    expect(font('.pl-error')).to.equal(32);
    expect(rect('.pl-error').height).to.be.greaterThan(0);
    expect(rect('.pl-error').bottom).to.be.lessThan(3840);
  });
});
