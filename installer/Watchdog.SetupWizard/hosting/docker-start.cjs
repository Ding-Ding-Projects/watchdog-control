const { spawn } = require('node:child_process');
async function run(args, cwd, timeout = 15000) {
  return new Promise(resolve => {
    const child = spawn('docker.exe', args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = ''; const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', chunk => { output = (output + chunk.toString('utf8')).slice(-16384); });
    child.once('error', () => { clearTimeout(timer); resolve({ code: 1, output: '' }); });
    child.once('exit', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}
async function startDocker(config, cancelled = async () => false, execute = run) {
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(config.dockerContext || '') || process.env.DOCKER_HOST) throw new Error('A verified local Docker context is required.');
  for (let attempt = 0; attempt < 12; attempt++) {
    if (await cancelled()) throw new Error('Hosting stop was requested.');
    const context = await execute(['context', 'inspect', config.dockerContext, '--format', '{{json .Endpoints.docker.Host}}']);
    let endpoint;
    try { endpoint = JSON.parse(context.output); } catch {}
    if (context.code === 0 && typeof endpoint === 'string' && endpoint.startsWith('npipe:////./pipe/')) {
      const ready = await execute(['--context', config.dockerContext, 'info', '--format', '{{json .ServerVersion}}']);
      if (ready.code === 0) {
        const result = await execute(['--context', config.dockerContext, 'compose', '--env-file', '.env', '-p', 'watchdog-control', '-f', 'compose.yaml', 'up', '-d', 'watchdog'], config.composeDirectory, 120000);
        if (result.code !== 0) throw new Error('The owned Compose service did not start.');
        return;
      }
    } else if (context.code === 0) throw new Error('Remote Docker endpoints are not supported for automatic startup.');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('The local Docker engine did not become ready within the bounded startup period.');
}
module.exports = { startDocker };
