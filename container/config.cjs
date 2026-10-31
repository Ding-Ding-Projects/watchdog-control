const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function flag(value, name) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error(`${name} must be true or false.`);
}
function configuration(env = process.env) {
  if (env.WATCHDOG_DISCORD_WEBHOOK || env.DISCORD_WEBHOOK_URL) throw new Error('Webhook environment values are not supported. Mount the explicit credential file.');
  const tunnelEnabled = flag(env.WATCHDOG_TUNNEL_ENABLED, 'WATCHDOG_TUNNEL_ENABLED');
  const notificationsEnabled = flag(env.WATCHDOG_NOTIFICATIONS_ENABLED, 'WATCHDOG_NOTIFICATIONS_ENABLED');
  if (notificationsEnabled && !tunnelEnabled) throw new Error('Notifications require temporary public access to be enabled.');
  const caFile = env.WATCHDOG_TLS_CA_FILE || '/run/secrets/watchdog_tls_ca';
  const webhookFile = env.WATCHDOG_DISCORD_WEBHOOK_FILE || '';
  if (notificationsEnabled && webhookFile !== '/run/secrets/watchdog_discord_webhook') throw new Error('Notifications require the explicit mounted webhook file.');
  if (!path.posix.isAbsolute(caFile)) throw new Error('The public certificate path must be absolute.');
  return { tunnelEnabled, notificationsEnabled, caFile, webhookFile,
    origin: 'https://127.0.0.1:8443', dataDirectory: env.WATCHDOG_DATA_PATH || '/var/lib/watchdog-control' };
}
async function certificatePem(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 65536) throw new Error('The public certificate file is invalid.');
  const certificate = new crypto.X509Certificate(await fs.readFile(file));
  if (!certificate.checkIP('127.0.0.1') || Date.parse(certificate.validTo) <= Date.now()) throw new Error('The certificate must be valid and cover 127.0.0.1.');
  return certificate.toString();
}
function webhookProvider(file, read = fs.readFile, inspect = fs.stat) {
  return async () => {
    const stat = await inspect(file);
    if (!stat.isFile() || stat.size < 1 || stat.size > 512) throw new Error('The mounted webhook file is invalid.');
    return (await read(file, 'utf8')).trim();
  };
}
module.exports = { configuration, certificatePem, webhookProvider };
