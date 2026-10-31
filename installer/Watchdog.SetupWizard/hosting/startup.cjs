const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const run = promisify(execFile);
const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const name = 'WatchdogControlHost';

function startupCommand(runtime, configPath) {
  const paths = [path.join(runtime, 'tools/node.exe'), path.join(runtime, 'hosting/supervisor.cjs'), configPath];
  if (paths.some(value => /["\r\n\0]/.test(value) || !path.isAbsolute(value))) throw new Error('The owned startup paths are invalid.');
  return paths.map(value => `"${value}"`).join(' ');
}
async function query() {
  const script = "$ErrorActionPreference='Stop'; try { $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Run'); if ($null -eq $key) { [Console]::Out.Write('null') } else { try { $value=$key.GetValue('WatchdogControlHost',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); if ($null -eq $value) { [Console]::Out.Write('null') } elseif ($key.GetValueKind('WatchdogControlHost') -ne [Microsoft.Win32.RegistryValueKind]::String) { exit 2 } else { $value | ConvertTo-Json -Compress } } finally { $key.Dispose() } } } catch { exit 1 }";
  try {
    const result = await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, maxBuffer: 16384 });
    return JSON.parse(result.stdout.trim());
  } catch { throw new Error('The user startup entry could not be read.'); }
}

async function configureStartup(directory, runtime, enabled) {
  const recordPath = path.join(directory, 'startup-owner.json');
  const command = startupCommand(runtime, path.join(directory, 'config.json'));
  const launcher = path.join(directory, 'startup.vbs');
  const script = 'CreateObject("WScript.Shell").Run "' + command.replaceAll('"', '""') + '", 0, False\r\n';
  const scriptDigest = crypto.createHash('sha256').update(script).digest('hex');
  const expected = `"${path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/wscript.exe')}" //B "${launcher}"`;
  const current = await query();
  let previous = null;
  try { previous = JSON.parse(await fs.readFile(recordPath, 'utf8')); } catch {}
  if (current && current !== expected && current !== previous?.command) throw new Error('The startup entry is owned by another configuration and was preserved.');
  if (enabled) {
    let existing;
    try { existing = crypto.createHash('sha256').update(await fs.readFile(launcher)).digest('hex'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing && existing !== previous?.scriptDigest && existing !== scriptDigest) throw new Error('An unrecognized startup launcher was preserved.');
    await fs.writeFile(launcher, script, { mode: 0o600 });
    if (crypto.createHash('sha256').update(await fs.readFile(launcher)).digest('hex') !== scriptDigest) throw new Error('The startup launcher did not match its readback.');
  }
  if (enabled) await run('reg.exe', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', expected, '/f'], { windowsHide: true, timeout: 15000 });
  else if (current) await run('reg.exe', ['delete', key, '/v', name, '/f'], { windowsHide: true, timeout: 15000 });
  if (await query() !== (enabled ? expected : null)) throw new Error('The startup entry did not match its readback.');
  await fs.writeFile(recordPath, JSON.stringify({ command: expected, enabled, scriptDigest }), { mode: 0o600 });
  return { enabled, verified: true };
}
async function startupStatus(directory) {
  try {
    const owned = JSON.parse(await fs.readFile(path.join(directory, 'startup-owner.json'), 'utf8'));
    const actual = await query();
    const launcherMatches = !owned.enabled || crypto.createHash('sha256').update(await fs.readFile(path.join(directory, 'startup.vbs'))).digest('hex') === owned.scriptDigest;
    return { enabled: actual === owned.command, verified: launcherMatches && actual === (owned.enabled ? owned.command : null) };
  } catch { return { enabled: false, verified: false }; }
}
module.exports = { startupCommand, configureStartup, startupStatus };
