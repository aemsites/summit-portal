# Summit Portal — Personalized Performance Reports

## Overview

A personalized digital performance report delivered to Adobe Summit attendees who are AEM Sites customers. Each report presents site-specific metrics — traffic, performance scores, AI search visibility, and SEO health — in a polished, data-rich single-page format.

The current content is a **sample report for Nike**, used during development. In production, the same block system will generate unique reports for each Summit attendee's site.

- **Framework**: `ak.js` (Author Kit / Document Authoring)
- **Content source**: https://main--summit-portal--gabrielwalt.aem.page
- **Initial import**: Created via the [Slicc browser extension](https://github.com/ai-ecoverse/slicc)
- **Design**: Fully responsive (single 1000px breakpoint), dark mode support via `light-dark()` CSS, rich data visualizations (SVG charts, gauges, animated counters), smooth animations (typing effect, count-up numbers)

### Pages
- `/docs/sales-playbook` — **internal seller playbook**: how to read, present, and defend a Digital Opportunity Report so any seller can pitch a portal landing page. Staff-only, linked from the staff dashboard (`/adobe/dashboard`). Authored in DA from existing report blocks (`report-cards`, `table`, `report-callout`) plus the `copy-markdown` button and the `docs` theme block. Opens with a `docs` block that switches the page into the documentation theme (`blocks/docs/docs.css`). (`advanced-tabs` was deliberately avoided — its decorator hijacks every sibling `.section` in `main` as a tab panel, which breaks a long multi-section page.)

## Project Structure

```
├── blocks/                    # Block implementations (JS + CSS per block)
│   ├── header/                # Site header with nav, help icon, dark mode toggle
│   ├── footer/                # Site footer with copyright + legal links
│   ├── report-hero/           # Hero greeting with brand badge and decorative SVG
│   ├── report-stats/          # Metric cards with gauges and trend badges
│   ├── report-carousel/       # Tabbed carousel with SVG charts and findings
│   └── report-download/       # Download CTA with PDF card preview
├── content/                   # Authored content (served by AEM CLI)
│   ├── index.plain.html       # The report page
│   ├── nav.plain.html         # Header navigation content
│   └── footer.plain.html      # Footer content
├── img/                       # Static assets (SVGs, icons, logos)
├── styles/
│   └── styles.css             # Global styles with design tokens
├── scripts/
│   ├── ak.js                  # Core framework (NEVER MODIFY)
│   ├── scripts.js             # Page initialization
│   ├── lazy.js                # Post-LCP loading (footer, sidekick)
│   └── postlcp.js             # Header loading
```

## Blocks

### report-hero (insight variant)
Full-width red banner with a personalized greeting ("Hello, Erika!"), a site description, a brand badge linking to the customer's site (with favicon), and a site screenshot. Features a typing animation on the heading and a decorative SVG background. The screenshot is hidden on mobile.

### report-stats (dark variant)
A horizontal strip of four metric cards on a black background. Each card shows a KPI label, animated count-up value, a color-coded trend badge (positive/negative/critical/optimal), and a description. The performance score card includes an SVG semicircle speedometer; the red fill arc and needle are animated with geometry suited to a ≤180° sweep (selectors `.rs-gauge-fill` / `.rs-gauge-needle` when present). **Experiment:** `.report-stats.dark` pins light-theme colors (`color-scheme: light` + fixed values) so the hero KPI strip stays black with white type regardless of the page color theme toggle.

On insight/Cannes pages, the light **Search performance** block renders the shared `.rav-stats` strip (same markup and CSS as **report-ai-visibility**): sentence-case labels, large values, sublabel descriptions, and a bottom hairline — laid out in a **2×2 grid** (AI visibility keeps 3-across). Severity (`poor` / `good` / `warning`) tints the value only. The strip is a direct child of `.report-stats`; relocated “How to act” / data-source footers sit in a sibling `.rav-panels-outer` below. Summit pages keep the legacy `.rs-grid` card layout.

### report-carousel
A tabbed carousel with three persona views — Executive overview, Marketer insights, and IT/Engineering learnings. Each tab contains multiple slides with a "Top insight" callout and an SVG data visualization (column charts, line charts, donut charts, horizontal bars, stacked bars, big figures, metric strips, or recommendation lists). Includes dot navigation, prev/next arrows, and a slide counter. `bigfigure` accepts the documented single pipe-delimited row (`value | unit | label`) as well as the legacy three-`<p>` form — the renderer reads the pipe parts first so the documented form (what the DIH template emits) doesn't drop the unit/context. Slides use `min-height` (not a fixed `height`) so tall content like a 3-item `recommendationlist` grows to fit instead of clipping; on mobile the `.rc-slide-visual` 300px height cap applies only to SVG charts, not to text-content visuals (`recommendationlist`/`metricstrip`), which must grow.

### report-download
A split layout with a heading, description, and download CTA on the left, and an interactive PDF card preview on the right. The card has a red patterned background, the report title, and hover effects. Shows metadata (last updated date, page count). PDF title text is resolved from the block row markup (including nested links).

### report-ai-visibility
Summit “LLM visibility” / “Performance insights” experience: stat cards, platform coverage pills, side-by-side comparison panels with charts (horizontal bars, platform bars, score tables, big figures). Horizontal bars support count vs percent display (authoring flags `|percent` / `|count`, or inferred share-style totals), and can show platform favicons when labels match known brands. Gap, key insight, and CTA rows render below the panels; the CTA copies from the authored block cells. An empty shell section next to the block hosts the nested **report-scores** page-performance cards (no extra grid padding in that shell). `.rav-panels-outer` stacks its `.rav-panels` cards in a flex column (`gap: 8px`); a lone `.rav-panel` inside `.rav-panels` (e.g. Key findings) uses a full-width flex column on desktop instead of a centered half-track. On Cannes pages, the section-authored “How to act” **report-callout** and “Data source: …” line are relocated into each section’s primary widget footer (inside `.rav-panels-outer` for AI Visibility, Search performance, and Performance insights). Relocated `.report-callout` and `.default-content` footers inside `.rav-panels-outer` share `margin: 8px 0 0` (callouts override to `20px` top). `.default-content` lays out a 28×28px Semrush SVG (`.cannes-source-logo`, no wrapper) and source line in a flex row (`align-items: center`, `gap: 12px`); the SVG is a sibling of `.cannes-source`, not nested inside it, and the source line uses `line-height: 28px` so it vertically centers with the icon. Horizontal inset uses `--rpt-widget-inset` in `cobrand.css` for most widget footers; in the Performance insights empty shell (`.rav-empty-shell`), relocated footers stay edge-to-edge (`padding-inline: 0`) alongside nested **report-scores** cards. Relocation runs per-block during decoration and again via `relocateAllSectionFooters()` from `lazy.js` (`relocate-section-footer.js`).

### report-scores
Page performance cards (URL, score meter, metrics) used inside the AI visibility performance shell and elsewhere. Card grid and meters are scoped under `.report-scores`. The grid is `repeat(2, 1fr)` on desktop for multi-page reports; when a report has a single card (e.g. Cannes' one mobile-experience card) the Cannes scope collapses it to one column so it fills the shared column instead of sitting at half-width.

### report-callout
Icon + text insight bar (`.neutral` and `.cta` variants). Default `.rcl-bar` uses a subtle red-tinted background with no left accent border. The hero KPI strip (`.report-stats.dark > .rpt-widget-footer`) uses a transparent bar with `28px 32px` padding so it reads as inline copy below the dark stats row, not a card — other relocated section footers and CTAs keep their card treatment. The hero Brand Visibility teaser (`.section.rcl-pre-briefing`) uses `.rcl-bar--bv-hero` inside a minimal section shell. The closing `.cta` unwraps to `main > .rcl-bar.rcl-bar--bv-hero.rcl-closing-briefing`, inserted directly after the Performance insights section — no `.section` / `.block-content` / `.report-callout` wrappers. Both match Figma frame `4620:329386` — white `#fff` background + `#292929` copy on light theme, `#262626` background + white copy on dark; separate light/dark Adobe+Semrush lockups (`bv-hero-logo-light.svg` / `bv-hero-logo-dark.svg`) swap with the page theme toggle; decorative mark is Adobe red (`#EB1000`) in both themes. The decorator unwraps a sole wrapping `<p>` from the authored cell before placing the text inside `.rcl-text` — nesting a `<p>` inside `<p class="rcl-text">` is invalid HTML and the browser would split it, leaving `.rcl-text` empty (with `flex-grow:1`) and the real text in a stray sibling, breaking the bar layout. On insight pages, the hero-section `.cta` (Brand Visibility teaser) is relocated into its own `.section.rcl-pre-briefing` immediately above the "Your briefing" section; the closing `.cta` at the page bottom is left in place. Both BV banners get the **"Adobe Brand Visibility"** product name auto-hyperlinked to `https://business.adobe.com/products/brand-visibility.html` (wrapping any authored `<strong>`; idempotent — skipped if already linked). The decorator also appends a `Let's talk →` CTA (`a.rcl-cta`) **only when the authored copy has no link of its own AND the report has a recognized owner** — so an owned hero/pre-briefing teaser (which authors no CTA) gains one matching the closing banner, while the closing banner keeps its single authored CTA with no duplicate. The CTA email is owner-driven: `getBvCtaHref()` resolves the mailbox from the report's **`bv-cta-source`** (`adobe` → `eecannes@adobe.com`, `semrush` → `CannesVilla@Semrush.com`, in the `BV_CTA_EMAILS` map). **There is no default mailbox**: a report with no `bv-cta-source` (or an unrecognized value) shows **no email CTA at all** — `getBvCtaHref()` returns `null`, the hero CTA is not appended, and `retargetAuthoredCta()` *removes* the closing banner's authored mailto anchor entirely (e.g. Sydney Summit reports, which must not link to a Cannes mailbox). For an owned report, `retargetAuthoredCta()` instead rewrites the authored anchor to that owner's mailbox, so both banners show the same correct email. `getBvCtaSource()` reads `bv-cta-source` from the authored `metadata` block's **DOM cell** (present in the served HTML from the start) rather than the `<meta>` tag — the `metadata` block is the page's LAST section, so its meta tag isn't written until after the banners decorate; `getMetadata('bv-cta-source')` is only a fallback. Per-page metadata (not a client-side fetch of the central `/data/` sheet) is what reaches prospect viewers, since report pages are CUG-gated to the customer's own domain while `/data/**` is locked to adobe/semrush. To change a report's owner, set its `bv-cta-source` metadata; no code change. Both links render Adobe-red (`--rpt-red-dark`, falling back to `--color-adobe-red-dark`) in both themes.

### copy-markdown
A "Copy for AI" button that serializes the live page `main` to GitHub-flavored Markdown and writes it to the clipboard (with a `document.execCommand` fallback for non-secure contexts). `domToMarkdown(root)` (exported for tests) walks the DOM in document order — headings (`#`…), paragraphs, `ul`/`ol`, `table` (pipe tables with pipe-escaped cells), `.report-callout` (blockquote) — and recurses into containers, including `.advanced-tabs`, so hidden tab panels are still captured, while skipping `.copy-markdown`, `header`, and `footer`. Used on the internal Sales Playbook page (`/docs/sales-playbook`): one instance in the hero, one at the end. Button label comes from the authored cell (default "Copy for AI"); shows transient "Copied!" feedback for ~2s.

### docs
Zero-output theme + structure block for documentation pages. `init()` adds a `docs-page` class to `<body>`, removes the block, then (deferred to the `load` event so every later block has decorated first) runs whole-page transforms via `decoratePage()`:
- **Sticky table of contents** built from the page's section `<h2>`s, wrapped with the content in a `.docs-layout` two-column shell (`.docs-aside` + `.docs-content`). Scroll-spy (IntersectionObserver) highlights the current section; clicking smooth-scrolls. Below 1000px the TOC drops below the hero.
- **Source cards**: a provenance run (an `<h3>` followed by "How we extract it / How to frame it / Caveat" paragraphs) is restructured into a `.docs-source` card with labelled rows (the leading bold label is stripped from the prose and shown as a chip; the caveat row is tinted).
- **Monoline SVG icons**: emoji in `report-cards .rc-icon` are swapped for a consistent stroked-SVG family (keyed by the authored emoji); "Conditional" status pills get `.rc-tag-conditional` (red) while "Always" stays neutral.
- **Hero eyebrow**: a red "Internal sales playbook" eyebrow is inserted above the H1.

Its auto-loaded `docs.css` scopes **every** rule under `.docs-page`, so dropping the block onto a page restyles only that page: flat docs-style hero with hairline divider (not a card), a clear H1/H2/H3 type scale with section divider rules, 68ch prose cap, refined `report-cards` (2-up, equal-height, badges pinned to a shared baseline; `steps` rendered as a **connected vertical stepper** with a rail line), readable `table`s (fixed layout, uppercase headers, per-row hairlines), `report-callout` bars and `.docs-source` cards with a red left accent, and an outline "Copy for AI" button whose emoji is replaced with a masked SVG glyph. Light/dark aware via `light-dark()`; edge-to-edge with a 20px text gutter below 1000px. Authoring: place an empty `docs` block first on the page. The `copy-markdown` serializer skips `.docs-toc`/`nav` so the TOC isn't copied into the Markdown.

### metadata
Authored page-data block: each row becomes a `<meta>` tag (or sets `document.title` / `lang`), then the block removes itself. **Single-section reports** (e.g. insight reports) author every block — `report-hero`, `report-stats`, `report-carousel`, … plus `metadata` — inside **one** `main > div` section sharing one `.block-content`. So `init()` must NOT remove its `.section` unconditionally: it drops the `.metadata` element, then removes the `.block-content`/`.section` only when nothing else remains. Removing the section unconditionally wiped the entire report (the 18th Digitech regression after PR #73). `hidePageDataSections()` (run from `lazy.js`) is the broader cleanup for standalone page-data sections and is a no-op on single-section reports because the metadata element/markers are already gone by the lazy phase.

### header
Fetches nav content and renders the Adobe logo, site title ("Adobe Summit Portal"), a help icon button, and a dark mode toggle button (half-moon icon) on the right edge. Preference is persisted in localStorage. The actions section renders auth-aware user info from `/auth/me`: signed in → email + Sign out + My Portal; signed out → a **Sign in** link that carries `?redirect=<current path>` so re-auth returns the user to the page they were on. When the non-HttpOnly `signed_in` marker cookie is present but `/auth/me` is unauthenticated, the header shows a small **"Your session expired"** notice (`.user-session-expired`) instead of failing silently — distinguishing a lapsed session from a never-signed-in visitor.

### customer-picker
Staff-facing search/share surface with mode tabs (Accounts, Insight Reports, Summit 26 Portal, plus one tab per event — currently **Cannes 2026 Portal** and **Sydney Summit 2026**), A–Z letter nav, per-format report links, and per-page email sharing via `/auth/sharelink`. Data is fetched live from three DA sheets under `/data/`: `account-list.json` (Accounts), `company-list.json` (Summit 26 Portal), and `insights-list.json` (Insight Reports + event tabs); CUG email domains come from `/closed-user-groups.json`.

**Event portal tabs (`EVENT_MODES` + `buildEventCompanies`, exported for tests):** Each event is one extra mode backed by one column in `insights-list.json` (Cannes 2026 → column `Cannes 2026`). A row whose event-column cell is non-empty is in that event; the cell holds the event-specific company label, and several `;`-separated names in one cell each become a card (used when two companies share one portal page, e.g. `EY; EY Studio+`). Unlike Insight Reports (one card per website globally), event tabs build **one card per flagged row** and do NOT collapse by website — so the same company can appear in several events, and co-located companies each keep a distinct card. Cards link straight to the row's own portal-landing page. `EVENT_MODES` drives the tab button, search placeholder, and the dialog (event modes are website-report modes via `isReportMode`, sharing the Insight Reports dialog layout). Adding an event = add one `EVENT_MODES` entry + populate the matching column in DA. Seeded events: **Cannes 2026** (column `Cannes 2026`) from `…/Cannes 2026/results/All-Results.xlsx` — 203 companies → 200 portal-landing rows, 3 shared-page pairs joined with `;`; **Sydney Summit 2026** (column `Sydney Summit 2026`) from `…/JAPAC Summit 2026/campaign-inputs/Summit_Sydney_Campaign_Full.xlsx` — 233 companies matched by website domain → 210 matched (205 rows, 5 shared-page pairs), 23 with no existing insight report skipped. A per-mode **Recently viewed** band (localStorage key `cp-recent-<mode>`, capped at 8, deduped by folder, newest-first) renders above the A–Z grid; entries are recorded when a company dialog opens and resolved back to the live mode list by folder (stale entries dropped). All storage access is guarded so a disabled/full localStorage degrades to "no recents" rather than breaking the picker.

**Insight-report grouping (`groupInsightsByWebsite` + `parseInsightFolder`, both exported for tests):** DIH folders are `…/insights/<website>/[variant]/` where `<variant>` is empty (bare report), `portal-landing`, or an event id (`cannes-2026`, `summit-2026`). Cards are keyed by the **website slug GLOBALLY** (across every account folder), so each website appears **exactly once** even when filed under several accounts (e.g. `ey.com` under `ey`, `ey-studio`, and `ernst-young` → one card). Selection per website: **`portal-landing` wins** — the card links to the **most recent** portal-landing (by `Created`, format `D.MM.YYYY`) and suppresses every other variant, so a visitor from any subsidiary lands on the same canonical page. With no portal-landing, event variants render as selectable reports (most-recent per format, plus the bare report); otherwise the most recent bare report. Earlier code (a) wrongly treated the website segment as the "format" and split bare vs. portal-landing into two cards, and (b) keyed by per-account folder so the same site under different accounts showed multiple times (`ey.com` ×3). Both fixed (cards 2188 → 2072, zero duplicate display names); covered by `test/blocks/customer-picker.test.js`. Caveat: cross-account merging means the surviving card's Open/Edit links point at one account's copy — duplicate *accounts* in the source sheet are still worth cleaning up in DA, but no longer surface as duplicate report cards.

### footer
Renders copyright text and a horizontal list of legal links (Terms of use, Privacy policy, Cookie preferences, etc.). `loadFooter` awaits block decoration; on **localhost / 127.0.0.1** it skips work if the page has no `<footer>` (avoids fragment fetch noise in local AEM CLI). On other hosts it can create a `<footer>` when missing, then load the footer block.

## Authentication

Auth is handled by the Cloudflare worker in `workers/cloudflare/cug-adobe-oauth-worker` (OAuth+PKCE via Adobe IMS, plus self-service magic links and staff-issued share links; CUG enforcement reads `x-aem-cug-*` headers from the origin). Token/session lifetimes (`src/session.js`): **magic link = 30 min** (`MAGIC_LINK_MAX_AGE`, self-service freshness); **share link = 7 days** (`SHARE_LINK_TTL`, booth hand-off). Session length is **per-login-type** (`sessionTtlForEmail`): a **staff** login (email domain in `STAFF_DOMAINS` = `adobe.com,semrush.com`) gets **4 days** (`EVENT_SESSION_TTL`) so an event device logged in over the weekend stays in all week; a **customer** session keeps **4 hours** (`SESSION_TTL`). Both the signed-JWT `exp` and the `auth_token` cookie `Max-Age` derive from that TTL. Applied at every mint point: OAuth callback and `?token=` magic/share-link redemption. Alongside the HttpOnly `auth_token`, the worker sets a non-HttpOnly **`signed_in` marker cookie** (`Max-Age = SESSION_TTL + 1 day`, so it outlives a timed-out session) carrying no identity/authorization — it only lets the header tell "session lapsed" from "never signed in" to show the expiry notice. The marker is set wherever a session is minted and cleared on `/auth/logout`.

**Why staff sessions open every customer page:** the live CUG config gates every customer page to `adobe.com, semrush.com, <customer-domain>`, so a logged-in Adobe/Semrush staff session can search the dashboard (`/adobe/dashboard`) and open any report directly, then email it to a customer with the existing **Share** button (7-day link). No per-customer links need to live on a device.

### On-site event access (generic staff login)
For non-managed event iPads that can't do Adobe SSO/Okta, `POST /auth/staff-login` (`src/stafflogin.js`) takes `{ username, password }`, verifies it against the **`EVENT_STAFF_CREDENTIALS`** worker secret, and mints a full 4-day staff session (`groups: ['adobe.com','semrush.com']` → opens every customer page; the synthetic `<username>@adobe.com` identity also passes the share-link staff gate). The login UI exposes it as a de-emphasized **"Event staff access"** form in the `portal-login` block, below the Adobe-ID and magic-link options. The credential secret is a newline/comma list of `username:sha256hex(password)` pairs — set it with `wrangler secret put EVENT_STAFF_CREDENTIALS --env summit` (never commit it). **Kill switch:** generic-login tokens carry a `gen_epoch` claim equal to the `EVENT_CRED_EPOCH` var; bumping `EVENT_CRED_EPOCH` (in `wrangler.toml`, then redeploy) instantly revokes every generic session (real-staff OAuth/magic-link sessions carry no `gen_epoch` and are unaffected). After the event, rotate the password and/or bump the epoch.

## Design Tokens

Global tokens defined in `styles/styles.css` with `light-dark()` for automatic dark mode. Report blocks alias them via `--rpt-*` tokens:

| Report Token | Purpose |
|---|---|
| `--rpt-surface` | Block backgrounds |
| `--rpt-border` | Card borders |
| `--rpt-text` | Primary text color |
| `--rpt-text-body` | Body/description copy (`#292929` / `#ccc`) |
| `--rpt-text-secondary` | Secondary text |
| `--rpt-text-muted` | Muted text |
| `--rpt-red` | Adobe red (`#e60000`) |

## Responsive Design

- **Breakpoint**: 1000px (mobile-first)
- **Desktop (>=1000px)**: Centered blocks, max-width 1200px, 24px side padding, 16px rounded corners
- **Mobile (<1000px)**: Edge-to-edge, no side padding, no rounded corners

### Insight pages — mobile polish
- Section spacing on insight pages collapses to `gap: 8px` with `padding: 0 0 8px` on `main` so the hero is flush against the header (no top gap) while subsequent sections sit 8px apart.
- Hero website badge (`.rh-insight-badge`) keeps the desktop white-pill styling on mobile (no dark-transparent override).
- Dark KPI strip (`.report-stats.dark .rs-dark-strip`) is a single solid-black surface on mobile — no 1px dividers between the 4 cells.
- Dark KPI strip's scroll-hint chevron + 36px bottom padding only apply when there is no `.rpt-widget-footer` callout below the grid (`:not(:has(.rpt-widget-footer))`) so the at-a-glance callout doesn't have empty space below it.
- Widget title bars unify across blocks: `.rai-section-head-strip` matches `.rav-section-head` at `(width < 768px)` — `min-height: 56px`, `padding: 10px 16px`, `font-size: 16px / 600`. "Your briefing" / "Search performance" read as peers of "LLM visibility" / "Performance insights".
- `.report-ai-visibility .rav-stats` uses `repeat(2, 1fr)` at every width (was 3-up base + 3-up `<768px`). LLM visibility's two stats sit at 50/50; tablet rule already used 2 columns.

## Remaining Work

### Polish
- Footer styling could be improved (currently uses default list rendering)
- Header nav sections are hidden (`display: none`) — could show on desktop
- Accessibility: Chart SVGs need better `aria-label` descriptions

### Potential Enhancements
- Report-carousel: Slide transition animations could be smoother
- Performance: Images in content/ are not optimized
