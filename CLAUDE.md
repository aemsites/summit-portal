# Agent Instructions

## Core Rules

- **Always keep PROJECT.md up to date.** After completing any significant work (new block, layout change, bug fix, design decision), update the relevant section in PROJECT.md immediately. This is the project's living documentation and your primary reference for future conversations.
- **No import scripts.** This is a single-page project. Content is manually authored in `/content/index.html`. Never create or maintain import infrastructure.
- **Never modify `scripts/ak.js`.** This is the core framework — treat it as read-only.
- **Test visually.** After any CSS or JS change, preview at `http://localhost:3000/content/index` and verify with Playwright snapshot or evaluate. Use screenshots sparingly.

## Setup

```bash
npm install
npx -y @adobe/aem-cli up --no-open --forward-browser-logs   # dev server at http://localhost:3000
npm run lint          # lint before committing
npm run lint:fix      # auto-fix lint issues
```

Preview the page at: `http://localhost:3000/content/index`

## Framework: ak.js (not aem.js)

This project uses `ak.js` (Author Kit), which differs from the standard `aem.js` boilerplate:

| Aspect | aem.js | ak.js (this project) |
|--------|--------|---------------------|
| Block wrapper class | `.{blockname}-wrapper` | `.block-content` |
| Block detection | `.{blockname}-wrapper > div` | `.block-content > div[class]` |
| Section class | `.section` | `.section` (same) |
| Content grouping | `.default-content-wrapper` | `.default-content` |
| Block class | `.block` added to element | Not added |
| Header loading | `loadHeader()` in lazy phase | `postlcp.js` after first section |
| Footer loading | `loadFooter()` in lazy phase | `lazy.js` → `utils/footer.js` |

**Wrapper selectors must always target both conventions:**
```css
.report-hero-wrapper,
.block-content:has(.report-hero) {
  max-width: 1200px !important;
}
```

**Content serving**: AEM CLI serves files from `/content/` as-is (no `head.html` injection). The content page is a full HTML document with `<script>` tags for `ak.js` and `scripts.js`.

**Imports**: Always use `../../scripts/ak.js`, never `aem.js`.

## Code Style

- Vanilla JavaScript (ES6+), no build step
- Airbnb ESLint rules
- `.js` extensions required in imports
- Stylelint standard config
- Block default export: `export default function init(el) { ... }`
- CSS selectors scoped to block class (e.g., `.report-carousel .rc-tab`)
- Modern CSS: `light-dark()`, nesting, `:has()`, `color-scheme`

## Responsive Design Rules

- **Breakpoint**: 1000px — single breakpoint, mobile-first
- **Desktop (≥1000px)**: Blocks centered, max-width 1200px, 24px side padding, 16px rounded corners
- **Mobile (<1000px)**: Edge-to-edge full width, no side padding, no rounded corners
- **Brand color**: `#e60000` (Adobe red) via `var(--rpt-red)` or `var(--color-adobe-red)`. Never hardcode `#ff0000`.
