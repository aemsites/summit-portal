# Building a Gated Portal on AEM Edge Delivery Services: How Summit Does It

Delivering both public marketing pages and members-only content from a single site is a common requirement, but Edge Delivery Services doesn't ship with a built-in access control layer. The [summit-portal](https://github.com/aemsites/summit-portal) project solves this with a pattern we call **Closed User Groups (CUG) at the edge**: access rules are authored in a spreadsheet, attached to pages as HTTP headers via the AEM Config Service, and enforced by a Cloudflare Worker that handles OAuth 2.0 + PKCE against Adobe IMS.

This post walks through every piece of the implementation — spreadsheet authoring, header injection, edge enforcement, session management, and portal redirect — with code straight from the open-source summit-portal repository.

---

## Architecture Overview

The system has three layers, all contained in the [summit-portal](https://github.com/aemsites/summit-portal) repo:

1. **DA authoring tool** — reads a `closed-user-groups` spreadsheet and pushes `x-aem-cug-required` / `x-aem-cug-groups` headers to the AEM Config Service.
2. **AEM Edge Delivery origin** — serves content with CUG headers attached by the Config Service based on URL pattern matching.
3. **Cloudflare Worker** — sits in front of the origin, reads CUG headers from the origin response, enforces authentication via Adobe IMS OAuth + PKCE, checks group membership, and manages JWT sessions.

```mermaid
sequenceDiagram
    participant Author as Author (DA Tool)
    participant ConfigSvc as AEM Config Service
    participant Origin as AEM Edge Delivery
    participant Worker as Cloudflare Worker
    participant Browser as Visitor
    participant IMS as Adobe IMS

    Author->>ConfigSvc: POST CUG headers via Admin API
    Browser->>Worker: GET /members/adobe
    Worker->>Origin: Proxy request
    Origin-->>Worker: HTML + x-aem-cug-required: true
    Worker->>Browser: 302 to IMS login
    Browser->>IMS: Authorize (PKCE)
    IMS-->>Browser: 302 /auth/callback?code=...
    Browser->>Worker: GET /auth/callback
    Worker->>IMS: Exchange code for tokens
    IMS-->>Worker: id_token (email, name)
    Worker-->>Browser: Set auth_token cookie + 302 to /members/adobe
    Browser->>Worker: GET /members/adobe (with cookie)
    Worker->>Origin: Proxy request
    Origin-->>Worker: HTML + CUG headers
    Worker-->>Browser: Protected page content (CUG headers stripped)
```

The key insight is that access rules are data, not code. Authors maintain a spreadsheet; the tool pushes it to the Config Service as HTTP response headers; the Worker reads those headers at the edge and decides whether to serve or gate the page. No origin-side code changes are needed to add or remove a protected path.

---

## Step 1: Define Access Rules with a Spreadsheet

All access rules live in a single spreadsheet named `closed-user-groups` in the site's Document Authoring (DA) workspace. The spreadsheet has three columns:

| url | cug-required | cug-groups |
|-----|-------------|------------|
| `/members/*` | `true` | `adobe.com` |
| `/members/partners/*` | `true` | `adobe.com,partner.com` |
| `/internal/*` | `true` | `adobe.com` |
| `/public/*` | `false` | |

- **url** — the path pattern to match (supports wildcards via Config Service rules).
- **cug-required** — `true` to require authentication, `false` to explicitly mark as public.
- **cug-groups** — comma-separated list of allowed email domains. If empty when `cug-required` is `true`, any authenticated user can access the page.

The spreadsheet is authored in DA and served as JSON at `closed-user-groups.json`. The DA tool reads this JSON and transforms it into Config Service headers.

---

## Step 2: Push Headers to the Config Service (DA Tool)

The CUG tool is a lightweight DA sidebar app at [`tools/cug/`](https://github.com/aemsites/summit-portal/tree/main/tools/cug). It has three files:

- [`cug.html`](https://github.com/aemsites/summit-portal/blob/main/tools/cug/cug.html) — loads the DA SDK for auth context
- [`cug.css`](https://github.com/aemsites/summit-portal/blob/main/tools/cug/cug.css) — minimal UI styling
- [`cug.js`](https://github.com/aemsites/summit-portal/blob/main/tools/cug/cug.js) — the pipeline that reads the spreadsheet and writes headers

The tool exposes two buttons: **Apply Page Access** (pushes CUG headers) and **Remove Page Access** (strips all CUG headers while preserving other headers).

### The pipeline

The "Apply" flow chains five functions:

#### 1. Fetch the spreadsheet

```javascript
async function fetchCugSheet(org, site, token) {
  const url = `${DA_SOURCE_BASE}/${org}/${site}/${CUG_SHEET_PATH}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch CUG sheet: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();
  return Array.isArray(json.data) ? json.data : [];
}
```

This fetches the `closed-user-groups.json` spreadsheet from the DA source API and returns the `data` array of rows.

#### 2. Transform rows into headers config

```javascript
function transformToHeadersConfig(rows) {
  const config = {};

  for (const row of rows) {
    const path = (row.url || '').trim();
    if (!path || !path.startsWith('/')) continue;
    if (config[path]) continue;

    const headers = [];
    const required = (row['cug-required'] || '').trim().toLowerCase();
    if (required === 'true' || required === 'false') {
      headers.push({ key: HEADER_CUG_REQUIRED, value: required });
    }

    const groups = (row['cug-groups'] || '').trim();
    if (groups) {
      headers.push({ key: HEADER_CUG_GROUPS, value: groups });
    }

    if (headers.length > 0) {
      config[path] = headers;
    }
  }

  return config;
}
```

Each spreadsheet row becomes a path entry with one or two headers: `x-aem-cug-required` and optionally `x-aem-cug-groups`. Duplicate paths are skipped (first row wins).

#### 3. Fetch existing non-CUG headers

```javascript
async function fetchExistingNonCugHeaders(org, site, token) {
  const url = `${ADMIN_API_BASE}/config/${org}/aggregated/${site}.json`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    if (resp.status === 404) return {};
    const body = await resp.text().catch(() => '');
    throw new Error(`Failed to read site config: ${resp.status} ${resp.statusText} ${body}`);
  }

  const config = await resp.json();
  const existing = config.headers || {};
  const filtered = {};

  for (const [path, headerList] of Object.entries(existing)) {
    const nonCug = Array.isArray(headerList)
      ? headerList.filter((h) => !isCugHeader(h.key))
      : [];
    if (nonCug.length > 0) {
      filtered[path] = nonCug;
    }
  }

  return filtered;
}
```

This reads the current site config from the Admin API and strips out any existing CUG headers, keeping everything else (cache headers, security headers, etc.) intact.

#### 4. Merge headers

```javascript
function mergeHeaders(nonCugHeaders, cugHeaders) {
  const merged = { ...nonCugHeaders };

  for (const [path, cugList] of Object.entries(cugHeaders)) {
    const existing = merged[path] || [];
    merged[path] = [...existing, ...cugList];
  }

  return merged;
}
```

Non-CUG and CUG headers are merged per path. This ensures the tool never overwrites unrelated headers.

#### 5. POST to the Config Service

```javascript
async function postHeaders(org, site, headersConfig, token) {
  const url = `${ADMIN_API_BASE}/config/${org}/sites/${site}/headers.json`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(headersConfig),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Config Service POST failed: ${resp.status} ${resp.statusText} — ${body}`);
  }
}
```

The merged header config is POSTed to `admin.hlx.page/config/{org}/sites/{site}/headers.json`. From this point on, Edge Delivery will attach these headers to every matching response.

### Wiring it up

The init function ties the pipeline together with the DA SDK, which provides the `org`, `site`, and `token` context:

```javascript
(async function init() {
  const { context, token } = await DA_SDK;
  const { org, site } = context;

  renderUI(
    document.body,
    async () => {
      const rows = await fetchCugSheet(org, site, token);
      const cugHeaders = transformToHeadersConfig(rows);
      const nonCugHeaders = await fetchExistingNonCugHeaders(org, site, token);
      const merged = mergeHeaders(nonCugHeaders, cugHeaders);

      await postHeaders(org, site, merged, token);

      return {
        cugPaths: Object.keys(cugHeaders).length,
        totalPaths: Object.keys(merged).length,
      };
    },
    async () => {
      const nonCugHeaders = await fetchExistingNonCugHeaders(org, site, token);
      await postHeaders(org, site, nonCugHeaders, token);
    },
  );
}());
```

The "Remove" callback is the same flow but skips the CUG headers entirely, effectively deleting them from the Config Service.

---

## Step 3: The Cloudflare Edge Worker

The Worker is a reverse proxy that sits between the visitor's browser and the AEM Edge Delivery origin. It handles four auth routes and enforces CUG access on everything else.

Source: [`workers/cloudflare/cug-adobe-oauth-worker/`](https://github.com/aemsites/summit-portal/tree/main/workers/cloudflare/cug-adobe-oauth-worker)

### Routing (index.js)

The entry point in [`src/index.js`](https://github.com/aemsites/summit-portal/blob/main/workers/cloudflare/cug-adobe-oauth-worker/src/index.js) routes requests:

| Route | Handler | Purpose |
|-------|---------|---------|
| `/auth/callback` | `handleCallback` + `createSession` | OAuth code exchange, session creation |
| `/auth/logout` | inline | Clears session cookie, redirects to IMS logout |
| `/auth/portal` | `handlePortalRedirect` | Group-based page redirect |
| `/auth/me` | inline | Returns current user info as JSON |
| RUM / media | `proxyToOrigin` | Passed through without auth |
| Everything else | `proxyToOrigin` → `checkCugAccess` | Proxied, then CUG-checked |

The proxy function rewrites the hostname to the origin, sets forwarding headers, and enables Cloudflare's edge cache:

```javascript
async function proxyToOrigin(request, env, url) {
  const extension = getExtension(url.pathname);
  const savedSearch = url.search;
  const { searchParams } = url;

  if (isMediaRequest(url)) {
    for (const [key] of searchParams.entries()) {
      if (!['format', 'height', 'optimize', 'width'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else if (extension === 'json') {
    for (const [key] of searchParams.entries()) {
      if (!['limit', 'offset', 'sheet'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else {
    url.search = '';
  }
  searchParams.sort();

  url.hostname = env.ORIGIN_HOSTNAME;
  const req = new Request(url, request);
  req.headers.set('x-forwarded-host', req.headers.get('host'));
  req.headers.set('x-byo-cdn-type', 'cloudflare');
  if (env.PUSH_INVALIDATION !== 'disabled') {
    req.headers.set('x-push-invalidation', 'enabled');
  }
  if (env.ORIGIN_AUTHENTICATION) {
    req.headers.set('authorization', `token ${env.ORIGIN_AUTHENTICATION}`);
  }

  let resp = await fetch(req, {
    method: req.method,
    cf: { cacheEverything: true },
  });
  resp = new Response(resp.body, resp);

  resp.headers.delete('age');
  resp.headers.delete('x-robots-tag');
  return resp;
}
```

Query parameters are sanitized per resource type to prevent cache pollution — media requests only keep dimension/format params, JSON requests only keep pagination params, and HTML requests strip all query params.

### CUG Enforcement (cug.js)

After the origin responds, [`src/cug.js`](https://github.com/aemsites/summit-portal/blob/main/workers/cloudflare/cug-adobe-oauth-worker/src/cug.js) checks the CUG headers:

```javascript
export async function checkCugAccess(originResponse, session, request, env) {
  const cugRequired = originResponse.headers.get('x-aem-cug-required');
  const cugGroups = originResponse.headers.get('x-aem-cug-groups');

  // No CUG protection on this path — serve publicly
  if (cugRequired !== 'true') {
    return stripCugHeaders(originResponse);
  }

  // CUG required but no session — redirect to login
  if (!session) {
    return redirectToLogin(request.url, env);
  }

  // If specific domains are required, check the user's email domain
  if (cugGroups) {
    const allowedGroups = cugGroups.split(',').map((g) => g.trim().toLowerCase());
    const userGroups = session.groups || [];
    const hasAccess = allowedGroups.some((g) => userGroups.includes(g));

    if (!hasAccess) {
      return Response.redirect(new URL('/403', request.url).href, 302);
    }
  }

  const resp = stripCugHeaders(originResponse);
  resp.headers.set('Cache-Control', 'private, no-store');
  return resp;
}
```

The logic is straightforward:

1. **No `x-aem-cug-required: true`** → strip internal headers and serve publicly.
2. **CUG required, no session** → redirect to IMS login (the original URL is preserved so the user lands back on the same page after authenticating).
3. **CUG required, session exists, groups specified** → check the user's email domain against the allowed domains using OR logic. If no match, redirect to a 403 page.
4. **CUG required, session exists, access granted** → strip CUG headers, set `Cache-Control: private, no-store` to prevent CDN caching of protected content, and serve the page.

CUG headers are always stripped before the response reaches the browser — they are internal signaling between the origin and the Worker, not meant for end users.

---

## Step 4: OAuth 2.0 + PKCE Authentication

The Worker authenticates users via the standard OAuth 2.0 Authorization Code flow with PKCE (RFC 7636). PKCE ensures that even if the authorization code is intercepted, it cannot be exchanged for tokens without the original code verifier — which only the Worker knows.

Source: [`src/oauth.js`](https://github.com/aemsites/summit-portal/blob/main/workers/cloudflare/cug-adobe-oauth-worker/src/oauth.js)

### Starting the login flow

When a visitor hits a protected page without a session, `redirectToLogin` generates a PKCE verifier and challenge, stores the verifier in Cloudflare KV with a 5-minute TTL, and redirects to the IMS authorize endpoint:

```javascript
export async function redirectToLogin(originalUrl, env) {
  const { verifier, challenge } = await generatePkce();
  const state = generateState();

  await env.SESSIONS.put(`pkce:${state}`, JSON.stringify({ verifier, originalUrl }), {
    expirationTtl: 300,
  });

  const params = new URLSearchParams({
    client_id: env.OAUTH_CLIENT_ID,
    scope: env.OAUTH_SCOPE,
    response_type: 'code',
    redirect_uri: env.OAUTH_REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  return Response.redirect(`${env.OAUTH_AUTHORIZE_URL}?${params}`, 302);
}
```

The `state` parameter serves double duty: it prevents CSRF attacks and acts as the key for looking up the stored verifier + original URL after the callback.

### Handling the callback

After the user authenticates with Adobe IMS, the browser is redirected back to `/auth/callback` with the authorization code. The Worker retrieves the stored PKCE verifier from KV and exchanges the code for tokens:

```javascript
export async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(`OAuth error: ${error} - ${url.searchParams.get('error_description') || ''}`, {
      status: 400,
    });
  }

  if (!code || !state) {
    return Response.redirect(new URL('/', url).href, 302);
  }

  const stored = await env.SESSIONS.get(`pkce:${state}`, 'json');
  if (!stored) {
    return new Response('Invalid or expired state', { status: 400 });
  }
  await env.SESSIONS.delete(`pkce:${state}`);

  const tokenResponse = await fetch(env.OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: env.OAUTH_CLIENT_SECRET,
      code,
      code_verifier: stored.verifier,
      redirect_uri: env.OAUTH_REDIRECT_URI,
    }),
  });

  if (!tokenResponse.ok) {
    return new Response('Authentication failed. Please try again.', { status: 502 });
  }

  const tokens = await tokenResponse.json();
  const claims = parseJwt(tokens.id_token || tokens.access_token);
  const email = (claims.email || claims.sub).toLowerCase();
  if (!email) {
    return new Response('Could not determine user email from token', { status: 502 });
  }
  const domain = email.split('@')[1] || '';

  return {
    userInfo: { email, name: claims.name || email, groups: [domain] },
    originalUrl: stored.originalUrl,
  };
}
```

The user's email domain becomes their group for CUG matching: `user@adobe.com` → group `adobe.com`. This is a simple but effective strategy for organizations where email domain maps to organizational membership.

### Session management

Source: [`src/session.js`](https://github.com/aemsites/summit-portal/blob/main/workers/cloudflare/cug-adobe-oauth-worker/src/session.js)

Sessions are stateless JWTs signed with HMAC-SHA256. No server-side session store is needed for verification — the Worker signs the JWT on login and verifies it on every request using the shared `JWT_SECRET`.

```javascript
export async function createSession(env, userInfo) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    email: userInfo.email,
    name: userInfo.name,
    groups: userInfo.groups,
    iat: now,
    exp: now + SESSION_TTL,
  };
  return signJwt(payload, env.JWT_SECRET);
}
```

The JWT payload contains `email`, `name`, `groups`, and a 1-hour expiration. It's stored in the `auth_token` cookie with security attributes:

```javascript
export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}
```

- **HttpOnly** prevents JavaScript access (XSS protection).
- **Secure** ensures the cookie is only sent over HTTPS.
- **SameSite=Lax** provides CSRF protection while allowing top-level navigations.

Verification reads the cookie, splits the JWT, and checks the HMAC signature and expiration:

```javascript
export async function getSession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^\\s;]+)`));
  if (!match) return null;

  return verifyJwt(match[1], env.JWT_SECRET);
}
```

The Cloudflare KV namespace (`SESSIONS`) is only used for temporary PKCE state during the OAuth flow — not for session storage.

---

## Step 5: Portal Redirect and Header UI

### Portal redirect

Source: [`src/portal.js`](https://github.com/aemsites/summit-portal/blob/main/workers/cloudflare/cug-adobe-oauth-worker/src/portal.js)

The `/auth/portal` route provides a single entry point for all authenticated users. It fetches a `closed-user-groups-mapping.json` spreadsheet from the origin and redirects the user to the page mapped to their group:

```javascript
export async function handlePortalRedirect(session, request, env) {
  const origin = new URL(request.url);
  origin.hostname = env.ORIGIN_HOSTNAME;
  origin.pathname = MAPPING_PATH;
  origin.search = '';

  let mapping;
  try {
    const headers = {};
    if (env.ORIGIN_AUTHENTICATION) {
      headers.authorization = `token ${env.ORIGIN_AUTHENTICATION}`;
    }
    const resp = await fetch(origin, { headers });
    if (!resp.ok) {
      return redirect(request, FALLBACK_PATH);
    }
    mapping = await resp.json();
  } catch {
    return redirect(request, FALLBACK_PATH);
  }

  const entries = Array.isArray(mapping.data) ? mapping.data : [];
  const userGroups = session.groups || [];

  const match = entries.find((entry) => {
    const group = (entry.group || '').trim();
    return userGroups.includes(group);
  });

  return redirect(request, match ? match.url : FALLBACK_PATH);
}
```

The mapping spreadsheet looks like:

| group | url |
|-------|-----|
| `adobe.com` | `/members/adobe` |
| `partner.com` | `/members/partners` |

This enables a single "Access Your Portal" link that routes each user to the right page based on their organization. If no match is found, the user is redirected to `/`.

### Header sign-in / sign-out UI

Source: [`blocks/header/header.js`](https://github.com/aemsites/summit-portal/blob/main/blocks/header/header.js) — `decorateUserInfo()`

The site header integrates authentication state into the UI:

```javascript
async function decorateUserInfo(section) {
  const container = section.querySelector('.default-content');
  if (!container) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'user-info';

  let user;
  try {
    const resp = await fetch('/auth/me');
    user = resp.ok ? await resp.json() : null;
  } catch { user = null; }

  if (!user?.authenticated) {
    const signIn = document.createElement('a');
    signIn.href = '/auth/portal';
    signIn.className = 'user-sign-in';
    signIn.textContent = 'Sign in';
    wrapper.append(signIn);
  } else {
    const btn = document.createElement('button');
    btn.className = 'user-email';
    btn.textContent = user.email;

    const menu = document.createElement('div');
    menu.className = 'user-menu';
    const signOut = document.createElement('a');
    signOut.href = '/auth/logout';
    signOut.textContent = 'Sign out';
    const myPortal = document.createElement('a');
    myPortal.href = '/auth/portal';
    myPortal.textContent = 'My Portal';
    menu.append(signOut, myPortal);

    btn.addEventListener('click', () => toggleMenu(wrapper));
    wrapper.append(btn, menu);
  }

  container.append(wrapper);
}
```

On page load, the header calls `/auth/me`. If the response is a 401, the user sees a "Sign in" link pointing to `/auth/portal`. If authenticated, the user sees their email address as a button with a dropdown containing "Sign out" and "My Portal" links.

---

## The Complete User Journey

### Scenario 1: Public page

1. Browser requests `/about`.
2. Worker proxies to origin.
3. Origin responds with HTML — no `x-aem-cug-required` header.
4. Worker strips any CUG headers (defensive) and serves the page as-is.
5. Header calls `/auth/me` → 401 → shows "Sign in" link.

### Scenario 2: Protected page, unauthenticated visitor

1. Browser requests `/members/adobe`.
2. Worker checks for session cookie — none found.
3. Worker proxies to origin.
4. Origin responds with `x-aem-cug-required: true` and `x-aem-cug-groups: adobe.com`.
5. Worker calls `redirectToLogin()`:
   - Generates PKCE verifier + challenge.
   - Stores verifier + original URL (`/members/adobe`) in KV.
   - Redirects browser to `ims-na1.adobelogin.com/ims/authorize/v2` with PKCE params.
6. User authenticates with Adobe IMS.
7. IMS redirects to `/auth/callback?code=...&state=...`.
8. Worker retrieves stored verifier from KV, exchanges code for tokens.
9. Worker extracts email from ID token, derives group from domain.
10. Worker creates a signed JWT session, sets `auth_token` cookie.
11. Worker redirects browser back to `/members/adobe`.
12. Browser requests `/members/adobe` (now with cookie).
13. Worker verifies session, proxies to origin, checks CUG groups — `adobe.com` matches.
14. Worker strips CUG headers, sets `Cache-Control: private, no-store`, serves the page.
15. Header calls `/auth/me` → 200 → shows email dropdown with "Sign out" and "My Portal".

### Scenario 3: Portal redirect

1. User clicks "Sign in" → browser requests `/auth/portal`.
2. Worker checks for session — none found → redirects to IMS login (same as steps 5–10 above, but original URL is `/auth/portal`).
3. After login, browser returns to `/auth/portal` with session cookie.
4. Worker verifies session, fetches `closed-user-groups-mapping.json` from origin.
5. User's group `adobe.com` matches the mapping entry for `/members/adobe`.
6. Worker redirects to `/members/adobe`.
7. Page loads normally (authenticated, same as steps 12–15 above).

---

## How to Build Your Own

Here's a practical checklist for implementing CUG on your own Edge Delivery site:

### 1. Create the access rules spreadsheet

Create a `closed-user-groups` spreadsheet in DA (or AEM) with columns: `url`, `cug-required`, `cug-groups`. Optionally, create a `closed-user-groups-mapping` spreadsheet for portal redirect (columns: `group`, `url`).

### 2. Build or fork the CUG tool

Fork or adapt [`tools/cug/cug.js`](https://github.com/aemsites/summit-portal/blob/main/tools/cug/cug.js) to push headers to your site's Config Service. The pipeline — fetch spreadsheet, transform to headers, merge with existing, POST to Config Service — works for any Edge Delivery site.

### 3. Deploy an edge worker

Deploy a Cloudflare Worker (or equivalent on Fastly, CloudFront, Akamai, or Vercel Edge Functions) that:
- Proxies to your Edge Delivery origin
- Reads `x-aem-cug-required` and `x-aem-cug-groups` from origin responses
- Redirects unauthenticated users to your IdP
- Checks group membership on authenticated requests
- Strips CUG headers before sending responses to the browser

### 4. Register an OAuth client

Register an OAuth 2.0 client with your identity provider. The summit-portal uses Adobe IMS, but the pattern works with any provider that supports the Authorization Code + PKCE flow: Okta, Auth0, Google, Microsoft Entra ID, etc.

### 5. Configure secrets

Set secrets via your edge platform's secret management:

```bash
wrangler secret put OAUTH_CLIENT_SECRET
wrangler secret put JWT_SECRET
wrangler secret put ORIGIN_AUTHENTICATION  # if your origin requires a site token
```

### 6. Configure the worker

Set environment variables in your [`wrangler.toml`](https://github.com/aemsites/summit-portal/blob/main/workers/cloudflare/cug-adobe-oauth-worker/wrangler.toml) (or equivalent):

```toml
[vars]
ORIGIN_HOSTNAME = "main--your-site--your-org.aem.live"
OAUTH_AUTHORIZE_URL = "https://your-idp.com/authorize"
OAUTH_TOKEN_URL = "https://your-idp.com/token"
OAUTH_LOGOUT_URL = "https://your-idp.com/logout"
OAUTH_REDIRECT_URI = "https://your-domain.com/auth/callback"
OAUTH_SCOPE = "openid,email,profile"
OAUTH_CLIENT_ID = "your-client-id"

[[kv_namespaces]]
binding = "SESSIONS"
id = "your-kv-namespace-id"
```

### 7. Add sign-in / sign-out UI

Add authentication state to your site header by calling `/auth/me` and rendering sign-in / sign-out links. See [`blocks/header/header.js`](https://github.com/aemsites/summit-portal/blob/main/blocks/header/header.js) for the complete implementation.

### 8. Adapt group derivation

The summit-portal derives groups from email domains (`user@adobe.com` → `adobe.com`). This is just one strategy. Depending on your IdP, you might use:

- **IdP groups/roles** — read from the ID token's `groups` or `roles` claim
- **Custom claims** — map organizational attributes to CUG groups
- **External lookup** — query a membership API during the callback
- **Multiple domains** — map several email domains to a single logical group

The only requirement is that the groups in the session JWT match the groups in the `x-aem-cug-groups` header.

---

## Conclusion

The CUG pattern demonstrated in the summit-portal is a composable, infrastructure-as-data approach to access control on Edge Delivery Services:

- **Spreadsheet-driven config** — authors manage access rules without touching code.
- **Origin-attached headers** — the Config Service bridges authoring intent to HTTP semantics.
- **Edge enforcement** — the Worker makes access decisions at the edge, before content reaches the browser.
- **Standard OAuth** — PKCE ensures secure authentication without exposing secrets client-side.

Every file referenced in this post is open source. Explore the full implementation at [github.com/aemsites/summit-portal](https://github.com/aemsites/summit-portal).
