import { loadStyle } from './ak.js';

const DIH_URL = 'https://digital-insights.corp.adobe.com/';
const SLACK_URL = 'https://adobe.enterprise.slack.com/archives/C0ABMNDLXC5';

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function sameDestination(link, href) {
  const candidate = new URL(link.href, window.location.origin);
  const wanted = new URL(href, window.location.origin);
  return candidate.pathname.replace(/\/$/, '') === wanted.pathname.replace(/\/$/, '')
    && (href.startsWith('/') || candidate.hostname === wanted.hostname);
}

function moveLink(main, href, label) {
  const found = [...main.querySelectorAll('a[href]')].find((link) => sameDestination(link, href));
  const link = found || node('a');
  if (found) {
    const sourceLink = found.cloneNode(true);
    sourceLink.removeAttribute('id');
    found.replaceWith(sourceLink);
  } else {
    link.href = href;
    if (href.startsWith('https://')) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
  }
  link.className = 'dashboard-resource-link';
  link.textContent = label;
  return link;
}

function formatGuidance(source) {
  // Preserve authored heading nodes while nesting them under the dialog title.
  source.querySelectorAll('h2').forEach((heading) => {
    heading.setAttribute('aria-level', '3');
  });
  source.querySelectorAll('.rcl-text').forEach((paragraph) => {
    const first = [...paragraph.childNodes].find((child) => child.nodeType !== Node.TEXT_NODE
      || child.textContent.trim());
    if (first?.nodeName === 'STRONG') {
      const heading = node('h3', 'dashboard-guidance-lead');
      paragraph.before(heading);
      heading.append(first);
    }
    let current = paragraph;
    let prefix = '';
    [...paragraph.childNodes].forEach((child) => {
      if (child.nodeName === 'STRONG' && /[.!?]\s*$/.test(prefix)) {
        const next = node('p', 'rcl-text');
        current.after(next);
        current = next;
        prefix = '';
      }
      if (current !== paragraph) current.append(child);
      prefix += child.textContent;
    });
  });
}

function resourceDialog(id, title, sources) {
  const dialog = node('dialog', 'dashboard-resource-dialog');
  const header = node('div', 'dashboard-dialog-header');
  const heading = node('h2', '', title);
  heading.id = `${id}-title`;
  dialog.setAttribute('aria-labelledby', heading.id);
  const close = node('button', 'dashboard-dialog-close', '\u00d7');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close guidance');
  header.append(heading, close);
  const content = node('div', 'dashboard-dialog-content');
  content.tabIndex = 0;
  content.setAttribute('role', 'region');
  content.setAttribute('aria-labelledby', heading.id);
  sources.forEach((source) => {
    formatGuidance(source);
    const section = node('div', 'dashboard-guidance-section');
    section.append(source);
    content.append(section);
  });
  dialog.append(header, content);
  let opener;
  function closeDialog() {
    dialog.close();
    if (opener?.isConnected) opener.focus();
  }
  close.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom) closeDialog();
  });
  return {
    dialog,
    open(control, focusExport = false) {
      opener = control;
      if (focusExport) {
        const usage = dialog.querySelector('.dt-usage');
        if (usage) usage.open = true;
      }
      dialog.showModal();
      if (focusExport) dialog.querySelector('.dt-export select')?.focus();
      else close.focus();
    },
  };
}

function resourceCard(main, {
  id, title, copy, links = [], sources = [], detailsLabel, exportForm = false,
}) {
  const card = node('section', 'dashboard-resource-card');
  card.setAttribute('aria-labelledby', `${id}-heading`);
  const heading = node('h3', '', title);
  heading.id = `${id}-heading`;
  card.append(heading, node('p', 'dashboard-resource-copy', copy));
  const actions = node('div', 'dashboard-resource-actions');
  links.forEach(([path, label]) => actions.append(moveLink(main, path, label)));
  card.append(actions);
  if (sources.length) {
    const { dialog, open } = resourceDialog(id, title, sources);
    const action = node('button', `dashboard-resource-action${exportForm ? ' dashboard-export-action' : ''}`, detailsLabel);
    action.type = 'button';
    action.addEventListener('click', () => open(action, exportForm));
    actions.append(action);
    card.append(dialog);
  }
  return card;
}

function hasContent(element) {
  return !!element.textContent.trim()
    || !!element.querySelector('img, svg, canvas, video, iframe, a, button, input, select, form');
}

export async function composeDashboard(main, pathname = window.location.pathname) {
  if (pathname.replace(/\/$/, '') !== '/adobe/dashboard' || !main) return undefined;
  const existing = main.querySelector(':scope > .dashboard-shell');
  if (existing) return existing;
  const picker = main.querySelector('.customer-picker');
  if (!picker) return undefined;

  await loadStyle(new URL('../styles/dashboard.css', import.meta.url).href);

  const authoredSections = [...main.children];
  const callouts = [...main.querySelectorAll('.report-callout')];
  const requests = callouts.filter((block) => block.classList.contains('report-requests'));
  const playbooks = callouts.filter((block) => [...block.querySelectorAll('a[href]')]
    .some((link) => sameDestination(link, '/docs/sales-playbook')));
  const coverage = callouts.filter((block) => !requests.includes(block)
    && !playbooks.includes(block)
    && (block.classList.contains('coverage') || /semrush/i.test(block.textContent)));
  const known = new Set([...requests, ...playbooks, ...coverage]);
  const unknown = callouts.filter((block) => !known.has(block));
  const booth = [...main.querySelectorAll('.booth-guide-banner')];
  const tools = [...main.querySelectorAll('.dashboard-tools')];
  const title = main.querySelector('h1') || node('h1', '', 'Digital Opportunity Reports');
  const intro = title.closest('.default-content');
  const demoIntro = [...main.querySelectorAll('a[href]')]
    .find((link) => sameDestination(link, '/customers/0-9/000-demo/'))?.closest('.default-content');
  if (/^select a customer$/i.test(title.textContent.trim())) {
    title.textContent = 'Digital Opportunity Reports';
  }

  const shell = node('section', 'dashboard-shell');
  const header = node('div', 'dashboard-heading');
  const copy = node('div');
  copy.append(title, node('p', 'dashboard-intro', 'Find a company, open a report, or share a magic link.'));
  const requestMore = node('div', 'dashboard-request-more');
  const dih = moveLink(main, DIH_URL, 'Request in Digital Insights Hub');
  requestMore.append(node('span', '', 'Need more reports?'), dih);
  header.append(copy, requestMore);
  const jump = node('a', 'dashboard-jump', 'Resources & guidance');
  jump.href = '#dashboard-resources';
  const grid = node('div', 'dashboard-grid');
  const reports = node('section', 'dashboard-reports');
  reports.setAttribute('aria-label', 'Report catalog');
  reports.append(picker);
  const resources = node('aside', 'dashboard-resources');
  resources.id = 'dashboard-resources';
  resources.tabIndex = -1;
  resources.setAttribute('aria-labelledby', 'dashboard-resources-title');
  const resourcesHeading = node('h2', '', 'Resources & guidance');
  resourcesHeading.id = 'dashboard-resources-title';
  resources.append(resourcesHeading);
  jump.addEventListener('click', () => resources.focus({ preventScroll: true }));
  grid.append(reports, resources);
  shell.append(header, jump, grid);

  const readingSources = [...playbooks];
  if (intro && hasContent(intro)) readingSources.push(intro);
  if (demoIntro && demoIntro !== intro && hasContent(demoIntro)) readingSources.push(demoIntro);
  const cards = [
    {
      id: 'dashboard-help',
      title: 'Questions & help',
      copy: 'Ask about the platform, Digital Insights or Digital Opportunity reports in our Adobe Slack channel.',
      links: [[SLACK_URL, 'Ask in #digital-insights']],
    },
    {
      id: 'dashboard-requests',
      title: 'Customer report requests',
      copy: 'Customers can request without signing in. Generate their report in Digital Insights, then send a magic link here.',
      links: [['/adobe/report-requests', 'Review customer requests'], ['/request-report', 'Open public request form']],
      sources: requests,
      detailsLabel: 'How customer requests work',
    },
    {
      id: 'dashboard-present',
      title: 'Present with confidence',
      copy: "Read, present and explain a customer's report and portal page.",
      links: [['/docs/sales-playbook', 'Sales Playbook'], ['/customers/0-9/000-demo/', 'Open demo report']],
      sources: readingSources,
      detailsLabel: 'Reading and presenting guidance',
    },
    {
      id: 'dashboard-coverage',
      title: 'Why a section may be missing',
      copy: 'SEO, keyword and AI-visibility coverage depends on the data available for each website.',
      sources: coverage,
      detailsLabel: 'Understand report coverage',
    },
    {
      id: 'dashboard-booth',
      title: 'Event staff & booth tools',
      copy: 'Set up the screen, guide report conversations and review recorded booth activity.',
      links: [['/adobe/booth-guide', 'Open staff guide'], ['/booth', 'View booth experience']],
      sources: [...tools, ...booth],
      detailsLabel: 'Booth usage export (CSV)',
      exportForm: true,
    },
  ];
  cards.forEach((card) => resources.append(resourceCard(main, card)));
  unknown.forEach((source, i) => {
    resources.append(resourceCard(main, {
      id: `dashboard-announcement-${i}`,
      title: source.querySelector('h2, h3, strong')?.textContent || 'Additional guidance',
      copy: 'More information from the dashboard team.',
      sources: [source],
      detailsLabel: 'Read announcement',
    }));
  });
  authoredSections.forEach((section, i) => {
    if (!section.isConnected || section.closest('.dashboard-resource-card') || section.querySelector('.metadata')) return;
    if (!hasContent(section)) {
      section.remove();
      return;
    }
    resources.append(resourceCard(main, {
      id: `dashboard-authored-${i}`,
      title: section.querySelector('h2, h3')?.textContent || 'Additional information',
      copy: 'Additional information published with this dashboard.',
      sources: [section],
      detailsLabel: 'Read guidance',
    }));
  });
  resources.append(node('p', 'dashboard-device-note', 'Booth access and portal access are separate. On shared event devices, use a dedicated browser profile without a portal sign-in.'));
  main.classList.add('dashboard-page');
  main.prepend(shell);
  return shell;
}
