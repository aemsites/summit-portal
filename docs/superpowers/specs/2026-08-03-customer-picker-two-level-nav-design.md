# Customer picker — two-level navigation

**Date:** 2026-08-03
**Status:** approved, ready for planning
**Surface:** `/adobe/dashboard` → `customer-picker` block

## Problem

The picker renders one flat strip of nine tabs:

```
Accounts | Insight Reports | Summit 26 Portal | Cannes 2026 Portal |
Sydney Summit 2026 | Summit London 2026 | Munich Summit 2026 |
Summit Singapore 2026 | Summit Mumbai 2026
```

That strip is being asked to express two unrelated choices at once — *what am I
browsing* (an account directory vs. digital opportunity reports) and *which
slice of the reports* (all of them vs. one event's pinned subset). Nothing in
the layout says which is which, so staff can't tell where to get a report for an
arbitrary customer versus where to find the list curated for the event they're
standing at. The strip also wraps to two lines already and gets worse with every
new event.

Two secondary problems fall out of the same flatness:

- **`Insight Reports` is the wrong name.** The product is a Digital Opportunity
  Report everywhere else — the sales playbook, the callouts on this very page.
- **Searching inside an event tab fails silently.** No match hides every card
  with no empty state, so "no report for Acme at Munich" is indistinguishable
  from "no report for Acme at all", when it may well be sitting in the full list.

## Content today

| Tab | Source | Cards | Owned by |
|---|---|---|---|
| Accounts | `/data/account-list.json` | account directory | another team — do not touch |
| Insight Reports | `/data/insights-list.json`, grouped by website | 4,035 | this team |
| Summit 26 Portal | `/data/company-list.json` → `/customers/…` | 1,844 | this team |
| Cannes 2026 Portal | `insights-list` column `Cannes 2026` | 230 | this team |
| Sydney Summit 2026 | column `Sydney Summit 2026` | 291 | this team |
| Summit London 2026 | column `Summit London 2026` | 112 | this team |
| Munich Summit 2026 | column `Munich Summit 2026` | 405 | this team |
| Summit Singapore 2026 | column `Summit Singapore 2026` | 118 | this team |
| Summit Mumbai 2026 | column `Summit Mumbai 2026` | 382 | this team |

`Summit 26 Portal` is an event like the others (Adobe Summit 2026, Las Vegas); it
only differs in reading `company-list.json` and the `/customers/` tree rather
than an `insights-list` column. Which event tabs exist is authored in
`/data/event-tabs.json` — see
[`docs/integrations/event-tabs-and-event-membership.md`](../../integrations/event-tabs-and-event-membership.md).

## Design

### 1. Two-level navigation

State becomes a `family` + `mode` pair. **Mode ids are unchanged** (`accounts`,
`insights`, `portal`, and the sheet-authored event ids), so every
`cp-recent-<id>` localStorage key keeps working and §2's "never change `Id`" rule
in the integration contract is honoured.

**Primary** — segmented control, reusing the existing `.cp-mode-toggle` pill
styling:

```
┌─────────────────────────────┐ ┌──────────┐
│ Digital Opportunity Reports │ │ Accounts │
└─────────────────────────────┘ └──────────┘
```

`Digital Opportunity Reports` is the default on load (was `Accounts`).

**Secondary** — rendered only for the Reports family, in a lighter chip
treatment so the two levels are visually distinct:

```
( All reports ) │ Adobe Summit 2026  Cannes 2026 Portal  Sydney Summit 2026
                  Summit London 2026  Munich Summit 2026  Summit Singapore 2026
                  Summit Mumbai 2026
```

A hairline divider after **All reports** separates "everything we have generated"
from "pinned for an event". That divider is the whole point of the redesign: the
distinction is expressed structurally instead of being left for the reader to
infer from tab names.

Chip order: `All reports` → `Adobe Summit 2026` → the `event-tabs.json` rows in
sheet order. `Adobe Summit 2026` stays code-side (it is the `portal` mode and
reads a different sheet, so it cannot be an `event-tabs.json` row — its `Column`
would have to name an `insights-list` column that does not exist).

Accounts has no secondary row; its contents and behaviour are untouched.

Layout: chips wrap on desktop, scroll horizontally below the 1000px breakpoint.

DOM order inside the block, top to bottom: primary control → secondary chip row →
context line → search input → "Recently viewed" band → letter nav → grid. Only
the first two rows are new; everything from the search input down keeps its
current position and behaviour, including the sticky offsets.

### 2. Context line

A single line below the chips, per mode:

- All reports — *"Every Digital Opportunity Report we have generated — one card
  per website. 4,035 total."*
- An event — *"Reports pinned for Munich Summit 2026 — 405 companies."*
- Accounts — no line (not this team's surface).

Counts come from the rendered company array, so they stay correct without any
extra data.

### 3. Empty state and the cross-tab rescue

`applyFilter` currently hides non-matching cards and their letter groups, leaving
a blank page. Add an empty state whenever a filter leaves zero visible cards:

- Any mode: *"No match for 'acme'."*
- Event modes additionally: a **"Search all 4,035 reports →"** action that
  switches to All reports **carrying the current query**, re-running the filter
  so the user lands on results rather than a cleared box.

This is the fix for the silent-failure problem. It also means an event tab can
never be a dead end.

### 4. Deep links

A `?tab=<mode-id>` query parameter selects family + mode on load and is kept in
sync with `history.replaceState` as tabs change. Unknown or missing values fall
back to All reports. Lets staff bookmark their own event or paste a link to one
event's list into Slack.

Uses the existing mode ids as the vocabulary. The letter nav's `#cp-group-<letter>`
anchors are unaffected (they already `preventDefault` and scroll manually).

### 5. Naming

| Now | New |
|---|---|
| `Insight Reports` | `Digital Opportunity Reports` (primary tab) / `All reports` (chip) |
| `Summit 26 Portal` | `Adobe Summit 2026` |
| "Open insight report" (dialog CTA) | "Open Digital Opportunity Report" |
| "Search insight reports…" | "Search all Digital Opportunity Reports…" |
| "Search <event>…" | unchanged |

DA-authored `Label` values (e.g. `Cannes 2026 Portal`) are **left alone**. `Label`
is hub-written territory; a tidy here could be reverted by the hub's next
read-modify-write, and the redesign does not depend on the wording. Revisit as a
separate content change if the trailing "Portal" bothers anyone.

## Integration contract — no change required

Checked against `docs/integrations/event-tabs-and-event-membership.md`:

- **No new or renamed column** in `event-tabs.json`. Grouping needs no
  authored signal: every row in that sheet *is* an event by definition, and the
  three built-in modes live in code.
- **No change** to `insights-list.json` columns or the reserved-name set
  (`Report`, `Customers`, `Folder`, `Created`, `Report Notice`).
- **Mode `Id` values untouched**, so no user loses a "Recently viewed" list.
- **`deriveEventModes` fallback kept intact** — a missing or unpublished
  `event-tabs.json` still degrades to derived tabs, now rendered as chips.
- The portal only ever reads these sheets; the hub's read-modify-write cycle is
  unaffected.

One documentation edit is required: §2 of the integration guide states that
event tabs "render left-to-right in sheet row order, after the three built-in
tabs (Accounts, Insight Reports, Summit 26 Portal)". Under the new structure they
render as chips inside the Reports family, after `All reports` and
`Adobe Summit 2026`. Row order is still tab order. §9 gains no new functions but
should name the new nav builder.

## Components

`blocks/customer-picker/customer-picker.js` is 987 lines and mixes data loading,
nav, grid, dialog, and the share form. This change adds nav complexity, so the
share form moves out first — multi-file blocks are already an established pattern
here (`report-ai-visibility` ships `rav-core.js` and `relocate-section-footer.js`).

| Unit | Responsibility | Depends on |
|---|---|---|
| `share-form.js` (new) | `requestShareLink`, `buildShareForm`, `buildShareSection` — mint/send/copy a one-month link for one page path | `/auth/sharelink` |
| `customer-picker.js` | data load, nav model, grid, dialog, filter | the above; the five `/data/` sheets |

The nav builder (`buildNav`) takes the resolved mode list plus an `onChange`
callback and returns the primary control, the secondary chip row, and the context
line. It has no knowledge of where modes came from — the existing
`parseEventModes` / `deriveEventModes` / `buildEventCompanies` functions are
unchanged and stay the sole source of the mode list.

## Testing

Existing unit tests in `test/blocks/customer-picker.test.js` cover
`parseEventModes`, `deriveEventModes`, `buildEventCompanies`,
`groupInsightsByWebsite`, `parseInsightFolder`, and `slugifyModeId` — none of
those change behaviour, and all must keep passing as the regression guard on the
content contract.

New coverage:

- Mode-list → nav structure: primary has exactly two entries; the Reports family
  lists `All reports`, `Adobe Summit 2026`, then the event modes in sheet order;
  Accounts has no secondary row.
- Every rendered chip's mode id matches an id in the resolved mode list (guards
  the recents keys).
- `?tab=` resolution: known id selects it, unknown/absent falls back to
  `insights`, and an `accounts` value selects the Accounts family.
- Zero-result filter renders the empty state; on an event mode it offers the
  cross-tab action, on All reports it does not.
- Cross-tab action switches mode and preserves the query.

Visual check at `http://localhost:3000/content/index`-equivalent dashboard route,
desktop and <1000px, light and dark.

## Out of scope

- Anything inside the Accounts tab.
- Changing DA-authored event labels.
- Counts on chips (kept in the context line to avoid noise).
- Grouping events by region or upcoming/past — no demand, and it would need a new
  `event-tabs.json` column.
