import { expect } from '@esm-bundle/chai';
import { domToMarkdown } from '../../blocks/copy-markdown/copy-markdown.js';

function fixture(html) {
  const root = document.createElement('main');
  root.innerHTML = html;
  return root;
}

describe('copy-markdown › domToMarkdown', () => {
  it('serializes headings by level', () => {
    const md = domToMarkdown(fixture('<h1>Title</h1><h3>Sub</h3>'));
    expect(md).to.contain('# Title');
    expect(md).to.contain('### Sub');
  });

  it('serializes paragraphs as text blocks', () => {
    const md = domToMarkdown(fixture('<p>Hello world.</p>'));
    expect(md).to.contain('Hello world.');
  });

  it('serializes unordered lists as bullets', () => {
    const md = domToMarkdown(fixture('<ul><li>One</li><li>Two</li></ul>'));
    expect(md).to.contain('- One');
    expect(md).to.contain('- Two');
  });

  it('serializes ordered lists as numbers', () => {
    const md = domToMarkdown(fixture('<ol><li>First</li><li>Second</li></ol>'));
    expect(md).to.contain('1. First');
    expect(md).to.contain('2. Second');
  });

  it('serializes a table as a GitHub pipe table', () => {
    const md = domToMarkdown(fixture(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead>'
      + '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    ));
    expect(md).to.contain('| A | B |');
    expect(md).to.contain('| --- | --- |');
    expect(md).to.contain('| 1 | 2 |');
  });

  it('escapes pipe characters inside table cells', () => {
    const md = domToMarkdown(fixture(
      '<table><tr><th>H</th></tr><tr><td>a|b</td></tr></table>',
    ));
    expect(md).to.contain('a\\|b');
  });

  it('serializes a report-callout as a blockquote', () => {
    const md = domToMarkdown(fixture(
      '<div class="report-callout"><div class="rcl-bar"><p class="rcl-text">Heads up.</p></div></div>',
    ));
    expect(md).to.contain('> Heads up.');
  });

  it('serializes advanced-tabs panels regardless of visibility', () => {
    const md = domToMarkdown(fixture(
      '<div class="advanced-tabs">'
      + '<div class="tab-list"><button>Tab A</button><button>Tab B</button></div>'
      + '<div class="tab-panel is-visible"><h4>Panel A</h4><p>Visible.</p></div>'
      + '<div class="tab-panel"><h4>Panel B</h4><p>Hidden but copied.</p></div>'
      + '</div>',
    ));
    expect(md).to.contain('Hidden but copied.');
    expect(md).to.contain('Panel A');
  });

  it('skips copy-markdown buttons, header and footer', () => {
    const md = domToMarkdown(fixture(
      '<header><p>nav</p></header>'
      + '<div class="copy-markdown"><button>Copy for AI</button></div>'
      + '<p>Keep me.</p>'
      + '<footer><p>legal</p></footer>',
    ));
    expect(md).to.contain('Keep me.');
    expect(md).to.not.contain('nav');
    expect(md).to.not.contain('legal');
    expect(md).to.not.contain('Copy for AI');
  });

  it('skips the docs table-of-contents nav', () => {
    const md = domToMarkdown(fixture(
      '<div class="docs-layout">'
      + '<aside class="docs-aside"><nav class="docs-toc"><p>On this page</p>'
      + '<ul><li><a href="#a">Section A</a></li></ul></nav></aside>'
      + '<div class="docs-content"><h2>Section A</h2><p>Body.</p></div>'
      + '</div>',
    ));
    expect(md).to.contain('## Section A');
    expect(md).to.contain('Body.');
    expect(md).to.not.contain('On this page');
  });

  it('returns empty string for a null root', () => {
    expect(domToMarkdown(null)).to.equal('');
  });
});
