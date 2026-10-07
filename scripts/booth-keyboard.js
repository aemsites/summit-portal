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

  function clear() {
    html.classList.remove('booth-keyboard-active');
    html.style.removeProperty('--booth-keyboard-inset');
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
      clear();
      return;
    }
    const top = viewport?.offsetTop || 0;
    let bottom = Math.min(view.innerHeight, top + (viewport?.height || view.innerHeight));
    const geometry = keyboard?.boundingRect;
    const resized = restingHeight - view.innerHeight > restingHeight * 0.15;
    if (geometry?.height > 0) bottom = Math.min(bottom, geometry.y);
    else if (touch && !geometryReported && !resized && bottom === view.innerHeight) {
      // Unreported overlays need real scroll range; reserve half the screen while editing.
      bottom = view.innerHeight / 2;
    }
    const inset = Math.max(0, view.innerHeight - bottom);
    html.style.setProperty('--booth-keyboard-inset', `${inset}px`);
    html.classList.add('booth-keyboard-active');
    const barHeight = control?.getBoundingClientRect().height || 0;
    const bounds = field.getBoundingClientRect();
    const label = field.labels?.[0]?.getBoundingClientRect();
    const fieldTop = Math.min(bounds.top, label?.top ?? bounds.top);
    if (fieldTop < top + 24 || bounds.bottom > bottom - barHeight - 24) {
      view.scrollTo({ top: Math.max(0, view.scrollY + fieldTop - top - 24), behavior: 'instant' });
    }
  }

  function update() {
    if (frame === undefined) frame = view.requestAnimationFrame(reconcile);
  }

  function geometryChange() {
    geometryReported = true;
    update();
  }

  function pagehide() {
    root.activeElement?.blur();
    clear();
  }

  ['focusin', 'focusout', 'input'].forEach((name) => root.addEventListener(name, update));
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
      ['focusin', 'focusout', 'input'].forEach((name) => root.removeEventListener(name, update));
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
