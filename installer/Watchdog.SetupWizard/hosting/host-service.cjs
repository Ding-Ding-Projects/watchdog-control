const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

async function stageRuntime(source, destination, hostingSource) {
  const entries = [];
  async function inventory(directory, prefix) {
    for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.isSymbolicLink()) throw new Error('Runtime symbolic links are not supported.');
      const relative = path.join(prefix, item.name);
      if (item.isDirectory()) await inventory(path.join(directory, item.name), relative);
      else if (item.isFile()) entries.push({ source: path.join(directory, item.name), relative, digest: crypto.createHash('sha256').update(await fs.readFile(path.join(directory, item.name))).digest('hex') });
    }
  }
  await inventory(path.join(source, 'controller'), 'controller');
  await inventory(path.join(source, 'tools'), 'tools');
  await inventory(hostingSource, 'hosting');
  const identity = crypto.createHash('sha256').update(JSON.stringify(entries.map(({ relative, digest }) => [relative, digest]))).digest('hex');
  const runtime = path.join(destination, identity);
  for (const entry of entries) {
    const target = path.join(runtime, entry.relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      const actual = crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
      if (actual !== entry.digest) throw new Error('An existing immutable hosting runtime changed.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.copyFile(entry.source, target, require('node:fs').constants.COPYFILE_EXCL);
      if (crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex') !== entry.digest) throw new Error('Runtime staging verification failed.');
    }
  }
  return runtime;
}

function hostService(directory) {
  const ownerFile = path.join(directory, 'owner.json');
  return {
    async status() {
      try {
        const value = JSON.parse(await fs.readFile(path.join(directory, 'status.json'), 'utf8'));
        const timestamp = Date.parse(value.updatedAt);
        if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5000 || Date.now() - timestamp > 45000) return { phase: 'unavailable', publicUrl: null, localReady: false };
        return value;
      } catch { return { phase: 'stopped', publicUrl: null, localReady: false }; }
    },
    async start(config, runtime) {
      await fs.mkdir(directory, { recursive: true });
      const owner = crypto.randomUUID();
      const configPath = path.join(directory, 'config.json');
      const previous = await this.status();
      if (!['stopped', 'failed', 'unavailable'].includes(previous.phase)) throw new Error('The current hosting session must stop before its settings change.');
      await fs.writeFile(configPath, JSON.stringify({ ...config, owner, runtime, controller: path.join(runtime, 'controller/Watchdog.Web.exe'), cloudflared: path.join(runtime, 'tools/cloudflared.exe') }), { mode: 0o600 });
      const child = spawn(path.join(runtime, 'tools/node.exe'), [path.join(runtime, 'hosting/supervisor.cjs'), configPath],
        { detached: true, windowsHide: true, shell: false, stdio: 'ignore', cwd: directory });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(new Error('The hosting supervisor could not start.'))); });
      child.unref();
      return { owner };
    },
    async stop() {
      let owner;
      try { owner = JSON.parse(await fs.readFile(ownerFile, 'utf8')); } catch { return { stopped: true }; }
      await fs.writeFile(path.join(directory, 'stop.json'), JSON.stringify({ owner: owner.owner }), { mode: 0o600 });
      return { requested: true };
    }
  };
}
module.exports = { stageRuntime, hostService };
