const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { webhookUrl, sendNotification } = require('./notification.cjs');

function protect(value, decrypt = false) {
  if (process.platform !== 'win32') throw new Error('Windows credential protection is required.');
  const expression = decrypt
    ? "[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($inputValue),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"
    : "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($inputValue),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
  const script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $inputValue=[Console]::In.ReadToEnd(); try { [Console]::Out.Write(" + expression + ") } catch { exit 1 }";
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = ''; const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', data => { output += data.toString('utf8'); if (output.length > 16384) child.kill(); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Protected credential storage is unavailable.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 && output ? resolve(output) : reject(new Error('Protected credential operation failed.')); });
    child.stdin.on('error', () => {});
    child.stdin.end(value);
  });
}

function credentialStore(directory, crypt = protect) {
  const file = path.join(directory, 'discord-webhook.dpapi');
  return {
    async configured() { try { return (await fs.stat(file)).size > 0; } catch { return false; } },
    async save(value) {
      const encrypted = await crypt(webhookUrl(value));
      await fs.writeFile(`${file}.new`, encrypted, { mode: 0o600 });
      await fs.rename(`${file}.new`, file);
      return { configured: true };
    },
    async remove() { await fs.rm(file, { force: true }); return { configured: false }; },
    async send(publicUrl, test = false) {
      return sendNotification(async () => {
        const info = await fs.stat(file);
        if (info.size > 16384) throw new Error('Protected credential record is invalid.');
        return crypt(await fs.readFile(file, 'utf8'), true);
      }, publicUrl, test);
    }
  };
}
module.exports = { webhookUrl, credentialStore };
