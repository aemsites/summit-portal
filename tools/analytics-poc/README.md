# Engagement Analytics — Worker-free POCs

Two Cloudflare-Worker-free proofs of concept for share-link engagement
analytics, selected by `ANALYTICS_MODE` in `scripts/utils/analytics-config.js`:

| `ANALYTICS_MODE` | Backend | Setup | Real cross-user data? |
|---|---|---|---|
| `'worker'` (default) | Cloudflare Worker + KV (production) | KV namespace | ✅ |
| `'sheet'` | Google Apps Script → Google Sheet | small (below) | ✅ |
| `'local'` | this browser's `localStorage` | none | ❌ device-only |

**POC only — do not use in production** (the `'sheet'` ingest endpoint is
unauthenticated; `'local'` data is unattributed and device-bound). The
production Worker path stays intact and is the committed default; a POC is
enabled by setting `ANALYTICS_MODE` locally.

## `'local'` mode — zero setup

Set `ANALYTICS_MODE = 'local'` in `scripts/utils/analytics-config.js`. That's
it — no accounts, no URLs, no network. Browse pages on your machine; every visit
is stored in `localStorage` (key `engagement-analytics-poc`). Open the page
hosting the `engagement-dashboard` block to see the data; use its **Clear local
data** button to reset. Data lives only in that browser. Add `?v=name` to a URL
to tag a visit; otherwise visits are attributed to `local`.

## `'sheet'` mode — Google Sheet backend

## How it fits together

```
Shared page (?v=nike)                          Staff dashboard
  sharelink-tracking-poc.js                       engagement-dashboard block
        │ sendBeacon (POST event JSON)                  │ fetch published CSV
        ▼                                               ▼
  Apps Script /exec  ──►  Google Sheet  ──►  "Publish to web" CSV
        (doPost appends a row)                    (read source)
```

## One-time setup

1. **Create a Google Sheet** (any name).
2. **Add the script**: Extensions → Apps Script. Delete the stub, paste
   `apps-script.gs` from this folder, Save.
3. **Deploy as Web App**: Deploy → New deployment → type *Web app* →
   *Execute as: Me*, *Who has access: Anyone* → Deploy → authorize.
   Copy the **/exec URL**.
4. **Publish the sheet as CSV**: in the Sheet, File → Share → Publish to web →
   choose the `events` sheet → *Comma-separated values (.csv)* → Publish.
   Copy the **CSV URL**.
5. **Wire it up (local, do not commit as enabled)** in
   `scripts/utils/analytics-config.js`:
   ```js
   export const ANALYTICS_MODE = 'sheet';             // set locally
   export const POC_INGEST_URL = '<your /exec URL>';
   export const POC_CSV_URL   = '<your published CSV URL>';
   ```

## Viewing the dashboard

`engagement-dashboard-test.html` in this folder is a **sample page** that embeds
the `engagement-dashboard` block. It's a reference to copy into wherever your
content lives — drop it at `/content/engagement-dashboard-test.html` in your
content repo (preview at `http://localhost:3000/content/engagement-dashboard-test`),
or author the block on a page in DA (a table whose first cell is
`Engagement Dashboard`). The block builds its own UI, so no authored rows are
needed. ak.js wraps `main > div > div.engagement-dashboard` into the section /
`.block-content` structure automatically.

## Testing it

- Open a content page with a share marker, e.g.
  `…/accounts/n/nike/?v=nike`. Scroll, click a link/CTA, then leave the page.
- Watch rows appear in the Sheet (`events` tab).
- Open the staff page hosting the `engagement-dashboard` block — it reads the
  CSV and shows per-page views, unique `v` visitors, avg scroll, CTA/interaction
  clicks, and per-page event detail.

## What's captured

One row per event: `timestamp, path, event, v, view_id, depth,
duration_seconds, href, text, block, download, device, referrer`.

- `event`: `page_view` | `scroll_depth` | `cta_click` | `time_on_page`
- `v`: the `?v=` attribution marker (who the link was shared with)
- `block`: the nearest block name for a click, so interactions are attributed to
  a block (e.g. a `file-card` PDF download vs. a `report-callout` CTA)
- `download`: set when the clicked link looks like a file download

## Reverting to production

Set `ANALYTICS_MODE = 'worker'` (the default). The Worker tracker + `/auth/analytics`
path take over; this POC code is untouched and simply unused.
