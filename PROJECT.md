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
A horizontal strip of four metric cards on a black background. Each card shows a KPI label, animated count-up value, a color-coded trend badge (positive/negative/critical/optimal), and a description. The performance score card includes an SVG speedometer gauge.

### report-carousel
A tabbed carousel with three persona views — Executive overview, Marketer insights, and IT/Engineering learnings. Each tab contains multiple slides with a "Top insight" callout and an SVG data visualization (column charts, line charts, donut charts, horizontal bars, stacked bars, big figures, metric strips, or recommendation lists). Includes dot navigation, prev/next arrows, and a slide counter.

### report-download
A split layout with a heading, description, and download CTA on the left, and an interactive PDF card preview on the right. The card has a red patterned background, the report title, and hover effects. Shows metadata (last updated date, page count).

### header
Fetches nav content and renders the Adobe logo, site title ("Adobe Summit Portal"), a help icon button, and a dark mode toggle button (half-moon icon) on the right edge. Preference is persisted in localStorage.

### footer
Renders copyright text and a horizontal list of legal links (Terms of use, Privacy policy, Cookie preferences, etc.).

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
