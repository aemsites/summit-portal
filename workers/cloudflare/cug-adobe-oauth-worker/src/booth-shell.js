/* global HTMLRewriter */
/* eslint-disable import/no-relative-packages */
import shell from '../../../../booth.html';
import runtime from '../../../../scripts/booth.js';
import report from '../../../../scripts/booth-report.js';
import css from '../../../../styles/booth.css';
import reportCss from '../../../../styles/booth-report.css';
import { boothStaff, handleBooth, hasBoothDevice, boothDeviceAuthorized, boothDeviceCookie } from './booth.js';

const assets = new Map([
  ['/scripts/booth.js', [runtime, 'text/javascript']],
  ['/scripts/booth-report.js', [report, 'text/javascript']],
  ['/styles/booth.css', [css, 'text/css']],
  ['/styles/booth-report.css', [reportCss, 'text/css']],
]);

function returnToBooth() {
  return new Response(null, { status: 302, headers: { Location: '/booth', 'Cache-Control': 'private, no-store' } });
}

function isAccountDocument(request) {
  const { pathname } = new URL(request.url);
  return ['GET', 'HEAD'].includes(request.method) && pathname.startsWith('/accounts/')
    && (!pathname.split('/').pop().includes('.') || /\.html?$/i.test(pathname));
}

export async function serveBooth(request, env) {
  const { pathname } = new URL(request.url);
  const asset = assets.get(pathname);
  if (asset) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    const headers = { 'Content-Type': asset[1], 'X-Content-Type-Options': 'nosniff' };
    if (pathname === '/scripts/booth-report.js' || pathname === '/styles/booth-report.css') {
      headers['Cache-Control'] = 'no-cache';
    }
    return new Response(request.method === 'HEAD' ? null : asset[0], { headers });
  }
  if (pathname !== '/booth') return null;
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const session = await boothStaff(request, env);
  if (!session) {
    return new Response(null, { status: 302, headers: { Location: '/login?staff&redirect=%2Fbooth', 'Cache-Control': 'private, no-store' } });
  }
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  headers.append('Set-Cookie', await boothDeviceCookie(request, session, env));
  if (hasBoothDevice(request) && !await boothDeviceAuthorized(request, env)) {
    headers.append('Set-Cookie', 'booth_context=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  }
  return new Response(shell, { headers });
}

/** Constrain fresh account documents on an explicitly initialized booth device. */
export async function protectBoothDocument(request, env) {
  const { pathname } = new URL(request.url);
  if (!hasBoothDevice(request) || !isAccountDocument(request)) return null;
  if (!await boothDeviceAuthorized(request, env)) return returnToBooth();
  try {
    const status = await handleBooth(new Request(new URL('/auth/booth/status', request.url), { headers: { Cookie: request.headers.get('Cookie') } }), env);
    if (!status.ok) throw new Error('Booth status unavailable');
    const context = await status.json();
    if (context.state !== 'report' || context.selectedPath !== pathname
      || !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now()) {
      return returnToBooth();
    }
    return null;
  } catch {
    // eslint-disable-next-line no-console
    console.error('[booth] Account document state check unavailable');
    return new Response('Booth state cannot be checked. Return to /booth or ask staff.', { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

export async function injectBoothReturn(response, request, env) {
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) return response;
  const protectedDevice = hasBoothDevice(request) && isAccountDocument(request);
  if (!request.headers.get('Cookie')?.includes('booth_context=')
    || !await boothStaff(request, env)) {
    return protectedDevice ? returnToBooth() : response;
  }
  const status = await handleBooth(new Request(new URL('/auth/booth/status', request.url), { headers: { Cookie: request.headers.get('Cookie') } }), env);
  if (!status.ok) return protectedDevice ? returnToBooth() : response;
  const context = await status.json();
  const expiredContext = !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now();
  if (context.selectedPath !== new URL(request.url).pathname
    || (protectedDevice && expiredContext)) {
    return protectedDevice ? returnToBooth() : response;
  }
  const privateResponse = new Response(response.body, response);
  privateResponse.headers.set('Cache-Control', 'private, no-store');
  return new HTMLRewriter().on('body', {
    element(element) {
      element.append('<script type="module" src="/scripts/booth-report.js?v=portrait-1"></script>', { html: true });
    },
  }).transform(privateResponse);
}
