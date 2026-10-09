import ENV from './utils/env.js';

async function loadSidekick() {
  const getSk = () => document.querySelector('aem-sidekick');

  const sk = getSk() || await new Promise((resolve) => {
    document.addEventListener('sidekick-ready', () => resolve(getSk()));
  });
  if (sk) import('../tools/sidekick/sidekick.js').then((mod) => mod.default(sk));
}

(function loadLazy() {
  import('../blocks/metadata/metadata.js').then(({ hidePageDataSections }) => {
    hidePageDataSections();
  });

  import('./utils/lazyhash.js');
  import('./utils/favicon.js');

  const relocateFooters = () => import('../blocks/report-ai-visibility/relocate-section-footer.js')
    .then(({ relocateAllSectionFooters }) => relocateAllSectionFooters());

  import('./utils/footer.js').then(({ default: footer }) => footer().then(relocateFooters));

  if (window.location.pathname.startsWith('/accounts/')) {
    import('./utils/account-resources.js').then(({ default: mount }) => mount());
  }

  if (document.querySelector('.report-hero.insight')) {
    import('./utils/insights-feedback.js').then(({ default: mount }) => mount());
    import('./utils/insights-tracking.js').then(({ default: mount }) => mount());
    import('./utils/brand-chip.js').then(({ default: mount }) => mount());
    import('./utils/cannes-stripe.js').then(({ default: mount }) => mount());
    relocateFooters();
  }

  loadSidekick();

  // Author facing tools
  if (ENV !== 'prod') {
    import('../tools/scheduler/scheduler.js');
  }
}());
