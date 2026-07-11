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

  // Engagement tracking for shared pages — ANY shared page (reports, account
  // landing pages, etc.), not a fixed page type. Loaded everywhere; each tracker
  // self-gates so ordinary/internal visits generate nothing:
  //   - Worker (prod): self-aborts unless the session is share/magic-link.
  //   - sheet POC: self-aborts unless the URL carries a ?v= marker.
  //   - local POC: tracks all visits on this device (localStorage).
  // ANALYTICS_MODE picks the backend; default 'worker' (production path).
  import('./utils/analytics-config.js').then(({ ANALYTICS_MODE }) => {
    if (ANALYTICS_MODE === 'local') {
      import('./utils/sharelink-tracking-local.js').then(({ default: mount }) => mount());
    } else if (ANALYTICS_MODE === 'sheet') {
      import('./utils/sharelink-tracking-poc.js').then(({ default: mount }) => mount());
    } else {
      import('./utils/sharelink-tracking.js').then(({ default: mount }) => mount());
    }
  });

  loadSidekick();

  // Author facing tools
  if (ENV !== 'prod') {
    import('../tools/scheduler/scheduler.js');
  }
}());
