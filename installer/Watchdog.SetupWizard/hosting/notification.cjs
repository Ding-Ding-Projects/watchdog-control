const { request, quickTunnelUrl } = require('./endpoint.cjs');

function webhookUrl(value) {
  if (typeof value !== 'string' || value.length > 512) throw new Error('Enter a valid Discord webhook URL.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid Discord webhook URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.port || url.username || url.password || url.search || url.hash
    || !/^\/api\/webhooks\/[0-9]{16,24}\/[A-Za-z0-9_-]{40,200}$/.test(url.pathname)) throw new Error('Enter a valid Discord webhook URL.');
  return url.href;
}

async function sendNotification(webhookProvider, publicUrl, test = false, transport = request) {
  if (!test && !quickTunnelUrl(publicUrl)) throw new Error('Only a verified temporary address may be notified.');
  const url = webhookUrl(await webhookProvider());
  const body = JSON.stringify({ content: test ? 'Watchdog Control notification test.' : `Watchdog Control verified temporary address: ${publicUrl}\nSign in with your existing account. This address may change.`, allowed_mentions: { parse: [] } });
  const result = await transport(url, { method: 'POST', body, maximum: 16384 });
  if (result.status < 200 || result.status > 299) throw new Error(`Discord notification returned HTTP ${result.status}.`);
  return { sent: true };
}
module.exports = { webhookUrl, sendNotification };
