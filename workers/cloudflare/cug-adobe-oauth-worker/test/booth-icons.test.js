import { describe, it, expect, vi, afterEach } from 'vitest';
import { websiteHost, fetchWebsiteIcon } from '../src/booth-icons.js';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('bounded first-party website icon loading', () => {
  it('accepts website hostnames, not labels, private addresses or arbitrary URLs', () => {
    expect(websiteHost('Example.COM')).toBe('example.com');
    expect(websiteHost('https://www.example.com/')).toBe('www.example.com');
    for (const value of [
      null, '', 'Site 0', '<script>alert(1)</script>', 'visitor@example.com',
      '127.0.0.1', '2130706433', '0x7f000001', '[::1]', '169.254.169.254',
      'localhost', 'site.local', 'site.internal', 'site.test', 'site.home.arpa',
      'https://example.com:8443', 'https://user:password@example.com/',
      'https://example.com/a', 'https://example.com/?email=visitor@example.com',
      'https://example.com/#fragment', 'file:///etc/passwd', 'example.com.evil.test',
    ]) expect(websiteHost(value)).toBeNull();
  });

  it('uses the exact approved Amazon and Unity exports without external services', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const host of ['amazon.com', 'amazon.co.uk', 'www.amazon.com', 'unity.com']) {
      const icon = await fetchWebsiteIcon(host);
      expect(icon.type).toBe('image/svg+xml');
      expect(icon.body).toContain('<svg');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requests only HTTPS favicon bytes, with no attendee or origin credentials', async () => {
    const fetch = vi.fn(async () => new Response(png));
    vi.stubGlobal('fetch', fetch);
    const icon = await fetchWebsiteIcon('example.com');
    expect(icon.type).toBe('image/png');
    expect(icon.body).toEqual(png);
    const [url, options] = fetch.mock.calls[0];
    expect(url.href).toBe('https://example.com/favicon.ico');
    expect(options.redirect).toBe('manual');
    expect(options.headers).toEqual({ Accept: 'image/*', 'Cache-Control': 'no-store' });
    expect(options.cf.cacheTtl).toBe(0);
  });

  it('allows a bounded www redirect but refuses another host, port or downgrade', async () => {
    for (const location of [
      'http://example.com/favicon.ico', 'https://evil.example/favicon.ico',
      'https://127.0.0.1/favicon.ico', 'https://example.com:8443/favicon.ico',
      'https://visitor@example.com/favicon.ico',
    ]) {
      const headers = { Location: location };
      const fetch = vi.fn(async () => new Response(null, { status: 302, headers }));
      vi.stubGlobal('fetch', fetch);
      await expect(fetchWebsiteIcon('example.com')).rejects.toThrow('authorized host');
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://www.example.com/favicon.ico' } }))
      .mockResolvedValueOnce(new Response(png));
    vi.stubGlobal('fetch', fetch);
    expect((await fetchWebsiteIcon('example.com')).body).toEqual(png);
    expect(fetch.mock.calls[1][0].hostname).toBe('www.example.com');
  });

  it('refuses SVG/HTML masquerading as images, errors and oversized streamed bodies', async () => {
    for (const response of [
      new Response('<svg onload="alert(1)"/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
      new Response('<script>alert(1)</script>', { headers: { 'Content-Type': 'image/png' } }),
      new Response(null, { status: 404 }),
      new Response(new Uint8Array(128 * 1024 + 1)),
      new Response(png, { headers: { 'Content-Length': '131073' } }),
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => response));
      await expect(fetchWebsiteIcon('example.com')).rejects.toThrow();
    }
  });

  it('limits redirect loops to three requests', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { Location: '/favicon.ico' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchWebsiteIcon('example.com')).rejects.toThrow('redirect limit');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('aborts stalled downloads after four seconds and releases its timer', async () => {
    vi.useFakeTimers();
    let signal;
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      signal = options.signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
      });
    }));
    const result = fetchWebsiteIcon('example.com').catch((error) => error);
    await vi.advanceTimersByTimeAsync(4000);
    expect((await result).name).toBe('AbortError');
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
