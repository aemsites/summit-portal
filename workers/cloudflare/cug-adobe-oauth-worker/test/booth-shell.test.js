import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { serveBooth, injectBoothReturn } from '../src/booth-shell.js';
import { createMockEnv, createMockBoothCookie } from './helpers.js';
import { BOOTH_DEMOS } from '../src/booth-demos.js';

describe('bundled booth shell and exact report injection', () => {
  let env;
  let cookie;
  let expiresAt;
  const selectedPath = '/accounts/e/example/insights/example-com/portal-landing/';

  beforeEach(async () => {
    env = createMockEnv();
    expiresAt = Date.now() + 600000;
    cookie = `${await createMockBoothCookie(env)}; booth_context=00000000-0000-4000-8000-000000000000`;
    env.BOOTH_COORDINATOR = {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => new Response(JSON.stringify({ state: 'report', selectedPath, expiresAt }), { headers: { 'Content-Type': 'application/json' } }) }),
    };
  });

  it('redirects unauthenticated shell to existing staff login and serves staff HTML without mock handlers', async () => {
    const anonymous = await serveBooth(new Request('https://portal.example/booth'), env);
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get('Location')).toBe('/login?staff&redirect=%2Fbooth');
    const response = await serveBooth(new Request('https://portal.example/booth', { headers: { Cookie: cookie } }), env);
    const html = await response.text();
    expect(html).toContain('/scripts/booth.js');
    expect(html).toContain('/scripts/booth.js?v=booth-picker-figma-1');
    expect(html).toContain('/styles/booth.css?v=booth-picker-figma-1');
    expect(html).toContain('Amplify your brand visibility');
    expect(html).toContain('<title>Digital Opportunity Report / booth</title>');
    expect(html).toContain('<div class="eyebrow">Digital Opportunity Report</div>');
    expect(html).not.toMatch(/brand\s+visibility\s+report/i);
    expect(html).not.toContain('send-demo');
    expect(html).not.toContain('jordan@');
    expect(html).not.toContain('Design review controls');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('bundles the actual source assets and leaves every other origin route alone', async () => {
    for (const path of ['/scripts/booth.js', '/scripts/booth-report.js', '/scripts/booth-presentation.js', '/scripts/booth-preview.js', '/scripts/booth-keyboard.js', '/scripts/booth-session.js', '/blocks/report-hero/report-hero.js', '/blocks/report-stats/report-stats.js', '/blocks/report-carousel/report-carousel.js', '/blocks/report-ai-visibility/rav-core.js', '/blocks/report-carousel/report-carousel.css', '/blocks/report-ai-visibility/report-ai-visibility.css', '/styles/booth.css', '/styles/booth-report.css', '/styles/booth-keyboard.css', '/styles/booth-loading.css']) {
      const response = await serveBooth(new Request(`https://portal.example${path}`), env);
      expect(response.status).toBe(200);
      expect((await response.text()).length).toBeGreaterThan(500);
    }
    expect(await serveBooth(new Request('https://portal.example/'), env)).toBeNull();
    expect(await serveBooth(new Request('https://portal.example/login'), env)).toBeNull();
    expect(await serveBooth(new Request('https://portal.example/scripts/ak.js'), env)).toBeNull();
    expect((await serveBooth(new Request('https://portal.example/booth', { method: 'POST' }), env)).status).toBe(405);
  });

  it('keeps the isolated recovery page reset bounded without claiming it succeeded', async () => {
    const response = await serveBooth(new Request('https://portal.example/booth?recover=1', { headers: { Cookie: cookie } }), env);
    const html = await response.text();
    expect(html).toContain('signal:AbortSignal.timeout(10000)');
    expect(html).toContain('Reset could not be confirmed. Ask staff for help.');
    expect(html).toContain("r.json()).state!=='entry'");
  });

  it('bundles every exported design asset with correct MIME types and HEAD behavior', async () => {
    const images = [
      'action-arrow.svg', 'finish-open-in.svg', 'finish-glow.svg',
      'adobe-wordmark.svg', 'entry-final-glow.svg', 'entry-final-webpage.png',
      'picker-artwork.png', 'picker-amazon.svg', 'picker-unity.svg',
      ...BOOTH_DEMOS.map(({ id }) => `industry-${id}.svg`),
    ];
    for (const name of images) {
      const url = `https://portal.example/img/booth/${name}`;
      const response = await serveBooth(new Request(url), env);
      const bytes = await response.arrayBuffer();
      const source = await readFile(new URL(`../../../../img/booth/${name}`, import.meta.url));
      expect(Buffer.from(bytes).equals(source)).toBe(true);
      const type = name.endsWith('.svg') ? 'image/svg+xml' : `image/${name.endsWith('.jpg') ? 'jpeg' : 'png'}`;
      expect(response.headers.get('Content-Type')).toBe(type);
      const head = await serveBooth(new Request(url, { method: 'HEAD' }), env);
      expect((await head.arrayBuffer()).byteLength).toBe(0);
      expect((await serveBooth(new Request(url, { method: 'POST' }), env)).status).toBe(405);
    }
  });

  it('drops legacy screen variants through staff setup and serves only the chosen designs', async () => {
    const response = await serveBooth(new Request('https://portal.example/booth?entry=3&finish=2&step=finish'), env);
    expect(response.headers.get('Location')).toBe('/login?staff&redirect=%2Fbooth');
    for (const query of ['entry=5&finish=6', 'entry=2&entry=3&finish=2&finish=3', 'entry=https://example.com&finish=../other']) {
      const invalid = await serveBooth(new Request(`https://portal.example/booth?${query}`), env);
      expect(invalid.headers.get('Location')).toBe('/login?staff&redirect=%2Fbooth');
    }
  });

  it('revalidates changed booth assets and serves their versioned URLs', async () => {
    for (const path of ['/scripts/booth.js?v=booth-final-figma-4', '/scripts/booth-preview.js', '/blocks/report-ai-visibility/rav-core.js?v=booth-preview-bars-1', '/styles/booth.css?v=booth-final-figma-4', '/scripts/booth-report.js?v=booth-controls-1', '/styles/booth-report.css', '/scripts/booth-keyboard.js?v=booth-keyboard-scroll-1', '/scripts/booth-session.js', '/styles/booth-keyboard.css', '/styles/booth-loading.css', '/img/booth/finish-glow.svg', '/img/booth/industry-frescopa.svg']) {
      const response = await serveBooth(new Request(`https://portal.example${path}`), env);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
    }
    const unchanged = await serveBooth(new Request('https://portal.example/scripts/booth-presentation.js'), env);
    expect(unchanged.headers.has('Cache-Control')).toBe(false);
    const preview = await serveBooth(new Request('https://portal.example/scripts/booth-preview.js'), env);
    expect(await preview.text()).toContain("import('../blocks/report-ai-visibility/rav-core.js?v=booth-preview-bars-1')");
  });

  it('keeps only bounded cosmetic setup parameters through staff login, never an arbitrary target', async () => {
    const setup = new URL('https://portal.example/booth');
    setup.searchParams.set('heading', '  Amplify your brand visibility  ');
    setup.searchParams.set('brand', 'semrush');
    setup.searchParams.set('redirect', 'https://untrusted.example');
    setup.searchParams.set('token', 'test-only-token');
    setup.searchParams.set('step', 'finish');
    const response = await serveBooth(new Request(setup), env);
    const login = new URL(response.headers.get('Location'), setup);
    const target = new URL(login.searchParams.get('redirect'), setup);
    expect(login.pathname).toBe('/login');
    expect(login.searchParams.has('staff')).toBe(true);
    expect(target.pathname).toBe('/booth');
    expect([...target.searchParams]).toEqual([
      ['heading', 'Amplify your brand visibility'],
      ['brand', 'semrush'],
    ]);
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it.each([
    ['heading', '<script>untrusted</script>'],
    ['heading', 'Invisible\u202eheading'],
    ['heading', 'word\u0001word'],
    ['heading', '\nHeading'],
    ['heading', 'Zero\u200bwidth'],
    ['heading', 'Line\u2028separator'],
    ['heading', 'a'.repeat(81)],
    ['heading', '   '],
    ['brand', 'untrusted'],
  ])('drops invalid %s without copying its value into the login target', async (name, value) => {
    const setup = new URL('https://portal.example/booth');
    setup.searchParams.set(name, value);
    const response = await serveBooth(new Request(setup), env);
    expect(response.headers.get('Location')).toBe('/login?staff&redirect=%2Fbooth');
  });

  it('rejects duplicate cosmetic values and counts Unicode code points rather than UTF-16 units', async () => {
    const duplicate = await serveBooth(new Request('https://portal.example/booth?heading=One&heading=Two&brand=adobe&brand=semrush'), env);
    expect(duplicate.headers.get('Location')).toBe('/login?staff&redirect=%2Fbooth');
    const setup = new URL('https://portal.example/booth');
    const heading = '\u{1f310}'.repeat(80);
    setup.searchParams.set('heading', heading);
    const response = await serveBooth(new Request(setup), env);
    const login = new URL(response.headers.get('Location'), setup);
    expect(new URL(login.searchParams.get('redirect'), setup).searchParams.get('heading')).toBe(heading);
  });

  it('injects only an authorized successful HTML report with exact selected pathname', async () => {
    const transform = vi.fn((response) => response);
    const injected = [];
    class Rewriter {
      on(selector, handler) {
        handler.element({
          prepend: (value) => injected.push([selector, value]),
          append: () => {},
          getAttribute: () => '',
          setAttribute: (name, value) => injected.push([name, value]),
        });
        return this;
      }

      transform(response) { return transform(response); }
    }
    vi.stubGlobal('HTMLRewriter', Rewriter);
    const content = () => new Response('<main>Unchanged report</main>', { headers: { 'Content-Type': 'text/html' } });
    const request = (path) => new Request(`https://portal.example${path}`, { headers: { Cookie: cookie } });
    const response = await injectBoothReturn(content(), request(selectedPath), env);
    expect(transform).toHaveBeenCalledTimes(1);
    expect(injected[0]).toEqual(['class', 'booth-report-pending']);
    expect(injected[1][0]).toBe('head');
    expect(injected[1][1]).toContain('display: none !important');
    expect(injected[1][1]).toContain('data-booth-mode="report"');
    expect(injected[1][1]).toMatch(/data-booth-expires-at="\d{13}"/);
    expect(injected[1][1]).toContain('/scripts/booth-report.js?v=booth-controls-1');
    expect(injected[1][1]).toContain('.booth-loading.booth-loading-overlay');
    expect(await readFile(new URL('../../../../scripts/lazy.js', import.meta.url), 'utf8'))
      .toContain("import('./booth-report.js?v=booth-controls-1')");
    expect(injected[2][1]).toContain('Opening your report...');
    expect(injected[2][1]).toContain('class="booth-recovery-actions" hidden');
    expect(injected[2][1]).toContain('/booth?recover=1');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.text()).toBe('<main>Unchanged report</main>');
    await injectBoothReturn(content(), request('/accounts/o/other/'), env);
    await injectBoothReturn(new Response(null, { status: 403 }), request(selectedPath), env);
    await injectBoothReturn(content(), new Request(`https://portal.example${selectedPath}`), env);
    expect(transform).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('adds demo controls only on an exact, live, explicitly initialized booth device', async () => {
    const append = vi.fn();
    function PublicRewriter() {
      this.on = (_selector, handler) => {
        handler.element({ prepend: append, append: () => {}, getAttribute: () => '', setAttribute: () => {} });
        return this;
      };
      this.transform = (response) => response;
    }
    vi.stubGlobal('HTMLRewriter', PublicRewriter);
    try {
      const withDevice = cookie;
      const withoutDevice = cookie.replace(/;\s*booth_device=[^;]+/, '');
      let context;
      env.BOOTH_COORDINATOR.get = () => ({ fetch: async () => new Response(JSON.stringify(context), { headers: { 'Content-Type': 'application/json' } }) });
      const content = () => new Response('<main>Public page</main>', { headers: { 'Content-Type': 'text/html' } });
      for (const mode of ['demo']) {
        const path = mode === 'demo' ? '/example-report/luma/' : '/request-report';
        context = { state: mode, selectedPath: path, demoId: 'luma', expiresAt: Date.now() + 600000 };
        await injectBoothReturn(content(), new Request(`https://portal.example${path}`, { headers: { Cookie: withoutDevice } }), env);
        expect(append).not.toHaveBeenCalled();
        const enhanced = await injectBoothReturn(content(), new Request(`https://portal.example${path}`, { headers: { Cookie: withDevice } }), env);
        expect(append.mock.calls[0][0]).toContain(`data-booth-mode="${mode}"`);
        expect(enhanced.headers.get('Cache-Control')).toBe('private, no-store');
        append.mockClear();
        await injectBoothReturn(content(), new Request('https://portal.example/example-report/carvelo/', { headers: { Cookie: withDevice } }), env);
        expect(append).not.toHaveBeenCalled();
        context.expiresAt = 1;
        await injectBoothReturn(content(), new Request(`https://portal.example${path}`, { headers: { Cookie: withDevice } }), env);
        expect(append).not.toHaveBeenCalled();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Digital Opportunity Report review naming', () => {
  const design = new URL('../../../../docs/implementations/booth-access/design/', import.meta.url);

  it('uses the canonical report name in the legacy preview and touchscreen reviewer', async () => {
    const [preview, review] = await Promise.all([
      readFile(new URL('booth-preview.html', design), 'utf8'),
      readFile(new URL('touchscreen-review.html', design), 'utf8'),
    ]);
    expect(preview).toContain('<title>Digital Opportunity Report / booth preview</title>');
    expect(preview).toContain('<div class="eyebrow">Digital Opportunity Report</div>');
    expect(preview).toContain('<span>Adobe Brand Visibility</span>');
    expect(preview).toContain('data-brand="adobe"');
    expect(preview).not.toMatch(/brand\s+visibility\s+report/i);
    expect(review).toContain('<title>Digital Opportunity Report | Touchscreen review</title>');
    expect(review).toContain('<strong>Digital Opportunity Report · Touchscreen review</strong>');
    expect(review).toContain('title="Interactive Digital Opportunity Report booth preview"');
    expect(review).not.toMatch(/brand\s+visibility\s+report/i);
  });

  it('exports the legacy preview with canonical naming and embedded assets', async () => {
    const destination = resolve('.booth-naming-review.html');
    try {
      execFileSync(execPath, [
        fileURLToPath(new URL('export-touchscreen-review.mjs', design)), destination,
      ]);
      const exported = await readFile(destination, 'utf8');
      expect(exported).toContain('<title>Digital Opportunity Report | Shareable touchscreen review</title>');
      expect(exported).toContain('title="Interactive Digital Opportunity Report booth preview" srcdoc="');
      expect(exported).toContain('&lt;div class=&quot;eyebrow&quot;&gt;Digital Opportunity Report&lt;/div&gt;');
      expect(exported).toContain('&lt;span&gt;Adobe Brand Visibility&lt;/span&gt;');
      expect(exported).toContain('data:image/svg+xml;base64,');
      expect(exported).toContain('data:image/png;base64,');
      expect(exported).not.toContain('preview.src =');
      expect(exported).not.toMatch(/brand\s+visibility\s+report/i);
    } finally {
      await unlink(destination).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  });
});

describe('production booth stylesheet packaging', () => {
  it('includes exact loading CSS as a text module in the real Wrangler bundle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'booth-css-bundle-'));
    const worker = fileURLToPath(new URL('../', import.meta.url));
    try {
      execFileSync(execPath, [
        resolve(worker, 'node_modules/wrangler/bin/wrangler.js'),
        'deploy', '--env', 'summit', '--dry-run', '--outdir', directory,
      ], { cwd: worker, timeout: 60000 });
      const files = await readdir(directory);
      const stylesheet = files.find((name) => name.endsWith('-booth-loading.css'));
      expect(stylesheet, 'Loading CSS must be a Wrangler Text asset, not an empty CSS-module object').toBeDefined();
      const source = await readFile(new URL('../../../../styles/booth-loading.css', import.meta.url), 'utf8');
      expect(await readFile(join(directory, stylesheet), 'utf8')).toBe(source);
      expect(await readFile(join(directory, 'index.js'), 'utf8')).toContain(stylesheet);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 70000);
});
