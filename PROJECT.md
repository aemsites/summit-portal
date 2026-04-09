# Project Documentation

## Overview

Single-page Nike digital performance report built on Adobe Edge Delivery Services. The page presents performance metrics, search visibility, and AI discovery data in a tabbed carousel format with executive, marketer, and engineering persona views.

- **Framework**: `ak.js` (Author Kit / Document Authoring)
- **Content**: One page at `/content/index.html` (full HTML document with scripts included)
- **Design reference**: `/original-design/` — Vite build output of the target React design
- **Initial import reference**: `/initial-import/` — previous design import with complete block implementations

## Project Structure

```
├── blocks/                    # Block implementations (JS + CSS per block)
│   ├── report-hero/           # Hero block (insight, dashboard, transition, cover variants)
│   ├── report-stats/          # Metric cards (default grid + dark strip variant)
│   ├── report-carousel/       # Tabbed carousel with charts and recommendations
│   ├── report-download/       # Download CTA with PDF card
│   ├── header/                # Site header (fetches /content/nav.html)
│   └── footer/                # Site footer (fetches /content/footer.html)
├── content/                   # Authored content served by AEM CLI
│   ├── index.html             # The report page (full HTML document)
│   ├── nav.html               # Header navigation content
│   ├── footer.html            # Footer content
│   ├── hero-bg.svg            # Decorative hero background
│   ├── logo.svg               # Adobe logo
│   ├── nike-favicon.png       # Nike site favicon
│   ├── nike-site-preview.png  # Nike site screenshot
│   └── pdf-card-cover-pattern.png
├── styles/
│   └── styles.css             # Global styles with design tokens
├── scripts/
│   ├── ak.js                  # Core framework (NEVER MODIFY)
│   ├── scripts.js             # Page initialization
│   ├── lazy.js                # Post-LCP loading (footer, sidekick)
│   └── postlcp.js             # Header loading
├── original-design/           # Vite build of the target design (reference only)
└── initial-import/            # Previous import run (reference only)
```

## Content Structure

The page has a single section containing all report blocks in sequence:

```
header (fetches /content/nav.html)
└── section
    ├── report-hero (insight variant)
    ├── report-stats (dark variant)
    ├── report-carousel
    └── report-download
footer (fetches /content/footer.html)
```

## Block Reference

### report-hero (insight variant)

**Content structure** (1 row, 2 cells):
- Cell 1: `<h1>` greeting, `<p>` description, `<p>` with `<picture>` favicon + `<a>` link
- Cell 2: `<picture>` hero screenshot

**Decorated DOM**:
- `.rh-insight-bg-svg` — decorative background image (loaded from `/content/hero-bg.svg`)
- `.rh-insight-text` — left column with h1, description, `.rh-insight-badge`
- `.rh-insight-image` — right column with screenshot (hidden on mobile)

**CSS prefix**: `rh-` | **Background**: `var(--rpt-red, #e60000)`

Other variants (cover, dashboard, transition) exist in the code but are not used on this page.

### report-stats (dark variant)

**Content structure** (N rows, 6 cells each):
`label | value | badge-text | badge-status | description | icon-type`

- badge-status: `negative` (red), `positive` (green), `neutral` (gray), `critical` (→ negative)
- icon-type: `speedometer` renders an SVG gauge; empty = no icon

**Decorated DOM**: `.rs-dark-strip` → `.rs-dark-card` per row

**CSS prefix**: `rs-` | **Background**: `#000`

### report-carousel

**Content structure**:
- Row 0 (tabs): 3 cells for tab labels + optional 4th cell with download `<a>`
- Separator rows: single cell matching tab label (marks tab boundaries)
- Slide rows: 3 cells — `badge | text (h3 + p) | chart-data or picture`

**Chart types** (first `<p>` in cell 3 = type keyword, subsequent `<p>` = data):

| Keyword | Renders | Data format |
|---------|---------|------------|
| `columnchart` | Vertical bars | `Label \| value \| #color` |
| `linechart` | Area line + dots | `Label \| value \| #color` (color on first line) |
| `donutchart` | Donut ring + legend | `center: Label \| value` then `Label \| value \| #color` |
| `horizontalbars` | Horizontal bars | `Label \| value \| suffix \| #color` |
| `stackedbar` | Stacked % bar | `Label \| value \| #color` |
| `bigfigure` | Large number | `value \| unit \| context` |
| `metricstrip` | Table rows | `Label \| value \| note` |
| `recommendationlist` | Cards with icons | `Title \| detail \| tone` (tone: growth/risk/action/priority) |

**CSS prefix**: `rc-` | **Background**: `light-dark(#fff, var(--color-gray-900))`

### report-download

**Content structure** (1 row, 2 cells):
- Cell 1: `<p><strong>heading</strong></p>` + `<p>` description
- Cell 2: `<p><a>` report title + href, `<p>` metadata lines (date, pages)

**Decorated DOM**: `.rd-left` (heading + desc + CTA row) + `.rd-right` (PDF card)

**CSS prefix**: `rd-` | **Background**: `#000`

### header

Fetches `/content/nav.html`. Standard boilerplate navigation with brand, sections, tools. Uses `getMetadata('nav')` for custom nav path.

### footer

Fetches `/content/footer.html`. Renders copyright + link list.

## Design Tokens

Global tokens defined in `styles/styles.css`. Report blocks alias them via `--rpt-*` tokens in `report-hero.css`:

| Report Token | Maps To |
|---|---|
| `--rpt-surface` | `--color-surface` |
| `--rpt-border` | `--color-border` |
| `--rpt-border-subtle` | `--color-border-subtle` |
| `--rpt-text` | `--color-text` |
| `--rpt-text-secondary` | `--color-text-secondary` |
| `--rpt-text-muted` | `--color-text-muted` |
| `--rpt-text-faint` | `--color-text-faint` |
| `--rpt-red` | `--color-adobe-red` (fallback `#e60000`) |

## Remaining Work

### Polish
- Footer styling could be improved (currently uses default list rendering)
- Header nav sections are hidden (`display: none`) — could show on desktop
- Dark mode: blocks use `light-dark()` but hasn't been tested end-to-end

### Potential Enhancements
- report-hero: The `createInsightSvg()` function was removed (unused). Could be restored as an alternative to the external hero-bg.svg if a fully code-generated decorative background is preferred
- report-carousel: Slide transition animations could be smoother
- Performance: Images in content/ are not optimized (committed as-is from source)
- Accessibility: Chart SVGs need better `aria-label` descriptions
