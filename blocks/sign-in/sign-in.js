const AUTH_PORTAL = '/auth/portal';
const AUTH_LOGOUT = '/auth/logout';
const AUTH_ME = '/auth/me';

async function getUser() {
  // Try the /auth/me endpoint first (returns user info from auth cookie)
  try {
    const resp = await fetch(AUTH_ME, { credentials: 'include' });
    if (resp.ok) {
      const data = await resp.json();
      if (data.authenticated && data.email) return { loggedIn: true, ...data };
    }
  } catch { /* not available */ }

  // Fallback: detect auth state via /auth/portal redirect
  try {
    const resp = await fetch(AUTH_PORTAL, { credentials: 'include', redirect: 'follow' });
    if (!resp.ok) return { loggedIn: false };
    const { pathname } = new URL(resp.url);
    if (pathname.startsWith('/customers/')) return { loggedIn: true, name: 'Signed In' };
    if (pathname.startsWith('/adobe/')) return { loggedIn: true, name: 'Adobe Employee' };
  } catch { /* not available */ }

  return { loggedIn: false };
}

function buildSignedIn(user) {
  const wrapper = document.createElement('div');
  wrapper.className = 'sign-in-profile';

  const avatar = document.createElement('div');
  avatar.className = 'sign-in-avatar';
  avatar.setAttribute('aria-hidden', 'true');

  if (user.picture) {
    const img = document.createElement('img');
    img.src = user.picture;
    img.alt = user.name || user.email || '';
    avatar.append(img);
  } else {
    const initials = (user.name || user.email || '?')
      .split(/[\s@]/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() || '')
      .join('');
    avatar.textContent = initials;
  }

  const info = document.createElement('div');
  info.className = 'sign-in-info';

  const name = document.createElement('span');
  name.className = 'sign-in-name';
  name.textContent = user.name || user.email || 'Signed In';

  const email = document.createElement('span');
  email.className = 'sign-in-email';
  email.textContent = user.email || '';

  const signOut = document.createElement('a');
  signOut.className = 'sign-in-action';
  signOut.href = AUTH_LOGOUT;
  signOut.textContent = 'Sign out';
  signOut.addEventListener('click', () => {
    sessionStorage.removeItem('sign-in-user');
  });

  info.append(name, ...(user.email ? [email] : []), signOut);
  wrapper.append(avatar, info);
  return wrapper;
}

function buildSignedOut() {
  const wrapper = document.createElement('div');
  wrapper.className = 'sign-in-prompt';

  const signIn = document.createElement('a');
  signIn.className = 'sign-in-btn';
  signIn.href = AUTH_PORTAL;
  signIn.textContent = 'Sign in';

  wrapper.append(signIn);
  return wrapper;
}

export default async function init(el) {
  el.innerHTML = '<div class="sign-in-loading" aria-live="polite">Checking sign-in status…</div>';

  // Use cached session if available
  let user;
  const cached = sessionStorage.getItem('sign-in-user');
  if (cached) {
    try { user = JSON.parse(cached); } catch { /* ignore */ }
  }

  if (!user) {
    user = await getUser();
    if (user.loggedIn) sessionStorage.setItem('sign-in-user', JSON.stringify(user));
  }

  el.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'sign-in-container';
  container.classList.add(user.loggedIn ? 'is-signed-in' : 'is-signed-out');
  container.append(user.loggedIn ? buildSignedIn(user) : buildSignedOut());
  el.append(container);
}
