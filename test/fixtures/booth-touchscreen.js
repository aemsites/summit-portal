const viewport = document.getElementById('viewport');
const frame = document.getElementById('frame');
const preview = document.getElementById('preview');
const resolution = document.getElementById('resolution');
const mode = document.getElementById('mode');
const sizeLabel = document.getElementById('size-label');
const entryButton = document.getElementById('show-entry');
const finishButton = document.getElementById('show-finish');
let screen = 'entry';

function fit() {
  const [width, height] = resolution.value.split('x').map(Number);
  const widthScale = (viewport.clientWidth - 32) / width;
  let scale = 1;
  if (mode.value === 'width') scale = widthScale;
  if (mode.value === 'fit') {
    scale = Math.min(widthScale, (viewport.clientHeight - 32) / height);
  }
  scale = Math.max(0.01, scale);
  viewport.dataset.mode = mode.value;
  frame.style.width = `${width * scale}px`;
  frame.style.height = `${height * scale}px`;
  preview.style.width = `${width}px`;
  preview.style.height = `${height}px`;
  preview.style.transform = `scale(${scale})`;
  const actual = preview.contentWindow;
  sizeLabel.textContent = `CSS viewport: ${actual.innerWidth} × ${actual.innerHeight} · view scale: ${(scale * 100).toFixed(1)}% · layout is not resized`;
}

function show() {
  const params = new URLSearchParams({ preview: screen });
  if (screen === 'finish') params.set('step', 'finish');
  preview.src = `/content/index?${params}`;
  entryButton.setAttribute('aria-pressed', String(screen === 'entry'));
  finishButton.setAttribute('aria-pressed', String(screen === 'finish'));
}

entryButton.addEventListener('click', () => { screen = 'entry'; show(); });
finishButton.addEventListener('click', () => { screen = 'finish'; show(); });
resolution.addEventListener('change', fit);
mode.addEventListener('change', fit);
preview.addEventListener('load', fit);
new ResizeObserver(fit).observe(viewport);
show();
fit();
