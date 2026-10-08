// Local-only fixtures. APIs remain unavailable unless --preview is explicitly enabled.
/* eslint-disable import/no-relative-packages */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { BOOTH_DEMOS, findBoothDemo } from '../../workers/cloudflare/cug-adobe-oauth-worker/src/booth-demos.js';
import { BOOTH_INACTIVITY_MS } from '../../scripts/booth-session.js';

const root = resolve(import.meta.dirname, '../..');
const preview = process.argv.includes('--preview');
const fixtures = new Map();
const reportPath = '/accounts/e/example/insights/example-com/portal-landing/';
const otherReportPath = '/accounts/e/example/insights/example-org/portal-landing/';
const candidates = [
  { path: reportPath, label: 'Example.com' },
  { path: otherReportPath, label: 'Example.org' },
];
const types = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
};

function fixtureContext(request, response) {
  for (const [key, value] of fixtures) {
    if (value.expiresAt <= Date.now()) fixtures.delete(key);
  }
  const cookie = request.headers.cookie?.match(/(?:^|;\s*)booth_preview=([\w-]+)/)?.[1];
  if (fixtures.has(cookie)) return fixtures.get(cookie);
  const key = randomUUID();
  const context = { state: 'entry', expiresAt: Date.now() + BOOTH_INACTIVITY_MS };
  fixtures.set(key, context);
  response.setHeader('Set-Cookie', `booth_preview=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`);
  return context;
}

function fixtureReport(context, path = reportPath) {
  const outcome = context.reports?.[path] || { delivery: 'ready', sent: false };
  Object.assign(context, {
    state: 'report',
    selectedPath: path,
    ...outcome,
    canChooseAnother: context.candidates?.length > 1,
    contactRequested: false,
  });
}

function markedDocument(html, context) {
  return html.replace('<html lang="en">', '<html lang="en" class="booth-report-pending">')
    .replace('<head>', '<head><style>:is(.booth-report-pending,.booth-report-clearing) body > :not(#booth-recovery,#booth-return){display:none!important} #booth-recovery[hidden]{display:none!important}</style>')
    .replace(
      /(?:data-booth-mode="request"\s+)?src="\/scripts\/booth-report\.js"/,
      `data-booth-mode="${context.state}" data-booth-expires-at="${context.expiresAt}" src="/scripts/booth-report.js"`,
    )
    .replace(/(<body[^>]*>)/, '$1<div id="booth-report-content" hidden>')
    .replace('</body>', '</div><aside id="booth-recovery"><p role="alert">Checking this booth report...</p><button type="button" data-booth-recover>Retry and clear screen</button></aside></body>');
}

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost:3000');
  let path = url.pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (preview && (path === '/booth' || path === '/content/index')) {
    const context = fixtureContext(request, response);
    if (url.searchParams.get('preview') === 'finish') fixtureReport(context);
    if (url.searchParams.get('preview') === 'entry') {
      Object.keys(context).forEach((key) => { delete context[key]; });
      Object.assign(context, { state: 'entry', expiresAt: Date.now() + BOOTH_INACTIVITY_MS });
    }
  }
  if (preview && path === '/') path = '/test/fixtures/booth-touchscreen.html';
  if (path === '/booth' || path === '/content/index') path = '/booth.html';
  if (preview && path.startsWith('/auth/booth/')) {
    const context = fixtureContext(request, response);
    const action = path.split('/').pop();
    const known = ['status', 'demos', 'demo-picker', 'demo', 'lookup', 'picker', 'select', 'view', 'send', 'reset', 'exit', 'activity'];
    if (!known.includes(action) || request.method !== (['status', 'demos'].includes(action) ? 'GET' : 'POST')) {
      response.writeHead(405, { 'Content-Type': 'application/json' });
      response.end('{"error":"Unsupported local fixture action."}');
      return;
    }
    let body = {};
    if (request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end('{"error":"Invalid fixture JSON."}');
        return;
      }
    }
    if (action === 'demos') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ demos: BOOTH_DEMOS }));
      return;
    }
    if (action === 'lookup') {
      if (typeof body.email !== 'string' || !body.email.trim()) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end('{"error":"Enter an email for the local fixture."}');
        return;
      }
      const email = body.email.trim().toLowerCase();
      if (!['visitor@example.test', 'multi@example.test'].includes(email)) {
        Object.keys(context).forEach((key) => { delete context[key]; });
        const missing = email !== 'service-error@example.test';
        Object.assign(context, { state: missing ? 'unavailable' : 'entry', unmatched: missing, expiresAt: Date.now() + BOOTH_INACTIVITY_MS });
        response.writeHead(missing ? 404 : 502, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(missing ? { code: 'no_report', error: 'No prepared report is available.', expiresAt: context.expiresAt }
          : { error: 'Prepared reports cannot be checked right now. Ask the booth team.' }));
        return;
      }
      Object.keys(context).forEach((key) => { delete context[key]; });
      Object.assign(context, {
        state: 'picker',
        candidates: email === 'multi@example.test' ? candidates : candidates.slice(0, 1),
        reports: {},
        expiresAt: Date.now() + BOOTH_INACTIVITY_MS,
      });
      if (context.candidates.length === 1) fixtureReport(context);
    }
    if (action === 'picker' || action === 'select') {
      if (!context.candidates?.length
        || (action === 'select' && !context.candidates.some((candidate) => candidate.path === body.path))) {
        response.writeHead(403, { 'Content-Type': 'application/json' });
        response.end('{"error":"Choose an authorized local fixture report."}');
        return;
      }
      if (action === 'select') fixtureReport(context, body.path);
      else {
        context.state = 'picker';
        delete context.selectedPath;
      }
    }
    if (action === 'demo-picker') {
      const unmatched = context.unmatched === true;
      Object.keys(context).forEach((key) => { delete context[key]; });
      Object.assign(context, { state: 'unavailable', unmatched, expiresAt: Date.now() + BOOTH_INACTIVITY_MS });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ...context, state: 'demos' }));
      return;
    }
    if (action === 'demo') {
      const demo = findBoothDemo(body.id);
      if (action === 'demo' && !demo) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end('{"error":"Choose an available industry demo."}');
        return;
      }
      const unmatched = context.unmatched === true;
      Object.keys(context).forEach((key) => { delete context[key]; });
      Object.assign(context, {
        state: action,
        selectedPath: demo.path,
        unmatched,
        expiresAt: Date.now() + BOOTH_INACTIVITY_MS,
        ...(demo ? { demoId: demo.id, company: demo.company, industry: demo.industry } : {}),
      });
    }
    if (['reset', 'exit'].includes(action)) {
      Object.keys(context).forEach((key) => { delete context[key]; });
      Object.assign(context, { state: 'entry', expiresAt: Date.now() + BOOTH_INACTIVITY_MS });
    }
    if (action === 'activity') {
      if (context.state === 'entry' || !Number.isInteger(body.idleMs)
        || body.idleMs < 0 || body.idleMs >= BOOTH_INACTIVITY_MS) {
        response.writeHead(410, { 'Content-Type': 'application/json' });
        response.end('{"error":"Local fixture visit expired."}');
        return;
      }
      const expiresAt = Date.now() + BOOTH_INACTIVITY_MS - body.idleMs;
      context.expiresAt = Math.max(context.expiresAt, expiresAt);
      const key = request.headers.cookie.match(/booth_preview=([\w-]+)/)[1];
      response.setHeader('Set-Cookie', `booth_preview=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ expiresAt: context.expiresAt }));
      return;
    }
    if ((action === 'send' && context.state !== 'report')
      || (action === 'view' && !['demo', 'report'].includes(context.state))) {
      response.writeHead(409, { 'Content-Type': 'application/json' });
      response.end('{"error":"Open the example report first. This is a local fixture."}');
      return;
    }
    if (action === 'send') {
      context.sent = true;
      context.delivery = 'sent';
      context.reports ||= {};
      context.reports[context.selectedPath] = { sent: true, delivery: 'sent' };
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(context.state === 'entry'
      ? { state: 'entry', canChooseAnother: false } : context));
    return;
  }
  if (path.startsWith('/auth/')) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end('{"error":"Test server has no live booth APIs. Tests must explicitly intercept requests."}');
    return;
  }
  if (preview && path.startsWith('/example-report/')) {
    const demo = BOOTH_DEMOS.find((item) => item.path === path);
    if (!demo) {
      response.writeHead(404);
      response.end('Unknown local demo fixture.');
      return;
    }
    const html = await readFile(resolve(root, 'test/fixtures/booth-preview-report.html'), 'utf8');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const context = fixtureContext(request, response);
    response.end(markedDocument(html.replace('Example prepared report — test fixture', `${demo.company} — local demo fixture`), context));
    return;
  }
  if (preview && path === '/request-report') {
    response.writeHead(302, { Location: '/booth' });
    response.end();
    return;
  }
  if (path.startsWith('/accounts/')) {
    if (preview) {
      const context = fixtureContext(request, response);
      if (context.state !== 'report' || context.selectedPath !== path) {
        response.writeHead(302, { Location: '/booth' });
        response.end();
        return;
      }
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const html = await readFile(resolve(root, 'test/fixtures/booth-preview-report.html'), 'utf8');
    const context = preview ? fixtureContext(request, response) : null;
    response.end(context ? markedDocument(html, context) : html);
    return;
  }
  const file = resolve(root, `.${decodeURIComponent(path)}`);
  if (!file.startsWith(`${root}/`)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
  process.stdout.write(preview
    ? 'LOCAL FIXTURES ONLY: http://localhost:3000/ — no real email, auth, or lead recording.\n'
    : 'Test-only booth fixture server: http://localhost:3000/content/index\n');
});
