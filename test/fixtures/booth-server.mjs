// Test-only static server. APIs are deliberately absent: browser tests intercept them explicitly.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost:3000');
  let path = url.pathname;
  if (path === '/booth' || path === '/content/index') path = '/booth.html';
  if (path.startsWith('/auth/')) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end('{"error":"Test server has no live booth APIs. Tests must explicitly intercept requests."}');
    return;
  }
  if (path.startsWith('/accounts/')) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html lang="en"><head><title>Test fixture prepared report</title><script type="module" src="/scripts/booth-report.js"></script></head><body><main style="min-height:12000px"><h1>Example prepared report — test fixture</h1><p>Report content stays unchanged.</p></main></body></html>');
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
  process.stdout.write('Test-only booth fixture server: http://localhost:3000/content/index\n');
});
