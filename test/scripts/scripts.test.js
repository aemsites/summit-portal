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

  it('adds a closed export after the reports list once, without moving announcements, including a trailing slash', async () => {
    const main = document.createElement('main');
    main.innerHTML = `
      <div class="section"><div class="block-content">
        <h1>Select a Customer</h1>
        <div class="report-callout neutral"><p>Existing dashboard note.</p></div>
        <div class="customer-picker">
          <div class="cp-search"><input type="search"></div>
          <div class="cp-grid"><a class="cp-card" href="/accounts/e/example/">Example report</a></div>
        </div>
      </div></div>
    `;
    document.body.append(main);
    await ensureRequiredRouteBlocks('/adobe/dashboard/');
    await ensureRequiredRouteBlocks('/adobe/dashboard');
    expect(main.querySelectorAll('.dashboard-tools')).to.have.length(1);
    expect(main.querySelectorAll('.booth-guide-banner')).to.have.length(1);
    expect(main.querySelector('.customer-picker').previousElementSibling.className).to.equal('booth-guide-banner');
    expect(main.querySelector('.booth-guide-banner a').getAttribute('href')).to.equal('/adobe/booth-guide');
    expect(main.querySelector('.dt-usage').open).to.equal(false);
    expect(main.querySelector('.customer-picker').nextElementSibling.className).to.equal('dashboard-tools');
    expect(main.querySelector('.customer-picker .dashboard-tools')).to.equal(null);
    expect(main.querySelector('.cp-search').nextElementSibling.className).to.equal('cp-grid');
    expect(main.querySelector('.cp-card').textContent).to.equal('Example report');
    expect(main.querySelector('.report-callout').textContent).to.include('Existing dashboard note');
    expect(main.querySelector('.dashboard-tools .report-callout')).to.equal(null);
    expect(main.querySelector('.customer-picker input')).to.exist;
    main.remove();
  });

  it('does not add dashboard tools to other routes or pages without a report picker', async () => {
    const main = document.createElement('main');
    main.innerHTML = '<div class="customer-picker"></div>';
    document.body.append(main);
    await ensureRequiredRouteBlocks('/accounts/e/example/portal-landing/');
    expect(main.querySelector('.dashboard-tools')).to.equal(null);
    expect(main.querySelector('.booth-guide-banner')).to.equal(null);
    main.replaceChildren();
    await ensureRequiredRouteBlocks('/adobe/dashboard');
    expect(main.querySelector('.dashboard-tools')).to.equal(null);
    main.remove();
  });

  it('initializes a visible access-denied recovery without duplicate decoration', async () => {
    const main = document.createElement('main');
    main.innerHTML = '<div><p>You are not authorized.</p></div>';
    document.body.append(main);
    await ensureRequiredRouteBlocks('/403');
    await ensureRequiredRouteBlocks('/403');
    expect(main.querySelectorAll('.portal-recovery')).to.have.length(1);
    expect(main.querySelector('.section').style.display).to.equal('block');
    expect(main.querySelector('h1').textContent).to.include("isn't available");
    expect(main.querySelector('.pr-primary').getAttribute('href')).to.equal('/request-report');
    main.remove();
  });
});
