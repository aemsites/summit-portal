const editable = 'textarea, input:not([type]), input:is([type="text"], [type="email"], [type="tel"], [type="url"], [type="search"], [type="password"], [type="number"]), [contenteditable="true"]';

/** Reserve keyboard space only in a mounted booth, including keyboards without geometry APIs. */
export function mountBoothKeyboard(root = document, control = null) {
  const view = root.defaultView;
  if (!view) return { clear() {}, update() {}, destroy() {} };
  const html = root.documentElement;
  const viewport = view.visualViewport;
  const keyboard = view.navigator.virtualKeyboard;
  const touch = view.navigator.maxTouchPoints > 0 || view.matchMedia('(pointer: coarse)').matches;
  let restingHeight = view.innerHeight;
  let frame;
  let geometryReported = false;
  let observed = false;
  let dismissed = false;
  let focused;

  function release() {
    html.classList.remove('booth-keyboard-active');
    html.style.removeProperty('--booth-keyboard-inset');
  }

  function clear() {
    observed = false;
    dismissed = false;
    geometryReported = false;
    focused = undefined;
    release();
  }

  function reconcile() {
    frame = undefined;
    const field = root.activeElement;
    if (!field?.matches(editable) || field.disabled || field.readOnly
      || !field.getClientRects().length) {
      restingHeight = view.innerHeight;
      clear();
      return;
    }
    // Pinch zoom is not a keyboard, and should retain the browser's native panning.
    if (viewport && viewport.scale !== 1) {
      release();
      return;
    }
    const top = viewport?.offsetTop || 0;
    let bottom = Math.min(view.innerHeight, top + (viewport?.height || view.innerHeight));
    const geometry = keyboard?.boundingRect;
    const resized = restingHeight - view.innerHeight > restingHeight * 0.15;
    const visible = geometry?.height > 0 || resized
      || (viewport && restingHeight - viewport.height > restingHeight * 0.15);
    if (visible) {
      observed = true;
      dismissed = false;
    } else if (observed) {
      dismissed = true;
    }
    if (geometry?.height > 0) bottom = Math.min(bottom, geometry.y);
    else if (touch && !geometryReported && !dismissed && !resized && bottom === view.innerHeight) {
      // Unreported overlays need real scroll range; reserve half the screen while editing.
      bottom = view.innerHeight / 2;
    }
    const inset = Math.max(0, view.innerHeight - bottom);
    html.style.setProperty('--booth-keyboard-inset', `${inset}px`);
    html.classList.toggle('booth-keyboard-active', Boolean(visible || inset > 0));
    const barHeight = control?.getBoundingClientRect().height || 0;
    const bounds = field.getBoundingClientRect();
    const label = field.labels?.[0]?.getBoundingClientRect();
    const fieldTop = Math.min(bounds.top, label?.top ?? bounds.top);
    const action = field.form?.querySelector('button[type="submit"]:not(:disabled), button:not([type]):not(:disabled), input[type="submit"]:not(:disabled)');
    const actionBottom = action?.getClientRects().length
      ? action.getBoundingClientRect().bottom : bounds.bottom;
    const groupBottom = Math.max(bounds.bottom, actionBottom);
    if (fieldTop < top + 24) {
      view.scrollTo({ top: Math.max(0, view.scrollY + fieldTop - top - 24), behavior: 'instant' });
    } else if (groupBottom > bottom - barHeight - 24) {
      const distance = Math.min(groupBottom - bottom + barHeight + 24, fieldTop - top - 24);
      view.scrollTo({ top: Math.max(0, view.scrollY + distance), behavior: 'instant' });
    }
  }

  function update() {
    if (frame === undefined) frame = view.requestAnimationFrame(reconcile);
  }

  function geometryChange() {
    geometryReported = true;
    update();
  }

  function focusIn() {
    const field = root.activeElement;
    if (field !== focused && (!observed || dismissed)) {
      observed = false;
      dismissed = false;
      geometryReported = false;
    }
    focused = field;
    update();
  }

  function pointerDown(event) {
    const field = root.activeElement;
    const action = event.target.closest('button, input');
    if (event.button === 0 && html.classList.contains('booth-keyboard-active')
      && field?.matches(editable) && field.form && action?.form === field.form
      && action.type === 'submit' && !action.disabled) {
      // Keep the submit hitbox stable until its native click; blur can collapse scroll space.
      event.preventDefault();
    }
    if (dismissed && event.target === root.activeElement && event.target.matches(editable)) {
      observed = false;
      dismissed = false;
      geometryReported = false;
      update();
    }
  }

  function pagehide() {
    root.activeElement?.blur();
    clear();
  }

  root.addEventListener('focusin', focusIn);
  root.addEventListener('pointerdown', pointerDown);
  ['focusout', 'input'].forEach((name) => root.addEventListener(name, update));
  view.addEventListener('resize', update);
  view.addEventListener('pagehide', pagehide);
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  keyboard?.addEventListener('geometrychange', geometryChange);
  const observer = control ? new view.ResizeObserver(update) : null;
  if (control) observer.observe(control);
  update();
  return {
    clear,
    update,
    destroy() {
      view.cancelAnimationFrame(frame);
      root.removeEventListener('focusin', focusIn);
      root.removeEventListener('pointerdown', pointerDown);
      ['focusout', 'input'].forEach((name) => root.removeEventListener(name, update));
      view.removeEventListener('resize', update);
      view.removeEventListener('pagehide', pagehide);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      keyboard?.removeEventListener('geometrychange', geometryChange);
      observer?.disconnect();
      clear();
    },
  };
}
