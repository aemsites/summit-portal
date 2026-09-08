/**
 * Shared test helpers: mock KV store and mock environment.
 */

export function createMockKV() {
  const store = new Map();
  return {
    get: async (key, type) => {
      const val = store.get(key);
      if (val === undefined) return null;
      return type === 'json' ? JSON.parse(val) : val;
    },
    put: async (key, value) => {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    delete: async (key) => {
      store.delete(key);
    },
    store,
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

/** Minimal in-memory D1 double for report-request route tests. */
export function createMockD1() {
  const requests = new Map();
  const idempotency = new Map();

  const execute = (sql, params) => {
    if (sql.startsWith('INSERT OR IGNORE INTO report_request_idempotency')) {
      const [hash, requestId, createdAt] = params;
      if (!idempotency.has(hash)) idempotency.set(hash, { requestId, createdAt });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO report_requests')) {
      const [
        requestId, submittedAt, fullName, email, company, website, jobTitle, primaryMarket,
        consentVersion, consentedAt, searchText, hash, expectedRequestId,
      ] = params;
      if (idempotency.get(hash)?.requestId === expectedRequestId && !requests.has(requestId)) {
        requests.set(requestId, {
          request_id: requestId,
          submitted_at: submittedAt,
          full_name: fullName,
          email,
          company,
          website,
          job_title: jobTitle,
          primary_market: primaryMarket,
          consent_version: consentVersion,
          consented_at: consentedAt,
          search_text: searchText,
        });
      }
      return { success: true };
    }
    if (sql.includes('FROM report_request_idempotency i JOIN report_requests')) {
      const record = idempotency.get(params[0]);
      return record ? requests.get(record.requestId) || null : null;
    }
    if (sql.includes('FROM report_requests')) {
      const limit = params.at(-1);
      let offset = 0;
      const search = sql.includes('search_text LIKE ?') ? String(params[offset]).slice(1, -1) : '';
      if (search) offset += 1;
      const cursor = sql.includes('submitted_at < ?')
        ? {
          submittedAt: params[offset],
          requestId: params[offset + 2],
        }
        : null;
      let rows = [...requests.values()];
      if (search) rows = rows.filter((row) => row.search_text.includes(search.replace(/\\([\\%_])/g, '$1')));
      if (cursor) {
        rows = rows.filter((row) => row.submitted_at < cursor.submittedAt
          || (row.submitted_at === cursor.submittedAt && row.request_id < cursor.requestId));
      }
      rows.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)
        || b.request_id.localeCompare(a.request_id));
      return rows.slice(0, limit);
    }
    throw new Error(`Unexpected mock D1 query: ${sql}`);
  };

  const prepare = (sql) => ({
    bind: (...params) => ({
      run: async () => execute(sql, params),
      first: async () => execute(sql, params),
      all: async () => ({ results: execute(sql, params) }),
      _sql: sql,
      _params: params,
    }),
  });

  return {
    prepare,
    batch: async (statements) => Promise.all(statements.map((statement) => statement.run())),
    requests,
    idempotency,
    _requests: requests,
    _idempotency: idempotency,
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
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return `${header}.${body}.${b64u(sig)}`;
}
