import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    expect(html).not.toContain('send-demo');
    expect(html).not.toContain('jordan@');
    expect(html).not.toContain('Design review controls');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('bundles the actual source assets and leaves every other origin route alone', async () => {
    for (const path of ['/scripts/booth.js', '/scripts/booth-report.js', '/styles/booth.css', '/styles/booth-report.css']) {
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
    for (const path of ['/scripts/booth-report.js?v=portrait-1', '/styles/booth-report.css']) {
      const response = await serveBooth(new Request(`https://portal.example${path}`), env);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
    }
    const unchanged = await serveBooth(new Request('https://portal.example/scripts/booth.js'), env);
    expect(unchanged.headers.has('Cache-Control')).toBe(false);
  });

  it('injects only an authorized successful HTML report with exact selected pathname', async () => {
    const transform = vi.fn((response) => response);
    class Rewriter {
      on(selector, handler) {
        const append = vi.fn();
        handler.element({ append });
        expect(selector).toBe('body');
        expect(append.mock.calls[0][0]).toContain('/scripts/booth-report.js?v=portrait-1');
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
