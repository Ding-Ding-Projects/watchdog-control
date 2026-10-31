const { verifyEndpoint } = require('./endpoint.cjs');
const MAX_INPUT = 65536;
let input = '', size = 0;
process.stdin.on('data', chunk => {
  size += chunk.length;
  if (size > MAX_INPUT) process.exit(1);
  input += chunk.toString('utf8');
});
process.stdin.on('error', () => process.exit(1));
process.stdin.on('end', async () => {
  try {
    const { origin, ca } = JSON.parse(input);
    const url = new URL(origin);
    if (typeof origin !== 'string' || origin.length > 2048 || url.protocol !== 'https:' ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        typeof ca !== 'string' || !ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error();
    const result = await verifyEndpoint(url.origin, ca);
    if (!/^[a-zA-Z0-9.+_-]{1,64}$/.test(result.version)) throw new Error();
    process.stdout.write(JSON.stringify({ version: result.version, verifiedAt: result.verifiedAt }));
  } catch { process.exitCode = 1; }
});
