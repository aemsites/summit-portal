/* eslint-disable import/no-relative-packages */
import amazon from '../../../../img/booth/picker-amazon.svg';
import unity from '../../../../img/booth/picker-unity.svg';

const DESIGN_ICONS = new Map([
  ['amazon.com', amazon],
  ['amazon.co.uk', amazon],
  ['unity.com', unity],
]);
const MAX_BYTES = 128 * 1024;
const RESERVED = new Set(['local', 'localhost', 'internal', 'intranet', 'corp', 'lan', 'home', 'onion', 'arpa', 'test', 'invalid', 'example']);

export function websiteHost(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 253) return null;
  try {
    const url = new URL(value.includes('://') ? value.trim() : `https://${value.trim()}`);
    const host = url.hostname;
    const labels = host.split('.');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.port || url.pathname !== '/' || url.search || url.hash || labels.length < 2
      || !/^[a-z]{2,63}$/.test(labels.at(-1)) || RESERVED.has(labels.at(-1))
      || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

async function boundedBytes(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty website icon');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Website icon exceeds size limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}

function rasterType(bytes) {
  const prefix = [...bytes.slice(0, 12)];
  if (prefix.slice(0, 8).join() === '137,80,78,71,13,10,26,10') return 'image/png';
  if (prefix.slice(0, 3).join() === '255,216,255') return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(String.fromCharCode(...prefix.slice(0, 6)))) return 'image/gif';
  if (String.fromCharCode(...prefix.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...prefix.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (prefix.slice(0, 4).join() === '0,0,1,0' && bytes.length >= 22) return 'image/x-icon';
  return null;
}

export async function fetchWebsiteIcon(host) {
  if (websiteHost(host) !== host) throw new Error('Invalid website icon host');
  const design = DESIGN_ICONS.get(host.replace(/^www\./, ''));
  if (design) return { body: design, type: 'image/svg+xml' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  let url = new URL(`https://${host}/favicon.ico`);
  try {
    for (let hop = 0; hop < 3; hop += 1) {
      // Never forward the booth request, cookies, origin token or attendee metadata.
      const response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'image/*', 'Cache-Control': 'no-store' },
        cf: { cacheTtl: 0 },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('Location');
        if (!location) throw new Error('Website icon redirect has no location');
        const target = new URL(location, url);
        if (target.protocol !== 'https:' || target.username || target.password || target.port
          || websiteHost(target.origin) !== target.hostname
          || target.hostname.replace(/^www\./, '') !== host.replace(/^www\./, '')) {
          throw new Error('Website icon redirect leaves the authorized host');
        }
        url = target;
      } else {
        if (!response.ok || Number(response.headers.get('Content-Length')) > MAX_BYTES) {
          await response.body?.cancel();
          throw new Error('Website icon is unavailable or exceeds size limit');
        }

        const bytes = await boundedBytes(response);
        const type = rasterType(bytes);
        // Remote SVG/HTML must not become executable same-origin content.
        if (!type) throw new Error('Website icon is not a supported raster image');
        return { body: bytes, type };
      }
    }
    throw new Error('Website icon redirect limit exceeded');
  } finally {
    clearTimeout(timer);
  }
}
