import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.RELEASE_ASSET_DIR || path.join(root, 'release-assets'));
const windows = path.join(root, 'build', 'windows');
const imageArchive = path.resolve(process.env.IMAGE_ARCHIVE || '');
const sourceCommit = process.env.SOURCE_COMMIT || '';
const version = (process.env.RELEASE_VERSION || '').trim();
const imageReference = process.env.IMAGE_REFERENCE || '';
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('SOURCE_COMMIT must be the full source SHA.');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('RELEASE_VERSION must match VERSION.');
if (!new RegExp(`^ghcr\\.io/ding-ding-projects/watchdog-control@sha256:[a-f0-9]{64}$`).test(imageReference)) throw new Error('IMAGE_REFERENCE must be an immutable published image digest.');
await mkdir(out, { recursive: true });

const requiredSourceFiles = [
  [path.join(windows, 'artifacts', 'agent', 'WatchdogAgent.exe'), path.join(out, 'watchdog-agent-win-x64.exe')],
  [path.join(windows, 'release', 'WatchdogControlSetup.exe'), path.join(out, 'WatchdogControlSetup.exe')],
  [imageArchive, path.join(out, 'watchdog-control-image-linux-amd64.tar')],
  [path.join(root, 'compose.yaml'), path.join(out, 'compose.yaml')],
  [path.join(root, 'host.bat'), path.join(out, 'host.bat')],
  [path.join(root, 'scripts', 'host.ps1'), path.join(out, 'host.ps1')],
  [path.join(root, '.env.example'), path.join(out, '.env.example')],
];
for (const [source, destination] of requiredSourceFiles) {
  const info = await stat(source);
  if (!info.isFile() || info.size < 1) throw new Error(`Required release input is missing or empty: ${path.basename(source)}`);
  await copyFile(source, destination);
}

const assets = [
  'WatchdogControlSetup.exe',
  'watchdog-agent-win-x64.exe',
  'watchdog-control-image-linux-amd64.tar',
  'compose.yaml',
  'host.bat',
  'host.ps1',
  '.env.example',
  'watchdog-release-manifest.json',
];
const sha256 = async file => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
const imageArchiveHash = await sha256(path.join(out, 'watchdog-control-image-linux-amd64.tar'));
const manifest = {
  schemaVersion: 1,
  sourceCommit,
  version: `v${version}`,
  image: {
    reference: imageReference,
    archiveAsset: 'watchdog-control-image-linux-amd64.tar',
    archiveSha256: imageArchiveHash,
  },
  service: {
    name: 'watchdog',
    containerPort: 8443,
    healthPath: '/health',
    dataPath: '/var/lib/watchdog-control',
    pairingCodeFile: '/run/secrets/watchdog_pairing_code',
    agentEnrollmentCodeFile: '/run/secrets/watchdog_agent_enrollment_code',
  },
  tls: {
    certificateFile: '/run/secrets/watchdog_tls_certificate',
    passwordFile: '/run/secrets/watchdog_tls_password',
  },
};
await writeFile(path.join(out, 'watchdog-release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });

const checksums = [];
for (const name of assets) checksums.push(`${await sha256(path.join(out, name))}  ${name}`);
await writeFile(path.join(out, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`, { encoding: 'utf8', flag: 'w' });
const expected = new Set([...assets, 'SHA256SUMS.txt']);
const actual = new Set(await readdir(out));
for (const name of actual) if (!expected.has(name)) throw new Error(`Unexpected file in the public release directory: ${name}`);
for (const name of expected) if (!actual.has(name) && name !== 'SHA256SUMS.txt') throw new Error(`Release asset was not prepared: ${name}`);
process.stdout.write(`Prepared ${expected.size} source-bound release files for v${version} from ${sourceCommit}.\n`);
