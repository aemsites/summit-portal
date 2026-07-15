import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import qrcodegen from './qrcode.mjs';

const DA_SOURCE_BASE = 'https://admin.da.live/source';
const CUG_SHEET_PATH = 'closed-user-groups.json';
const DEFAULT_MAGICLINK_ORIGIN = 'https://act.aem.now';

// ─── CUG scope classification (authoritative read from the DA sheet) ─────────

function normaliseScope(value) {
  if (typeof value !== 'string') return null;
  return value.replace(/\*+$/, '').replace(/\/+$/, '');
}

function scopeCoversPath(scope, targetPath) {
  const base = normaliseScope(scope);
  const target = normaliseScope(targetPath);
  if (!base || !target) return false;
  return target === base || target.startsWith(`${base}/`);
}

function accountScopeFromPath(publicPath) {
  const parts = normaliseScope(publicPath)?.split('/').filter(Boolean) ?? [];
  if (parts[0] === 'accounts' && parts.length >= 3) return `/${parts.slice(0, 3).join('/')}`;
  return null;
}

/** Rows from the closed-user-groups sheet → scope verdict for the path. */
function evaluateCugScope(rows, publicPath) {
  const gated = rows.filter((r) => String(r['cug-required'] || '').trim().toLowerCase() === 'true');
  const covering = gated.filter((r) => scopeCoversPath(r.url, publicPath));
  if (!covering.length) return { covered: false };

  const longest = covering.reduce((max, r) => Math.max(max, normaliseScope(r.url).length), 0);
  const winner = covering.find((r) => normaliseScope(r.url).length === longest);
  const scope = normaliseScope(winner.url);
  const groups = String(winner['cug-groups'] || '').split(',').map((g) => g.trim()).filter(Boolean);
  const acct = accountScopeFromPath(publicPath);
  const narrow = acct ? scope.startsWith(acct) : scope.split('/').filter(Boolean).length >= 3;
  return { covered: true, narrow, scope, groups };
}

async function fetchCugRows(org, site, token) {
  const url = `${DA_SOURCE_BASE}/${org}/${site}/${CUG_SHEET_PATH}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  const json = await resp.json().catch(() => ({}));
  return Array.isArray(json.data) ? json.data : null;
}

// ─── Mint + QR ───────────────────────────────────────────────────────────────

async function mintMagicLink({
  publicPath, magicLinkOrigin, email, token,
}) {
  const body = { path: publicPath, mode: 'copy' };
  if (email) body.email = email;
  let resp;
  try {
    resp = await fetch(`${magicLinkOrigin}/auth/sharelink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // EW has the DA IMS token, not the act.aem.now cookie — authorize with it.
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: 'Could not reach the link service.' };
  }
  if (resp.status === 401 || resp.status === 403) {
    return { error: 'Sign in to the portal to generate a link.', signInUrl: `${magicLinkOrigin}/login` };
  }
  if (!resp.ok) return { error: `Link service error (${resp.status}).` };
  const json = await resp.json().catch(() => ({}));
  if (!json.link) return { error: 'No link returned.' };
  return { link: json.link };
}

function qrDataUrl(text) {
  const qr = qrcodegen(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 12);
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids.filter(Boolean));
  return node;
}

function renderScopeNote(scope, publicPath) {
  if (!scope) return el('p', { className: 'note', textContent: 'Couldn’t read the access-control config — make sure this microsite has its own account access group before sharing.' });
  if (!scope.covered) return el('p', { className: 'note warn', textContent: `Not access-controlled yet — a link will fail. Set up an access group for ${publicPath} first.` });
  if (!scope.narrow) return el('p', { className: 'note warn', textContent: `Heads up: covered by a broad access group (${scope.scope}). A link may open sibling accounts. Consider a per-account group.` });
  return el('p', { className: 'note', textContent: `Access group: ${scope.groups.join(', ') || scope.scope} (account-specific).` });
}

(async function init() {
  const { context, token } = await DA_SDK;
  const { org, site, path } = context;
  const magicLinkOrigin = DEFAULT_MAGICLINK_ORIGIN;
  const publicPath = path || null;

  const root = el('div', { className: 'ml' });
  document.body.append(root);
  root.append(el('h2', { textContent: 'Generate magic link' }));

  if (!publicPath) {
    root.append(el('p', { className: 'note warn', textContent: 'Open a microsite document first.' }));
    return;
  }

  const micrositeUrl = `${magicLinkOrigin}${publicPath}`;
  root.append(el('p', { className: 'lead', textContent: 'Create a 7-day authenticated link the customer can open with no sign-in.' }));
  root.append(el('p', { className: 'mono url', textContent: micrositeUrl }));

  const rows = await fetchCugRows(org, site, token);
  const scope = rows ? evaluateCugScope(rows, publicPath) : null;
  root.append(renderScopeNote(scope, publicPath));

  const emailInput = el('input', { type: 'email', id: 'ml-email', placeholder: 'name@customer.com (optional)', inputMode: 'email' });
  root.append(el('label', { className: 'field' }, el('span', { textContent: 'Customer email — binds the link to them (optional)' }), emailInput));

  const status = el('div', { className: 'status' });
  const result = el('div', { className: 'result' });
  const genBtn = el('button', { className: 'action-btn', textContent: 'Generate secure link' });

  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true;
    status.className = 'status loading';
    status.textContent = 'Generating…';
    result.replaceChildren();
    const res = await mintMagicLink({
      publicPath, magicLinkOrigin, email: emailInput.value.trim() || undefined, token,
    });
    if (res.error) {
      status.className = 'status error';
      status.textContent = res.error;
      if (res.signInUrl) result.append(el('a', { className: 'secondary-btn', href: res.signInUrl, target: '_blank', rel: 'noopener noreferrer', textContent: 'Sign in to the portal' }));
      genBtn.disabled = false;
      return;
    }
    status.className = 'status';
    status.textContent = '';
    const linkField = el('input', { className: 'mono', type: 'text', readOnly: true, value: res.link });
    linkField.addEventListener('focus', () => linkField.select());
    const copyBtn = el('button', { className: 'action-btn', textContent: 'Copy link' });
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(res.link); copyBtn.textContent = 'Copied'; setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1500); } catch { /* manual select */ }
    });
    result.append(
      el('div', { className: 'result-row' },
        el('img', { className: 'qr', src: qrDataUrl(res.link), alt: 'QR code for the microsite link', width: 180, height: 180 }),
        el('div', { className: 'linkbox' }, linkField, el('p', { className: 'hint', textContent: 'Anyone with this link opens the microsite for 7 days. Treat it like a password.' }), copyBtn)),
    );
    genBtn.disabled = false;
  });

  root.append(genBtn, status, result);
}());
