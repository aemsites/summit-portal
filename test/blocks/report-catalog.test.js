import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import initPicker, { buildEventCompanies, parseEventModes } from '../../blocks/customer-picker/customer-picker.js';
import {
  campaignsForFolder, filterReports, paginateReports, qualifyCampaigns, readReportState,
  searchCampaigns,
} from '../../blocks/customer-picker/report-catalog.js';

describe('report catalog', () => {
  const folder = '/accounts/f/frescopa/insights/frescopa-example/portal-landing/';

  it('filters the complete 10,765-row dataset by company or website before paging', () => {
    const rows = Array.from({ length: 10765 }, (_, i) => ({
      Company: `Company ${String(i).padStart(5, '0')}`,
      Report: `site${i}.example`,
      Folder: `/accounts/c/company-${i}/insights/site-${i}/portal-landing/`,
    }));
    expect(paginateReports(filterReports(rows, ''), { page: 1, size: 25 }).rows).to.have.lengthOf(25);
    expect(filterReports(rows, 'company 10764').map((r) => r.Report)).to.deep.equal(['site10764.example']);
    expect(filterReports(rows, 'site10764.example').map((r) => r.Company)).to.deep.equal(['Company 10764']);
    expect(rows).to.have.lengthOf(10765);
  });

  describe('real DIH publisher to portal contract', () => {
    let contract;
    let el;
    let sandbox;
    let dispose;
    let originalUrl;
    let fetchStub;
    let failRegistry;
    const observers = [];
    const contractFolder = '/accounts/f/frescopa/insights/frescopa-example/portal-landing/';

    before(async () => {
      const response = await fetch(new URL('../fixtures/portal-campaign-contract.json', import.meta.url));
      expect(response.ok, 'Generate the fixture with the real DIH producer test first').to.equal(true);
      contract = await response.json();
    });

    beforeEach(() => {
      originalUrl = window.location.href;
      window.history.replaceState(null, '', '/adobe/dashboard?tab=insights&q=Frescopa');
      sandbox = sinon.createSandbox();
      sandbox.stub(navigator.clipboard, 'writeText').resolves();
      el = document.createElement('div');
      el.className = 'customer-picker';
      el.innerHTML = '<a href="/data/company-list.json">Companies</a>';
      document.body.append(el);
      failRegistry = false;
      fetchStub = sandbox.stub(window, 'fetch').callsFake(async (value) => {
        const path = new URL(value, window.location.origin).pathname;
        if (path === '/auth/sharelink') return Response.json({ result: 'link', link: 'https://example.invalid/synthetic' });
        const key = path.split('/').pop().replace('.json', '');
        if (key === 'event-tabs' && failRegistry) return new Response('', { status: 503 });
        return Response.json(contract[key] || { data: [] });
      });
    });

    afterEach(() => {
      dispose?.();
      observers.splice(0).forEach((observer) => observer.disconnect());
      el.remove();
      sandbox.restore();
      localStorage.clear();
      window.history.replaceState(null, '', originalUrl);
    });

    async function load() {
      dispose = await initPicker(el);
      await dispose.ready;
    }

    function until(predicate) {
      return new Promise((resolve) => {
        if (predicate()) { resolve(); return; }
        const observer = new MutationObserver(() => {
          if (predicate()) { observer.disconnect(); resolve(); }
        });
        observers.push(observer);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      });
    }

    async function assertExactActions(path) {
      const dialog = document.querySelector('.cp-report-dialog');
      expect(new URL(dialog.querySelector('.cp-dialog-actions a').href).pathname).to.equal(path);
      expect(dialog.querySelector('.cp-dialog-actions a:nth-child(2)').href)
        .to.equal(`https://da.live/canvas#/aemsites/summit-portal${path}index`);
      dialog.querySelector('.cp-share-copy').click();
      await until(() => dialog.querySelector('.cp-share-status').dataset.kind === 'success');
      const request = fetchStub.getCalls().filter((call) => call.args[0] === '/auth/sharelink').at(-1);
      expect(JSON.parse(request.args[1].body)).to.deep.equal({ path, mode: 'copy' });
      expect(dialog.querySelector('.cp-share-input').value).to.equal('');
    }

    it('consumes actual emitted stable IDs, aliases and preserved sheet envelopes', () => {
      const rows = contract['insights-list'].data;
      const modes = qualifyCampaigns(parseEventModes(contract['event-tabs'].data, []));
      expect(modes.map((mode) => mode.id)).to.deep.equal(['cannes', 'dih-cv_owner', 'dih-cv_reuse']);
      expect(new Set(modes.map((mode) => mode.displayLabel)).size).to.equal(3);
      modes.slice(1).forEach((mode) => {
        const matching = buildEventCompanies(rows, mode.column)
          .filter((row) => row.Folder === contractFolder);
        expect(matching).to.have.lengthOf(1);
        expect(matching[0].Company).to.equal('Frescopa');
      });
      const legacy = buildEventCompanies(rows, 'Cannes 2026');
      expect(legacy.map((row) => row.Company)).to.deep.equal(['Frescopa', 'Frescopa Studio']);
      expect(legacy.every((row) => row.Folder === contractFolder)).to.equal(true);
      expect(campaignsForFolder(rows, modes, contractFolder)).to.have.lengthOf(3);
      expect(contract['insights-list'].custom).to.equal('retained');
      expect(contract['event-tabs'][':type']).to.equal('sheet');
    });

    it('uses identical page actions in both managed campaigns and a legacy alias', async () => {
      await load();
      for (const identity of ['cv_owner', 'cv_reuse', 'cannes']) {
        el.querySelector('.cp-campaign-trigger').click();
        const input = el.querySelector('.cp-campaign-search');
        input.value = identity;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        el.querySelector('[role="option"]').click();
        expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(identity === 'cannes' ? 2 : 1);
        const companies = [...el.querySelectorAll('.cp-company')];
        companies.at(-1).click();
        const labels = [...document.querySelectorAll('.cp-campaign-memberships li')]
          .map((item) => item.textContent);
        expect(labels).to.have.lengthOf(3);
        expect(labels.some((label) => label.includes('cv_owner'))).to.equal(true);
        expect(labels.some((label) => label.includes('cv_reuse'))).to.equal(true);
        expect(labels.some((label) => label.includes('Legacy'))).to.equal(true);
        await assertExactActions(contractFolder);
        document.querySelector('.cp-dialog-close').click();
      }
    });

    it('requires an emitted format before opening or sharing that exact page', async () => {
      window.history.replaceState(null, '', '/adobe/dashboard?tab=insights&q=Northstar');
      await load();
      expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(1);
      el.querySelector('.cp-company').click();
      const dialog = document.querySelector('.cp-report-dialog');
      expect(dialog.querySelectorAll('.cp-dialog-actions a')).to.have.lengthOf(0);
      const formats = contract['insights-list'].data.filter((row) => row.Report === 'northstar.example');
      for (const format of formats) {
        const select = dialog.querySelector('.cp-format-select');
        select.value = format.Folder;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect([...dialog.querySelectorAll('.cp-campaign-memberships li')].map((item) => item.textContent))
          .to.have.lengthOf(1).and.satisfy((labels) => labels[0].includes('cv_owner'));
        await assertExactActions(format.Folder);
      }
    });

    it('holds a managed selection during registry failure and recovers on retry', async () => {
      failRegistry = true;
      window.history.replaceState(null, '', '/adobe/dashboard?tab=dih-cv_owner&q=Frescopa');
      await load();
      expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(0);
      expect(el.querySelector('.cp-results').textContent).to.include('cannot be resolved');
      failRegistry = false;
      el.querySelector('.cp-catalog-notices .cp-retry').click();
      await until(() => el.querySelectorAll('tbody tr').length === 1);
      expect(new URLSearchParams(window.location.search).get('tab')).to.equal('dih-cv_owner');
      el.querySelector('.cp-company').click();
      expect(document.querySelectorAll('.cp-campaign-memberships li')).to.have.lengthOf(3);
      await assertExactActions(contractFolder);
    });
  });

  [25, 50, 100].forEach((size) => {
    it(`paginates ${size} rows with a correctly clamped last page`, () => {
      const rows = Array.from({ length: 10765 }, (_, i) => i);
      const page = paginateReports(rows, { page: 99999, size });
      expect(page.total).to.equal(10765);
      expect(page.page).to.equal(Math.ceil(10765 / size));
      expect(page.pageCount).to.equal(page.page);
      expect(page.rows[page.rows.length - 1]).to.equal(10764);
      expect(page.rows.length).to.be.at.most(size);
    });
  });

  it('normalizes invalid paging without changing the input dataset', () => {
    const one = paginateReports(['one'], { page: -2, size: 7 });
    expect(one).to.deep.equal({ rows: ['one'], total: 1, page: 1, pageCount: 1 });
    const empty = paginateReports([], { page: Infinity, size: 25 });
    expect(empty).to.deep.equal({ rows: [], total: 0, page: 1, pageCount: 1 });
  });

  it('searches accents, company aliases and website fragments together', () => {
    const rows = [
      { Company: 'Éclair', Customers: 'Éclair; Studio North', Report: 'eclair.example', Folder: '/e/' },
      { Company: 'Zeta', Report: 'zeta.example', Folder: '/z/' },
    ];
    expect(filterReports(rows, 'ECLAIR example')[0].Company).to.equal('Éclair');
    expect(filterReports(rows, 'studio north')).to.have.lengthOf(1);
  });

  it('sorts by company, then website, then exact path for stable page boundaries', () => {
    const rows = [
      { Company: 'Zeta', Report: 'a.example', Folder: '/a/' },
      { Company: 'Acme', Report: 'b.example', Folder: '/b/' },
      { Company: 'Acme', Report: 'a.example', Folder: '/z/' },
      { Company: 'Acme', Report: 'a.example', Folder: '/a/' },
    ];
    expect(filterReports(rows, '').map((r) => r.Folder)).to.deep.equal(['/a/', '/z/', '/b/', '/a/']);
    expect(rows[0].Company).to.equal('Zeta');
  });

  it('finds every matching campaign among more than 30, with partial accent-insensitive search', () => {
    const modes = Array.from({ length: 38 }, (_, i) => ({ id: `event-${i}`, label: i === 37 ? 'Événement Northern Europe' : `Campaign ${i}` }));
    expect(searchCampaigns(modes, 'nÓRTH')[0].id).to.equal('event-37');
    expect(searchCampaigns(modes, 'campaign')).to.have.lengthOf(37);
    expect(searchCampaigns(modes, 'not present')).to.deep.equal([]);
  });

  it('qualifies same-named legacy and DIH campaigns without merging them', () => {
    const modes = qualifyCampaigns([
      { id: 'paris', label: 'Paris', column: 'Paris 2026' },
      { id: 'dih-cv_first', label: 'Paris', column: 'DIH cv_first', campaignId: 'cv_first' },
      { id: 'dih-cv_second', label: 'Paris', column: 'DIH cv_second', campaignId: 'cv_second' },
    ]);
    expect(modes.map((m) => m.id)).to.deep.equal(['paris', 'dih-cv_first', 'dih-cv_second']);
    expect(modes[0].displayLabel).to.include('Legacy').and.include('paris');
    expect(modes[1].displayLabel).to.include('DIH').and.include('cv_first');
    expect(modes[2].displayLabel).to.include('cv_second');
    expect(new Set(modes.map((m) => m.displayLabel)).size).to.equal(3);
  });

  it('lists every membership only for the exact normalized selected path', () => {
    const rows = [
      { Folder: folder, Paris: 'Frescopa', London: 'Frescopa' },
      { Folder: '/accounts/f/frescopa/insights/frescopa-example/cannes-2026/', Cannes: 'Frescopa' },
    ];
    const modes = [
      { id: 'paris', label: 'Paris', column: 'Paris' },
      { id: 'london', label: 'London', column: 'London' },
      { id: 'cannes', label: 'Cannes', column: 'Cannes' },
    ];
    expect(campaignsForFolder(rows, modes, `https://act.aem.now${folder.slice(0, -1)}`))
      .to.deep.equal([{ id: 'paris', label: 'Paris' }, { id: 'london', label: 'London' }]);
    expect(campaignsForFolder(rows, modes, '/unrelated/')).to.deep.equal([]);
  });

  it('normalizes invalid URL state while retaining stable campaign IDs and query', () => {
    const modes = [{ id: 'cannes', label: 'Cannes' }];
    expect(readReportState('?tab= CANNES &q=Acme&page=-7&size=13', modes)).to.deep.equal({ mode: 'cannes', query: 'Acme', page: 1, size: 25, unknownCampaign: '' });
    expect(readReportState('?tab=accounts&page=2&size=50', modes)).to.deep.equal({ mode: 'insights', query: '', page: 2, size: 50, unknownCampaign: 'accounts' });
    expect(readReportState('?tab=portal', modes).mode).to.equal('portal');
  });
});
