const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const execute = promisify(execFile);

async function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  const script = `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if ($null -ne $p) { if (!$p.ExecutablePath -or !$p.CreationDate) { exit 2 }; @{pid=[int]$p.ProcessId; executable=$p.ExecutablePath; startedAt=$p.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress }`;
  try {
    const result = await execute(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  } catch { throw new Error('The registered process identity could not be verified.'); }
}
function sameProcess(recorded, current) {
  return Boolean(recorded && current && recorded.pid === current.pid && recorded.startedAt === current.startedAt
    && typeof recorded.executable === 'string' && recorded.executable.toLowerCase() === current.executable.toLowerCase());
}
module.exports = { processIdentity, sameProcess };
