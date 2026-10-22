import { expect } from '@esm-bundle/chai';
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
