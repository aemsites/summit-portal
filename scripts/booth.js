import { readBoothPresentation, withBoothPresentation, applyBoothPresentation } from './booth-presentation.js';
import { createBoothPreview } from './booth-preview.js';
import { mountBoothKeyboard } from './booth-keyboard.js?v=booth-recovery-2';
import { boothRequest, createBoothInactivity } from './booth-session.js';

export { boothRequest } from './booth-session.js';

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
  const chooseAnother = root.getElementById('choose-another-report');
  const status = root.getElementById('booth-status');
  const retry = root.getElementById('booth-retry');
  const loading = root.getElementById('booth-loading');
  const previewTarget = root.getElementById('report-preview');
  const preview = previewTarget ? createBoothPreview(previewTarget, root.getElementById('preview-retry')) : null;
  const keyboard = mountBoothKeyboard(root);
  let ready = false;
  let busy = false;
  let revision = 0;
  let resetting = false;
  let settled = Promise.resolve();
  let inactivity;

  function opening(active) {
    if (loading) {
      loading.hidden = !active;
      if (active) loading.focus();
    }
    stage.inert = active;
  }

  function notice(id, message) {
    const element = root.getElementById(id);
    element.textContent = message;
    element.hidden = !message;
  }

  function show(name) {
    panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
    let step = 1;
    if (name === 'finish') step = 3;
    else if (['picker', 'demos'].includes(name)) step = 2;
    stage.dataset.step = step;
    stage.dataset.screen = name;
    const staffExit = root.getElementById('staff-exit');
    if (staffExit) {
      staffExit.textContent = name === 'demos'
        ? 'Staff: Sign out and leave booth mode' : 'Staff: sign out this device';
    }
    root.querySelectorAll('.booth-progress li').forEach((item, index) => {
      item.classList.toggle('complete', index < step);
      if (index === step - 1) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  function scrub(clearTimers = true) {
    opening(false);
    preview?.clear();
    email.blur();
    keyboard.clear();
    email.value = '';
    root.getElementById('report-options').replaceChildren();
    ['email-error', 'picker-status', 'finish-status', 'booth-status'].forEach((id) => notice(id, ''));
    root.getElementById('demo-options')?.replaceChildren();
    if (root.getElementById('demo-status')) notice('demo-status', '');
    send.disabled = false;
    if (chooseAnother) {
      chooseAnother.hidden = true;
      chooseAnother.disabled = false;
    }
    retry.hidden = true;
    root.getElementById('staff-login').hidden = true;
    if (clearTimers) {
      inactivity.stop();
    }
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

  function perform(action, body) {
    const current = revision;
    const operation = boothRequest(action, body).catch((error) => {
      if (error.code === 'timeout' && current === revision) {
        revision += 1;
        scrub(false);
        recovery(error);
      }
      throw error;
    });
    settled = Promise.allSettled([settled, operation]).then(() => undefined);
    return operation;
  }

  async function reset(action = 'reset') {
    if (resetting) return;
    resetting = true;
    ready = false;
    revision += 1;
    scrub();
    form.querySelector('button').disabled = true;
    stage.setAttribute('aria-busy', 'true');
    notice('booth-status', 'Clearing this visit...');
    try {
      await settled;
      const result = await boothRequest(action, {});
      if (result.state !== 'entry') throw new Error('This screen could not be cleared. Retry or ask the booth team.');
      if (action === 'exit') {
        window.location.replace('/login?staff&redirect=%2Fbooth');
        return;
      }
      window.history.replaceState(null, '', withBoothPresentation('/booth', presentation));
      stage.hidden = false;
      stage.setAttribute('aria-busy', 'false');
      ready = true;
      notice('booth-status', '');
      form.querySelector('button').disabled = false;
    } catch (error) {
      recovery(error);
    } finally {
      resetting = false;
    }
  }

  function activity() {
    if (!resetting) inactivity.activity();
  }

  function schedule(result) {
    inactivity.setExpiry(result.expiresAt);
  }

  function apply(result, finishing = false) {
    schedule(result);
    if (result.state === 'demo') {
      opening(true);
      window.location.assign(withBoothPresentation(result.selectedPath, presentation));
      return;
    }
    if (result.selectedPath && !finishing) {
      opening(true);
      window.location.assign(withBoothPresentation(result.selectedPath, presentation));
      return;
    }
    if (result.selectedPath && finishing) {
      show('finish');
      if (chooseAnother) chooseAnother.hidden = result.canChooseAnother !== true;
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
          opening(true);
          try {
            const selection = await perform('select', { path: candidate.path });
            if (current === revision) {
              if (selection.state !== 'report' || !selection.selectedPath) {
                throw new Error('The selected report could not be opened.');
              }
              apply(selection);
            }
          } catch (error) {
            button.disabled = false;
            if (current === revision) {
              opening(false);
              notice('picker-status', error.message);
              button.focus();
            }
          } finally {
            busy = false;
          }
        });
        options.append(button);
      });
    } else show(result.state === 'unavailable' ? 'unavailable' : 'welcome');
  }

  async function showDemos() {
    if (busy || resetting || !ready) return;
    busy = true;
    const current = revision;
    scrub();
    show('demos');
    notice('demo-status', 'Loading industry demos...');
    try {
      const cleared = await perform('demo-picker', {});
      if (current !== revision) return;
      if (cleared.state !== 'demos') throw new Error('The industry chooser could not be opened.');
      schedule(cleared);
      const recoveryCopy = root.getElementById('demo-recovery-copy');
      if (recoveryCopy) recoveryCopy.hidden = cleared.unmatched !== true;
      const intro = root.getElementById('demo-intro');
      if (intro) intro.hidden = cleared.unmatched === true;
      const result = await perform('demos');
      if (current !== revision) return;
      if (!Array.isArray(result.demos) || !result.demos.length) throw new Error('Industry demos are unavailable. Ask the booth team.');
      const options = root.getElementById('demo-options');
      result.demos.forEach((demo) => {
        const button = root.createElement('button');
        button.type = 'button';
        button.className = 'demo-option';
        const icon = root.createElement('img');
        icon.className = 'demo-icon';
        icon.src = `/img/booth/industry-${encodeURIComponent(demo.id)}.svg`;
        icon.alt = '';
        icon.width = 64;
        icon.height = 64;
        const copy = root.createElement('div');
        copy.className = 'demo-copy';
        const industry = root.createElement('strong');
        industry.textContent = demo.industry;
        const company = root.createElement('span');
        company.textContent = demo.company;
        copy.append(industry, company);
        button.append(icon, copy);
        button.addEventListener('click', async () => {
          if (busy || resetting || !ready) return;
          busy = true;
          const selecting = revision;
          button.disabled = true;
          opening(true);
          notice('demo-status', 'Opening this example report...');
          try {
            const selected = await perform('demo', { id: demo.id });
            if (selected.state !== 'demo') throw new Error('The example report could not be opened.');
            if (selecting === revision) apply(selected);
          } catch (error) {
            button.disabled = false;
            if (selecting === revision) {
              opening(false);
              notice('demo-status', error.message);
              button.focus();
            }
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
      inactivity.activity(false);
    }
  }

  inactivity = createBoothInactivity({
    reset,
    onError(error) {
      revision += 1;
      scrub(false);
      recovery(error);
    },
    track(operation) {
      settled = Promise.allSettled([settled, operation]).then(() => undefined);
    },
  });

  root.querySelectorAll('[data-show-demos]').forEach((button) => button.addEventListener('click', showDemos));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || resetting || !ready) return;
    busy = true;
    const current = revision;
    const button = form.querySelector('button');
    email.blur();
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
          schedule(error);
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
    if (busy || resetting || !ready) return;
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

  chooseAnother?.addEventListener('click', async () => {
    if (busy || resetting || !ready) return;
    busy = true;
    revision += 1;
    const current = revision;
    preview?.clear();
    show(null);
    chooseAnother.disabled = true;
    notice('booth-status', 'Checking your other reports...');
    try {
      const result = await perform('picker', {});
      if (current !== revision) return;
      if (result.state !== 'picker' || !Array.isArray(result.candidates)) {
        throw new Error('Your reports could not be checked. Retry and clear this screen.');
      }
      window.history.replaceState(null, '', withBoothPresentation('/booth?step=picker', presentation));
      notice('booth-status', '');
      apply(result);
    } catch (error) {
      if (current === revision) recovery(error);
    } finally {
      busy = false;
      chooseAnother.disabled = false;
    }
  });

  root.querySelectorAll('[data-reset]').forEach((button) => button.addEventListener('click', () => reset()));
  root.getElementById('staff-exit').addEventListener('click', () => reset('exit'));
  ['pointerdown', 'pointermove', 'keydown', 'input', 'change', 'scroll']
    .forEach((name) => root.addEventListener(name, activity, { capture: true, passive: true }));
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
