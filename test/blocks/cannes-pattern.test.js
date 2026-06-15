import { expect } from '@esm-bundle/chai';
import decorate from '../../blocks/cannes-pattern/cannes-pattern.js';

/** Build the minimal authored markup the block ships with (one empty row). */
function makeBlock(...variants) {
  const block = document.createElement('div');
  block.className = ['cannes-pattern', ...variants].join(' ');
  block.innerHTML = '<div></div>';
  document.body.append(block);
  return block;
}

describe('cannes-pattern', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a tile grid (band variant by default)', () => {
    const block = makeBlock();
    decorate(block);
    const grid = block.querySelector('.cp-grid');
    expect(grid, 'grid present').to.exist;
    expect(block.classList.contains('cp-band'), 'band class').to.be.true;
    expect(grid.querySelectorAll('.cp-tile').length).to.equal(24);
  });

  it('renders exactly one full-spectrum accent tile', () => {
    const block = makeBlock();
    decorate(block);
    const accents = block.querySelectorAll('.cp-shape-spectrum');
    expect(accents.length).to.equal(1);
    expect(accents[0].dataset.accent).to.equal('true');
  });

  it('honors the divider variant with its own tile count', () => {
    const block = makeBlock('divider');
    decorate(block);
    expect(block.classList.contains('cp-divider')).to.be.true;
    expect(block.querySelectorAll('.cp-tile').length).to.equal(32);
    // still exactly one accent
    expect(block.querySelectorAll('.cp-shape-spectrum').length).to.equal(1);
  });

  it('is decorative — marked aria-hidden and carries no authored copy', () => {
    const block = makeBlock();
    decorate(block);
    expect(block.getAttribute('aria-hidden')).to.equal('true');
    expect(block.textContent.trim()).to.equal('');
  });

  it('assigns shapes deterministically (reproducible across runs)', () => {
    const a = makeBlock();
    const b = makeBlock();
    decorate(a);
    decorate(b);
    const classesOf = (el) => [...el.querySelectorAll('.cp-tile')]
      .map((t) => t.className);
    expect(classesOf(a)).to.deep.equal(classesOf(b));
  });
});
