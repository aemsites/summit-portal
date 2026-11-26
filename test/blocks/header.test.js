import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { decorateUserInfo } from '../../blocks/header/header.js';

describe('header account actions', () => {
  let marker;
  afterEach(() => {
    sinon.restore();
    marker?.remove();
  });

  const section = () => {
    const element = document.createElement('div');
    element.innerHTML = '<div class="default-content"></div>';
    return element;
  };

  it('offers sign-in on ordinary pages', async () => {
    sinon.stub(window, 'fetch').resolves(new Response('{}', { status: 401 }));
    const element = section();
    await decorateUserInfo(element);
    expect(element.querySelector('.user-sign-in')).to.not.equal(null);
  });

  it('shows no sign-in or portal links on booth reports', async () => {
    marker = document.createElement('script');
    marker.type = 'text/plain';
    marker.dataset.boothMode = 'report';
    document.head.append(marker);
    const fetchStub = sinon.stub(window, 'fetch');
    const element = section();
    await decorateUserInfo(element);
    expect(element.querySelector('.user-info')).to.equal(null);
    expect(fetchStub.called).to.equal(false);
  });
});
