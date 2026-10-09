import { expect } from '@esm-bundle/chai';
import { readBoothPresentation, withBoothPresentation, applyBoothPresentation, boothStaffLogin } from '../../scripts/booth-presentation.js';

describe('cosmetic booth presentation', () => {
  const canonicalReport = '/accounts/e/example/insights/example-com/portal-landing/';

  it('defaults to neutral Adobe identity and ignores unknown event/access parameters', () => {
    expect(readBoothPresentation()).to.deep.equal({ heading: '', brand: 'adobe', entry: '3', finish: '6' });
    const presentation = readBoothPresentation('?event=amplify&email=visitor@example.com&portrait=true&selectedPath=/other/');
    expect(presentation).to.deep.equal({ heading: '', brand: 'adobe', entry: '3', finish: '6' });
    expect(withBoothPresentation('/booth', presentation)).to.equal('/booth');
    expect(withBoothPresentation(canonicalReport, presentation)).to.equal(`${canonicalReport}?booth=1`);
  });

  it('allows trimmed plain Unicode text and enforces the 80-code-point limit', () => {
    const presentation = readBoothPresentation(new URLSearchParams({ heading: '  Visibilité · 世界  ' }));
    expect(presentation.heading).to.equal('Visibilité · 世界');
    expect(readBoothPresentation(new URLSearchParams({ heading: '界'.repeat(80) })).heading).to.have.length(80);
    expect(readBoothPresentation(new URLSearchParams({ heading: '界'.repeat(81) })).heading).to.equal('');
    expect(readBoothPresentation('?heading=%20%20').heading).to.equal('');
  });

  it('rejects markup, control/format characters and ambiguous duplicates', () => {
    ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', 'Line\nbreak', 'Invisible\u202eoverride', 'Zero\u200bwidth'].forEach((heading) => {
      expect(readBoothPresentation(new URLSearchParams({ heading })).heading).to.equal('');
    });
    expect(readBoothPresentation('?heading=first&heading=second').heading).to.equal('');
  });

  it('allows only Adobe or Semrush branding without accepting arbitrary logos/assets', () => {
    expect(readBoothPresentation('?brand=semrush').brand).to.equal('semrush');
    ['adobe', 'SEMRUSH', 'unknown', 'https://example.com/logo.svg', 'semrush&brand=adobe'].forEach((brand) => {
      expect(readBoothPresentation(`?brand=${brand}`).brand).to.equal('adobe');
    });
  });

  it('always uses Entry 3 and Finish 6 and drops obsolete screen-selection parameters', () => {
    ['2', '3', '4', '6'].forEach((entry) => {
      ['2', '3', '4'].forEach((finish) => {
        const presentation = readBoothPresentation(`?entry=${entry}&finish=${finish}`);
        expect(presentation.entry).to.equal('3');
        expect(presentation.finish).to.equal('6');
        [canonicalReport, '/booth', '/booth?step=finish'].forEach((path) => {
          expect(readBoothPresentation(withBoothPresentation(path, presentation).split('?')[1]))
            .to.deep.equal(presentation);
          expect(withBoothPresentation(path, presentation)).not.to.include('entry=');
          expect(withBoothPresentation(path, presentation)).not.to.include('finish=');
        });
      });
    });
    ['?entry=5&finish=6', '?entry=2&entry=3&finish=2&finish=3', '?entry=https://example.com&finish=../other'].forEach((search) => {
      expect(readBoothPresentation(search)).to.deep.equal(readBoothPresentation());
    });
  });

  it('applies only the chosen screens with no exported Finish artwork', () => {
    const root = document.implementation.createHTMLDocument();
    root.body.innerHTML = '<main id="stage"></main>';
    applyBoothPresentation(root, readBoothPresentation('?entry=3&finish=3'));
    expect(root.getElementById('stage').dataset.entry).to.equal('3');
    expect(root.getElementById('stage').dataset.finish).to.equal('6');
  });
  it('preserves only safe cosmetics through canonical report, Finish and reset URLs', () => {
    const presentation = readBoothPresentation('?heading=Amplify%20your%20brand%20visibility&brand=semrush&email=visitor@example.com&redirect=https://example.com');
    const report = withBoothPresentation(canonicalReport, presentation);
    expect(report).to.equal(`${canonicalReport}?booth=1&heading=Amplify+your+brand+visibility&brand=semrush`);
    expect(new URL(report, 'https://portal.example').pathname).to.equal(canonicalReport);
    expect(withBoothPresentation('/booth?step=finish', presentation)).to.equal('/booth?step=finish&heading=Amplify+your+brand+visibility&brand=semrush');
    expect(withBoothPresentation('/booth?step=picker&email=visitor@example.com', presentation)).to.equal('/booth?step=picker&heading=Amplify+your+brand+visibility&brand=semrush');
    expect(withBoothPresentation('/booth', presentation)).to.equal('/booth?heading=Amplify+your+brand+visibility&brand=semrush');
    expect(withBoothPresentation(`${canonicalReport}?email=visitor@example.com&step=finish`, presentation)).to.equal(report);
  });

  it('uses textContent and a fixed scoped staff-login destination, with no stale settings', () => {
    const root = document.implementation.createHTMLDocument();
    root.body.innerHTML = '<main id="stage"><div class="brand"><span></span></div><a id="staff-login"></a></main>';
    applyBoothPresentation(root, readBoothPresentation('?heading=Amplify%20your%20brand%20visibility&brand=semrush'));
    expect(root.querySelector('.brand span').textContent).to.equal('Amplify your brand visibility');
    expect(root.getElementById('stage').dataset.brand).to.equal('semrush');
    const login = new URL(root.getElementById('staff-login').getAttribute('href'), 'https://portal.example');
    expect(login.pathname).to.equal('/login');
    expect(login.searchParams.get('redirect')).to.equal('/booth?heading=Amplify+your+brand+visibility&brand=semrush');
    applyBoothPresentation(root, readBoothPresentation('?heading=%3Cimg%20src=x%20onerror=alert(1)%3E&brand=evil'));
    expect(root.querySelector('.brand span').textContent).to.equal('Amplify your brand visibility');
    expect(root.querySelector('.brand span').children.length).to.equal(0);
    expect(root.getElementById('stage').dataset.brand).to.equal('adobe');
    expect(root.getElementById('staff-login').getAttribute('href')).to.equal('/login?staff&redirect=%2Fbooth');
  });

  it('carries explicit frame mode through real report, picker, Finish, reset and recovery URLs', () => {
    const presentation = readBoothPresentation('?touchscreen=frame&email=private&token=private');
    [canonicalReport, '/booth', '/booth?step=finish', '/booth?step=picker', '/booth?step=demos', '/booth?recover=1'].forEach((path) => {
      const url = new URL(withBoothPresentation(path, presentation), 'https://portal.example');
      expect(url.searchParams.get('touchscreen')).to.equal('frame');
      expect(url.searchParams.has('email')).to.equal(false);
      expect(url.searchParams.has('token')).to.equal(false);
    });
    expect(withBoothPresentation('/booth?recover=1', presentation)).to.equal('/booth?touchscreen=frame&recover=1');
    const login = new URL(boothStaffLogin(presentation), 'https://portal.example');
    expect(login.searchParams.get('redirect')).to.equal('/booth?touchscreen=1');
    ['?touchscreen=yes', '?touchscreen=1&touchscreen=frame'].forEach((search) => {
      expect(readBoothPresentation(search)).not.to.have.property('touchscreen');
    });
  });

  it('heading customizes the brand label and leaves the hero heading unchanged', () => {
    const root = document.implementation.createHTMLDocument();
    root.body.innerHTML = '<main id="stage"><div class="brand"><span></span></div><h1 id="welcome-heading">Original hero</h1></main>';
    applyBoothPresentation(root, readBoothPresentation('?heading=Team%20demo'));
    expect(root.querySelector('.brand span').textContent).to.equal('Team demo');
    expect(root.getElementById('welcome-heading').textContent).to.equal('Original hero');
  });

  it('marks company and industry navigation as booth-only, without marking unrelated pages', () => {
    const presentation = readBoothPresentation();
    expect(withBoothPresentation('/example-report/luma/', presentation)).to.equal('/example-report/luma/?booth=1');
    expect(withBoothPresentation('/adobe/booth-guide', presentation)).to.equal('/adobe/booth-guide');
  });
});
