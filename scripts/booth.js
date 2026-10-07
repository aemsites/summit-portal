import { readBoothPresentation, withBoothPresentation, applyBoothPresentation } from './booth-presentation.js';
import { createBoothPreview } from './booth-preview.js';

export async function boothRequest(action, body) {
  const response = await fetch(`/auth/booth/${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Booth service unavailable. Ask the booth team.');
    error.status = response.status;
    error.code = result.code;
    throw error;
  }
  return result;
}

export function mountBooth(root = document) {
  const stage = root.getElementById('stage');
  if (!stage || stage.dataset.ready) return;
  stage.dataset.ready = 'true';
  const presentation = readBoothPresentation(window.location.search);
  applyBoothPresentation(root, presentation);
  const panels = [...root.querySelectorAll('[data-panel]')];
  const email = root.getElementById('registration-email');
  const form = root.getElementById('email-form');
  const send = root.getElementById('send-report');
  const status = root.getElementById('booth-status');
  const retry = root.getElementById('booth-retry');
  const previewTarget = root.getElementById('report-preview');
  const preview = previewTarget ? createBoothPreview(previewTarget, root.getElementById('preview-retry')) : null;
  let ready = false;
  let busy = false;
  let idle;
  let expiry;
  let revision = 0;
  let resetting = false;
  let settled = Promise.resolve();

  function perform(action, body) {
    const operation = boothRequest(action, body);
    settled = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function notice(id, message) {
    const element = root.getElementById(id);
    element.textContent = message;
    element.hidden = !message;
  }

  function show(name) {
    panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
  }

  function scrub() {
    preview?.clear();
    email.value = '';
    root.getElementById('report-options').replaceChildren();
    ['email-error', 'picker-status', 'finish-status', 'booth-status'].forEach((id) => notice(id, ''));
    root.getElementById('demo-options')?.replaceChildren();
    if (root.getElementById('demo-status')) notice('demo-status', '');
    send.disabled = false;
    retry.hidden = true;
    root.getElementById('staff-login').hidden = true;
    clearTimeout(expiry);
    clearTimeout(idle);
    show('welcome');
  }

  function recovery(error) {
    ready = false;
    stage.hidden = false;
    stage.setAttribute('aria-busy', 'false');
    form.querySelector('button').disabled = true;
    notice('booth-status', error.message);
    retry.hidden = error.status === 401;
    root.getElementById('staff-login').hidden = error.status !== 401;
  }

  async function reset(action = 'reset') {
    if (resetting) return;
    resetting = true;
    ready = false;
    revision += 1;
    scrub();
    form.querySelector('button').disabled = true;
    try {
      await settled;
      const result = await boothRequest(action, {});
      if (result.state !== 'entry') throw new Error('This screen could not be cleared. Retry or ask the booth team.');
      if (action === 'exit') {
        window.location.replace('/login?staff&redirect=%2Fadobe%2Fdashboard');
        return;
      }
      window.history.replaceState(null, '', withBoothPresentation('/booth', presentation));
      stage.hidden = false;
      stage.setAttribute('aria-busy', 'false');
      ready = true;
      form.querySelector('button').disabled = false;
    } catch (error) {
      recovery(error);
    } finally {
      resetting = false;
    }
  }

  function activity() {
    clearTimeout(idle);
    idle = setTimeout(reset, 120000);
  }

  function schedule(result) {
    clearTimeout(expiry);
    if (result.expiresAt) expiry = setTimeout(reset, Math.max(0, result.expiresAt - Date.now()));
  }

  function apply(result, finishing = false) {
    schedule(result);
    if (['demo', 'request'].includes(result.state)) {
      window.location.assign(withBoothPresentation(result.selectedPath, presentation));
      return;
    }
    if (result.selectedPath && !finishing) {
      window.location.assign(withBoothPresentation(result.selectedPath, presentation));
      return;
    }
    if (result.selectedPath && finishing) {
      show('finish');
      preview?.load(result);
      send.disabled = result.sent || result.delivery === 'attempted';
      let message = '';
      if (result.sent) message = 'Your report link was emailed. Check your inbox.';
      else if (result.delivery === 'attempted') message = 'Delivery could not be confirmed. Ask the booth team before sending again.';
      if (result.activityPending) message = `${message} Activity reporting is delayed. Ask the booth team; do not resend your report.`.trim();
      notice('finish-status', message);
      return;
    }
    if (result.state === 'picker') {
      show('picker');
      const options = root.getElementById('report-options');
      options.replaceChildren();
      result.candidates.forEach((candidate) => {
        const button = root.createElement('button');
        button.className = 'primary';
        button.type = 'button';
        button.textContent = candidate.label;
        button.addEventListener('click', async () => {
          if (busy || resetting || !ready) return;
          busy = true;
          const current = revision;
          button.disabled = true;
          try {
            const selection = await perform('select', { path: candidate.path });
            if (current === revision) apply(selection);
          } catch (error) {
            if (current === revision) notice('picker-status', error.message);
            button.disabled = false;
          } finally {
            busy = false;
          }
        });
        options.append(button);
      });
    } else show('welcome');
  }

  async function openRequest() {
    if (busy || resetting || !ready) return;
    busy = true;
    const current = revision;
    email.value = '';
    notice('booth-status', 'Opening a fresh report request...');
    try {
      const result = await perform('request', {});
      if (result.state !== 'request') throw new Error('The report request could not be opened.');
      if (current === revision) apply(result);
    } catch (error) {
      if (current === revision) notice('booth-status', error.message);
    } finally {
      busy = false;
    }
  }

  async function showDemos() {
    if (busy || resetting || !ready) return;
    busy = true;
    const current = revision;
    scrub();
    show('demos');
    notice('demo-status', 'Loading industry demos...');
    try {
      const cleared = await perform('reset', {});
      if (cleared.state !== 'entry') throw new Error('The previous visitor could not be cleared.');
      const result = await perform('demos');
      if (current !== revision) return;
      if (!Array.isArray(result.demos) || !result.demos.length) throw new Error('Industry demos are unavailable. Ask the booth team.');
      const options = root.getElementById('demo-options');
      result.demos.forEach((demo) => {
        const button = root.createElement('button');
        button.type = 'button';
        button.className = 'demo-option';
        const industry = root.createElement('strong');
        industry.textContent = demo.industry;
        const company = root.createElement('span');
        company.textContent = demo.company;
        button.append(industry, company);
        button.addEventListener('click', async () => {
          if (busy || resetting || !ready) return;
          busy = true;
          const selecting = revision;
          button.disabled = true;
          notice('demo-status', 'Opening this example report...');
          try {
            const selected = await perform('demo', { id: demo.id });
            if (selected.state !== 'demo') throw new Error('The example report could not be opened.');
            if (selecting === revision) apply(selected);
          } catch (error) {
            if (selecting === revision) notice('demo-status', error.message);
            button.disabled = false;
          } finally {
            busy = false;
          }
        });
        options.append(button);
      });
      notice('demo-status', '');
      root.getElementById('demos-heading').focus();
    } catch (error) {
      if (current === revision) notice('demo-status', error.message);
    } finally {
      busy = false;
      activity();
    }
  }

  root.querySelectorAll('[data-show-demos]').forEach((button) => button.addEventListener('click', showDemos));
  root.querySelectorAll('[data-request-report]').forEach((button) => button.addEventListener('click', openRequest));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || resetting || !ready) return;
    busy = true;
    const current = revision;
    const button = form.querySelector('button');
    button.disabled = true;
    notice('email-error', '');
    try {
      const result = await perform('lookup', { email: email.value, noticeVersion: stage.dataset.noticeVersion });
      email.value = '';
      if (current === revision) apply(result);
    } catch (error) {
      email.value = '';
      if (current === revision) {
        if (error.code === 'no_report') {
          show('unavailable');
          root.getElementById('unavailable-heading').focus();
        } else notice('email-error', error.message);
      }
    } finally {
      button.disabled = resetting || !ready;
      busy = false;
    }
  });

  send.addEventListener('click', async () => {
    if (busy || resetting) return;
    busy = true;
    send.disabled = true;
    const current = revision;
    notice('finish-status', 'Sending your report link…');
    try {
      const result = await perform('send', {});
      if (current === revision && result.sent) notice('finish-status', 'Your report link was emailed. Check your inbox.');
    } catch (error) {
      if (current === revision) notice('finish-status', error.message);
      // Unknown delivery is not retryable: the server may have contacted the mail service.
    } finally {
      busy = false;
    }
  });

  root.querySelectorAll('[data-reset]').forEach((button) => button.addEventListener('click', () => reset()));
  root.getElementById('staff-exit').addEventListener('click', () => reset('exit'));
  ['pointerdown', 'keydown'].forEach((name) => root.addEventListener(name, activity));
  window.addEventListener('pagehide', () => {
    revision += 1;
    ready = false;
    scrub();
    stage.hidden = true;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reset();
  });
  window.addEventListener('popstate', () => reset());
  form.querySelector('button').disabled = true;
  show(null);
  stage.setAttribute('aria-busy', 'true');
  notice('booth-status', 'Checking this booth...');
  const initialRevision = revision;
  perform('status').then((result) => {
    if (initialRevision !== revision) return;
    const finishing = new URL(window.location.href).searchParams.get('step') === 'finish';
    const demos = new URL(window.location.href).searchParams.get('step') === 'demos';
    if (!demos) apply(result, finishing);
    ready = true;
    stage.setAttribute('aria-busy', 'false');
    status.hidden = true;
    form.querySelector('button').disabled = false;
    if (demos) showDemos();
  }).catch((error) => {
    if (initialRevision !== revision) return;
    recovery(error);
  });
  activity();
}

if (document.body.classList.contains('booth')) mountBooth();
