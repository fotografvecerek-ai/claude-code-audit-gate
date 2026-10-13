import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tools = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.resolve(tools, '..', '..', '.tmp', 'tasks', 'K-005');
fs.mkdirSync(evidence, { recursive: true });
const temp = fs.mkdtempSync(path.join(evidence, 'ssot-prototype-'));
const fixture = path.join(temp, 'fixture'); fs.mkdirSync(fixture);
const source = ['function constructor() {}', 'function toString() {}', 'function __proto__() {}', ''];
for (const name of ['a.js', 'b.js']) fs.writeFileSync(path.join(fixture, name), source.join('\n'), 'utf8');
const result = spawnSync(process.execPath, [path.join(tools, 'ssot-scan.mjs'), fixture], { encoding: 'utf8', timeout: 10000 });
if (result.status !== 0) {
  fs.writeFileSync(path.join(evidence, 'ssot-prototype-red.log'), `${result.stderr}\n${result.stdout}`, 'utf8');
  process.stderr.write(`FAIL scan exits ${result.status}: ${result.stderr.trim()}\n`);
  fs.rmSync(temp, { recursive: true, force: true }); process.exit(1);
}
const output = JSON.parse(result.stdout);
for (const name of ['constructor', 'toString', '__proto__']) assert.ok(Object.hasOwn(output.duplicate_function_names, name), `missing duplicate group ${name}`);
process.stdout.write('PASS prototype-like duplicate names are reported\n1/1 PASS\n');
fs.rmSync(temp, { recursive: true, force: true });
