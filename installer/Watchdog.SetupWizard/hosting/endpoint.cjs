const https = require('node:https');

function quickTunnelUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname)
      && !url.port && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
      ? url.origin : null;
  } catch { return null; }
}

function request(url, { ca, method = 'GET', body, timeout = 8000, maximum = 2 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ca, method, timeout, rejectUnauthorized: true,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, response => {
      const chunks = []; let length = 0;
      response.on('data', chunk => {
        length += chunk.length;
        if (length > maximum) req.destroy(new Error('Endpoint response exceeded the size limit.'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'] || '', body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', () => reject(new Error('Endpoint response interrupted.')));
    });
    req.on('timeout', () => req.destroy(new Error('Endpoint timed out.')));
    // Do not expose native network messages, which can include credential-bearing URLs.
    req.on('error', () => reject(new Error('Secure endpoint connection failed.')));
    req.end(body);
  });
}

async function verifyEndpoint(origin, ca, transport = request) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('HTTPS is required.');
  const health = await transport(new URL('/health', base), { ca, maximum: 16384 });
  let payload;
  try { payload = JSON.parse(health.body); } catch { throw new Error('Health response is not JSON.'); }
  if (health.status !== 200 || payload.status !== 'ready' || typeof payload.version !== 'string') throw new Error('Controller health is not ready.');
  const page = await transport(new URL('/', base), { ca });
  if (page.status !== 200 || !page.type.includes('text/html')) throw new Error('Management page is unavailable.');
  const assets = [...page.body.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(match => new URL(match[1], base));
  if (!assets.length || assets.length > 32 || assets.some(url => url.origin !== base.origin)) throw new Error('Management assets are missing or external.');
  for (const asset of assets) {
    const result = await transport(asset, { ca });
    if (result.status !== 200 || !result.body.length || result.type.includes('text/html')) throw new Error('Management asset verification failed.');
  }
  for (const route of ['/api/session', '/api/dashboard']) {
    const result = await transport(new URL(route, base), { ca, maximum: 16384 });
    if (result.status !== 401) throw new Error('Unauthenticated management access was not rejected.');
  }
  return { version: payload.version, verifiedAt: new Date().toISOString() };
}

module.exports = { quickTunnelUrl, request, verifyEndpoint };
