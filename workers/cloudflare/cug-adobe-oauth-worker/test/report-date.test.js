import { describe, it, expect, vi, afterEach } from 'vitest';
import injectReportLastUpdated from '../src/report-date.js';

describe('report last-updated metadata', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubRewriter() {
    const appended = [];
    vi.stubGlobal('HTMLRewriter', class {
      on(selector, handler) {
        handler.element({ append: (value) => appended.push([selector, value]) });
        return this;
      }

      transform(response) { return response; }
    });
    return appended;
  }

  const page = (headers = {}) => new Response('<html></html>', {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Last-Modified': 'Mon, 23 Nov 2026 15:43:43 GMT',
      ...headers,
    },
  });

  it.each([
    '/accounts/e/example/insights/example-com/portal-landing/',
    '/accounts/e/example/insights/example-com',
    '/example-report/carvelo/',
  ])('adds the document date to report page %s', (path) => {
    const appended = stubRewriter();
    injectReportLastUpdated(page(), new Request(`https://portal.example${path}`));
    const meta = '<meta name="report-last-updated" content="2026-11-23T15:43:43.000Z">';
    expect(appended).toEqual([['head', meta]]);
  });

  it('never guesses a date or touches non-report responses', () => {
    const appended = stubRewriter();
    const report = 'https://portal.example/accounts/e/example/insights/example-com/';
    const cases = [
      [page({ 'Last-Modified': '' }), new Request(report)],
      [page({ 'Last-Modified': 'not a date' }), new Request(report)],
      [page(), new Request(report, { method: 'HEAD' })],
      [page({ 'Content-Type': 'application/json' }), new Request(report)],
      [new Response('', { status: 404, headers: { 'Content-Type': 'text/html' } }), new Request(report)],
      [page(), new Request('https://portal.example/adobe/dashboard')],
      [page(), new Request(`${report}report.pdf`)],
    ];
    cases.forEach(([response, request]) => {
      expect(injectReportLastUpdated(response, request)).toBe(response);
    });
    expect(appended).toEqual([]);
  });
});
