const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createTlsServices } = require('./tls.cjs');

test('cold network discovery retries once and reports exhausted discovery distinctly from no adapters', async () => {
  let calls = 0;
  const recovered = createTlsServices({ powershell: async () => ++calls === 1 ? { exitCode: 1, stdout: '' } : { exitCode: 0, stdout: '["172.31.16.85"]' } });
  assert.deepEqual(await recovered.getLanIpv4Addresses(), ['172.31.16.85']);
  assert.equal(calls, 2);
  calls = 0;
  const unavailable = createTlsServices({ powershell: async () => { calls++; return { exitCode: 1, stdout: '' }; } });
  await assert.rejects(unavailable.getLanIpv4Addresses(), /after two attempts/);
  assert.equal(calls, 2);
  const empty = createTlsServices({ powershell: async () => ({ exitCode: 0, stdout: '[]' }) });
  assert.deepEqual(await empty.getLanIpv4Addresses(), []);
});

test('actual navigation handlers admit destination selection and surface save failures without moving the step', async () => {
  const source = await fs.readFile(path.join(__dirname, '../src/main.js'), 'utf8');
  const handlers = source.slice(source.indexOf('let navigationBusy = false;'), source.indexOf("cancelButton.addEventListener('click'"));
  const listeners = {}; const statuses = []; let saves = 0;
  const button = name => ({ addEventListener: (_event, callback) => { listeners[name] = callback; } });
  const context = vm.createContext({ step: 0, state: { lanAddresses: [], lanBindAddress: '' },
    nextButton: button('next'), backButton: button('back'), installButton: button('install'),
    status: (...args) => statuses.push(args), render: () => {},
    persistSettings: async () => { saves++; throw new Error('Select a private interface.'); },
    window: { watchdogSetup: { saveProgress: async value => ({ lanAddresses: [], lastStep: value.lastStep }) } }
  });
  vm.runInContext(handlers, context);
  await listeners.next();
  assert.equal(context.step, 1); assert.equal(saves, 0);
  await listeners.next();
  assert.equal(context.step, 1); assert.equal(saves, 1);
  assert.match(statuses.at(-1)[1], /Select a private interface/);
  await listeners.back(); assert.equal(context.step, 1);
  context.step = 4;
  await listeners.install(); assert.equal(context.step, 4);
  assert.equal(statuses.length, 3);
});

test('overlapping actual state saves are serialized and leave the latest requested progress', async () => {
  const source = await fs.readFile(path.join(__dirname, '../main.cjs'), 'utf8');
  const implementation = source.slice(source.indexOf('async function saveState()'), source.indexOf('async function preserveUnreadableProgress()'));
  const files = new Map(); const replacements = []; let sequence = 0;
  const context = vm.createContext({ state: { lastStep: 1 }, MAX_STATE_BYTES: 32768, USER_DATA: '/owned/state.json', Buffer,
    path, crypto: { randomUUID: () => String(++sequence) }, stateSaveQueue: Promise.resolve(),
    fs: { mkdir: async () => {}, writeFile: async (file, bytes) => { await new Promise(resolve => setTimeout(resolve, 10)); files.set(file, bytes); },
      rename: async (from, to) => { files.set(to, files.get(from)); replacements.push(JSON.parse(files.get(from)).lastStep); files.delete(from); },
      rm: async file => { files.delete(file); } }
  });
  vm.runInContext(implementation, context);
  const first = context.saveState(); context.state = { lastStep: 2 }; const second = context.saveState();
  await Promise.all([first, second]);
  assert.deepEqual(replacements, [1, 2]);
  assert.equal(JSON.parse(files.get('/owned/state.json')).lastStep, 2);
  assert.equal(files.size, 1);
});
