/** @type {Record<string, (widget: Element) => Element | null>} */
const FOOTER_HOST_RESOLVERS = {
  'report-ai-visibility': (widget) => {
    const marked = [...widget.querySelectorAll('[data-widget-footer-host]')];
    if (marked.length) return marked[marked.length - 1];
    const outers = [...widget.querySelectorAll('.rav-container .rav-panels-outer')];
    return outers.length ? outers[outers.length - 1] : null;
  },
  'report-carousel': (widget) => widget,
  'report-stats': (widget) => widget.querySelector('[data-widget-footer-host]')
    || widget.querySelector(':scope > .rav-panels-outer')
    || widget,
  'report-scores': (widget) => widget,
  'report-chart': (widget) => widget,
  'report-bar': (widget) => widget,
  'report-cards': (widget) => widget,
  'report-download': (widget) => widget,
};

const PRIMARY_WIDGET_NAMES = Object.keys(FOOTER_HOST_RESOLVERS);

/**
 * @returns {boolean}
 */
function isCannesReportPage() {
  return Boolean(document.querySelector('.report-hero.insight, .cobrand'));
}

/**
 * @param {Element | null | undefined} wrapper
 */
function removeEmptyContentWrapper(wrapper) {
  if (!wrapper?.matches('.block-content, .default-content')) return;
  if (wrapper.childElementCount > 0) return;
  if (wrapper.textContent.trim()) return;
  wrapper.remove();
}

/**
 * @param {Element} section
 * @returns {Element | null}
 */
function findPrimaryWidget(section) {
  const widgets = [...section.querySelectorAll(':scope > .block-content > *')].filter((el) => {
    if (el.classList.contains('report-callout')) return false;
    if (el.classList.contains('report-ai-section-head')) return false;
    return PRIMARY_WIDGET_NAMES.some((name) => el.classList.contains(name));
  });
  const rav = widgets.find((el) => el.classList.contains('report-ai-visibility'));
  if (rav) return rav;
  return widgets.length ? widgets[widgets.length - 1] : null;
}

/**
 * @param {Element} widget
 * @returns {Element | null}
 */
function resolveFooterHost(widget) {
  const name = PRIMARY_WIDGET_NAMES.find((n) => widget.classList.contains(n));
  if (!name) return null;
  return FOOTER_HOST_RESOLVERS[name](widget);
}

/**
 * @param {Element} host
 * @returns {Element}
 */
function getFooterSlot(host) {
  let slot = host.querySelector(':scope > .rpt-widget-footer');
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'rpt-widget-footer';
    host.append(slot);
  }
  return slot;
}

/**
 * @param {Element} widget
 * @param {Element} footerHost
 * @returns {boolean}
 */
function usesPanelsOuterFooter(widget, footerHost) {
  return footerHost.classList.contains('rav-panels-outer')
    && (widget.classList.contains('report-ai-visibility')
      || widget.classList.contains('report-stats'));
}

/**
 * @param {Element} widget
 * @param {Element} footerHost
 * @returns {Element}
 */
function getAppendTarget(widget, footerHost) {
  if (usesPanelsOuterFooter(widget, footerHost)) return footerHost;
  return getFooterSlot(footerHost);
}

/**
 * @param {Element} section
 * @param {Element} widget
 * @param {Element} appendTarget
 */
function relocateSectionFooter(section, widget, appendTarget) {
  const calloutSelectors = [
    ':scope > .block-content > .report-callout',
    ':scope > .block-content > .report-ai-visibility .rav-container > .report-callout',
    ':scope > .block-content > .report-ai-visibility > .report-callout',
    ':scope > .block-content > .report-stats > .report-callout',
    ':scope > .block-content > .report-stats .rav-panels-outer > .report-callout',
  ];
  const calloutCandidates = [...new Set(calloutSelectors
    .flatMap((selector) => [...section.querySelectorAll(selector)]))];
  const callout = calloutCandidates
    .find((el) => !el.classList.contains('cta') && !appendTarget.contains(el));
  if (callout) {
    appendTarget.append(callout);
    removeEmptyContentWrapper(callout.parentElement);
  }

  const sourceWrappers = [...new Set([
    ...section.querySelectorAll(':scope > .default-content, :scope > .block-content > .default-content'),
    ...widget.querySelectorAll('.rav-container > .default-content'),
    ...widget.querySelectorAll('.report-ai-visibility .default-content'),
    ...widget.querySelectorAll('.report-stats .default-content'),
  ])];
  const sourceWrapper = sourceWrappers.find((wrapper) => {
    const sourceP = wrapper.querySelector(':scope > p');
    return sourceP
      && /^Data source:/i.test(sourceP.textContent.trim())
      && !appendTarget.contains(wrapper);
  });
  if (sourceWrapper) {
    const sourceP = sourceWrapper.querySelector(':scope > p');
    if (sourceP) {
      sourceP.classList.add('cannes-source');
      const tpl = document.createElement('template');
      if (/semrush/i.test(sourceP.textContent)) {
        tpl.innerHTML = '<svg class="cannes-source-logo" width="28" height="28" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9.54198 7.92487H4.85894C4.89335 7.90187 4.91011 7.8885 4.92883 7.87851C6.24415 7.1794 7.55928 6.47975 8.87531 5.78207C9.56747 5.41512 10.2568 5.04283 10.9559 4.6898C11.5591 4.38527 12.1904 4.15259 12.8632 4.04828C13.3681 3.97001 13.8722 3.99033 14.3707 4.0843C16.2 4.42931 17.5474 5.43759 18.4097 7.0808C18.8767 7.97069 19.058 8.92941 18.984 9.93377C18.897 11.1164 18.4773 12.168 17.7147 13.0743C16.8146 14.1441 15.6671 14.7892 14.284 15.0009C13.9916 15.0456 13.6928 15.0643 13.3968 15.0649C10.8621 15.0697 8.32722 15.0677 5.79251 15.0677H5.68999C5.68874 15.0613 5.6875 15.0551 5.68625 15.0486C7.26349 14.2096 8.84072 13.3705 10.418 12.5316C10.4165 12.5259 10.4151 12.5202 10.4137 12.5145H1.00767C1.00517 12.5066 1.0025 12.499 1 12.4911C3.84941 10.9759 6.69899 9.46074 9.54839 7.94555C9.54625 7.9386 9.54411 7.93164 9.54198 7.92469V7.92487Z" fill="currentColor"/></svg>';
      } else {
        tpl.innerHTML = '<svg class="cannes-source-logo" width="28" height="28" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true"><defs><linearGradient id="chrome-src-a" x1="3.2173" y1="15" x2="44.7812" y2="15" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d93025"/><stop offset="1" stop-color="#ea4335"/></linearGradient><linearGradient id="chrome-src-b" x1="20.7219" y1="47.6791" x2="41.5039" y2="11.6837" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fcc934"/><stop offset="1" stop-color="#fbbc04"/></linearGradient><linearGradient id="chrome-src-c" x1="26.5981" y1="46.5015" x2="5.8161" y2="10.506" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1e8e3e"/><stop offset="1" stop-color="#34a853"/></linearGradient></defs><circle cx="24" cy="23.9947" r="12" style="fill:#fff"/><path d="M3.2154,36A24,24,0,1,0,12,3.2154,24,24,0,0,0,3.2154,36ZM34.3923,18A12,12,0,1,1,18,13.6077,12,12,0,0,1,34.3923,18Z" style="fill:none"/><path d="M24,12H44.7812a23.9939,23.9939,0,0,0-41.5639.0029L13.6079,30l.0093-.0024A11.9852,11.9852,0,0,1,24,12Z" style="fill:url(#chrome-src-a)"/><circle cx="24" cy="24" r="9.5" style="fill:#1a73e8"/><path d="M34.3913,30.0029,24.0007,48A23.994,23.994,0,0,0,44.78,12.0031H23.9989l-.0025.0093A11.985,11.985,0,0,1,34.3913,30.0029Z" style="fill:url(#chrome-src-b)"/><path d="M13.6086,30.0031,3.218,12.006A23.994,23.994,0,0,0,24.0025,48L34.3931,30.0029l-.0067-.0068a11.9852,11.9852,0,0,1-20.7778.007Z" style="fill:url(#chrome-src-c)"/></svg>';
      }
      const icon = tpl.content.firstElementChild;
      if (icon) sourceWrapper.insertBefore(icon, sourceP);
    }
    appendTarget.append(sourceWrapper);
    removeEmptyContentWrapper(sourceWrapper.parentElement);
  }
}

/**
 * @param {Element} section
 */
function relocateSectionFooterForSection(section) {
  const widget = findPrimaryWidget(section);
  if (!widget) return;

  const footerHost = resolveFooterHost(widget);
  if (!footerHost) return;

  const appendTarget = getAppendTarget(widget, footerHost);

  if (usesPanelsOuterFooter(widget, footerHost)) {
    const staleFooter = footerHost.querySelector(':scope > .rpt-widget-footer');
    if (staleFooter) {
      [...staleFooter.children].forEach((child) => appendTarget.append(child));
      staleFooter.remove();
    }
  }

  relocateSectionFooter(section, widget, appendTarget);
}

/**
 * Relocate every section footer once the page (and cobrand, if any) is in the DOM.
 */
export function relocateAllSectionFooters() {
  if (!isCannesReportPage()) return;
  document.querySelectorAll('main > .section').forEach((section) => {
    relocateSectionFooterForSection(section);
  });
}

/**
 * Cannes cobrand sections author a "How to act" report-callout and a
 * "Data source: …" line as section siblings. Visually they belong inside
 * the primary widget's padded footer host — pull them in after decoration
 * (blocks in a section load in parallel, so this runs idempotently from
 * report-callout and data widgets).
 * @param {Element} fromEl
 */
export function scheduleRelocateSectionFooter(fromEl) {
  const section = fromEl?.closest('.section');
  if (!section) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!isCannesReportPage()) return;
    relocateSectionFooterForSection(section);
  }));
}

/** @deprecated Use scheduleRelocateSectionFooter */
export const scheduleRelocateAiVisibilitySectionFooter = scheduleRelocateSectionFooter;
