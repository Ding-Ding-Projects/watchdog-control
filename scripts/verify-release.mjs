import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { readReleaseTiming, publicationTimingSection } from './release-timing.mjs';

const repository = process.env.RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
const tag = process.env.RELEASE_TAG || '';
const sourceCommit = process.env.SOURCE_COMMIT || '';
const workflowRunId = process.env.WORKFLOW_RUN_ID || '';
const localDir = path.resolve(process.env.RELEASE_ASSET_DIR || 'release-assets');
const remoteDir = path.resolve(process.env.REMOTE_ASSET_DIR || 'release-readback');
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('RELEASE_REPOSITORY is malformed.');
if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(tag)) throw new Error('RELEASE_TAG is malformed.');
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('SOURCE_COMMIT must be the full expected source SHA.');
if (!/^\d+$/.test(workflowRunId)) throw new Error('WORKFLOW_RUN_ID is malformed.');

const run = (args, encoding = 'utf8') => execFileSync('gh', args, { encoding, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const release = JSON.parse(run(['api', `repos/${repository}/releases/tags/${tag}`]));
if (release.tag_name !== tag || release.draft !== false || release.prerelease !== false) throw new Error('The stored release is not the intended normal release.');
const workflowTiming = await readReleaseTiming(repository, workflowRunId, tag, sourceCommit);
if ((release.body || '').trimEnd().split('\n').slice(-4).join('\n') !== publicationTimingSection(workflowTiming)) {
  throw new Error('The published release notes do not contain verified workflow start, release publication, and elapsed-time values.');
}

let ref = JSON.parse(run(['api', `repos/${repository}/git/ref/tags/${tag}`]));
let object = ref.object;
let depth = 0;
while (object?.type === 'tag' && depth < 5) {
  const annotation = JSON.parse(run(['api', `repos/${repository}/git/tags/${object.sha}`]));
  object = annotation.object;
  depth++;
}
if (object?.type !== 'commit' || object.sha !== sourceCommit) throw new Error('The immutable release tag does not resolve to the exact source commit.');

const expectedAssets = [
  'WatchdogControlSetup.exe',
  'watchdog-agent-win-x64.exe',
  'watchdog-control-image-linux-amd64.tar',
  'compose.yaml',
  'host.bat',
  'host.ps1',
  '.env.example',
  'watchdog-release-manifest.json',
  'SHA256SUMS.txt',
].sort();
const remoteAssets = (release.assets || []).map(asset => asset.name).sort();
if (JSON.stringify(remoteAssets) !== JSON.stringify(expectedAssets)) throw new Error('The release asset inventory differs from the required complete set.');
await mkdir(remoteDir, { recursive: true });
run(['release', 'download', tag, '--repo', repository, '--dir', remoteDir]);

const digest = async file => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
for (const name of expectedAssets) {
  const localPath = path.join(localDir, name);
  const remotePath = path.join(remoteDir, name);
  const [localInfo, remoteInfo] = await Promise.all([stat(localPath), stat(remotePath)]);
  if (localInfo.size !== remoteInfo.size || await digest(localPath) !== await digest(remotePath)) throw new Error(`Published release bytes did not match the verified local asset: ${name}`);
}

const manifest = JSON.parse(await readFile(path.join(remoteDir, 'watchdog-release-manifest.json'), 'utf8'));
if (manifest.sourceCommit !== sourceCommit || manifest.version !== tag || manifest.image?.archiveAsset !== 'watchdog-control-image-linux-amd64.tar') throw new Error('The downloaded release manifest does not match the exact source and tag.');
const imageHash = await digest(path.join(remoteDir, manifest.image.archiveAsset));
if (manifest.image.archiveSha256 !== imageHash) throw new Error('The downloaded image archive does not match the manifest digest.');
const receipt = {
  repository,
  tag,
  sourceCommit,
  releaseUrl: release.html_url,
  publishedAt: workflowTiming.releasePublishedAt,
  workflowTiming,
  normalRelease: true,
  immutableTagTarget: object.sha,
  imageReference: manifest.image.reference,
  assets: expectedAssets.map(name => ({ name, size: (release.assets.find(asset => asset.name === name)).size, sha256: null })),
  verifiedAt: new Date().toISOString(),
};
for (const asset of receipt.assets) asset.sha256 = await digest(path.join(remoteDir, asset.name));
await (await import('node:fs/promises')).writeFile(path.resolve('release-verification.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
process.stdout.write(`Verified normal release ${tag} against ${sourceCommit}, its immutable tag, and all ${expectedAssets.length} downloaded files.\n`);
