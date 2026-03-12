# Report Blocks — Implementation Plan

## Approach

Break the 16-slide HTML report into **7 new modular EDS blocks**, each handling one distinct visual element. Reuse existing `columns` and `table` blocks where they fit. Content is authored directly in the DA document (no JSON fetching).

Each slide in the report becomes a **section** on the page. Blocks within each section render the components.

---

## Blocks to Create

### 1. `report-hero`
**Purpose:** Cover page and transition/divider slides (dark gradient background, centered text, optional metric previews).
**Used on:** Introduction, Transition–Website Analysis, Transition–Solutions, Transition–Success Story (4 slides).
**Variant:** `report-hero (transition)` — shows a section badge + small metric row.

### 2. `report-stats`
**Purpose:** Grid of metric cards showing a value, label, trend arrow, and severity colour.
**Used on:** Insights at a Glance, Performance & Business Impact, SEO Insights, Executive Summary, Success Story, Branded Traffic (6+ slides).

### 3. `report-cards`
**Purpose:** Multi-purpose card grid — icon + title + description (+ optional tag/badge).
**Variants via class modifier:**
- default — solution / benefit / capability cards
- `(steps)` — numbered step cards (1, 2, 3) for the Closing slide
- `(challenges)` — challenge cards with a solution arrow

**Used on:** Insights at a Glance, Performance & Business Impact, Solution Advantage, Sites Optimizer, LLM Optimizer, Success Story, Closing (7+ slides).

### 4. `report-callout`
**Purpose:** Highlighted insight bar (icon + key-insight text).
**Used on:** Performance & Business Impact, SEO Insights, Keywords, Branded Traffic, Solution Advantage, Sites Optimizer, LLM Optimizer, Success Story, Closing (9 slides).

### 5. `report-scores`
**Purpose:** Page-performance cards — score badge + grade + CWV metrics + summary.
**Used on:** Performance Insights (1 slide, 4 cards).

### 6. `report-chart`
**Purpose:** SVG line chart rendered from authored data rows (date + value).
**Used on:** SEO Insights (1 slide).

### 7. `report-bar`
**Purpose:** Horizontal distribution bar (e.g. 98 % branded vs 2 % non-branded).
**Used on:** SEO Branded Traffic (1 slide).

### Existing blocks reused
- **`columns`** — two-column layouts on SEO Insights, Keywords, Branded Traffic slides.
- **`table`** — keyword opportunities data table.

---

## DA Document Structure (demo page)

Each section = one "slide". Blocks reference the actual Mercedes-Benz demo data from the HTML report. Outline:

| # | Slide | Blocks used |
|---|-------|-------------|
| 1 | Introduction | report-hero |
| 2 | Executive Summary | report-stats, report-cards (challenges) |
| 3 | Insights at a Glance | report-stats, report-cards |
| 4 | Transition: Website Analysis | report-hero (transition) |
| 5 | Performance Insights | report-scores |
| 6 | Performance & Business Impact | report-stats, report-cards, report-callout |
| 7 | SEO Insights | report-stats, columns(report-chart + text), report-callout |
| 8 | Keyword Opportunities | table, report-callout |
| 9 | Branded Traffic | report-stats, report-bar, report-callout |
| 10 | Transition: Solutions | report-hero (transition) |
| 11 | Solution Advantage | report-cards, report-callout |
| 12 | Sites Optimizer | report-cards, report-callout |
| 13 | LLM Optimizer | report-cards, report-callout |
| 14 | Transition: Success Story | report-hero (transition) |
| 15 | Customer Success Story | report-stats, report-cards, report-callout |
| 16 | Closing | report-cards, report-cards (steps), report-callout |

---

## Implementation Steps

1. Create branch `feature/report-blocks`
2. Build each block (JS + CSS), one at a time, following existing EDS patterns (default export `init(el)`, DOM decoration)
3. Create the DA document page at `templates/mercedes-benz-report` with all 16 sections using authored demo content
4. Commit and push

---

## Styling Notes

- Adobe Red `#E60000` accent colour carried over from the original report
- 16:9 aspect ratio per section (optional, can be toggled via section-metadata `style: slide`)
- Responsive: cards reflow at ≤ 900 px
- Dark-scheme transitions, light-scheme content slides
