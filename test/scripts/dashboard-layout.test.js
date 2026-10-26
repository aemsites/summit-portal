import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setViewport } from '@web/test-runner-commands';
import { composeDashboard } from '../../scripts/dashboard-layout.js';
import { loadStyle } from '../../scripts/ak.js';
import initPicker from '../../blocks/customer-picker/customer-picker.js';
import initCallout from '../../blocks/report-callout/report-callout.js';
import initBoothGuide from '../../blocks/booth-guide-banner/booth-guide-banner.js';
import initTools from '../../blocks/dashboard-tools/dashboard-tools.js';

describe('dashboard layout', () => {
  let markup;
  let main;
  let sandbox;

  before(async () => {
    const response = await fetch(new URL('../fixtures/customer-picker-dashboard.html', import.meta.url));
    markup = await response.text();
  });

  beforeEach(() => {
    document.body.innerHTML = markup;
    main = document.querySelector('main');
    sandbox = sinon.createSandbox();
    main.querySelectorAll('.report-callout').forEach((callout) => initCallout(callout));
    const picker = main.querySelector('.customer-picker');
    picker.innerHTML = '<input type="search" aria-label="Company or website"><table><tbody><tr><td>Example</td></tr></tbody></table>';
    const booth = document.createElement('div');
    booth.className = 'booth-guide-banner';
    picker.before(booth);
    initBoothGuide(booth);
    const tools = document.createElement('div');
    tools.className = 'dashboard-tools';
    picker.after(tools);
    initTools(tools);
  });

  afterEach(async () => {
    sandbox.restore();
    document.body.replaceChildren();
    await setViewport({ width: 800, height: 600 });
  });

  it('test_dashboard_reuses_callouts_and_export_controls', async () => {
    const picker = main.querySelector('.customer-picker');
    const callouts = [...main.querySelectorAll('.report-callout')];
    const form = main.querySelector('.dt-export');
    const tools = main.querySelector('.dashboard-tools');
    const select = form.querySelector('select');
    const requestLink = main.querySelector('a[href="/adobe/report-requests"]');
    const formListener = sandbox.spy();
    form.addEventListener('submit', formListener);
    select.value = 'no_report';
    const fetchStub = sandbox.stub(window, 'fetch').resolves(new Response('', { status: 403 }));

    await composeDashboard(main, '/adobe/dashboard');
    const resources = main.querySelector('.dashboard-resources');
    expect(main.querySelector('.dashboard-reports .customer-picker')).to.equal(picker);
    callouts.forEach((callout) => expect(resources.contains(callout)).to.equal(true));
    expect(resources.querySelector('.dt-export')).to.equal(form);
    expect(resources.querySelector('.dashboard-tools')).to.equal(tools);
    expect(resources.querySelector('a[href="/adobe/report-requests"]')).to.equal(requestLink);
    expect(select.value).to.equal('no_report');
    expect([...select.options].map((option) => option.value)).to.deep.equal([
      '', 'search', 'no_report', 'report_selected', 'report_viewed', 'report_sent',
      'demo_selected', 'demo_viewed', 'contact_requested',
    ]);
    const exportAction = resources.querySelector('.dashboard-export-action');
    exportAction.click();
    const dialog = form.closest('dialog');
    expect(dialog.open).to.equal(true);
    expect(dialog.contains(document.activeElement)).to.equal(true);
    expect(tools.querySelector('details').open).to.equal(true);
    const guidance = dialog.textContent;
    [
      '90 days', 'Downloaded copies are your responsibility', 'not a unique person',
      'Email and Visit', 'unsuccessful lookups', 'do not prove reading',
      'not confirmed delivery', 'not sales-contact consent', 'historical contact opt-ins',
      'according to Adobe policy', 'dedicated browser profile without a portal sign-in',
    ].forEach((text) => expect(guidance).to.include(text));
    form.requestSubmit();
    await new Promise((resolve) => { setTimeout(resolve, 80); });
    expect(formListener.calledOnce).to.equal(true);
    expect(fetchStub.firstCall.args[0]).to.equal('/api/booth-activity.csv?kind=no_report');
    expect(dialog.querySelector('.dt-export-status').textContent).to.include('Adobe employee');
    dialog.querySelector('.dashboard-dialog-close').click();
    expect(dialog.open).to.equal(false);
    expect(document.activeElement).to.equal(exportAction);
  });

  it('retains each inventoried destination and all coverage and sharing guidance', async () => {
    await composeDashboard(main, '/adobe/dashboard/');
    const destinations = [...main.querySelectorAll('a[href]')].map((link) => link.getAttribute('href'));
    [
      '/adobe/report-requests', '/request-report', '/docs/sales-playbook',
      '/customers/0-9/000-demo/', '/adobe/booth-guide', '/booth',
      'https://digital-insights.corp.adobe.com/',
      'https://adobe.enterprise.slack.com/archives/C0ABMNDLXC5',
    ].forEach((path) => expect(destinations).to.include(path));
    expect(main.querySelector('.dashboard-request-more a').getAttribute('href'))
      .to.equal('https://digital-insights.corp.adobe.com/');
    [
      'Semrush', 'Adobe', 'small sites', 'redirects', 'blocked collection',
      'AI Visibility', 'Keyword Opportunities', 'no PDF', 'magic link',
      'without Adobe sign-in', 'portal access',
    ].forEach((text) => expect(main.textContent).to.include(text));
    expect(main.querySelectorAll('h1')).to.have.lengthOf(1);
    expect(main.querySelector('h1').textContent).to.equal('Digital Opportunity Reports');
    expect(main.querySelectorAll('.dashboard-resource-card')).to.have.lengthOf(5);
    expect(main.querySelector('.dashboard-jump').getAttribute('href')).to.equal('#dashboard-resources');
  });

  it('should make the Slack channel visible for platform and report questions', async () => {
    await composeDashboard(main, '/adobe/dashboard');
    const resources = main.querySelector('.dashboard-resources');
    const link = resources.querySelector('a[href="https://adobe.enterprise.slack.com/archives/C0ABMNDLXC5"]');
    expect(link !== null).to.equal(true);
    expect(link.textContent).to.equal('Ask in #digital-insights');
    expect(link.target).to.equal('_blank');
    expect(link.rel.split(/\s+/)).to.include('noopener');
    expect(link.closest('dialog') === null).to.equal(true);
    const card = link.closest('.dashboard-resource-card');
    expect(resources.querySelector('.dashboard-resource-card') === card).to.equal(true);
    expect(card.querySelector('h3').textContent).to.equal('Questions & help');
    ['platform', 'Digital Insights', 'Digital Opportunity reports', 'Slack']
      .forEach((text) => expect(card.textContent).to.include(text));
    link.focus();
    expect(document.activeElement === link).to.equal(true);
  });

  it('should reuse an authored Slack link without hiding it or losing its listener', async () => {
    const link = document.createElement('a');
    link.href = 'https://adobe.enterprise.slack.com/archives/C0ABMNDLXC5';
    link.textContent = 'Join our Slack channel';
    const listener = sandbox.spy((event) => event.preventDefault());
    link.addEventListener('click', listener);
    main.querySelector('.default-content').append(link);
    await composeDashboard(main, '/adobe/dashboard');
    expect(main.querySelectorAll(`.dashboard-resource-actions a[href="${link.href}"]`)).to.have.lengthOf(1);
    expect(link.closest('.dashboard-resources') !== null).to.equal(true);
    expect(link.closest('dialog') === null).to.equal(true);
    expect(link.textContent).to.equal('Ask in #digital-insights');
    link.click();
    expect(listener.calledOnce).to.equal(true);
  });

  it('should retain every original guidance text and link inside its information panel', async () => {
    const sources = [...main.querySelectorAll(
      '.report-callout, .booth-guide-banner, .dashboard-tools, .default-content > p',
    )];
    const text = (element) => element.textContent.replace(/\s+/g, ' ').trim();
    const inventory = sources.map((source) => ({
      source,
      text: text(source),
      links: [...source.querySelectorAll('a[href]')].map((link) => ({
        href: link.getAttribute('href'),
        label: text(link),
        target: link.getAttribute('target'),
        rel: link.getAttribute('rel'),
        description: link.getAttribute('aria-describedby'),
      })),
    }));
    await composeDashboard(main, '/adobe/dashboard');
    inventory.forEach((original) => {
      expect(original.source.closest('dialog') !== null).to.equal(true);
      expect(text(original.source)).to.equal(original.text);
      original.links.forEach((expected) => {
        const link = [...original.source.querySelectorAll('a[href]')]
          .find((candidate) => candidate.getAttribute('href') === expected.href);
        expect(link !== undefined, expected.href).to.equal(true);
        expect(text(link)).to.equal(expected.label);
        expect(link.getAttribute('target')).to.equal(expected.target);
        expect(link.getAttribute('rel')).to.equal(expected.rel);
        expect(link.getAttribute('aria-describedby')).to.equal(expected.description);
      });
    });
  });

  it('should keep the original shortcut listener and a usable guidance link without duplicate IDs', async () => {
    const source = main.querySelector('.report-callout.report-requests');
    const link = source.querySelector('a[href="/adobe/report-requests"]');
    link.id = 'authored-request-link';
    link.innerHTML = '<span id="authored-request-label">Open report requests</span>';
    const listener = sandbox.spy((event) => event.preventDefault());
    link.addEventListener('click', listener);
    await composeDashboard(main, '/adobe/dashboard');
    const copy = source.querySelector('a[href="/adobe/report-requests"]');
    expect(copy !== null).to.equal(true);
    expect(copy === link).to.equal(false);
    expect(copy.textContent).to.equal('Open report requests');
    expect(main.querySelectorAll('#authored-request-link')).to.have.lengthOf(1);
    expect(main.querySelectorAll('#authored-request-label')).to.have.lengthOf(1);
    expect(link.closest('.dashboard-resource-actions') !== null).to.equal(true);
    link.click();
    expect(listener.calledOnce).to.equal(true);
  });

  it('should give leading guidance emphasis a heading without reordering inline emphasis', async () => {
    const source = main.querySelector('.report-callout.neutral');
    const paragraph = source.querySelector('.rcl-text');
    const lead = paragraph.querySelector('strong');
    paragraph.prepend(document.createTextNode(' \n'));
    const other = document.createElement('p');
    other.className = 'rcl-text';
    other.innerHTML = 'Keep this <strong>inline emphasis</strong> in its sentence. <strong>Another point.</strong> Keep all its detail.';
    source.querySelector('.rcl-bar').append(other);
    const inline = other.querySelector('strong');
    const nextPoint = other.querySelectorAll('strong')[1];
    const original = source.textContent.replace(/\s+/g, ' ').trim();
    await composeDashboard(main, '/adobe/dashboard');
    expect(lead.parentElement.tagName).to.equal('H3');
    expect(inline.parentElement === other).to.equal(true);
    expect(nextPoint.parentElement.tagName).to.equal('P');
    expect(nextPoint.parentElement === other).to.equal(false);
    expect(source.textContent.replace(/\s+/g, ' ').trim()).to.equal(original);
  });

  it('should keep information panels readable and closable across themes and short or narrow viewports', async () => {
    await composeDashboard(main, '/adobe/dashboard');
    await Promise.all([
      '../../styles/styles.css',
      '../../blocks/report-callout/report-callout.css',
      '../../blocks/booth-guide-banner/booth-guide-banner.css',
      '../../blocks/dashboard-tools/dashboard-tools.css',
    ].map((path) => loadStyle(new URL(path, import.meta.url).href)));
    const originalScheme = document.documentElement.style.colorScheme;
    try {
      for (const scheme of ['light', 'dark']) {
        document.documentElement.style.colorScheme = scheme;
        for (const [width, height] of [[1440, 1000], [740, 436], [320, 900]]) {
          await setViewport({ width, height });
          for (const opener of main.querySelectorAll('.dashboard-resource-action')) {
            opener.click();
            const dialog = opener.closest('.dashboard-resource-card').querySelector('dialog');
            const body = dialog.querySelector('.dashboard-dialog-content');
            const title = dialog.querySelector('[id$="-title"]');
            const close = dialog.querySelector('.dashboard-dialog-close');
            const box = dialog.getBoundingClientRect();
            expect(box.left).to.be.at.least(0);
            expect(box.right).to.be.at.most(width);
            expect(box.top).to.be.at.least(0);
            expect(box.bottom).to.be.at.most(height);
            expect(body.getBoundingClientRect().width).to.be.at.most(box.width);
            expect(body.scrollWidth).to.be.at.most(body.clientWidth);
            const titleSize = parseFloat(getComputedStyle(title).fontSize);
            body.querySelectorAll('h2, h3, h4').forEach((heading) => {
              expect(parseFloat(getComputedStyle(heading).fontSize)).to.be.lessThan(titleSize);
              expect(Number(heading.getAttribute('aria-level') || heading.tagName.slice(1)))
                .to.be.at.least(3);
            });
            body.querySelectorAll('.dt-retention, .dt-guidance, .dt-export-status').forEach((copy) => {
              expect(parseFloat(getComputedStyle(copy).fontSize)).to.be.at.least(14);
            });
            body.querySelectorAll('.dt-retention, .dt-export-status').forEach((copy) => {
              expect(parseFloat(getComputedStyle(copy).marginTop)).to.be.at.least(8);
            });
            expect(body.tabIndex).to.equal(0);
            body.focus();
            expect(document.activeElement === body).to.equal(true);
            [...dialog.querySelectorAll('a, button, select, summary')]
              .filter((control) => control.getClientRects().length)
              .forEach((control) => {
                const size = control.getBoundingClientRect();
                expect(size.width, control.textContent).to.be.at.least(44);
                expect(size.height, control.textContent).to.be.at.least(44);
              });
            body.scrollTop = body.scrollHeight;
            const closeBox = close.getBoundingClientRect();
            expect(closeBox.top).to.be.at.least(0);
            expect(closeBox.bottom).to.be.at.most(height);
            close.click();
            expect(document.activeElement === opener).to.equal(true);
          }
        }
      }
    } finally {
      document.documentElement.style.colorScheme = originalScheme;
    }
  });

  it('test_unknown_callout_remains_reachable', async () => {
    const announcement = document.createElement('div');
    announcement.className = 'report-callout neutral';
    announcement.innerHTML = '<aside><p>Additional announcement. <button type="button">Keep this action</button></p></aside>';
    const button = announcement.querySelector('button');
    const listener = sandbox.spy();
    button.addEventListener('click', listener);
    main.querySelector('.customer-picker').after(announcement);
    await composeDashboard(main, '/adobe/dashboard');
    expect(main.querySelector('.dashboard-resources').contains(announcement)).to.equal(true);
    const card = announcement.closest('.dashboard-resource-card');
    expect(card).to.exist;
    card.querySelector('.dashboard-resource-action').click();
    expect(announcement.closest('dialog').open).to.equal(true);
    button.click();
    expect(listener.calledOnce).to.equal(true);
  });

  it('test_dashboard_composition_is_idempotent_and_route_scoped', async () => {
    const original = main.innerHTML;
    await composeDashboard(main, '/accounts/e/example/');
    expect(main.innerHTML).to.equal(original);
    const first = await composeDashboard(main, '/adobe/dashboard');
    const form = main.querySelector('.dt-export');
    const second = await composeDashboard(main, '/adobe/dashboard/');
    expect(second).to.equal(first);
    expect(main.querySelectorAll('.dashboard-shell')).to.have.lengthOf(1);
    expect(main.querySelectorAll('.dashboard-resource-card')).to.have.lengthOf(5);
    expect(main.querySelectorAll('.dt-export')).to.have.lengthOf(1);
    expect(main.querySelector('.dt-export')).to.equal(form);
    expect(main.querySelectorAll('h1')).to.have.lengthOf(1);
    expect(document.head.querySelectorAll('link[href$="/styles/dashboard.css"]')).to.have.lengthOf(1);
  });

  it('preserves an unrecognized authored section and restores resource-dialog focus on Escape', async () => {
    const extra = document.createElement('section');
    extra.innerHTML = '<h2>Additional policy</h2><p>Do not discard this authored information.</p>';
    main.append(extra);
    await composeDashboard(main, '/adobe/dashboard');
    expect(main.querySelector('.dashboard-resources').contains(extra)).to.equal(true);
    const card = extra.closest('.dashboard-resource-card');
    const open = card.querySelector('.dashboard-resource-action');
    open.click();
    const dialog = extra.closest('dialog');
    expect(dialog.open).to.equal(true);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog.open).to.equal(false);
    expect(document.activeElement).to.equal(open);
  });

  it('keeps real report controls within the desktop and 320px layouts with 44px targets', async () => {
    const picker = main.querySelector('.customer-picker');
    picker.innerHTML = '<a href="/data/company-list.json">Companies</a>';
    sandbox.stub(window, 'fetch').callsFake(async (url) => Response.json({
      data: String(url).includes('insights-list.json') ? [{
        Report: 'example.test',
        Customers: 'Example company',
        Folder: '/accounts/e/example/insights/example-test/portal-landing/',
      }] : [],
    }));
    const dispose = await initPicker(picker);
    try {
      await dispose.ready;
      await loadStyle(new URL('../../styles/styles.css', import.meta.url).href);
      await loadStyle(new URL('../../blocks/customer-picker/customer-picker.css', import.meta.url).href);
      await composeDashboard(main, '/adobe/dashboard');
      for (const width of [1440, 900, 600, 320]) {
        await setViewport({ width, height: 900 });
        expect(document.documentElement.scrollWidth).to.be.at.most(width);
        expect(picker.querySelector('.cp-details-action, .cp-more') === null).to.equal(true);
        expect([...picker.querySelectorAll('.cp-row-actions a, .cp-row-actions button')]
          .map((control) => control.textContent)).to.deep.equal(['Open', 'Share']);
        expect(getComputedStyle(picker.querySelector('tbody tr')).cursor).to.equal('pointer');
        picker.querySelector('.cp-website').click();
        const dialog = document.querySelector('.cp-report-dialog');
        expect(dialog.open).to.equal(true);
        dialog.querySelector('.cp-dialog-close').click();
        expect(document.activeElement === picker.querySelector('.cp-company')).to.equal(true);
        const controls = main.querySelectorAll('button, a, summary, input, select');
        [...controls].filter((control) => control.getClientRects().length).forEach((control) => {
          const box = control.getBoundingClientRect();
          expect(box.width, control.textContent || control.getAttribute('aria-label')).to.be.at.least(44);
          expect(box.height, control.textContent || control.getAttribute('aria-label')).to.be.at.least(44);
        });
      }
    } finally {
      dispose();
    }
  });
});
