# Digital Opportunity Report — Sales Playbook Guide

_Design spec — 2026-06-19_

## Summary

An **internal seller playbook** page that teaches Adobe sellers how to read, present, and
defend a Digital Opportunity Report — so any seller can confidently pitch a portal landing
page (e.g. `https://act.aem.now/accounts/e/ea-sports/insights/ea-com/portal-landing/`).

The content is ported from the existing Digital Insights Hub guide page, re-authored to fit
the summit-portal design system. It is **staff-only**, lives at `/docs/sales-playbook`, and is
reachable from the staff dashboard (`/adobe/dashboard`).

A **"Copy for AI" button** lets sellers copy the entire page as Markdown to paste into an LLM
agent.

## Goals

- Surface a sales-playbook page inside the portal, styled to match the report blocks.
- Reuse existing blocks for all content (no new content blocks).
- Add exactly **one** new block: a "copy page as Markdown" button.
- Preserve the internal framing (objection handling, pitch tracks, internal-only caveats such
  as "SpaceCat stays internal").
- Link the page from the staff dashboard so sellers can find it.

## Non-Goals

- No customer-facing variant (this is internal only).
- No import scripts / no automation — content is authored once in DA.
- Do **not** port these sections (redundant per stakeholder): **Pitch Flow**,
  **Execution Checklists**, **Using the Digital Insights Hub**.

## Audience

Internal Adobe sellers operating the staff dashboard. Framing stays "how to pitch / defend",
not "how to read your own report".

## Page location & entry point

- **Page:** `/docs/sales-playbook` in DA (`aemsites/summit-portal`).
- **Entry point:** a link/banner added to `/adobe/dashboard` (the staff customer-picker page)
  pointing at `/docs/sales-playbook`.

## Sections (in order)

1. **Hero** — title "Digital Opportunity Report — Sales Playbook", one-line internal subtitle,
   "Last updated" date, and the **Copy for AI** button.
2. **What Are Digital Opportunity Reports** — intro paragraph + 4 value props (Rapid AI
   Analysis, Multi-Agent Intelligence, ROI-Focused Insights, Consistent Excellence).
3. **Data Sources** — card per source (SEMrush, Google PageSpeed, Adobe Brand Visibility,
   Customer Website, Adobe Documentation, Adobe Success Stories, Claude Sonnet 4.6).
4. **Where Data Comes From & How It Is Generated** — 5-step generation workflow, then a
   per-source provenance set (Discovery + URL validation, PageSpeed lab+CrUX, Screenshots,
   SEMrush SEO, AI visibility, Internal synthesis), each with how-we-extract / how-to-frame /
   caveat.
5. **Objection Handling** — 7-row table (Objection / Acknowledge / Clarify / Next step).
6. **How To Read Metrics Without Overclaiming** — guardrails table (Metric / Say this /
   Avoid this / Why it looks different).
7. **Critical Caveats To Call Out Early** — bulleted warnings as callout bars.
8. **Report Page Map** — the 14-page report guide, grouped by category, each page with
   "read this page for" + pitch track + (where relevant) caveat/conditional.
9. **FAQ & Troubleshooting** — Q/A pairs.
10. **Closing Copy for AI** button after the last section.

## Block mapping (existing blocks only, except the copy button)

| Section | Block | Variant / notes |
|---|---|---|
| Hero | `report-hero` | `insight` variant; title + subtitle + "Measured/Updated" date |
| Intro value props | `report-cards` | `features` (icon + title + desc) |
| Data Sources | `report-cards` | default card grid |
| Generation workflow | `report-cards` | `steps` (number + title + desc) |
| Per-source provenance | `advanced-tabs` | one tab per source; panel holds extract/frame/caveat |
| Objection Handling | `table` | 4-column |
| Metric guardrails | `table` | 4-column |
| Critical Caveats | `report-callout` (`neutral`) | one `neutral` bar per caveat |
| Report Page Map | `advanced-tabs` | tab per category; pages listed with pitch tracks |
| FAQ | `report-cards` (`steps` omitted; default) | Q/A pairs — question as card title, answer as desc |
| Copy button | **`copy-markdown`** (NEW) | see below |

## New block: `copy-markdown`

**Purpose:** copy the entire playbook page as Markdown to the clipboard for pasting into an
LLM agent.

**Authoring:** a single block whose first cell holds the button label (default "Copy for AI").
Placed twice — once inside/after the hero, once at the end of the page.

**Behaviour:**
- On click, walk the rendered page DOM (`main`), serialising visible content to Markdown:
  headings (`h1`–`h6` → `#`…), paragraphs, unordered/ordered lists, tables (GitHub-flavored
  pipe tables), `report-callout` bars (as blockquotes or bullet lines), and `advanced-tabs`
  panels (tab label → subheading, then its content). Skip the copy buttons themselves, the
  header, and the footer.
- Write the string to the clipboard via `navigator.clipboard.writeText`, with a
  `document.execCommand('copy')` textarea fallback for non-secure contexts.
- Show transient "Copied!" feedback on the button, reverting after ~2s.
- Both button instances share one serializer; clicking either copies the whole page.

**DOM-to-Markdown rules (kept simple, deterministic):**
- Serialize in document order from `main`.
- `report-hero` heading → `# Title`; subtitle → paragraph; date → `_..._`.
- `report-cards`: each card → `### <title>` + description (+ any feature list as bullets).
- `advanced-tabs`: each tab → `## <tab label>` then recurse into the panel.
- `table`: header row → pipe table header + separator; body rows → pipe rows.
- `report-callout`: `> <text>`.
- Collapse whitespace; escape pipe characters inside table cells.

**Files:** `blocks/copy-markdown/copy-markdown.js`, `blocks/copy-markdown/copy-markdown.css`.
Follows the project block contract: `export default function init(el) { ... }`, vanilla ES6+,
`.js` import extensions, selectors scoped under `.copy-markdown`.

## Responsive / design

- Single 1000px breakpoint; desktop centered max-width 1200px, 24px side padding, 16px radius;
  mobile edge-to-edge.
- Adobe red via `var(--rpt-red)` / `var(--color-adobe-red)`; never hardcode `#ff0000`.
- Wide 4-column tables use the existing `table` block's responsive handling (horizontal scroll
  on mobile).
- Copy button styled as a primary pill (Adobe red) consistent with existing CTAs; "Copied!"
  state swaps to a confirmation style.

## Delivery

1. **Repo PR** — new `copy-markdown` block (JS + CSS), `PROJECT.md` update documenting the
   block and the new page, this spec + the implementation plan. Lint clean.
2. **DA content** — author `/docs/sales-playbook` using the block mapping above; add the
   dashboard entry-point link. Only create new content; never delete/modify unrelated content.

## Verification

- `npm run lint` clean.
- Preview the page locally / on the DA preview; confirm all sections render with the reused
  blocks and the copy button produces well-formed Markdown (headings, tables, lists, callouts).
- Confirm the dashboard link resolves to the page.
- Confirm internal-only language is preserved and the three dropped sections are absent.

## Risks / open points

- DOM-to-Markdown fidelity for `advanced-tabs` (hidden panels must still serialize — read from
  the DOM regardless of `is-visible`).
- Clipboard API requires a secure context; fallback path covers local/preview.
