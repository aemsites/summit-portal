import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { mountBoothKeyboard } from '../../scripts/booth-keyboard.js';

describe('scoped booth keyboard handling', () => {
  let sandbox;
  let keyboard;
  let fixture;
  let viewport;
  let virtualKeyboard;
  let active;
  const inset = () => document.documentElement.style.getPropertyValue('--booth-keyboard-inset');

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    sandbox.stub(window, 'requestAnimationFrame').callsFake((callback) => window.setTimeout(callback, 16));
    sandbox.stub(window, 'cancelAnimationFrame').callsFake((frame) => window.clearTimeout(frame));
    sandbox.stub(window, 'innerHeight').value(1920);
    sandbox.stub(navigator, 'maxTouchPoints').value(1);
    viewport = Object.assign(new EventTarget(), { height: 1920, offsetTop: 0, scale: 1 });
    virtualKeyboard = Object.assign(new EventTarget(), { boundingRect: new DOMRect() });
    sandbox.stub(window, 'visualViewport').value(viewport);
    sandbox.stub(navigator, 'virtualKeyboard').value(virtualKeyboard);
    sandbox.stub(window, 'scrollTo');
    fixture = document.createElement('div');
    fixture.innerHTML = '<label for="keyboard-field">Primary market</label><input id="keyboard-field"><input type="checkbox">';
    document.body.append(fixture);
    active = document.body;
    sandbox.stub(document, 'activeElement').get(() => active);
    sandbox.stub(fixture.querySelector('input'), 'blur').callsFake(() => {
      active = document.body;
      document.dispatchEvent(new Event('focusout'));
    });
    sandbox.stub(fixture.querySelector('label'), 'getBoundingClientRect').returns({ top: 1450 });
    sandbox.stub(fixture.querySelector('input'), 'getBoundingClientRect').returns({ top: 1510, bottom: 1588 });
    keyboard = mountBoothKeyboard(document);
  });

  afterEach(() => {
    keyboard.destroy();
    fixture.remove();
    sandbox.restore();
  });

  async function focus() {
    active = fixture.querySelector('input');
    document.dispatchEvent(new Event('focusin'));
    await sandbox.clock.tickAsync(32);
  }

  it('creates scroll room for unreported touch overlays and positions the field with its label', async () => {
    await focus();
    expect(inset()).to.equal('960px');
    expect(window.scrollTo.lastCall.args[0].top).to.equal(window.scrollY + 1450 - 24);
  });

  it('uses reported overlay geometry without changing the browser keyboard policy', async () => {
    await focus();
    virtualKeyboard.boundingRect = new DOMRect(0, 1100, 1080, 820);
    virtualKeyboard.dispatchEvent(new Event('geometrychange'));
    await sandbox.clock.tickAsync(32);
    expect(inset()).to.equal('820px');
    expect(virtualKeyboard.overlaysContent).to.equal(undefined);
    virtualKeyboard.boundingRect = new DOMRect();
    virtualKeyboard.dispatchEvent(new Event('geometrychange'));
    await sandbox.clock.tickAsync(32);
    expect(inset()).to.equal('0px');
  });

  it('handles visual viewport resize and panning without double-counting offset', async () => {
    await focus();
    viewport.height = 960;
    viewport.offsetTop = 100;
    viewport.dispatchEvent(new Event('resize'));
    await sandbox.clock.tickAsync(32);
    expect(inset()).to.equal('860px');
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event('scroll'));
    await sandbox.clock.tickAsync(32);
    expect(inset()).to.equal('960px');
    viewport.scale = 2;
    viewport.dispatchEvent(new Event('resize'));
    await sandbox.clock.tickAsync(32);
    expect(document.documentElement.classList.contains('booth-keyboard-active')).to.equal(false);
  });

  it('does not reserve another half-screen when the layout viewport already shrank', async () => {
    await focus();
    sandbox.stub(window, 'innerHeight').value(1100);
    viewport.height = 1100;
    window.dispatchEvent(new Event('resize'));
    await sandbox.clock.tickAsync(32);
    expect(inset()).to.equal('0px');
    expect(window.scrollTo.called).to.equal(true);
  });

  it('does not infer an overlay for a mouse-only desktop', async () => {
    keyboard.destroy();
    sandbox.stub(navigator, 'maxTouchPoints').value(0);
    sandbox.stub(window, 'matchMedia').returns({ matches: false });
    keyboard = mountBoothKeyboard(document);
    await focus();
    expect(inset()).to.equal('0px');
  });

  it('releases space for checkboxes, blur and pagehide and still works after history restoration', async () => {
    await focus();
    active = fixture.querySelector('[type="checkbox"]');
    document.dispatchEvent(new Event('focusin'));
    expect(document.activeElement).to.equal(fixture.querySelector('[type="checkbox"]'));
    await sandbox.clock.tickAsync(32);
    expect(inset()).to.equal('');
    await focus();
    window.dispatchEvent(new Event('pagehide'));
    await sandbox.clock.tickAsync(32);
    expect(inset()).to.equal('');
    expect(document.activeElement).not.to.equal(fixture.querySelector('input'));
    await focus();
    expect(inset()).to.equal('960px');
    fixture.querySelector('input').blur();
    await sandbox.clock.tickAsync(32);
    expect(inset()).to.equal('');
  });

  it('ignores detached fixtures and removes listeners on destruction', async () => {
    const detached = document.implementation.createHTMLDocument('');
    const inert = mountBoothKeyboard(detached);
    inert.update();
    inert.destroy();
    expect(detached.documentElement.classList.contains('booth-keyboard-active')).to.equal(false);
    await focus();
    keyboard.destroy();
    virtualKeyboard.boundingRect = new DOMRect(0, 1100, 1080, 820);
    virtualKeyboard.dispatchEvent(new Event('geometrychange'));
    await sandbox.clock.tickAsync(32);
    expect(inset()).to.equal('');
  });
});
