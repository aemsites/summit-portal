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
A horizontal strip of four metric cards on a black background. Each card shows a KPI label, animated count-up value, a color-coded trend badge (positive/negative/critical/optimal), and a description. The performance score card includes an SVG semicircle speedometer; the red fill arc and needle are animated with geometry suited to a ≤180° sweep (selectors `.rs-gauge-fill` / `.rs-gauge-needle` when present).

### report-carousel
A tabbed carousel with three persona views — Executive overview, Marketer insights, and IT/Engineering learnings. Each tab contains multiple slides with a "Top insight" callout and an SVG data visualization (column charts, line charts, donut charts, horizontal bars, stacked bars, big figures, metric strips, or recommendation lists). Includes dot navigation, prev/next arrows, and a slide counter. `bigfigure` accepts the documented single pipe-delimited row (`value | unit | label`) as well as the legacy three-`<p>` form — the renderer reads the pipe parts first so the documented form (what the DIH template emits) doesn't drop the unit/context.

### report-download
A split layout with a heading, description, and download CTA on the left, and an interactive PDF card preview on the right. The card has a red patterned background, the report title, and hover effects. Shows metadata (last updated date, page count). PDF title text is resolved from the block row markup (including nested links).

### report-ai-visibility
Summit “LLM visibility” / “Performance insights” experience: stat cards, platform coverage pills, side-by-side comparison panels with charts (horizontal bars, platform bars, score tables, big figures). Horizontal bars support count vs percent display (authoring flags `|percent` / `|count`, or inferred share-style totals), and can show platform favicons when labels match known brands. Gap, key insight, and CTA rows render below the panels; the CTA copies from the authored block cells. An empty shell section next to the block hosts the nested **report-scores** page-performance cards (no extra grid padding in that shell).

### report-scores
Page performance cards (URL, score meter, metrics) used inside the AI visibility performance shell and elsewhere. Card grid and meters are scoped under `.report-scores`. The grid is `repeat(2, 1fr)` on desktop for multi-page reports; when a report has a single card (e.g. Cannes' one mobile-experience card) the Cannes scope collapses it to one column so it fills the shared column instead of sitting at half-width.

### report-callout
Icon + text insight bar (`.neutral` and `.cta` variants). The decorator unwraps a sole wrapping `<p>` from the authored cell before placing the text inside `.rcl-text` — nesting a `<p>` inside `<p class="rcl-text">` is invalid HTML and the browser would split it, leaving `.rcl-text` empty (with `flex-grow:1`) and the real text in a stray sibling, breaking the bar layout.

### header
Fetches nav content and renders the Adobe logo, site title ("Adobe Summit Portal"), a help icon button, and a dark mode toggle button (half-moon icon) on the right edge. Preference is persisted in localStorage.

### footer
Renders copyright text and a horizontal list of legal links (Terms of use, Privacy policy, Cookie preferences, etc.). `loadFooter` awaits block decoration; on **localhost / 127.0.0.1** it skips work if the page has no `<footer>` (avoids fragment fetch noise in local AEM CLI). On other hosts it can create a `<footer>` when missing, then load the footer block.

## Design Tokens

Global tokens defined in `styles/styles.css` with `light-dark()` for automatic dark mode. Report blocks alias them via `--rpt-*` tokens:

| Report Token | Purpose |
|---|---|
| `--rpt-surface` | Block backgrounds |
| `--rpt-border` | Card borders |
| `--rpt-text` | Primary text color |
| `--rpt-text-secondary` | Secondary text |
| `--rpt-text-muted` | Muted text |
| `--rpt-red` | Adobe red (`#e60000`) |

## Responsive Design

- **Breakpoint**: 1000px (mobile-first)
- **Desktop (>=1000px)**: Centered blocks, max-width 1200px, 24px side padding, 16px rounded corners
- **Mobile (<1000px)**: Edge-to-edge, no side padding, no rounded corners

## Remaining Work

### Polish
- Footer styling could be improved (currently uses default list rendering)
- Header nav sections are hidden (`display: none`) — could show on desktop
- Accessibility: Chart SVGs need better `aria-label` descriptions

### Potential Enhancements
- Report-carousel: Slide transition animations could be smoother
- Performance: Images in content/ are not optimized
