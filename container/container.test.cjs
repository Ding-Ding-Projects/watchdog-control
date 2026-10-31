const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { configuration, certificatePem, webhookProvider } = require('./config.cjs');
const { statusRecord } = require('./supervisor.cjs');
const { sendNotification } = require('../installer/Watchdog.SetupWizard/hosting/notification.cjs');
const { Recovery, NotificationDelivery } = require('../installer/Watchdog.SetupWizard/hosting/lifecycle.cjs');

test('container public access defaults off and notification credentials cannot enter through environment values', () => {
  const defaults = configuration({});
  assert.equal(defaults.tunnelEnabled, false);
  assert.equal(defaults.notificationsEnabled, false);
  assert.throws(() => configuration({ WATCHDOG_TUNNEL_ENABLED: 'yes' }), /true or false/);
  assert.throws(() => configuration({ DISCORD_WEBHOOK_URL: 'not-allowed' }), /environment values/);
  assert.throws(() => configuration({ WATCHDOG_NOTIFICATIONS_ENABLED: 'true' }), /require temporary/);
  assert.throws(() => configuration({ WATCHDOG_TUNNEL_ENABLED: 'true', WATCHDOG_NOTIFICATIONS_ENABLED: 'true', WATCHDOG_DISCORD_WEBHOOK_FILE: '/tmp/unknown' }), /explicit mounted/);
  const enabled = configuration({ WATCHDOG_TUNNEL_ENABLED: 'true', WATCHDOG_NOTIFICATIONS_ENABLED: 'true', WATCHDOG_DISCORD_WEBHOOK_FILE: '/run/secrets/watchdog_discord_webhook' });
  assert.equal(enabled.notificationsEnabled, true);
});

test('status projection never includes credential, paths or child diagnostic fields', () => {
  const record = statusRecord({ phase: 'ready', controllerReady: true, publicUrl: 'https://verified.trycloudflare.com', tunnel: 'verified', notification: 'sent', webhook: 'private-value', stderr: 'private-output', credentialPath: '/secret/path' });
  assert.deepEqual(Object.keys(record).sort(), ['schemaVersion', 'phase', 'controllerReady', 'publicUrl', 'tunnel', 'notification', 'updatedAt'].sort());
  assert.equal(JSON.stringify(record).includes('private-'), false);
  assert.equal(statusRecord({ publicUrl: 'http://untrusted.example' }).publicUrl, null);
});

test('mounted webhook is read only at send time and invalid files cannot be transmitted', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-container-credentials-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'webhook');
  const provider = webhookProvider(file);
  await assert.rejects(provider());
  const credential = `https://discord.com/api/webhooks/${'1'.repeat(18)}/${'a'.repeat(60)}`;
  await fs.writeFile(file, `${credential}\n`, { mode: 0o600 });
  let sends = 0;
  await sendNotification(provider, 'https://verified.trycloudflare.com', false, async (url, options) => {
    sends++; assert.equal(url, credential); assert.equal(options.body.includes(credential), false); return { status: 204 };
  });
  await fs.writeFile(file, 'x'.repeat(513));
  await assert.rejects(sendNotification(provider, 'https://verified.trycloudflare.com', false, async () => { sends++; return { status: 204 }; }));
  assert.equal(sends, 1);
});

test('origin certificate rejects a trusted but unrelated public certificate', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-container-ca-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'certificate.pem');
  await fs.writeFile(file, require('node:tls').rootCertificates[0]);
  await assert.rejects(certificatePem(file), /cover 127.0.0.1/);
  await fs.writeFile(file, 'not a certificate');
  await assert.rejects(certificatePem(file));
});

test('container recovery and notification budgets terminate repeated failures without duplicate delivery', () => {
  const recovery = new Recovery(6);
  for (let i = 0; i < 6; i++) assert.equal(typeof recovery.restartDelay(), 'number');
  assert.equal(recovery.restartDelay(), null);
  const notifications = new NotificationDelivery(3);
  for (let i = 0; i < 3; i++) assert.equal(notifications.attempt('https://first.trycloudflare.com'), true);
  assert.equal(notifications.attempt('https://first.trycloudflare.com'), false);
  assert.equal(notifications.attempt('https://replacement.trycloudflare.com'), true);
  notifications.acknowledge('https://replacement.trycloudflare.com');
  assert.equal(notifications.canSend('https://replacement.trycloudflare.com'), false);
});

test('packaging keeps non-root runtime, trusted downloads and opt-in mounted credentials', async () => {
  const root = path.resolve(__dirname, '..');
  const dockerfile = await fs.readFile(path.join(root, 'Dockerfile'), 'utf8');
  const compose = await fs.readFile(path.join(root, 'compose.yaml'), 'utf8');
  const override = await fs.readFile(path.join(__dirname, 'compose.notifications.yaml'), 'utf8');
  const download = await fs.readFile(path.join(__dirname, 'download-tools.sh'), 'utf8');
  const pins = JSON.parse(await fs.readFile(path.join(__dirname, 'tools.json'), 'utf8'));
  assert.match(dockerfile, /USER \$APP_UID[\s\S]+ENTRYPOINT/);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s/);
  assert.match(dockerfile, /container\/healthcheck\.cjs/);
  assert.match(compose, /image: \$\{WATCHDOG_IMAGE:\?/);
  assert.match(compose, /WATCHDOG_TUNNEL_ENABLED:-false/);
  assert.match(compose, /WATCHDOG_NOTIFICATIONS_ENABLED: "false"/);
  assert.match(compose, /WATCHDOG_TLS_CA_HOST_FILE:\?/);
  assert.match(override, /file: \$\{WATCHDOG_DISCORD_WEBHOOK_HOST_FILE:\?/);
  assert.match(download, /sha256sum --check --strict/g);
  for (const pin of Object.values(pins.architectures)) {
    assert.match(pin.nodeSha256, /^[a-f0-9]{64}$/);
    assert.match(pin.cloudflaredSha256, /^[a-f0-9]{64}$/);
    assert.ok(download.includes(pin.nodeSha256));
    assert.ok(download.includes(pin.cloudflaredSha256));
  }
});
