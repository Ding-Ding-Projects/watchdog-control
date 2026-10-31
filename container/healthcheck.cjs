const { configuration, certificatePem } = require('./config.cjs');
const { verifyEndpoint } = require('../installer/Watchdog.SetupWizard/hosting/endpoint.cjs');
(async () => {
  const config = configuration();
  await verifyEndpoint(config.origin, await certificatePem(config.caFile));
})().catch(() => { process.exitCode = 1; });
