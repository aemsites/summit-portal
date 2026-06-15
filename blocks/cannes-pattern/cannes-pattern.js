/**
 * Cannes Lions 2026 module pattern — the event's signature visual device.
 *
 * Faithful re-creation of the modules on the Hero Pattern / Landing Page pages
 * of the Adobe Cannes Lions 2026 Expression Guidelines: bold black-on-cream
 * geometric tiles (target rings, pinwheel triangles, quarter-petals, 4-petal
 * flower, serpentine, stripes, bowtie, checker-diamond, half-disc) plus the two
 * "stamp-frame" tiles (scalloped square holding a sunburst or an 8-petal
 * flower). Exactly ONE tile carries the full-spectrum gradient — the stamp
 * flower — which on the deck's landing page is the top-left anchor of the band.
 *
 * Authoring-free, like `cobrand`: no cell content required. Variants via class:
 *   (default / `band`)  the 2-row hero band across the top of the page.
 *   `divider`           a single thin row (rarely used).
 *
 * Decorative only — never carries copy. Each tile is an inline SVG (viewBox
 * 0 0 100 100); shapes use CSS classes so inverted tiles just swap the ink/paper
 * custom properties. Shapes + rotations are assigned deterministically by index
 * (no Math.random). The on-load cascade is gated on prefers-reduced-motion.
 */

let cpUid = 0;

/* ---- SVG shape library (inner markup; bg paper rect added by buildTile) ---- */

function rot(deg, inner) {
  return deg ? `<g transform="rotate(${deg} 50 50)">${inner}</g>` : inner;
}

/* Concentric bullseye rings. */
function target() {
  const radii = [50, 42, 34, 26, 18, 10];
  return radii
    .map((r, i) => `<circle cx="50" cy="50" r="${r}" class="${i % 2 ? 'cp-paper' : 'cp-ink'}"/>`)
    .join('');
}

/* Thick parallel bars (horizontal by default; rotate 90 for vertical). */
function bars() {
  return `<g class="cp-ink">${[0, 2, 4]
    .map((k) => `<rect x="0" y="${(k * 100) / 6}" width="100" height="${100 / 6}"/>`)
    .join('')}</g>`;
}

/* Two ink triangles tip-to-tip (hourglass / bowtie). */
function bowtie() {
  return '<g class="cp-ink"><path d="M0 0 L100 0 L50 50 Z"/><path d="M0 100 L100 100 L50 50 Z"/></g>';
}

/* Pinwheel: four right-triangles rotating about the centre (windmill). */
function pinwheel() {
  return '<g class="cp-ink">'
    + '<path d="M0 0 L50 0 L0 50 Z"/>'
    + '<path d="M100 0 L100 50 L50 0 Z"/>'
    + '<path d="M100 100 L50 100 L100 50 Z"/>'
    + '<path d="M0 100 L0 50 L50 100 Z"/>'
    + '</g>';
}

/* Single right triangle filling a diagonal half (rotate for variety). */
function triangle() {
  return '<path class="cp-ink" d="M0 100 L100 100 L100 0 Z"/>';
}

/* Lens / vesica grid — four overlapping circles leaving pointed-oval "eyes". */
function lens() {
  return '<g class="cp-ink">'
    + '<circle cx="0" cy="0" r="50"/><circle cx="100" cy="0" r="50"/>'
    + '<circle cx="0" cy="100" r="50"/><circle cx="100" cy="100" r="50"/>'
    + '</g>';
}

/* Four corner quarter-discs leaving a concave 4-point star (orange-slice). */
function quarter() {
  return '<g class="cp-ink">'
    + '<path d="M0 0 L50 0 A50 50 0 0 1 0 50 Z"/>'
    + '<path d="M100 0 L100 50 A50 50 0 0 1 50 0 Z"/>'
    + '<path d="M100 100 L50 100 A50 50 0 0 1 100 50 Z"/>'
    + '<path d="M0 100 L0 50 A50 50 0 0 1 50 100 Z"/>'
    + '</g>';
}

/* Half-disc "bowl" sitting on the bottom edge. */
function bowl() {
  return '<path class="cp-ink" d="M8 30 A42 42 0 0 0 92 30 Z"/>';
}

/* Diagonal checkerboard (rotated 45° → diamond checker). */
function checker() {
  return '<g class="cp-ink" transform="rotate(45 50 50)">'
    + '<rect x="2" y="2" width="34" height="34"/><rect x="64" y="2" width="34" height="34"/>'
    + '<rect x="33" y="33" width="34" height="34"/>'
    + '<rect x="2" y="64" width="34" height="34"/><rect x="64" y="64" width="34" height="34"/>'
    + '</g>';
}

/* Four-petal flower (two crossed vesica leaves). */
function flower4() {
  return '<g class="cp-ink">'
    + '<path d="M50 6 Q70 50 50 94 Q30 50 50 6 Z"/>'
    + '<path d="M6 50 Q50 70 94 50 Q50 30 6 50 Z"/>'
    + '</g>';
}

/* Horizontal serpentine — thick rounded meander ("OOOO"). */
function serpentine() {
  return '<path class="cp-stroke" stroke-width="18" stroke-linecap="round" fill="none" '
    + 'd="M-2 26 C18 26 18 74 38 74 C58 74 58 26 78 26 C98 26 98 74 118 74"/>';
}

/* 12-spoke starburst about the centre, with a small hub. */
function sunburstRays() {
  const spokes = Array.from({ length: 12 }, (_, i) => rot(i * 30, '<path d="M50 50 L45 4 L55 4 Z"/>')).join('');
  return `<g class="cp-ink">${spokes}<circle cx="50" cy="50" r="7"/></g>`;
}

/* 8-petal papel-picado flower about the centre (fill set by caller). */
function petals8(fillRef) {
  const petals = Array.from({ length: 8 }, (_, i) => rot(i * 45, '<path d="M50 50 Q58 26 50 12 Q42 26 50 50 Z"/>')).join('');
  return `<g fill="${fillRef}">${petals}</g>`;
}

/* Scalloped "stamp" square (ink frame + paper field) holding an ink motif, or
   — for the spectrum tile — a gradient motif on the paper field. */
function scallopPath(m) {
  const r = 100 / (2 * m + 2);
  let d = `M ${r} ${r}`;
  const edges = [[2 * r, 0], [0, 2 * r], [-2 * r, 0], [0, -2 * r]];
  edges.forEach(([dx, dy]) => {
    for (let i = 0; i < m; i += 1) d += ` a ${r} ${r} 0 0 0 ${dx} ${dy}`;
  });
  return `${d} Z`;
}

function stamp(motifMarkup, { gradient } = {}) {
  cpUid += 1;
  const id = `cpg${cpUid}`;
  const grad = gradient
    ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#01a2f2"/><stop offset="20%" stop-color="#344cd4"/>
        <stop offset="36%" stop-color="#8e14b7"/><stop offset="52%" stop-color="#fe009d"/>
        <stop offset="66%" stop-color="#eb1000"/><stop offset="80%" stop-color="#ff9d01"/>
        <stop offset="92%" stop-color="#eeff01"/><stop offset="100%" stop-color="#00c738"/>
      </linearGradient></defs>`
    : '';
  const motif = typeof motifMarkup === 'function' ? motifMarkup(`url(#${id})`) : motifMarkup;
  return `${grad}<rect x="-1" y="-1" width="102" height="102" class="cp-ink"/>`
    + `<path d="${scallopPath(6)}" class="cp-paper"/>${motif}`;
}

/* Map of shape key → inner-SVG factory. */
const SHAPES = {
  target,
  barsH: bars,
  barsV: bars,
  bowtie,
  pinwheel,
  triangle,
  quarter,
  bowl,
  checker,
  flower4,
  lens,
  serpentine,
  sunburst: () => stamp(sunburstRays()),
};

/* The deterministic tiling order (repeats to fill the band). Mirrors the mix
   and rhythm of the deck's hero band. */
const ORDER = [
  'target', 'lens', 'quarter', 'barsV', 'serpentine', 'flower4',
  'sunburst', 'checker', 'triangle', 'target', 'bowtie', 'barsH',
  'quarter', 'serpentine', 'bowl', 'pinwheel', 'lens', 'checker',
  'triangle', 'flower4', 'target', 'barsV', 'sunburst', 'quarter',
];

/* Per-shape default rotations for variety (deg). */
const ROT = { barsV: 90, triangle: 0, pinwheel: 0, bowl: 0 };

const VARIANTS = {
  band: { cls: 'cp-band', count: 48 },
  divider: { cls: 'cp-divider', count: 40 },
};

function buildTile(index, isAccent) {
  const tile = document.createElement('span');
  tile.className = 'cp-tile';
  tile.setAttribute('aria-hidden', 'true');

  let inner;
  if (isAccent) {
    // The lone full-spectrum gradient tile — the scalloped "stamp flower".
    tile.dataset.accent = 'true';
    inner = stamp(petals8, { gradient: true });
  } else {
    const key = ORDER[index % ORDER.length];
    const factory = SHAPES[key] || target;
    inner = rot(ROT[key] || 0, factory());
    if (index % 3 === 1) tile.dataset.invert = 'true';
  }

  tile.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
    + `<rect x="-1" y="-1" width="102" height="102" class="cp-paper"/>${inner}</svg>`;
  return tile;
}

function runCascade(grid, tiles) {
  grid.classList.add('cp-anim');
  tiles.forEach((tile, i) => {
    tile.style.setProperty('--cp-delay', `${i * 26}ms`);
  });
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
    // The spectrum stamp-flower anchors the top-left of the band (index 0).
    const tile = buildTile(i, i === 0);
    tiles.push(tile);
    grid.append(tile);
  }
  block.append(grid);

  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          runCascade(grid, tiles);
          obs.disconnect();
        }
      });
    }, { threshold: 0.1 });
    io.observe(block);
  } else {
    runCascade(grid, tiles);
  }
}
