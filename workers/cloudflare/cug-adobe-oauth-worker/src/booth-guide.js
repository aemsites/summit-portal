/* eslint-disable import/no-relative-packages */
import shell from '../../../../booth-guide.html';
import runtime from '../../../../scripts/booth-guide.js';
import css from '../../../../styles/booth-guide.css';
import { getSession } from './session.js';
import { reportRequestsAuthorisation } from './report-requests.js';

const PATH = '/adobe/booth-guide';
const KEY = 'booth-guide:current';
const REVISION = /^[a-z0-9-]{1,64}$/;
const FILENAME = /^[a-z0-9-]+\.png$/;
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://use.typekit.net https://p.typekit.net; font-src 'self' https://use.typekit.net; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
};
const assets = new Map([
  ['/scripts/booth-guide.js', [runtime, 'text/javascript; charset=utf-8']],
  ['/styles/booth-guide.css', [css, 'text/css; charset=utf-8']],
]);

function response(request, body, status, type = 'text/plain; charset=utf-8', extra = {}) {
  return new Response(request.method === 'HEAD' ? null : body, {
    status,
    headers: { ...headers, 'Content-Type': type, ...extra },
  });
}

function validGuide(guide) {
  return guide && guide.redacted === false
    && typeof guide.contentVersion === 'string' && REVISION.test(guide.contentVersion)
    && Array.isArray(guide.sections) && guide.sections.length > 0
    && guide.sections.every((section) => section && typeof section.id === 'string'
      && /^[a-z0-9-]+$/.test(section.id)
      && typeof section.title === 'string' && typeof section.html === 'string'
      && typeof section.searchText === 'string')
    && new Set(guide.sections.map((section) => section.id)).size === guide.sections.length
    && Array.isArray(guide.screenshots) && guide.screenshots.length > 0
    && guide.screenshots.every((name) => typeof name === 'string' && FILENAME.test(name))
    && new Set(guide.screenshots).size === guide.screenshots.length;
}

/** Private content never enters DA, the public origin, the media bypass or a Worker bundle. */
export async function serveBoothGuide(request, env) {
  const url = new URL(request.url);
  const asset = assets.get(url.pathname);
  if (asset) {
    if (!['GET', 'HEAD'].includes(request.method)) return response(request, 'Method Not Allowed', 405, undefined, { Allow: 'GET, HEAD' });
    return response(request, asset[0], 200, asset[1]);
  }
  if (url.pathname !== PATH && !url.pathname.startsWith(`${PATH}/`) && !url.pathname.startsWith(`${PATH}.`)) return null;
  if (!['GET', 'HEAD'].includes(request.method)) return response(request, 'Method Not Allowed', 405, undefined, { Allow: 'GET, HEAD' });
  const page = [PATH, `${PATH}/`, `${PATH}.html`].includes(url.pathname);
  const authorization = reportRequestsAuthorisation(await getSession(request, env));
  if (authorization !== 200) {
    if (authorization === 401 && page) {
      return response(request, null, 302, undefined, { Location: `/auth/portal?redirect=${encodeURIComponent(PATH)}` });
    }
    if (page) return response(request, shell, authorization, 'text/html; charset=utf-8');
    return response(request, 'This staff guide requires Adobe employee sign-in with Adobe ID. Sign out of other accounts at /auth/logout, then sign in with your Adobe account.', authorization);
  }
  if (page) return response(request, shell, 200, 'text/html; charset=utf-8');
  const data = url.pathname === `${PATH}/data.json`;
  const name = url.pathname.startsWith(`${PATH}/screenshots/`)
    ? url.pathname.slice(`${PATH}/screenshots/`.length) : '';
  if (!data && !FILENAME.test(name)) return response(request, 'Not Found', 404);
  try {
    const guide = await env.SESSIONS.get(KEY, 'json');
    if (!validGuide(guide)) {
      console.error('[booth-guide] Published staff guide is missing or invalid');
      return response(request, 'The staff guide is unavailable. Please contact the booth lead.', 503);
    }
    if (data) return response(request, JSON.stringify(guide), 200, 'application/json; charset=utf-8');
    if (!guide.screenshots.includes(name)
      || (url.searchParams.has('v') && url.searchParams.get('v') !== guide.contentVersion)) return response(request, 'Not Found', 404);
    const image = await env.SESSIONS.get(`booth-guide:${guide.contentVersion}:screenshots/${name}`, 'arrayBuffer');
    if (!image) {
      console.error('[booth-guide] Published screenshot is missing', name);
      return response(request, 'This guide screenshot is unavailable. Please contact the booth lead.', 503);
    }
    return response(request, image, 200, 'image/png');
  } catch (error) {
    console.error('[booth-guide] Private storage unavailable', error.name);
    return response(request, 'The staff guide is temporarily unavailable. Please try again.', 503);
  }
}
