const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');

function createTlsServices({ getState, secretDirectory, powershell, quotePowerShell, sha256, safeSummary }) {
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
  const pfx = path.join(secretDirectory, 'watchdog_tls.pfx');
  const passwordFile = path.join(secretDirectory, 'watchdog_tls_password');
  const certFile = path.join(secretDirectory, 'watchdog_tls.cer');
  const lanAddress = getState().lanBindAddress;
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
    if (coversCurrentHost && Date.parse(identity.validTo) > Date.now() + 86400000 && Date.parse(identity.validFrom) <= Date.now()) return { pfx, passwordFile, certFile, fingerprint: sha256(cert).toUpperCase(), rotated: false };
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
    server.listen({ host: getState().lanBindAddress, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

return { secureSecretDirectory, writeSecretFile, getLanIpv4Addresses, randomCode, ensureTlsMaterial, isHostPortAvailable };
}
module.exports = { createTlsServices };
