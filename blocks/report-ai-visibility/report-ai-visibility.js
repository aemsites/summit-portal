import { loadStyle, getConfig } from '../../scripts/ak.js';
import {
  parseVisibilityRows,
  renderStats,
  renderPlatforms,
  renderPanel,
  renderGap,
  renderCta,
  renderInsight,
} from './rav-core.js';

/**
 * Move every Visibility gap + Key insight row to sit directly above the first CTA
 * (e.g. "Discover Adobe LLM…") so the flex pair is never split by the CTA in the sheet.
 * @param {Array<{ type: string, cells: Element[] }>} rows
 * @returns {typeof rows}
 */
function reorderGapInsightBeforeCta(rows) {
  const without = rows.filter((r) => r.type !== 'gap' && r.type !== 'insight');
  const ctaIdx = without.findIndex((r) => r.type === 'cta');
  if (ctaIdx === -1) {
    return rows;
  }

  const tagged = rows
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => r.type === 'gap' || r.type === 'insight');
  if (tagged.length === 0) {
    return rows;
  }

  const typeOrder = { gap: 0, insight: 1 };
  const ordered = [...tagged]
    .sort((a, b) => {
      const ta = typeOrder[a.r.type] ?? 99;
      const tb = typeOrder[b.r.type] ?? 99;
      if (ta !== tb) return ta - tb;
      return a.index - b.index;
    })
    .map(({ r }) => r);

  return [...without.slice(0, ctaIdx), ...ordered, ...without.slice(ctaIdx)];
}

/**
 * Performance insights shell: section head + panels outer.
 * The following report-scores block is moved into panels outer in decorate().
 * @param {string} sectionTitleText
 * @returns {HTMLDivElement}
 */
function buildEmptyVisibilityShell(sectionTitleText) {
  const shell = document.createElement('div');
  shell.className = 'report-ai-visibility rav-empty-shell';

  const sectionHead = document.createElement('div');
  sectionHead.className = 'rav-section-head';
  const sectionTitle = document.createElement('h2');
  sectionTitle.className = 'rav-section-title';
  sectionTitle.textContent = sectionTitleText;
  sectionHead.append(sectionTitle);

  const container = document.createElement('div');
  container.className = 'rav-container';

  const panelsOuter = document.createElement('div');
  panelsOuter.className = 'rav-panels-outer';

  container.append(sectionHead, panelsOuter);
  shell.append(container);
  return shell;
}

/**
 * Same chrome as the Performance insights row appended by decorate() — for pages
 * that only author report-scores (no report-ai-visibility block).
 * @returns {HTMLDivElement}
 */
export function createPerformanceInsightsShell() {
  return buildEmptyVisibilityShell('Performance insights');
}

/**
 * Move a decorated report-scores element into the shell and hoist summary pills.
 * @param {Element} scoresEl
 * @param {Element} performanceShell
 */
export function attachReportScoresToPerformanceShell(scoresEl, performanceShell) {
  const perfPanelsOuter = performanceShell.querySelector('.rav-panels-outer');
  if (!perfPanelsOuter) return;
  if (!perfPanelsOuter.contains(scoresEl)) {
    perfPanelsOuter.prepend(scoresEl);
  }
  const perfHead = performanceShell.querySelector('.rav-container > .rav-section-head');
  const perfPills = scoresEl.querySelector(':scope > .rsc-summary-pills');
  if (perfHead && perfPills && !perfHead.contains(perfPills)) {
    perfHead.append(perfPills);
  }
}

/**
 * Match `.rav-panel-footnote` min-heights within each `.rav-panels` row (tallest wins).
 * @param {Element} root
 */
function syncRavPanelFootnoteHeights(root) {
  root.querySelectorAll('.rav-panels').forEach((panelsWrap) => {
    const panels = [...panelsWrap.querySelectorAll(':scope > .rav-panel')];
    const footnotes = panels
      .map((panel) => panel.querySelector(':scope > .rav-panel-footnote'))
      .filter(Boolean);
    if (footnotes.length < 2) {
      footnotes.forEach((fn) => { fn.style.minHeight = ''; });
      return;
    }
    footnotes.forEach((fn) => { fn.style.minHeight = ''; });
    const maxH = Math.max(...footnotes.map((fn) => fn.getBoundingClientRect().height));
    if (maxH > 0) {
      const px = `${Math.ceil(maxH)}px`;
      footnotes.forEach((fn) => { fn.style.minHeight = px; });
    }
  });
}

/**
 * @param {Element} block
 */
function setupRavPanelFootnoteHeightSync(block) {
  let raf = 0;
  const run = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      syncRavPanelFootnoteHeights(block);
    });
  };
  requestAnimationFrame(() => requestAnimationFrame(run));

  const wraps = [...block.querySelectorAll('.rav-panels')];
  const ro = new ResizeObserver(run);
  wraps.forEach((w) => ro.observe(w));
  window.addEventListener('resize', run);
}

/** Row types that render as `.rav-panel` (subtitle + chart + footnote). */
const PANEL_ROW_TYPES = new Set([
  'headline',
  'comparison',
  'competitors',
  'topic',
  'opportunities',
]);

/**
 * Pair groups for panel rows — rows in the same group stack side-by-side in
 * a single `.rav-panels` shell, saving vertical space on desktop.
 */
const PANEL_ROW_GROUPS = [
  new Set(['headline', 'comparison']),
  new Set(['topic', 'opportunities']),
];

/** @param {string} type */
function panelGroupFor(type) {
  return PANEL_ROW_GROUPS.find((g) => g.has(type)) || new Set([type]);
}

/**
 * Collapse long `.rav-rec-list` and `.rav-metric-strip` bodies on mobile
 * behind a "Show all N" disclosure. Keeps the first row visible so the
 * user sees the top signal, and reveals the rest inline on tap.
 * @param {Element} root
 */
function attachRavMobileCollapse(root) {
  const targets = [
    { sel: '.rav-rec-list', item: '.rav-rec-card', keep: 1, noun: 'opportunity', plural: 'opportunities' },
    { sel: '.rav-metric-strip', item: '.rav-ms-row', keep: 2, noun: 'metric', plural: 'metrics' },
  ];
  targets.forEach(({ sel, item, keep, noun, plural }) => {
    root.querySelectorAll(sel).forEach((list) => {
      const items = [...list.querySelectorAll(item)];
      if (items.length <= keep) return;
      if (list.dataset.collapseAttached === 'true') return;
      list.dataset.collapseAttached = 'true';
      list.dataset.collapsed = 'true';
      const hidden = items.slice(keep);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rav-collapse-toggle';
      const hiddenCount = hidden.length;
      const moreLabel = `Show all ${items.length} ${hiddenCount === 1 ? noun : plural}`;
      const lessLabel = 'Show less';
      btn.textContent = moreLabel;
      btn.setAttribute('aria-expanded', 'false');
      list.after(btn);
      btn.addEventListener('click', () => {
        const expanded = list.dataset.collapsed === 'false';
        list.dataset.collapsed = expanded ? 'true' : 'false';
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        btn.textContent = expanded ? moreLabel : lessLabel;
      });
    });
  });
}

/**
 * Tap-to-expand bottom sheet for .rav-gap / .rav-insight panes on mobile.
 * Sheet is keyboard-, tap-backdrop-, close-button-, Esc- and swipe-dismissible.
 * @param {Element} root
 */
function attachRavPaneSheet(root) {
  if (root.dataset.paneSheetAttached === 'true') return;
  root.dataset.paneSheetAttached = 'true';

  const sheet = document.createElement('div');
  sheet.className = 'rav-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.dataset.open = 'false';
  sheet.innerHTML = `
    <div class="rav-sheet-backdrop" data-close="true"></div>
    <div class="rav-sheet-panel" role="document">
      <button type="button" class="rav-sheet-close" aria-label="Close" data-close="true">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
      <div class="rav-sheet-grabber" aria-hidden="true"></div>
      <div class="rav-sheet-badge"></div>
      <div class="rav-sheet-body"></div>
    </div>
  `;
  root.append(sheet);

  const openSheet = (trigger) => {
    const body = sheet.querySelector('.rav-sheet-body');
    const badge = sheet.querySelector('.rav-sheet-badge');
    const contentEl = trigger.querySelector('.rav-gap-content, .rav-insight-content');
    badge.textContent = trigger.dataset.sheetTitle || '';
    body.innerHTML = contentEl ? contentEl.innerHTML : '';
    sheet.dataset.open = 'true';
    sheet.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    sheet.activeTrigger = trigger;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => sheet.querySelector('.rav-sheet-close')?.focus());
  };

  const closeSheet = () => {
    sheet.dataset.open = 'false';
    sheet.setAttribute('aria-hidden', 'true');
    if (sheet.activeTrigger) {
      sheet.activeTrigger.setAttribute('aria-expanded', 'false');
      sheet.activeTrigger.focus();
      sheet.activeTrigger = null;
    }
    document.documentElement.style.overflow = '';
  };

  const mq = window.matchMedia('(width < 1000px)');
  const makeTriggerable = (el) => {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-expanded', 'false');
  };
  root.querySelectorAll('.rav-gap, .rav-insight').forEach(makeTriggerable);

  root.addEventListener('click', (e) => {
    const trigger = e.target.closest('.rav-gap, .rav-insight');
    if (trigger && mq.matches && !e.target.closest('a')) {
      openSheet(trigger);
      return;
    }
    if (e.target.closest('[data-close]')) closeSheet();
  });

  root.addEventListener('keydown', (e) => {
    const trigger = e.target.closest?.('.rav-gap, .rav-insight');
    if (trigger && (e.key === 'Enter' || e.key === ' ') && mq.matches) {
      e.preventDefault();
      openSheet(trigger);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.dataset.open === 'true') closeSheet();
  });

  const panel = sheet.querySelector('.rav-sheet-panel');
  let startY = null;
  let dragging = false;
  panel.addEventListener('touchstart', (e) => {
    if (sheet.dataset.open !== 'true' || panel.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    dragging = true;
    panel.style.transition = 'none';
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (!dragging || startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', (e) => {
    if (!dragging || startY == null) return;
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    panel.style.transition = '';
    panel.style.transform = '';
    dragging = false;
    startY = null;
    if (dy > 80) closeSheet();
  });
}

// ── Main decorator ──────────────────────────────────────────────────────────

export default async function decorate(block) {
  const rows = reorderGapInsightBeforeCta(parseVisibilityRows(block));

  const sectionHead = document.createElement('div');
  sectionHead.className = 'rav-section-head';
  const sectionTitle = document.createElement('h2');
  sectionTitle.className = 'rav-section-title';
  sectionTitle.textContent = 'LLM visibility';
  sectionHead.append(sectionTitle);

  const container = document.createElement('div');
  container.className = 'rav-container';

  /** @type {HTMLDivElement | null} */
  let panelsOuterHost = null;

  let i = 0;
  while (i < rows.length) {
    const { type } = rows[i];

    if (type === 'stats') {
      const group = [];
      while (i < rows.length && rows[i].type === 'stats') { group.push(rows[i]); i += 1; }
      container.append(renderStats(group));
    } else if (type === 'platforms') {
      sectionHead.append(renderPlatforms(rows[i]));
      i += 1;
    } else if (PANEL_ROW_TYPES.has(type)) {
      const panelsOuter = document.createElement('div');
      panelsOuter.className = 'rav-panels-outer';
      const panelWrap = document.createElement('div');
      panelWrap.className = 'rav-panels';
      // Group pairs share one panels shell so paired rows sit side-by-side
      // on desktop (see PANEL_ROW_GROUPS). Standalone kinds stay centered
      // on their own row via the existing `:only-child` CSS rule.
      const groupTypes = panelGroupFor(type);
      while (i < rows.length && groupTypes.has(rows[i].type)) {
        // Skip the headline bigfigure chart — it duplicates the AI
        // visibility score already shown in the stats strip above.
        if (rows[i].type === 'headline') {
          panelWrap.append(renderPanel(rows[i], { skipChart: true }));
        } else {
          panelWrap.append(renderPanel(rows[i]));
        }
        i += 1;
      }
      panelsOuter.append(panelWrap);
      container.append(panelsOuter);
      panelsOuterHost = panelsOuter;
    } else if (type === 'gap') {
      const flex = document.createElement('div');
      flex.className = 'rav-gap-insight-flex';
      flex.append(renderGap(rows[i]));
      i += 1;
      if (i < rows.length && rows[i].type === 'insight') {
        flex.append(renderInsight(rows[i]));
        i += 1;
      }
      (panelsOuterHost ?? container).append(flex);
    } else if (type === 'cta') {
      container.append(renderCta(rows[i]));
      i += 1;
    } else if (type === 'insight') {
      const flex = document.createElement('div');
      flex.className = 'rav-gap-insight-flex';
      flex.append(renderInsight(rows[i]));
      i += 1;
      (panelsOuterHost ?? container).append(flex);
    } else {
      i += 1;
    }
  }

  container.prepend(sectionHead);

  // Pair stats strip with an adjacent single-panel story into one row on desktop.
  const statsEl = container.querySelector(':scope > .rav-stats');
  const nextEl = statsEl?.nextElementSibling;
  const storyOuter = nextEl?.classList.contains('rav-panels-outer') ? nextEl : null;
  const storyPanels = storyOuter
    ? storyOuter.querySelectorAll(':scope > .rav-panels > .rav-panel')
    : [];
  if (statsEl && storyOuter && storyPanels.length === 1) {
    // Move any gap/insight flex that got appended into the panels-outer back to the
    // container, so it keeps sitting below the paired row rather than beside the story.
    const gapInsightFlexes = [...storyOuter.querySelectorAll(':scope > .rav-gap-insight-flex')];
    const row = document.createElement('div');
    row.className = 'rav-stats-story-row';
    statsEl.replaceWith(row);
    storyOuter.remove();
    row.append(statsEl, storyOuter);
    gapInsightFlexes.forEach((flex) => {
      storyOuter.removeChild(flex);
      row.after(flex);
    });
  }

  // Stack a second top-level `.rav-panels-outer` (topic + gap/insight) into the first
  // so one outer wraps competitors + topic + visibility gap (matches author layout).
  const topOuters = [...container.children].filter((el) => el.classList.contains('rav-panels-outer'));
  if (topOuters.length >= 2) {
    const [firstOuter, secondOuter] = topOuters;
    const toMove = [...secondOuter.children].filter(
      (el) => el.classList.contains('rav-panels') || el.classList.contains('rav-gap-insight-flex'),
    );
    toMove.forEach((el) => firstOuter.append(el));
    if (secondOuter.childElementCount === 0) {
      secondOuter.remove();
    }
  }

  await loadStyle(`${getConfig().codeBase}/blocks/report-ai-visibility/report-ai-visibility.css`);

  block.textContent = '';
  block.append(container);
  setupRavPanelFootnoteHeightSync(block);
  attachRavPaneSheet(block);
  attachRavMobileCollapse(block);

  const performanceShell = createPerformanceInsightsShell();
  block.after(performanceShell);

  const perfPanelsOuter = performanceShell.querySelector('.rav-panels-outer');
  if (perfPanelsOuter) {
    const isScores = (el) => el?.classList.contains('report-scores');
    const section = block.closest('.section');
    const inSection = section
      ? [...section.querySelectorAll('.report-scores')]
        .filter((el) => el !== block && !performanceShell.contains(el) && !el.contains(block))
      : [];
    const fromSection = inSection[0];
    let strip = fromSection;
    if (!strip) {
      let s = performanceShell.nextElementSibling;
      while (s) {
        if (isScores(s)) {
          strip = s;
          break;
        }
        s = s.nextElementSibling;
      }
    }
    if (!strip) {
      let s = block.previousElementSibling;
      while (s) {
        if (isScores(s)) {
          strip = s;
          break;
        }
        s = s.previousElementSibling;
      }
    }
    if (strip) {
      attachReportScoresToPerformanceShell(strip, performanceShell);
    }
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('rav-animate');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  observer.observe(block);
  observer.observe(performanceShell);
}
