/**
 * Cannes Lions 2026 module pattern — the event's signature visual device.
 *
 * Renders a grid of bold geometric "module" tiles (quarter-arcs, bowls, target
 * rings, sunbursts, stripes, checkers, dots, triangles/pinwheels) butted edge to
 * edge, with exactly ONE full-spectrum gradient accent tile per band — per the
 * Adobe Cannes 2026 Expression Guidelines ("max 3–5 gradient modules", used
 * sparingly as the lone pop of color in an otherwise red/black system).
 *
 * Authoring-free, like `cobrand`: no cell content required. Variants via class:
 *   (default / `band`) full-width decorative strip — one row of ~48px tiles.
 *   `divider`              thin between-section rule — one row of smaller tiles.
 *
 * Decorative only — never carries copy. Shapes + rotations are assigned
 * deterministically by index (no Math.random) so the wall is reproducible.
 * Motion (staggered on-load cascade) is gated on prefers-reduced-motion and
 * fired once when the band scrolls into view.
 */

/* A small, deterministic library of module shapes. Each maps to a CSS class
   (see cannes-pattern.css). Order is the repeating sequence used to tile. */
const SHAPES = [
  'arc', 'target', 'bowl', 'checker', 'stripes', 'dot',
  'sunburst', 'tri', 'arc', 'rings', 'stripes', 'bowl',
];

/* Rotations cycle so the same shape reads differently across the grid. */
const ROTATIONS = [0, 90, 180, 270];

/* Tile counts per variant. The accent (spectrum) tile is placed at a fixed,
   off-center index so it reads as an intentional single accent. */
const VARIANTS = {
  band: { count: 24, accentIndex: 17, cls: 'cp-band' },
  divider: { count: 32, accentIndex: 11, cls: 'cp-divider' },
};

function buildTile(index, variant) {
  const tile = document.createElement('span');
  tile.className = 'cp-tile';

  if (index === variant.accentIndex) {
    // The lone full-spectrum gradient accent. Round shape → angular (conic)
    // gradient, matching the guideline's "circular modules use angular
    // gradient" rule. The gradient itself lives in CSS.
    tile.classList.add('cp-shape-spectrum');
    tile.dataset.accent = 'true';
    return tile;
  }

  const shape = SHAPES[index % SHAPES.length];
  tile.classList.add(`cp-shape-${shape}`);
  const rot = ROTATIONS[index % ROTATIONS.length];
  if (rot) tile.dataset.rot = String(rot);

  // Alternate ink/paper foreground so the grid keeps the black+paper rhythm.
  if (index % 3 === 0) tile.dataset.invert = 'true';
  return tile;
}

function runCascade(grid, tiles) {
  // Staggered "In animation" wave — opacity + scale, sequenced by index so it
  // surges left→right. Fires once. Honors prefers-reduced-motion via CSS (the
  // .cp-anim class only animates inside the no-preference media query).
  grid.classList.add('cp-anim');
  tiles.forEach((tile, i) => {
    tile.style.setProperty('--cp-delay', `${i * 45}ms`);
  });
  // Trigger the shimmer sweep once the cascade has mostly settled.
  window.setTimeout(() => grid.classList.add('cp-shimmer-done'), tiles.length * 45 + 600);
}

export default function decorate(block) {
  const variantKey = block.classList.contains('divider') ? 'divider' : 'band';
  const variant = VARIANTS[variantKey];

  block.textContent = '';
  block.setAttribute('aria-hidden', 'true');
  block.classList.add(variant.cls);

  const grid = document.createElement('div');
  grid.className = 'cp-grid';

  const tiles = [];
  for (let i = 0; i < variant.count; i += 1) {
    const tile = buildTile(i, variant);
    tiles.push(tile);
    grid.append(tile);
  }
  block.append(grid);

  // Fire the cascade once the band is visible. The cascade CSS is itself gated
  // on prefers-reduced-motion, so reduced-motion users get a static grid.
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          runCascade(grid, tiles);
          obs.disconnect();
        }
      });
    }, { threshold: 0.15 });
    io.observe(block);
  } else {
    runCascade(grid, tiles);
  }
}
