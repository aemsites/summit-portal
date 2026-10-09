import { readBoothPresentation, withBoothPresentation } from './booth-presentation.js';

const width = 2160;
const height = 3840;
const keyboardHeight = 1728;
const screen = document.getElementById('booth-screen');
const frame = document.querySelector('.touchscreen-frame');
const display = document.querySelector('.touchscreen-display');
const keyboard = document.querySelector('.touchscreen-keyboard');
const error = document.querySelector('.touchscreen-error');
const presentation = readBoothPresentation(window.location.search);
const editable = 'textarea, input:not([type]), input:is([type="text"], [type="email"], [type="tel"], [type="url"], [type="search"], [type="password"])';
let device;
let facade;
let listeners;
let shifted = false;
let origin;
let restoreFrame;
let restoreView;

function fit() {
  const scale = Math.max(0.01, Math.min(
    (window.innerWidth - 32) / width,
    (window.innerHeight - 32) / height,
  ));
  frame.style.width = `${width * scale}px`;
  frame.style.height = `${height * scale}px`;
  display.style.transform = `scale(${scale})`;
}

function activeField() {
  const field = device?.document.activeElement;
  return field?.matches(editable) && !field.disabled && !field.readOnly
    && field.getClientRects().length ? field : null;
}

function setKeyboard(visible) {
  if (visible) restoreView?.cancelAnimationFrame(restoreFrame);
  keyboard.hidden = !visible;
  if (facade) {
    facade.boundingRect = new device.DOMRect(
      0,
      visible ? height - keyboardHeight : height,
      width,
      visible ? keyboardHeight : 0,
    );
    facade.dispatchEvent(new device.Event('geometrychange'));
  }
}

function disconnect() {
  listeners?.abort();
  restoreView?.cancelAnimationFrame(restoreFrame);
  restoreFrame = undefined;
  restoreView = undefined;
  keyboard.hidden = true;
  device = undefined;
  facade = undefined;
  origin = undefined;
  shifted = false;
  keyboard.querySelector('[data-key="Shift"]').setAttribute('aria-pressed', 'false');
  keyboard.querySelectorAll('[data-key]').forEach((button) => {
    if (/^[a-z]$/.test(button.dataset.key)) button.textContent = button.dataset.key;
  });
}

function endEditing() {
  const view = device;
  const resting = origin;
  setKeyboard(false);
  activeField()?.blur();
  origin = undefined;
  // The booth helper releases its scroll reserve in the next animation frame.
  if (view && resting) {
    const doc = view.document;
    restoreView = view;
    restoreFrame = view.requestAnimationFrame(() => {
      restoreFrame = undefined;
      if (device === view && view.document === doc && !activeField()) {
        view.scrollTo({ left: resting.x, top: resting.y, behavior: 'instant' });
      }
    });
  }
}

window.boothTouchscreenPresentation = {
  accepts: (view) => view === screen.contentWindow,
  connect(view, virtualKeyboard) {
    if (view !== screen.contentWindow) return;
    disconnect();
    error.hidden = true;
    device = view;
    facade = virtualKeyboard;
    listeners = new view.AbortController();
    const { signal } = listeners;
    const doc = view.document;
    const focus = () => {
      const field = activeField();
      if (field && !origin) origin = { x: view.scrollX, y: view.scrollY };
      setKeyboard(Boolean(field));
    };
    doc.addEventListener('focusin', focus, { signal });
    doc.addEventListener('focusout', () => {
      queueMicrotask(() => {
        if (device === view && view.document === doc && !activeField()) endEditing();
      });
    }, { signal });
    doc.addEventListener('pointerdown', (event) => {
      if (event.target.matches(editable)) focus();
    }, { signal });
    view.addEventListener('pagehide', disconnect, { signal, once: true });
  },
};

function insert(text, deleting = false) {
  const field = activeField();
  if (!field) return;
  // Chromium email fields expose no text selection API; edit at their native end.
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const from = deleting && start === end ? Math.max(0, start - 1) : start;
  const input = new device.InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: deleting ? 'deleteContentBackward' : 'insertText',
    data: text || null,
  });
  if (!field.dispatchEvent(input)) return;
  field.value = field.value.slice(0, from) + text + field.value.slice(end);
  if (field.selectionStart !== null) {
    field.setSelectionRange(from + text.length, from + text.length);
  }
  field.dispatchEvent(new device.InputEvent('input', { bubbles: true, inputType: input.inputType, data: input.data }));
}

function press(key) {
  if (key === 'Hide') endEditing();
  else if (key === 'Shift') {
    shifted = !shifted;
    keyboard.querySelector('[data-key="Shift"]').setAttribute('aria-pressed', String(shifted));
    keyboard.querySelectorAll('[data-key]').forEach((button) => {
      if (/^[a-z]$/.test(button.dataset.key)) {
        button.textContent = shifted ? button.dataset.key.toUpperCase() : button.dataset.key;
      }
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

keyboard.querySelectorAll('[data-keys]').forEach((row) => {
  row.dataset.keys.split(' ').forEach((key) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = key;
    button.textContent = key;
    if (key === 'Shift') button.setAttribute('aria-pressed', 'false');
    row.append(button);
  });
});
keyboard.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button')) event.preventDefault();
});
keyboard.addEventListener('click', (event) => {
  const button = event.target.closest('[data-key]');
  if (button) press(button.dataset.key);
});
screen.addEventListener('load', () => {
  const url = new URL(screen.src);
  try {
    url.href = screen.contentWindow.location.href;
    if (url.origin !== window.location.origin) throw new Error('The booth left this presentation.');
    if (url.pathname === '/login') {
      disconnect();
      url.searchParams.set('redirect', withBoothPresentation('/booth', { ...presentation, touchscreen: '1' }));
      window.location.replace(url.href);
    } else if (url.pathname === '/booth' && url.searchParams.get('touchscreen') !== 'frame') {
      screen.contentWindow.location.replace(withBoothPresentation(`/booth${url.search}`, { ...presentation, touchscreen: 'frame' }));
    } else if (!device) {
      error.textContent = 'This page could not connect to the touchscreen. Reload the booth or ask staff.';
      error.hidden = false;
    }
  } catch (failure) {
    disconnect();
    error.textContent = `${failure.message} Reload the booth or ask staff.`;
    error.hidden = false;
  }
});
window.addEventListener('resize', fit);
window.addEventListener('pagehide', disconnect);
fit();
screen.src = withBoothPresentation(`/booth${window.location.search}`, { ...presentation, touchscreen: 'frame' });
