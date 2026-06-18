const PAGE_DATA_MARKERS = ['has-ai-visibility', 'customer', 'ai-data-source'];

/** Hide/remove authored page-data configuration sections (temporary). */
export function hidePageDataSections(root = document) {
  root.querySelectorAll('main > .section').forEach((section) => {
    if (section.querySelector(':scope > .block-content > .metadata')) {
      section.remove();
      return;
    }

    const text = section.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
    const matches = PAGE_DATA_MARKERS.filter((marker) => text.includes(marker)).length;
    if (matches >= PAGE_DATA_MARKERS.length) {
      section.remove();
    }
  });
}

export default function init(el) {
  const rows = el.querySelectorAll(':scope > div');
  rows.forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    if (cells.length < 2) return;
    const key = cells[0].textContent.trim();
    const value = cells[1].textContent.trim();
    if (!key) return;

    if (key.toLowerCase() === 'title' && value) {
      document.title = value;
      return;
    }
    if (key.toLowerCase() === 'html-lang' && value) {
      document.documentElement.setAttribute('lang', value);
      return;
    }

    const meta = document.createElement('meta');
    if (key.startsWith('og:') || key.startsWith('twitter:')) {
      meta.setAttribute('property', key);
    } else {
      meta.setAttribute('name', key);
    }
    meta.setAttribute('content', value);
    document.head.append(meta);
  });

  // Drop the metadata block itself, then clean up its wrapper/section ONLY when
  // metadata was the sole content. Single-section reports author every block
  // (report-hero, report-stats, …) plus metadata in one shared section — removing
  // that section unconditionally would wipe the whole report (the 18th Digitech
  // regression). So remove the section only once nothing else remains in it.
  const section = el.closest('.section');
  const blockContent = el.closest('.block-content');
  el.remove();
  if (blockContent && !blockContent.querySelector('div[class]') && !blockContent.textContent.trim()) {
    blockContent.remove();
  }
  if (section && !section.children.length) section.remove();
}
