const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

// Only public CA material and an HTTPS origin cross this fixed child interface.
function runProbe(executable, script, input, { checkCancelled = () => {}, timeout = 30000, launch = spawn } = {}) {
  return new Promise((resolve, reject) => {
    let child, timer, cancellation, settled = false, output = '', outputBytes = 0;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearInterval(cancellation);
      if (error && child) child.kill();
      error ? reject(new Error('Secure endpoint verification did not complete.')) : resolve(result);
    };
    try {
      checkCancelled();
      const payload = JSON.stringify(input);
      if (Buffer.byteLength(payload) > 65536) throw new Error();
      const env = { ...process.env };
      for (const name of Object.keys(env)) if (/^(NODE_OPTIONS|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|ELECTRON_RUN_AS_NODE)$/i.test(name)) delete env[name];
      child = launch(executable, [script], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'], env });
      timer = setTimeout(() => finish(new Error()), timeout);
      cancellation = setInterval(() => { try { checkCancelled(); } catch { finish(new Error()); } }, 100);
      child.on('error', () => finish(new Error()));
      child.stdout.on('data', chunk => {
        outputBytes += chunk.length;
        if (outputBytes > 1024) finish(new Error());
        else output += chunk.toString('utf8');
      });
      child.stdin.on('error', () => finish(new Error()));
      child.on('close', code => {
        if (settled) return;
        try {
          checkCancelled();
          if (code !== 0) throw new Error();
          const result = JSON.parse(output);
          if (typeof result.version !== 'string' || !/^[a-zA-Z0-9.+_-]{1,64}$/.test(result.version) ||
              typeof result.verifiedAt !== 'string' || !Number.isFinite(Date.parse(result.verifiedAt))) throw new Error();
          finish(null, { version: result.version, verifiedAt: result.verifiedAt });
        } catch { finish(new Error()); }
      });
      child.stdin.end(payload);
    } catch { finish(new Error()); }
  });
}

function createEndpointVerifier({ resourceRoot, directory, secureDirectory, checkCancelled }) {
  let staged;
  async function stage() {
    await secureDirectory(directory);
    const files = await Promise.all(['endpoint-probe.cjs', 'endpoint.cjs'].map(async name => ({ name, bytes: await fs.readFile(path.join(__dirname, name)) })));
    const hash = crypto.createHash('sha256');
    for (const file of files) hash.update(file.name).update(file.bytes);
    const target = path.join(directory, hash.digest('hex'));
    await fs.mkdir(target, { recursive: true });
    for (const file of files) {
      const destination = path.join(target, file.name);
      try { await fs.writeFile(destination, file.bytes, { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      if (!(await fs.readFile(destination)).equals(file.bytes)) throw new Error('Endpoint verifier staging changed.');
    }
    return path.join(target, 'endpoint-probe.cjs');
  }
  return async (origin, ca) => {
    checkCancelled();
    staged ||= stage().catch(error => { staged = null; throw error; });
    const script = await staged;
    checkCancelled();
    return runProbe(path.join(resourceRoot, 'tools', 'node.exe'), script, { origin, ca }, { checkCancelled });
  };
}
module.exports = { createEndpointVerifier, runProbe };
