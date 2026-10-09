import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { loadFragment } from '../../blocks/fragment/fragment.js';
import initHeader from '../../blocks/header/header.js';
import { getConfig } from '../../scripts/ak.js';

describe('fragment loading', () => {
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(window, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('loads and decorates the requested navigation fragment', async () => {
    fetchStub.resolves(new Response('<main><div><p>Navigation</p></div></main>'));
    const fragment = await loadFragment('/fragments/nav/header');
    expect(fragment.querySelector('.section').textContent).to.equal('Navigation');
    expect(document.querySelector('.hidden-container')).to.equal(null);
  });

  it('rejects redirected login content before it can duplicate the login page', async () => {
    fetchStub.callsFake(async (path, options) => {
      if (options?.redirect === 'error') throw new TypeError('Failed to fetch');
      return new Response('<main><div><h1>Insights Portal Login</h1><input type="email"></div></main>');
    });
    const login = document.createElement('main');
    login.innerHTML = '<h1>Insights Portal Login</h1><input type="email">';
    document.body.append(login);
    let error;
    try {
      const fragment = await loadFragment('/fragments/nav/header');
      login.prepend(fragment);
    } catch (ex) {
      error = ex;
    } finally {
      login.remove();
    }
    expect(login.querySelectorAll('h1')).to.have.lengthOf(1);
    expect(login.querySelectorAll('input[type="email"]')).to.have.lengthOf(1);
    expect(error).to.be.instanceOf(TypeError);
    expect(fetchStub.firstCall.args[1]).to.deep.equal({ redirect: 'error' });
    expect(document.querySelector('.hidden-container')).to.equal(null);
  });

  it('reports rejected header loading without inserting the redirected page', async () => {
    const error = new TypeError('Failed to fetch');
    fetchStub.rejects(error);
    const log = sinon.stub(getConfig(), 'log');
    const header = document.createElement('header');
    try {
      await initHeader(header);
      expect(header.children).to.have.lengthOf(0);
      expect(log.calledOnceWithExactly(error)).to.equal(true);
    } finally {
      log.restore();
    }
  });
});
