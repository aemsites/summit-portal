/* global HTMLRewriter */
/* eslint-disable import/no-relative-packages */
import shell from '../../../../booth.html';
import runtime from '../../../../scripts/booth.js';
import report from '../../../../scripts/booth-report.js';
import presentation from '../../../../scripts/booth-presentation.js';
import preview from '../../../../scripts/booth-preview.js';
import keyboard from '../../../../scripts/booth-keyboard.js';
import sessionRuntime from '../../../../scripts/booth-session.js';
import hero from '../../../../blocks/report-hero/report-hero.js';
import stats from '../../../../blocks/report-stats/report-stats.js';
import carousel from '../../../../blocks/report-carousel/report-carousel.js';
import visibility from '../../../../blocks/report-ai-visibility/rav-core.js';
import carouselCss from '../../../../blocks/report-carousel/report-carousel.css';
import visibilityCss from '../../../../blocks/report-ai-visibility/report-ai-visibility.css';
import css from '../../../../styles/booth.css';
import reportCss from '../../../../styles/booth-report.css';
import keyboardCss from '../../../../styles/booth-keyboard.css';
import loadingCss from '../../../../styles/booth-loading.css';
import arrow from '../../../../img/booth/action-arrow.svg';
import finishIcon from '../../../../img/booth/finish-open-in.svg';
import wordmark from '../../../../img/booth/adobe-wordmark.svg';
import finalGlow from '../../../../img/booth/entry-final-glow.svg';
import finishGlow from '../../../../img/booth/finish-glow.svg';
import finalWebpage from '../../../../img/booth/entry-final-webpage.png';
import pickerArtwork from '../../../../img/booth/picker-artwork.png';
import pickerAmazon from '../../../../img/booth/picker-amazon.svg';
import pickerUnity from '../../../../img/booth/picker-unity.svg';
import globe from '../../../../img/icons/globe.svg';
import carveloIcon from '../../../../img/booth/industry-carvelo.svg';
import frescopaIcon from '../../../../img/booth/industry-frescopa.svg';
import securfinancialIcon from '../../../../img/booth/industry-securfinancial.svg';
import hallibyIcon from '../../../../img/booth/industry-halliby.svg';
import healthcareIcon from '../../../../img/booth/industry-we-healthcare.svg';
import binjiIcon from '../../../../img/booth/industry-binji.svg';
import bodeaIcon from '../../../../img/booth/industry-bodea.svg';
import lumaIcon from '../../../../img/booth/industry-luma.svg';
import citisignalIcon from '../../../../img/booth/industry-citisignal.svg';
import wkndIcon from '../../../../img/booth/industry-wknd-fly.svg';
import { boothStaff, authorizeBoothContext } from './booth.js';
import {
  hasBoothBoundary,
  getBoothBootstrapStaff,
  boothSessionCookies,
  clearSessionCookie,
} from './session.js';
import { findBoothDemo } from './booth-demos.js';

const assets = new Map([
  ['/scripts/booth.js', [runtime, 'text/javascript']],
  ['/scripts/booth-report.js', [report, 'text/javascript']],
  ['/scripts/booth-presentation.js', [presentation, 'text/javascript']],
  ['/scripts/booth-preview.js', [preview, 'text/javascript']],
  ['/scripts/booth-keyboard.js', [keyboard, 'text/javascript']],
  ['/scripts/booth-session.js', [sessionRuntime, 'text/javascript']],
  ['/blocks/report-hero/report-hero.js', [hero, 'text/javascript']],
  ['/blocks/report-stats/report-stats.js', [stats, 'text/javascript']],
  ['/blocks/report-carousel/report-carousel.js', [carousel, 'text/javascript']],
  ['/blocks/report-ai-visibility/rav-core.js', [visibility, 'text/javascript']],
  ['/blocks/report-carousel/report-carousel.css', [carouselCss, 'text/css']],
  ['/blocks/report-ai-visibility/report-ai-visibility.css', [visibilityCss, 'text/css']],
  ['/styles/booth.css', [css, 'text/css']],
  ['/styles/booth-report.css', [reportCss, 'text/css']],
  ['/styles/booth-keyboard.css', [keyboardCss, 'text/css']],
  ['/styles/booth-loading.css', [loadingCss, 'text/css']],
  ['/img/booth/action-arrow.svg', [arrow, 'image/svg+xml']],
  ['/img/booth/finish-open-in.svg', [finishIcon, 'image/svg+xml']],
  ['/img/booth/adobe-wordmark.svg', [wordmark, 'image/svg+xml']],
  ['/img/booth/entry-final-glow.svg', [finalGlow, 'image/svg+xml']],
  ['/img/booth/finish-glow.svg', [finishGlow, 'image/svg+xml']],
  ['/img/booth/entry-final-webpage.png', [finalWebpage, 'image/png']],
  ['/img/booth/picker-artwork.png', [pickerArtwork, 'image/png']],
  ['/img/booth/picker-amazon.svg', [pickerAmazon, 'image/svg+xml']],
  ['/img/booth/picker-unity.svg', [pickerUnity, 'image/svg+xml']],
  ['/img/icons/globe.svg', [globe, 'image/svg+xml']],
  ['/img/booth/industry-carvelo.svg', [carveloIcon, 'image/svg+xml']],
  ['/img/booth/industry-frescopa.svg', [frescopaIcon, 'image/svg+xml']],
  ['/img/booth/industry-securfinancial.svg', [securfinancialIcon, 'image/svg+xml']],
  ['/img/booth/industry-halliby.svg', [hallibyIcon, 'image/svg+xml']],
  ['/img/booth/industry-we-healthcare.svg', [healthcareIcon, 'image/svg+xml']],
  ['/img/booth/industry-binji.svg', [binjiIcon, 'image/svg+xml']],
  ['/img/booth/industry-bodea.svg', [bodeaIcon, 'image/svg+xml']],
  ['/img/booth/industry-luma.svg', [lumaIcon, 'image/svg+xml']],
  ['/img/booth/industry-citisignal.svg', [citisignalIcon, 'image/svg+xml']],
  ['/img/booth/industry-wknd-fly.svg', [wkndIcon, 'image/svg+xml']],
]);

function returnToBooth() {
  return new Response(null, { status: 302, headers: { Location: '/booth', 'Cache-Control': 'private, no-store' } });
}

function isSharedAsset(path) {
  return assets.has(path)
    || /^\/(?:scripts|styles|blocks)\/[a-zA-Z0-9_./-]+\.(?:js|css)$/.test(path)
    || /^\/(?:fonts|styles\/fonts)\/[a-zA-Z0-9_./-]+\.(?:woff2?|otf|ttf)$/.test(path)
    || /^\/(?:icons|img)\/[a-zA-Z0-9_./-]+\.(?:svg|png|jpe?g|webp|gif|avif)$/.test(path)
    || ['/favicon.ico', '/nav', '/nav.plain.html', '/footer', '/footer.plain.html'].includes(path);
}

function allowedContextPath(path, context) {
  if (!context) return false;
  const selected = context.selectedPath;
  if (!['report', 'demo'].includes(context.state) || !selected) return false;
  if (context.state === 'demo' && findBoothDemo(context.demoId)?.path !== selected) return false;
  if (path === selected) return true;
  if (path === selected.replace(/\/$/, '')) return true;
  // Only display dependencies, never HTML/JSON/Markdown/CSV/PDF/export variants.
  return path.startsWith(selected)
    && /^[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp|gif|avif|svg|css|js)$/.test(path.slice(selected.length));
}

export function isBoothSharedAsset(path) {
  return isSharedAsset(path);
}

function recoveryPage(headers) {
  return new Response(`<!doctype html><html><head><title>Booth recovery</title></head><body>
<main><h1>Reset this booth visit</h1><p>No company content is shown here.</p>
<button id="reset" type="button">Clear visit and return to entry</button><p id="result" role="status"></p>
<noscript>Ask staff to enable JavaScript and reset this visit. Do not reopen the report.</noscript></main>
<script>document.getElementById('reset').onclick=async function(){this.disabled=true;try{
const r=await fetch('/auth/booth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
if(!r.ok||(await r.json()).state!=='entry')throw Error();
location.replace('/booth');
}catch{document.getElementById('result').textContent='Reset could not be confirmed. Ask staff for help.';this.disabled=false;}};</script>
</body></html>`, { headers });
}

export async function serveBooth(request, env) {
  const { pathname } = new URL(request.url);
  const asset = assets.get(pathname);
  if (asset) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    const headers = { 'Content-Type': asset[1], 'X-Content-Type-Options': 'nosniff' };
    if (pathname.startsWith('/img/booth/') || ['/scripts/booth.js', '/scripts/booth-preview.js', '/blocks/report-ai-visibility/rav-core.js', '/styles/booth.css', '/scripts/booth-report.js', '/styles/booth-report.css', '/scripts/booth-keyboard.js', '/scripts/booth-session.js', '/styles/booth-keyboard.css', '/styles/booth-loading.css'].includes(pathname)) {
      headers['Cache-Control'] = 'no-cache';
    }
    return new Response(request.method === 'HEAD' ? null : asset[0], { headers });
  }
  if (pathname !== '/booth') return null;
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const scoped = await boothStaff(request, env);
  const session = scoped || await getBoothBootstrapStaff(request, env);
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  });
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
    if (new URL(request.url).searchParams.has('recover')) {
      return recoveryPage(headers);
    }
    const redirect = encodeURIComponent(`${setup.pathname}${setup.search}`);
    return new Response(null, { status: 302, headers: { Location: `/login?staff&redirect=${redirect}`, 'Cache-Control': 'private, no-store' } });
  }
  if (!scoped) {
    (await boothSessionCookies(session, env)).forEach((cookie) => headers.append('Set-Cookie', cookie));
  } else headers.append('Set-Cookie', clearSessionCookie());
  if (new URL(request.url).searchParams.has('recover')) return recoveryPage(headers);
  return new Response(shell, { headers });
}

/** Central kiosk allowlist, before ANY private representation or privileged route. */
export async function protectBoothDocument(request, env) {
  if (!hasBoothBoundary(request)) return null;
  const url = new URL(request.url);
  const { pathname } = url;
  if (url.searchParams.has('token') || pathname.includes('%') || pathname.includes('\\')) return returnToBooth();
  if (['/booth', '/login', '/auth/logout', '/auth/me', '/auth/portal', '/auth/callback', '/auth/staff-login'].includes(pathname)
    || pathname.startsWith('/auth/booth/')) return null;
  if (pathname === '/api/report-requests' && request.method === 'POST') {
    return returnToBooth();
  }
  if (pathname === '/auth/sharelink') {
    return new Response('Booth browsers cannot share arbitrary reports', {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  if (!['GET', 'HEAD'].includes(request.method)) return returnToBooth();
  if (isSharedAsset(pathname)) return null;
  if (!await boothStaff(request, env)) return returnToBooth();
  try {
    const context = await authorizeBoothContext(request, env);
    // Hashed EDS media is a public rendering dependency, not a document/index.
    const media = /^\/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\.(?:png|jpe?g|webp|gif|avif|svg)$/.test(pathname);
    if (context?.state === 'report' && context.resourceAuthorized !== true) return returnToBooth();
    return allowedContextPath(pathname, context) || (media && context) ? null : returnToBooth();
  } catch {
    // eslint-disable-next-line no-console
    console.error('[booth] Request authorization unavailable');
    return new Response('Booth state cannot be checked. Return to /booth or ask staff.', { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

export async function injectBoothReturn(response, request, env) {
  if (!hasBoothBoundary(request) || !response.ok || !response.headers.get('Content-Type')?.includes('text/html')) return response;
  if (isSharedAsset(new URL(request.url).pathname) || new URL(request.url).pathname === '/login') return response;
  const context = await authorizeBoothContext(request, env);
  if (!context || !allowedContextPath(new URL(request.url).pathname, context)
    || context.selectedPath !== new URL(request.url).pathname) return returnToBooth();
  if (request.method === 'HEAD') return new Response(null, response);
  const privateResponse = new Response(response.body, response);
  privateResponse.headers.set('Cache-Control', 'private, no-store');
  const marked = { html: false, head: false, body: false };
  const transformed = new HTMLRewriter().on('html', {
    element(element) {
      marked.html = true;
      element.setAttribute('class', `${element.getAttribute('class') || ''} booth-report-pending`.trim());
    },
  }).on('head', {
    element(element) {
      marked.head = true;
      element.prepend(`<style id="booth-report-concealment">
${loadingCss}
html:is(.booth-report-pending,.booth-report-clearing) body { zoom: 1 !important; }
html:is(.booth-report-pending,.booth-report-clearing) body > :not(#booth-recovery):not(noscript),
html:is(.booth-report-pending,.booth-report-clearing) body > :not(#booth-recovery):not(noscript) * { visibility: hidden !important; pointer-events: none !important; }
html.booth-report-pending:not(.booth-report-clearing) #booth-report-content[hidden] { display: block !important; }
html.booth-report-clearing body > :not(#booth-return):not(#booth-recovery):not(noscript) { display: none !important; }
html:not(.booth-report-pending):not(.booth-report-clearing) #booth-recovery { display: none; }
html:not(.booth-report-pending):not(.booth-report-clearing) #booth-report-content { display: block !important; }
</style><noscript><style>.booth-loading-overlay { display: none !important; }</style></noscript><script type="module" data-booth-mode="${context.state}" data-booth-expires-at="${context.expiresAt}" src="/scripts/booth-report.js?v=booth-transitions-1"></script>`, { html: true });
    },
  }).on('body', {
    element(element) {
      marked.body = true;
      element.prepend('<aside id="booth-recovery"><div class="booth-loading booth-loading-overlay" data-booth-loading role="status"><span class="booth-loading-ring" aria-hidden="true"></span><p class="booth-loading-title">Opening your report...</p></div><div class="booth-recovery-actions" hidden><button type="button" data-booth-recover>Retry and clear screen</button> If this screen does not recover, <a href="/booth?recover=1">return to booth recovery</a> and ask staff to reset the visit.</div></aside><noscript>This booth requires JavaScript. Company content stays concealed. Ask staff to reset this visit on the booth entry screen.</noscript><div id="booth-report-content" hidden>', { html: true });
      element.append('</div>', { html: true });
    },
  })
    .transform(privateResponse);
  // Do not stream any company bytes until the early concealment really exists.
  const html = await transformed.text();
  if (!Object.values(marked).every(Boolean)) {
    return new Response('This report cannot be safely displayed. Return to /booth?recover=1 and ask staff.', {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  const current = await authorizeBoothContext(request, env);
  if (!current || current.state !== context.state || current.selectedPath !== context.selectedPath
    || current.expiresAt !== context.expiresAt) return returnToBooth();
  return new Response(html, transformed);
}
