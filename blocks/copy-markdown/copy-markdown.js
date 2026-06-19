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
  const children = [...node.children].filter((c) => !c.matches?.(SKIP_SELECTOR));
  for (const child of children) {
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
    } catch { /* fall through to legacy path */ }
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
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
