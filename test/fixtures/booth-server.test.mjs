import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import process from 'node:process';
import test from 'node:test';

const script = new URL('./booth-server.mjs', import.meta.url).pathname;
const environment = { ...process.env };
delete environment.PORT;

async function availablePort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  await new Promise((resolve) => { socket.close(resolve); });
  return port;
}

async function start(t, flags) {
  const port = await availablePort();
  const child = spawn(process.execPath, [script, ...flags, '--port', String(port)], { env: environment });
  const closed = once(child, 'close');
  t.after(async () => {
    child.kill();
    await closed;
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Fixture server did not become ready')), 5000);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Fixture server exited before listening: ${code}`));
    });
    child.stdout.on('data', (data) => {
      if (data.toString().includes(`http://localhost:${port}/`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  return `http://127.0.0.1:${port}`;
}

test('fixture server validates explicit ports without listening', () => {
  for (const port of ['0', '-1', '65536', 'nope', '3001.5', '']) {
    const result = spawnSync(process.execPath, [script, '--simulator', '--port', port], { env: environment });
    assert.equal(result.status, 1);
    assert.match(result.stderr.toString(), /integer between 1 and 65535/);
  }
});

test('unopted fixture server keeps APIs unavailable and does not inject simulation', async (t) => {
  const root = await start(t, []);
  assert.equal((await fetch(`${root}/auth/booth/status`)).status, 503);
  const html = await (await fetch(`${root}/content/index`)).text();
  assert.doesNotMatch(html, /booth-touchscreen-device/);
});

test('old preview remains layout-only with explicit local fake actions', async (t) => {
  const root = await start(t, ['--preview']);
  assert.match(await (await fetch(root)).text(), /Touchscreen simulator/);
  assert.match(await (await fetch(root)).text(), /data-simulator="false"/);
  assert.doesNotMatch(await (await fetch(`${root}/content/index?preview=entry`)).text(), /booth-touchscreen-device/);
  assert.equal((await fetch(`${root}/auth/booth/status`)).status, 200);
});

test('simulator injects a blocking hook only on booth fixture documents', async (t) => {
  const root = await start(t, ['--simulator']);
  assert.match(await (await fetch(root)).text(), /data-simulator="true"/);
  assert.match(await (await fetch(`${root}/content/index?preview=entry`)).text(), /<head><script src="\/test\/fixtures\/booth-touchscreen-device.js"><\/script>/);
  assert.doesNotMatch(await (await fetch(`${root}/test/fixtures/booth-preview-report.html`)).text(), /booth-touchscreen-device/);
  const status = await fetch(`${root}/auth/booth/status`);
  const cookie = status.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const lookup = await fetch(`${root}/auth/booth/lookup`, { method: 'POST', headers, body: '{"email":"visitor@example.test"}' });
  const { selectedPath } = await lookup.json();
  assert.match(await (await fetch(`${root}${selectedPath}`, { headers })).text(), /booth-touchscreen-device/);
  const send = await fetch(`${root}/auth/booth/send`, { method: 'POST', headers, body: '{}' });
  assert.equal((await send.json()).delivery, 'sent');
  const reset = await fetch(`${root}/auth/booth/reset`, { method: 'POST', headers, body: '{}' });
  assert.equal((await reset.json()).state, 'entry');
});
