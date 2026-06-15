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

  it('renders an SVG tile grid (band variant by default)', () => {
    const block = makeBlock();
    decorate(block);
    const grid = block.querySelector('.cp-grid');
    expect(grid, 'grid present').to.exist;
    expect(block.classList.contains('cp-band'), 'band class').to.be.true;
    const tiles = grid.querySelectorAll('.cp-tile');
    expect(tiles.length).to.equal(48);
    // each tile is a self-contained inline SVG (no raster assets)
    expect(tiles[0].querySelector('svg'), 'tile renders an svg').to.exist;
    expect(block.querySelector('img'), 'no raster images').to.not.exist;
  });

  it('anchors exactly one full-spectrum accent tile at the top-left', () => {
    const block = makeBlock();
    decorate(block);
    const accents = block.querySelectorAll('.cp-tile[data-accent="true"]');
    expect(accents.length).to.equal(1);
    // it must be the first tile (top-left of the band) and carry a gradient
    expect(block.querySelector('.cp-tile')).to.equal(accents[0]);
    expect(accents[0].querySelector('linearGradient'), 'spectrum gradient').to.exist;
  });

  it('honors the divider variant with its own tile count', () => {
    const block = makeBlock('divider');
    decorate(block);
    expect(block.classList.contains('cp-divider')).to.be.true;
    expect(block.querySelectorAll('.cp-tile').length).to.equal(40);
    expect(block.querySelectorAll('.cp-tile[data-accent="true"]').length).to.equal(1);
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
    // Gradient element ids are intentionally unique per block (so multiple
    // bands on one page don't collide) — normalize them before comparing the
    // otherwise-deterministic shape structure.
    const svgOf = (el) => [...el.querySelectorAll('.cp-tile')]
      .map((t) => t.innerHTML.replace(/cpg\d+/g, 'cpg'));
    expect(svgOf(a)).to.deep.equal(svgOf(b));
  });
});
