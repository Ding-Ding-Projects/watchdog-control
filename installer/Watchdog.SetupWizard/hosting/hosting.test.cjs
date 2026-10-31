const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { verifyEndpoint, quickTunnelUrl } = require('./endpoint.cjs');
const { webhookUrl, credentialStore } = require('./credentials.cjs');
const { Recovery } = require('./lifecycle.cjs');
const { stageRuntime, hostService } = require('./host-service.cjs');
const { NotificationDelivery } = require('./lifecycle.cjs');
const { sameProcess, processIdentity } = require('./process-identity.cjs');
const { supervise } = require('./supervisor.cjs');
const { createHosting } = require('./setup.cjs');
const { startupCommand } = require('./startup.cjs');
const { startDocker } = require('./docker-start.cjs');
const { sendNotification } = require('./notification.cjs');

function responses(overrides = {}) {
  const replies = {
    '/health': { status: 200, body: '{"status":"ready","version":"1.2.3"}', type: 'application/json' },
    '/': { status: 200, body: '<script src="/assets/main.js"></script><link href="/assets/main.css">', type: 'text/html' },
    '/assets/main.js': { status: 200, body: '/* management */', type: 'text/javascript' },
    '/assets/main.css': { status: 200, body: 'body{}', type: 'text/css' },
    '/api/session': { status: 401, body: '', type: '' }, '/api/dashboard': { status: 401, body: '', type: '' }, ...overrides
  };
  return async url => { assert.equal(url.origin, 'https://dashboard.example'); return replies[url.pathname]; };
}

test('readiness requires JSON health, delivered assets and both authentication boundaries', async () => {
  assert.equal((await verifyEndpoint('https://dashboard.example', undefined, responses())).version, '1.2.3');
  for (const override of [
    { '/health': { status: 200, body: '<html>ready</html>' } },
    { '/health': { status: 200, body: '{"status":"ready"}' } },
    { '/assets/main.js': { status: 200, body: '<html>fallback</html>', type: 'text/html' } },
    { '/api/session': { status: 200, body: '{}' } },
    { '/api/dashboard': { status: 302, body: '' } },
    { '/': { status: 200, body: '<script src="https://other.example/main.js"></script>', type: 'text/html' } }
  ]) await assert.rejects(verifyEndpoint('https://dashboard.example', undefined, responses(override)));
});

test('temporary-address and credential validators reject alternate hosts and ambiguous URLs', () => {
  assert.equal(quickTunnelUrl('https://one-two.trycloudflare.com'), 'https://one-two.trycloudflare.com');
  for (const url of ['http://one.trycloudflare.com', 'https://one.trycloudflare.com.evil.example', 'https://user@one.trycloudflare.com', 'https://one.trycloudflare.com/path', 'https://one.trycloudflare.com?token=x']) assert.equal(quickTunnelUrl(url), null);
  const valid = `https://discord.com/api/webhooks/${'1'.repeat(18)}/${'a'.repeat(60)}`;
  assert.equal(webhookUrl(valid), valid);
  for (const url of [valid.replace('discord.com', 'discord.com.evil.example'), `${valid}?wait=true`, valid.replace('https:', 'http:'), 'file:///tmp/webhook']) assert.throws(() => webhookUrl(url), /valid Discord/);
});

test('recovery is bounded and successful notifications deduplicate without hiding failed delivery', () => {
  const recovery = new Recovery();
  assert.equal(recovery.disconnected(), false); assert.equal(recovery.disconnected(), false);
  recovery.healthy(); assert.equal(recovery.disconnected(), false);
  assert.deepEqual(Array.from({ length: 7 }, () => recovery.restartDelay()), [2000, 4000, 8000, 16000, 32000, 60000, null]);
  const first = 'https://first.trycloudflare.com'; const replacement = 'https://replacement.trycloudflare.com';
  assert.equal(recovery.needsNotification(first), true);
  assert.equal(recovery.needsNotification(first), true);
  recovery.acknowledge(first);
  assert.equal(recovery.needsNotification(first), false);
  assert.equal(recovery.needsNotification(replacement), true);
});

test('credential persistence contains only the protected result and never returns the entered value', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-credential-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const value = `https://discord.com/api/webhooks/${'1'.repeat(18)}/${'a'.repeat(60)}`;
  const store = credentialStore(directory, async input => { assert.equal(input, value); return 'protected-result'; });
  assert.deepEqual(await store.save(value), { configured: true });
  assert.equal(await fs.readFile(path.join(directory, 'discord-webhook.dpapi'), 'utf8'), 'protected-result');
  assert.equal(await store.configured(), true);
  await assert.rejects(store.save('invalid'));
  assert.equal(await store.configured(), true);
  await store.remove(); assert.equal(await store.configured(), false);
});

test('immutable staged runtime is content-bound and refuses a changed existing file', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-runtime-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const name of ['controller', 'tools', 'hosting']) await fs.mkdir(path.join(directory, name));
  await fs.writeFile(path.join(directory, 'controller/Watchdog.Web.exe'), 'controller');
  await fs.writeFile(path.join(directory, 'tools/node.exe'), 'node');
  await fs.writeFile(path.join(directory, 'hosting/supervisor.cjs'), 'supervisor');
  const first = await stageRuntime(directory, path.join(directory, 'runtime'), path.join(directory, 'hosting'));
  assert.equal(await stageRuntime(directory, path.join(directory, 'runtime'), path.join(directory, 'hosting')), first);
  await fs.writeFile(path.join(first, 'tools/node.exe'), 'changed');
  await assert.rejects(stageRuntime(directory, path.join(directory, 'runtime'), path.join(directory, 'hosting')), /immutable/);
});

test('stale status never advertises a ready controller or a public address', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-status-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'status.json'), JSON.stringify({ updatedAt: '2000-01-01T00:00:00Z', phase: 'ready', localReady: true, publicUrl: 'https://old.trycloudflare.com' }));
  assert.deepEqual(await hostService(directory).status(), { phase: 'unavailable', publicUrl: null, localReady: false });
});

test('notification retry budget survives loss and return of the same URL', () => {
  const delivery = new NotificationDelivery();
  const first = 'https://first.trycloudflare.com'; const second = 'https://second.trycloudflare.com';
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(delivery.attempt(first), true);
  assert.equal(delivery.canSend(first), false);
  assert.equal(delivery.attempt(second), true);
  assert.equal(delivery.attempt(first), false);
  delivery.acknowledge(second);
  assert.equal(delivery.canSend(second), false);
});

test('process reuse cannot impersonate a registered supervisor', () => {
  const recorded = { pid: 100, startedAt: '2026-01-01T00:00:00Z', executable: 'C:\\owned\\node.exe' };
  assert.equal(sameProcess(recorded, { ...recorded }), true);
  assert.equal(sameProcess(recorded, { ...recorded, startedAt: '2026-02-01T00:00:00Z' }), false);
  assert.equal(sameProcess(recorded, { ...recorded, executable: 'C:\\other\\node.exe' }), false);
  assert.equal(sameProcess(recorded, null), false);
});

test('startup fault releases a stale registration and records an incomplete result', { skip: process.platform !== 'win32' }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-startup-fault-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const identity = await processIdentity(process.pid);
  assert.equal(identity.pid, process.pid);
  await fs.writeFile(path.join(directory, 'owner.json'), JSON.stringify({ owner: 'old', identity: { pid: 2147483647, startedAt: '2000-01-01T00:00:00Z', executable: 'C:\\old\\node.exe' } }));
  await fs.writeFile(path.join(directory, 'stop.json'), '{"owner":"old"}');
  const config = path.join(directory, 'config.json');
  await fs.writeFile(config, JSON.stringify({ mode: 'native', secretDirectory: directory, caFile: path.join(directory, 'missing.pem') }));
  await supervise(config);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8')).phase, 'failed');
  await assert.rejects(fs.access(path.join(directory, 'owner.json')));
  await assert.rejects(fs.access(path.join(directory, 'stop.json')));
  // A second run must be able to acquire the OS-owned exclusion after the fault.
  await supervise(config);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8')).localReady, false);
});

test('cancellation delivered during endpoint verification never commits native readiness', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-cancel-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const cert = path.join(directory, 'public.pem');
  await fs.writeFile(cert, require('node:tls').rootCertificates[0]);
  let cancelled = false;
  const service = createHosting({ userData: directory, secretDirectory: directory, resourceRoot: directory,
    startSupervisor: async () => {},
    verifyEndpoint: async () => { cancelled = true; return { version: '1.0.0' }; },
    helpers: { checkCancelled: () => { if (cancelled) throw new Error('Cancellation requested.'); },
      addresses: async () => ['192.168.1.2'], portAvailable: async () => true,
      secureDirectory: async () => {}, writeSecret: async (file, value) => fs.writeFile(file, value),
      tls: async () => ({ certFile: cert, fingerprint: 'fixture' }), progress: () => {} }
  });
  const state = { hostingMode: 'native', startConfirmed: true, hostPort: 8443, lanBindAddress: '192.168.1.2', storageDirectory: directory, verified: false };
  await assert.rejects(service.native(state), /Cancellation/);
  assert.equal(state.verified, false);
});

test('sign-in command quotes fixed executable and config paths and rejects injection', () => {
  const runtime = path.resolve('owned runtime'); const config = path.resolve('owned state/config.json');
  const command = startupCommand(runtime, config);
  assert.ok(command.includes('"' + path.join(runtime, 'tools/node.exe') + '"'));
  assert.ok(command.endsWith('"' + config + '"'));
  assert.throws(() => startupCommand(runtime + '"bad', config), /invalid/);
});

test('Docker sign-in startup uses only the verified local context and owned service', async () => {
  const calls = [];
  await startDocker({ dockerContext: 'desktop-linux', composeDirectory: 'C:\\owned' }, async () => false, async (args, cwd) => {
    calls.push({ args, cwd });
    return { code: 0, output: args[0] === 'context' ? '"npipe:////./pipe/docker_engine"' : '"1.0"' };
  });
  assert.deepEqual(calls.at(-1).args.slice(-3), ['up', '-d', 'watchdog']);
  assert.equal(calls.at(-1).cwd, 'C:\\owned');
  await assert.rejects(startDocker({ dockerContext: 'default' }, async () => false, async () => ({ code: 0, output: '"tcp://other-host:2375"' })), /Remote/);
});

test('notification provider stays out of message content and failed sends stay incomplete', async () => {
  const credential = `https://discord.com/api/webhooks/${'1'.repeat(18)}/${'a'.repeat(60)}`;
  let reads = 0;
  const provider = async () => { reads++; return credential; };
  const result = await sendNotification(provider, 'https://verified.trycloudflare.com', false, async (url, options) => {
    assert.equal(url, credential);
    assert.equal(options.method, 'POST');
    assert.equal(options.body.includes(credential), false);
    assert.deepEqual(JSON.parse(options.body).allowed_mentions, { parse: [] });
    return { status: 204 };
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(reads, 1);
  await assert.rejects(sendNotification(provider, 'https://unapproved.example', false), /verified temporary/);
  assert.equal(reads, 1);
  await assert.rejects(sendNotification(provider, null, true, async () => ({ status: 429 })), /HTTP 429/);
});
