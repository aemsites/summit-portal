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
    throw error;
  }
  return result;
}

export function mountBooth(root = document) {
  const stage = root.getElementById('stage');
  if (!stage || stage.dataset.ready) return;
  stage.dataset.ready = 'true';
  const panels = [...root.querySelectorAll('[data-panel]')];
  const email = root.getElementById('registration-email');
  const form = root.getElementById('email-form');
  const send = root.getElementById('send-report');
  const status = root.getElementById('booth-status');
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
    root.getElementById('step-index').textContent = { welcome: '01 / 03 · ENTRY', picker: '02 / 03 · CHOOSE', finish: '03 / 03 · FINISH' }[name];
  }

  function scrub() {
    email.value = '';
    root.getElementById('report-options').replaceChildren();
    ['email-error', 'picker-status', 'finish-status', 'booth-status'].forEach((id) => notice(id, ''));
    send.disabled = false;
    clearTimeout(expiry);
    clearTimeout(idle);
    show('welcome');
  }

  async function reset() {
    if (resetting) return;
    resetting = true;
    revision += 1;
    scrub();
    form.querySelector('button').disabled = true;
    try {
      await settled;
      await boothRequest('reset', {});
      window.history.replaceState(null, '', '/booth');
      stage.hidden = false;
      form.querySelector('button').disabled = false;
    } catch (error) {
      notice('booth-status', error.message);
      if (error.status === 401) root.getElementById('staff-login').hidden = false;
    } finally {
      resetting = false;
    }
  }

  function schedule(result) {
    clearTimeout(expiry);
    if (result.expiresAt) expiry = setTimeout(reset, Math.max(0, result.expiresAt - Date.now()));
  }

  function apply(result, finishing = false) {
    schedule(result);
    if (result.selectedPath && !finishing) {
      window.location.assign(result.selectedPath);
      return;
    }
    if (result.selectedPath && finishing) {
      show('finish');
      send.disabled = result.sent || result.delivery === 'attempted';
      let message = '';
      if (result.sent) message = 'Your report link was emailed. Check your inbox.';
      else if (result.delivery === 'attempted') message = 'Delivery could not be confirmed. Ask the booth team before sending again.';
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
          if (busy || resetting) return;
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || resetting) return;
    busy = true;
    const current = revision;
    const button = form.querySelector('button');
    button.disabled = true;
    notice('email-error', '');
    try {
      const result = await perform('lookup', { email: email.value });
      email.value = '';
      if (current === revision) apply(result);
    } catch (error) {
      email.value = '';
      if (current === revision) notice('email-error', error.message);
    } finally {
      button.disabled = resetting;
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

  root.querySelectorAll('[data-reset]').forEach((button) => button.addEventListener('click', reset));
  root.getElementById('motion-toggle').addEventListener('click', (event) => {
    const paused = stage.dataset.motion === 'playing';
    stage.dataset.motion = paused ? 'paused' : 'playing';
    event.target.textContent = paused ? 'Play motion' : 'Pause motion';
  });
  const activity = () => {
    clearTimeout(idle);
    idle = setTimeout(reset, 120000);
  };
  ['pointerdown', 'keydown'].forEach((name) => root.addEventListener(name, activity));
  window.addEventListener('pagehide', () => {
    revision += 1;
    scrub();
    stage.hidden = true;
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reset();
  });
  window.addEventListener('popstate', reset);
  form.querySelector('button').disabled = true;
  const initialRevision = revision;
  perform('status').then((result) => {
    if (initialRevision !== revision) return;
    const finishing = new URL(window.location.href).searchParams.get('step') === 'finish';
    apply(result, finishing);
    status.hidden = true;
    form.querySelector('button').disabled = false;
  }).catch((error) => {
    if (initialRevision !== revision) return;
    notice('booth-status', error.message);
    root.getElementById('staff-login').hidden = error.status !== 401;
  });
  activity();
}

if (document.body.classList.contains('booth')) mountBooth();
