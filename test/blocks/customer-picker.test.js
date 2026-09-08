import { expect } from '@esm-bundle/chai';
import {
  parseInsightFolder,
  groupInsightsByWebsite,
  buildEventCompanies,
  parseEventModes,
  deriveEventModes,
  slugifyModeId,
  buildNavModel,
  findFamily,
  findMode,
  resolveTabParam,
  contextCopy,
  emptyStateCopy,
  buildNav,
  applyFilter,
} from '../../blocks/customer-picker/customer-picker.js';
import { buildShareForm, buildShareSection, folderToDeepLink } from '../../blocks/customer-picker/share-form.js';

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

describe('customer-picker › slugifyModeId', () => {
  it('slugifies an event column into a stable id', () => {
    expect(slugifyModeId('Summit Mumbai 2026')).to.equal('summit-mumbai-2026');
  });

  it('collapses punctuation and trims stray separators', () => {
    expect(slugifyModeId('  Cannes — 2026!  ')).to.equal('cannes-2026');
  });

  it('returns an empty string for empty/absent values', () => {
    expect(slugifyModeId('')).to.equal('');
    expect(slugifyModeId(undefined)).to.equal('');
    expect(slugifyModeId(null)).to.equal('');
  });
});

describe('customer-picker › parseEventModes', () => {
  const CONFIG = [
    { Id: 'cannes', Column: 'Cannes 2026', Label: 'Cannes 2026 Portal', Active: 'true' },
    { Id: 'mumbai', Column: 'Summit Mumbai 2026', Label: 'Summit Mumbai 2026', Active: 'true' },
  ];

  it('maps sheet rows to modes, preserving row order as tab order', () => {
    expect(parseEventModes(CONFIG, [])).to.deep.equal([
      { id: 'cannes', label: 'Cannes 2026 Portal', column: 'Cannes 2026' },
      { id: 'mumbai', label: 'Summit Mumbai 2026', column: 'Summit Mumbai 2026' },
    ]);
  });

  it('defaults the label to the column and the id to a slug of the column', () => {
    expect(parseEventModes([{ Column: 'Summit Mumbai 2026' }], [])).to.deep.equal([
      { id: 'summit-mumbai-2026', label: 'Summit Mumbai 2026', column: 'Summit Mumbai 2026' },
    ]);
  });

  it('treats Active as opt-out: only explicit falsy words retire a tab', () => {
    const rows = [
      { Id: 'a', Column: 'A' },
      { Id: 'b', Column: 'B', Active: '' },
      { Id: 'c', Column: 'C', Active: 'TRUE' },
      { Id: 'd', Column: 'D', Active: 'false' },
      { Id: 'e', Column: 'E', Active: 'No' },
      { Id: 'f', Column: 'F', Active: '0' },
    ];
    expect(parseEventModes(rows, []).map((m) => m.id)).to.deep.equal(['a', 'b', 'c']);
  });

  it('drops rows with no Column, and duplicate or built-in ids', () => {
    const rows = [
      { Id: 'cannes', Column: 'Cannes 2026' },
      { Id: '', Column: '', Label: 'Orphan' },
      { Id: 'cannes', Column: 'Cannes Again' },
      { Id: 'insights', Column: 'Collides With Built-in' },
      { Id: 'accounts', Column: 'Also Collides' },
    ];
    expect(parseEventModes(rows, []).map((m) => m.id)).to.deep.equal(['cannes']);
  });

  it('falls back to deriving tabs from insight columns when the sheet is absent', () => {
    const insightRows = [
      { Report: 'ey.com', Customers: 'EY', Folder: '/f/', Created: '1.01.2026', 'Cannes 2026': 'EY' },
      { Report: 'abb.com', Folder: '/g/', 'Report Notice': 'no-report', 'Summit London 2026': 'ABB' },
    ];
    const expected = [
      { id: 'cannes-2026', label: 'Cannes 2026', column: 'Cannes 2026' },
      { id: 'summit-london-2026', label: 'Summit London 2026', column: 'Summit London 2026' },
    ];
    // Missing sheet, empty sheet, and a sheet whose every row is unusable all fall back.
    expect(parseEventModes([], insightRows)).to.deep.equal(expected);
    expect(parseEventModes(undefined, insightRows)).to.deep.equal(expected);
    expect(parseEventModes([{ Column: '' }], insightRows)).to.deep.equal(expected);
  });
});

describe('customer-picker › deriveEventModes', () => {
  it('ignores reserved data columns and columns with no values anywhere', () => {
    const rows = [
      { Report: 'ey.com', Customers: 'EY', Folder: '/f/', Created: '1.01.2026', 'Report Notice': 'no-report' },
      { 'Cannes 2026': '', 'Summit London 2026': 'ABB' },
      { 'Cannes 2026': 'EY' },
    ];
    expect(deriveEventModes(rows)).to.deep.equal([
      { id: 'summit-london-2026', label: 'Summit London 2026', column: 'Summit London 2026' },
      { id: 'cannes-2026', label: 'Cannes 2026', column: 'Cannes 2026' },
    ]);
  });

  it('returns no modes for empty or absent rows', () => {
    expect(deriveEventModes([])).to.deep.equal([]);
    expect(deriveEventModes(undefined)).to.deep.equal([]);
  });
});

describe('customer-picker › share-form', () => {
  it('strips the origin but keeps the trailing slash', () => {
    expect(folderToDeepLink('https://act.aem.now/customers/a/acme/')).to.equal('/customers/a/acme/');
  });

  it('passes a non-URL folder through untouched', () => {
    expect(folderToDeepLink('/customers/a/acme/')).to.equal('/customers/a/acme/');
  });

  it('builds an email field, a send button and a copy button', () => {
    const form = buildShareForm('/customers/a/acme/');
    expect(form.querySelector('.cp-share-input')).to.exist;
    expect(form.querySelector('.cp-share-send')).to.exist;
    expect(form.querySelector('.cp-share-copy')).to.exist;
    expect(form.querySelector('.cp-share-hint').textContent).to.include('Works for one month.');
  });

  it('returns null when the company has no folder', () => {
    expect(buildShareSection({ Company: 'Acme' })).to.equal(null);
  });
});

const EVENT_MODES = [
  { id: 'cannes', label: 'Cannes 2026 Portal', column: 'Cannes 2026' },
  { id: 'munich', label: 'Munich Summit 2026', column: 'Munich Summit 2026' },
];

describe('customer-picker › buildNavModel', () => {
  it('splits the modes into exactly two families', () => {
    const model = buildNavModel(EVENT_MODES);
    expect(model.map((f) => f.id)).to.deep.equal(['reports', 'accounts']);
    expect(model[0].label).to.equal('Digital Opportunity Reports');
    expect(model[1].label).to.equal('Accounts');
  });

  it('leads the reports family with All reports, then Adobe Summit 2026, then the sheet rows in order', () => {
    const [reports] = buildNavModel(EVENT_MODES);
    expect(reports.modes.map((m) => m.id)).to.deep.equal(['insights', 'portal', 'cannes', 'munich']);
    expect(reports.modes.map((m) => m.label)).to.deep.equal([
      'All reports', 'Adobe Summit 2026', 'Cannes 2026 Portal', 'Munich Summit 2026',
    ]);
  });

  it('marks only All reports as the "all" kind — everything else is an event', () => {
    const [reports] = buildNavModel(EVENT_MODES);
    expect(reports.modes.map((m) => m.kind)).to.deep.equal(['all', 'event', 'event', 'event']);
  });

  it('gives the accounts family a single mode', () => {
    const [, accounts] = buildNavModel(EVENT_MODES);
    expect(accounts.modes.map((m) => m.id)).to.deep.equal(['accounts']);
  });

  it('still renders All reports and Adobe Summit 2026 when the sheet yields no events', () => {
    const [reports] = buildNavModel([]);
    expect(reports.modes.map((m) => m.id)).to.deep.equal(['insights', 'portal']);
  });

  it('never invents or rewrites a mode id — every event id survives verbatim', () => {
    const [reports] = buildNavModel([{ id: 'summit-tokyo-2027', label: 'Tokyo', column: 'Summit Tokyo 2027' }]);
    expect(reports.modes.map((m) => m.id)).to.include('summit-tokyo-2027');
  });
});

describe('customer-picker › findFamily / findMode', () => {
  it('finds the family that owns a mode', () => {
    const model = buildNavModel(EVENT_MODES);
    expect(findFamily(model, 'munich').id).to.equal('reports');
    expect(findFamily(model, 'accounts').id).to.equal('accounts');
  });

  it('returns undefined for an unknown mode', () => {
    expect(findFamily(buildNavModel(EVENT_MODES), 'nope')).to.equal(undefined);
    expect(findMode(buildNavModel(EVENT_MODES), 'nope')).to.equal(undefined);
  });

  it('finds a mode by id', () => {
    expect(findMode(buildNavModel(EVENT_MODES), 'cannes').label).to.equal('Cannes 2026 Portal');
  });
});

describe('customer-picker › resolveTabParam', () => {
  const model = buildNavModel(EVENT_MODES);

  it('accepts a known mode id', () => {
    expect(resolveTabParam(model, 'munich')).to.equal('munich');
  });

  it('accepts accounts', () => {
    expect(resolveTabParam(model, 'accounts')).to.equal('accounts');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(resolveTabParam(model, '  MUNICH ')).to.equal('munich');
  });

  it('falls back to All reports for an unknown, empty or missing value', () => {
    expect(resolveTabParam(model, 'retired-event')).to.equal('insights');
    expect(resolveTabParam(model, '')).to.equal('insights');
    expect(resolveTabParam(model, null)).to.equal('insights');
    expect(resolveTabParam(model, undefined)).to.equal('insights');
  });
});

const ALL_MODE = { id: 'insights', label: 'All reports', kind: 'all' };
const EVENT_MODE = { id: 'munich', label: 'Munich Summit 2026', kind: 'event' };
const ACCOUNTS_MODE = { id: 'accounts', label: 'Accounts', kind: 'all' };

describe('customer-picker › contextCopy', () => {
  it('describes All reports as everything we have generated, with a thousands-separated count', () => {
    expect(contextCopy(ALL_MODE, 4035)).to.deep.equal({
      text: 'Every Digital Opportunity Report we have generated — one card per website. 4,035 total.',
      action: null,
    });
  });

  it('describes an event as a pinned subset and always offers the way back to All reports', () => {
    expect(contextCopy(EVENT_MODE, 405)).to.deep.equal({
      text: 'The 405 reports pinned for Munich Summit 2026.',
      action: 'Looking for someone else? Search all reports',
    });
  });

  it('says nothing on the Accounts tab — another team owns that surface', () => {
    expect(contextCopy(ACCOUNTS_MODE, 1844)).to.equal(null);
  });

  it('returns null for a missing mode', () => {
    expect(contextCopy(null, 0)).to.equal(null);
  });
});

describe('customer-picker › emptyStateCopy', () => {
  it('offers the whole catalogue when an event search finds nothing', () => {
    expect(emptyStateCopy(EVENT_MODE, 'acme', 4035)).to.deep.equal({
      text: 'No match for “acme” in Munich Summit 2026.',
      action: 'Search all 4,035 reports',
    });
  });

  it('has no escape hatch on All reports — there is nowhere wider to go', () => {
    expect(emptyStateCopy(ALL_MODE, 'acme', 4035)).to.deep.equal({
      text: 'No match for “acme”.',
      action: null,
    });
  });

  it('has no escape hatch on Accounts', () => {
    expect(emptyStateCopy(ACCOUNTS_MODE, 'acme', 4035).action).to.equal(null);
  });

  it('trims the echoed query', () => {
    expect(emptyStateCopy(ALL_MODE, '  acme  ', 10).text).to.equal('No match for “acme”.');
  });
});

describe('customer-picker › buildNav', () => {
  const model = () => buildNavModel(EVENT_MODES);

  it('renders exactly two primary tabs', () => {
    const { el } = buildNav(model(), () => {});
    const labels = [...el.querySelectorAll('.cp-family-btn')].map((b) => b.textContent);
    expect(labels).to.deep.equal(['Digital Opportunity Reports', 'Accounts']);
  });

  it('renders one chip per reports mode, in model order', () => {
    const { el } = buildNav(model(), () => {});
    const chips = [...el.querySelectorAll('.cp-mode-chip')];
    expect(chips.map((c) => c.dataset.mode)).to.deep.equal(['insights', 'portal', 'cannes', 'munich']);
  });

  it('marks the All-reports chip so the divider can hang off it', () => {
    const { el } = buildNav(model(), () => {});
    expect(el.querySelector('.cp-mode-chip[data-mode="insights"]').classList.contains('cp-mode-chip--all')).to.equal(true);
    expect(el.querySelector('.cp-mode-chip[data-mode="munich"]').classList.contains('cp-mode-chip--all')).to.equal(false);
  });

  it('activates the family and chip for the current mode', () => {
    const { el, setActive } = buildNav(model(), () => {});
    setActive('munich', 405);
    expect(el.querySelector('.cp-family-btn--active').dataset.family).to.equal('reports');
    expect(el.querySelector('.cp-mode-chip--active').dataset.mode).to.equal('munich');
  });

  it('hides the chip row on Accounts and shows it again on a report mode', () => {
    const { el, setActive } = buildNav(model(), () => {});
    const chipRow = el.querySelector('.cp-subnav');
    setActive('accounts', 1844);
    expect(chipRow.hidden).to.equal(true);
    setActive('insights', 4035);
    expect(chipRow.hidden).to.equal(false);
  });

  it('writes the context line for the active mode', () => {
    const { el, setActive } = buildNav(model(), () => {});
    setActive('munich', 405);
    expect(el.querySelector('.cp-context-text').textContent).to.equal('The 405 reports pinned for Munich Summit 2026.');
    expect(el.querySelector('.cp-context-action').textContent).to.equal('Looking for someone else? Search all reports');
  });

  it('drops the context action on All reports and hides the line on Accounts', () => {
    const { el, setActive } = buildNav(model(), () => {});
    setActive('insights', 4035);
    expect(el.querySelector('.cp-context-action')).to.equal(null);
    setActive('accounts', 1844);
    expect(el.querySelector('.cp-context').hidden).to.equal(true);
  });

  it('reports a chip click without asking to keep the query', () => {
    const seen = [];
    const { el } = buildNav(model(), (id, opts) => seen.push([id, opts.keepQuery]));
    el.querySelector('.cp-mode-chip[data-mode="cannes"]').click();
    expect(seen).to.deep.equal([['cannes', false]]);
  });

  it('switches to the family default when a primary tab is clicked', () => {
    const seen = [];
    const { el, setActive } = buildNav(model(), (id) => seen.push(id));
    setActive('munich', 405);
    el.querySelector('.cp-family-btn[data-family="accounts"]').click();
    el.querySelector('.cp-family-btn[data-family="reports"]').click();
    expect(seen).to.deep.equal(['accounts', 'insights']);
  });

  it('keeps the query when the context action sends you to All reports', () => {
    const seen = [];
    const { el, setActive } = buildNav(model(), (id, opts) => seen.push([id, opts.keepQuery]));
    setActive('munich', 405);
    el.querySelector('.cp-context-action').click();
    expect(seen).to.deep.equal([['insights', true]]);
  });
});

describe('customer-picker › applyFilter', () => {
  function gridWith(names) {
    const grid = document.createElement('div');
    const group = document.createElement('div');
    group.className = 'cp-group';
    for (const name of names) {
      const card = document.createElement('button');
      card.className = 'cp-card';
      const label = document.createElement('span');
      label.className = 'cp-card-name';
      label.textContent = name;
      card.append(label);
      group.append(card);
    }
    grid.append(group);
    return grid;
  }

  it('counts the cards still showing', () => {
    expect(applyFilter(gridWith(['Acme', 'Bosch', 'Acme Labs']), 'acme')).to.equal(2);
  });

  it('returns 0 when nothing matches', () => {
    expect(applyFilter(gridWith(['Acme', 'Bosch']), 'zzz')).to.equal(0);
  });

  it('returns every card for an empty query', () => {
    expect(applyFilter(gridWith(['Acme', 'Bosch']), '')).to.equal(2);
  });

  it('hides a group whose cards all dropped out', () => {
    const grid = gridWith(['Acme']);
    applyFilter(grid, 'zzz');
    expect(grid.querySelector('.cp-group').style.display).to.equal('none');
  });
});

describe('customer-picker › report naming', () => {
  it('calls the bare report a Digital Opportunity Report', () => {
    const [card] = groupInsightsByWebsite([
      { Report: 'schiphol.nl', Folder: '/accounts/s/schiphol/insights/schiphol-nl/', Created: '1.05.2026' },
      { Report: 'schiphol.nl', Folder: '/accounts/s/schiphol/insights/schiphol-nl/cannes-2026/', Created: '2.05.2026' },
    ]);
    expect(card.formats[0].label).to.equal('Digital Opportunity Report');
  });
});

describe('customer-picker › copy pluralisation', () => {
  it('says "1 report" not "1 reports" for a single-card event', () => {
    expect(contextCopy(EVENT_MODE, 1).text).to.equal('The 1 report pinned for Munich Summit 2026.');
  });

  it('pluralises every other count', () => {
    expect(contextCopy(EVENT_MODE, 0).text).to.equal('The 0 reports pinned for Munich Summit 2026.');
    expect(contextCopy(EVENT_MODE, 2).text).to.equal('The 2 reports pinned for Munich Summit 2026.');
  });

  it('pluralises the empty-state action too', () => {
    expect(emptyStateCopy(EVENT_MODE, 'acme', 1).action).to.equal('Search all 1 report');
    expect(emptyStateCopy(EVENT_MODE, 'acme', 4035).action).to.equal('Search all 4,035 reports');
  });
});
