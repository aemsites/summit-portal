/* global HTMLRewriter */
const REPORT_DOCUMENT = /^\/(?:accounts\/[a-z0-9-]+\/[a-z0-9-]+\/insights\/[a-z0-9-]+(?:\/[a-z0-9-]+)*|example-report\/[a-z0-9-]+)\/?$/;

/**
 * Exposes the report document's own Last-Modified date to the header. Pages
 * without a trustworthy date get nothing rather than a guessed "today".
 */
export default function injectReportLastUpdated(response, request) {
  if (request.method !== 'GET' || !response.ok
    || !REPORT_DOCUMENT.test(new URL(request.url).pathname)
    || !response.headers.get('Content-Type')?.includes('text/html')) return response;
  const modified = Date.parse(response.headers.get('Last-Modified') || '');
  if (!Number.isFinite(modified)) return response;
  const updated = new Date(modified).toISOString();
  return new HTMLRewriter().on('head', {
    element(element) {
      element.append(`<meta name="report-last-updated" content="${updated}">`, { html: true });
    },
  }).transform(response);
}
