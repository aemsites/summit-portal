const viewport = document.getElementById('viewport');
const frame = document.getElementById('frame');
const preview = document.getElementById('preview');
const resolution = document.getElementById('resolution');
const mode = document.getElementById('mode');
const keyboardMode = document.getElementById('keyboard-mode');
const keyboardHeight = document.getElementById('keyboard-height');
const keyboard = document.getElementById('keyboard');
const sizeLabel = document.getElementById('size-label');
const measurements = document.getElementById('measurements');
const coverageWarning = document.getElementById('coverage-warning');
const connectionError = document.getElementById('connection-error');
const simulation = document.body.dataset.simulator === 'true';
const editable = 'textarea, input:not([type]), input:is([type="text"], [type="email"], [type="tel"], [type="url"], [type="search"], [type="password"], [type="number"]), [contenteditable="true"]';
let device;
let virtualKeyboard;
let listeners;
let observer;
let visible = false;
let shifted = false;
let scale = 1;
let updateFrame;
let keyboardFrame;
let restoreFrame;
let editingOrigin;

const dimensions = () => resolution.value.split('x').map(Number);
const isEditable = (field) => field?.matches(editable) && !field.disabled && !field.readOnly
  && field.getClientRects().length > 0;
const activeField = () => (device && isEditable(device.document.activeElement)
  ? device.document.activeElement : null);
const occlusion = () => (visible
  ? Math.round(dimensions()[1] * (Number(keyboardHeight.value) / 100)) : 0);

function showError(message) {
  connectionError.hidden = false;
  connectionError.textContent = message;
}

function rectText(element, bottom) {
  if (!element?.getClientRects().length) return 'not visible';
  const rect = element.getBoundingClientRect();
  const inside = rect.top >= 0 && rect.left >= 0
    && rect.right <= device.innerWidth && rect.bottom <= bottom;
  return `${Math.round(rect.top)}–${Math.round(rect.bottom)}px · ${inside ? 'visible' : 'outside visible rectangle'}`;
}

function measure() {
  updateFrame = undefined;
  if (!device) return;
  const [width, height] = dimensions();
  const field = activeField();
  const bottom = Math.min(device.innerHeight, height - occlusion());
  const html = device.document.documentElement;
  const label = field?.labels?.[0];
  const controls = [...device.document.querySelectorAll('#email-form button, #send-report, .finish-clear, #booth-return a, #booth-return button, [data-panel]:not([hidden]) .recovery-actions button')].filter((element) => element.getClientRects().length);
  const rows = [
    ['Route', `${device.location.pathname}${device.location.search}`],
    ['Actual viewport', `${device.innerWidth} × ${device.innerHeight} CSS px · host-reported DPR ${device.devicePixelRatio}`],
    ['Visible rectangle', `0,0 → ${width},${bottom} CSS px (keyboard excluded)`],
    ['Keyboard', `${visible ? 'shown' : 'hidden'} · ${keyboardMode.selectedOptions[0].text} · ${occlusion()}px`],
    ['Product helper', `${html.classList.contains('booth-keyboard-active') ? 'booth-keyboard-active' : 'inactive'} · --booth-keyboard-inset: ${html.style.getPropertyValue('--booth-keyboard-inset') || '(unset)'}`],
    ['Focused field', field ? `${field.id || field.tagName} · ${rectText(field, bottom)}` : 'none'],
    ['Field label', rectText(label, bottom)],
    ['Critical actions', controls.map((control) => `${control.textContent.trim().replace(/\s+/g, ' ')}: ${rectText(control, bottom)}`).join(' / ') || 'none on this screen'],
    ['Touch model', 'Local maxTouchPoints=1 facade. Mouse remains mouse; no coarse-pointer or DPR emulation.'],
  ];
  measurements.replaceChildren(...rows.flatMap(([title, value]) => {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = title;
    detail.textContent = value;
    return [term, detail];
  }));
  const covered = [field, label, ...controls].filter(Boolean)
    .some((element) => rectText(element, bottom).includes('outside'));
  const reserve = !visible && parseFloat(html.style.getPropertyValue('--booth-keyboard-inset')) > 0;
  coverageWarning.textContent = [
    covered ? 'Some field/label/action bounds are outside the visible rectangle. Scroll inside the screen to check reachability.' : '',
    reserve ? 'Keyboard is hidden but the product still reserves editing space. Unreported dismissal is not detectable; this simulator does not clear or patch the helper.' : '',
  ].filter(Boolean).join(' ');
}

function scheduleMeasure() {
  if (updateFrame === undefined) {
    updateFrame = requestAnimationFrame(() => {
      updateFrame = requestAnimationFrame(measure);
    });
  }
}

function fit() {
  const [width, height] = dimensions();
  const widthScale = (viewport.clientWidth - 32) / width;
  scale = mode.value === 'native' ? 1 : widthScale;
  if (mode.value === 'fit') scale = Math.min(widthScale, (viewport.clientHeight - 32) / height);
  scale = Math.max(0.01, scale);
  viewport.dataset.mode = mode.value;
  frame.style.width = `${width * scale}px`;
  frame.style.height = `${height * scale}px`;
  preview.style.width = `${width}px`;
  preview.style.height = `${height - (keyboardMode.value === 'resize' ? occlusion() : 0)}px`;
  preview.style.transform = `scale(${scale})`;
  keyboard.hidden = !visible;
  keyboard.style.height = `${occlusion() * scale}px`;
  document.getElementById('height-label').textContent = `${keyboardHeight.value}% of screen`;
  document.getElementById('profile-warning').hidden = width !== 864;
  sizeLabel.textContent = `${width} × ${height} resting CSS px · ${(scale * 100).toFixed(1)}% view`;
  scheduleMeasure();
}

function applyKeyboard() {
  keyboardFrame = undefined;
  fit();
  if (virtualKeyboard) {
    const [width, height] = dimensions();
    const reported = keyboardMode.value === 'geometry' ? occlusion() : 0;
    virtualKeyboard.boundingRect = new device.DOMRect(0, height - reported, width, reported);
    if (keyboardMode.value === 'geometry') virtualKeyboard.dispatchEvent(new device.Event('geometrychange'));
  }
  scheduleMeasure();
}

function setKeyboard(open) {
  cancelAnimationFrame(keyboardFrame);
  if (open) cancelAnimationFrame(restoreFrame);
  if (open && !activeField()) {
    coverageWarning.textContent = 'Tap an editable field first. No keyboard is opened for a disabled or read-only field.';
    return;
  }
  visible = open;
  // Let the real helper observe focus at the resting height before the first resize.
  keyboardFrame = requestAnimationFrame(() => {
    keyboardFrame = requestAnimationFrame(applyKeyboard);
  });
}

function disconnect() {
  listeners?.abort();
  observer?.disconnect();
  cancelAnimationFrame(keyboardFrame);
  cancelAnimationFrame(restoreFrame);
  editingOrigin = undefined;
  visible = false;
  device = undefined;
  virtualKeyboard = undefined;
  measurements.replaceChildren();
  coverageWarning.textContent = '';
  fit();
}

window.boothTouchscreenSimulator = {
  enabled: simulation,
  connect(view, facade) {
    if (view !== preview.contentWindow) return;
    disconnect();
    device = view;
    virtualKeyboard = facade;
    connectionError.hidden = true;
    listeners = new view.AbortController();
    const { signal } = listeners;
    const doc = view.document;
    doc.addEventListener('focusin', () => {
      if (activeField() && !editingOrigin) editingOrigin = { x: view.scrollX, y: view.scrollY };
      setKeyboard(Boolean(activeField()));
    }, { signal });
    doc.addEventListener('focusout', () => {
      queueMicrotask(() => {
        if (device === view && !activeField()) setKeyboard(false);
      });
    }, { signal });
    doc.addEventListener('pointerdown', (event) => {
      if (isEditable(event.target)) {
        if (!editingOrigin) editingOrigin = { x: view.scrollX, y: view.scrollY };
        setKeyboard(true);
      }
    }, { signal });
    ['input', 'change', 'click', 'scroll'].forEach((name) => doc.addEventListener(name, scheduleMeasure, { signal, capture: true }));
    view.addEventListener('resize', scheduleMeasure, { signal });
    view.addEventListener('pagehide', disconnect, { signal });
    doc.addEventListener('DOMContentLoaded', () => {
      observer = new view.MutationObserver(() => {
        if (visible && !activeField()) setKeyboard(false);
        scheduleMeasure();
      });
      observer.observe(doc.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'disabled', 'readonly'],
      });
      fit();
    }, { signal, once: true });
    fit();
  },
};

function endEditing() {
  const view = device;
  const origin = editingOrigin;
  cancelAnimationFrame(keyboardFrame);
  cancelAnimationFrame(restoreFrame);
  visible = false;
  applyKeyboard();
  activeField()?.blur();
  editingOrigin = undefined;
  // Let the real helper release its reserve before restoring the resting presentation.
  if (view && origin) {
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = requestAnimationFrame(() => {
        if (device === view) view.scrollTo({ left: origin.x, top: origin.y, behavior: 'instant' });
      });
    });
  }
}

function launch(screen) {
  endEditing();
  const params = new URLSearchParams({ preview: screen });
  if (screen === 'finish') params.set('step', 'finish');
  preview.src = `/content/index?${params}`;
}

function insert(text, deleting = false) {
  const field = activeField();
  if (!field) return;
  if (field.isContentEditable) {
    showError('This email test keyboard supports input/textarea fields only; use your physical keyboard for rich text.');
    return;
  }
  // Email inputs do not expose selectionStart/setRangeText in Chromium. Their model edits the end.
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const from = deleting && start === end ? Math.max(0, start - 1) : start;
  const event = new device.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: deleting ? 'deleteContentBackward' : 'insertText', data: text || null });
  if (!field.dispatchEvent(event)) return;
  field.value = field.value.slice(0, from) + text + field.value.slice(end);
  if (field.selectionStart !== null) {
    field.setSelectionRange(from + text.length, from + text.length);
  }
  field.dispatchEvent(new device.InputEvent('input', { bubbles: true, inputType: event.inputType, data: event.data }));
  scheduleMeasure();
}

function keyPress(key) {
  if (key === 'Hide') endEditing();
  else if (key === 'Shift') {
    shifted = !shifted;
    keyboard.querySelector('[data-key="Shift"]').setAttribute('aria-pressed', String(shifted));
    keyboard.querySelectorAll('[data-key]').forEach((button) => {
      if (/^[a-z]$/.test(button.dataset.key)) button.textContent = shifted ? button.dataset.key.toUpperCase() : button.dataset.key;
    });
  } else if (key === 'Enter') {
    const field = activeField();
    if (field?.form) {
      field.dispatchEvent(new device.Event('change', { bubbles: true }));
      field.form.requestSubmit();
    }
  } else {
    let text = shifted ? key.toUpperCase() : key;
    if (key === 'Backspace') text = '';
    if (key === 'Space') text = ' ';
    insert(text, key === 'Backspace');
  }
}

document.querySelectorAll('[data-keys]').forEach((row) => {
  row.dataset.keys.split(' ').forEach((key) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = key;
    button.textContent = key;
    if (key === 'Shift') button.setAttribute('aria-pressed', 'false');
    row.append(button);
  });
});
document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('[data-key], [data-preserve-focus]')) event.preventDefault();
});
keyboard.addEventListener('click', (event) => {
  const button = event.target.closest('[data-key]');
  if (button) keyPress(button.dataset.key);
});
document.querySelectorAll('[data-email]').forEach((button) => {
  button.addEventListener('click', () => {
    const field = device?.document.querySelector('#registration-email');
    if (!isEditable(field)) {
      coverageWarning.textContent = 'Start over to Entry before filling a sample address.';
      return;
    }
    field.focus({ preventScroll: true });
    field.value = '';
    insert(button.dataset.email);
    setKeyboard(true);
  });
});
document.getElementById('show-entry').addEventListener('click', () => launch('entry'));
document.getElementById('show-finish').addEventListener('click', () => launch('finish'));
document.getElementById('show-keyboard').addEventListener('click', () => setKeyboard(true));
document.getElementById('hide-keyboard').addEventListener('click', endEditing);
document.getElementById('dismiss-keyboard').addEventListener('click', () => setKeyboard(false));
document.getElementById('refresh-state').addEventListener('click', measure);
resolution.addEventListener('change', () => { endEditing(); fit(); });
keyboardMode.addEventListener('change', endEditing);
keyboardHeight.addEventListener('input', applyKeyboard);
mode.addEventListener('change', fit);
preview.addEventListener('load', () => {
  try {
    const url = new URL(preview.contentWindow.location.href);
    if (url.origin !== window.location.origin) {
      disconnect();
      showError('The frame left the local fixture origin. Start over to restore a safe test; do not enter real credentials.');
    } else if (!simulation) {
      device = preview.contentWindow;
      showError('Layout-only preview. Run npm run preview:touchscreen for interactive keyboard scenarios.');
      connectionError.setAttribute('role', 'status');
    } else if (!device) {
      showError('The simulator pre-init hook is not installed on this page. Start over to return to Entry.');
    }
  } catch {
    disconnect();
    showError('The frame is not accessible on the local fixture origin. Start over; external navigation is not simulated.');
  }
  fit();
});
new ResizeObserver(fit).observe(viewport);
if (!simulation) {
  document.querySelectorAll('#keyboard-mode, #keyboard-height, #show-keyboard, #hide-keyboard, #dismiss-keyboard, [data-email]').forEach((control) => {
    control.disabled = true;
  });
}
launch('entry');
