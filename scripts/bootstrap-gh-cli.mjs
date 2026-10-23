import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { appendFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = JSON.parse(await readFile(path.join(root, 'build-tools.json'), 'utf8'));
const config = tools.githubCli;
if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('The pinned GitHub CLI bootstrap currently supports linux-x64 release jobs only.');
}
if (!config || !/^\d+\.\d+\.\d+$/.test(config.version) || !/^https:\/\/github\.com\/cli\/cli\/releases\/download\/v\d+\.\d+\.\d+\/gh_\d+\.\d+\.\d+_linux_amd64\.tar\.gz$/.test(config.linuxX64Archive) || !/^[a-f0-9]{64}$/.test(config.linuxX64Sha256)) {
  throw new Error('build-tools.json contains an invalid GitHub CLI pin.');
}

const existing = spawnSync('gh', ['--version'], { encoding: 'utf8', windowsHide: true });
if (existing.status === 0 && new RegExp(`^gh version ${config.version.replaceAll('.', '\\.')}(?:\\s|$)`, 'm').test(existing.stdout)) {
  process.stdout.write(`The pinned GitHub CLI ${config.version} is already available.\n`);
  process.exit(0);
}

const runnerTemp = process.env.RUNNER_TEMP || tmpdir();
const installRoot = path.join(runnerTemp, `gh-cli-${config.version}`);
const archivePath = path.join(runnerTemp, `gh_${config.version}_linux_amd64.tar.gz`);
await mkdir(installRoot, { recursive: true });
try {
  const response = await fetch(config.linuxX64Archive, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error(`The official CLI download returned HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > 25_000_000) throw new Error('The official CLI download exceeded its size limit.');
  await pipeline(response.body, createWriteStream(archivePath, { flags: 'wx' }));
  const info = await stat(archivePath);
  if (info.size < 1 || info.size > 25_000_000) throw new Error('The official CLI archive has an unexpected size.');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(archivePath)) digest.update(chunk);
  if (digest.digest('hex') !== config.linuxX64Sha256) throw new Error('The official CLI archive failed its pinned SHA-256 check.');

  const extract = spawnSync('tar', ['-xzf', archivePath, '-C', installRoot], { encoding: 'utf8', windowsHide: true });
  if (extract.status !== 0) throw new Error(`Could not extract the verified CLI archive: ${(extract.stderr || '').trim()}`);
  const binDirectory = path.join(installRoot, `gh_${config.version}_linux_amd64`, 'bin');
  const cli = path.join(binDirectory, 'gh');
  const installed = spawnSync(cli, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (installed.status !== 0 || !new RegExp(`^gh version ${config.version.replaceAll('.', '\\.')}(?:\\s|$)`, 'm').test(installed.stdout)) {
    throw new Error('The extracted GitHub CLI did not report the pinned version.');
  }
  const githubPath = process.env.GITHUB_PATH;
  if (!githubPath) throw new Error('GITHUB_PATH is required to expose the verified CLI to later workflow steps.');
  await appendFile(githubPath, `${binDirectory}${path.delimiter === ':' ? '\n' : '\n'}`, 'utf8');
  process.stdout.write(`Installed the verified GitHub CLI ${config.version} into the job-local tool directory.\n`);
} finally {
  await rm(archivePath, { force: true });
}
