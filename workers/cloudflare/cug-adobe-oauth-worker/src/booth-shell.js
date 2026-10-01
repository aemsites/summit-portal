/* global HTMLRewriter */
/* eslint-disable import/no-relative-packages */
import shell from '../../../../booth.html';
import runtime from '../../../../scripts/booth.js';
import report from '../../../../scripts/booth-report.js';
import css from '../../../../styles/booth.css';
import { boothStaff, handleBooth } from './booth.js';

const assets = new Map([
  ['/scripts/booth.js', [runtime, 'text/javascript']],
  ['/scripts/booth-report.js', [report, 'text/javascript']],
  ['/styles/booth.css', [css, 'text/css']],
]);

export async function serveBooth(request, env) {
  const { pathname } = new URL(request.url);
  const asset = assets.get(pathname);
  if (asset) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    return new Response(request.method === 'HEAD' ? null : asset[0], { headers: { 'Content-Type': asset[1], 'X-Content-Type-Options': 'nosniff' } });
  }
  if (pathname !== '/booth') return null;
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  if (!await boothStaff(request, env)) {
    return new Response(null, { status: 302, headers: { Location: '/login?staff&redirect=%2Fbooth', 'Cache-Control': 'private, no-store' } });
  }
  return new Response(shell, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function injectBoothReturn(response, request, env) {
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')
    || !request.headers.get('Cookie')?.includes('booth_context=')
    || !await boothStaff(request, env)) return response;
  const status = await handleBooth(new Request(new URL('/auth/booth/status', request.url), { headers: { Cookie: request.headers.get('Cookie') } }), env);
  if (!status.ok) return response;
  const context = await status.json();
  if (context.selectedPath !== new URL(request.url).pathname) return response;
  const privateResponse = new Response(response.body, response);
  privateResponse.headers.set('Cache-Control', 'private, no-store');
  return new HTMLRewriter().on('body', {
    element(element) {
      element.append('<script type="module" src="/scripts/booth-report.js"></script>', { html: true });
    },
  }).transform(privateResponse);
}
