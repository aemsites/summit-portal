export const screens = {
  login: { sectionId: '1-staff-access-and-setup', label: 'Staff sign-in' },
  entry: { sectionId: '2-open-the-right-company-report', label: 'Email lookup / website selection' },
  demos: { sectionId: '3-choose-an-industry-example', label: 'Industry picker' },
  overview: { sectionId: '4-orient-the-visitor', label: 'Report overview / briefing' },
  visibility: { sectionId: '5-explain-the-ai-visibility-score', label: 'AI visibility' },
  competitors: { sectionId: '6-make-one-competitor-comparison', label: 'Competitive landscape' },
  platforms: { sectionId: '7-compare-the-ai-platforms', label: 'Platform visibility' },
  performance: { sectionId: '8-turn-a-finding-into-an-action', label: 'Performance insights' },
  search: { sectionId: '11-how-to-explain-search-signals', label: 'Search performance' },
  finish: { sectionId: '9-close-and-clear-the-visit', label: 'Company Finish' },
  recovery: { sectionId: '15-readiness-and-recovery', label: 'Recovery' },
};

export function matchUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  if (url.origin !== 'https://act.aem.now') return null;
  if (/^\/login\/?$/.test(url.pathname)) return 'login';
  if (/^\/booth\/?$/.test(url.pathname)) {
    if (url.searchParams.has('recover')) return 'recovery';
    if (url.searchParams.get('step') === 'finish') return 'finish';
    if (url.searchParams.get('step') === 'demos') return 'demos';
    return 'entry';
  }
  if (/^\/example-report\/[^/]+\/?$/.test(url.pathname)
    || /^\/accounts\/.+\/portal-landing(?:\/index(?:\.html)?)?\/?$/.test(url.pathname)) return 'overview';
  return null;
}
