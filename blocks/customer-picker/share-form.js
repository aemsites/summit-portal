/**
 * Share controls for the customer picker: mint a one-month link to ONE page and
 * either email it to a recipient or copy it to the clipboard. Split out of
 * customer-picker.js so that file can stay focused on the picker itself.
 */

/** Same-origin path for a shareable deep link — strips the origin but PRESERVES
 *  the page path exactly (incl. any trailing slash), so a folder/index page
 *  (e.g. `/accounts/.../1800flowers-com/`) resolves to its index. This mirrors
 *  the "Open" CTA, which links to `company.Folder` verbatim. */
export function folderToDeepLink(folder) {
  try {
    return new URL(folder).pathname;
  } catch {
    return folder;
  }
}

// Clipboard icon for the "Copy link" button (inline SVG, currentColor).
const COPY_ICON = '<svg class="cp-share-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">'
  + '<rect x="9" y="9" width="13" height="13" rx="2"/>'
  + '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

/** POST to /auth/sharelink for a page `path`. `mode` is 'email' (send to a
 *  recipient) or 'copy' (mint a link for the caller, no email). Returns the
 *  parsed JSON body plus the HTTP status so callers can branch on both. */
async function requestShareLink(path, { mode, email } = {}) {
  const body = { path, mode };
  if (email) body.email = email;
  const resp = await fetch('/auth/sharelink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, ok: resp.ok, data };
}

/**
 * Build the "Share this page" controls for a SPECIFIC page `path`. Two
 * independent ways to share, both minting a one-month link that opens the page
 * directly (no login):
 *   1. Send link — staff type a recipient; the worker emails them the link,
 *      scoped to just that recipient's domain. The email is required here
 *      because it's where the link actually goes.
 *   2. Copy link — mints a link on click and copies it to the clipboard, with
 *      NO email sent and no email needed: the worker grants every non-staff
 *      domain the page already allows, since there's no single recipient to
 *      scope to. The primary recovery path when a recipient's mail gateway
 *      blocks the emailed copy: paste it into Slack/Teams instead.
 * Page access is still enforced by the page's own CUG for anyone navigating
 * there without the link. Returns the wrapper element.
 */
export function buildShareForm(path) {
  const wrap = document.createElement('div');
  wrap.className = 'cp-share-form-wrap';

  const hint = document.createElement('p');
  hint.className = 'cp-share-hint';
  hint.textContent = 'A one-click link that opens this page directly — no login needed. Works for one month. Type an email to send it directly, or just copy the link below — no email needed.';
  wrap.append(hint);

  // --- Email path (recipient typed, worker sends the email) ---
  const form = document.createElement('form');
  form.className = 'cp-share-form';

  const input = document.createElement('input');
  input.type = 'email';
  input.className = 'cp-share-input';
  input.placeholder = 'name@email.com';
  input.setAttribute('inputmode', 'email');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-label', "Recipient's (customer) email — required to send the link, not to copy it");
  input.required = true;

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'cp-dialog-cta cp-share-send';
  button.textContent = 'Send link';

  form.append(input, button);
  wrap.append(form);

  // --- "or" divider ---
  const divider = document.createElement('div');
  divider.className = 'cp-share-or';
  divider.append(Object.assign(document.createElement('span'), { textContent: 'or' }));
  wrap.append(divider);

  // --- Copy path (mints + copies on click, no email needed) ---
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'cp-dialog-cta cp-dialog-cta--secondary cp-share-copy';
  copyBtn.innerHTML = `${COPY_ICON}<span class="cp-share-copy-label">Copy link</span>`;
  wrap.append(copyBtn);

  const status = document.createElement('p');
  status.className = 'cp-share-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  wrap.append(status);

  function setStatus(message, kind) {
    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim().toLowerCase();
    if (!email) return;

    button.disabled = true;
    input.disabled = true;
    setStatus('Sending…', 'pending');

    try {
      const { status: code, ok, data } = await requestShareLink(path, { mode: 'email', email });
      if (ok && data.result === 'sent') {
        setStatus(`Sent a one-month link to ${email} ✓`, 'success');
        input.value = '';
      } else if (code === 401) {
        setStatus('Your session expired — please reload and sign in again.', 'error');
        input.disabled = false;
      } else {
        setStatus(data.error || 'Could not send the link. Please try again.', 'error');
        input.disabled = false;
      }
    } catch {
      setStatus('Network error — please try again.', 'error');
      input.disabled = false;
    } finally {
      button.disabled = false;
    }
  });

  const copyLabel = copyBtn.querySelector('.cp-share-copy-label');
  let copyResetTimer;
  copyBtn.addEventListener('click', async () => {
    clearTimeout(copyResetTimer);

    copyBtn.disabled = true;
    setStatus('Generating link…', 'pending');

    try {
      const { status: code, ok, data } = await requestShareLink(path, { mode: 'copy' });
      if (ok && data.result === 'link' && data.link) {
        try {
          await navigator.clipboard.writeText(data.link);
        } catch {
          // Clipboard API blocked (insecure context / permissions): fall back to
          // a hidden textarea + execCommand so Copy still works.
          const ta = document.createElement('textarea');
          ta.value = data.link;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.append(ta);
          ta.select();
          document.execCommand?.('copy');
          ta.remove();
        }
        copyLabel.textContent = 'Copied ✓';
        setStatus('Link copied — paste it into Slack, Teams, or anywhere.', 'success');
        copyResetTimer = setTimeout(() => { copyLabel.textContent = 'Copy link'; }, 2500);
      } else if (code === 401) {
        setStatus('Your session expired — please reload and sign in again.', 'error');
      } else {
        setStatus(data.error || 'Could not generate the link. Please try again.', 'error');
      }
    } catch {
      setStatus('Network error — please try again.', 'error');
    } finally {
      copyBtn.disabled = false;
    }
  });

  return wrap;
}

/**
 * Single "Share this page" section bound to one page `path`. Used by
 * accounts/portal modes (one page per card). Report modes share per format
 * instead (see the format rows in renderDialog).
 */
export function buildShareSection(company) {
  if (!company.Folder) return null;

  // Preserve the trailing slash so the link lands on the folder's index page,
  // matching the "Open" CTA (which uses company.Folder verbatim).
  const path = folderToDeepLink(company.Folder);

  const section = document.createElement('div');
  section.className = 'cp-dialog-section cp-share';

  const heading = document.createElement('h4');
  heading.textContent = 'Share this page';
  section.append(heading);

  section.append(buildShareForm(path));
  return section;
}
