#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
}

function findLocalRunner() {
  const candidates = [
    path.join(homedir(), '.agents', 'skills', 'agent-global-memory', 'scripts', 'run-publication-language-local.mjs'),
  ];

  if (process.platform === 'win32') {
    try {
      const documents = execFileSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetFolderPath('MyDocuments')",
      ], { encoding: 'utf8', windowsHide: true }).trim();
      if (documents) candidates.push(path.join(documents, 'GitHub', 'agent-global-memory', 'scripts', 'run-publication-language-local.mjs'));
    } catch {
      // The home-directory skill route remains available when Documents discovery is unavailable.
    }
  } else {
    candidates.push(path.join(homedir(), 'Documents', 'GitHub', 'agent-global-memory', 'scripts', 'run-publication-language-local.mjs'));
  }

  return candidates.find(candidate => existsSync(candidate));
}

function privateSourcePresent() {
  const roots = [path.join(homedir(), 'Documents', 'GitHub', 'agent-global-memory')];
  if (process.platform === 'win32') {
    try {
      const documents = execFileSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetFolderPath('MyDocuments')",
      ], { encoding: 'utf8', windowsHide: true }).trim();
      if (documents) roots.push(path.join(documents, 'GitHub', 'agent-global-memory'));
    } catch {
      // Treat an unavailable location query as unknown and use the remaining candidate.
    }
  }
  return roots.some(root => existsSync(path.join(root, 'memory', 'vocabulary-dictionary.json')));
}

async function stdinBytes() {
  const parts = [];
  for await (const part of process.stdin) parts.push(Buffer.from(part));
  return Buffer.concat(parts);
}

async function main() {
  const mode = process.argv[2];
  if (!['pre-commit', 'pre-push'].includes(mode)) throw new Error('Unsupported hook mode.');

  const repo = git(['rev-parse', '--show-toplevel']);
  const runner = findLocalRunner();
  if (!runner) {
    if (privateSourcePresent()) {
      process.stderr.write('Publication-language source is present but its local runner is unavailable; stopping this operation.\n');
      process.exitCode = 2;
      return;
    }
    process.stdout.write('Publication-language scan skipped because no local policy source is installed.\n');
    return;
  }

  const args = [runner, '--root', repo];
  if (mode === 'pre-commit') args.push('--mode', 'index');
  else {
    const remoteName = process.argv[3];
    const remoteLocation = process.argv[4];
    if (!remoteName || !remoteLocation) throw new Error('The pre-push remote identity is incomplete.');
    args.push('--mode', 'outgoing', '--remote-name', remoteName, '--remote-location', remoteLocation);
  }

  const result = spawnSync(process.execPath, args, {
    cwd: repo,
    input: mode === 'pre-push' ? await stdinBytes() : undefined,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.signal || result.status === null) {
    process.stderr.write('Publication-language runner did not complete; stopping this operation.\n');
    process.exitCode = 2;
    return;
  }
  process.exitCode = result.status;
}

main().catch(error => {
  process.stderr.write(`Publication-language hook could not complete (${error?.message || 'unknown error'}).\n`);
  process.exitCode = 2;
});
