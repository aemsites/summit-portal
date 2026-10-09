import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { serveBoothGuide } from '../src/booth-guide.js';
import { createSession } from '../src/session.js';
import { createMockEnv, createMockBoothCookie } from './helpers.js';

const PATH = '/adobe/booth-guide';
const DATA = `${PATH}/data.json`;
const IMAGE = `${PATH}/screenshots/01-staff-login.png`;
const guide = {
  redacted: false,
  contentVersion: '2026-10-09-v4',
  sections: [{ id: '1-staff-access', title: 'Staff access', html: '<p>Private guide content</p>', searchText: 'Staff access' }],
  screenshots: ['01-staff-login.png'],
};

describe('Adobe employee booth guide', () => {
  let env;
  let cookie;
  let storage;

  beforeEach(async () => {
    env = createMockEnv();
    cookie = `auth_token=${await createSession(env, { email: 'employee@adobe.com', method: 'oauth' })}`;
    storage = vi.spyOn(env.SESSIONS, 'get').mockImplementation(async (key, type) => {
      if (key === 'booth-guide:current') return guide;
      if (key === 'booth-guide:2026-10-09-v4:screenshots/01-staff-login.png' && type === 'arrayBuffer') {
        return new Uint8Array([137, 80, 78, 71]).buffer;
      }
      return null;
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  function request(path, method = 'GET', auth = cookie) {
    return new Request(`https://act.aem.now${path}`, { method, headers: auth ? { Cookie: auth } : {} });
  }

  it('requires interactive Adobe OAuth before any page, JSON or screenshot lookup', async () => {
    for (const path of [PATH, `${PATH}/`, `${PATH}.html`, DATA, IMAGE, `${PATH}.plain.html`, `${PATH}.md`]) {
      const anonymous = await worker.fetch(request(path, 'GET', ''), env);
      expect(anonymous.status).toBe([PATH, `${PATH}/`, `${PATH}.html`].includes(path) ? 302 : 401);
      if (anonymous.status === 302) expect(anonymous.headers.get('Location')).toBe('/auth/portal?redirect=%2Fadobe%2Fbooth-guide');
      expect(anonymous.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await anonymous.text()).not.toContain('Private guide content');
      expect((await worker.fetch(request(path, 'HEAD', ''), env)).status).toBe(anonymous.status);
    }
    expect(storage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['employee@adobe.com', 'staff'],
    ['employee@adobe.com', 'sharelink'],
    ['employee@adobe.com', 'magiclink'],
    ['employee@adobe.com', undefined],
    ['partner@semrush.com', 'oauth'],
    ['employee@adobe.com.example', 'oauth'],
    ['customer@example.com', 'oauth'],
  ])('rejects %s / %s even when its groups claim Adobe access', async (email, method) => {
    const token = await createSession(env, { email, method, groups: ['adobe.com'] });
    for (const path of [PATH, DATA, IMAGE]) {
      expect((await worker.fetch(request(path, 'GET', `auth_token=${token}`), env)).status).toBe(403);
    }
    expect(storage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows any authenticated Adobe employee without a separate CUG membership or origin fetch', async () => {
    const page = await worker.fetch(request(PATH), env);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('/scripts/booth-guide.js');
    const data = await worker.fetch(request(DATA), env);
    expect(await data.json()).toEqual(guide);
    expect(data.headers.get('Cache-Control')).toBe('private, no-store');
    expect(data.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(data.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(data.headers.has('Access-Control-Allow-Origin')).toBe(false);
    const image = await worker.fetch(request(IMAGE), env);
    expect(image.headers.get('Content-Type')).toBe('image/png');
    expect([...new Uint8Array(await image.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps every guide route unavailable in booth-restricted browsers', async () => {
    for (const auth of ['booth_kiosk=1', await createMockBoothCookie(env)]) {
      for (const path of [PATH, DATA, IMAGE]) {
        const response = await worker.fetch(request(path, 'GET', auth), env);
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('/booth');
      }
    }
    expect(storage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not proxy alternate formats, unknown images, stale revisions or path lookalikes', async () => {
    for (const path of [
      `${PATH}.plain.html`, `${PATH}.json`, `${PATH}.md`, `${PATH}.pdf`,
      `${PATH}/index.html`, `${PATH}/screenshots/private.png`,
      `${IMAGE}?v=old-version`, `${PATH}/screenshots/subdir/image.png`,
      `${PATH}/screenshots/media_${'a'.repeat(40)}.png`,
    ]) {
      expect((await worker.fetch(request(path), env)).status).toBe(404);
    }
    expect(await serveBoothGuide(request('/adobe/dashboard'), env)).toBeNull();
    expect(await serveBoothGuide(request(`${PATH}-other`), env)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns correct HEAD responses and denies writes or preflights without storage operations', async () => {
    for (const path of [PATH, DATA, IMAGE, '/scripts/booth-guide.js', '/styles/booth-guide.css']) {
      const head = await worker.fetch(request(path, 'HEAD'), env);
      expect(head.status).toBe(200);
      expect((await head.arrayBuffer()).byteLength).toBe(0);
      for (const method of ['POST', 'PUT', 'OPTIONS']) {
        const calls = storage.mock.calls.length;
        const response = await worker.fetch(request(path, method), env);
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET, HEAD');
        expect(storage.mock.calls).toHaveLength(calls);
      }
    }
  });

  it('bundles only the generic shell and runtime, never private content', async () => {
    for (const path of ['/scripts/booth-guide.js', '/styles/booth-guide.css']) {
      const response = await worker.fetch(request(path, 'GET', ''), env);
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain('Private guide content');
    }
    expect(storage).not.toHaveBeenCalled();
  });

  it('surfaces missing content, images and storage outages without returning a partial guide', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const value of [
      null, {}, { ...guide, redacted: true }, { ...guide, contentVersion: undefined },
      { ...guide, contentVersion: '../private' }, { ...guide, sections: [null] },
      { ...guide, sections: [{ ...guide.sections[0], id: undefined }] },
      { ...guide, sections: [guide.sections[0], guide.sections[0]] },
      { ...guide, screenshots: [] }, { ...guide, screenshots: [undefined] },
      { ...guide, screenshots: [...guide.screenshots, ...guide.screenshots] },
    ]) {
      storage.mockResolvedValue(value);
      expect((await worker.fetch(request(DATA), env)).status).toBe(503);
    }
    storage.mockImplementation(async (key) => (key === 'booth-guide:current' ? guide : null));
    expect((await worker.fetch(request(IMAGE), env)).status).toBe(503);
    storage.mockRejectedValue(new Error('Storage unavailable'));
    expect((await worker.fetch(request(DATA), env)).status).toBe(503);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
