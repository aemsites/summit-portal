import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { renderBoothPreview, createBoothPreview } from '../../scripts/booth-preview.js';
import { buildDarkStats } from '../../blocks/report-stats/report-stats.js';

const path = '/accounts/e/example/insights/example-com/portal-landing/';
const report = `<main><div class="report-hero insight"><div><div>
  <h1>Actual selected brand</h1><p>Digital Opportunity Report</p>
  <p><a href="https://example.com/">example.com</a></p><p>Measured: October 2026</p>
  </div><div><picture><img src="../art.webp" alt="Actual report illustration"></picture></div>
  </div></div><div class="report-stats dark">
  <div><div>AI Visibility</div><div>61/100</div><div>Up 8 points</div><div>positive</div><div>Actual selected narrative.</div><div>speedometer</div></div>
  <div><div>AI Visibility Trend</div><div>+8</div><div>vs. previous month</div><div>positive</div><div>Increased from 53 to 61.</div><div></div></div>
  </div><div class="report-ai-visibility">
  <div><div>stats</div><div>AI visibility score</div><div><p>61</p><p>Up from 53</p></div><div>out of 100</div></div>
  <div><div>competitors</div><div><h3>Competitive landscape</h3><p>Actual competitor narrative.</p></div><div><p>horizontalbars</p><p>Actual selected brand | 61</p><p>Competitor | 49</p></div><div></div></div>
  <div><div>competitors</div><div><h3>Platform visibility</h3></div><div><p>horizontalbars</p><p>ChatGPT | 61</p></div><div></div></div>
  </div><div class="report-carousel">
  <div><div>Executive overview</div><div>Search &amp; AI visibility</div><div>Site experience</div><div><a href="/report.pdf">Download full report</a></div></div>
  <div><div>Top insight</div><div><h3>Actual briefing title</h3><p>Actual briefing narrative.</p></div><div><p>columnchart</p><p>Actual growth | 73</p><p>Actual visibility | 61</p></div><div></div></div>
  <script>window.unwantedReportScript = true;</script></div></main>`;

describe('selected report preview', () => {
  let sandbox;
  let target;
  let retry;
  const context = () => ({ state: 'report', selectedPath: path, expiresAt: Date.now() + 600000 });
  const response = (html = report) => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    target = document.createElement('div');
    retry = document.createElement('button');
    retry.hidden = true;
    sandbox.stub(console, 'warn');
  });
  afterEach(() => { sandbox.restore(); });

  it('renders actual hero, date, illustration and metrics using static shared renderers', async () => {
    target.append(...await renderBoothPreview(report, path));
    expect(target.querySelector('.rh-insight-text h3').textContent).to.equal('Actual selected brand');
    expect(target.querySelector('.rh-insight-badge-date').textContent).to.equal('Measured October 2026');
    expect(target.querySelector('.rh-insight-image img').src).to.equal(new URL('../art.webp', new URL(path, window.location.origin)).href);
    expect(target.querySelector('.rs-dark-value').textContent).to.equal('61/100');
    expect(target.querySelectorAll('.rs-dark-value')[1].textContent).to.equal('+8');
    expect(target.querySelector('.rs-dark-desc').textContent).to.equal('Actual selected narrative.');
    expect(target.querySelector('script, iframe, a, button, .rs-sheet, .rh-typing, .rh-insight-bg-svg')).to.equal(null);
    expect(target.querySelectorAll('.preview-card')).to.have.length(3);
    expect(target.querySelector('.preview-card[data-position="center"]').dataset.section).to.equal('overview');
    expect(target.querySelector('.rav-stat-value').textContent).to.equal('61');
    expect(target.querySelector('.rav-panel-title').textContent).to.equal('Competitive landscape');
    expect(target.querySelector('.rc-title').textContent).to.equal('Actual briefing title');
    expect(target.querySelector('.rc-desc').textContent).to.include('Actual briefing narrative.');
    expect([...target.querySelectorAll('.preview-surface')].every((surface) => surface.inert)).to.equal(true);
    expect(window.unwantedReportScript).to.equal(undefined);
  });

  it('copies only approved content and treats source metadata and score labels as text', async () => {
    const dirty = new DOMParser().parseFromString(report, 'text/html');
    const hero = dirty.querySelector('.report-hero');
    hero.dataset.lede = '<strong>Custom introduction</strong><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)">';
    hero.querySelector('h1').setAttribute('onclick', 'alert(1)');
    hero.querySelector('h1').style.color = 'red';
    hero.querySelector('h1').id = 'stage';
    hero.querySelector('p:last-child').textContent = 'Measured: <img src=x onerror=alert(1)>';
    dirty.querySelector('.report-stats > div > div').textContent = 'Score "><img src=x onerror=alert(1)>';
    target.append(...await renderBoothPreview(dirty.documentElement.outerHTML, path));
    expect(target.querySelector('[onclick], [onerror], #stage, script, .rh-insight-text [style]')).to.equal(null);
    expect(target.querySelector('.rh-insight-lede').textContent).to.equal('Custom introduction');
    expect(target.querySelector('.rh-insight-badge-date').textContent).to.include('<img src=x onerror=alert(1)>');
    expect(target.querySelector('.rs-speedometer').getAttribute('aria-label')).to.include('Score "><img');
    expect(target.querySelector('.rs-dark-strip img')).to.equal(null);
  });

  it('does not invent metrics when the selected report has no supported metric strip', async () => {
    const source = new DOMParser().parseFromString(report, 'text/html');
    source.querySelector('.report-stats').remove();
    target.append(...await renderBoothPreview(source.documentElement.outerHTML, path));
    expect(target.querySelector('.rh-insight-text h3').textContent).to.equal('Actual selected brand');
    expect(target.querySelector('.rs-dark-value')).to.equal(null);
    expect(target.textContent).to.include('Report metrics are unavailable');
  });

  it('leaves normal report metric interactions and animation enabled by default', () => {
    const clock = sandbox.useFakeTimers();
    const source = new DOMParser().parseFromString(report, 'text/html');
    const stats = source.querySelector('.report-stats');
    buildDarkStats(stats, [...stats.children]);
    expect(stats.querySelector('[role="button"]').tabIndex).to.equal(0);
    expect(stats.querySelector('.rs-sheet')).not.to.equal(null);
    expect(stats.querySelector('.rs-dark-value-main').textContent).to.equal('0');
    clock.reset();
  });

  it('requests the exact selected HTML once, with no lookup or regeneration API', async () => {
    const fetchStub = sandbox.stub(window, 'fetch').callsFake(async () => response());
    const preview = createBoothPreview(target, retry);
    await preview.load(context());
    expect(fetchStub.calledOnce).to.equal(true);
    expect(fetchStub.firstCall.args[0]).to.equal(path);
    expect(fetchStub.firstCall.args[1]).to.include({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    expect(fetchStub.firstCall.args[1].signal).to.be.instanceOf(AbortSignal);
    expect(target.getAttribute('aria-busy')).to.equal('false');
    expect(target.querySelector('.rh-insight-text h3').textContent).to.equal('Actual selected brand');
  });

  it('rejects non-selected, expired, normalized or cross-origin paths without a request', async () => {
    const fetchStub = sandbox.stub(window, 'fetch');
    const preview = createBoothPreview(target, retry);
    for (const result of [
      { ...context(), selectedPath: 'https://example.com/accounts/other/' },
      { ...context(), selectedPath: '/accounts/../auth/booth/reset' },
      { ...context(), selectedPath: `${path}?email=visitor@example.com` },
      { ...context(), expiresAt: Date.now() - 1 },
      { ...context(), state: 'entry' },
    ]) {
      await preview.load(result);
      expect(target.textContent).to.include('Report preview unavailable');
    }
    expect(fetchStub.called).to.equal(false);
  });

  it('shows failure and permits a preview-only retry without storing report content', async () => {
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves(new Response('Unauthorized', { status: 401 }));
    fetchStub.onSecondCall().callsFake(async () => response());
    const preview = createBoothPreview(target, retry);
    await preview.load(context());
    expect(target.textContent).to.include('You can still email your report');
    expect(retry.hidden).to.equal(false);
    await preview.load(context());
    expect(target.querySelector('.rh-insight-text h3').textContent).to.equal('Actual selected brand');
    expect(retry.hidden).to.equal(true);
    preview.clear();
    expect(target.textContent).to.equal('');
    expect(target.querySelector('img')).to.equal(null);
  });

  it('rejects redirected, failed, non-HTML and unsupported responses explicitly', async () => {
    const fetchStub = sandbox.stub(window, 'fetch');
    const preview = createBoothPreview(target, retry);
    fetchStub.onCall(0).rejects(new TypeError('Redirect rejected'));
    fetchStub.onCall(1).resolves(new Response('Unavailable', { status: 503 }));
    fetchStub.onCall(2).resolves(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    fetchStub.onCall(3).resolves(response('<main>Login page, not a report</main>'));
    for (let i = 0; i < 4; i += 1) {
      await preview.load(context());
      expect(target.textContent).to.include('Report preview unavailable');
      expect(retry.hidden).to.equal(false);
      expect(target.getAttribute('aria-busy')).to.equal('false');
    }
  });

  it('aborts and ignores a late response after clearing for the next visitor', async () => {
    let finish;
    const fetchStub = sandbox.stub(window, 'fetch').returns(new Promise((resolve) => { finish = resolve; }));
    const preview = createBoothPreview(target, retry);
    const pending = preview.load(context());
    preview.clear();
    expect(fetchStub.firstCall.args[1].signal.aborted).to.equal(true);
    finish(response());
    await pending;
    expect(target.textContent).to.equal('');
    expect(target.getAttribute('aria-busy')).to.equal('false');
  });

  it('does not overwrite a newer visitor with an older response', async () => {
    let finish;
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().returns(new Promise((resolve) => { finish = resolve; }));
    fetchStub.onSecondCall().callsFake(async () => response(report.replace('Actual selected brand', 'New selected brand')));
    const preview = createBoothPreview(target, retry);
    const old = preview.load(context());
    await preview.load(context());
    finish(response());
    await old;
    expect(target.querySelector('.rh-insight-text h3').textContent).to.equal('New selected brand');
  });

  it('does not render a report that expired while its request was pending', async () => {
    let finish;
    sandbox.stub(window, 'fetch').returns(new Promise((resolve) => { finish = resolve; }));
    const result = context();
    const preview = createBoothPreview(target, retry);
    const pending = preview.load(result);
    result.expiresAt = Date.now() - 1;
    finish(response());
    await pending;
    expect(target.textContent).to.include('Report preview expired');
    expect(target.querySelector('h3, img')).to.equal(null);
    expect(target.getAttribute('aria-busy')).to.equal('false');
  });

  it('keeps all three cards and reports missing sections instead of substituting another report', async () => {
    const source = new DOMParser().parseFromString(report, 'text/html');
    source.querySelectorAll('.report-ai-visibility, .report-carousel').forEach((block) => block.remove());
    target.append(...await renderBoothPreview(source.documentElement.outerHTML, path));
    expect(target.querySelectorAll('.preview-card')).to.have.length(3);
    expect(target.textContent).to.include('LLM visibility is unavailable');
    expect(target.textContent).to.include('Your briefing is unavailable');
    expect(target.querySelector('.rh-insight-text h3').textContent).to.equal('Actual selected brand');
  });

  it('treats authored briefing chart labels and colors as data, never executable chart markup', async () => {
    const source = new DOMParser().parseFromString(report, 'text/html');
    const chart = source.querySelector('.report-carousel > div:nth-child(2) > div:nth-child(3)');
    chart.children[1].textContent = '<image onload="window.unwantedReportScript=true"> & Actual brand | 73 | #fff" onload="alert(1)';
    target.append(...await renderBoothPreview(source.documentElement.outerHTML, path));
    expect(target.querySelector('script, image, [onload], [onclick]')).to.equal(null);
    expect(target.querySelector('.report-carousel svg').textContent).to.include('<image onload=');
    expect(target.querySelector('.report-carousel svg').textContent).to.include('& Actual brand');
    expect(window.unwantedReportScript).to.equal(undefined);
  });

  it('rotates the foreground with keyboard and side clicks without another fetch', async () => {
    const fetchStub = sandbox.stub(window, 'fetch');
    target.append(...await renderBoothPreview(report, path));
    const montage = target.querySelector('.preview-montage');
    const selected = () => target.querySelector('[data-position="center"]').dataset.section;
    const key = (value) => montage.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    key('ArrowRight');
    expect(selected()).to.equal('briefing');
    key('ArrowRight');
    expect(selected()).to.equal('visibility');
    key('ArrowLeft');
    expect(selected()).to.equal('briefing');
    key('Home');
    expect(selected()).to.equal('visibility');
    key('End');
    expect(selected()).to.equal('briefing');
    target.querySelector('[data-section="overview"]').click();
    expect(selected()).to.equal('overview');
    expect(target.querySelectorAll('[data-position]')).to.have.length(3);
    expect(fetchStub.called).to.equal(false);
  });

  it('accepts horizontal touch swipes but ignores vertical, canceled and secondary gestures', async () => {
    target.append(...await renderBoothPreview(report, path));
    const montage = target.querySelector('.preview-montage');
    sandbox.stub(montage, 'setPointerCapture');
    const pointer = (type, x, y, extra = {}) => montage.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, ...extra,
    }));
    const selected = () => target.querySelector('[data-position="center"]').dataset.section;
    pointer('pointerdown', 200, 100);
    pointer('pointerup', 100, 105);
    expect(selected()).to.equal('briefing');
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 105, 200);
    expect(selected()).to.equal('briefing');
    pointer('pointerdown', 100, 100);
    pointer('pointercancel', 100, 100);
    pointer('pointerup', 200, 100);
    expect(selected()).to.equal('briefing');
    pointer('pointerdown', 100, 100, { isPrimary: false });
    pointer('pointerup', 200, 100);
    expect(selected()).to.equal('briefing');
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 200, 100);
    expect(selected()).to.equal('overview');
  });
});
