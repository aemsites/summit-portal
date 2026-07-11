# Share-link Engagement Analytics — Architecture

100% capture of customer interactions on pages accessed via share/magic links.
Events are written directly to Cloudflare KV by the auth Worker (never through
sampled telemetry), and a staff-only dashboard reads them back.

## System overview

```mermaid
flowchart TB
  subgraph Browser["🌐 Browser"]
    direction TB
    CT["sharelink-tracking.js<br/>(loaded by lazy.js on<br/>.report-hero / /accounts/ pages)"]
    DASH["engagement-dashboard block<br/>(staff-only page)"]
  end

  subgraph CF["☁️ Cloudflare Worker · cug-adobe-oauth-worker"]
    direction TB
    IDX["index.js<br/>route: /auth/analytics"]
    AN["analytics.js"]
    SESS["session.js<br/>getSession · isStaffEmail"]
    IDX --> AN
    AN -.verify session.-> SESS
  end

  KV[("ANALYTICS_KV<br/>Cloudflare KV namespace")]

  CT -->|"POST /auth/analytics<br/>page_view · scroll_depth<br/>cta_click · time_on_page"| IDX
  AN -->|"put p:{pathKey}<br/>put e:{pathKey}:{ts}-{rand}"| KV

  DASH -->|"GET /auth/analytics<br/>(+ optional ?path=)"| IDX
  KV -->|"list + reduce"| AN
  AN -->|"{ total, data[], totals }"| DASH

  classDef browser fill:#e6f0ff,stroke:#1a6fb5,color:#000
  classDef worker fill:#fff0e6,stroke:#d97706,color:#000
  classDef store fill:#ffe6e6,stroke:#e60000,color:#000
  class CT,DASH browser
  class IDX,AN,SESS worker
  class KV store
```

## Capture path (write) — POST /auth/analytics

```mermaid
sequenceDiagram
    autonumber
    participant B as Customer browser
    participant T as sharelink-tracking.js
    participant W as Worker (analytics.js)
    participant K as ANALYTICS_KV

    B->>T: page loads (lazy.js mounts tracker)
    T->>W: GET /auth/me (resolve identity)
    W-->>T: { method, verified }
    alt method is sharelink / magiclink
        Note over T: generate per-load view_id
        T->>W: POST page_view {path, view_id, device, referrer}
        loop on scroll (25/50/75/100)
            T->>W: POST scroll_depth {depth, view_id}
        end
        T->>W: POST cta_click {href} (mailto/pdf/CTA)
        T->>W: POST time_on_page {duration_seconds} (on pagehide, keepalive)
    else staff / anonymous
        Note over T: self-abort — no events sent
    end

    Note over W: getSession() · validate event+path<br/>clamp depth 0–100, duration 0–86400<br/>derive domain/email from SESSION (not body)
    W->>K: put p:{pathKey} = path (idempotent)
    W->>K: put e:{pathKey}:{ts}-{rand} = event JSON<br/>+ metadata {ev,ts,dom,vid,d,dur}
    W-->>B: { ok: true, stored: true }
```

## Dashboard path (read) — GET /auth/analytics

```mermaid
flowchart LR
  DASH["engagement-dashboard"] -->|GET| G{"staff session?<br/>isStaffEmail()"}
  G -->|no| F["403 Staff access required"]
  G -->|yes| Q{"?path= present?"}

  Q -->|no · global| GL["list p: → each page<br/>list e:{pathKey}: → summarize()"]
  GL --> ROLL["roll up totals<br/>(dedupe domains across pages)"]
  ROLL --> R1["{ total, data[rows], totals }"]

  Q -->|yes · per-page| PP["list e:{pathKey}:<br/>summarize() + fetch newest 200 bodies"]
  PP --> R2["{ summary, data[events], total }"]

  R1 --> DASH
  R2 --> DASH

  classDef ok fill:#e6f7ec,stroke:#2a8a4a,color:#000
  classDef bad fill:#ffe6e6,stroke:#e60000,color:#000
  class R1,R2 ok
  class F bad
```

## KV schema (ANALYTICS_KV)

Every event is its **own immutable key** — no read-modify-write, so concurrent
events on the same page can never overwrite each other (this is what makes
"100% capture" hold). Summaries are computed on read.

```mermaid
flowchart TB
  subgraph KV["ANALYTICS_KV namespace"]
    P["p:{pathKey}<br/><i>value:</i> /accounts/a/apple/<br/><i>idempotent — enumerate pages</i>"]
    E1["e:{pathKey}:{ts}-{rand}<br/><i>value:</i> full event JSON<br/><i>metadata:</i> {ev,ts,dom,vid,d,dur}"]
    E2["e:{pathKey}:{ts}-{rand}<br/>…one key per event…"]
  end
  N["pathKey = URL-safe base64(path)<br/>pathToKey() in analytics.js"] -.-> P

  classDef store fill:#fff7e6,stroke:#d97706,color:#000
  class P,E1,E2 store
```

**Derived-on-read metrics** (`summarize()`): `total_views`, `unique_visitors`
(distinct domains), `avg_scroll_depth` (mean of **furthest depth per view_id**,
not per milestone), `cta_clicks`, `avg_time_seconds`, `first_viewed`,
`last_viewed`. The global response adds a `totals` object that de-duplicates
visitor domains **across** pages.

## Privacy model

```mermaid
flowchart TB
  EV["incoming event<br/>(authenticated session)"] --> M{"session.method"}
  M -->|"oauth / staff<br/>(verified · interactive)"| V["store viewer_email<br/>+ viewer_domain"]
  M -->|"sharelink / magiclink<br/>(link-borne · unproven)"| L["store viewer_domain only<br/>viewer_email = null"]
  Note["a client-supplied viewer_email in the<br/>body is ignored — identity comes<br/>from the session, server-side"]

  classDef verified fill:#e6f7ec,stroke:#2a8a4a,color:#000
  classDef link fill:#e6f0ff,stroke:#1a6fb5,color:#000
  class V verified
  class L link
```

## Where each piece lives

| Component | Location | In Git repo? |
|---|---|---|
| `sharelink-tracking.js` (client) | `scripts/utils/` | ✅ yes |
| `engagement-dashboard` block | `blocks/engagement-dashboard/` | ✅ yes |
| `analytics.js` (Worker handler) | `workers/cloudflare/cug-adobe-oauth-worker/src/` | ✅ yes |
| `ANALYTICS_KV` (event data) | Cloudflare edge (KV namespace) | ❌ hosted by Cloudflare |
| DA sheets (`/data/*.json`) | Adobe DA content store, served via Edge Delivery | ❌ authored in da.live |
```

> Note: event **data** is not stored in the repo or as files — it lives in the
> Cloudflare KV namespace referenced by `id` in `wrangler.toml`. See PROJECT.md
> → "Share-link engagement analytics" for the full write-up.
