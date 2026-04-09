# Static share bundle

Portable **HTML + CSS + JS** under `static-share/dist/`, built from the same React source without changing the main app (`vite.config.ts`, `pnpm dev`, or `pnpm build` stay as they are).

## Opening `index.html` from disk (`file://`)

The bundle is built as **IIFE** and loaded with a **classic** `<script src="./assets/index-*.js">` (no `type="module"`), because Chromium blocks ES module scripts on `file://`.

The build **patches** Vite’s default `document.currentScript` asset base so file URLs resolve from the entry script under **`assets/`** (not only from `index.html`). Prerender still rewrites image `src` / `url(...)` from `./file-hash.ext` to **`./assets/...`** where needed.

Copy the **entire** `static-share/dist/` folder (`index.html` and `assets/` together). Opening only `index.html` without `assets/` breaks scripts and images.

Adobe IMS calls use **null** origin on `file://` and can fail CORS; the app is written to load without sign-in. Use **`pnpm run preview:static-share`** if your browser blocks local files or you need HTTP behavior.

## Commands

```bash
pnpm run build:static-share
pnpm run preview:static-share
```

One-time Chromium for prerender: `pnpm exec playwright install chromium`.

`static-share/dist/` is gitignored. Run the build in CI when you need artifacts.

## What you get

- **Relative asset URLs** (`base: ./`) so the folder works from disk, a subpath, or any static host.
- **All bundled raster and file-based SVG assets** emitted under `assets/` (nothing inlined as base64) plus `vite.svg` at the root from `static-share/public/`. Inline SVG in React components stays inside the JS bundle, same as the main app.
- **Prerendered `index.html`** waits for the report **carousel** and slide navigation before capture, then inlines the main CSS and fixes preview URLs so the snapshot matches a fully laid-out view (Recharts, hero imagery, PDF card art).
- **One JavaScript bundle** (IIFE, not ES modules in the tag) that runs the **same React app** as `pnpm dev`: buttons, hovers, Spectrum interactions, **carousel prev/next and slide tabs**, and charts work after the script loads. Prefer **HTTP(S)** (`pnpm run preview:static-share` or any static server) if `file://` is restricted.

This is not a hand-written vanilla rewrite; it is the same app packaged as static files your other stack can host, iframe, or copy.

### Where the “static” JavaScript lives

All client behavior (React, Spectrum, carousel, charts, buttons, hovers, state) is **compiled into a single file** under `assets/index-*.js`. There are **no separate lazy-loaded chunk files** to copy or mis-path: the static-share build sets `inlineDynamicImports: true` so the Rollup graph is one bundle. You still load it with `<script type="module">` (served over HTTP); the runtime is React, shipped inside that file, not a second framework install.

External resources that are not part of the repo (for example **Adobe Fonts / Typekit** from `src/index.css`) still load from the network when the page runs, same as the main app.

## Using in another stack

Copy the entire `static-share/dist/` directory (keep `index.html` and `assets/` together). Serve with any static file host or drop into the other project’s `public/` folder if their router allows.

## Keeping configs in sync

`vite.config.static-share.ts` mirrors `vite.config.ts` except `base` and `outDir`. If you add aliases or plugins to the main config, update the static-share copy too.
