// Local-only fixtures. APIs remain unavailable unless --preview is explicitly enabled.
/* eslint-disable import/no-relative-packages */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { BOOTH_DEMOS, findBoothDemo } from '../../workers/cloudflare/cug-adobe-oauth-worker/src/booth-demos.js';

const root = resolve(import.meta.dirname, '../..');
const preview = process.argv.includes('--preview');
const fixtures = new Map();
const reportPath = '/accounts/e/example/insights/example-com/portal-landing/';
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
  const context = { state: 'entry', expiresAt: Date.now() + 600000 };
  fixtures.set(key, context);
  response.setHeader('Set-Cookie', `booth_preview=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`);
  return context;
}

function fixtureReport(context) {
  Object.assign(context, {
    state: 'report',
    selectedPath: reportPath,
    delivery: 'ready',
    sent: false,
    contactRequested: false,
    expiresAt: Date.now() + 600000,
  });
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
      Object.assign(context, { state: 'entry', expiresAt: Date.now() + 600000 });
    }
  }
  if (preview && path === '/') path = '/test/fixtures/booth-touchscreen.html';
  if (path === '/booth' || path === '/content/index') path = '/booth.html';
  if (preview && path.startsWith('/auth/booth/')) {
    const context = fixtureContext(request, response);
    const action = path.split('/').pop();
    const known = ['status', 'demos', 'demo', 'request', 'lookup', 'select', 'view', 'send', 'reset'];
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
      if (email !== 'visitor@example.test') {
        Object.keys(context).forEach((key) => { delete context[key]; });
        Object.assign(context, { state: 'entry', expiresAt: Date.now() + 600000 });
        const missing = email !== 'service-error@example.test';
        response.writeHead(missing ? 404 : 502, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(missing ? { code: 'no_report', error: 'No prepared report is available.' }
          : { error: 'Prepared reports cannot be checked right now. Ask the booth team.' }));
        return;
      }
    }
    if (action === 'lookup' || action === 'select') fixtureReport(context);
    if (action === 'demo' || action === 'request') {
      const demo = findBoothDemo(body.id);
      if (action === 'demo' && !demo) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end('{"error":"Choose an available industry demo."}');
        return;
      }
      Object.keys(context).forEach((key) => { delete context[key]; });
      Object.assign(context, {
        state: action,
        selectedPath: demo?.path || '/request-report',
        expiresAt: Date.now() + 600000,
        ...(demo ? { demoId: demo.id, company: demo.company, industry: demo.industry } : {}),
      });
    }
    if (action === 'reset') {
      Object.keys(context).forEach((key) => { delete context[key]; });
      Object.assign(context, { state: 'entry', expiresAt: Date.now() + 600000 });
    }
    if (['send', 'view'].includes(action) && context.state !== 'report') {
      response.writeHead(409, { 'Content-Type': 'application/json' });
      response.end('{"error":"Open the example report first. This is a local fixture."}');
      return;
    }
    if (action === 'send') context.sent = true;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(context));
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
    response.end(html.replace('Example prepared report — test fixture', `${demo.company} — local demo fixture`)
      .replace('src="/scripts/booth-report.js"', 'data-booth-mode="demo" src="/scripts/booth-report.js"'));
    return;
  }
  if (preview && path === '/request-report') path = '/test/fixtures/booth-preview-request.html';
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
    response.end(await readFile(resolve(root, 'test/fixtures/booth-preview-report.html')));
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
}).listen(3000, '127.0.0.1', () => {
  process.stdout.write(preview
    ? 'LOCAL FIXTURES ONLY: http://localhost:3000/ — no real email, auth, or lead recording.\n'
    : 'Test-only booth fixture server: http://localhost:3000/content/index\n');
});
