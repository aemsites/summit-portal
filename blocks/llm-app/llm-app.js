/**
 * LLM App block
 * Renders a ChatGPT app card with configurable description, MCP URL, and test prompts.
 *
 * Authored content model:
 *   Row 1, Cell 1: <div> or <p> — bold title as first <strong>, followed by description text
 *   Row 2, Cell 1: <p><a> MCP URL, <ul> test prompts
 *
 * @param {Element} block the block element
 */
export default function init(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  // --- Row 1: description content (may be directly in cell div, or wrapped in <p>) ---
  const cell1 = rows[0]?.querySelector(':scope > div');
  const descEl = cell1?.querySelector('p') ?? cell1;

  // --- Row 2: MCP URL + prompts ---
  const cell2 = rows[1]?.querySelector(':scope > div');
  const mcpLink = cell2?.querySelector('a');
  const mcpUrl = mcpLink?.textContent.trim() || mcpLink?.href || '';
  const prompts = cell2 ? [...cell2.querySelectorAll('li')].map((li) => li.textContent.trim()) : [];

  // --- Extract title (first <strong>) from description ---
  const titleEl = descEl?.querySelector('strong:first-child');
  const titleText = titleEl?.textContent.trim() || '';
  if (titleEl) titleEl.remove();

  // Remove leading <br> elements left after title extraction
  while (descEl?.firstChild?.nodeName === 'BR') descEl.firstChild.remove();

  // --- Build card header ---
  const cardHeader = document.createElement('div');
  cardHeader.className = 'llm-app-card-header';
  const cardTitle = document.createElement('p');
  cardTitle.className = 'llm-app-card-title';
  cardTitle.textContent = titleText;
  cardHeader.append(cardTitle);

  // --- Build app card body ---
  const card = document.createElement('div');
  card.className = 'llm-app-card';

  if (descEl) {
    descEl.className = 'llm-app-description';
    card.append(descEl);
  }

  // --- Build setup panel ---
  const setup = document.createElement('div');
  setup.className = 'llm-app-setup';

  const setupTitle = document.createElement('button');
  setupTitle.className = 'llm-app-setup-title';
  setupTitle.setAttribute('aria-expanded', 'false');
  setupTitle.textContent = 'Try your app in ChatGPT';

  const setupSubtitle = document.createElement('p');
  setupSubtitle.className = 'llm-app-setup-subtitle';
  setupSubtitle.textContent = 'Connect to ChatGPT in three steps.';

  const setupBody = document.createElement('div');
  setupBody.className = 'llm-app-setup-body';

  const setupBodyInner = document.createElement('div');
  setupBodyInner.className = 'llm-app-setup-body-inner';
  setupBodyInner.append(setupSubtitle);
  setupBody.append(setupBodyInner);

  setupTitle.addEventListener('click', () => {
    const expanded = setupTitle.getAttribute('aria-expanded') === 'true';
    setupTitle.setAttribute('aria-expanded', String(!expanded));
  });

  setup.append(setupTitle, setupBody);

  // Step definitions (static labels, dynamic params from authored content)
  const steps = [
    {
      title: 'Set up ChatGPT',
      body: 'Log in to ChatGPT (paid) → Settings → Apps → Advanced settings → enable Developer mode',
    },
    {
      title: 'Create your app',
      body: 'Apps → Create App → name it → paste MCP URL → Auth: None → Create',
      param: mcpUrl,
    },
    {
      title: 'Test it out',
      body: 'New chat → click + → More → select your app → try one of these prompts:',
      prompts,
    },
  ];

  steps.forEach((step, i) => {
    const stepEl = document.createElement('div');
    stepEl.className = 'llm-app-step';

    const stepNum = document.createElement('div');
    stepNum.className = 'llm-app-step-number';
    stepNum.textContent = i + 1;

    const stepContent = document.createElement('div');
    stepContent.className = 'llm-app-step-content';

    const stepTitle = document.createElement('strong');
    stepTitle.textContent = step.title;

    const stepBody = document.createElement('p');
    stepBody.textContent = step.body;

    stepContent.append(stepTitle, stepBody);

    // Step 2: MCP URL with copy button
    if (step.param) {
      const paramEl = document.createElement('div');
      paramEl.className = 'llm-app-step-param';

      const paramText = document.createElement('span');
      paramText.className = 'llm-app-param-text';
      paramText.textContent = step.param;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'llm-app-copy-btn';
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(step.param).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        }).catch(() => {
          copyBtn.textContent = 'Failed';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
      });

      paramEl.append(paramText, copyBtn);
      stepContent.append(paramEl);
    }

    // Step 3: prompts list
    if (step.prompts?.length) {
      const promptsEl = document.createElement('ul');
      promptsEl.className = 'llm-app-prompts';
      step.prompts.forEach((prompt) => {
        const li = document.createElement('li');
        li.textContent = prompt;
        promptsEl.append(li);
      });
      stepContent.append(promptsEl);
    }

    stepEl.append(stepNum, stepContent);
    setupBodyInner.append(stepEl);
  });

  block.replaceChildren(cardHeader, card, setup);
}
