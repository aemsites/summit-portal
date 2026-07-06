import { expect } from '@esm-bundle/chai';
import { parseInsightFolder, groupInsightsByWebsite, buildEventCompanies } from '../../blocks/customer-picker/customer-picker.js';

describe('customer-picker › parseInsightFolder', () => {
  it('treats the segment after /insights/ as the website slug', () => {
    expect(parseInsightFolder('/accounts/a/accenture/insights/accenture-com/'))
      .to.deep.equal({ website: 'accenture-com', variant: '', folder: '/accounts/a/accenture/insights/accenture-com/' });
  });

  it('extracts the variant one level below the website', () => {
    expect(parseInsightFolder('/accounts/a/accenture/insights/accenture-com/portal-landing/'))
      .to.deep.equal({ website: 'accenture-com', variant: 'portal-landing', folder: '/accounts/a/accenture/insights/accenture-com/portal-landing/' });
  });

  it('extracts event-format variants', () => {
    expect(parseInsightFolder('/accounts/b/bank-of-america/insights/bankofamerica-com/cannes-2026/'))
      .to.deep.equal({ website: 'bankofamerica-com', variant: 'cannes-2026', folder: '/accounts/b/bank-of-america/insights/bankofamerica-com/cannes-2026/' });
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

  it('shows ONE card for a website filed under several different accounts', () => {
    // ey.com lives under ernst-young (bare), ey (portal-landing), ey-studio (portal-landing)
    const cards = groupInsightsByWebsite([
      { Report: 'ey.com', Customers: 'Ernst & Young', Folder: '/accounts/e/ernst-young/insights/ey-com/', Created: '8.05.2026' },
      { Report: 'ey.com', Customers: 'EY', Folder: '/accounts/e/ey/insights/ey-com/portal-landing/', Created: '18.06.2026' },
      { Report: 'ey.com', Customers: 'EY Studio+', Folder: '/accounts/e/ey-studio/insights/ey-com/portal-landing/', Created: '17.06.2026' },
    ]);
    expect(cards).to.have.lengthOf(1);
    // most-recent portal-landing wins (18.06 over 17.06; bare suppressed)
    expect(cards[0].Folder).to.equal('/accounts/e/ey/insights/ey-com/portal-landing/');
    expect(cards[0].formats).to.have.lengthOf(0);
  });

  it('picks the most recent portal-landing across accounts', () => {
    const [card] = groupInsightsByWebsite([
      { Report: 'delta.com', Folder: '/accounts/d/delta/insights/delta-com/portal-landing/', Created: '1.05.2026' },
      { Report: 'delta.com', Folder: '/accounts/d/delta-fox/insights/delta-com/portal-landing/', Created: '14.06.2026' },
    ]);
    expect(card.Folder).to.equal('/accounts/d/delta-fox/insights/delta-com/portal-landing/');
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

  it('keeps distinct websites separate', () => {
    const cards = groupInsightsByWebsite([
      { Report: 'amazon.com', Folder: '/accounts/a/amazon/insights/amazon-com/' },
      { Report: 'amazon.co.uk', Folder: '/accounts/a/amazon/insights/amazon-co-uk/portal-landing/' },
    ]);
    expect(cards).to.have.lengthOf(2);
  });

  it('carries a Report Notice through to the card', () => {
    const [card] = groupInsightsByWebsite([
      {
        Report: 'dragonsgroup.com',
        Folder: '/accounts/d/dragons-group/insights/dragonsgroup-com/portal-landing/',
        'Report Notice': 'no-seo-ai',
      },
    ]);
    expect(card.ReportNotice).to.equal('no-seo-ai');
  });

  it('prefers the portal-landing row notice over a bare-report row', () => {
    const [card] = groupInsightsByWebsite([
      { Report: 'x.com', Folder: '/accounts/x/x/insights/x-com/', 'Report Notice': '' },
      { Report: 'x.com', Folder: '/accounts/x/x/insights/x-com/portal-landing/', 'Report Notice': 'no-ai-visibility' },
    ]);
    expect(card.ReportNotice).to.equal('no-ai-visibility');
  });

  it('defaults ReportNotice to empty when none is set', () => {
    const [card] = groupInsightsByWebsite([
      { Report: 'y.com', Folder: '/accounts/y/y/insights/y-com/portal-landing/' },
    ]);
    expect(card.ReportNotice).to.equal('');
  });
});

describe('customer-picker › buildEventCompanies', () => {
  const ROWS = [
    { Report: 'aida.de', Customers: 'AIDA Cruises', Folder: '/accounts/a/aida-cruises/insights/aida-de/portal-landing/', 'Cannes 2026': 'AIDA Cruises' },
    { Report: 'accenture.com', Customers: 'Accenture', Folder: '/accounts/a/accenture/insights/accenture-com/portal-landing/', 'Cannes 2026': 'Accenture' },
    { Report: '1800flowers.com', Customers: '1-800 Flowers', Folder: '/accounts/0-9/1-800-flowers/insights/1800flowers-com/', 'Cannes 2026': '' },
  ];

  it('includes only rows whose event column is non-empty', () => {
    const cards = buildEventCompanies(ROWS, 'Cannes 2026');
    expect(cards).to.have.lengthOf(2);
    expect(cards.map((c) => c.Company)).to.not.include('1-800 Flowers');
  });

  it('carries a Report Notice onto every card built from a row', () => {
    const cards = buildEventCompanies(
      [{ Report: 'ey.com', Customers: 'EY', Folder: '/accounts/e/ey/insights/ey-com/portal-landing/', 'Cannes 2026': 'EY; EY Studio+', 'Report Notice': 'no-keyword-data' }],
      'Cannes 2026',
    );
    expect(cards).to.have.lengthOf(2);
    expect(cards.every((c) => c.ReportNotice === 'no-keyword-data')).to.equal(true);
  });

  it('labels each card by the event column value, not the website/customer', () => {
    const [first] = buildEventCompanies(
      [{ Report: 'ey.com', Customers: 'EY', Folder: '/accounts/e/ey/insights/ey-com/portal-landing/', 'Cannes 2026': 'EY Studio+' }],
      'Cannes 2026',
    );
    expect(first.Company).to.equal('EY Studio+');
    expect(first.Customers).to.equal('EY'); // original customer preserved for dialog lookup
  });

  it('splits a ";"-joined cell into one card per company, all linking to the same page', () => {
    const cards = buildEventCompanies(
      [{ Report: 'ey.com', Customers: 'EY', Folder: '/accounts/e/ey/insights/ey-com/portal-landing/', 'Cannes 2026': 'EY; EY Studio+' }],
      'Cannes 2026',
    );
    expect(cards).to.have.lengthOf(2);
    expect(cards.map((c) => c.Company).sort()).to.deep.equal(['EY', 'EY Studio+']);
    expect(cards.every((c) => c.Folder === '/accounts/e/ey/insights/ey-com/portal-landing/')).to.be.true;
  });

  it('links each card directly to its own row folder (no website grouping)', () => {
    const cards = buildEventCompanies(
      [
        { Report: 'amazon.com', Folder: '/accounts/a/amazon/insights/amazon-com/portal-landing/', 'Cannes 2026': 'Amazon' },
        { Report: 'amazon.co.uk', Folder: '/accounts/a/amazon/insights/amazon-co-uk/portal-landing/', 'Cannes 2026': 'Amazon' },
      ],
      'Cannes 2026',
    );
    expect(cards).to.have.lengthOf(2); // same name, distinct pages — both kept
    expect(cards.map((c) => c.Folder)).to.include('/accounts/a/amazon/insights/amazon-co-uk/portal-landing/');
  });

  it('sorts cards by label', () => {
    const cards = buildEventCompanies(
      [
        { Folder: '/accounts/z/zeta/insights/zeta-com/portal-landing/', 'Cannes 2026': 'Zeta' },
        { Folder: '/accounts/a/acme/insights/acme-com/portal-landing/', 'Cannes 2026': 'Acme' },
      ],
      'Cannes 2026',
    );
    expect(cards.map((c) => c.Company)).to.deep.equal(['Acme', 'Zeta']);
  });

  it('reads an arbitrary event column, so the same row can belong to several events', () => {
    const rows = [
      {
        Report: 'qantas.com',
        Customers: 'Qantas',
        Folder: '/accounts/q/qantas/insights/qantas-com/portal-landing/',
        'Cannes 2026': '',
        'Sydney Summit 2026': 'Qantas; Qantas Loyalty',
        'Munich Summit 2026': '',
      },
      {
        Report: 'ey.com',
        Customers: 'EY',
        Folder: '/accounts/e/ey/insights/ey-com/portal-landing/',
        'Cannes 2026': 'EY; EY Studio+',
        'Sydney Summit 2026': 'EY',
        'Munich Summit 2026': 'EY',
      },
      {
        Report: 'abb.com',
        Customers: 'ABB',
        Folder: '/accounts/a/abb/insights/abb-com/portal-landing/',
        'Cannes 2026': '',
        'Sydney Summit 2026': '',
        'Summit London 2026': 'ABB',
        'Munich Summit 2026': '',
      },
    ];
    const cannes = buildEventCompanies(rows, 'Cannes 2026');
    const sydney = buildEventCompanies(rows, 'Sydney Summit 2026');
    const london = buildEventCompanies(rows, 'Summit London 2026');
    const munich = buildEventCompanies(rows, 'Munich Summit 2026');
    // EY is in Cannes/Sydney/Munich; Qantas only in Sydney; ABB only in London.
    expect(cannes.map((c) => c.Company)).to.deep.equal(['EY', 'EY Studio+']);
    expect(sydney.map((c) => c.Company)).to.deep.equal(['EY', 'Qantas', 'Qantas Loyalty']);
    expect(london.map((c) => c.Company)).to.deep.equal(['ABB']);
    expect(munich.map((c) => c.Company)).to.deep.equal(['EY']);
    // EY's card links to the same page in both tabs.
    expect(cannes.find((c) => c.Company === 'EY').Folder)
      .to.equal(sydney.find((c) => c.Company === 'EY').Folder);
  });
});
