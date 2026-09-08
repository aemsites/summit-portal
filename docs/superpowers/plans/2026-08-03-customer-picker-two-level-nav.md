# Customer Picker Two-Level Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the customer picker's flat nine-tab strip with a two-level navigation — a family control (Digital Opportunity Reports / Accounts) over an event chip row led by "All reports" — plus a per-mode context line, a search empty state with a cross-tab rescue, and `?tab=` deep links.

**Architecture:** All changes are inside the `customer-picker` block. The mode list itself is untouched: `parseEventModes` / `deriveEventModes` / `buildEventCompanies` keep resolving modes from the DA sheets exactly as today. A new pure `buildNavModel(eventModes)` groups those resolved modes into families, and a new `buildNav()` renders them. The 987-line block file sheds its share-form section into a sibling module first, matching the multi-file pattern already used by `report-ai-visibility`.

**Tech Stack:** Vanilla ES6 modules, no build step. `ak.js` (Author Kit) block conventions. Tests: `@web/test-runner` + `@esm-bundle/chai` running in a real browser (so DOM assertions are fine). Lint: Airbnb ESLint + stylelint standard.

**Spec:** [`docs/superpowers/specs/2026-08-03-customer-picker-two-level-nav-design.md`](../specs/2026-08-03-customer-picker-two-level-nav-design.md)

## Global Constraints

- **Mode ids are frozen.** `accounts`, `insights`, `portal`, and every sheet-authored event id must keep their exact current values. They back the `cp-recent-<id>` localStorage keys and §2 of the integration contract ("`Id` must never change for an existing tab").
- **No DA schema change.** Do not add, rename, or reserve any column in `/data/event-tabs.json` or `/data/insights-list.json`. The portal only reads these sheets.
- **Do not change Accounts behaviour or contents.** Another team owns it. It may only move within the navigation.
- **Do not modify `scripts/ak.js`** (read-only framework).
- **Keep the `deriveEventModes` fallback working** — a missing or unpublished `event-tabs.json` must still yield chips.
- **Accent colour is `var(--color-brand)`** (purple-500) in this block, not Adobe red. `--rpt-red` is for report blocks; the staff dashboard is purple-accented. Follow the local pattern.
- **Breakpoint is 1000px**, mobile-first, per `CLAUDE.md`.
- **Copy strings, exact:**
  - Primary tabs: `Digital Opportunity Reports`, `Accounts`
  - First chip: `All reports`
  - `portal` chip: `Adobe Summit 2026`
  - Search placeholders: `Search all Digital Opportunity Reports…`, `Search accounts…`, `Search Adobe Summit 2026…`, `Search <event label>…`
  - Dialog CTA: `Open Digital Opportunity Report`
  - Bare-report format label: `Digital Opportunity Report`
- **Every task ends green:** `npm run lint` and `npm test` both pass before the commit.

---

### Task 1: Extract the share form into its own module

Pure refactor, no behaviour change. Gets `customer-picker.js` down before adding nav complexity.

**Files:**
- Create: `blocks/customer-picker/share-form.js`
- Modify: `blocks/customer-picker/customer-picker.js` (remove lines ~412–596, add an import)
- Test: `test/blocks/customer-picker.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `buildShareForm(path: string) => HTMLDivElement` — the share controls bound to one page path
  - `buildShareSection(company: object) => HTMLDivElement | null` — heading + form, or `null` when `company.Folder` is empty
  - `folderToDeepLink(folder: string) => string` — origin stripped, trailing slash preserved

- [ ] **Step 1: Create the module by moving code verbatim**

Create `blocks/customer-picker/share-form.js`. Move these from `customer-picker.js` **unchanged apart from the added `export` keywords**: the `COPY_ICON` constant, `folderToDeepLink`, `requestShareLink`, `buildShareForm`, `buildShareSection`, and every JSDoc comment attached to them.

```js
/**
 * Share controls for the customer picker: mint a one-month link to one page and
 * either email it to a recipient or copy it to the clipboard. Split out of
 * customer-picker.js so that file can stay focused on the picker itself.
 */

/** Same-origin path for a shareable deep link — strips the origin but PRESERVES
 *  the page path exactly (incl. any trailing slash), so a folder/index page
 *  (e.g. `/accounts/.../1800flowers-com/`) resolves to its index. This mirrors
 *  the "Open" CTA, which links to `company.Folder` verbatim. */
export function folderToDeepLink(folder) {
  try {
    return new URL(folder).pathname;
  } catch {
    return folder;
  }
}

// ... COPY_ICON, requestShareLink, buildShareForm (export), buildShareSection (export)
```

- [ ] **Step 2: Import them back in `customer-picker.js`**

Add at the top of `blocks/customer-picker/customer-picker.js`, above the `LETTERS` constant:

```js
import { buildShareForm, buildShareSection, folderToDeepLink } from './share-form.js';
```

Delete the moved definitions from `customer-picker.js`. `folderToPath` stays in `customer-picker.js` — it builds da.live edit URLs and has nothing to do with sharing.

- [ ] **Step 3: Add a smoke test for the extracted module**

Append to `test/blocks/customer-picker.test.js`:

```js
import { buildShareForm, buildShareSection, folderToDeepLink } from '../../blocks/customer-picker/share-form.js';

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
  });

  it('returns null when the company has no folder', () => {
    expect(buildShareSection({ Company: 'Acme' })).to.equal(null);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — all pre-existing tests plus the four new ones.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors. (Airbnb requires the `.js` extension in the import — it is there.)

- [ ] **Step 6: Commit**

```bash
git add blocks/customer-picker/share-form.js blocks/customer-picker/customer-picker.js test/blocks/customer-picker.test.js
git commit -m "refactor(customer-picker): extract share form into share-form.js"
```

---

### Task 2: Nav model and `?tab=` resolution (pure functions)

**Files:**
- Modify: `blocks/customer-picker/customer-picker.js`
- Test: `test/blocks/customer-picker.test.js`

**Interfaces:**
- Consumes: the `eventModes` array produced by the existing `parseEventModes(configRows, insightRows)` — entries are `{ id, label, column }`.
- Produces:
  - `buildNavModel(eventModes) => Family[]` where
    `Family = { id: 'reports' | 'accounts', label: string, modes: Mode[] }` and
    `Mode = { id: string, label: string, kind: 'all' | 'event' }`
  - `findFamily(navModel, modeId) => Family | undefined`
  - `findMode(navModel, modeId) => Mode | undefined`
  - `resolveTabParam(navModel, raw) => string` — a valid mode id, defaulting to `insights`

- [ ] **Step 1: Write the failing tests**

Append to `test/blocks/customer-picker.test.js`. Add `buildNavModel`, `findFamily`, `findMode`, `resolveTabParam` to the existing import list from `customer-picker.js`.

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `buildNavModel is not a function` (or an import error) on every new test.

- [ ] **Step 3: Implement the four functions**

Add to `blocks/customer-picker/customer-picker.js`, directly after the `parseEventModes` function:

```js
/** The mode the picker opens on, and the fallback for an unknown `?tab=`. */
export const DEFAULT_MODE = 'insights';

/**
 * Group the resolved modes into the two-level navigation: a FAMILY (what am I
 * browsing) over a MODE (which slice). Families are code — Accounts belongs to
 * another team, and `portal`/`insights` read sheets of their own — while the
 * event modes come straight from `/data/event-tabs.json` via parseEventModes,
 * in sheet order, ids and labels untouched.
 *
 * `Adobe Summit 2026` (the `portal` mode) is an event like the rest, but it
 * cannot be an event-tabs.json row: it reads `company-list.json` and the
 * `/customers/` tree, so it has no `insights-list` column to name. Hence it is
 * pinned here, first among the events.
 *
 * `kind` separates "everything we have generated" (`all`) from "pinned for one
 * event" (`event`) — the distinction the chip row exists to make visible.
 */
export function buildNavModel(eventModes) {
  return [
    {
      id: 'reports',
      label: 'Digital Opportunity Reports',
      modes: [
        { id: DEFAULT_MODE, label: 'All reports', kind: 'all' },
        { id: 'portal', label: 'Adobe Summit 2026', kind: 'event' },
        ...(eventModes || []).map((e) => ({ id: e.id, label: e.label, kind: 'event' })),
      ],
    },
    {
      id: 'accounts',
      label: 'Accounts',
      modes: [{ id: 'accounts', label: 'Accounts', kind: 'all' }],
    },
  ];
}

/** The family that owns `modeId`, or undefined. */
export function findFamily(navModel, modeId) {
  return navModel.find((f) => f.modes.some((m) => m.id === modeId));
}

/** The mode entry for `modeId`, or undefined. */
export function findMode(navModel, modeId) {
  return navModel.flatMap((f) => f.modes).find((m) => m.id === modeId);
}

/**
 * Resolve a `?tab=` value to a mode id. Unknown values (a retired event, a
 * typo, a link from before a rename) fall back to All reports rather than
 * rendering an empty picker.
 */
export function resolveTabParam(navModel, raw) {
  const id = String(raw == null ? '' : raw).trim().toLowerCase();
  return findMode(navModel, id) ? id : DEFAULT_MODE;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — every new test plus all pre-existing ones.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add blocks/customer-picker/customer-picker.js test/blocks/customer-picker.test.js
git commit -m "feat(customer-picker): add two-level nav model and ?tab= resolution"
```

---

### Task 3: Context-line and empty-state copy (pure functions)

**Files:**
- Modify: `blocks/customer-picker/customer-picker.js`
- Test: `test/blocks/customer-picker.test.js`

**Interfaces:**
- Consumes: `Mode` objects from `buildNavModel` (Task 2) — `{ id, label, kind }`.
- Produces:
  - `contextCopy(mode, count) => { text: string, action: string | null } | null`
  - `emptyStateCopy(mode, query, allCount) => { text: string, action: string | null }`

  In both, a non-null `action` is the label of a control that switches to All reports carrying the current query. Task 5 renders it.

- [ ] **Step 1: Write the failing tests**

Append to `test/blocks/customer-picker.test.js`; add `contextCopy` and `emptyStateCopy` to the import list.

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `contextCopy is not a function`.

- [ ] **Step 3: Implement**

Add to `blocks/customer-picker/customer-picker.js`, after `resolveTabParam`:

```js
/** Thousands separators, so "4035 total" reads as "4,035 total". */
const fmtCount = (n) => Number(n || 0).toLocaleString('en-US');

/**
 * One line of orientation under the chip row: which slice am I looking at, how
 * big is it, and — on an event — how do I get back to the full catalogue. The
 * way back is offered ALWAYS, not just on an empty search: an event tab showing
 * 405 of 4,035 reports is the single most confusing state in the picker.
 * Returns null on Accounts (not this team's surface) and for a missing mode.
 */
export function contextCopy(mode, total) {
  if (!mode || mode.id === 'accounts') return null;
  if (mode.kind === 'all') {
    return {
      text: `Every Digital Opportunity Report we have generated — one card per website. ${fmtCount(total)} total.`,
      action: null,
    };
  }
  return {
    text: `The ${fmtCount(total)} reports pinned for ${mode.label}.`,
    action: 'Looking for someone else? Search all reports',
  };
}

/**
 * Copy for a search that matched nothing. Without this the grid just goes
 * blank, so "no report for Acme at this event" is indistinguishable from "no
 * report for Acme at all" — on an event tab the report is very often sitting in
 * All reports, hence the action.
 */
export function emptyStateCopy(mode, query, allCount) {
  const q = String(query || '').trim();
  const isEvent = !!mode && mode.kind === 'event';
  return {
    text: isEvent ? `No match for “${q}” in ${mode.label}.` : `No match for “${q}”.`,
    action: isEvent ? `Search all ${fmtCount(allCount)} reports` : null,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add blocks/customer-picker/customer-picker.js test/blocks/customer-picker.test.js
git commit -m "feat(customer-picker): add context-line and empty-state copy"
```

---

### Task 4: Render the navigation

**Files:**
- Modify: `blocks/customer-picker/customer-picker.js` (replaces `buildModeToggle`, lines ~299–324)
- Test: `test/blocks/customer-picker.test.js`

**Interfaces:**
- Consumes: `buildNavModel` (Task 2), `contextCopy` (Task 3).
- Produces: `buildNav(navModel, onChange) => { el: HTMLDivElement, setActive(modeId, total): void }`
  - `onChange(modeId, { keepQuery })` fires on a tab/chip click (`keepQuery` false) and on the context-line action (`keepQuery` true).
  - `setActive(modeId, total)` moves the active state, shows or hides the chip row, and rewrites the context line. Callers must invoke it once for the initial mode.

- [ ] **Step 1: Write the failing tests**

Append to `test/blocks/customer-picker.test.js`; add `buildNav` to the import list.

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `buildNav is not a function`.

- [ ] **Step 3: Replace `buildModeToggle` with `buildNav`**

Delete `buildModeToggle` from `blocks/customer-picker/customer-picker.js` and put this in its place:

```js
/**
 * Two-level navigation. The PRIMARY control answers "what am I browsing"
 * (reports vs. the Accounts directory another team owns); the SECONDARY chip
 * row answers "which slice" — All reports, then one chip per event. A hairline
 * after the All-reports chip (CSS, off `.cp-mode-chip--all`) separates the full
 * catalogue from the event pins.
 *
 * `onChange(modeId, { keepQuery })` — keepQuery is true only for the context
 * action, which carries the typed search across to All reports.
 */
export function buildNav(navModel, onChange) {
  const el = document.createElement('div');
  el.className = 'cp-nav';

  // --- primary: one button per family ---
  const primary = document.createElement('div');
  primary.className = 'cp-mode-toggle';
  primary.setAttribute('role', 'tablist');
  primary.setAttribute('aria-label', 'Browse');

  for (const family of navModel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cp-mode-btn cp-family-btn';
    btn.dataset.family = family.id;
    btn.textContent = family.label;
    // A family always opens on its first mode — All reports for reports.
    btn.addEventListener('click', () => onChange(family.modes[0].id, { keepQuery: false }));
    primary.append(btn);
  }

  // --- secondary: one chip per mode in the reports family ---
  const subnav = document.createElement('div');
  subnav.className = 'cp-subnav';
  subnav.setAttribute('role', 'tablist');
  subnav.setAttribute('aria-label', 'Report set');

  const reports = navModel.find((f) => f.id === 'reports');
  for (const mode of reports.modes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cp-mode-chip';
    if (mode.kind === 'all') chip.classList.add('cp-mode-chip--all');
    chip.dataset.mode = mode.id;
    chip.textContent = mode.label;
    chip.addEventListener('click', () => onChange(mode.id, { keepQuery: false }));
    subnav.append(chip);
  }

  // --- context line ---
  const context = document.createElement('p');
  context.className = 'cp-context';

  el.append(primary, subnav, context);

  function setActive(modeId, total) {
    const family = findFamily(navModel, modeId);
    const mode = findMode(navModel, modeId);

    primary.querySelectorAll('.cp-family-btn').forEach((b) => {
      const on = !!family && b.dataset.family === family.id;
      b.classList.toggle('cp-family-btn--active', on);
      b.classList.toggle('cp-mode-btn--active', on);
      b.setAttribute('aria-selected', String(on));
    });

    subnav.querySelectorAll('.cp-mode-chip').forEach((c) => {
      const on = c.dataset.mode === modeId;
      c.classList.toggle('cp-mode-chip--active', on);
      c.setAttribute('aria-selected', String(on));
    });

    // Accounts is a single-mode family: no slice to pick, so no chip row.
    subnav.hidden = !family || family.id !== 'reports';

    const copy = contextCopy(mode, total);
    context.replaceChildren();
    context.hidden = !copy;
    if (!copy) return;

    const text = document.createElement('span');
    text.className = 'cp-context-text';
    text.textContent = copy.text;
    context.append(text);

    if (copy.action) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'cp-context-action';
      action.textContent = copy.action;
      action.addEventListener('click', () => onChange(DEFAULT_MODE, { keepQuery: true }));
      context.append(action);
    }
  }

  return { el, setActive };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add blocks/customer-picker/customer-picker.js test/blocks/customer-picker.test.js
git commit -m "feat(customer-picker): render the two-level nav with context line"
```

---

### Task 5: Empty state, and wire the nav into `init`

The first task where the page visibly changes.

**Files:**
- Modify: `blocks/customer-picker/customer-picker.js` (`applyFilter` ~813–830, `SEARCH_PLACEHOLDERS` ~864, `init` ~870–987)
- Test: `test/blocks/customer-picker.test.js`

**Interfaces:**
- Consumes: `buildNav` (Task 4), `emptyStateCopy` (Task 3), `resolveTabParam` / `DEFAULT_MODE` (Task 2).
- Produces: `applyFilter(container, query) => number` — now returns the number of still-visible cards.

- [ ] **Step 1: Write the failing test for the return value**

Append to `test/blocks/customer-picker.test.js`; add `applyFilter` to the import list.

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `applyFilter` is not exported / returns `undefined` instead of `2`.

- [ ] **Step 3: Make `applyFilter` count and export it**

In `blocks/customer-picker/customer-picker.js`, change the signature to `export function applyFilter(...)`, add a running total, and return it:

```js
/** Hide cards that do not match `query`, hide groups left with none, and return
 *  how many cards are still visible — the caller uses that to decide whether to
 *  show the empty state. */
export function applyFilter(container, query) {
  const q = query.toLowerCase().trim();
  const groups = container.querySelectorAll('.cp-group');
  let total = 0;

  for (const group of groups) {
    const cards = group.querySelectorAll('.cp-card');
    let visibleCount = 0;

    for (const card of cards) {
      const name = card.querySelector('.cp-card-name').textContent.toLowerCase();
      const match = !q || name.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) visibleCount += 1;
    }

    group.style.display = visibleCount > 0 ? '' : 'none';
    total += visibleCount;
  }

  return total;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Update the search placeholders**

Replace the `SEARCH_PLACEHOLDERS` constant:

```js
const SEARCH_PLACEHOLDERS = {
  insights: 'Search all Digital Opportunity Reports…',
  accounts: 'Search accounts…',
  portal: 'Search Adobe Summit 2026…',
};
```

- [ ] **Step 6: Rewire `init`**

In `blocks/customer-picker/customer-picker.js`, replace everything from `el.textContent = '';` to the end of `init` with the version below. Everything above that line — the six `fetch` calls, `groupInsightsByWebsite`, `parseEventModes`, `EVENT_MODE_IDS`, `buildEventCompanies`, `buildLookupMaps` — is unchanged.

```js
  el.textContent = '';

  const navModel = buildNavModel(eventModes);
  const companiesMap = {
    insights: insightsCompanies,
    accounts: accountsCompanies,
    portal: portalCompanies,
    ...eventCompanies,
  };

  const { backdrop, close, content: dialogContent } = buildDialog();
  let activeCard = null;
  let currentMode = DEFAULT_MODE;

  function closeDialog() {
    backdrop.hidden = true;
    if (activeCard) {
      activeCard.classList.remove('cp-card--active');
      activeCard.focus();
      activeCard = null;
    }
  }

  function openDialog(card, company) {
    if (activeCard) activeCard.classList.remove('cp-card--active');
    activeCard = card;
    card.classList.add('cp-card--active');
    renderDialog(dialogContent, company, websiteMap, domainMap, currentMode);
    backdrop.hidden = false;
    close.focus();
    pushRecent(currentMode, company);
  }

  close.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDialog(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !backdrop.hidden) closeDialog(); });

  const { wrapper: searchWrapper, input: searchInput } = buildSearch();
  const navContainer = document.createElement('div');
  const gridContainer = document.createElement('div');

  // Declared before renderMode so renderMode can call nav.setActive without
  // tripping no-use-before-define; assigned once renderMode exists, because
  // buildNav takes it as the change handler.
  let nav;

  // Shown in place of the grid when a search matches nothing. On an event tab it
  // carries the way out — the report is usually in All reports.
  const empty = document.createElement('div');
  empty.className = 'cp-empty';
  empty.hidden = true;

  /** Show or hide the empty state for `visible` matches of the current query. */
  function renderEmptyState(visible) {
    const query = searchInput.value;
    if (visible > 0 || !query.trim()) {
      empty.hidden = true;
      empty.replaceChildren();
      return;
    }
    const copy = emptyStateCopy(findMode(navModel, currentMode), query, insightsCompanies.length);
    const text = document.createElement('p');
    text.className = 'cp-empty-text';
    text.textContent = copy.text;
    empty.replaceChildren(text);
    if (copy.action) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'cp-empty-action';
      action.textContent = copy.action;
      // eslint-disable-next-line no-use-before-define
      action.addEventListener('click', () => renderMode(DEFAULT_MODE, { keepQuery: true }));
      empty.append(action);
    }
    empty.hidden = false;
  }

  /**
   * Render one mode. `keepQuery` carries the typed search across a mode switch —
   * used by the context line and the empty state, which exist precisely so a
   * fruitless event search can be retried against the full catalogue without
   * retyping.
   */
  function renderMode(mode, { keepQuery = false } = {}) {
    currentMode = mode;
    closeDialog();
    const companies = companiesMap[mode] || [];
    if (!keepQuery) searchInput.value = '';
    const event = eventModes.find((e) => e.id === mode);
    searchInput.placeholder = SEARCH_PLACEHOLDERS[mode]
      || (event ? `Search ${event.label}…` : 'Search…');

    const { grid, groups } = buildGrid(companies, openDialog);
    const letterNav = buildLetterNav(groups);

    const recentBand = buildRecentBand(mode, companies, openDialog);
    if (recentBand) navContainer.replaceChildren(recentBand, letterNav);
    else navContainer.replaceChildren(letterNav);
    gridContainer.replaceChildren(grid, empty);

    nav.setActive(mode, companies.length);

    const query = searchInput.value;
    renderEmptyState(query.trim() ? applyFilter(grid, query) : companies.length);

    // Keep the URL shareable: ?tab=<mode> reopens this exact tab.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', mode);
      window.history.replaceState(null, '', url);
    } catch {
      // ignore: history unavailable (sandboxed iframe / opaque origin)
    }
  }

  nav = buildNav(navModel, renderMode);
  el.append(nav.el, searchWrapper, navContainer, gridContainer);

  const initialTab = new URLSearchParams(window.location.search).get('tab');
  renderMode(resolveTabParam(navModel, initialTab));

  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    const grid = gridContainer.querySelector('.cp-grid');
    debounce = setTimeout(() => renderEmptyState(applyFilter(grid, searchInput.value)), 120);
  });
}
```

Two deliberate ordering details, both because `buildNav` takes `renderMode` as its handler while `renderMode` needs the object `buildNav` returns:

- `nav` is a `let` declared **above** `renderMode` and assigned below it. Airbnb's `no-use-before-define` reports by source position even inside nested functions, so a `const nav` declared after `renderMode` would fail lint.
- `renderEmptyState` references `renderMode`, which is defined after it. That one carries the `eslint-disable-next-line` comment shown above — the cycle is genuine (a mode switch re-renders the empty state, and the empty state can trigger a mode switch).

- [ ] **Step 7: Run tests and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 8: Commit**

```bash
git add blocks/customer-picker/customer-picker.js test/blocks/customer-picker.test.js
git commit -m "feat(customer-picker): two-level nav, empty state and ?tab= deep links"
```

---

### Task 6: Rename the report copy in the dialog

**Files:**
- Modify: `blocks/customer-picker/customer-picker.js` (`EVENT_FORMATS` ~42, `groupInsightsByWebsite` ~255, `renderDialog` ~691)
- Test: `test/blocks/customer-picker.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature changes — string values only.

- [ ] **Step 1: Write the failing test**

Append to `test/blocks/customer-picker.test.js`:

```js
describe('customer-picker › report naming', () => {
  it('calls the bare report a Digital Opportunity Report', () => {
    const [card] = groupInsightsByWebsite([
      { Report: 'schiphol.nl', Folder: '/accounts/s/schiphol/insights/schiphol-nl/', Created: '1.05.2026' },
      { Report: 'schiphol.nl', Folder: '/accounts/s/schiphol/insights/schiphol-nl/cannes-2026/', Created: '2.05.2026' },
    ]);
    expect(card.formats[0].label).to.equal('Digital Opportunity Report');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `expected 'Insight report' to equal 'Digital Opportunity Report'`.

- [ ] **Step 3: Rename the two strings**

In `groupInsightsByWebsite`:

```js
        if (bare) formats.unshift({ format: '', label: 'Digital Opportunity Report', folder: bare.folder });
```

In `renderDialog`:

```js
      const ctaLabel = isReport ? 'Open Digital Opportunity Report' : 'Open customer portal page';
```

`EVENT_FORMATS` keeps `'cannes-2026': 'Cannes Lions 2026'` and `'summit-2026': 'Adobe Summit 2026'` — those are event names, already correct, and the existing sort-order test depends on them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — including the pre-existing "sorted by label" test, which is unaffected because the bare report is `unshift`ed rather than sorted.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add blocks/customer-picker/customer-picker.js test/blocks/customer-picker.test.js
git commit -m "feat(customer-picker): call them Digital Opportunity Reports in the dialog"
```

---

### Task 7: Style the two-level navigation

**Files:**
- Modify: `blocks/customer-picker/customer-picker.css`

**Interfaces:**
- Consumes: the class names emitted in Tasks 4 and 5 — `.cp-nav`, `.cp-mode-toggle`, `.cp-family-btn`, `.cp-family-btn--active`, `.cp-subnav`, `.cp-mode-chip`, `.cp-mode-chip--all`, `.cp-mode-chip--active`, `.cp-context`, `.cp-context-text`, `.cp-context-action`, `.cp-empty`, `.cp-empty-text`, `.cp-empty-action`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Reduce the primary control's bottom margin**

`.cp-mode-toggle` currently ends the nav, so it carries `margin-bottom: var(--spacing-l)`. It is now followed by the chip row. In `blocks/customer-picker/customer-picker.css`, change that one declaration:

```css
.cp-mode-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  background: var(--color-surface-alt);
  border-radius: 12px;
  width: fit-content;
  max-width: 100%;
  margin-bottom: var(--spacing-m);
}
```

- [ ] **Step 2: Add the new rules**

Append to `blocks/customer-picker/customer-picker.css`, after the `.cp-mode-btn` block:

```css
/* Secondary nav: which slice of the reports. Deliberately lighter than the
   primary pill control so the two levels read as a hierarchy, not as nine
   equal choices. */
.cp-subnav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: var(--spacing-s);
}

.cp-mode-chip {
  padding: 6px 14px;
  border: none;
  border-radius: 999px;
  font-family: var(--font-family);
  font-size: var(--body-font-size-s);
  font-weight: 600;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

.cp-mode-chip:hover:not(.cp-mode-chip--active) {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.cp-mode-chip--active {
  background: light-dark(var(--color-purple-100), var(--color-purple-900));
  color: var(--color-brand);
}

/* The hairline that separates "everything we have generated" from the event
   pins — the whole point of the redesign, so it is structural, not copy. */
.cp-mode-chip--all {
  margin-right: var(--spacing-s);
  position: relative;
}

.cp-mode-chip--all::after {
  content: "";
  position: absolute;
  right: calc(var(--spacing-s) * -0.5);
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 20px;
  background: var(--color-border);
}

/* Context line: which slice, how big, and how to get back to everything. */
.cp-context {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--spacing-s);
  margin: 0 0 var(--spacing-s);
  font-size: var(--body-font-size-s);
  color: var(--color-text-muted);
}

.cp-context-action,
.cp-empty-action {
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-family);
  font-size: var(--body-font-size-s);
  font-weight: 600;
  color: var(--color-brand);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.cp-context-action:hover,
.cp-empty-action:hover {
  text-decoration: none;
}

/* Empty state: without this a fruitless search just blanks the grid, and "not
   at this event" looks identical to "no report at all". */
.cp-empty {
  padding: var(--spacing-xl) 0;
  text-align: center;
}

.cp-empty-text {
  margin: 0 0 var(--spacing-s);
  font-size: var(--body-font-size-m);
  color: var(--color-text-muted);
}

@media (width < 1000px) {
  .cp-subnav {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .cp-subnav::-webkit-scrollbar {
    display: none;
  }

  .cp-mode-chip {
    flex: 0 0 auto;
  }
}
```

- [ ] **Step 3: Lint the CSS**

Run: `npm run lint:css`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add blocks/customer-picker/customer-picker.css
git commit -m "style(customer-picker): two-level nav, context line and empty state"
```

---

### Task 8: Update the documentation

**Files:**
- Modify: `docs/integrations/event-tabs-and-event-membership.md` (§2 "Rules", §7 table, §9 "Reference")
- Modify: `PROJECT.md` (the `customer-picker` block section)

**Interfaces:**
- Consumes: the function names from Tasks 2–5.
- Produces: nothing.

- [ ] **Step 1: Fix §2 of the integration guide**

In `docs/integrations/event-tabs-and-event-membership.md`, replace the first bullet under "### Rules":

```markdown
- **Row order is tab order.** Tabs render inside the **Digital Opportunity
  Reports** section of the picker, as chips left-to-right in sheet row order,
  after the two code-side entries: **All reports** (the full catalogue) and
  **Adobe Summit 2026** (which reads `company-list.json`, not an `insights-list`
  column, so it cannot be a row here). **Accounts** sits in the other primary
  tab and is unrelated to this sheet.
```

- [ ] **Step 2: Add a deep-link note to §2**

Append after the `Id` slug bullet in the same "### Rules" list:

```markdown
- Each tab is deep-linkable as `/adobe/dashboard?tab=<Id>` — another reason not
  to change an `Id` once links to it exist in the wild. An unknown `tab` value
  falls back to **All reports** rather than erroring.
```

- [ ] **Step 3: Extend the §7 symptom table**

In §7, the table whose header row is `| Symptom | Most likely cause |` ends with the `Card links 404` row. Add one row after it:

```markdown
| A `?tab=` link opens All reports instead | That `Id` no longer exists — it was renamed, or the row was deleted rather than set `Active: false` |
```

- [ ] **Step 4: Update §9**

Replace the function list in "## 9. Reference — how the portal consumes this" with:

```markdown
`blocks/customer-picker/customer-picker.js`:

- `parseEventModes(configRows, insightRows)` — resolves `event-tabs.json` rows into
  the tab list; falls back to `deriveEventModes` when nothing usable survives.
- `deriveEventModes(insightRows)` — the fallback described in §7.
- `buildEventCompanies(insightRows, column)` — builds the cards for one tab.
- `slugifyModeId(value)` — the `Id` default rule.
- `buildNavModel(eventModes)` — groups the resolved modes into the two-level
  navigation. Event modes pass through with their ids and labels untouched; this
  function adds no authored surface, which is why the two-level redesign needed
  no change to either sheet.
- `resolveTabParam(navModel, raw)` — maps `?tab=` to a mode id.

All are exported and unit-tested in `test/blocks/customer-picker.test.js`.
```

- [ ] **Step 5: Update `PROJECT.md`**

In the `### customer-picker` section, replace the opening sentence:

```markdown
Staff-facing search/share surface with **two-level navigation** — a primary family
control (**Digital Opportunity Reports** / **Accounts**) over a secondary chip row
of report sets (**All reports**, **Adobe Summit 2026**, then one chip per event,
**authored in DA — no code change per event**) — plus A–Z letter nav, per-format
report links, and per-page sharing via `/auth/sharelink`. Data is fetched live
from four DA sheets under `/data/`: `account-list.json` (Accounts),
`company-list.json` (Adobe Summit 2026), `insights-list.json` (All reports + event
membership), and `event-tabs.json` (which event tabs exist); CUG email domains
come from `/closed-user-groups.json`.
```

Then insert a new paragraph immediately after that one:

```markdown
**Two-level navigation (`buildNavModel` / `buildNav` / `resolveTabParam`, exported
for tests).** The old flat strip of nine tabs made one row carry two unrelated
choices — *what am I browsing* (an account directory vs. digital opportunity
reports) and *which slice* (all of them vs. one event's pins) — so staff could not
tell where to find an arbitrary customer's report. The primary control now picks
the family; the chip row picks the slice, led by **All reports** with a hairline
(`.cp-mode-chip--all::after`) separating the full catalogue from the event pins.
Accounts is a single-mode family, so its chip row is hidden — its contents and
behaviour are untouched (another team owns it). The picker opens on **All
reports** (was Accounts). A **context line** under the chips states the size of
the current slice and, on an event, always offers the way back to All reports; a
matching **empty state** replaces the previously blank grid when a search finds
nothing, and on an event tab carries the query across to All reports so a
fruitless event search is never a dead end. `?tab=<mode-id>` deep-links a tab and
is kept in sync via `replaceState`; unknown values fall back to All reports.
**Mode ids are unchanged** by the redesign (`accounts`, `insights`, `portal`, and
the sheet-authored event ids), so every `cp-recent-<id>` list survives and the
`event-tabs.json` contract needs no new column — grouping is derivable, since
every row in that sheet is an event by definition. The share form lives in
`blocks/customer-picker/share-form.js`.
```

Also update the `Insight Reports` mentions in the "**Event portal tabs**" and
"**Insight-report grouping**" paragraphs of that section to `All reports`, and
`Summit 26 Portal` to `Adobe Summit 2026`.

- [ ] **Step 6: Commit**

```bash
git add docs/integrations/event-tabs-and-event-membership.md PROJECT.md
git commit -m "docs: two-level customer-picker nav in the integration guide and PROJECT.md"
```

---

### Task 9: Verify in the browser and open the PR

**Files:** none modified unless a defect surfaces.

**Interfaces:**
- Consumes: everything above.
- Produces: a pull request.

- [ ] **Step 1: Start the dev server**

```bash
npx -y @adobe/aem-cli up --no-open --forward-browser-logs
```

- [ ] **Step 2: Check the four states**

Open `http://localhost:3000/adobe/dashboard` and confirm with Playwright snapshots (screenshots sparingly, per `CLAUDE.md`):

1. Opens on **Digital Opportunity Reports** → **All reports**, context line reads "Every Digital Opportunity Report we have generated — one card per website. N total."
2. Clicking **Munich Summit 2026** switches the chip, updates the context line to the pinned count, and offers "Looking for someone else? Search all reports". The URL gains `?tab=munich`.
3. Typing a name with no match in an event tab shows the empty state; clicking its action lands on All reports with the query still in the box and results showing.
4. Clicking **Accounts** hides the chip row and the context line; the grid is unchanged from today.

Also load `http://localhost:3000/adobe/dashboard?tab=cannes` directly and confirm it opens on that chip, and `?tab=nonsense` falls back to All reports.

- [ ] **Step 3: Check the breakpoint and the themes**

Resize below 1000px: the chip row scrolls horizontally rather than wrapping to three lines. Toggle dark mode via the header: chips, context line, and empty state all stay legible.

- [ ] **Step 4: Full green run**

```bash
npm test && npm run lint
```
Expected: all tests pass, no lint errors.

- [ ] **Step 5: Open the pull request**

Base `main`, from the current `feat/da-driven-event-tabs` branch (or a fresh `feat/customer-picker-two-level-nav` branch if the working branch has already been merged). Include in the body: the problem, the before/after nav shape, and an explicit "no DA schema change — mode ids unchanged, no new sheet columns, `deriveEventModes` fallback intact" note for whoever owns the hub.

---

## Notes for the implementer

- **`npm test` runs in a real browser** (`@web/test-runner`), so `document.createElement` works in tests. There is no jsdom shim to fight.
- **The existing tests are the contract regression guard.** `parseEventModes`, `deriveEventModes`, `buildEventCompanies`, `groupInsightsByWebsite`, `parseInsightFolder` and `slugifyModeId` must not change behaviour. If one of their tests goes red, the DA-facing layer has been broken — stop and reconsider rather than editing the test.
- **`/data/**` is behind a CUG** (`adobe.com`, `semrush.com`). Locally the fetches will 401 unless signed in; the picker degrades to whatever it could load. Verify against a signed-in session.
- **Do not touch `scripts/ak.js`.**
