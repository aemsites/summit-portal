import { expect } from '@esm-bundle/chai';
import { parseInsightFolder, groupInsightsByWebsite } from '../../blocks/customer-picker/customer-picker.js';

describe('customer-picker › parseInsightFolder', () => {
  it('treats the segment after /insights/ as the website anchor', () => {
    expect(parseInsightFolder('/accounts/a/accenture/insights/accenture-com/'))
      .to.deep.equal({ websiteFolder: '/accounts/a/accenture/insights/accenture-com/', variant: '' });
  });

  it('extracts the variant one level below the website', () => {
    expect(parseInsightFolder('/accounts/a/accenture/insights/accenture-com/portal-landing/'))
      .to.deep.equal({ websiteFolder: '/accounts/a/accenture/insights/accenture-com/', variant: 'portal-landing' });
  });

  it('extracts event-format variants', () => {
    expect(parseInsightFolder('/accounts/b/bank-of-america/insights/bankofamerica-com/cannes-2026/'))
      .to.deep.equal({ websiteFolder: '/accounts/b/bank-of-america/insights/bankofamerica-com/', variant: 'cannes-2026' });
  });
});

describe('customer-picker › groupInsightsByWebsite', () => {
  it('collapses a bare report and its portal-landing into ONE card', () => {
    const cards = groupInsightsByWebsite([
      { Report: 'accenture.com', Customers: 'Accenture', Folder: '/accounts/a/accenture/insights/accenture-com/' },
      { Report: 'accenture.com', Customers: 'Accenture', Folder: '/accounts/a/accenture/insights/accenture-com/portal-landing/' },
    ]);
    expect(cards).to.have.lengthOf(1);
  });

  it('makes portal-landing win — the card links to it and offers no other variant', () => {
    const [card] = groupInsightsByWebsite([
      { Report: 'amazon.com', Customers: 'Amazon', Folder: '/accounts/a/amazon/insights/amazon-com/' },
      { Report: 'amazon.com', Customers: 'Amazon', Folder: '/accounts/a/amazon/insights/amazon-com/portal-landing/' },
    ]);
    expect(card.Folder).to.equal('/accounts/a/amazon/insights/amazon-com/portal-landing/');
    expect(card.formats).to.have.lengthOf(0);
  });

  it('portal-landing also wins over event formats', () => {
    const [card] = groupInsightsByWebsite([
      { Report: 'bankofamerica.com', Folder: '/accounts/b/bofa/insights/bofa-com/cannes-2026/' },
      { Report: 'bankofamerica.com', Folder: '/accounts/b/bofa/insights/bofa-com/summit-2026/' },
      { Report: 'bankofamerica.com', Folder: '/accounts/b/bofa/insights/bofa-com/portal-landing/' },
    ]);
    expect(card.Folder).to.equal('/accounts/b/bofa/insights/bofa-com/portal-landing/');
    expect(card.formats).to.have.lengthOf(0);
  });

  it('lists event formats as selectable reports when there is no portal-landing', () => {
    const [card] = groupInsightsByWebsite([
      { Report: 'schiphol.nl', Folder: '/accounts/s/schiphol/insights/schiphol-nl/cannes-2026/' },
      { Report: 'schiphol.nl', Folder: '/accounts/s/schiphol/insights/schiphol-nl/summit-2026/' },
    ]);
    // sorted by label: "Adobe Summit 2026" < "Cannes Lions 2026"
    expect(card.formats.map((f) => f.format)).to.deep.equal(['summit-2026', 'cannes-2026']);
    expect(card.Folder).to.equal('/accounts/s/schiphol/insights/schiphol-nl/summit-2026/');
  });

  it('keeps a single bare report as a one-link card', () => {
    const [card] = groupInsightsByWebsite([
      { Report: '1800flowers.com', Folder: '/accounts/0-9/1-800-flowers/insights/1800flowers-com/' },
    ]);
    expect(card.Folder).to.equal('/accounts/0-9/1-800-flowers/insights/1800flowers-com/');
    expect(card.formats).to.have.lengthOf(0);
  });

  it('keeps the same website under DIFFERENT account folders as distinct cards', () => {
    const cards = groupInsightsByWebsite([
      { Report: 'delta.com', Folder: '/accounts/d/delta/insights/delta-com/' },
      { Report: 'delta.com', Folder: '/accounts/d/delta-air-lines/insights/delta-com/' },
    ]);
    expect(cards).to.have.lengthOf(2);
  });

  it('keeps distinct websites within one account separate', () => {
    const cards = groupInsightsByWebsite([
      { Report: 'amazon.com', Folder: '/accounts/a/amazon/insights/amazon-com/' },
      { Report: 'amazon.co.uk', Folder: '/accounts/a/amazon/insights/amazon-co-uk/portal-landing/' },
    ]);
    expect(cards).to.have.lengthOf(2);
  });
});
