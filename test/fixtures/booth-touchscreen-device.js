/* Classic, blocking script: install only the opted-in local frame's facade before booth modules. */
(() => {
  if (window.parent === window) return;
  let simulator;
  try {
    simulator = window.parent.boothTouchscreenSimulator;
  } catch {
    // A foreign parent is never a simulation opt-in.
    return;
  }
  if (!simulator?.enabled || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
  const keyboard = Object.assign(new EventTarget(), { boundingRect: new DOMRect() });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 1 });
  Object.defineProperty(navigator, 'virtualKeyboard', { configurable: true, value: keyboard });
  simulator.connect(window, keyboard);
})();
