const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { verifyEndpoint, quickTunnelUrl } = require('./endpoint.cjs');
const { credentialStore } = require('./credentials.cjs');
const net = require('node:net');
const crypto = require('node:crypto');
const { processIdentity, sameProcess } = require('./process-identity.cjs');
const { startDocker } = require('./docker-start.cjs');
const { Recovery, NotificationDelivery } = require('./lifecycle.cjs');

async function supervise(configPath) {
  let config = {};
  const directory = path.dirname(configPath);
  const statusPath = path.join(directory, 'status.json');
  const lockPath = path.join(directory, 'owner.json');
  const status = { schemaVersion: 1, owner: null, pid: process.pid, mode: config.mode, phase: 'starting', publicUrl: null, notification: 'not-configured' };
  let service = null; let tunnel = null; let candidate = null; let stopped = false;
  let tunnelStartedAt = 0; const notifications = new NotificationDelivery();
  const recovery = new Recovery(); const serviceRecovery = new Recovery(3);
  let credentials; let ca; let ownsLock = false; let mutex;
  async function stopRequested() {
    try { return JSON.parse(await fs.readFile(path.join(directory, 'stop.json'), 'utf8')).owner === config.owner; } catch { return false; }
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function publish(patch = {}) {
    Object.assign(status, patch, { updatedAt: new Date().toISOString() });
    await fs.writeFile(`${statusPath}.new`, JSON.stringify(status), { mode: 0o600 });
    await fs.rename(`${statusPath}.new`, statusPath);
  }
  function launch(file, args, options = {}) {
    const child = spawn(file, args, { windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'], ...options });
    child.on('error', () => {});
    return child;
  }
  async function startService() {
    const free = await new Promise(resolve => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.listen({ host: config.address, port: config.port, exclusive: true }, () => probe.close(() => resolve(true)));
    });
    if (!free) throw new Error('The configured port is occupied. The existing process was preserved.');
    service = launch(config.controller, [], { cwd: path.dirname(config.controller), env: {
      ...process.env, ASPNETCORE_ENVIRONMENT: 'Production',
      WATCHDOG_BIND_ADDRESS: config.address, WATCHDOG_PORT: String(config.port),
      WATCHDOG_DATA_PATH: config.storageDirectory,
      WATCHDOG_TLS_CERTIFICATE_FILE: config.pfx,
      WATCHDOG_TLS_CERTIFICATE_PASSWORD_FILE: config.passwordFile,
      WATCHDOG_PAIRING_CODE_FILE: path.join(config.secretDirectory, 'watchdog_pairing_code'),
      WATCHDOG_AGENT_ENROLLMENT_CODE_FILE: path.join(config.secretDirectory, 'watchdog_agent_enrollment_code')
    } });
    // Product output may contain operational details and must not enter status records.
    service.stderr.resume();
  }
  function startTunnel() {
    candidate = null; tunnelStartedAt = Date.now();
    tunnel = launch(config.cloudflared, ['tunnel', '--no-autoupdate', '--url', config.origin,
      '--origin-ca-pool', config.caFile, '--origin-server-name', config.address]);
    let pending = '';
    tunnel.stderr.on('data', chunk => {
      pending = (pending + chunk.toString('utf8')).slice(-8192);
      for (const match of pending.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/g)) candidate = quickTunnelUrl(match[0]);
    });
  }
  const alive = child => child && child.exitCode === null && child.signalCode === null && child.pid && !child.killed;
  async function stopChild(child) {
    if (!alive(child)) return;
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill();
    });
  }
  try {
    const pipe = '\\\\.\\pipe\\watchdog-host-' + crypto.createHash('sha256').update(directory.toLowerCase()).digest('hex').slice(0, 32);
    mutex = net.createServer(socket => socket.destroy());
    try { await new Promise((resolve, reject) => { mutex.once('error', reject); mutex.listen(pipe, resolve); }); }
    catch { return; }
    config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    let previous;
    try { previous = JSON.parse(await fs.readFile(lockPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous && !previous.identity) throw new Error('The prior ownership record has no verifiable process identity.');
    if (previous?.identity && sameProcess(previous.identity, await processIdentity(previous.identity.pid))) return;
    const identity = await processIdentity(process.pid);
    if (!identity) throw new Error('The supervisor process identity is unavailable.');
    config.owner = crypto.randomUUID();
    status.owner = config.owner; status.mode = config.mode;
    await fs.writeFile(lockPath, JSON.stringify({ owner: config.owner, identity }), { mode: 0o600 });
    ownsLock = true;
    await fs.rm(path.join(directory, 'stop.json'), { force: true });
    await publish();
    credentials = credentialStore(config.secretDirectory);
    ca = await fs.readFile(config.caFile);
    if (config.mode === 'native') await startService();
    else await startDocker(config, stopRequested);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await stopRequested()) { stopped = true; break; }
      try { await verifyEndpoint(config.origin, ca); ready = config.mode !== 'native' || alive(service); if (ready) break; } catch {}
      if (config.mode === 'native' && !alive(service)) break;
      await pause(3000);
    }
    if (stopped) return;
    if (!ready) throw new Error('Controller did not pass HTTPS, management assets, and authentication checks.');
    await publish({ phase: 'ready', localReady: true });
    if (config.tunnelEnabled) startTunnel();
    while (!stopped) {
      if (await stopRequested()) { stopped = true; break; }
      let localReady = false;
      try { await verifyEndpoint(config.origin, ca); localReady = config.mode !== 'native' || alive(service); if (localReady) serviceRecovery.healthy(); } catch {}
      if (!localReady) {
        await publish({ phase: 'recovering-controller', localReady: false, publicUrl: null });
        if (config.mode === 'native' && (!alive(service) || serviceRecovery.disconnected())) {
          await stopChild(service);
          const delay = serviceRecovery.restartDelay();
          if (delay === null) throw new Error('Controller recovery limit reached. Review settings and restart hosting.');
          await pause(delay); await startService();
        }
      }
      if (config.tunnelEnabled && localReady) {
        let verified = false;
        if (candidate && alive(tunnel)) {
          try {
            await verifyEndpoint(candidate); verified = true; recovery.healthy();
            await publish({ phase: 'ready', localReady: true, publicUrl: candidate, tunnel: 'verified' });
            if (!await credentials.configured()) await publish({ notification: 'not-configured' });
            if (notifications.canSend(candidate) && await credentials.configured()) {
              notifications.attempt(candidate);
              try { await credentials.send(candidate); notifications.acknowledge(candidate); await publish({ notification: 'sent' }); }
              catch { await publish({ notification: notifications.canSend(candidate) ? 'retrying' : 'failed' }); }
            }
          } catch {}
        }
        if (!verified) {
          await publish({ publicUrl: null, tunnel: 'verifying', localReady: true });
          const unhealthy = recovery.disconnected();
          if (!alive(tunnel) || (unhealthy && Date.now() - tunnelStartedAt > 90000)) {
            await stopChild(tunnel);
            const delay = recovery.restartDelay();
            if (delay === null) {
              await publish({ phase: 'attention', tunnel: 'recovery-limit', publicUrl: null });
              // Keep the local controller available. Explicit retry starts a new bounded run.
              config.tunnelEnabled = false;
            } else {
              await publish({ phase: 'recovering-tunnel', tunnel: 'backoff', retry: recovery.attempts });
              await pause(delay); startTunnel();
            }
          }
        }
      } else if (localReady) await publish({ phase: status.tunnel === 'recovery-limit' ? 'attention' : 'ready', localReady: true });
      await pause(10000);
    }
    await publish({ phase: 'stopping', publicUrl: null, localReady: false });
  } catch {
    if (ownsLock) await publish({ phase: 'failed', publicUrl: null, localReady: false, message: 'Hosting stopped before verification. Review the selected destination and bundled runtime, then retry.' }).catch(() => {});
  } finally {
    await stopChild(tunnel); await stopChild(service);
    if (ownsLock) try {
      const owner = JSON.parse(await fs.readFile(lockPath, 'utf8'));
      if (owner.owner === config.owner) await fs.rm(lockPath);
    } catch {}
    if (mutex?.listening) await new Promise(resolve => mutex.close(resolve));
    if (stopped) await publish({ phase: 'stopped', publicUrl: null, localReady: false }).catch(() => {});
  }
}
if (require.main === module) supervise(process.argv[2]).catch(() => { process.exitCode = 1; });
module.exports = { supervise };
