/* Blocking pre-init bridge, only for this same-origin presentation's own iframe. */
(() => {
  const params = new URLSearchParams(window.location.search);
  if (window.parent === window || params.getAll('touchscreen').length !== 1
    || params.get('touchscreen') !== 'frame') return;
  let host;
  try {
    const parent = new URL(window.parent.location.href);
    if (parent.origin !== window.location.origin || parent.pathname !== '/booth'
      || parent.searchParams.getAll('touchscreen').length !== 1
      || parent.searchParams.get('touchscreen') !== '1') return;
    host = window.parent.boothTouchscreenPresentation;
  } catch {
    return;
  }
  if (!host?.accepts(window)) return;
  const keyboard = Object.assign(new EventTarget(), { boundingRect: new DOMRect() });
  Object.defineProperty(navigator, 'virtualKeyboard', { configurable: true, value: keyboard });
  host.connect(window, keyboard);
})();
