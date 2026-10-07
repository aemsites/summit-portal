import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import decorate from '../../blocks/report-carousel/report-carousel.js';

describe('report carousel swipe navigation', () => {
  let clock;
  let block;
  let surface;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    document.body.innerHTML = `<main><div class="report-carousel">
      <div><div>Executive overview</div><div>Search</div></div>
      <div><div>Top insight</div><div><h3>Three pillars</h3><p>Overview.</p></div></div>
      <div><div>Finding</div><div><h3>Second finding</h3><p>Details.</p></div></div>
      <div><div>Finding</div><div><h3>Third finding</h3><p>Details.</p></div></div>
      <div><div>Search</div></div>
      <div><div>Finding</div><div><h3>Only search finding</h3><p>Details.</p></div></div>
    </div></main>`;
    block = document.querySelector('.report-carousel');
    decorate(block);
    surface = block.querySelector('.rc-slides-wrap');
  });

  afterEach(() => {
    clock.restore();
    document.querySelector('main')?.remove();
  });

  function swipe(dx, dy = 0, target = surface, pointerType = 'touch') {
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 1, isPrimary: true, pointerType, clientX: 200, clientY: 200,
    }));
    target.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
      pointerType,
      clientX: 200 + dx,
      clientY: 200 + dy,
    }));
    clock.tick(400);
  }

  const finding = () => block.querySelector('.rc-counter-label').textContent;

  it('swipes both ways and wraps within the selected tab', () => {
    swipe(-100);
    expect(finding()).to.equal('Finding 2 of 3');
    swipe(100, 0, surface, 'pen');
    expect(finding()).to.equal('Finding 1 of 3');
    swipe(100);
    expect(finding()).to.equal('Finding 3 of 3');
    swipe(-100);
    expect(finding()).to.equal('Finding 1 of 3');
  });

  it('ignores vertical scrolling, small gestures, mouse drags and interactive targets', () => {
    const link = document.createElement('a');
    link.href = '#details';
    surface.append(link);
    swipe(-100, 150);
    swipe(-10);
    swipe(-100, 0, surface, 'mouse');
    swipe(-100, 0, link);
    expect(finding()).to.equal('Finding 1 of 3');
  });

  it('does not hide the sole slide when swiped or navigated', () => {
    block.querySelectorAll('.rc-tab')[1].click();
    swipe(-100);
    expect(block.querySelectorAll('.rc-slide:not([hidden])').length).to.equal(1);
    block.querySelector('.rc-nav-next').click();
    clock.tick(400);
    expect(block.querySelectorAll('.rc-slide:not([hidden])').length).to.equal(1);
  });

  it('keeps the current slide visible after rapid navigation back to it', () => {
    block.querySelector('.rc-nav-next').click();
    block.querySelector('.rc-nav-prev').click();
    clock.tick(400);
    expect(finding()).to.equal('Finding 1 of 3');
    expect(block.querySelector('.rc-slide').hidden).to.equal(false);
  });

  it('restores a slide when tabs switch during its exit animation', () => {
    block.querySelector('.rc-nav-next').click();
    block.querySelectorAll('.rc-tab')[1].click();
    block.querySelectorAll('.rc-tab')[0].click();
    clock.tick(400);
    const visible = block.querySelectorAll('.rc-slide:not([hidden])');
    expect(visible.length).to.equal(1);
    expect(visible[0].style.opacity).to.equal('1');
    expect(finding()).to.equal('Finding 2 of 3');
  });

  it('ignores a canceled gesture', () => {
    surface.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 200 }));
    surface.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    surface.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 50 }));
    expect(finding()).to.equal('Finding 1 of 3');
  });

  it('does not replace the primary gesture with a second touch', () => {
    surface.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 200 }));
    surface.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, isPrimary: false, pointerType: 'touch', clientX: 300 }));
    surface.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, isPrimary: false, pointerType: 'touch', clientX: 100 }));
    expect(finding()).to.equal('Finding 1 of 3');
  });
});
