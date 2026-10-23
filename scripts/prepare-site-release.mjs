import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = process.env.RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
const fromLatest = process.env.SITE_RELEASE_FROM_LATEST === 'true';
const tag = process.env.RELEASE_TAG || '';
const sourceCommit = process.env.SOURCE_COMMIT || '';
if (repository !== 'Ding-Ding-Projects/watchdog-control') throw new Error('The verified public release repository does not match this site.');

const run = args => execFileSync('gh', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
const sha256 = async file => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};

const expectedAssets = [
  'WatchdogControlSetup.exe',
  'watchdog-agent-win-x64.exe',
  'watchdog-control-image-linux-amd64.tar',
  'compose.yaml',
  'host.bat',
  'host.ps1',
  'default.env.example',
  'watchdog-release-manifest.json',
  'SHA256SUMS.txt',
].sort();

async function markDownloadUnavailable(message) {
  await writeFile(path.join(root, 'docs', 'assets', 'release.json'), `${JSON.stringify({ schemaVersion: 1, release: null }, null, 2)}\n`, 'utf8');
  process.stdout.write(`${message}\n`);
  return null;
}

async function prepareFromReceipt() {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('RELEASE_TAG is malformed.');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('SOURCE_COMMIT must be the full source SHA.');
  const readback = path.resolve(process.env.RELEASE_READBACK_DIR || path.join(root, 'release-readback'));
  const receipt = JSON.parse(await readFile(path.join(root, 'release-verification.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(readback, 'watchdog-release-manifest.json'), 'utf8'));
  if (receipt.repository !== repository || receipt.tag !== tag || receipt.sourceCommit !== sourceCommit || receipt.normalRelease !== true) {
    throw new Error('The release verification receipt does not match the intended normal release and source.');
  }
  if (receipt.releaseUrl !== `https://github.com/${repository}/releases/tag/${tag}` || !Number.isFinite(Date.parse(receipt.publishedAt || ''))) {
    throw new Error('The release receipt does not contain a verified release URL and publication timestamp.');
  }
  if (manifest.version !== tag || manifest.sourceCommit !== sourceCommit || receipt.imageReference !== manifest.image?.reference) {
    throw new Error('The downloaded manifest does not match the verified release receipt.');
  }
  const compose = receipt.assets?.find(asset => asset.name === 'compose.yaml');
  const composePath = path.join(readback, 'compose.yaml');
  const composeHash = manifest.service?.composeSha256;
  if (!compose || !/^[a-f0-9]{64}$/.test(composeHash || '') || compose.sha256 !== composeHash ||
      await sha256(composePath) !== composeHash) {
    throw new Error('The downloaded Compose file does not match the verified release receipt and manifest.');
  }
  const installer = receipt.assets?.find(asset => asset.name === 'WatchdogControlSetup.exe');
  if (!installer || !Number.isSafeInteger(installer.size) || installer.size < 1 || !/^[a-f0-9]{64}$/.test(installer.sha256 || '')) {
    throw new Error('The verified release does not contain a complete setup assistant asset record.');
  }
  return { tag, sourceCommit, publishedAt: receipt.publishedAt, releasePage: receipt.releaseUrl, installer };
}

async function prepareFromLatestRelease() {
  const releases = JSON.parse(run(['api', `repos/${repository}/releases?per_page=100`]));
  const release = releases
    .filter(item => item.draft === false && item.prerelease === false && Number.isFinite(Date.parse(item.published_at || '')))
    .sort((left, right) => Date.parse(right.published_at) - Date.parse(left.published_at))[0];
  if (!release) {
    return markDownloadUnavailable('No normal release is published; the documentation download remains unavailable.');
  }
  if (!/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error('The latest normal release tag is malformed.');
  const assets = (release.assets || []).map(asset => asset.name).sort();
  if (JSON.stringify(assets) !== JSON.stringify(expectedAssets)) throw new Error('The latest normal release asset inventory is incomplete.');

  let object = JSON.parse(run(['api', `repos/${repository}/git/ref/tags/${release.tag_name}`])).object;
  let depth = 0;
  while (object?.type === 'tag' && depth < 5) {
    object = JSON.parse(run(['api', `repos/${repository}/git/tags/${object.sha}`])).object;
    depth++;
  }
  if (object?.type !== 'commit' || !/^[a-f0-9]{40}$/.test(object.sha)) throw new Error('The latest normal release tag does not resolve to a commit.');

  const readback = path.resolve(process.env.RELEASE_READBACK_DIR || path.join(root, 'release-readback'));
  await mkdir(readback, { recursive: true });
  run([
    'release', 'download', release.tag_name, '--repo', repository, '--dir', readback,
    '--pattern', 'WatchdogControlSetup.exe',
    '--pattern', 'compose.yaml',
    '--pattern', 'watchdog-release-manifest.json',
    '--pattern', 'SHA256SUMS.txt',
  ]);
  const manifest = JSON.parse(await readFile(path.join(readback, 'watchdog-release-manifest.json'), 'utf8'));
  const composeDigestMissing = !Object.hasOwn(manifest.service || {}, 'composeSha256');
  const composeDigest = manifest.service?.composeSha256;
  if (manifest.schemaVersion !== 1 || manifest.version !== release.tag_name || manifest.sourceCommit !== object.sha ||
      manifest.image?.archiveAsset !== 'watchdog-control-image-linux-amd64.tar' ||
      !/^ghcr\.io\/ding-ding-projects\/watchdog-control@sha256:[a-f0-9]{64}$/.test(manifest.image?.reference || '') ||
      !/^[a-f0-9]{64}$/.test(manifest.image?.archiveSha256 || '') ||
      manifest.service?.name !== 'watchdog' || manifest.service?.containerPort !== 8443 ||
      manifest.service?.healthPath !== '/health' || manifest.service?.dataPath !== '/var/lib/watchdog-control' ||
      manifest.service?.pairingCodeFile !== '/run/secrets/watchdog_pairing_code' ||
      manifest.service?.agentEnrollmentCodeFile !== '/run/secrets/watchdog_agent_enrollment_code' ||
      manifest.tls?.certificateFile !== '/run/secrets/watchdog_tls_certificate' ||
      manifest.tls?.passwordFile !== '/run/secrets/watchdog_tls_password' ||
      (!composeDigestMissing && !/^[a-f0-9]{64}$/.test(composeDigest || ''))) {
    throw new Error('The downloaded release manifest does not match the immutable release tag and image.');
  }

  const checksumText = await readFile(path.join(readback, 'SHA256SUMS.txt'), 'utf8');
  const checksums = new Map(checksumText.split(/\r?\n/u).map(line => {
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/u);
    return match ? [match[2], match[1]] : null;
  }).filter(Boolean));
  const manifestHash = await sha256(path.join(readback, 'watchdog-release-manifest.json'));
  const installerHash = await sha256(path.join(readback, 'WatchdogControlSetup.exe'));
  const composeHash = await sha256(path.join(readback, 'compose.yaml'));
  const checksumAsset = release.assets.find(asset => asset.name === 'SHA256SUMS.txt');
  const manifestAsset = release.assets.find(asset => asset.name === 'watchdog-release-manifest.json');
  const installerMetadata = release.assets.find(asset => asset.name === 'WatchdogControlSetup.exe');
  const imageArchiveAsset = release.assets.find(asset => asset.name === 'watchdog-control-image-linux-amd64.tar');
  const composeAsset = release.assets.find(asset => asset.name === 'compose.yaml');
  const releaseAssetDigestMatches = (asset, digest) => !asset?.digest || asset.digest === `sha256:${digest}`;
  if (!/^[a-f0-9]{64}$/.test(checksums.get('watchdog-release-manifest.json') || '') ||
      !/^[a-f0-9]{64}$/.test(checksums.get('WatchdogControlSetup.exe') || '') ||
      !/^[a-f0-9]{64}$/.test(checksums.get('watchdog-control-image-linux-amd64.tar') || '') ||
      !/^[a-f0-9]{64}$/.test(checksums.get('compose.yaml') || '') ||
      checksums.get('watchdog-release-manifest.json') !== manifestHash ||
      checksums.get('WatchdogControlSetup.exe') !== installerHash ||
      checksums.get('watchdog-control-image-linux-amd64.tar') !== manifest.image.archiveSha256 ||
      checksums.get('compose.yaml') !== composeHash ||
      (!composeDigestMissing && composeHash !== composeDigest) ||
      !releaseAssetDigestMatches(checksumAsset, await sha256(path.join(readback, 'SHA256SUMS.txt')) ) ||
      !releaseAssetDigestMatches(manifestAsset, manifestHash) ||
      !releaseAssetDigestMatches(installerMetadata, installerHash) ||
      !releaseAssetDigestMatches(imageArchiveAsset, manifest.image.archiveSha256) ||
      !releaseAssetDigestMatches(composeAsset, composeHash)) {
    throw new Error('The latest release assets do not match their published checksums and image manifest.');
  }

  const installerInfo = await stat(path.join(readback, 'WatchdogControlSetup.exe'));
  if (installerInfo.size !== installerMetadata.size ||
      (installerMetadata.digest && installerMetadata.digest !== `sha256:${checksums.get('WatchdogControlSetup.exe')}`)) {
    throw new Error('The verified setup assistant size or asset digest differs from the release metadata.');
  }
  const timing = (release.body || '').match(/## Release publication timing\n- Workflow run started: (\d{4}-\d\d-\d\dT[^\n]+)\n- Normal release published: (\d{4}-\d\d-\d\dT[^\n]+)\n- Elapsed to publication: (\d{2,}:\d\d:\d\d)\s*$/u);
  if (!timing || !Number.isFinite(Date.parse(timing[1])) || Date.parse(timing[2]) !== Date.parse(release.published_at)) {
    throw new Error('The latest normal release notes lack verified publication timing.');
  }
  if (composeDigestMissing) {
    return markDownloadUnavailable(`The latest normal release ${release.tag_name} has no service.composeSha256; the documentation will deploy without a verified download.`);
  }
  return {
    tag: release.tag_name,
    sourceCommit: object.sha,
    publishedAt: new Date(release.published_at).toISOString(),
    releasePage: `https://github.com/${repository}/releases/tag/${release.tag_name}`,
    installer: {
      name: 'WatchdogControlSetup.exe',
      size: installerInfo.size,
      sha256: checksums.get('WatchdogControlSetup.exe'),
    },
  };
}

const details = fromLatest ? await prepareFromLatestRelease() : await prepareFromReceipt();
if (!details) process.exit(0);
const releaseUrl = `https://github.com/${repository}/releases/download/${details.tag}/${details.installer.name}`;
const siteRelease = {
  schemaVersion: 1,
  release: {
    tag: details.tag,
    version: details.tag,
    sourceCommit: details.sourceCommit,
    publishedAt: details.publishedAt,
    releasePage: details.releasePage,
    installer: {
      name: details.installer.name,
      platform: 'Windows x64',
      url: releaseUrl,
      size: details.installer.size,
      sha256: details.installer.sha256,
    },
  },
};
await writeFile(path.join(root, 'docs', 'assets', 'release.json'), `${JSON.stringify(siteRelease, null, 2)}\n`, 'utf8');
process.stdout.write(`Prepared the documentation download card from verified release ${details.tag}, source ${details.sourceCommit}.\n`);
