const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runProbe } = require('./endpoint-verifier.cjs');

async function fixture(t, source) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'watchdog-probe-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const script = path.join(directory, 'probe.cjs');
  await fs.writeFile(script, source);
  return script;
}
test('child receives public request on stdin and returns only validated result fields', async t => {
  const script = await fixture(t, `let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const value=JSON.parse(input);if(value.origin!=='https://localhost:8443'||value.ca!=='public-ca')process.exit(1);process.stdout.write(JSON.stringify({version:'1.2.3',verifiedAt:new Date().toISOString(),extra:'must not escape'}));});`);
  const result = await runProbe(process.execPath, script, {origin:'https://localhost:8443',ca:'public-ca'});
  assert.deepEqual(Object.keys(result).sort(), ['verifiedAt','version']);
  assert.equal(result.version,'1.2.3');
});
test('deadline terminates an unresponsive owned probe', async t => {
  const script = await fixture(t, 'setInterval(()=>{},1000);');
  await assert.rejects(runProbe(process.execPath, script, {}, {timeout:100}), /Secure endpoint verification did not complete/);
});
test('cancellation terminates an active owned probe', async t => {
  const script = await fixture(t, 'setInterval(()=>{},1000);');
  const start=Date.now();
  await assert.rejects(runProbe(process.execPath, script, {}, {checkCancelled(){if(Date.now()-start>120)throw new Error('cancelled');}}), /Secure endpoint verification did not complete/);
});
test('untrusted oversized output and child diagnostics never escape', async t => {
  const script = await fixture(t, `process.stderr.write('private diagnostic');process.stdout.write('x'.repeat(2048));setInterval(()=>{},1000);`);
  await assert.rejects(runProbe(process.execPath,script,{}), error=>error.message==='Secure endpoint verification did not complete.');
});
test('probe rejects credential-bearing origins without echoing input', async () => {
  await assert.rejects(runProbe(process.execPath,path.join(__dirname,'endpoint-probe.cjs'),{origin:'https://user:password@localhost/',ca:'-----BEGIN CERTIFICATE-----'}), error=>error.message==='Secure endpoint verification did not complete.');
});
