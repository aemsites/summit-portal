const defaultHeading = 'Amplify your brand visibility';
const CAMPAIGN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function readBoothCampaign(search) {
  const values = new URLSearchParams(search).getAll('campaign');
  return values.length === 1 && values[0].length === 36 && CAMPAIGN_ID.test(values[0]) ? values[0] : '';
}

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
  const campaign = readBoothCampaign(search);
  return {
    heading: validHeading ? heading : '',
    brand,
    entry: '3',
    finish: '6',
    ...(touchscreen ? { touchscreen } : {}),
    ...(campaign ? { campaign } : {}),
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
  if (presentation.campaign) params.set('campaign', presentation.campaign);
  if (['1', 'frame'].includes(presentation.touchscreen)) params.set('touchscreen', presentation.touchscreen);
  if (pathname === '/booth' && new URLSearchParams(query).get('recover') === '1') params.set('recover', '1');
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ''}`;
}

export function boothStaffLogin(presentation, { exit = false } = {}) {
  const setup = {
    ...presentation,
    ...(presentation.touchscreen ? { touchscreen: '1' } : {}),
  };
  const campaign = setup.campaign ? `&campaign=${setup.campaign}` : '';
  if (exit && !campaign) return '/login?staff&exit-booth';
  return `/login?staff${exit ? '&exit-booth' : ''}${campaign}&redirect=${encodeURIComponent(withBoothPresentation('/booth', setup))}`;
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
