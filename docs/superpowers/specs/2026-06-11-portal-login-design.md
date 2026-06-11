# portal-login Block — Design Spec

**Date:** 2026-06-11
**Status:** Approved

## Overview

A new EDS block `portal-login` for the lock-in login selection page. It presents two equal-weight login options side by side: Adobe ID login (styling only) and magic link login (form with email input + API call).

## Source HTML

```html
<div class="portal-login">
  <div>
    <div>
      <p>If you already have an Adobe ID, you can use this one to log in to your brand report.</p>
      <p><strong><a href="/auth/portal">Login with Adobe ID</a></strong></p>
    </div>
    <div>If you don't have an Adobe ID, you can request a one-time login link with your corporate email address.</div>
  </div>
</div>
```

The outer `<div class="portal-login">` is the block root. Its single child `<div>` is the row. Its two `<div>` children are the two columns (col-1 = Adobe ID, col-2 = magic link).

## Files

- `blocks/portal-login/portal-login.js`
- `blocks/portal-login/portal-login.css`

## Layout

- Desktop (≥1000px): two equal columns side by side — `display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-xl)`
- Mobile (<1000px): single column stacked, full-width edge-to-edge
- Block container: centered, `max-width: 1200px`, `24px` side padding on desktop

## Card Visual Treatment (both columns)

- `background: var(--color-surface-raised)`
- `border: 1px solid var(--color-border)`
- `border-radius: 16px` on desktop, `0` on mobile
- `box-shadow: var(--rpt-card-shadow)`
- `padding: var(--spacing-xl)` (32px)
- Equal visual weight — no accent colour difference between cards

Each card gets a small heading injected by JS:
- Col 1: "Adobe ID"
- Col 2: "Magic Link"

Heading styled at `--heading-font-size-xs` (18px), `font-weight: 600`, with a `1px solid var(--color-border)` bottom border and `padding-bottom: var(--spacing-s)` + `margin-bottom: var(--spacing-m)` to separate from content.

## Column 1 — Adobe ID (styling only)

The `<strong><a href="/auth/portal">` link is decorated by JS with classes `.btn .btn-primary` (defined in `styles.css`) to render as a full-width button. No additional logic beyond the existing href.

## Column 2 — Magic Link (form)

### DOM after JS decoration

```
[existing text paragraph — unchanged]
<form class="pl-magic-form">
  <label class="pl-label" for="pl-email">Email address</label>
  <input class="pl-input" id="pl-email" type="email" name="email"
         placeholder="your@company.com" required autocomplete="email">
  <button class="pl-submit btn" type="submit">Send login link</button>
</form>
```

### Endpoint

A constant `MAGIC_LINK_ENDPOINT` at the top of `portal-login.js` holds the API URL — left as a placeholder (`''`) for the author to fill in.

### Submit flow

1. Prevent default form submission.
2. Read and trim the email value; abort if empty/invalid (HTML5 validation handles UI).
3. Disable the submit button, set its text to `"Sending…"`.
4. `POST` to `MAGIC_LINK_ENDPOINT` with `Content-Type: application/json` body `{ email }`.
5. **Success (2xx):** Remove the form, insert a confirmation paragraph:
   > "Check your inbox — we've sent a login link to `{email}`."
6. **Error (non-2xx or network failure):** Re-enable the submit button, restore its text. Show an inline error element below the button:
   > "Something went wrong. Please try again."
   Error element has class `pl-error`; hidden by default, shown on failure.

### Form input styling

- `width: 100%`, `box-sizing: border-box`
- `border: 1px solid var(--color-border)`
- `border-radius: 8px`
- `padding: 10px var(--spacing-m)`
- `font: inherit`
- `background: var(--color-surface)`, `color: var(--color-text)`
- Focus ring: `outline: 2px solid var(--color-adobe-red)`, `outline-offset: 2px`
- Submit button: full-width, `background: var(--color-adobe-red)`, white text, same `.btn` border/padding pattern, hover `var(--color-adobe-red-hover)`

## Mobile "or" Separator

On mobile, JS injects a `<div class="pl-divider"><span>or</span></div>` between the two cards. Styled as a horizontal rule with centred "or" text using `--color-text-muted`.

On desktop the divider is hidden (`display: none`) — the grid gap is sufficient.

## Dark Mode

All colour tokens (`--color-surface-raised`, `--color-border`, `--color-text`, `--color-text-muted`, `--rpt-card-shadow`) already handle light/dark via `light-dark()` in `styles.css`. No extra dark-mode overrides needed.

## Accessibility

- Label is associated with the email input via `for`/`id`.
- Error message uses `role="alert"` so screen readers announce it on failure.
- Submit button disabled state is handled via the `disabled` attribute.
- Adobe ID button (`<a>`) retains its `href` — keyboard and screen-reader accessible as a link.
