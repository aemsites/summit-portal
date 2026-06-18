# Summit Portal — Personalized Performance Reports

## Overview

A personalized digital performance report delivered to Adobe Summit attendees who are AEM Sites customers. Each report presents site-specific metrics — traffic, performance scores, AI search visibility, and SEO health — in a polished, data-rich single-page format.

The current content is a **sample report for Nike**, used during development. In production, the same block system will generate unique reports for each Summit attendee's site.

- **Framework**: `ak.js` (Author Kit / Document Authoring)
- **Content source**: https://main--summit-portal--gabrielwalt.aem.page
- **Initial import**: Created via the [Slicc browser extension](https://github.com/ai-ecoverse/slicc)
- **Design**: Fully responsive (single 1000px breakpoint), dark mode support via `light-dark()` CSS, rich data visualizations (SVG charts, gauges, animated counters), smooth animations (typing effect, count-up numbers)

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
Icon + text insight bar (`.neutral` and `.cta` variants). Default `.rcl-bar` uses a subtle red-tinted background with no left accent border. The hero KPI strip (`.report-stats.dark > .rpt-widget-footer`) uses a transparent bar with `28px 32px` padding so it reads as inline copy below the dark stats row, not a card — other relocated section footers and CTAs keep their card treatment. The hero Brand Visibility teaser (`.section.rcl-pre-briefing`) uses `.rcl-bar--bv-hero` inside a minimal section shell. The closing `.cta` unwraps to `main > .rcl-bar.rcl-bar--bv-hero.rcl-closing-briefing`, inserted directly after the Performance insights section — no `.section` / `.block-content` / `.report-callout` wrappers. Both match Figma frame `4620:329386` — white `#fff` background + `#292929` copy on light theme, `#262626` background + white copy on dark; separate light/dark Adobe+Semrush lockups (`bv-hero-logo-light.svg` / `bv-hero-logo-dark.svg`) swap with the page theme toggle; decorative mark is Adobe red (`#EB1000`) in both themes. The decorator unwraps a sole wrapping `<p>` from the authored cell before placing the text inside `.rcl-text` — nesting a `<p>` inside `<p class="rcl-text">` is invalid HTML and the browser would split it, leaving `.rcl-text` empty (with `flex-grow:1`) and the real text in a stray sibling, breaking the bar layout. On insight pages, the hero-section `.cta` (Brand Visibility teaser) is relocated into its own `.section.rcl-pre-briefing` immediately above the "Your briefing" section; the closing `.cta` at the page bottom is left in place.

### metadata
Authored page-data block: each row becomes a `<meta>` tag (or sets `document.title` / `lang`), then the block removes itself. **Single-section reports** (e.g. insight reports) author every block — `report-hero`, `report-stats`, `report-carousel`, … plus `metadata` — inside **one** `main > div` section sharing one `.block-content`. So `init()` must NOT remove its `.section` unconditionally: it drops the `.metadata` element, then removes the `.block-content`/`.section` only when nothing else remains. Removing the section unconditionally wiped the entire report (the 18th Digitech regression after PR #73). `hidePageDataSections()` (run from `lazy.js`) is the broader cleanup for standalone page-data sections and is a no-op on single-section reports because the metadata element/markers are already gone by the lazy phase.

### header
Fetches nav content and renders the Adobe logo, site title ("Adobe Summit Portal"), a help icon button, and a dark mode toggle button (half-moon icon) on the right edge. Preference is persisted in localStorage. The actions section renders auth-aware user info from `/auth/me`: signed in → email + Sign out + My Portal; signed out → a **Sign in** link that carries `?redirect=<current path>` so re-auth returns the user to the page they were on. When the non-HttpOnly `signed_in` marker cookie is present but `/auth/me` is unauthenticated, the header shows a small **"Your session expired"** notice (`.user-session-expired`) instead of failing silently — distinguishing a lapsed session from a never-signed-in visitor.

### customer-picker
Staff-facing search/share surface with three modes (Accounts, Insight Reports, Summit 26 Portal), A–Z letter nav, per-format report links, and per-page email sharing via `/auth/sharelink`. A per-mode **Recently viewed** band (localStorage key `cp-recent-<mode>`, capped at 8, deduped by folder, newest-first) renders above the A–Z grid; entries are recorded when a company dialog opens and resolved back to the live mode list by folder (stale entries dropped). All storage access is guarded so a disabled/full localStorage degrades to "no recents" rather than breaking the picker.

### footer
Renders copyright text and a horizontal list of legal links (Terms of use, Privacy policy, Cookie preferences, etc.). `loadFooter` awaits block decoration; on **localhost / 127.0.0.1** it skips work if the page has no `<footer>` (avoids fragment fetch noise in local AEM CLI). On other hosts it can create a `<footer>` when missing, then load the footer block.

## Authentication

Auth is handled by the Cloudflare worker in `workers/cloudflare/cug-adobe-oauth-worker` (OAuth+PKCE via Adobe IMS, plus self-service magic links and staff-issued share links; CUG enforcement reads `x-aem-cug-*` headers from the origin). Token/session lifetimes (`src/session.js`): logged-in **session = 4 hours** (`SESSION_TTL`, drives both the signed-JWT `exp` and the `auth_token` cookie `Max-Age`); **magic link = 30 min** (`MAGIC_LINK_MAX_AGE`, self-service freshness); **share link = 7 days** (`SHARE_LINK_TTL`, booth hand-off). Alongside the HttpOnly `auth_token`, the worker sets a non-HttpOnly **`signed_in` marker cookie** (`Max-Age = SESSION_TTL + 1 day`, so it outlives a timed-out session) carrying no identity/authorization — it only lets the header tell "session lapsed" from "never signed in" to show the expiry notice. The marker is set wherever a session is minted (OAuth callback, `?token=` magic/share link) and cleared on `/auth/logout`.

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
