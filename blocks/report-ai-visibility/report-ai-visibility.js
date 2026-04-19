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
    } else if (type === 'headline' || type === 'comparison') {
      const panelsOuter = document.createElement('div');
      panelsOuter.className = 'rav-panels-outer';
      const panelWrap = document.createElement('div');
      panelWrap.className = 'rav-panels';
      while (i < rows.length && (rows[i].type === 'headline' || rows[i].type === 'comparison')) {
        panelWrap.append(renderPanel(rows[i]));
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

  await loadStyle(`${getConfig().codeBase}/blocks/report-ai-visibility/report-ai-visibility.css`);

  block.textContent = '';
  block.append(container);
  setupRavPanelFootnoteHeightSync(block);
  attachRavPaneSheet(block);

  const performanceShell = buildEmptyVisibilityShell('Performance insights');
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
    if (strip) perfPanelsOuter.prepend(strip);
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
