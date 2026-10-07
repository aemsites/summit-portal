/* global HTMLRewriter */
/* eslint-disable import/no-relative-packages */
import shell from '../../../../booth.html';
import runtime from '../../../../scripts/booth.js';
import report from '../../../../scripts/booth-report.js';
import presentation from '../../../../scripts/booth-presentation.js';
import preview from '../../../../scripts/booth-preview.js';
import keyboard from '../../../../scripts/booth-keyboard.js';
import hero from '../../../../blocks/report-hero/report-hero.js';
import stats from '../../../../blocks/report-stats/report-stats.js';
import carousel from '../../../../blocks/report-carousel/report-carousel.js';
import visibility from '../../../../blocks/report-ai-visibility/rav-core.js';
import carouselCss from '../../../../blocks/report-carousel/report-carousel.css';
import visibilityCss from '../../../../blocks/report-ai-visibility/report-ai-visibility.css';
import css from '../../../../styles/booth.css';
import reportCss from '../../../../styles/booth-report.css';
import keyboardCss from '../../../../styles/booth-keyboard.css';
import arrow from '../../../../img/booth/action-arrow.svg';
import finishIcon from '../../../../img/booth/finish-open-in.svg';
import webpageGlow from '../../../../img/booth/entry-webpage-glow.svg';
import webpage from '../../../../img/booth/entry-webpage.png';
import { boothStaff, handleBooth, hasBoothDevice, boothDeviceAuthorized, boothDeviceCookie } from './booth.js';
import { findBoothDemo } from './booth-demos.js';

const assets = new Map([
  ['/scripts/booth.js', [runtime, 'text/javascript']],
  ['/scripts/booth-report.js', [report, 'text/javascript']],
  ['/scripts/booth-presentation.js', [presentation, 'text/javascript']],
  ['/scripts/booth-preview.js', [preview, 'text/javascript']],
  ['/scripts/booth-keyboard.js', [keyboard, 'text/javascript']],
  ['/blocks/report-hero/report-hero.js', [hero, 'text/javascript']],
  ['/blocks/report-stats/report-stats.js', [stats, 'text/javascript']],
  ['/blocks/report-carousel/report-carousel.js', [carousel, 'text/javascript']],
  ['/blocks/report-ai-visibility/rav-core.js', [visibility, 'text/javascript']],
  ['/blocks/report-carousel/report-carousel.css', [carouselCss, 'text/css']],
  ['/blocks/report-ai-visibility/report-ai-visibility.css', [visibilityCss, 'text/css']],
  ['/styles/booth.css', [css, 'text/css']],
  ['/styles/booth-report.css', [reportCss, 'text/css']],
  ['/styles/booth-keyboard.css', [keyboardCss, 'text/css']],
  ['/img/booth/action-arrow.svg', [arrow, 'image/svg+xml']],
  ['/img/booth/finish-open-in.svg', [finishIcon, 'image/svg+xml']],
  ['/img/booth/entry-webpage-glow.svg', [webpageGlow, 'image/svg+xml']],
  ['/img/booth/entry-webpage.png', [webpage, 'image/png']],
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
    if (['/scripts/booth.js', '/styles/booth.css', '/scripts/booth-report.js', '/styles/booth-report.css', '/scripts/booth-keyboard.js', '/styles/booth-keyboard.css'].includes(pathname)) {
      headers['Cache-Control'] = 'no-cache';
    }
    return new Response(request.method === 'HEAD' ? null : asset[0], { headers });
  }
  if (pathname !== '/booth') return null;
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const session = await boothStaff(request, env);
  if (!session) {
    const setup = new URL('/booth', request.url);
    const params = new URL(request.url).searchParams;
    const headings = params.getAll('heading');
    const heading = headings.length === 1 ? headings[0].trim() : '';
    const invalidHeading = params.has('heading') && (headings.length !== 1 || !heading
      || [...heading].length > 80 || /[\p{C}\p{Zl}\p{Zp}<>]/u.test(headings[0] || ''));
    if (params.has('heading') && !invalidHeading) setup.searchParams.set('heading', heading);
    const brands = params.getAll('brand');
    const invalidBrand = params.has('brand') && (brands.length !== 1 || !['adobe', 'semrush'].includes(brands[0]));
    if (params.has('brand') && !invalidBrand) setup.searchParams.set('brand', brands[0]);
    if (invalidHeading || invalidBrand) {
      // eslint-disable-next-line no-console
      console.warn('[booth] Ignored invalid presentation parameters on staff login redirect');
    }
    const redirect = encodeURIComponent(`${setup.pathname}${setup.search}`);
    return new Response(null, { status: 302, headers: { Location: `/login?staff&redirect=${redirect}`, 'Cache-Control': 'private, no-store' } });
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
  const publicBoothPage = (context.state === 'demo'
    && findBoothDemo(context.demoId)?.path === context.selectedPath)
    || (context.state === 'request' && context.selectedPath === '/request-report');
  if (!isAccountDocument(request) && !publicBoothPage) return response;
  if (publicBoothPage && !await boothDeviceAuthorized(request, env)) return response;
  const expiredContext = !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now();
  if (context.selectedPath !== new URL(request.url).pathname
    || ((protectedDevice || publicBoothPage) && expiredContext)) {
    return protectedDevice ? returnToBooth() : response;
  }
  const privateResponse = new Response(response.body, response);
  privateResponse.headers.set('Cache-Control', 'private, no-store');
  return new HTMLRewriter().on('body', {
    element(element) {
      const mode = publicBoothPage ? ` data-booth-mode="${context.state}"` : '';
      element.append(`<script type="module"${mode} src="/scripts/booth-report.js?v=booth-activity-1"></script>`, { html: true });
    },
  }).transform(privateResponse);
}
