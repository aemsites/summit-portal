export const BOOTH_DEMOS = Object.freeze([
  ['carvelo', 'Automotive', 'Carvelo', 'Automotive'],
  ['frescopa', 'Consumer goods / coffee', 'Frescopa', 'Consumer goods'],
  ['securfinancial', 'Financial services', 'SecurFinancial', 'Financial services'],
  ['halliby', 'Food & grocery', 'Halliby', 'Food & grocery'],
  ['we-healthcare', 'Healthcare / health insurance', 'We.Healthcare', 'Healthcare'],
  ['binji', 'Media & publishing', 'Binji / Exp News', 'Media & publishing'],
  ['bodea', 'Professional services', 'Bodea', 'Professional services'],
  ['luma', 'Retail / apparel', 'Luma', 'Retail & apparel'],
  ['citisignal', 'Telecommunications', 'CitiSignal', 'Telecom'],
  ['wknd-fly', 'Travel / aviation', 'WKND Fly', 'Travel & aviation'],
].map(([id, industry, company, label]) => Object.freeze({ id, industry, company, label, path: `/example-report/${id}/` })));

export function findBoothDemo(id) {
  return BOOTH_DEMOS.find((demo) => demo.id === id);
}
