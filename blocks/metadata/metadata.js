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

  const section = el.closest('.section');
  el.remove();
  if (section && !section.children.length) section.remove();
}
