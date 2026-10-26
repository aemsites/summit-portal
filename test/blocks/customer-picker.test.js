import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init, {
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

describe('customer-picker › reports-first dashboard', () => {
  let el;
  let sandbox;
  let dispose;
  let originalUrl;
  let sheets;
  let fetchStub;
  let failures;

  const row = (i, extra = {}) => ({
    Customers: `Company ${String(i).padStart(5, '0')}`,
    Report: `site${i}.example`,
    Folder: `/accounts/c/company-${i}/insights/site-${i}/portal-landing/`,
    Created: '22.10.2026',
    ...extra,
  });
  const modes = () => Array.from({ length: 38 }, (_, i) => ({ Id: `event-${i}`, Column: `Campaign ${i}`, Label: i === 37 ? 'Événement Northern Europe' : `Roadshow ${i}` }));
  const tick = () => new Promise((resolve) => { setTimeout(resolve, 160); });
  const companySearch = () => el.querySelector('.cp-search-input');
  const type = (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const options = () => [...el.querySelectorAll('[role="option"]')];

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalUrl = window.location.href;
    window.history.replaceState(null, '', '/adobe/dashboard');
    localStorage.clear();
    el = document.createElement('div');
    el.className = 'customer-picker';
    el.innerHTML = '<a href="/data/company-list.json">Companies</a>';
    document.body.append(el);
    sheets = {
      'insights-list': Array.from({ length: 60 }, (_, i) => row(i, { 'Campaign 37': i % 2 ? '' : `Company ${i}` })),
      'event-tabs': modes(),
      'company-list': [{ Company: 'Summit legacy', Domains: 'summit.example', Folder: '/customers/s/summit/' }],
      'closed-user-groups': [{ url: '/customers/s/summit/**', 'cug-groups': 'adobe.com,summit.example' }],
    };
    failures = {};
    fetchStub = sandbox.stub(window, 'fetch').callsFake(async (url) => {
      const path = new URL(url, window.location.origin).pathname;
      const name = path.split('/').pop().replace('.json', '');
      if (failures[name]) return new Response('', { status: failures[name] });
      return Response.json({ data: sheets[name] || [], total: (sheets[name] || []).length });
    });
  });

  afterEach(() => {
    if (typeof dispose === 'function') dispose();
    el.remove();
    document.querySelectorAll('.cp-dialog-backdrop, .cp-report-dialog').forEach((node) => node.remove());
    sandbox.restore();
    localStorage.clear();
    window.history.replaceState(null, '', originalUrl);
  });

  async function load() {
    dispose = await init(el);
    await dispose.ready;
  }

  async function chooseCampaign(query) {
    el.querySelector('.cp-campaign-trigger').click();
    type(el.querySelector('.cp-campaign-search'), query);
    await tick();
    options()[0].click();
  }

  function deferSource(sourceName) {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    fetchStub.callsFake(async (value) => {
      const name = new URL(value, window.location.origin).pathname.split('/').pop()
        .replace('.json', '');
      if (name === sourceName) return pending;
      return Response.json({ data: sheets[name] || [] });
    });
    return () => release(Response.json({ data: sheets[sourceName] || [] }));
  }

  ['company-list', 'closed-user-groups'].forEach((sourceName) => {
    it(`keeps the highlighted campaign when optional ${sourceName} arrives`, async () => {
      const release = deferSource(sourceName);
      dispose = await init(el);
      try {
        await tick();
        el.querySelector('.cp-campaign-trigger').click();
        const search = el.querySelector('.cp-campaign-search');
        type(search, 'Roadshow');
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.getElementById(search.getAttribute('aria-activedescendant')).textContent)
          .to.equal('Roadshow 1');
        release();
        await dispose.ready;
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(new URLSearchParams(window.location.search).get('tab')).to.equal('event-1');
      } finally {
        release();
        await dispose.ready;
      }
    });
  });

  [
    ['.cp-company', '.cp-company'],
    ['.cp-share-action', '.cp-share-action'],
    ['tbody tr', '.cp-company'],
  ].forEach(([selector, focusSelector]) => {
    it(`returns to the replacement ${selector} after an optional source arrives`, async () => {
      const release = deferSource('closed-user-groups');
      dispose = await init(el);
      try {
        await tick();
        el.querySelector(selector).click();
        const dialog = document.querySelector('.cp-report-dialog');
        expect(dialog.open).to.equal(true);
        release();
        await dispose.ready;
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(dialog.open).to.equal(false);
        expect(document.activeElement === el.querySelector(focusSelector)).to.equal(true);
      } finally {
        release();
        await dispose.ready;
      }
    });
  });

  [true, false].forEach((copyAllowed) => {
    it(`keeps rejected-clipboard recovery in the native dialog: copy ${copyAllowed}`, async () => {
      const link = 'https://example.test/synthetic-magic-link';
      fetchStub.callsFake(async (value) => {
        if (value === '/auth/sharelink') return Response.json({ result: 'link', link });
        const name = new URL(value, window.location.origin).pathname.split('/').pop()
          .replace('.json', '');
        return Response.json({ data: sheets[name] || [] });
      });
      if (navigator.clipboard) {
        sandbox.stub(navigator.clipboard, 'writeText').rejects(new DOMException('Blocked'));
      }
      let selected;
      sandbox.stub(document, 'execCommand').callsFake(() => {
        const active = document.activeElement;
        selected = {
          inDialog: !!active.closest('dialog[open]'),
          text: active.value?.slice(active.selectionStart, active.selectionEnd),
        };
        return copyAllowed;
      });
      await load();
      el.querySelector('.cp-share-action').click();
      const dialog = document.querySelector('.cp-report-dialog');
      dialog.querySelector('.cp-share-copy').click();
      await tick();
      expect(selected).to.deep.equal({ inDialog: true, text: link });
      expect(dialog.querySelector('.cp-share-status').dataset.kind)
        .to.equal(copyAllowed ? 'success' : 'error');
      expect(document.querySelector('textarea')).to.equal(null);
      expect(document.activeElement === dialog.querySelector('.cp-share-copy')).to.equal(true);
    });
  });

  it('does not retain a successful copy label when the next clipboard attempt fails', async () => {
    fetchStub.callsFake(async (value) => {
      if (value === '/auth/sharelink') {
        return Response.json({ result: 'link', link: 'https://example.test/synthetic-magic-link' });
      }
      const name = new URL(value, window.location.origin).pathname.split('/').pop()
        .replace('.json', '');
      return Response.json({ data: sheets[name] || [] });
    });
    if (navigator.clipboard) {
      sandbox.stub(navigator.clipboard, 'writeText').rejects(new DOMException('Blocked'));
    }
    const legacyCopy = sandbox.stub(document, 'execCommand');
    legacyCopy.onFirstCall().returns(true);
    legacyCopy.onSecondCall().returns(false);
    await load();
    el.querySelector('.cp-share-action').click();
    const dialog = document.querySelector('.cp-report-dialog');
    const copy = dialog.querySelector('.cp-share-copy');
    copy.click();
    await tick();
    expect(dialog.querySelector('.cp-share-status').dataset.kind).to.equal('success');
    copy.click();
    await tick();
    expect(dialog.querySelector('.cp-share-status').dataset.kind).to.equal('error');
    expect(dialog.querySelector('.cp-share-copy-label').textContent).to.equal('Copy link');
  });

  it('renders only Company, Website, Published and Actions, without Accounts or its fetch', async () => {
    await load();
    expect([...el.querySelectorAll('thead th')].map((node) => node.textContent))
      .to.deep.equal(['Company', 'Website', 'Published', 'Actions']);
    expect(el.querySelector('.cp-family-btn')).to.equal(null);
    expect(fetchStub.getCalls().some((call) => String(call.args[0]).includes('/account-list.json'))).to.equal(false);
    expect(el.querySelector('tbody .cp-company').textContent).to.equal('Company 00000');
  });

  it('shows newest reports first in All campaigns and a selected campaign', async () => {
    sheets['insights-list'] = [
      row(0, { Customers: 'Alpha old', Created: '31.12.2025', 'Campaign 37': 'Alpha old' }),
      row(1, { Customers: 'Zeta newest', Created: '2.10.2026', 'Campaign 37': 'Zeta newest' }),
      row(2, { Customers: 'Beta middle', Created: '10.09.2026', 'Campaign 37': 'Beta middle' }),
    ];
    await load();
    const names = () => [...el.querySelectorAll('tbody .cp-company')].map((name) => name.textContent);
    expect(names()).to.deep.equal(['Zeta newest', 'Beta middle', 'Alpha old']);
    expect(el.querySelector('th[aria-sort="descending"]')?.textContent).to.equal('Published');
    expect(el.querySelectorAll('th[aria-sort]')).to.have.lengthOf(1);
    await chooseCampaign('Northern');
    expect(names()).to.deep.equal(['Zeta newest', 'Beta middle', 'Alpha old']);
  });

  it('uses the same calendar validation for displayed dates and newest-first ordering', async () => {
    sheets['insights-list'] = [
      row(0, { Customers: 'Alpha invalid', Created: '31.02.2026' }),
      row(1, { Customers: 'Zeta valid', Created: ' 2.10.2026 ' }),
      row(2, { Customers: 'Beta unrecorded', Created: '' }),
    ];
    await load();
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows.map((entry) => entry.querySelector('.cp-company').textContent))
      .to.deep.equal(['Zeta valid', 'Alpha invalid', 'Beta unrecorded']);
    expect(rows[0].querySelector('time')?.dateTime).to.equal('2026-10-02');
    expect(rows.slice(1).map((entry) => entry.querySelector('.cp-published').textContent))
      .to.deep.equal(['Not recorded', 'Not recorded']);
  });

  [false, true].forEach((reverse) => {
    it(`uses the latest publication metadata when the source repeats an exact report path: reverse ${reverse}`, async () => {
      const duplicate = [
        row(0, { Customers: 'Older company metadata', Created: '31.12.2025' }),
        row(0, { Customers: 'Current company metadata', Created: '2.10.2026' }),
      ];
      sheets['insights-list'] = reverse ? duplicate.reverse() : duplicate;
      await load();
      expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(1);
      expect(el.querySelector('.cp-company').textContent).to.equal('Current company metadata');
      expect(el.querySelector('tbody time')?.dateTime).to.equal('2026-10-02');
      el.querySelector('.cp-company').click();
      expect(document.querySelector('.cp-report-meta time')?.dateTime).to.equal('2026-10-02');
    });
  });

  ['tbody tr', '.cp-website', '.cp-published', '.cp-company-avatar', '.cp-row-actions']
    .forEach((selector) => {
      it(`opens details and sharing once from non-interactive row content: ${selector}`, async () => {
        const showModal = sandbox.spy(HTMLDialogElement.prototype, 'showModal');
        await load();
        el.querySelector(selector).click();
        const dialog = document.querySelector('.cp-report-dialog');
        expect(dialog.open).to.equal(true);
        expect(showModal.calledOnce).to.equal(true);
        expect(dialog.querySelector('.cp-dialog-title').textContent).to.equal('Company 00000');
        expect(dialog.querySelector('.cp-share-copy')).to.exist;
        dialog.querySelector('.cp-dialog-close').click();
        expect(document.activeElement === el.querySelector('.cp-company')).to.equal(true);
      });
    });

  it('keeps the native company button as the row keyboard control without adding a row tab stop', async () => {
    const showModal = sandbox.spy(HTMLDialogElement.prototype, 'showModal');
    await load();
    const entry = el.querySelector('tbody tr');
    const primary = entry.querySelector('.cp-company');
    expect(entry.getAttribute('role')).to.equal('row');
    expect(entry.tabIndex).to.equal(-1);
    expect(primary.tagName).to.equal('BUTTON');
    expect(primary.tabIndex).to.equal(0);
    primary.focus();
    primary.click();
    expect(showModal.calledOnce).to.equal(true);
    document.querySelector('.cp-dialog-close').click();
    expect(document.activeElement === primary).to.equal(true);
  });

  it('keeps Open separate from details and does not open Share twice through the row', async () => {
    const showModal = sandbox.spy(HTMLDialogElement.prototype, 'showModal');
    await load();
    const open = el.querySelector('tbody .cp-open');
    // Cancel navigation after the row handler, so its control guard is still tested.
    el.addEventListener('click', (event) => {
      if (event.target === open) event.preventDefault();
    });
    open.click();
    expect(open.getAttribute('href')).to.equal(row(0).Folder);
    expect(showModal.called).to.equal(false);
    const share = el.querySelector('tbody .cp-share-action');
    share.click();
    expect(showModal.calledOnce).to.equal(true);
    const dialog = document.querySelector('.cp-report-dialog');
    expect(dialog.open).to.equal(true);
    expect(document.activeElement === dialog.querySelector('.cp-share-input')).to.equal(true);
    dialog.querySelector('.cp-dialog-close').click();
    expect(document.activeElement === share).to.equal(true);
  });

  it('does not open a row while its website text is selected for copying', async () => {
    await load();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el.querySelector('.cp-website'));
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      el.querySelector('tbody tr').click();
      expect(document.querySelector('.cp-report-dialog').open).to.equal(false);
      expect(selection.toString()).to.equal('site0.example');
    } finally {
      selection.removeAllRanges();
    }
  });

  it('does not let selected text in another row block opening a report', async () => {
    await load();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el.querySelector('.cp-website'));
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      el.querySelectorAll('tbody tr')[1].click();
      const dialog = document.querySelector('.cp-report-dialog');
      expect(dialog.open).to.equal(true);
      expect(dialog.querySelector('.cp-dialog-title').textContent).to.equal('Company 00001');
    } finally {
      selection.removeAllRanges();
    }
  });

  it('returns to the visible company control if the share opener becomes hidden', async () => {
    await load();
    const share = el.querySelector('.cp-share-action');
    share.click();
    share.style.display = 'none';
    document.querySelector('.cp-dialog-close').click();
    expect(document.activeElement === el.querySelector('.cp-company')).to.equal(true);
  });

  it('keeps only Open and Share actions without an ellipsis or duplicate details shortcut', async () => {
    await load();
    const actions = el.querySelector('tbody .cp-row-actions');
    expect([...actions.querySelectorAll('a, button')].map((control) => control.textContent))
      .to.deep.equal(['Open', 'Share']);
    expect(actions.querySelector('details, summary, .cp-details-action') === null).to.equal(true);
  });

  it('finishes block decoration without waiting for an optional access source', async () => {
    let releaseAccess;
    const access = new Promise((resolve) => { releaseAccess = resolve; });
    fetchStub.callsFake(async (url) => {
      const name = new URL(url, window.location.origin).pathname.split('/').pop().replace('.json', '');
      if (name === 'closed-user-groups') return access;
      return Response.json({ data: sheets[name] || [], total: (sheets[name] || []).length });
    });
    const initialization = init(el);
    const finished = await Promise.race([
      initialization.then(() => true),
      new Promise((resolve) => { setTimeout(() => resolve(false), 80); }),
    ]);
    await tick();
    const rendered = el.querySelectorAll('tbody tr').length;
    releaseAccess(Response.json({ data: [] }));
    dispose = await initialization;
    await dispose.ready;
    expect(finished).to.equal(true);
    expect(rendered).to.equal(25);
  });

  it('renders just 25 of 10,765 rows and searches beyond the visible page', async () => {
    sheets['insights-list'] = Array.from({ length: 10765 }, (_, i) => row(i));
    await load();
    expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(25);
    expect(el.querySelector('.cp-result-count').textContent).to.include('10,765');
    const size = el.querySelector('[aria-label="Rows per page"]');
    size.value = '100';
    size.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(100);
    type(companySearch(), 'Company 10764');
    await tick();
    expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(1);
    expect(el.querySelector('tbody').textContent).to.include('site10764.example');
  });

  it('puts full campaign membership immediately after compact report metadata', async () => {
    sheets['insights-list'] = [row(0, { 'Campaign 0': 'Company 00000', 'Campaign 37': 'Company 00000' })];
    await load();
    el.querySelector('.cp-company').click();
    const dialog = document.querySelector('.cp-report-dialog');
    expect(dialog.querySelectorAll('.cp-report-meta')).to.have.lengthOf(1);
    expect(dialog.querySelector('.cp-report-meta a').textContent).to.equal('site0.example');
    expect(dialog.querySelector('.cp-report-meta time').dateTime).to.equal('2026-10-22');
    expect(dialog.querySelector('.cp-details-body h3').textContent).to.equal('Campaigns');
    expect(dialog.querySelector('.cp-campaign-count').textContent).to.include('2 campaigns');
    expect(dialog.querySelector('.cp-campaign-memberships').textContent).to.include('Roadshow 0');
    expect(dialog.querySelector('.cp-campaign-memberships').textContent).to.include('Événement Northern Europe');
  });

  it('searches website independently and resets the page after query and size changes', async () => {
    await load();
    el.querySelector('[aria-label="Next page"]').click();
    expect(new URLSearchParams(window.location.search).get('page')).to.equal('2');
    type(companySearch(), 'site59.example');
    await tick();
    expect(new URLSearchParams(window.location.search).get('page')).to.equal('1');
    expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(1);
    type(companySearch(), '');
    await tick();
    el.querySelector('[aria-label="Next page"]').click();
    const size = el.querySelector('[aria-label="Rows per page"]');
    size.value = '50';
    size.dispatchEvent(new Event('change', { bubbles: true }));
    expect(new URLSearchParams(window.location.search).get('page')).to.equal('1');
    expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(50);
  });

  it('does not show 38 unfiltered campaigns and finds a partial accent-insensitive name', async () => {
    await load();
    el.querySelector('.cp-campaign-trigger').click();
    expect(options().length).to.be.at.most(2);
    expect(el.querySelector('.cp-campaign-help').textContent).to.include('Search');
    type(el.querySelector('.cp-campaign-search'), 'nÓRTH');
    await tick();
    expect(options()).to.have.lengthOf(1);
    expect(options()[0].textContent).to.include('Événement Northern Europe');
    options()[0].click();
    expect(new URLSearchParams(window.location.search).get('tab')).to.equal('event-37');
    expect(new URLSearchParams(window.location.search).get('page')).to.equal('1');
    expect(el.querySelector('.cp-result-count').textContent).to.include('30');
  });

  it('visibly distinguishes same-named legacy and DIH campaigns', async () => {
    sheets['event-tabs'] = [
      { Id: 'paris', Column: 'Paris', Label: 'Paris' },
      { Id: 'dih-cv_paris', Column: 'DIH cv_paris', Label: 'Paris', CampaignId: 'cv_paris' },
    ];
    await load();
    el.querySelector('.cp-campaign-trigger').click();
    type(el.querySelector('.cp-campaign-search'), 'Paris');
    await tick();
    expect(options()).to.have.lengthOf(2);
    expect(options()[0].textContent).to.include('Legacy');
    expect(options()[1].textContent).to.include('cv_paris');
  });

  it('test_campaign_keeps_older_member_path_over_newer_nonmember', async () => {
    const member = '/accounts/f/frescopa/insights/frescopa-example/cannes-2026/';
    sheets['insights-list'] = [
      { Customers: 'Frescopa', Report: 'frescopa.example', Folder: member, Created: '1.09.2026', 'Campaign 37': 'Frescopa' },
      { Customers: 'Frescopa', Report: 'frescopa.example', Folder: '/accounts/f/frescopa/insights/frescopa-example/portal-landing/', Created: '22.10.2026' },
    ];
    await load();
    await chooseCampaign('Northern');
    expect(el.querySelector('tbody a.cp-open').getAttribute('href')).to.equal(member);
    expect(el.querySelector('tbody time').dateTime).to.equal('2026-09-01');
  });

  it('test_details_list_each_membership_for_selected_format', async () => {
    sheets['insights-list'] = [
      row(0, { 'Campaign 1': 'Frescopa', 'Campaign 2': 'Frescopa' }),
      row(0, { Folder: '/accounts/c/company-0/insights/site-0/cannes-2026/', 'Campaign 3': 'Frescopa' }),
    ];
    await load();
    el.querySelector('.cp-company').click();
    const memberships = [...document.querySelectorAll('.cp-campaign-memberships li')].map((node) => node.textContent);
    expect(memberships).to.deep.equal(['Roadshow 1', 'Roadshow 2']);
    expect(document.querySelector('.cp-report-dialog').textContent).to.not.include('Roadshow 3');
  });

  it('requires a specific format and uses that exact path for sharing without email in copy mode', async () => {
    const cannes = '/accounts/c/company-0/insights/site-0/cannes-2026/';
    sheets['insights-list'] = [
      row(0, { Folder: cannes, 'Campaign 1': 'Company 0' }),
      row(0, { Folder: '/accounts/c/company-0/insights/site-0/summit-2026/', 'Campaign 2': 'Company 0' }),
    ];
    const originalFetch = fetchStub.wrappedMethod;
    fetchStub.callsFake(async (url, optionsValue) => {
      if (url === '/auth/sharelink') return Response.json({ result: 'link', link: 'https://example.test/magic' });
      const name = new URL(url, window.location.origin).pathname.split('/').pop().replace('.json', '');
      if (name in sheets) return Response.json({ data: sheets[name] });
      return originalFetch(url, optionsValue);
    });
    if (navigator.clipboard) sandbox.stub(navigator.clipboard, 'writeText').resolves();
    await load();
    el.querySelector('.cp-share-action').click();
    expect(document.querySelector('.cp-report-dialog .cp-share-copy')).to.equal(null);
    const select = document.querySelector('[aria-label="Report format"]');
    select.value = cannes;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect([...document.querySelectorAll('.cp-campaign-memberships li')].map((node) => node.textContent))
      .to.deep.equal(['Roadshow 1']);
    expect(document.querySelector('.cp-share-hint').textContent).to.include('one month');
    document.querySelector('.cp-share-copy').click();
    await tick();
    const request = fetchStub.getCalls().find((call) => call.args[0] === '/auth/sharelink');
    expect(JSON.parse(request.args[1].body)).to.deep.equal({ path: cannes, mode: 'copy' });
  });

  it('restores controls on history navigation and creates entries for campaign and page changes', async () => {
    await load();
    const previousLength = window.history.length;
    el.querySelector('[aria-label="Next page"]').click();
    expect(window.history.length).to.equal(previousLength + 1);
    window.history.replaceState(null, '', '/adobe/dashboard?tab=event-37&q=site58&page=1&size=50');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(companySearch().value).to.equal('site58');
    expect(el.querySelector('[aria-label="Rows per page"]').value).to.equal('50');
    expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(1);
    expect(el.querySelector('tbody').textContent).to.include('site58.example');
  });

  it('normalizes unknown campaigns and invalid URL values with a visible explanation', async () => {
    window.history.replaceState(null, '', '/adobe/dashboard?tab=retired&page=-10&size=7');
    await load();
    expect(el.querySelector('.cp-catalog-notices').textContent).to.include('no longer available');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('tab')).to.equal('insights');
    expect(params.get('page')).to.equal('1');
    expect(params.get('size')).to.equal('25');
  });

  it('keeps compact path-deduplicated eight-item recent history under existing keys', async () => {
    sheets['insights-list'] = Array.from({ length: 10 }, (_, i) => row(i));
    await load();
    const buttons = [...el.querySelectorAll('.cp-company')];
    for (const button of buttons) {
      button.click();
      document.querySelector('.cp-dialog-close').click();
    }
    buttons[5].click();
    document.querySelector('.cp-dialog-close').click();
    const recents = JSON.parse(localStorage.getItem('cp-recent-insights'));
    expect(recents).to.have.lengthOf(8);
    expect(new Set(recents.map((recent) => recent.folder)).size).to.equal(8);
    expect(recents[0].folder).to.equal(row(5).Folder);
    expect(el.querySelector('.cp-recent')).to.exist;
  });

  it('supports keyboard campaign selection, Escape and dialog focus return', async () => {
    await load();
    const trigger = el.querySelector('.cp-campaign-trigger');
    trigger.click();
    const search = el.querySelector('.cp-campaign-search');
    expect(document.activeElement).to.equal(search);
    type(search, 'Northern');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(new URLSearchParams(window.location.search).get('tab')).to.equal('event-37');
    expect(document.activeElement).to.equal(trigger);
    trigger.click();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
    const opener = el.querySelector('.cp-company');
    opener.click();
    const dialog = document.querySelector('.cp-report-dialog');
    expect(dialog.open).to.equal(true);
    expect(dialog.contains(document.activeElement)).to.equal(true);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog.open).to.equal(false);
    expect(document.activeElement).to.equal(opener);
  });

  it('derives all related sheet URLs from the authored stage source and fetches companies once', async () => {
    el.querySelector('a').href = '/data-stage/company-list.json';
    await load();
    const paths = fetchStub.getCalls()
      .map((call) => new URL(call.args[0], window.location.origin).pathname);
    expect(paths).to.include('/data-stage/insights-list.json').and.include('/data-stage/event-tabs.json');
    expect(paths.filter((path) => path === '/data-stage/company-list.json')).to.have.lengthOf(1);
    expect(paths.some((path) => path.startsWith('/data/'))).to.equal(false);
  });

  [401, 403, 503].forEach((status) => {
    it(`shows an explicit report-index ${status} state rather than an empty list`, async () => {
      failures['insights-list'] = status;
      await load();
      expect(el.querySelector('tbody')).to.equal(null);
      if (status === 401) {
        expect(el.querySelector('a.cp-sign-in').getAttribute('href')).to.include('/auth/portal?redirect=');
      } else if (status === 403) {
        expect(el.querySelector('.cp-results').textContent).to.include('access');
      } else {
        expect(el.querySelector('.cp-retry')).to.exist;
        delete failures['insights-list'];
        el.querySelector('.cp-retry').click();
        await tick();
        expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(25);
      }
    });
  });

  it('shows a registry warning and never silently applies All campaigns for an unresolved selection', async () => {
    failures['event-tabs'] = 503;
    window.history.replaceState(null, '', '/adobe/dashboard?tab=dih-cv_missing');
    await load();
    expect(el.querySelector('.cp-catalog-notices').textContent).to.include('campaign');
    expect(el.querySelector('.cp-retry')).to.exist;
    expect(el.querySelector('tbody')).to.equal(null);
    expect(new URLSearchParams(window.location.search).get('tab')).to.equal('dih-cv_missing');
  });

  it('uses a visible legacy-only fallback for a genuinely missing registry, not machine column labels', async () => {
    failures['event-tabs'] = 404;
    sheets['insights-list'] = [row(0, { 'Cannes 2026': 'Company', 'DIH cv_missing': 'Company' })];
    await load();
    expect(el.querySelector('.cp-catalog-notices').textContent).to.include('incomplete');
    el.querySelector('.cp-campaign-trigger').click();
    type(el.querySelector('.cp-campaign-search'), 'Cannes');
    expect(options()).to.have.lengthOf(1);
    type(el.querySelector('.cp-campaign-search'), 'DIH');
    expect(options()).to.have.lengthOf(0);
  });

  it('treats a malformed registry as retryable, not a successful empty configuration', async () => {
    sheets['event-tabs'] = { invalid: true };
    await load();
    expect(el.querySelector('.cp-catalog-notices').textContent).to.include('campaign');
    expect(el.querySelector('.cp-retry')).to.exist;
    expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(25);
  });

  it('reads every source page before applying complete-dataset search', async () => {
    const rows = Array.from({ length: 10765 }, (_, i) => row(i));
    fetchStub.callsFake(async (value) => {
      const url = new URL(value, window.location.origin);
      if (url.pathname.endsWith('/insights-list.json')) {
        const offset = Number(url.searchParams.get('offset') || 0);
        const data = rows.slice(offset, offset + 1000);
        return Response.json({ data, total: rows.length, offset, limit: 1000 });
      }
      const key = url.pathname.split('/').pop().replace('.json', '');
      return Response.json({ data: sheets[key] || [] });
    });
    await load();
    expect(fetchStub.getCalls().filter((call) => String(call.args[0]).includes('insights-list.json')))
      .to.have.lengthOf(11);
    type(companySearch(), 'site10764.example');
    await tick();
    expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(1);
    expect(el.querySelector('tbody').textContent).to.include('Company 10764');
  });

  it('exposes loading immediately and keeps primary reports usable while optional company data waits', async () => {
    let resolveCompany;
    const companyResponse = new Promise((resolve) => { resolveCompany = resolve; });
    fetchStub.callsFake(async (value) => {
      const name = new URL(value, window.location.origin).pathname.split('/').pop().replace('.json', '');
      if (name === 'company-list') return companyResponse;
      return Response.json({ data: sheets[name] || [] });
    });
    const pending = init(el);
    expect(el.querySelector('.cp-results').getAttribute('aria-busy')).to.equal('true');
    try {
      await tick();
      expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(25);
      expect(el.querySelector('.cp-results').getAttribute('aria-busy')).to.equal('false');
    } finally {
      resolveCompany(Response.json({ data: sheets['company-list'] }));
      dispose = await pending;
      await dispose.ready;
    }
  });

  it('waits for the index before resolving a legacy link against a genuinely absent registry', async () => {
    window.history.replaceState(null, '', '/adobe/dashboard?tab=cannes-2026');
    sheets['insights-list'] = [row(0, { 'Cannes 2026': 'Frescopa' })];
    let resolveIndex;
    const indexResponse = new Promise((resolve) => { resolveIndex = resolve; });
    fetchStub.callsFake(async (value) => {
      const name = new URL(value, window.location.origin).pathname.split('/').pop().replace('.json', '');
      if (name === 'event-tabs') return new Response('', { status: 404 });
      if (name === 'insights-list') return indexResponse;
      return Response.json({ data: sheets[name] || [] });
    });
    const pending = init(el);
    try {
      await tick();
      expect(new URLSearchParams(window.location.search).get('tab')).to.equal('cannes-2026');
    } finally {
      resolveIndex(Response.json({ data: sheets['insights-list'] }));
      dispose = await pending;
      await dispose.ready;
    }
    expect(el.querySelector('tbody .cp-company').textContent).to.equal('Frescopa');
  });

  it('preserves the typed query when changing campaigns and supports every keyboard search result', async () => {
    await load();
    type(companySearch(), 'site58');
    await tick();
    await chooseCampaign('Northern');
    expect(companySearch().value).to.equal('site58');
    expect(el.querySelectorAll('tbody tr')).to.have.lengthOf(1);
    el.querySelector('.cp-campaign-trigger').click();
    const input = el.querySelector('.cp-campaign-search');
    type(input, 'Roadshow');
    expect(options()).to.have.lengthOf(37);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.getElementById(input.getAttribute('aria-activedescendant')).textContent)
      .to.equal('Roadshow 36');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(new URLSearchParams(window.location.search).get('tab')).to.equal('event-36');
  });

  it('does not re-enable explicitly inactive campaigns through column fallback', async () => {
    sheets['event-tabs'] = [{ Id: 'retired', Column: 'Retired', Label: 'Retired', Active: 'false' }];
    sheets['insights-list'] = [row(0, { Retired: 'Company 0' })];
    await load();
    el.querySelector('.cp-campaign-trigger').click();
    type(el.querySelector('.cp-campaign-search'), 'Retired');
    expect(options()).to.have.lengthOf(0);
    expect(el.querySelector('.cp-catalog-notices').textContent).to.equal('');
  });

  it('keeps retired memberships in full report details without offering them as filters', async () => {
    sheets['event-tabs'] = [
      { Id: 'retired', Column: 'Retired', Label: 'Retired campaign', Active: 'false' },
      { Id: 'current', Column: 'Current', Label: 'Current campaign' },
    ];
    sheets['insights-list'] = [row(0, { Retired: 'Company 0', Current: 'Company 0' })];
    await load();
    el.querySelector('.cp-company').click();
    const memberships = [...document.querySelectorAll('.cp-campaign-memberships li')];
    expect(memberships.map((item) => item.textContent)).to.deep.equal(['Retired campaign', 'Current campaign']);
  });

  it('retains real managed IDs containing underscores in campaign links and history keys', async () => {
    sheets['event-tabs'] = [{ Id: 'dih-cv_Paris', Column: 'DIH cv_Paris', Label: 'Paris', CampaignId: 'cv_Paris' }];
    sheets['insights-list'] = [row(0, { 'DIH cv_Paris': 'Frescopa' })];
    window.history.replaceState(null, '', '/adobe/dashboard?tab=dih-cv_Paris');
    await load();
    expect(new URLSearchParams(window.location.search).get('tab')).to.equal('dih-cv_Paris');
    el.querySelector('.cp-company').click();
    expect(JSON.parse(localStorage.getItem('cp-recent-dih-cv_Paris'))).to.have.lengthOf(1);
  });

  it('shows incomplete-membership feedback inside details when the registry is unavailable', async () => {
    failures['event-tabs'] = 503;
    await load();
    el.querySelector('.cp-company').click();
    expect(document.querySelector('.cp-report-dialog').textContent).to.include('could not be fully loaded');
  });

  it('treats registry rows without a required column as malformed and retryable', async () => {
    sheets['event-tabs'] = [{ Id: 'broken', Label: 'Missing column' }];
    await load();
    expect(el.querySelector('.cp-catalog-notices').textContent).to.include('campaign');
    expect(el.querySelector('.cp-retry')).to.exist;
  });

  it('rejects an incomplete first source page instead of reporting it as the full catalog', async () => {
    fetchStub.callsFake(async (value) => {
      const name = new URL(value, window.location.origin).pathname.split('/').pop().replace('.json', '');
      return Response.json({ data: sheets[name] || [], total: (sheets[name] || []).length, offset: name === 'insights-list' ? 25 : 0 });
    });
    await load();
    expect(el.querySelectorAll('tbody').length).to.equal(0);
    expect(el.querySelector('.cp-results .cp-retry')).to.exist;
  });
});
