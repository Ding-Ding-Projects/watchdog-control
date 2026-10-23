import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const provenance = {
  schemaVersion: 1,
  version: metadata.version,
  builtAtUtc: new Date().toISOString()
};
await writeFile(resolve(root, 'build-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
const destination = resolve(root, 'public', 'build-provenance.json');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
