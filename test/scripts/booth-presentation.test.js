import { expect } from '@esm-bundle/chai';
import { readBoothPresentation, withBoothPresentation, applyBoothPresentation } from '../../scripts/booth-presentation.js';

describe('cosmetic booth presentation', () => {
  const canonicalReport = '/accounts/e/example/insights/example-com/portal-landing/';

  it('defaults to neutral Adobe identity and ignores unknown event/access parameters', () => {
    expect(readBoothPresentation()).to.deep.equal({ heading: '', brand: 'adobe' });
    const presentation = readBoothPresentation('?event=amplify&email=visitor@example.com&portrait=true&selectedPath=/other/');
    expect(presentation).to.deep.equal({ heading: '', brand: 'adobe' });
    expect(withBoothPresentation('/booth', presentation)).to.equal('/booth');
    expect(withBoothPresentation(canonicalReport, presentation)).to.equal(canonicalReport);
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

  it('preserves only safe cosmetics through canonical report, Finish and reset URLs', () => {
    const presentation = readBoothPresentation('?heading=Amplify%20your%20brand%20visibility&brand=semrush&email=visitor@example.com&redirect=https://example.com');
    const report = withBoothPresentation(canonicalReport, presentation);
    expect(report).to.equal(`${canonicalReport}?heading=Amplify+your+brand+visibility&brand=semrush`);
    expect(new URL(report, 'https://portal.example').pathname).to.equal(canonicalReport);
    expect(withBoothPresentation('/booth?step=finish', presentation)).to.equal('/booth?step=finish&heading=Amplify+your+brand+visibility&brand=semrush');
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
    expect(root.querySelector('.brand span').textContent).to.equal('Adobe Brand Visibility');
    expect(root.querySelector('.brand span').children.length).to.equal(0);
    expect(root.getElementById('stage').dataset.brand).to.equal('adobe');
    expect(root.getElementById('staff-login').getAttribute('href')).to.equal('/login?staff&redirect=%2Fbooth');
  });
});
