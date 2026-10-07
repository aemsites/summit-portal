export const BOOTH_DEMOS = Object.freeze([
  ['carvelo', 'Automotive', 'Carvelo'],
  ['frescopa', 'Consumer goods / coffee', 'Frescopa'],
  ['securfinancial', 'Financial services', 'SecurFinancial'],
  ['halliby', 'Food & grocery', 'Halliby'],
  ['we-healthcare', 'Healthcare / health insurance', 'We.Healthcare'],
  ['binji', 'Media & publishing', 'Binji / Exp News'],
  ['bodea', 'Professional services', 'Bodea'],
  ['luma', 'Retail / apparel', 'Luma'],
  ['citisignal', 'Telecommunications', 'CitiSignal'],
  ['wknd-fly', 'Travel / aviation', 'WKND Fly'],
].map(([id, industry, company]) => Object.freeze({ id, industry, company, path: `/example-report/${id}/` })));

export function findBoothDemo(id) {
  return BOOTH_DEMOS.find((demo) => demo.id === id);
}
