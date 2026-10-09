import {
  describe, it, expect, vi, beforeAll, afterAll,
} from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { createMockEnv, createMockBoothCookie } from './helpers.js';

describe('real workerd early HTML concealment', () => {
  let runtime;
  let cookie;
  const path = '/accounts/e/example/insights/example-com/portal-landing/';

  beforeAll(async () => {
    // Workerd scratch files must stay in this checkout, never the OS temp folder.
    vi.stubEnv('TMPDIR', process.cwd());
    const env = createMockEnv();
    cookie = `${await createMockBoothCookie(env)}; booth_context=00000000-0000-4000-8000-000000000000`;
    const bundle = await build({
      entryPoints: [resolve('src/booth-shell.js')],
      bundle: true,
      write: false,
      format: 'esm',
      plugins: [{
        name: 'fixture-only-booth-assets',
        setup(builder) {
          builder.onLoad({ filter: /\/(?:booth(?:-touchscreen)?\.html|scripts\/booth[^/]*\.js|styles\/booth[^/]*\.css|blocks\/report-[^/]+\/[^/]+\.(?:js|css)|img\/booth\/[^/]+|img\/icons\/globe\.svg)$/ }, async ({ path: asset }) => ({
            contents: `export default ${JSON.stringify(await readFile(asset, 'utf8'))};`,
            loader: 'js',
          }));
        },
      }],
    });
    const expiresAt = Date.now() + 600000;
    runtime = new Miniflare({
      modules: true,
      compatibilityDate: '2026-09-01',
      script: `${bundle.outputFiles[0].text}
export default {async fetch(request){
const mode=new URL(request.url).searchParams.get('mode')||'report';
const selected=mode==='demo'?'/example-report/luma/':mode==='request'?'/request-report':'${path}';
const context={state:mode,selectedPath:selected,demoId:'luma',expiresAt:${expiresAt}};
const env={JWT_SECRET:'test-jwt-secret',BOOTH_COORDINATOR:{idFromName:id=>id,get:()=>({fetch:async()=>Response.json(context)})}};
const source=new URL(request.url).searchParams.has('malformed')?'<main>Fixture private company</main>':'<!doctype html><html><head><title>Report</title></head><body><main>Fixture private company</main></body></html>';
const assets='<img src="${path}chart.png" srcset="${path}chart.png?width=100 100w, ${path}chart.png?width=200 200w"><source srcset="/media_${'a'.repeat(40)}.png?width=100 100w"><a href="/adobe/booth-guide">Guide</a>';
const html=new URL(request.url).searchParams.has('assets')?source.replace('</body>',assets+'</body>'):source;
return injectBoothReturn(new Response(html,{headers:{'Content-Type':'text/html'}}),request,env);
}}`,
    });
  }, 30000);

  afterAll(async () => {
    await runtime?.dispose();
    vi.unstubAllEnvs();
  });

  it.each([
    ['report', path], ['demo', '/example-report/luma/'],
  ])('conceals %s before company content and declares its exact mode and deadline', async (mode, selected) => {
    const response = await runtime.dispatchFetch(`https://portal.example${selected}?mode=${mode}&booth=1`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    const html = await response.text();
    const company = html.indexOf('Fixture private company');
    expect(html).toContain('<html class="booth-report-pending">');
    expect(html.indexOf('<style id="booth-report-concealment">')).toBeLessThan(company);
    expect(html.indexOf('data-booth-expires-at=')).toBeLessThan(company);
    expect(html).toContain(`data-booth-mode="${mode}"`);
    expect(html).toContain('<div id="booth-report-content" hidden><main>Fixture private company</main></div>');
    expect(html).toContain('<aside id="booth-recovery">');
    expect(html).toContain('<button type="button" data-booth-recover>Retry and clear screen</button>');
    expect(html).not.toContain('id="booth-return"');
    expect(html).toContain('/booth?recover=1');
    expect(html).toContain('<noscript>');
    expect(html).toContain('html:not(.booth-report-pending):not(.booth-report-clearing) #booth-report-content');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('refuses malformed origin HTML instead of exposing an unconcealed representation', async () => {
    const response = await runtime.dispatchFetch(`https://portal.example${path}?malformed=1&booth=1`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('Fixture private company');
  });

  it('marks selected rendering URLs without relying on referrers or marking ordinary guide links', async () => {
    const response = await runtime.dispatchFetch(`https://portal.example${path}?booth=1&assets=1`, { headers: { Cookie: cookie } });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(`src="${path}chart.png?booth=1"`);
    expect(html).toContain(`srcset="${path}chart.png?width=100&booth=1 100w, ${path}chart.png?width=200&booth=1 200w"`);
    expect(html).toContain(`/media_${'a'.repeat(40)}.png?width=100&booth=1 100w`);
    expect(html).toContain('href="/adobe/booth-guide"');
  });

  it('leaves ordinary report HTML untouched even with an active booth credential', async () => {
    const response = await runtime.dispatchFetch(`https://portal.example${path}`, { headers: { Cookie: cookie } });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).not.toContain('data-booth-mode');
    expect(html).not.toContain('booth-report-pending');
    expect(html).not.toContain('booth-return');
  });

  it('rejects the retired booth request document', async () => {
    const response = await runtime.dispatchFetch('https://portal.example/request-report?mode=request&booth=1', { headers: { Cookie: cookie }, redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/booth');
  });

  it('installs the presentation bridge before report modules only inside the authorized frame mode', async () => {
    const response = await runtime.dispatchFetch(`https://portal.example${path}?touchscreen=frame`, { headers: { Cookie: cookie } });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html.indexOf('booth-touchscreen-device.js')).toBeGreaterThan(0);
    expect(html.indexOf('booth-touchscreen-device.js')).toBeLessThan(html.indexOf('src="/scripts/booth-report.js'));
    expect(html).toContain('booth-report-pending');
    for (const query of ['', '?touchscreen=1', '?touchscreen=frame&touchscreen=frame']) {
      const ordinary = await runtime.dispatchFetch(`https://portal.example${path}${query}`, { headers: { Cookie: cookie } });
      expect(await ordinary.text()).not.toContain('booth-touchscreen-device.js');
    }
    const anonymous = await runtime.dispatchFetch(`https://portal.example${path}?touchscreen=frame`, { redirect: 'manual' });
    expect(await anonymous.text()).not.toContain('booth-touchscreen-device.js');
    const unrelated = await runtime.dispatchFetch('https://portal.example/accounts/o/other/?touchscreen=frame', { headers: { Cookie: cookie }, redirect: 'manual' });
    expect(unrelated.status).toBe(302);
    expect(await unrelated.text()).not.toContain('Fixture private company');
  });
});
