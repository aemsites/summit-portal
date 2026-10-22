# Campaign filtering and report membership

The dashboard uses a searchable campaign picker instead of adding a tab for
every event. Campaign names and report memberships still come from the existing
`event-tabs` and `insights-list` sheets. Adding or renaming a campaign does not
need a portal code change.

A report can belong to several campaigns. Membership is attached to its exact
published page, not inferred from its company, website, or report format.

## The two sheets

| Sheet | Purpose |
|---|---|
| `/data/event-tabs.json` | Campaign IDs, displayed names, membership columns and visibility |
| `/data/insights-list.json` | Report metadata and one sparse cell for each membership |

The picker derives both URLs from its authored `company-list.json` source. For
example, `/data-stage/company-list.json` selects the sibling `data-stage` sheets,
not production `/data/` sheets. The legacy Adobe Summit 2026 campaign continues
to read that company list. Email-domain information continues to come from
`/closed-user-groups.json`.

Accounts navigation is not part of this report dashboard. Account pages, data,
and access rules are unchanged.

## Campaign registration

One registry row describes one campaign:

| Field | Meaning |
|---|---|
| `Column` | Required. The exact membership-column name in `insights-list`. |
| `Label` | Human-readable campaign name. Defaults to `Column` for legacy rows. |
| `Active` | Blank means visible. `false`, `no`, `0`, `off` or `n`, ignoring case and surrounding spaces, hides the filter choice. |
| `Id` | Stable URL and recent-history ID. Legacy rows can omit it to use a slug of `Column`. |
| `CampaignId` | DIH's real campaign ID for managed registrations. It is registry metadata, not an index column. |

DIH publishes this shape, illustrated with a synthetic campaign:

```json
{
  "Id": "dih-cv_example",
  "Column": "DIH cv_example",
  "Label": "Experience Makers Paris",
  "Active": "true",
  "CampaignId": "cv_example"
}
```

Managed IDs retain their spelling, including underscores. They are not generated
from the label. Renaming a campaign changes `Label`, not its ID or column.
Historical legacy IDs such as `cannes`, `london` and `mumbai` must also stay stable.

Campaigns with the same name remain separate. The picker adds a visible
`Legacy: <Id>` or `DIH: <CampaignId>` qualifier when needed. Full long names wrap
instead of being truncated.

Registry order controls search-result order. Built-in `insights`, `portal` and
`accounts` IDs are reserved. `portal` is the legacy Adobe Summit campaign; it is
not inferred from a report having a `summit-2026` format.

Retire a campaign with `Active: false` rather than deleting its registry row.
Its filter choice disappears, but exact-page memberships remain visible in
report details. A valid empty or fully inactive registry does not enable the
legacy-column fallback.

## Exact-page memberships

This synthetic report belongs to two DIH campaigns and one legacy event:

```json
{
  "Report": "frescopa.example",
  "Customers": "Frescopa",
  "Folder": "/accounts/f/frescopa/insights/frescopa-example/portal-landing/",
  "Created": "22.10.2026",
  "DIH cv_example": "Frescopa",
  "DIH cv_another": "Frescopa",
  "Cannes 2026": "Frescopa"
}
```

Each membership key must match its registry `Column` exactly, including spaces
and case. A nonblank value means membership. Missing keys, empty strings and
whitespace mean no membership.

The value is the campaign-specific company label. A semicolon separates
co-branded aliases: `"EY; EY Studio+"` produces two selectable entries for that
same page. These aliases remain searchable.

Prefer sparse cells: add only member keys, and never clear unrelated campaign
cells when updating a report. Reserved report fields are:

```text
Report    Customers    Folder    Created    Report Notice
```

The All campaigns view preserves the existing one-entry-per-website grouping:
the newest `portal-landing` wins; otherwise the available legacy formats remain
selectable. A specific campaign uses its flagged raw rows instead. It must not
replace an older member page with a newer nonmember page for the same website.

Company, publication date and report notice come from the selected exact page.
Details list all known memberships for that page, including retired campaigns.
Choosing another format changes the memberships, Open/Edit target and share
target together. Sharing preserves the trailing slash and uses the existing
one-month email/copy link contract.

## Dashboard search, pages and links

The company-or-website field filters the complete selected dataset before
pagination. The table starts with 25 rows and lets people choose 25, 50 or 100.
Only that page's rows are rendered. Sorting is company A-Z, website, then
report path. Changing a filter or page size starts at page one.

Campaign search matches any part of the name, ignoring case and accents. An
empty campaign query shows the current selection, All campaigns and a search
prompt, not a long list. Every matching result remains keyboard-reachable in
the scrollable list.

Existing `/adobe/dashboard?tab=<Id>` links still work. The URL also records:

| Parameter | Value |
|---|---|
| `q` | Company/website query |
| `page` | One-based page number |
| `size` | 25, 50 or 100 |

Campaign and page changes add history entries; typing replaces the current entry
after the short debounce. Back/forward restores controls and results. Invalid
pages and sizes are normalized. Unknown or retired campaign links visibly fall
back to All campaigns. `tab=accounts` also returns to reports.

No new cross-visit filter storage is created. Existing eight-item,
folder-deduplicated `cp-recent-<Id>` history remains.

## Loading and recovery

Primary reports, company information, the registry and email-domain information
load independently. An optional-source failure does not turn a successful report
index into an empty catalog.

The reader consumes complete sheet data. When a response advertises more rows,
it follows `offset` pagination and verifies the returned offset and total.
Malformed rows, inconsistent totals and incomplete pages are retryable failures,
not successful partial catalogs.

| State | Dashboard behavior |
|---|---|
| Loading | Visible progress, not a false empty result |
| 401 | Adobe sign-in link |
| 403 | Explicit access explanation |
| Unavailable or malformed index | Error with Retry |
| Registry 404 | Visible incomplete status; genuine legacy columns remain usable |
| Other registry failure | Warning with recovery; an unresolved selected campaign is held, not silently replaced by All campaigns |
| Valid empty or inactive registry | No inferred choices; inactive campaigns stay hidden |
| Incomplete membership sources | Details explain that the list may be incomplete |

The 404 fallback never presents machine columns such as `DIH cv_example` as
human-readable campaign names. Publish or restore the registry to recover them.
It waits for the report index before resolving a legacy campaign deep link.

`/data/**` is protected by the portal's existing closed user group. Anonymous
401 responses are expected. This change does not relax those access rules.

## Writing and publishing

DA writes replace the entire source file. Do not post only the new rows:
that deletes every row omitted from the request.

```text
GET  https://admin.da.live/source/aemsites/summit-portal/<path>
POST https://admin.da.live/source/aemsites/summit-portal/<path>
```

Authenticate with the existing DA bearer token. POST is multipart form data:
field `data`, content type `application/json`. Preserve the envelope:

```json
{
  "total": 0,
  "limit": 0,
  "offset": 0,
  "data": [],
  ":sheetname": "data",
  ":type": "sheet"
}
```

The example shows an empty envelope: on a real whole-file write, set `total`
and `limit` to the actual `data.length`. Preserve other envelope keys,
legacy registrations, aliases, report notices and unrelated cells.

Serialize read-modify-write operations. A last-moment GET alone does not prevent
two writers from losing one another's changes. DIH uses the existing shared
sheet lock; do not race it with manual whole-file edits.

Publish content and index membership before exposing the registry choice:

1. Publish the report page and its `insights-list.json` membership.
2. Publish the matching `event-tabs.json` registration.

Each changed path needs both endpoints, preview first and live second:

```text
POST https://admin.hlx.page/preview/aemsites/summit-portal/main/<path>
POST https://admin.hlx.page/live/aemsites/summit-portal/main/<path>
```

The two sheets are not an atomic transaction. A partial failure must remain
visible and retryable. Stage uses the configured `data-stage` paths; do not
substitute production paths during testing.

Deploy this portal reader before enabling the corresponding DIH writer.
Opening or merging a code PR does not authorize a production content edit,
backfill or publication.

## Integration checks

- Keep every pre-existing row, envelope key and unrelated membership cell.
- Keep stable IDs and columns; change only the displayed label on a rename.
- Verify one exact page appears under each of its campaigns.
- Verify details do not inherit another format's memberships.
- Verify a reused report can gain membership without replacing report content.
- Verify retirement hides the choice without deleting historical details.
- Verify preview and live publication of both changed sheets.
- Compare selectable entry counts, remembering semicolon aliases can outnumber raw rows.

`customer-picker.js` retains the existing parser/grouping exports for legacy
callers. The dashboard now uses `report-catalog.js` for complete-dataset search,
stable sorting, pagination, URL state, qualifiers and exact-path memberships.
Both modules have browser tests under `test/blocks/`.
