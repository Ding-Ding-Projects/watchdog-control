const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { configuration, certificatePem, webhookProvider } = require('./config.cjs');
const { verifyEndpoint, quickTunnelUrl } = require('../installer/Watchdog.SetupWizard/hosting/endpoint.cjs');
const { Recovery, NotificationDelivery } = require('../installer/Watchdog.SetupWizard/hosting/lifecycle.cjs');
const { sendNotification } = require('../installer/Watchdog.SetupWizard/hosting/notification.cjs');

function statusRecord(state) {
  return { schemaVersion: 1, phase: state.phase, controllerReady: state.controllerReady === true,
    tunnel: state.tunnel, publicUrl: quickTunnelUrl(state.publicUrl), notification: state.notification,
    updatedAt: new Date().toISOString() };
}

async function supervise() {
  let controller; let tunnel; let temporaryDirectory; let stopped = false; let candidate = null;
  let candidateStarted = 0; let lastLog = ''; let config;
  const controllerRecovery = new Recovery(3); const tunnelRecovery = new Recovery(6);
  const delivery = new NotificationDelivery(3);
  const abort = new AbortController();
  const state = { phase: 'starting', controllerReady: false, tunnel: 'off', publicUrl: null, notification: 'off' };
  const stop = () => { stopped = true; abort.abort(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const sleep = ms => new Promise(resolve => {
    if (stopped) return resolve();
    const finish = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms); abort.signal.addEventListener('abort', finish, { once: true });
  });
  const alive = child => child && child.pid && child.exitCode === null && child.signalCode === null && !child.killed;
  const launch = (program, args, stderr = false) => {
    const child = spawn(program, args, { cwd: '/app', shell: false, stdio: ['ignore', 'ignore', stderr ? 'pipe' : 'ignore'] });
    child.on('error', () => {});
    return child;
  };
  async function stopChild(child) {
    if (!alive(child)) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
  }
  async function publish(patch = {}) {
    Object.assign(state, patch);
    const value = statusRecord(state);
    const target = path.join(config.dataDirectory, 'hosting-status.json');
    await fs.writeFile(`${target}.new`, JSON.stringify(value), { mode: 0o600 });
    await fs.rename(`${target}.new`, target);
    const log = JSON.stringify({ phase: value.phase, tunnel: value.tunnel, publicUrl: value.publicUrl, notification: value.notification });
    if (log !== lastLog) { process.stdout.write(`${log}\n`); lastLog = log; }
  }
  function startController() { controller = launch('dotnet', ['Watchdog.Web.dll']); }
  function startTunnel(caFile) {
    candidate = null; candidateStarted = Date.now();
    tunnel = launch('/opt/watchdog-tools/cloudflared', ['tunnel', '--no-autoupdate', '--url', config.origin,
      '--origin-ca-pool', caFile, '--origin-server-name', '127.0.0.1'], true);
    let pending = '';
    tunnel.stderr.on('data', chunk => {
      pending = (pending + chunk.toString('utf8')).slice(-8192);
      for (const match of pending.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/g)) candidate = quickTunnelUrl(match[0]);
    });
  }
  try {
    config = configuration();
    const ca = await certificatePem(config.caFile);
    await fs.mkdir(config.dataDirectory, { recursive: true });
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-hosting-'));
    const caFile = path.join(temporaryDirectory, 'origin.pem');
    await fs.writeFile(caFile, ca, { mode: 0o600 });
    await publish();
    startController();
    const startupDeadline = Date.now() + 90000;
    while (!stopped && Date.now() < startupDeadline) {
      try { await verifyEndpoint(config.origin, ca); if (alive(controller)) { state.controllerReady = true; break; } } catch {}
      if (!alive(controller)) break;
      await sleep(3000);
    }
    if (stopped) return;
    if (!state.controllerReady) throw new Error('Controller startup verification did not complete.');
    await publish({ phase: 'ready' });
    if (config.tunnelEnabled) startTunnel(caFile);
    while (!stopped) {
      let healthy = false;
      try { await verifyEndpoint(config.origin, ca); healthy = alive(controller); } catch {}
      if (stopped) break;
      if (!healthy) {
        await publish({ phase: 'recovering-controller', controllerReady: false, publicUrl: null });
        if (!alive(controller) || controllerRecovery.disconnected()) {
          await stopChild(controller);
          const delay = controllerRecovery.restartDelay();
          if (delay === null) throw new Error('Controller recovery limit reached.');
          await sleep(delay); if (!stopped) startController();
        }
        await sleep(10000); continue;
      }
      controllerRecovery.healthy();
      await publish({ controllerReady: true });
      if (!config.tunnelEnabled) { await publish({ phase: state.tunnel === 'recovery-limit' ? 'attention' : 'ready' }); await sleep(10000); continue; }
      let publicReady = false;
      if (candidate && alive(tunnel)) {
        try { await verifyEndpoint(candidate); publicReady = alive(tunnel); } catch {}
      }
      if (stopped) break;
      if (publicReady) {
        tunnelRecovery.healthy();
        await publish({ phase: 'ready', tunnel: 'verified', publicUrl: candidate });
        if (config.notificationsEnabled && delivery.canSend(candidate)) {
          delivery.attempt(candidate);
          try {
            await sendNotification(webhookProvider(config.webhookFile), candidate);
            delivery.acknowledge(candidate); await publish({ notification: 'sent' });
          } catch { await publish({ notification: delivery.canSend(candidate) ? 'retrying' : 'failed' }); }
        }
      } else {
        await publish({ publicUrl: null, tunnel: 'verifying' });
        if (!alive(tunnel) || (tunnelRecovery.disconnected() && Date.now() - candidateStarted > 90000)) {
          await stopChild(tunnel);
          const delay = tunnelRecovery.restartDelay();
          if (delay === null) {
            config.tunnelEnabled = false;
            await publish({ phase: 'attention', tunnel: 'recovery-limit', publicUrl: null });
          } else {
            await publish({ phase: 'recovering-tunnel', tunnel: 'backoff' });
            await sleep(delay); if (!stopped) startTunnel(caFile);
          }
        }
      }
      await sleep(10000);
    }
  } catch {
    process.exitCode = 1;
    if (config) await publish({ phase: 'failed', controllerReady: false, publicUrl: null }).catch(() => {});
    // Suppress exception bodies and child output, which may contain sensitive paths or values.
    process.stderr.write('Hosting did not complete. Check mounted files, permissions, and the protected configuration.\n');
  } finally {
    await stopChild(tunnel); await stopChild(controller);
    if (config && stopped) await publish({ phase: 'stopped', controllerReady: false, publicUrl: null }).catch(() => {});
    if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
  }
}
if (require.main === module) supervise().catch(() => { process.exitCode = 1; });
module.exports = { statusRecord, supervise };
