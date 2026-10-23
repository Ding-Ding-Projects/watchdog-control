const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { promises: fs } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const net = require('node:net');
const https = require('node:https');
const tlsModule = require('node:tls');

const execFileAsync = promisify(execFile);
const OWNER_REPOSITORY = 'Ding-Ding-Projects/watchdog-control';
const WINGET_REPOSITORY = 'microsoft/winget-cli';
const MANIFEST_NAME = 'watchdog-release-manifest.json';
const IMAGE_PREFIX = 'ghcr.io/ding-ding-projects/watchdog-control@sha256:';
const USER_DATA = path.join(app.getPath('userData'), 'setup-state.json');
const SECRET_DIR = path.join(app.getPath('userData'), 'secrets');
const CACHE_DIR = path.join(app.getPath('userData'), 'cache', 'app-installer');
const DEFAULT_STORAGE = path.join(app.getPath('userData'), 'data');
const DEFAULT_COMPOSE = path.join(app.getPath('userData'), 'service');
const MAX_STATE_BYTES = 32768;
const MAX_LOG_LINES = 100;

let mainWindow;
let currentOperation = null;
let state = {
  schemaVersion: 1,
  lastStep: 0,
  hostPort: 8443,
  lanAddresses: [],
  lanBindAddress: '',
  storageDirectory: DEFAULT_STORAGE,
  composeDirectory: DEFAULT_COMPOSE,
  manageThisComputer: false,
  startConfirmed: false,
  agentConsent: false,
  storageChoiceConfirmed: false,
  requiresStorageSelection: false,
  verified: false,
  serviceStarted: false,
  release: null,
  releaseError: null,
  docker: null,
  lanUrl: null,
  certificateFingerprint: null,
  agentStatus: null,
  summary: null,
  pairingCodeShown: false,
  progressRecoveryWarning: null
};

function send(channel, value) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, value);
}

function progress(title, message, tone = 'working') {
  send('setup:operation-progress', { title, message, tone });
}

function stateChanged(patch) {
  Object.assign(state, patch);
  send('setup:progress', { type: 'state', state: publicState() });
}

function publicState() {
  return {
    ...state,
    pairingCode: undefined,
    operationLog: undefined
  };
}

async function loadState() {
  try {
    const info = await fs.stat(USER_DATA);
    if (info.size > MAX_STATE_BYTES) throw new Error('The saved setup record exceeds its safe size limit.');
    const parsed = JSON.parse(await fs.readFile(USER_DATA, 'utf8'));
    if (!parsed || parsed.schemaVersion !== 1 || typeof parsed !== 'object') throw new Error('The saved setup record has an unsupported shape.');
    state = { ...state, ...parsed };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      state.progressRecoveryWarning = error.message || 'The previous setup progress could not be read.';
      state.lastStep = 0;
    }
  }
  state.lanAddresses = await getLanIpv4Addresses().catch(() => []);
  if (!state.lanAddresses.includes(state.lanBindAddress)) {
    const previousAddress = state.lanBindAddress;
    state.lanBindAddress = state.lanAddresses[0] || '';
    if (previousAddress) state.startConfirmed = false;
  }
  try {
    state.release = await getProductRelease();
    state.releaseError = null;
  } catch (error) {
    state.release = null;
    state.releaseError = safeSummary(error.message);
  }
  return publicState();
}

async function saveState() {
  if (state.progressRecoveryWarning) return;
  const serializable = { ...state };
  delete serializable.pairingCode;
  const content = Buffer.from(`${JSON.stringify(serializable, null, 2)}\n`, 'utf8');
  if (content.length > MAX_STATE_BYTES) throw new Error('The setup record exceeds its safe size limit.');
  await fs.mkdir(path.dirname(USER_DATA), { recursive: true });
  const temporary = `${USER_DATA}.new`;
  await fs.writeFile(temporary, content, { flag: 'w' });
  await fs.rename(temporary, USER_DATA);
}

async function preserveUnreadableProgress() {
  if (!state.progressRecoveryWarning) return publicState();
  const original = await fs.readFile(USER_DATA);
  const recoveryPath = path.join(path.dirname(USER_DATA), `setup-state.recovery-${Date.now()}.json`);
  await fs.copyFile(USER_DATA, recoveryPath, require('node:fs').constants.COPYFILE_EXCL);
  const preserved = await fs.readFile(recoveryPath);
  if (original.length !== preserved.length || sha256(original) !== sha256(preserved)) {
    await fs.rm(recoveryPath, { force: true });
    throw new Error('The unreadable progress file could not be verified after preservation. The original remains unchanged.');
  }
  state.progressRecoveryWarning = null;
  state.requiresStorageSelection = true;
  state.storageChoiceConfirmed = false;
  state.storageDirectory = '';
  state.lastStep = 0;
  await saveState();
  return publicState();
}

function safeSummary(value) {
  const oneLine = String(value || '').replace(/[\r\n\0]/g, ' ').trim();
  return oneLine.length > 320 ? `${oneLine.slice(0, 317)}...` : oneLine;
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function run(program, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: options.cwd,
      windowsHide: options.windowsHide ?? true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (options.installProcess) {
        if (currentOperation) currentOperation.cancelRequested = true;
        progress('Still waiting', 'The active package installer has not finished. Setup will wait before allowing another attempt.', 'warning');
      } else {
        child.kill();
      }
    }, timeoutMs);
    if (options.installProcess && currentOperation) currentOperation.child = child;
    const append = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      return next.length > 16384 ? next.slice(-16384) : next;
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (options.installProcess && currentOperation) currentOperation.child = null;
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

async function powershell(script, options = {}) {
  const encoded = encodePowerShell(script);
  return run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    timeoutMs: options.timeoutMs ?? 30000,
    windowsHide: options.windowsHide ?? true,
    installProcess: options.installProcess
  });
}

async function fetchBytes(url, maximumBytes, signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('The download timed out after 120 seconds.')), 120000);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'WatchdogControlSetup/0.1.0', Accept: 'application/vnd.github+json, application/octet-stream' }, signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`Download returned HTTP ${response.status}.`);
    const declared = Number(response.headers.get('content-length'));
    if (Number.isSafeInteger(declared) && declared > maximumBytes) throw new Error('The download exceeds its accepted size limit.');
    if (!response.body) throw new Error('The download response has no readable body.');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maximumBytes) {
          await reader.cancel();
          throw new Error('The download exceeds its accepted size limit.');
        }
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    }
    if (total === 0) throw new Error('The downloaded file is empty.');
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('The download timed out after 120 seconds.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function fetchJson(url, maximumBytes = 2_000_000, signal) {
  const bytes = await fetchBytes(url, maximumBytes, signal);
  return JSON.parse(bytes.toString('utf8'));
}

async function getProductRelease() {
  const release = await fetchJson(`https://api.github.com/repos/${OWNER_REPOSITORY}/releases/latest`);
  if (release.draft || release.prerelease) throw new Error('The latest product release is not a normal published release.');
  const tag = String(release.tag_name || '');
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(tag)) throw new Error('The published product release tag is malformed.');
  const matches = (release.assets || []).filter((asset) => asset.name === MANIFEST_NAME);
  if (matches.length !== 1) throw new Error('The product release must contain exactly one image manifest.');
  const asset = matches[0];
  const expectedUrl = `https://github.com/${OWNER_REPOSITORY}/releases/download/${tag}/${MANIFEST_NAME}`;
  if (asset.browser_download_url !== expectedUrl || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('The release manifest asset URL or SHA-256 metadata is invalid.');
  const manifestBytes = await fetchBytes(asset.browser_download_url, 32768);
  if (sha256(manifestBytes) !== asset.digest.slice(7)) throw new Error('The downloaded release manifest failed its SHA-256 check.');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schemaVersion !== 1 || manifest.version !== tag || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit || '')) throw new Error('The image manifest version or source revision is invalid.');
  const sourceSha = await resolveTagCommit(tag);
  if (sourceSha !== manifest.sourceCommit) throw new Error('The release tag target does not match the manifest source revision.');
  if (!new RegExp(`^${escapeRegExp(IMAGE_PREFIX)}[a-f0-9]{64}$`).test(manifest.image?.reference || '')) throw new Error('The manifest image reference is not an immutable digest.');
  if (manifest.image?.archiveAsset !== 'watchdog-control-image-linux-amd64.tar' || !/^[a-f0-9]{64}$/.test(manifest.image?.archiveSha256 || '')) throw new Error('The downloadable image archive metadata is invalid.');
  if (manifest.service?.name !== 'watchdog' || manifest.service?.containerPort !== 8443 || manifest.service?.healthPath !== '/health' || manifest.service?.dataPath !== '/var/lib/watchdog-control') throw new Error('The release manifest service contract does not match this assistant.');
  if (manifest.tls?.certificateFile !== '/run/secrets/watchdog_tls_certificate' || manifest.tls?.passwordFile !== '/run/secrets/watchdog_tls_password') throw new Error('The release manifest TLS secret paths are invalid.');
  if (manifest.service?.pairingCodeFile !== '/run/secrets/watchdog_pairing_code' || manifest.service?.agentEnrollmentCodeFile !== '/run/secrets/watchdog_agent_enrollment_code') throw new Error('The release manifest pairing paths are invalid.');
  return { tag, sourceSha, image: manifest.image.reference, manifest };
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveTagCommit(tag) {
  let reference = await fetchJson(`https://api.github.com/repos/${OWNER_REPOSITORY}/git/ref/tags/${encodeURIComponent(tag)}`);
  let sha = reference.object?.sha;
  let type = reference.object?.type;
  for (let depth = 0; type === 'tag' && depth < 3; depth += 1) {
    const annotated = await fetchJson(`https://api.github.com/repos/${OWNER_REPOSITORY}/git/tags/${sha}`);
    sha = annotated.object?.sha;
    type = annotated.object?.type;
  }
  if (type !== 'commit' || !/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('The release tag does not resolve to a source commit.');
  return sha;
}

async function downloadVerifiedAsset(asset, directory, maximumBytes) {
  if (!asset || !/^sha256:[a-fA-F0-9]{64}$/.test(asset.digest || '') || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > maximumBytes) throw new Error('The official release asset metadata is missing, oversized, or invalid.');
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') throw new Error('The official release asset host is not allowed.');
  const bytes = await fetchBytes(asset.browser_download_url, maximumBytes);
  if (bytes.length !== asset.size || sha256(bytes) !== asset.digest.slice(7).toLowerCase()) throw new Error('The downloaded official release asset failed its size or SHA-256 check.');
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, path.basename(asset.name));
  await fs.writeFile(destination, bytes, { flag: 'w' });
  return destination;
}

async function readWingetRelease() {
  const release = await fetchJson(`https://api.github.com/repos/${WINGET_REPOSITORY}/releases/latest`);
  if (release.draft || release.prerelease) throw new Error('The latest Windows package manager release is not a stable published release.');
  if (!/^v\d+\.\d+\.\d+$/.test(release.tag_name || '')) throw new Error('The Windows package manager release tag is malformed.');
  return release;
}

function exactAsset(release, name, maximumBytes) {
  const matches = (release.assets || []).filter((asset) => asset.name === name);
  if (matches.length !== 1) throw new Error(`The stable package manager release must contain one ${name} file.`);
  const asset = matches[0];
  const expected = `https://github.com/${WINGET_REPOSITORY}/releases/download/${release.tag_name}/${name}`;
  if (asset.browser_download_url !== expected || !/^sha256:[a-fA-F0-9]{64}$/.test(asset.digest || '') || asset.size < 1 || asset.size > maximumBytes) throw new Error(`The ${name} release metadata is invalid.`);
  return asset;
}

async function installAppInstaller(progressCallback) {
  const release = await readWingetRelease();
  const root = path.join(CACHE_DIR, release.tag_name);
  const bundle = await downloadVerifiedAsset(exactAsset(release, 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle', 350_000_000), root, 350_000_000);
  const archive = await downloadVerifiedAsset(exactAsset(release, 'DesktopAppInstaller_Dependencies.zip', 150_000_000), root, 150_000_000);
  const manifestPath = await downloadVerifiedAsset(exactAsset(release, 'DesktopAppInstaller_Dependencies.json', 16384), root, 16384);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const dependencies = manifest.Dependencies;
  if (!Array.isArray(dependencies) || dependencies.length < 1 || dependencies.length > 10) throw new Error('The package manager dependency manifest has an unsupported shape.');
  for (const item of dependencies) {
    if (!/^Microsoft\.[A-Za-z0-9.]+$/.test(item.Name || '') || !/^\d+(\.\d+){1,3}$/.test(item.Version || '')) throw new Error('The package manager dependency manifest contains an unexpected package identity.');
  }
  progressCallback('Preparing verified package-manager dependencies.');
  const extraction = path.join(root, 'x64-dependencies');
  await fs.mkdir(extraction, { recursive: true });
  const script = `$ErrorActionPreference = 'Stop'\n` +
    `$archivePath = ${quotePowerShell(archive)}\n$extractPath = ${quotePowerShell(extraction)}\n` +
    `$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)\n` +
    `try {\n if ($zip.Entries.Count -lt 1 -or $zip.Entries.Count -gt 50 -or (($zip.Entries | Measure-Object -Property Length -Sum).Sum -gt 120000000)) { throw 'Archive bounds exceeded.' }\n` +
    `foreach ($entry in $zip.Entries) { if ($entry.FullName -notmatch '^(arm64|x64|x86)/Microsoft\\.[A-Za-z0-9._-]+_[0-9.]+_(arm64|x64|x86)\\.appx$') { throw 'Unexpected archive path.' } }\n` +
    `foreach ($entry in $zip.Entries) { if ($entry.FullName.StartsWith('x64/')) { $target = Join-Path $extractPath ([IO.Path]::GetFileName($entry.FullName)); $source = $entry.Open(); $destination = [IO.File]::Open($target,[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None); try { $source.CopyTo($destination) } finally { $destination.Dispose(); $source.Dispose() } } }\n` +
    `} finally { $zip.Dispose() }\n`;
  const extracted = await powershell(script, { timeoutMs: 120000 });
  if (extracted.exitCode !== 0) throw new Error(`Package-manager dependency extraction failed: ${safeSummary(extracted.stderr || extracted.stdout)}`);
  const dependencyPaths = dependencies.map((item) => path.join(extraction, `${item.Name}_${item.Version}_x64.appx`));
  for (const dependencyPath of dependencyPaths) {
    const info = await fs.stat(dependencyPath).catch(() => null);
    if (!info || info.size < 1 || info.size > 120_000_000) throw new Error(`The verified dependency package ${path.basename(dependencyPath)} is missing or oversized.`);
  }
  progressCallback('Installing the verified package manager for this user. Windows verifies the package signatures.');
  const dependencyList = dependencyPaths.map(quotePowerShell).join(', ');
  const installScript = `$ErrorActionPreference = 'Stop'\n$deps = @(${dependencyList})\nAdd-AppxPackage -Path ${quotePowerShell(bundle)} -DependencyPath $deps -ErrorAction Stop\n`;
  const install = await powershell(installScript, { timeoutMs: 600000, installProcess: true, windowsHide: false });
  if (install.exitCode !== 0) throw new Error(`Windows package deployment returned exit code ${install.exitCode}: ${safeSummary(install.stderr || install.stdout)}`);
  const check = await powershell("$p = Get-AppxPackage -Name 'Microsoft.DesktopAppInstaller' | Where-Object { $_.PackageFamilyName -eq 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' } | Select-Object -First 1; if ($null -eq $p) { exit 3 }; [pscustomobject]@{PackageFamilyName=$p.PackageFamilyName;Publisher=$p.Publisher;Version=$p.Version.ToString()} | ConvertTo-Json -Compress");
  if (check.exitCode !== 0) throw new Error('Windows returned without registering App Installer for this user.');
  const package = JSON.parse(check.stdout.trim());
  if (package.PackageFamilyName !== 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' || !package.Publisher?.startsWith('CN=Microsoft Corporation,') || !package.Publisher.includes('O=Microsoft Corporation')) throw new Error('The registered package does not have the expected Microsoft identity.');
}

async function findWinget() {
  const alias = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'winget.exe');
  try { await fs.access(alias); return alias; } catch { return 'winget.exe'; }
}

async function ensureWinget(progressCallback) {
  const existing = await powershell("$p = Get-AppxPackage -Name 'Microsoft.DesktopAppInstaller' | Where-Object { $_.PackageFamilyName -eq 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' } | Select-Object -First 1; if ($p) { 'present' }");
  if (existing.exitCode === 0 && existing.stdout.includes('present')) {
    const registration = await powershell("Add-AppxPackage -RegisterByFamilyName -MainPackage 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' -ErrorAction Stop");
    if (registration.exitCode === 0) {
      const winget = await findWinget();
      const ready = await run(winget, ['--version'], { timeoutMs: 30000 });
      if (ready.exitCode === 0 && /^v?\d+\.\d+\.\d+/m.test(ready.stdout)) return winget;
    }
  }
  progressCallback('Downloading and verifying the stable Microsoft package manager release.');
  await installAppInstaller(progressCallback);
  await powershell("Add-AppxPackage -RegisterByFamilyName -MainPackage 'Microsoft.DesktopAppInstaller_8wekyb3d8bbwe' -ErrorAction Stop");
  const winget = await findWinget();
  const ready = await run(winget, ['--version'], { timeoutMs: 30000 });
  if (ready.exitCode !== 0 || !/^v?\d+\.\d+\.\d+/m.test(ready.stdout)) throw new Error('The package manager was installed, but its version command did not become available.');
  return winget;
}

async function probeDocker() {
  try {
    const version = await run('docker.exe', ['--version'], { timeoutMs: 15000 });
    if (version.exitCode !== 0) throw new Error('Docker CLI is not available on PATH.');
    const compose = await run('docker.exe', ['compose', 'version'], { timeoutMs: 15000 });
    if (compose.exitCode !== 0) throw new Error('Docker Compose plugin is not available.');
    const context = await run('docker.exe', ['context', 'show'], { timeoutMs: 15000 });
    if (context.exitCode !== 0) throw new Error('Docker could not identify the selected context.');
    const endpoint = await run('docker.exe', ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'], { timeoutMs: 15000 });
    if (endpoint.exitCode !== 0) throw new Error('Docker could not identify the selected Engine endpoint.');
    const endpointValue = JSON.parse(endpoint.stdout.trim());
    if (typeof endpointValue !== 'string' || !endpointValue.toLowerCase().startsWith('npipe://')) return { ready: false, remote: true, context: context.stdout.trim(), message: `Docker context ${context.stdout.trim()} is not a local Windows Engine. Setup will not change a remote host.` };
    const server = await run('docker.exe', ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 20000 });
    if (server.exitCode !== 0) throw new Error(`Docker Engine did not respond: ${safeSummary(server.stderr)}`);
    return { ready: true, context: context.stdout.trim(), message: `Ready · ${version.stdout.trim()} · ${compose.stdout.trim()} · local context ${context.stdout.trim()} · Engine ${server.stdout.trim()}` };
  } catch (error) {
    return { ready: false, remote: false, context: '', message: safeSummary(error.message) };
  }
}

async function waitForDocker(progressCallback) {
  const winget = await ensureWinget(progressCallback);
  progressCallback('Starting the official Docker Desktop package. Review any native consent, license, or first-run prompt.');
  const installed = await run(winget, ['install', '--exact', '--id', 'Docker.DockerDesktop', '--source', 'winget', '--accept-source-agreements', '--interactive'], { timeoutMs: 45 * 60 * 1000, windowsHide: false, installProcess: true });
  if (installed.exitCode !== 0) throw new Error(`The Docker Desktop package installer returned exit code ${installed.exitCode}.`);
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'Docker Desktop.exe')
  ];
  let desktop = null;
  for (const candidate of candidates) {
    try { await fs.access(candidate); desktop = candidate; break; } catch {}
  }
  if (!desktop) throw new Error('The package manager completed, but Docker Desktop was not found in its supported locations.');
  const launch = spawn(desktop, [], { cwd: path.dirname(desktop), detached: true, stdio: 'ignore', windowsHide: false });
  launch.unref();
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    checkCancelled();
    const current = await probeDocker();
    if (current.ready) {
      state.docker = current;
      await saveState();
      return;
    }
    progressCallback(`Docker Engine is starting. Checking again (${attempt}/36). A required computer restart remains manual.`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Docker Desktop was installed, but its local Engine did not become reachable within three minutes. Finish first-run setup or any required restart manually, then reopen this assistant.');
}

function checkCancelled() {
  if (currentOperation?.cancelRequested) throw new Error('Cancellation was requested. The active installer finished; setup stopped before starting another step. Existing files and services remain in place.');
}

async function verifyComposeSource() {
  const base = `https://raw.githubusercontent.com/${OWNER_REPOSITORY}/${state.release.sourceSha}/`;
  const composeBytes = await fetchBytes(`${base}compose.yaml`, 65536, currentOperation?.abortController.signal);
  const compose = new TextDecoder('utf-8', { fatal: true }).decode(composeBytes);
  const required = ['watchdog:', '${WATCHDOG_IMAGE', 'WATCHDOG_HOST_PORT', 'WATCHDOG_HOST_BIND_IP', 'host_ip:', ': 8443', 'WATCHDOG_DATA_PATH', 'WATCHDOG_PAIRING_CODE_FILE', 'WATCHDOG_TLS_CERTIFICATE_FILE', 'WATCHDOG_TLS_CERTIFICATE_PASSWORD_FILE', 'WATCHDOG_AGENT_ENROLLMENT_CODE_FILE', '/run/secrets/watchdog_pairing_code', '/health'];
  if (required.some((value) => !compose.includes(value)) || /container_name\s*:/i.test(compose)) throw new Error('The source-pinned Compose file does not match the required service configuration.');
  const hostBat = await fetchBytes(`${base}host.bat`, 16384, currentOperation?.abortController.signal);
  const hostPs = await fetchBytes(`${base}scripts/host.ps1`, 98304, currentOperation?.abortController.signal);
  return { compose, hostBat, hostPs };
}

async function secureSecretDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  const script = `$ErrorActionPreference = 'Stop'\n$directory = ${quotePowerShell(directory)}\n$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name\n& icacls.exe $directory /inheritance:r /grant:r ($identity + ':(OI)(CI)F') | Out-Null\nif ($LASTEXITCODE -ne 0) { throw 'Could not protect the setup secret folder.' }\n`;
  const result = await powershell(script);
  if (result.exitCode !== 0) throw new Error('Windows could not apply user-only permissions to the setup secret folder.');
}

async function writeSecretFile(file, value) {
  await fs.writeFile(file, value, { encoding: 'utf8', flag: 'w', mode: 0o600 });
  const script = `$ErrorActionPreference = 'Stop'\n$file = ${quotePowerShell(file)}\n$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name\n& icacls.exe $file /inheritance:r /grant:r ($identity + ':F') | Out-Null\nif ($LASTEXITCODE -ne 0) { throw 'Could not protect a setup credential file.' }\n`;
  const result = await powershell(script);
  if (result.exitCode !== 0) throw new Error('Windows could not apply user-only permissions to a setup credential file.');
}

async function getLanIpv4Addresses() {
  const privateAddress = '^(10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2[0-9]|3[01])\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3})$';
  const script = `$ErrorActionPreference = 'Stop'\n$addresses = @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue } | Where-Object { $_.IPAddress -match '${privateAddress}' } | ForEach-Object { $_.IPAddress } | Sort-Object -Unique)\nConvertTo-Json -InputObject $addresses -Compress\n`;
  const result = await powershell(script, { timeoutMs: 15000 });
  if (result.exitCode !== 0 || !result.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout.trim());
    const addresses = Array.isArray(parsed) ? parsed : [parsed];
    return [...new Set(addresses.filter((address) => typeof address === 'string' && net.isIP(address) === 4))].sort();
  } catch { return []; }
}

function randomCode() {
  return crypto.randomBytes(24).toString('base64url');
}

async function ensureTlsMaterial() {
  const pfx = path.join(SECRET_DIR, 'watchdog_tls.pfx');
  const passwordFile = path.join(SECRET_DIR, 'watchdog_tls_password');
  const certFile = path.join(SECRET_DIR, 'watchdog_tls.cer');
  const lanAddress = state.lanBindAddress;
  if (!lanAddress || net.isIP(lanAddress) !== 4) throw new Error('Choose an active private LAN address before creating the service certificate.');
  try {
    await Promise.all([fs.access(pfx), fs.access(passwordFile), fs.access(certFile)]);
    const cert = await fs.readFile(certFile);
    const identity = new crypto.X509Certificate(cert);
    const expectedSans = new Set(['DNS:localhost', 'IP Address:127.0.0.1', `IP Address:${lanAddress}`]);
    const currentSans = new Set(String(identity.subjectAltName || '').split(/,\s*/).filter(Boolean));
    const hasOnlyCurrentNames = currentSans.size === expectedSans.size && [...expectedSans].every((name) => currentSans.has(name));
    const coversCurrentHost = Boolean(identity.checkHost('localhost'))
      && Boolean(identity.checkIP('127.0.0.1'))
      && Boolean(identity.checkIP(lanAddress))
      && hasOnlyCurrentNames;
    if (coversCurrentHost) return { pfx, passwordFile, certFile, fingerprint: sha256(cert).toUpperCase(), rotated: false };
  } catch {}
  const password = randomCode();
  await writeSecretFile(passwordFile, password);
  const san = ['DNS=localhost', 'IPAddress=127.0.0.1', `IPAddress=${lanAddress}`].join('&');
  const extensions = [
    `2.5.29.17={text}${san}`,
    '2.5.29.37={text}1.3.6.1.5.5.7.3.1'
  ].map(quotePowerShell).join(',');
  const script = `$ErrorActionPreference = 'Stop'\n$password = ([IO.File]::ReadAllText(${quotePowerShell(passwordFile)})).Trim()\n$secure = ConvertTo-SecureString $password -AsPlainText -Force\n$extensions = @(${extensions})\n$cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -TextExtension $extensions -KeyUsage DigitalSignature,KeyEncipherment -CertStoreLocation 'Cert:\\CurrentUser\\My' -FriendlyName 'Watchdog Control Setup' -KeyExportPolicy Exportable -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(2)\ntry { Export-PfxCertificate -Cert $cert -FilePath ${quotePowerShell(pfx)} -Password $secure -Force | Out-Null; Export-Certificate -Cert $cert -FilePath ${quotePowerShell(certFile)} -Type CERT -Force | Out-Null } finally { Remove-Item -LiteralPath (Join-Path 'Cert:\\CurrentUser\\My' $cert.Thumbprint) -Force -ErrorAction SilentlyContinue }\n`;
  const result = await powershell(script, { timeoutMs: 60000 });
  if (result.exitCode !== 0) throw new Error(`TLS certificate creation failed: ${safeSummary(result.stderr || result.stdout)}`);
  const certificate = await fs.readFile(certFile);
  return { pfx, passwordFile, certFile, fingerprint: sha256(certificate).toUpperCase(), rotated: true };
}

async function isHostPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ host: state.lanBindAddress, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function prepareComposeDirectory(release) {
  const requested = path.resolve(state.composeDirectory || DEFAULT_COMPOSE);
  let destination = requested;
  const markerPath = path.join(destination, '.watchdog-control-setup.json');
  let owned = false;
  try {
    const marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
    owned = marker?.schemaVersion === 1 && marker?.owner === 'WatchdogControlSetup' && marker?.sourceSha === release.sourceSha;
  } catch {}
  if (await fs.access(destination).then(() => true).catch(() => false) && !owned) {
    destination = path.join(path.dirname(requested), `service-${release.tag}-${release.sourceSha.slice(0, 12)}`);
    const existingMarker = path.join(destination, '.watchdog-control-setup.json');
    try {
      const marker = JSON.parse(await fs.readFile(existingMarker, 'utf8'));
      owned = marker?.schemaVersion === 1 && marker?.owner === 'WatchdogControlSetup' && marker?.sourceSha === release.sourceSha;
    } catch { owned = false; }
    if (await fs.access(destination).then(() => true).catch(() => false) && !owned) {
      destination = path.join(path.dirname(requested), `service-${release.tag}-${release.sourceSha.slice(0, 12)}-${Date.now()}`);
    }
  }
  await fs.mkdir(destination, { recursive: true });
  state.composeDirectory = destination;
  const marker = { schemaVersion: 1, owner: 'WatchdogControlSetup', releaseTag: release.tag, sourceSha: release.sourceSha };
  await fs.writeFile(path.join(destination, '.watchdog-control-setup.json'), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  await saveState();
}

async function composeEnvironment(directory, values) {
  const names = ['WATCHDOG_IMAGE', 'WATCHDOG_HOST_PORT', 'WATCHDOG_HOST_BIND_IP', 'WATCHDOG_DATA_PATH', 'WATCHDOG_TLS_CERTIFICATE_HOST_FILE', 'WATCHDOG_TLS_PASSWORD_HOST_FILE', 'WATCHDOG_PAIRING_CODE_HOST_FILE', 'WATCHDOG_AGENT_ENROLLMENT_CODE_HOST_FILE'];
  const lines = [];
  for (const name of names) {
    const value = String(values[name] ?? '');
    if (!value || /[\r\n]/.test(value)) throw new Error(`Required setup value ${name} is missing or invalid.`);
    lines.push(`${name}="${value.replace(/\\/g, '/').replace(/\$/g, '$$').replace(/"/g, '\\"')}"`);
  }
  await fs.writeFile(path.join(directory, '.env'), `${lines.join(os.EOL)}${os.EOL}`, { encoding: 'utf8', mode: 0o600 });
}

async function compose(args) {
  return run('docker.exe', ['compose', '--env-file', '.env', '-p', 'watchdog-control', '-f', 'compose.yaml', ...args], { cwd: state.composeDirectory, timeoutMs: 20 * 60 * 1000, windowsHide: false });
}

async function healthCheck(address, port, fingerprint) {
  return new Promise((resolve) => {
    const request = https.request({ hostname: address, port, path: '/health', method: 'GET', rejectUnauthorized: false, timeout: 4000 }, (response) => {
      const peer = request.socket.getPeerCertificate();
      const actual = String(peer.fingerprint256 || '').replaceAll(':', '').toUpperCase();
      const identityError = tlsModule.checkServerIdentity(address, peer);
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 300 && actual === fingerprint && !identityError);
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
    request.end();
  });
}

async function waitForHealth(port, fingerprint) {
  const end = Date.now() + 90000;
  let attempt = 0;
  while (Date.now() < end) {
    checkCancelled();
    attempt += 1;
    progress('Waiting for HTTPS health', `Checking the pinned certificate and /health endpoint (${attempt}).`);
    if (await healthCheck('127.0.0.1', port, fingerprint)) return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('The service did not pass the pinned-certificate HTTPS health check within 90 seconds. It may still be running; setup did not remove it.');
}

async function verifyLanUrl(port, fingerprint, address) {
  checkCancelled();
  if (!address || !(await getLanIpv4Addresses()).includes(address)) return null;
  if (await healthCheck(address, port, fingerprint)) return `https://${address}:${port}/`;
  return null;
}

async function exportPublicCertificate() {
  if (!state.verified || !state.certificateFingerprint) throw new Error('Complete and verify service setup before exporting its public certificate.');
  const certificatePath = path.join(SECRET_DIR, 'watchdog_tls.cer');
  const certificateBytes = await fs.readFile(certificatePath);
  const certificate = new crypto.X509Certificate(certificateBytes);
  let lanAddress = '';
  try { lanAddress = new URL(state.lanUrl).hostname; } catch {}
  if (sha256(certificateBytes).toUpperCase() !== state.certificateFingerprint || !certificate.checkHost('localhost') || net.isIP(lanAddress) !== 4 || !certificate.checkIP(lanAddress)) {
    throw new Error('The saved public certificate no longer matches the verified setup. Rerun setup before exporting it.');
  }
  const selection = await dialog.showSaveDialog(mainWindow, {
    title: 'Export the public TLS certificate',
    buttonLabel: 'Export certificate',
    defaultPath: path.join(app.getPath('downloads'), 'Watchdog-Control-public.cer'),
    filters: [{ name: 'Public certificate', extensions: ['cer'] }]
  });
  if (selection.canceled || !selection.filePath) return { canceled: true };
  const destination = path.extname(selection.filePath).toLowerCase() === '.cer' ? selection.filePath : `${selection.filePath}.cer`;
  await fs.writeFile(destination, certificateBytes);
  return { exported: true, fileName: path.basename(destination) };
}

async function downloadAgent() {
  const release = await fetchJson(`https://api.github.com/repos/${OWNER_REPOSITORY}/releases/latest`);
  if (release.draft || release.prerelease || release.tag_name !== state.release.tag) throw new Error('The product release changed during setup.');
  const asset = (release.assets || []).find((item) => item.name === 'watchdog-agent-win-x64.exe');
  if (!asset || asset.browser_download_url !== `https://github.com/${OWNER_REPOSITORY}/releases/download/${state.release.tag}/watchdog-agent-win-x64.exe`) throw new Error('The release has no expected Windows host-agent file.');
  return downloadVerifiedAsset(asset, state.composeDirectory, 128 * 1024 * 1024);
}

function psUtf8Literal(value) {
  return `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(String(value), 'utf8').toString('base64')}'))`;
}

function windowsQuote(value) {
  let output = '"';
  let slashes = 0;
  for (const character of String(value)) {
    if (character === '\\') { slashes += 1; continue; }
    if (character === '"') { output += '\\'.repeat(slashes * 2 + 1) + '"'; slashes = 0; continue; }
    output += '\\'.repeat(slashes) + character;
    slashes = 0;
  }
  output += '\\'.repeat(slashes * 2) + '"';
  return output;
}

async function installAgent() {
  try {
    const agentPath = await downloadAgent();
    const digest = sha256(await fs.readFile(agentPath));
    const args = ['install', '--controller-url', state.lanUrl, '--certificate-sha256', state.certificateFingerprint, '--enrollment-code-file', path.join(SECRET_DIR, 'watchdog_agent_enrollment_code')].map(windowsQuote).join(' ');
    const script = `$ErrorActionPreference = 'Stop'\n$sourcePath = ${psUtf8Literal(agentPath)}\n$expected = ${psUtf8Literal(digest)}\n$agentArguments = ${psUtf8Literal(args)}\n` +
      `function Get-Hash([IO.Stream]$stream) { $sha = [Security.Cryptography.SHA256]::Create(); try { $builder = New-Object Text.StringBuilder; foreach ($byte in $sha.ComputeHash($stream)) { [void]$builder.Append($byte.ToString('x2')) }; $builder.ToString() } finally { $sha.Dispose() } }\n` +
      `$exit = 1; $dir = $null; $src = $null; $dst = $null; $child = $null\ntry { $pf = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles); $dir = Join-Path $pf ('WatchdogControlSetup-' + [Guid]::NewGuid().ToString('N')); [IO.Directory]::CreateDirectory($dir) | Out-Null; $admin = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544'); $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18'); $users = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545'); $acl = New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner($admin); $inherit = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit; $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($system,[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)); $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($admin,[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)); $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($users,[Security.AccessControl.FileSystemRights]::ReadAndExecute,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)); [IO.Directory]::SetAccessControl($dir,$acl); $source = [IO.File]::Open($sourcePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read); if ($source.Length -lt 10485760 -or $source.Length -gt 134217728) { throw 'Agent size outside bounds.' }; if ((Get-Hash $source) -cne $expected) { throw 'Agent source digest changed.' }; $source.Position = 0; $targetPath = Join-Path $dir 'watchdog-agent.exe'; $dst = [IO.File]::Open($targetPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None); $source.CopyTo($dst); $dst.Flush($true); $dst.Dispose(); $dst = $null; $source.Dispose(); $source = $null; $f = New-Object Security.AccessControl.FileSecurity; $f.SetAccessRuleProtection($true,$false); $f.SetOwner($admin); $f.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($system,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow)); $f.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($admin,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow)); $f.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($users,[Security.AccessControl.FileSystemRights]::ReadAndExecute,[Security.AccessControl.AccessControlType]::Allow)); [IO.File]::SetAccessControl($targetPath,$f); $check = [IO.File]::OpenRead($targetPath); $actual = Get-Hash $check; $check.Dispose(); if ($actual -cne $expected) { throw 'Protected agent copy digest mismatch.' }; $start = New-Object Diagnostics.ProcessStartInfo; $start.FileName = $targetPath; $start.Arguments = $agentArguments; $start.UseShellExecute = $false; $start.CreateNoWindow = $true; $start.WorkingDirectory = $dir; $child = [Diagnostics.Process]::Start($start); if ($null -eq $child) { throw 'Agent setup process did not start.' }; $child.WaitForExit(); $exit = $child.ExitCode } catch { $exit = 1 } finally { if ($child) { $child.Dispose() }; if ($dst) { $dst.Dispose() }; if ($source) { $source.Dispose() }; if ($dir -and [IO.Directory]::Exists($dir)) { try { [IO.Directory]::Delete($dir,$true) } catch {} } }; exit $exit\n`;
    const elevate = `Start-Process -FilePath $env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand','${encodePowerShell(script)}') | ForEach-Object { exit $_.ExitCode }`;
    const result = await powershell(elevate, { timeoutMs: 15 * 60 * 1000, installProcess: true, windowsHide: false });
    if (result.exitCode !== 0) throw new Error(`The protected host-agent setup returned exit code ${result.exitCode}.`);
    await fs.rm(path.join(SECRET_DIR, 'watchdog_agent_enrollment_code'), { force: true });
    state.agentStatus = 'Installed. The host agent enrolled through the fingerprint-pinned controller connection.';
  } catch (error) {
    state.agentStatus = `Pending. ${safeSummary(error.message)} The dashboard remains installed and running.`;
  }
}

async function executeInstall() {
  if (currentOperation) throw new Error('Another setup operation is already running.');
  if (state.requiresStorageSelection && (!state.storageDirectory || !state.storageChoiceConfirmed)) throw new Error('Choose and confirm the existing data folder or a new empty folder before starting.');
  if (!Number.isInteger(Number(state.hostPort)) || state.hostPort < 1024 || state.hostPort > 65535) throw new Error('Choose a host port from 1024 to 65535 before starting.');
  if (!state.startConfirmed) throw new Error('Review the destination and confirm setup before starting.');
  if (state.manageThisComputer && !state.agentConsent) throw new Error('The optional machine-wide host agent needs its separate consent checkbox.');
  currentOperation = { cancelRequested: false, abortController: new AbortController(), child: null };
  state.verified = false;
  state.summary = 'Setup started.';
  state.lastStep = 5;
  await saveState();
  try {
    progress('Checking release', 'Verifying the normal release manifest, immutable image digest, and source tag.');
    state.release = await getProductRelease();
    state.releaseError = null;
    await saveState();
    checkCancelled();
    state.docker = await probeDocker();
    if (state.docker.remote) throw new Error(state.docker.message);
    if (!state.docker.ready) {
      progress('Installing missing prerequisites', 'No local Docker Engine is ready. The assistant is resolving the supported package-manager and Docker Desktop route.');
      await waitForDocker((message) => progress('Prerequisite setup', message));
    }
    checkCancelled();
    const addresses = await getLanIpv4Addresses();
    state.lanAddresses = addresses;
    if (!addresses.length) throw new Error('No active physical network adapter has a private IPv4 address. Connect this computer to the intended LAN, reopen setup, and try again.');
    if (!addresses.includes(state.lanBindAddress)) {
      state.lanBindAddress = addresses[0];
      state.startConfirmed = false;
      await saveState();
      throw new Error('The selected LAN address changed. Review the updated destination before starting setup again.');
    }
    if (!state.serviceStarted && !await isHostPortAvailable(Number(state.hostPort))) throw new Error(`HTTPS host port ${state.hostPort} is already in use on ${state.lanBindAddress}. Choose another unused port or interface and retry.`);
    progress('Preparing service files', 'Downloading Compose and host-control files from the release source revision.');
    const setupFiles = await verifyComposeSource();
    await prepareComposeDirectory(state.release);
    await fs.mkdir(state.storageDirectory, { recursive: true });
    await fs.writeFile(path.join(state.composeDirectory, 'compose.yaml'), setupFiles.compose, 'utf8');
    await fs.writeFile(path.join(state.composeDirectory, 'host.bat'), setupFiles.hostBat);
    await fs.mkdir(path.join(state.composeDirectory, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(state.composeDirectory, 'scripts', 'host.ps1'), setupFiles.hostPs);
    await secureSecretDirectory(SECRET_DIR);
    const pairingFile = path.join(SECRET_DIR, 'watchdog_pairing_code');
    const enrollmentFile = path.join(SECRET_DIR, 'watchdog_agent_enrollment_code');
    let pairingCode = null;
    try { pairingCode = (await fs.readFile(pairingFile, 'utf8')).trim(); } catch { pairingCode = randomCode(); await writeSecretFile(pairingFile, pairingCode); }
    try { await fs.access(enrollmentFile); } catch { await writeSecretFile(enrollmentFile, randomCode()); }
    const tls = await ensureTlsMaterial();
    state.certificateFingerprint = tls.fingerprint;
    const env = {
      WATCHDOG_IMAGE: state.release.image,
      WATCHDOG_HOST_PORT: String(state.hostPort),
      WATCHDOG_HOST_BIND_IP: state.lanBindAddress,
      WATCHDOG_DATA_PATH: state.storageDirectory,
      WATCHDOG_TLS_CERTIFICATE_HOST_FILE: tls.pfx,
      WATCHDOG_TLS_PASSWORD_HOST_FILE: tls.passwordFile,
      WATCHDOG_PAIRING_CODE_HOST_FILE: pairingFile,
      WATCHDOG_AGENT_ENROLLMENT_CODE_HOST_FILE: enrollmentFile
    };
    await composeEnvironment(state.composeDirectory, env);
    stateChanged({ release: state.release, docker: state.docker, certificateFingerprint: tls.fingerprint, lanBindAddress: state.lanBindAddress, lanAddresses: addresses });
    progress('Validating Compose configuration', 'The assistant checks the rendered configuration before pulling the image.');
    const config = await compose(['config', '--quiet']);
    if (config.exitCode !== 0) throw new Error(`Compose configuration validation returned exit code ${config.exitCode}: ${safeSummary(config.stderr)}`);
    checkCancelled();
    progress('Pulling the release image', 'Pulling only the immutable Watchdog Control image digest.');
    const pull = await compose(['pull', 'watchdog']);
    if (pull.exitCode !== 0) throw new Error(`Image pull returned exit code ${pull.exitCode}: ${safeSummary(pull.stderr)}`);
    checkCancelled();
    progress('Starting Watchdog Control', 'Starting only the Watchdog Control service. No other Compose project is modified.');
    const up = await compose(tls.rotated ? ['up', '-d', '--force-recreate', 'watchdog'] : ['up', '-d', 'watchdog']);
    if (up.exitCode !== 0) throw new Error(`Service start returned exit code ${up.exitCode}: ${safeSummary(up.stderr)}`);
    state.serviceStarted = true;
    await saveState();
    await waitForHealth(state.hostPort, tls.fingerprint);
    progress('Checking the host LAN address', 'Checking the selected physical LAN IPv4 address against the pinned HTTPS endpoint and certificate identity.');
    const lanUrl = await verifyLanUrl(state.hostPort, tls.fingerprint, state.lanBindAddress);
    if (!lanUrl) throw new Error('Loopback health passed, but the host could not verify a LAN-interface health response. The service remains running. Check firewall and network binding.');
    state.lanUrl = lanUrl;
    state.verified = true;
    if (state.manageThisComputer && state.agentConsent) await installAgent();
    else if (state.manageThisComputer) state.agentStatus = 'Pending. Separate machine-wide service consent was not recorded.';
    state.pairingCodeShown = true;
    state.summary = 'The service passed release, Compose, image pull, HTTPS health, and local LAN-interface checks. A separate device check is still needed for another LAN client.';
    await saveState();
    return { ...publicState(), pairingCode };
  } catch (error) {
    state.verified = false;
    state.summary = safeSummary(error.message);
    await saveState().catch(() => {});
    throw new Error(state.summary);
  } finally {
    currentOperation = null;
  }
}

function validateSettings(value) {
  const port = Number(value.hostPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose an unused HTTPS host port from 1024 to 65535.');
  const lanBindAddress = String(value.lanBindAddress || '');
  if (!state.lanAddresses.includes(lanBindAddress)) throw new Error('Choose an active private LAN address for the service.');
  const rawStorageDirectory = String(value.storageDirectory || '');
  if (!rawStorageDirectory && !state.requiresStorageSelection) throw new Error('Choose a valid local data folder.');
  const storageDirectory = rawStorageDirectory ? path.resolve(rawStorageDirectory) : '';
  if ((storageDirectory && storageDirectory.length < 4) || storageDirectory.includes('\0')) throw new Error('Choose a valid local data folder.');
  return {
    hostPort: port,
    lanBindAddress,
    storageDirectory,
    manageThisComputer: Boolean(value.manageThisComputer),
    startConfirmed: Boolean(value.startConfirmed),
    agentConsent: Boolean(value.agentConsent),
    storageChoiceConfirmed: Boolean(value.storageChoiceConfirmed)
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 640,
    minHeight: 500,
    backgroundColor: '#edf1f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== `file://${path.join(__dirname, 'dist', 'index.html').replaceAll('\\', '/')}`) event.preventDefault();
  });
  mainWindow.on('close', (event) => {
    if (currentOperation) {
      event.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Wait for setup', 'Request cancellation'],
        defaultId: 0,
        cancelId: 0,
        title: 'Setup is still running',
        message: 'The assistant is working on the selected host. Closing now could interrupt progress.',
        detail: 'A package installer already in progress will be allowed to finish before cancellation takes effect.'
      }).then(({ response }) => {
        if (response === 1 && currentOperation) currentOperation.cancelRequested = true;
      });
    }
  });
}

app.whenReady().then(() => {
  ipcMain.handle('setup:load-state', async () => loadState());
  ipcMain.handle('setup:get-build-info', async () => {
    try {
      const value = JSON.parse(await fs.readFile(path.join(__dirname, 'build-provenance.json'), 'utf8'));
      if (value.schemaVersion === 1 && typeof value.version === 'string' && Number.isFinite(Date.parse(value.builtAtUtc))) return value;
    } catch {}
    return { schemaVersion: 1, version: 'unavailable', builtAtUtc: null };
  });
  ipcMain.handle('setup:save-settings', async (_event, value) => {
    const previousPort = state.hostPort;
    const previousStorage = state.storageDirectory;
    const previousLanBindAddress = state.lanBindAddress;
    Object.assign(state, validateSettings(value));
    if (state.hostPort !== previousPort || state.storageDirectory !== previousStorage || state.lanBindAddress !== previousLanBindAddress) state.startConfirmed = false;
    await saveState();
    return publicState();
  });
  ipcMain.handle('setup:save-progress', async (_event, value) => {
    const lastStep = Number(value?.lastStep);
    if (!Number.isInteger(lastStep) || lastStep < 0 || lastStep > 5) throw new Error('The requested setup step is invalid.');
    state.lastStep = lastStep;
    await saveState();
    return publicState();
  });
  ipcMain.handle('setup:choose-storage', async () => {
    const selection = await dialog.showOpenDialog(mainWindow, { title: 'Choose the persistent data folder', properties: ['openDirectory', 'createDirectory'] });
    return selection.canceled ? null : selection.filePaths[0];
  });
  ipcMain.handle('setup:preserve-progress', async () => preserveUnreadableProgress());
  ipcMain.handle('setup:check-docker', async () => {
    state.docker = await probeDocker();
    await saveState();
    return state.docker;
  });
  ipcMain.handle('setup:install', async () => executeInstall());
  ipcMain.handle('setup:cancel', async () => {
    if (currentOperation) {
      currentOperation.cancelRequested = true;
      currentOperation.abortController.abort();
      return true;
    }
    return false;
  });
  ipcMain.handle('setup:retry-agent', async () => {
    if (!state.verified || !state.lanUrl || !state.certificateFingerprint) throw new Error('The dashboard must be verified before retrying host-agent setup.');
    await installAgent();
    await saveState();
    return publicState();
  });
  ipcMain.handle('setup:export-certificate', async () => exportPublicCertificate());
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
