const defaultHeading = 'Amplify your brand visibility';

/** Cosmetic URL settings never provide report access or select a report. */
export function readBoothPresentation(search = '') {
  const params = new URLSearchParams(search);
  const value = params.getAll('heading').length === 1 ? params.get('heading') : '';
  const heading = value.trim();
  const validHeading = heading && Array.from(heading).length <= 80
    && !/[\p{C}\p{Zl}\p{Zp}<>]/u.test(value);
  const brand = params.getAll('brand').length === 1 && params.get('brand') === 'semrush'
    ? 'semrush' : 'adobe';
  const touchscreen = params.getAll('touchscreen').length === 1
    && ['1', 'frame'].includes(params.get('touchscreen')) ? params.get('touchscreen') : '';
  return {
    heading: validHeading ? heading : '',
    brand,
    entry: '3',
    finish: '6',
    ...(touchscreen ? { touchscreen } : {}),
  };
}

/** Keep only presentation settings and explicitly supported booth screens. */
export function withBoothPresentation(path, presentation) {
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams();
  if (pathname.startsWith('/accounts/') || pathname.startsWith('/example-report/')) params.set('booth', '1');
  const step = new URLSearchParams(query).get('step');
  if (pathname === '/booth' && ['finish', 'demos', 'picker'].includes(step)) {
    params.set('step', step);
  }
  if (presentation.heading) params.set('heading', presentation.heading);
  if (presentation.brand === 'semrush') params.set('brand', 'semrush');
  if (['1', 'frame'].includes(presentation.touchscreen)) params.set('touchscreen', presentation.touchscreen);
  if (pathname === '/booth' && new URLSearchParams(query).get('recover') === '1') params.set('recover', '1');
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ''}`;
}

export function boothStaffLogin(presentation) {
  const setup = {
    ...presentation,
    ...(presentation.touchscreen ? { touchscreen: '1' } : {}),
  };
  return `/login?staff&redirect=${encodeURIComponent(withBoothPresentation('/booth', setup))}`;
}

export function applyBoothPresentation(root, presentation) {
  const stage = root.getElementById('stage');
  stage.dataset.brand = presentation.brand;
  stage.dataset.entry = '3';
  stage.dataset.finish = '6';
  const heading = root.querySelector('.brand span');
  if (heading) heading.textContent = presentation.heading || defaultHeading;
  const login = root.getElementById('staff-login');
  if (login) {
    login.href = boothStaffLogin(presentation);
  }
}
