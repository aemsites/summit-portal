import { expect } from '@esm-bundle/chai';

describe('campaign share report activity', () => {
  const frames = [];

  afterEach(() => {
    frames.splice(0).forEach((frame) => frame.remove());
  });

  async function reportTab(proof) {
    const frame = document.createElement('iframe');
    frames.push(frame);
    frame.srcdoc = `<!doctype html><html><head><script>
      window.posts = [];
      window.fetch = (url, options) => {
        window.posts.push({ url, options });
        return Promise.resolve(new Response(null, { status: 204 }));
      };
    </script><script type="module" src="/scripts/campaign-share.js"
      ${proof ? `data-campaign-share="${proof}"` : ''}></script></head>
      <body style="height: 4000px"><a class="rd-cta-btn" href="/fixture.pdf">PDF</a>
        <a href="/more">Read more</a></body></html>`;
    const loaded = new Promise((resolve) => {
      frame.addEventListener('load', resolve, { once: true });
    });
    document.body.append(frame);
    await loaded;
    return frame.contentWindow;
  }

  function posts(tab) {
    return Array.from(tab.posts, ({ url, options }) => {
      expect(url).to.equal('/auth/campaign-share');
      expect(options.referrerPolicy).to.equal('no-referrer');
      expect(options.keepalive).to.equal(true);
      return JSON.parse(options.body);
    });
  }

  it('counts views and interactions separately on two attributed documents and not on a clean one', async () => {
    const [first, second, clean] = await Promise.all([
      reportTab('first-proof'), reportTab('second-proof'), reportTab(),
    ]);
    function click(tab, selector) {
      const link = tab.document.querySelector(selector);
      link.addEventListener('click', (event) => event.preventDefault(), { once: true });
      link.click();
    }
    click(first, '.rd-cta-btn');
    click(second, 'a[href="/more"]');
    click(clean, '.rd-cta-btn');

    first.scrollTo(0, first.document.documentElement.scrollHeight);
    first.dispatchEvent(new Event('scroll'));
    first.dispatchEvent(new Event('scroll'));
    expect(posts(first)).to.deep.equal([
      { proof: 'first-proof', event: 'report_viewed' },
      { proof: 'first-proof', event: 'report_download' },
      ...[25, 50, 75, 100].map((depth) => ({ proof: 'first-proof', event: 'report_scroll', scroll_depth: depth })),
    ]);
    expect(posts(second)).to.deep.equal([{ proof: 'second-proof', event: 'report_viewed' }]);
    expect(posts(clean)).to.deep.equal([]);
  });
});
