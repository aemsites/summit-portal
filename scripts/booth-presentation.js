const defaultHeading = 'Adobe Brand Visibility';

/** Cosmetic URL settings never provide report access or select a report. */
export function readBoothPresentation(search = '') {
  const params = new URLSearchParams(search);
  const value = params.getAll('heading').length === 1 ? params.get('heading') : '';
  const heading = value.trim();
  const validHeading = heading && Array.from(heading).length <= 80
    && !/[\p{C}\p{Zl}\p{Zp}<>]/u.test(value);
  const brand = params.getAll('brand').length === 1 && params.get('brand') === 'semrush'
    ? 'semrush' : 'adobe';
  return {
    heading: validHeading ? heading : '',
    brand,
    entry: '3',
    finish: '5',
  };
}

/** Keep only presentation settings and the explicitly requested Finish step. */
export function withBoothPresentation(path, presentation) {
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams();
  if (pathname === '/booth' && new URLSearchParams(query).get('step') === 'finish') {
    params.set('step', 'finish');
  }
  if (presentation.heading) params.set('heading', presentation.heading);
  if (presentation.brand === 'semrush') params.set('brand', 'semrush');
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ''}`;
}

export function applyBoothPresentation(root, presentation) {
  const stage = root.getElementById('stage');
  stage.dataset.brand = presentation.brand;
  stage.dataset.entry = '3';
  stage.dataset.finish = '5';
  const heading = root.querySelector('.brand span');
  if (heading) heading.textContent = presentation.heading || defaultHeading;
  const login = root.getElementById('staff-login');
  if (login) {
    login.href = `/login?staff&redirect=${encodeURIComponent(withBoothPresentation('/booth', presentation))}`;
  }
}
