# Sales Playbook Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an internal seller playbook page at `/docs/sales-playbook` (authored in DA from existing report blocks) plus one new `copy-markdown` block that copies the whole page as Markdown, linked from the staff dashboard.

**Architecture:** All page content reuses existing blocks (`report-hero`, `report-cards`, `advanced-tabs`, `table`, `report-callout`). The only new code is the `copy-markdown` block: a button that serializes the live `main` DOM to GitHub-flavored Markdown and writes it to the clipboard. Content and the dashboard link are authored directly in DA via the admin API.

**Tech Stack:** Vanilla ES6+ (no build step), ak.js block contract (`export default function init(el)`), `@web/test-runner` + `@esm-bundle/chai` for browser tests, Airbnb ESLint, Stylelint standard, DA admin API for content.

## Global Constraints

- Block default export signature: `export default function init(el) { ... }`.
- Imports use `.js` extensions; framework import path is `../../scripts/ak.js`. Never modify `scripts/ak.js`.
- CSS selectors scoped under the block class (`.copy-markdown ...`); modern CSS allowed (`light-dark()`, nesting, `:has()`).
- Brand red via `var(--rpt-red)` / `var(--color-adobe-red)` — never hardcode `#ff0000`.
- Breakpoint 1000px, mobile-first. Desktop: centered, max-width 1200px, 24px side padding, 16px radius. Mobile: edge-to-edge.
- `npm run lint` must pass (ESLint + Stylelint).
- Keep `PROJECT.md` up to date after the block lands.
- DA: only create new content; never delete or modify unrelated content.
- Internal-only framing preserved (objection handling, pitch tracks; "SpaceCat" stays internal). Dropped sections: Pitch Flow, Execution Checklists, Using the Digital Insights Hub.

---

## File Structure

- `blocks/copy-markdown/copy-markdown.js` — block init + DOM-to-Markdown serializer (exports `init` default + named `domToMarkdown` for testing).
- `blocks/copy-markdown/copy-markdown.css` — button + "Copied!" states, responsive.
- `test/blocks/copy-markdown.test.js` — unit tests for `domToMarkdown`.
- `PROJECT.md` — document the new block + the playbook page.
- DA content (no repo files): `/docs/sales-playbook` page + dashboard link.

---

### Task 1: `copy-markdown` block — serializer + button

**Files:**
- Create: `blocks/copy-markdown/copy-markdown.js`
- Create: `blocks/copy-markdown/copy-markdown.css`
- Test: `test/blocks/copy-markdown.test.js`

**Interfaces:**
- Consumes: nothing (leaf block).
- Produces:
  - `export function domToMarkdown(root: Element): string` — serializes a container (intended: `main`) to Markdown. Walks direct content; handles `h1`–`h6`, `p`, `ul`/`ol`, `table`, `.report-callout`, `.advanced-tabs`, and skips `.copy-markdown`, `header`, `footer`.
  - `export default function init(el: Element): void` — turns the block into a button that, on click, copies `domToMarkdown(document.querySelector('main'))` to the clipboard and shows transient "Copied!" feedback.

- [ ] **Step 1: Write the failing tests**

```js
// test/blocks/copy-markdown.test.js
import { expect } from '@esm-bundle/chai';
import { domToMarkdown } from '../../blocks/copy-markdown/copy-markdown.js';

function fixture(html) {
  const root = document.createElement('main');
  root.innerHTML = html;
  return root;
}

describe('copy-markdown › domToMarkdown', () => {
  it('serializes headings by level', () => {
    const md = domToMarkdown(fixture('<h1>Title</h1><h3>Sub</h3>'));
    expect(md).to.contain('# Title');
    expect(md).to.contain('### Sub');
  });

  it('serializes paragraphs as text blocks', () => {
    const md = domToMarkdown(fixture('<p>Hello world.</p>'));
    expect(md).to.contain('Hello world.');
  });

  it('serializes unordered lists as bullets', () => {
    const md = domToMarkdown(fixture('<ul><li>One</li><li>Two</li></ul>'));
    expect(md).to.contain('- One');
    expect(md).to.contain('- Two');
  });

  it('serializes ordered lists as numbers', () => {
    const md = domToMarkdown(fixture('<ol><li>First</li><li>Second</li></ol>'));
    expect(md).to.contain('1. First');
    expect(md).to.contain('2. Second');
  });

  it('serializes a table as a GitHub pipe table', () => {
    const md = domToMarkdown(fixture(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead>'
      + '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    ));
    expect(md).to.contain('| A | B |');
    expect(md).to.contain('| --- | --- |');
    expect(md).to.contain('| 1 | 2 |');
  });

  it('escapes pipe characters inside table cells', () => {
    const md = domToMarkdown(fixture(
      '<table><tr><th>H</th></tr><tr><td>a|b</td></tr></table>',
    ));
    expect(md).to.contain('a\\|b');
  });

  it('serializes a report-callout as a blockquote', () => {
    const md = domToMarkdown(fixture(
      '<div class="report-callout"><div class="rcl-bar"><p class="rcl-text">Heads up.</p></div></div>',
    ));
    expect(md).to.contain('> Heads up.');
  });

  it('serializes advanced-tabs panels regardless of visibility', () => {
    const md = domToMarkdown(fixture(
      '<div class="advanced-tabs">'
      + '<div class="tab-list"><button>Tab A</button><button>Tab B</button></div>'
      + '<div class="tab-panel is-visible"><h4>Panel A</h4><p>Visible.</p></div>'
      + '<div class="tab-panel"><h4>Panel B</h4><p>Hidden but copied.</p></div>'
      + '</div>',
    ));
    expect(md).to.contain('Hidden but copied.');
    expect(md).to.contain('Panel A');
  });

  it('skips copy-markdown buttons, header and footer', () => {
    const md = domToMarkdown(fixture(
      '<header><p>nav</p></header>'
      + '<div class="copy-markdown"><button>Copy for AI</button></div>'
      + '<p>Keep me.</p>'
      + '<footer><p>legal</p></footer>',
    ));
    expect(md).to.contain('Keep me.');
    expect(md).to.not.contain('nav');
    expect(md).to.not.contain('legal');
    expect(md).to.not.contain('Copy for AI');
  });

  it('returns empty string for a null root', () => {
    expect(domToMarkdown(null)).to.equal('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:file -- test/blocks/copy-markdown.test.js`
Expected: FAIL — module `blocks/copy-markdown/copy-markdown.js` does not exist / `domToMarkdown is not a function`.

- [ ] **Step 3: Write the block implementation**

```js
// blocks/copy-markdown/copy-markdown.js

const SKIP_SELECTOR = '.copy-markdown, header, footer, script, style';

/** Collapse whitespace in inline text. */
function text(node) {
  return (node.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Escape pipe chars so they don't break Markdown table cells. */
function cell(node) {
  return text(node).replace(/\|/g, '\\|');
}

/** Serialize a single <table> to a GitHub pipe table. */
function tableToMarkdown(table) {
  const rows = [...table.querySelectorAll('tr')];
  if (!rows.length) return '';
  const lines = [];
  rows.forEach((tr, idx) => {
    const cells = [...tr.children].map((c) => cell(c));
    lines.push(`| ${cells.join(' | ')} |`);
    if (idx === 0) lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
  });
  return lines.join('\n');
}

/** Serialize a <ul>/<ol> to bullet/number lines. */
function listToMarkdown(list) {
  const ordered = list.tagName === 'OL';
  return [...list.children]
    .filter((li) => li.tagName === 'LI')
    .map((li, i) => `${ordered ? `${i + 1}.` : '-'} ${text(li)}`)
    .join('\n');
}

/** Recursively serialize a node's relevant children to Markdown blocks. */
function serialize(node, out) {
  for (const child of node.children) {
    if (child.matches?.(SKIP_SELECTOR)) continue;
    const tag = child.tagName;

    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      const t = text(child);
      if (t) out.push(`${'#'.repeat(level)} ${t}`);
    } else if (tag === 'P') {
      const t = text(child);
      if (t) out.push(t);
    } else if (tag === 'UL' || tag === 'OL') {
      const t = listToMarkdown(child);
      if (t) out.push(t);
    } else if (tag === 'TABLE') {
      const t = tableToMarkdown(child);
      if (t) out.push(t);
    } else if (child.classList.contains('report-callout')) {
      const t = text(child);
      if (t) out.push(`> ${t}`);
    } else {
      // Container (section, block-content, advanced-tabs, cards…): recurse.
      serialize(child, out);
    }
  }
}

/**
 * Serialize a container element to GitHub-flavored Markdown.
 * @param {Element|null} root
 * @returns {string}
 */
export function domToMarkdown(root) {
  if (!root) return '';
  const out = [];
  serialize(root, out);
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Copy text to clipboard with a legacy fallback for non-secure contexts. */
async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (e) { /* fall through to legacy path */ }
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

export default function init(el) {
  const label = (el.textContent || '').trim() || 'Copy for AI';
  el.textContent = '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cm-btn';
  btn.textContent = label;
  el.append(btn);

  let resetId;
  btn.addEventListener('click', async () => {
    const md = domToMarkdown(document.querySelector('main'));
    const ok = await copyText(md);
    btn.classList.toggle('cm-copied', ok);
    btn.textContent = ok ? 'Copied!' : 'Copy failed';
    clearTimeout(resetId);
    resetId = setTimeout(() => {
      btn.classList.remove('cm-copied');
      btn.textContent = label;
    }, 2000);
  });
}
```

- [ ] **Step 4: Write the block CSS**

```css
/* blocks/copy-markdown/copy-markdown.css */
.copy-markdown {
  display: flex;
  justify-content: center;
  margin: 16px 0;
}

.copy-markdown .cm-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 24px;
  background: var(--rpt-red, var(--color-adobe-red, #e60000));
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease;
}

.copy-markdown .cm-btn::before {
  content: "\1F4CB"; /* clipboard */
  font-size: 1em;
}

.copy-markdown .cm-btn:hover { transform: translateY(-1px); }
.copy-markdown .cm-btn:active { transform: translateY(0); }

.copy-markdown .cm-btn.cm-copied {
  background: #2d8a34;
}

.copy-markdown .cm-btn.cm-copied::before {
  content: "\2713"; /* check */
}

@media (width < 1000px) {
  .copy-markdown .cm-btn { width: 100%; justify-content: center; }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:file -- test/blocks/copy-markdown.test.js`
Expected: PASS (all `domToMarkdown` specs green).

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors. (Fix any ESLint/Stylelint findings in the two new files.)

- [ ] **Step 7: Commit**

```bash
git add blocks/copy-markdown/copy-markdown.js blocks/copy-markdown/copy-markdown.css test/blocks/copy-markdown.test.js
git commit -m "feat(copy-markdown): add copy-page-as-markdown block"
```

---

### Task 2: Document the block + page in PROJECT.md

**Files:**
- Modify: `PROJECT.md` (Blocks section + a note on the playbook page)

**Interfaces:**
- Consumes: the `copy-markdown` block from Task 1.
- Produces: nothing (docs only).

- [ ] **Step 1: Add a `copy-markdown` entry under the Blocks section**

Add after an existing block entry:

```markdown
### copy-markdown
A "Copy for AI" button that serializes the live page `main` to GitHub-flavored Markdown and writes it to the clipboard (with a `document.execCommand` fallback for non-secure contexts). `domToMarkdown(root)` walks the DOM in document order — headings (`#`…), paragraphs, `ul`/`ol`, `table` (pipe tables, pipe-escaped cells), `.report-callout` (blockquote), and recurses into containers including `.advanced-tabs` so hidden tab panels are still captured — while skipping `.copy-markdown`, `header`, and `footer`. Used on the internal Sales Playbook page (`/docs/sales-playbook`): one instance in the hero, one at the end of the page. Button label comes from the authored cell (default "Copy for AI"); shows transient "Copied!" feedback.
```

- [ ] **Step 2: Note the playbook page**

Append to the Overview or a "Pages" note that `/docs/sales-playbook` is the internal seller playbook, built from `report-hero`, `report-cards`, `advanced-tabs`, `table`, `report-callout`, and `copy-markdown`.

- [ ] **Step 3: Commit**

```bash
git add PROJECT.md
git commit -m "docs(project): document copy-markdown block and sales-playbook page"
```

---

### Task 3: Author the `/docs/sales-playbook` page in DA

**Files:** none in repo. DA content via admin API (`https://admin.da.live/source/aemsites/summit-portal/docs/sales-playbook.html`). Auth token in `/tmp/da_token.txt`.

**Interfaces:**
- Consumes: all blocks (existing + `copy-markdown`).
- Produces: a published-ready page at `/docs/sales-playbook`.

- [ ] **Step 1: Build the page HTML** following the ak.js content convention — a full `<body>` with `<header></header>`, `<main>` containing one `<div>` section per block group, `<footer></footer>`. Each block is a `<div class="<block-name>">` with rows of cells (`<div><div>…</div></div>`). Use block variants from the spec mapping:
  - `report-hero insight` — H1 "Digital Opportunity Report — Sales Playbook", subtitle paragraph, a `Measured: June 2026`-style date paragraph, and a `copy-markdown` block adjacent.
  - `report-cards features` — 4 value props.
  - `report-cards` (default) — Data Sources.
  - `report-cards steps` — 5-step generation workflow.
  - `advanced-tabs` — per-source provenance (one tab per source).
  - `table` — Objection Handling (4 cols).
  - `table` — Metric guardrails (4 cols).
  - `report-callout neutral` — one per critical caveat.
  - `advanced-tabs` — Report Page Map grouped by category.
  - `report-cards` — FAQ Q/A.
  - `copy-markdown` — closing button.

  Copy text verbatim from the source playbook; **omit** Pitch Flow, Execution Checklists, and Using the Digital Insights Hub. Preserve internal-only language.

- [ ] **Step 2: PUT the source to DA**

```bash
TOKEN=$(cat /tmp/da_token.txt)
curl -s -X PUT "https://admin.da.live/source/aemsites/summit-portal/docs/sales-playbook.html" \
  -H "Authorization: Bearer $TOKEN" \
  -F "data=@/tmp/sales-playbook.html;type=text/html"
```
Expected: JSON response with the new resource path (HTTP 200/201).

- [ ] **Step 3: Verify** by fetching the source back:

```bash
TOKEN=$(cat /tmp/da_token.txt)
curl -s "https://admin.da.live/source/aemsites/summit-portal/docs/sales-playbook.html" -H "Authorization: Bearer $TOKEN" | head -c 500
```
Expected: the HTML just written.

- [ ] **Step 4: Preview-render check.** Open `http://localhost:3000/docs/sales-playbook` (AEM CLI dev server, with the `da` content source) or the DA preview URL, and confirm each block renders and the copy button produces well-formed Markdown.

---

### Task 4: Add the dashboard entry-point link in DA

**Files:** none in repo. DA content: `/adobe/dashboard.html`.

**Interfaces:**
- Consumes: the `/docs/sales-playbook` page from Task 3.
- Produces: a visible link to the playbook on the staff dashboard.

- [ ] **Step 1: Fetch the current dashboard source**

```bash
TOKEN=$(cat /tmp/da_token.txt)
curl -s "https://admin.da.live/source/aemsites/summit-portal/adobe/dashboard.html" -H "Authorization: Bearer $TOKEN" > /tmp/dashboard.html
```

- [ ] **Step 2: Add a link/banner** to the existing dashboard `main` (a paragraph or `report-callout cta` with text like "New: Sales Playbook — how to pitch & defend a Digital Opportunity Report" linking to `/docs/sales-playbook`). Edit `/tmp/dashboard.html` to insert it **without removing any existing content** (the "Select a Customer" heading and `customer-picker` block must remain intact).

- [ ] **Step 3: PUT the updated dashboard back**

```bash
TOKEN=$(cat /tmp/da_token.txt)
curl -s -X PUT "https://admin.da.live/source/aemsites/summit-portal/adobe/dashboard.html" \
  -H "Authorization: Bearer $TOKEN" \
  -F "data=@/tmp/dashboard.html;type=text/html"
```
Expected: HTTP 200/201.

- [ ] **Step 4: Verify** the dashboard still contains the customer-picker AND the new link:

```bash
TOKEN=$(cat /tmp/da_token.txt)
curl -s "https://admin.da.live/source/aemsites/summit-portal/adobe/dashboard.html" -H "Authorization: Bearer $TOKEN" | grep -o "sales-playbook\|customer-picker"
```
Expected: both `customer-picker` and `sales-playbook` present.

---

### Task 5: Open the pull request

**Files:** none (git/gh operation).

**Interfaces:**
- Consumes: commits from Tasks 1–2.
- Produces: one PR against `main`.

- [ ] **Step 1: Push the current feature branch** (already `feat/sydney-summit-2026-tab`? — create a dedicated branch instead so the PR is scoped):

```bash
cd /Users/josec/code/summit-portal
git checkout -b feat/sales-playbook-guide
git push -u origin feat/sales-playbook-guide
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --title "feat: internal sales playbook guide + copy-markdown block" \
  --body "$(cat <<'EOF'
## Summary
- New internal **Sales Playbook** page at `/docs/sales-playbook` (authored in DA) teaching sellers how to read, present, and defend a Digital Opportunity Report.
- New `copy-markdown` block: a "Copy for AI" button that serializes the page to Markdown for pasting into LLM agents.
- Dashboard (`/adobe/dashboard`) now links to the playbook.

Content is built from existing report blocks (`report-hero`, `report-cards`, `advanced-tabs`, `table`, `report-callout`). Pitch Flow, Execution Checklists, and the Digital Insights Hub how-to were intentionally omitted.

## Test plan
- `npm run lint` clean.
- `npm run test:file -- test/blocks/copy-markdown.test.js` green.
- Previewed `/docs/sales-playbook`; copy button produces well-formed Markdown.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

---

## Self-Review

**Spec coverage:**
- Internal playbook page, `/docs/sales-playbook` → Task 3. ✓
- Reuse existing blocks → Task 3 mapping. ✓
- One new `copy-markdown` block (DOM→Markdown, hero + end, clipboard + fallback, "Copied!") → Task 1. ✓
- Dashboard entry point → Task 4. ✓
- Dropped sections (Pitch Flow / Checklists / Hub) → called out in Global Constraints + Task 3 Step 1. ✓
- PROJECT.md update → Task 2. ✓
- One PR → Task 5. ✓
- advanced-tabs hidden-panel serialization risk → covered by a dedicated test in Task 1. ✓
- Clipboard secure-context fallback → `copyText` legacy path + test note. ✓

**Placeholder scan:** No TBD/TODO; all code shown in full. Task 3 page HTML is authored from verbatim source copy (the source text is in the conversation/spec); the block structure is fully specified.

**Type consistency:** `domToMarkdown(root)` and default `init(el)` names/signatures match between Task 1 implementation, tests, and PROJECT.md doc. Button class `.cm-btn` / `.cm-copied` consistent between JS and CSS.
