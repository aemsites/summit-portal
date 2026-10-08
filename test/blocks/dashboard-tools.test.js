import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../blocks/dashboard-tools/dashboard-tools.js';

describe('dashboard-tools', () => {
  let block;
  let fetchStub;
  let downloadStub;
  let objectUrlStub;

  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <div class="section"><div class="block-content">
          <div class="dashboard-tools"></div>
          <div class="report-callout report-requests">
            <aside><a href="/adobe/report-requests">Open report requests</a></aside>
          </div>
          <div class="report-callout neutral"><p>Existing sales guidance.</p></div>
          <div class="customer-picker"><input type="search"></div>
          <div class="report-callout neutral" id="after-picker">Keep this note here.</div>
        </div></div>
      </main>
    `;
    block = document.querySelector('.dashboard-tools');
    fetchStub = sinon.stub(window, 'fetch');
    downloadStub = sinon.stub(HTMLAnchorElement.prototype, 'click');
    objectUrlStub = sinon.stub(URL, 'createObjectURL').returns('blob:test-export');
    sinon.stub(URL, 'revokeObjectURL');
    init(block);
  });

  afterEach(() => {
    sinon.restore();
    document.body.innerHTML = '';
  });

  async function submit() {
    block.querySelector('details').open = true;
    block.querySelector('form').requestSubmit();
    // Includes response and body microtasks before asserting the visible result.
    await new Promise((resolve) => { window.setTimeout(resolve, 80); });
  }

  it('shows only a closed export utility and leaves authored notices and the picker intact', () => {
    init(block);
    expect(block.querySelectorAll('.dt-usage')).to.have.length(1);
    expect(block.querySelector('details').open).to.equal(false);
    expect(document.querySelectorAll('main > .section .report-callout')).to.have.length(3);
    expect(block.querySelector('.report-callout')).to.equal(null);
    expect(document.querySelector('.customer-picker input')).to.exist;
    expect(block.contains(document.querySelector('#after-picker'))).to.equal(false);
    expect(block.textContent).to.include('deleted after 90 days');
    expect(block.textContent).to.include('not a unique person');
    expect(block.textContent).to.include('not sales-contact consent');
    expect(block.querySelector('h2, .dt-copy, .dt-banner')).to.equal(null);
    expect(block.textContent).not.to.include('playbook');
    expect(fetchStub.called).to.equal(false);
  });

  it('links to the live booth with its browser restriction warning, without redundant sign-in copy', () => {
    const link = block.querySelector('.dt-description a');
    expect(link.getAttribute('href')).to.equal('/booth');
    expect(link.textContent).to.equal('View the booth experience');
    const warning = block.querySelector(`#${link.getAttribute('aria-describedby')}`);
    expect(warning.textContent).to.include('separate browser or private window');
    expect(warning.textContent).to.include('kiosk mode');
    expect(block.querySelectorAll('a')).to.have.length(1);
    expect(block.querySelector('.dt-description').textContent).not.to.include('sign-in');
    expect(block.textContent).not.to.include('Adobe employee sign-in with Adobe ID is required');
    expect(fetchStub.called).to.equal(false);
  });

  it('offers every existing action filter without suggesting new contact consent', () => {
    expect([...block.querySelectorAll('option')].map((option) => option.value)).to.deep.equal([
      '', 'search', 'no_report', 'report_selected', 'report_viewed', 'report_sent',
      'demo_selected', 'demo_viewed', 'contact_requested',
    ]);
    expect(block.querySelector('option[value="contact_requested"]').textContent).to.equal('Historical contact opt-ins');
  });

  it('preserves authored notice nodes, listeners and section positions', () => {
    const main = document.querySelector('main');
    main.innerHTML = `
      <div class="section"><div class="block-content">
        <div class="dashboard-tools"></div>
      </div></div>
      <div class="section"><div class="block-content">
        <div class="report-callout"><button type="button">Existing action</button></div>
      </div></div>
      <div class="section"><div class="block-content"><div class="customer-picker"></div></div></div>
    `;
    const button = main.querySelector('button');
    const listener = sinon.spy();
    button.addEventListener('click', listener);
    init(main.querySelector('.dashboard-tools'));
    expect(main.querySelectorAll(':scope > .section')).to.have.length(3);
    expect(main.querySelectorAll(':scope > .section')[1].querySelector('button')).to.equal(button);
    button.click();
    expect(listener.calledOnce).to.equal(true);
  });

  it('downloads the complete all-activity CSV on demand with same-origin credentials and no storage', async () => {
    const csv = 'Occurred,Email,Visit,Action\r\n2026-10-08,visitor@example.test,visit-1,search\r\n';
    fetchStub.resolves(new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } }));
    await submit();
    expect(fetchStub.firstCall.args[0]).to.equal('/api/booth-activity.csv');
    expect(fetchStub.firstCall.args[1].credentials).to.equal('same-origin');
    expect(fetchStub.firstCall.args[1].cache).to.equal('no-store');
    expect(await objectUrlStub.firstCall.args[0].text()).to.equal(csv);
    expect(downloadStub.firstCall.thisValue.download).to.equal('booth-activity.csv');
    expect(block.querySelector('.dt-export-status').textContent).to.include('CSV ready');
    expect(block.querySelector('button[type="submit"]').disabled).to.equal(false);
  });

  it('downloads exactly the selected event filter and prevents duplicate submissions', async () => {
    let complete;
    fetchStub.returns(new Promise((resolve) => { complete = resolve; }));
    block.querySelector('select').value = 'no_report';
    await submit();
    await submit();
    expect(fetchStub.callCount).to.equal(1);
    expect(fetchStub.firstCall.args[0]).to.equal('/api/booth-activity.csv?kind=no_report');
    expect(block.querySelector('select').disabled).to.equal(true);
    complete(new Response('Email\r\nvisitor@example.test\r\n', { headers: { 'Content-Type': 'text/csv' } }));
    await new Promise((resolve) => { window.setTimeout(resolve, 80); });
    expect(downloadStub.firstCall.thisValue.download).to.equal('booth-activity-no_report.csv');
    expect(block.querySelector('form').hasAttribute('aria-busy')).to.equal(false);
  });

  it('handles session expiry with an explicit sign-in link, never downloading an error', async () => {
    fetchStub.resolves(new Response('{}', { status: 401 }));
    await submit();
    expect(block.querySelector('.dt-export-status a').getAttribute('href'))
      .to.equal('/auth/portal?redirect=%2Fadobe%2Fdashboard');
    expect(downloadStub.called).to.equal(false);
    expect(block.querySelector('select').disabled).to.equal(false);
  });

  it('explains Adobe OAuth restrictions for forbidden downloads', async () => {
    fetchStub.resolves(new Response('{}', { status: 403 }));
    await submit();
    expect(block.querySelector('.dt-export-status').textContent).to.include('not a booth or shared-link login');
    expect(downloadStub.called).to.equal(false);
  });

  it('surfaces service, transport and login-redirect errors without creating a bogus CSV', async () => {
    for (const response of [
      new Response('{}', { status: 503 }),
      new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }),
    ]) {
      fetchStub.resolves(response);
      await submit();
      expect(block.querySelector('.dt-export-status').textContent).to.include('Could not download');
    }
    fetchStub.rejects(new Error('Offline'));
    await submit();
    expect(block.querySelector('.dt-export-status').textContent).to.include('Please try again');
    expect(downloadStub.called).to.equal(false);
    expect(objectUrlStub.called).to.equal(false);
  });

  it('does not download a partial CSV when reading the stream fails', async () => {
    fetchStub.resolves({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/csv' }),
      blob: () => Promise.reject(new Error('Activity export interrupted')),
    });
    await submit();
    expect(block.querySelector('.dt-export-status').textContent).to.include('complete CSV');
    expect(downloadStub.called).to.equal(false);
  });
});
