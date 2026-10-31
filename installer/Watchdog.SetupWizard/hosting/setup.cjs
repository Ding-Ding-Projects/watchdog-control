const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { hostService, stageRuntime } = require('./host-service.cjs');
const { credentialStore } = require('./credentials.cjs');
const { configureStartup, startupStatus } = require('./startup.cjs');
const { verifyEndpoint, quickTunnelUrl } = require('./endpoint.cjs');

function createHosting(options) {
  const { userData, secretDirectory, resourceRoot, helpers } = options;
  const directory = path.join(userData, 'hosting');
  const service = hostService(directory);
  const credentials = credentialStore(secretDirectory);
  async function snapshot() {
    const current = await service.status();
    return { phase: current.phase, publicUrl: quickTunnelUrl(current.publicUrl), localReady: current.localReady === true,
      tunnel: current.tunnel || 'off', notification: current.notification || 'not-configured', webhookConfigured: await credentials.configured(), startup: await startupStatus(directory) };
  }
  async function startSupervisor(state, tls) {
    await helpers.secureDirectory(directory);
    await helpers.secureDirectory(path.join(userData, 'runtime'));
    const runtime = await stageRuntime(resourceRoot, path.join(userData, 'runtime'), __dirname);
    const caFile = path.join(secretDirectory, 'watchdog_tls.pem');
    await fs.writeFile(caFile, new crypto.X509Certificate(await fs.readFile(tls.certFile)).toString(), { mode: 0o600 });
    await service.start({ mode: state.hostingMode, address: state.lanBindAddress, port: state.hostPort,
      origin: `https://${state.lanBindAddress}:${state.hostPort}`, storageDirectory: state.storageDirectory,
      pfx: tls.pfx, passwordFile: tls.passwordFile, caFile, secretDirectory, tunnelEnabled: state.tunnelEnabled === true, dockerContext: state.docker?.context, composeDirectory: state.composeDirectory }, runtime);
    await configureStartup(directory, runtime, state.startupEnabled === true);
  }
  return {
    snapshot, credentials,
    async startup(enabled) {
      const config = JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8'));
      return configureStartup(directory, config.runtime, enabled === true);
    },
    stop: () => service.stop(), startSupervisor,
    async native(state) {
      helpers.checkCancelled();
      if (state.requiresStorageSelection && !state.storageChoiceConfirmed) throw new Error('Confirm the existing data folder before starting.');
      if (!state.startConfirmed) throw new Error('Confirm the selected destination before starting.');
      const addresses = await helpers.addresses();
      if (!addresses.includes(state.lanBindAddress)) throw new Error('The selected LAN interface is no longer available. Review host settings.');
      const previous = await service.status();
      if (!['stopped', 'unavailable', 'failed'].includes(previous.phase)) throw new Error('Hosting is already registered. Stop the current hosting session before starting another.');
      // The supervisor first reclaims exactly identified children of a dead owner,
      // then checks the port exclusively. An early port probe would block that recovery.
      await helpers.secureDirectory(secretDirectory);
      await fs.mkdir(state.storageDirectory, { recursive: true });
      let pairingCode;
      for (const name of ['watchdog_pairing_code', 'watchdog_agent_enrollment_code']) {
        const file = path.join(secretDirectory, name);
        let code;
        try { code = (await fs.readFile(file, 'utf8')).trim(); }
        catch (error) { if (error.code !== 'ENOENT') throw error; code = crypto.randomBytes(24).toString('base64url'); await helpers.writeSecret(file, code); }
        if (name === 'watchdog_pairing_code') pairingCode = code;
      }
      const tls = await helpers.tls();
      helpers.checkCancelled();
      await (options.startSupervisor || startSupervisor)(state, tls);
      state.serviceStarted = true;
      state.certificateFingerprint = tls.fingerprint;
      const ca = new crypto.X509Certificate(await fs.readFile(tls.certFile)).toString();
      const origin = `https://${state.lanBindAddress}:${state.hostPort}`;
      for (let attempt = 0; attempt < 30; attempt++) {
        helpers.checkCancelled();
        helpers.progress('Verifying native controller', `Checking HTTPS, management assets, and authentication (${attempt + 1}/30).`);
        try {
          const result = await (options.verifyEndpoint || verifyEndpoint)(origin, ca);
          helpers.checkCancelled();
          state.lanUrl = origin; state.verified = true;
          state.summary = `Native controller ${result.version} passed HTTPS health, management assets, and unauthenticated-access checks. Other LAN devices require their own reachability check.`;
          state.hosting = await snapshot();
          return pairingCode;
        } catch (error) { helpers.checkCancelled(); }
        const current = await service.status();
        if (current.phase === 'failed') throw new Error('The native controller stopped before verification.');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      throw new Error('The native controller did not verify within 90 seconds. Inspect the live hosting state before retrying.');
    }
  };
}
module.exports = { createHosting };
