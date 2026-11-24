function trackCampaignShare(proof) {
  function send(event, depth) {
    fetch('/auth/campaign-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      referrerPolicy: 'no-referrer',
      keepalive: true,
      body: JSON.stringify({ proof, event, ...(depth ? { scroll_depth: depth } : {}) }),
    }).catch(() => { /* Counting never blocks report reading or downloads. */ });
  }

  send('report_viewed');

  const remaining = new Set([25, 50, 75, 100]);
  function onScroll() {
    const { scrollHeight, clientHeight } = document.documentElement;
    const distance = scrollHeight - clientHeight;
    if (distance <= 0) return;
    const percent = Math.round((window.scrollY / distance) * 100);
    remaining.forEach((depth) => {
      if (percent >= depth) {
        remaining.delete(depth);
        send('report_scroll', depth);
      }
    });
    if (!remaining.size) window.removeEventListener('scroll', onScroll);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  function onDownload({ target }) {
    const link = target.closest?.('a[href]');
    if (!link) return;
    const path = URL.canParse(link.href) ? new URL(link.href).pathname : '';
    if (link.matches('[download], .rc-download-btn, .rd-cta-btn, .rd-pdf-tag')
      || /\.pdf$/i.test(path)) send('report_download');
  }
  document.addEventListener('click', onDownload, { capture: true });
  document.addEventListener('auxclick', (event) => {
    if (event.button === 1) onDownload(event);
  }, { capture: true });
}

const proof = document.querySelector('script[data-campaign-share]')?.dataset.campaignShare;
if (proof) trackCampaignShare(proof);
