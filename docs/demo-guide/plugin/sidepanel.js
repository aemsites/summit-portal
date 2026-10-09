/* global chrome */
import { screens } from './routes.js';

const api = globalThis.chrome?.runtime?.id ? chrome : null;
const guideElement = document.getElementById('guide');
const sectionSelect = document.getElementById('section-select');
const follow = document.getElementById('follow');
const search = document.getElementById('search');
const results = document.getElementById('search-results');
const main = document.getElementById('main');
const status = document.getElementById('screen-status');
const notice = document.getElementById('notice');
let guide;
let selected = 0;
let context = null;
let checks = {};
let notifyTimer;

function notify(text) {
  notice.textContent = text;
  notice.hidden = false;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => { notice.hidden = true; }, 6000);
}

async function savePreferences() {
  if (!api) return;
  try {
    await api.storage.local.set({ followScreen: follow.checked, checks });
  } catch (error) {
    notify(`Could not save guide preferences: ${error.message}`);
  }
}

function updateStatus() {
  if (!api) status.textContent = 'Offline guide preview';
  else if (!follow.checked) status.textContent = 'Manual browsing';
  else if (context?.error) status.textContent = context.error;
  else if (!context) status.textContent = 'Not on a booth screen';
  else status.textContent = `${screens[context.screen].label}${context.example ? ' · Example' : ''}${context.connected ? '' : ' · URL only'}`;
}

function manual() {
  follow.checked = false;
  updateStatus();
  savePreferences();
}

function checklistPrefix() {
  return `${guide.contentVersion || guide.sourceSha256}:${guide.sections[selected].id}:`;
}

function decorateContent(onReset) {
  guideElement.querySelectorAll('table').forEach((table) => {
    const headers = [...table.querySelectorAll('th')].map((th) => th.textContent);
    table.querySelectorAll('tbody tr').forEach((row) => {
      [...row.cells].forEach((cell, index) => {
        if (index === 0) return;
        const label = document.createElement('span');
        label.className = 'cell-label';
        label.textContent = headers[index];
        cell.prepend(label);
      });
    });
    if (headers[0] === 'Staff access' || headers[0] === 'Setup test') {
      const details = document.createElement('details');
      details.className = 'sensitive';
      const summary = document.createElement('summary');
      summary.textContent = headers[0] === 'Staff access'
        ? 'Show staff credentials — HIGHLY CONFIDENTIAL'
        : 'Show approved setup email — HIGHLY CONFIDENTIAL';
      const reminder = document.createElement('p');
      reminder.textContent = guide.redacted ? 'Review copy: private values are omitted.' : 'Staff device only. Close this before a visitor can see it.';
      table.before(details);
      details.append(summary, reminder, table);
    }
  });
  guideElement.querySelectorAll('img').forEach((image) => {
    image.loading = 'lazy';
    const figure = document.createElement('figure');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-button';
    button.setAttribute('aria-label', `Open screenshot: ${image.alt}`);
    const label = document.createElement('span');
    label.textContent = 'Open screenshot at full size';
    image.parentElement.replaceWith(figure);
    button.append(image, label);
    figure.append(button);
    button.addEventListener('click', () => {
      if (api) api.tabs.create({ url: image.src }).catch((error) => notify(`Cannot open screenshot: ${error.message}`));
      else window.open(image.src, '_blank', 'noopener,noreferrer');
    });
  });
  let checkIndex = 0;
  guideElement.querySelectorAll('li, tbody td:first-child').forEach((element) => {
    if (!/^\[ \]/.test(element.textContent.trim())) return;
    const key = `${checklistPrefix()}${checkIndex}`;
    checkIndex += 1;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checks[key] === true;
    input.setAttribute('aria-label', `Complete check ${checkIndex} in ${guide.sections[selected].title}`);
    const label = document.createElement('label');
    label.className = 'check-label';
    const text = document.createElement('span');
    text.innerHTML = element.innerHTML.replace(/^\[ \]\s*/, '');
    label.append(input, text);
    element.replaceChildren(label);
    input.addEventListener('change', () => {
      checks[key] = input.checked;
      savePreferences();
    });
  });
  if (checkIndex) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'check-reset';
    reset.textContent = 'Reset these guide checks (not the booth)';
    reset.addEventListener('click', () => {
      Object.keys(checks)
        .filter((key) => key.startsWith(checklistPrefix()))
        .forEach((key) => { delete checks[key]; });
      savePreferences();
      onReset(selected);
    });
    guideElement.append(reset);
  }
  guideElement.querySelectorAll('p').forEach((paragraph) => {
    if (!/^(Say|Ask):/.test(paragraph.textContent)) return;
    const text = paragraph.textContent.replace(/^(Say|Ask):\s*/, '');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-line';
    button.textContent = 'Copy line';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        notify('Talk track copied.');
      } catch (error) {
        notify(`Copy failed. Select and copy the line manually. ${error.message}`);
      }
    });
    paragraph.append(button);
  });
}

function render(index, focusContent = false) {
  selected = index;
  sectionSelect.value = guide.sections[index].id;
  guideElement.innerHTML = guide.sections[index].html;
  guideElement.hidden = false;
  results.hidden = true;
  search.value = '';
  decorateContent(render);
  main.scrollTop = 0;
  document.getElementById('position').textContent = `${index + 1} / ${guide.sections.length}`;
  document.getElementById('previous').disabled = index === 0;
  document.getElementById('next').disabled = index === guide.sections.length - 1;
  if (focusContent) guideElement.focus();
}

function followContext() {
  updateStatus();
  if (!guide || !follow.checked || !context || context.error) return;
  const target = screens[context.screen].sectionId;
  const index = guide.sections.findIndex((section) => section.id === target);
  if (index !== selected) render(index);
}

function showSearch() {
  const query = search.value.trim().toLocaleLowerCase();
  if (!query) {
    render(selected);
    return;
  }
  manual();
  const tokens = query.split(/\s+/);
  const matches = guide.sections.filter((section) => tokens.every((token) => (
    section.searchText.toLocaleLowerCase().includes(token)
  )));
  results.replaceChildren();
  const summary = document.createElement('p');
  summary.textContent = matches.length ? `${matches.length} matching sections` : 'No matching sections. Try a signal such as INP or a phrase such as company unavailable.';
  results.append(summary);
  matches.forEach((section) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result';
    const title = document.createElement('strong');
    title.textContent = section.title;
    const excerpt = document.createElement('span');
    const start = Math.max(0, section.searchText.toLocaleLowerCase().indexOf(tokens[0]) - 45);
    excerpt.textContent = section.searchText.slice(start, start + 170);
    button.append(title, excerpt);
    button.addEventListener('click', () => render(guide.sections.indexOf(section), true));
    results.append(button);
  });
  guideElement.hidden = true;
  results.hidden = false;
}

function connect(windowId, attempt = 0) {
  try {
    const port = api.runtime.connect({ name: 'booth-guide' });
    let retries = attempt;
    port.onMessage.addListener((message) => {
      if (message.type !== 'SCREEN') return;
      retries = 0;
      context = message.state;
      followContext();
    });
    port.onDisconnect.addListener(() => {
      const error = api.runtime.lastError?.message;
      if (error) console.warn('[Booth guide] Screen connection closed', error);
      context = {
        error: retries < 2
          ? 'Reconnecting screen sync…'
          : 'Screen sync disconnected. Reopen the guide.',
      };
      updateStatus();
      if (retries < 2) setTimeout(() => connect(windowId, retries + 1), 1000);
      else notify(context.error);
    });
    port.postMessage({ type: 'SUBSCRIBE', windowId });
  } catch (error) {
    context = { error: 'Screen sync unavailable. Reopen the guide after updating the extension.' };
    updateStatus();
    notify(`${context.error} ${error.message}`);
    console.error('[Booth guide] Cannot connect to screen sync', error);
  }
}

async function initialize() {
  try {
    const response = await fetch('guide.json');
    if (!response.ok) throw new Error(`Guide data returned ${response.status}`);
    guide = await response.json();
    if (guide.sections.length !== 20 || !Object.values(screens).every(({ sectionId }) => guide.sections.some((section) => section.id === sectionId))) throw new Error('Incomplete guide content');
    guide.sections.forEach((section) => {
      const option = document.createElement('option');
      option.value = section.id;
      option.textContent = section.title;
      sectionSelect.append(option);
    });
    sectionSelect.options[0].remove();
    if (api) {
      const stored = await api.storage.local.get(['followScreen', 'checks']);
      follow.checked = stored.followScreen !== false;
      checks = stored.checks && typeof stored.checks === 'object' && !Array.isArray(stored.checks) ? stored.checks : {};
      follow.disabled = false;
    } else follow.disabled = true;
    sectionSelect.disabled = false;
    search.disabled = false;
    render(0);
    if (guide.redacted) notify('Review copy: credentials, setup email and company preview content are redacted.');
    updateStatus();
    if (api) {
      const { id } = await api.windows.getCurrent();
      connect(id);
    }
  } catch (error) {
    notify(`The staff guide could not load: ${error.message}`);
    status.textContent = 'Guide unavailable';
    guideElement.textContent = 'The guide could not load. Check the extension installation and reopen the panel. Do not use an incomplete companion for the event.';
    console.error('[Booth guide] Initialization failed', error);
  }
}

sectionSelect.addEventListener('change', () => {
  manual();
  render(guide.sections.findIndex((section) => section.id === sectionSelect.value));
});
follow.addEventListener('change', () => {
  savePreferences();
  followContext();
});
search.addEventListener('input', showSearch);
guideElement.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href]');
  if (!anchor) return;
  if (!anchor.getAttribute('href').startsWith('#')) {
    event.preventDefault();
    if (new URL(anchor.href).protocol !== 'https:') {
      notify('Only HTTPS guide links can be opened.');
      return;
    }
    manual();
    if (api) api.tabs.create({ url: anchor.href }).catch((error) => notify(`Cannot open guide link: ${error.message}`));
    else window.open(anchor.href, '_blank', 'noopener,noreferrer');
    return;
  }
  const id = anchor.getAttribute('href').slice(1);
  const index = guide.sections.findIndex((section) => section.id === id);
  if (index < 0) return;
  event.preventDefault();
  manual();
  render(index, true);
});
['previous', 'next'].forEach((id) => document.getElementById(id).addEventListener('click', () => {
  manual();
  render(selected + (id === 'next' ? 1 : -1));
}));
initialize();
