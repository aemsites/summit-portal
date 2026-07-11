/**
 * Shared test helpers: mock KV store and mock environment.
 */

export function createMockKV() {
  const store = new Map();
  const meta = new Map();
  return {
    get: async (key, type) => {
      const val = store.get(key);
      if (val === undefined) return null;
      return type === 'json' ? JSON.parse(val) : val;
    },
    put: async (key, value, options) => {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      if (options && 'metadata' in options) meta.set(key, options.metadata);
    },
    delete: async (key) => {
      store.delete(key);
      meta.delete(key);
    },
    // Minimal Cloudflare KV list(): returns all matching keys in one page
    // (list_complete: true), sorted lexicographically, with metadata. The real
    // API paginates via cursor; the mock returns everything at once.
    list: async ({ prefix = '' } = {}) => {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((name) => ({ name, metadata: meta.get(name) ?? null }));
      return { keys, list_complete: true, cursor: undefined };
    },
    _store: store,
  };
}

export function createMockEnv(overrides = {}) {
  return {
    ORIGIN_HOSTNAME: 'main--mysite--myorg.aem.live',
    OAUTH_CLIENT_ID: 'test-client-id',
    OAUTH_CLIENT_SECRET: 'test-client-secret',
    OAUTH_AUTHORIZE_URL: 'https://ims.example.com/authorize',
    OAUTH_TOKEN_URL: 'https://ims.example.com/token',
    OAUTH_REDIRECT_URI: 'https://mysite.com/auth/callback',
    OAUTH_SCOPE: 'openid,AdobeID,email,profile',
    OAUTH_LOGOUT_URL: 'https://ims.example.com/ims/logout/v1',
    JWT_SECRET: 'test-jwt-secret',
    SESSIONS: createMockKV(),
    ...overrides,
  };
}

/**
 * Encode a JWT with the given payload (no signature verification in the worker).
 */
export function fakeJwt(payload) {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.fakesig`;
}

/**
 * Create a properly HMAC-SHA256-signed JWT for use in magic link tests.
 * Unlike fakeJwt(), this produces a real signature verifyMagicLink will accept.
 */
export async function signedJwt(payload, secret) {
  function b64u(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  const enc = new TextEncoder();
  const header = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const data = enc.encode(`${header}.${body}`);
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return `${header}.${body}.${b64u(sig)}`;
}
