import { expect } from '@esm-bundle/chai';
import { buildInsightHero } from '../../blocks/report-hero/report-hero.js';

const validImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="red"/></svg>')}`;
const brokenImage = 'data:image/png;base64,invalid';

function createHero() {
  const block = document.createElement('div');
  block.className = 'report-hero insight';
  block.innerHTML = `<div>
    <div>
      <h1>Example company</h1>
      <p>Digital Opportunity Report</p>
      <p><picture><img alt="" src="${validImage}"></picture>
        <a href="https://example.com">example.com</a></p>
    </div>
    <div></div>
  </div>`;
  document.body.append(block);
  return block;
}

function addImage(block, picture = true) {
  const image = document.createElement('img');
  image.setAttribute('data-da-screenshot', 'desktop');
  image.loading = 'lazy';
  const cell = block.firstElementChild.lastElementChild;
  if (picture) {
    const wrapper = document.createElement('picture');
    wrapper.append(image);
    cell.append(wrapper);
  } else {
    cell.append(image);
  }
  return image;
}

function imageSettled(image) {
  return new Promise((resolve) => {
    // Wait for all event listeners, including the hero's error handler.
    const settled = () => setTimeout(resolve, 0);
    image.addEventListener('load', settled, { once: true });
    image.addEventListener('error', settled, { once: true });
  });
}

function decorate(block) {
  buildInsightHero(block, [...block.children]);
}

describe('report-hero optional screenshots', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('removes a screenshot and its picture when loading fails after decoration', async () => {
    const block = createHero();
    const image = addImage(block);
    image.loading = 'eager';
    const settled = imageSettled(image);
    image.src = brokenImage;
    decorate(block);
    await settled;

    expect(block.querySelectorAll('.rh-insight-image img').length).to.equal(0);
    expect(block.querySelectorAll('.rh-insight-image picture').length).to.equal(0);
    expect(block.querySelector('h1').textContent).to.equal('Example company');
    expect(block.querySelector('.rh-insight-badge-url').textContent).to.equal('example.com');
    expect(block.querySelector('.rh-insight-badge-icon')).not.to.equal(null);
  });

  it('removes a screenshot that already failed before decoration', async () => {
    const block = createHero();
    const image = addImage(block);
    image.loading = 'eager';
    const settled = imageSettled(image);
    image.src = brokenImage;
    await settled;
    expect(image.complete).to.equal(true);
    expect(image.naturalWidth).to.equal(0);
    decorate(block);

    expect(block.querySelectorAll('.rh-insight-image img').length).to.equal(0);
    expect(block.querySelectorAll('.rh-insight-image picture').length).to.equal(0);
  });

  it('removes a failed bare image without requiring a picture wrapper', async () => {
    const block = createHero();
    const image = addImage(block, false);
    image.loading = 'eager';
    const settled = imageSettled(image);
    image.src = brokenImage;
    decorate(block);
    await settled;

    expect(block.querySelectorAll('.rh-insight-image img').length).to.equal(0);
  });

  it('removes an authored image with no source', () => {
    const block = createHero();
    addImage(block);
    decorate(block);

    expect(block.querySelectorAll('.rh-insight-image img').length).to.equal(0);
    expect(block.querySelectorAll('.rh-insight-image picture').length).to.equal(0);
  });

  it('keeps a successfully loaded screenshot and its lazy-loading setting', async () => {
    const block = createHero();
    const image = addImage(block);
    image.loading = 'eager';
    const settled = imageSettled(image);
    image.src = validImage;
    await settled;
    image.loading = 'lazy';
    decorate(block);

    expect(block.querySelector('.rh-insight-image img')).to.equal(image);
    expect(image.naturalWidth).to.equal(160);
    expect(image.loading).to.equal('lazy');
    expect(block.querySelector('.rh-insight-image picture')).not.to.equal(null);
  });

  it('keeps a pending lazy screenshot until it actually fails', async () => {
    const block = createHero();
    const image = addImage(block);
    const settled = imageSettled(image);
    image.src = validImage;
    decorate(block);
    expect(block.querySelector('.rh-insight-image img')).to.equal(image);
    expect(image.loading).to.equal('lazy');
    image.loading = 'eager';
    await settled;

    expect(block.querySelector('.rh-insight-image img')).to.equal(image);
    expect(image.naturalWidth).to.equal(160);
  });

  it('leaves an empty screenshot cell empty without adding a placeholder', () => {
    const block = createHero();
    decorate(block);

    expect(block.querySelector('.rh-insight-image').childElementCount).to.equal(0);
    expect(block.querySelector('.rh-insight-badge-icon')).not.to.equal(null);
  });
});
