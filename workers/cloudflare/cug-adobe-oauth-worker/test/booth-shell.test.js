import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { serveBooth, injectBoothReturn } from '../src/booth-shell.js';
import { createMockEnv } from './helpers.js';
import { createSession } from '../src/session.js';

describe('bundled booth shell and exact report injection', () => {
  let env;
  let cookie;
  const selectedPath = '/accounts/e/example/insights/example-com/portal-landing/';

  beforeEach(async () => {
    env = createMockEnv();
    cookie = `auth_token=${await createSession(env, { email: 'operator@adobe.com', method: 'oauth' })}; booth_context=00000000-0000-4000-8000-000000000000`;
    env.BOOTH_COORDINATOR = {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => new Response(JSON.stringify({ selectedPath }), { headers: { 'Content-Type': 'application/json' } }) }),
    };
  });

  it('redirects unauthenticated shell to existing staff login and serves staff HTML without mock handlers', async () => {
    const anonymous = await serveBooth(new Request('https://portal.example/booth'), env);
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get('Location')).toBe('/login?staff&redirect=%2Fbooth');
    const response = await serveBooth(new Request('https://portal.example/booth', { headers: { Cookie: cookie } }), env);
    const html = await response.text();
    expect(html).toContain('/scripts/booth.js');
    expect(html).toContain('Adobe Brand Visibility');
    expect(html).toContain('<title>Digital Opportunity Report / booth</title>');
    expect(html).toContain('<div class="eyebrow">Digital Opportunity Report</div>');
    expect(html).not.toMatch(/brand\s+visibility\s+report/i);
    expect(html).not.toContain('send-demo');
    expect(html).not.toContain('jordan@');
    expect(html).not.toContain('Design review controls');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('bundles the actual source assets and leaves every other origin route alone', async () => {
    for (const path of ['/scripts/booth.js', '/scripts/booth-report.js', '/scripts/booth-presentation.js', '/styles/booth.css', '/styles/booth-report.css']) {
      const response = await serveBooth(new Request(`https://portal.example${path}`), env);
      expect(response.status).toBe(200);
      expect((await response.text()).length).toBeGreaterThan(1000);
    }
    expect(await serveBooth(new Request('https://portal.example/'), env)).toBeNull();
    expect(await serveBooth(new Request('https://portal.example/login'), env)).toBeNull();
    expect(await serveBooth(new Request('https://portal.example/scripts/ak.js'), env)).toBeNull();
    expect((await serveBooth(new Request('https://portal.example/booth', { method: 'POST' }), env)).status).toBe(405);
  });

  it('revalidates only the report adapter/assets and serves its versioned URL', async () => {
    for (const path of ['/scripts/booth-report.js?v=booth-activity-1', '/styles/booth-report.css']) {
      const response = await serveBooth(new Request(`https://portal.example${path}`), env);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
    }
    const unchanged = await serveBooth(new Request('https://portal.example/scripts/booth.js'), env);
    expect(unchanged.headers.has('Cache-Control')).toBe(false);
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
    class Rewriter {
      on(selector, handler) {
        const append = vi.fn();
        handler.element({ append });
        expect(selector).toBe('body');
        expect(append.mock.calls[0][0]).toContain('/scripts/booth-report.js?v=booth-activity-1');
        return { transform };
      }
    }
    vi.stubGlobal('HTMLRewriter', Rewriter);
    const content = () => new Response('<main>Unchanged report</main>', { headers: { 'Content-Type': 'text/html' } });
    const request = (path) => new Request(`https://portal.example${path}`, { headers: { Cookie: cookie } });
    const response = await injectBoothReturn(content(), request(selectedPath), env);
    expect(transform).toHaveBeenCalledTimes(1);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.text()).toBe('<main>Unchanged report</main>');
    await injectBoothReturn(content(), request('/accounts/o/other/'), env);
    await injectBoothReturn(new Response(null, { status: 403 }), request(selectedPath), env);
    await injectBoothReturn(content(), new Request(`https://portal.example${selectedPath}`), env);
    expect(transform).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
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
    const directory = await mkdtemp(join(tmpdir(), 'booth-naming-'));
    const destination = join(directory, 'review.html');
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
      await rmdir(directory);
    }
  });
});
