import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bus = path.join(root, 'tools', 'bus.mjs');
const evidence = path.resolve(root, '..', '.tmp', 'tasks', 'K-005');
fs.mkdirSync(evidence, { recursive: true });
const temp = fs.mkdtempSync(path.join(evidence, 'bus-id-'));
let passed = 0;
const failures = [];
async function check(name, fn) { try { await fn(); passed++; process.stdout.write(`PASS ${name}\n`); } catch (error) { const line = `FAIL ${name}: ${error.message}`; failures.push(line); process.stderr.write(`${line}\n`); } }
function workspace(name) { const dir = path.join(temp, name); fs.mkdirSync(path.join(dir, 'AUDIT', 'bus'), { recursive: true }); return dir; }
function run(ws, args) { return spawnSync(process.execPath, [bus, ...args], { cwd: ws, env: { ...process.env, AUDITOR_WORKSPACE: ws }, encoding: 'utf8', timeout: 10000 }); }
function concurrent(ws, count) {
  return Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bus, 'nove-id'], { cwd: ws, env: { ...process.env, AUDITOR_WORKSPACE: ws }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.setEncoding('utf8').on('data', x => stdout += x); child.stderr.setEncoding('utf8').on('data', x => stderr += x);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr }));
  })));
}

await check('repeated unposted reservations return distinct K IDs', () => {
  const ws = workspace('sequential'); const ids = [run(ws, ['nove-id']), run(ws, ['nove-id'])].map(x => { assert.equal(x.status, 0, x.stderr); return x.stdout.trim(); });
  assert.deepEqual(ids, ['K-001', 'K-002']);
});
await check('parallel processes reserve unique IDs in one shared workspace', async () => {
  const ws = workspace('parallel'); const rows = await concurrent(ws, 16); assert(rows.every(x => x.code === 0), rows.map(x => x.stderr).join('\n'));
  const ids = rows.map(x => x.stdout); assert.equal(new Set(ids).size, rows.length); assert(ids.every(x => /^K-\d{3}$/.test(x)));
});
await check('automatic ZADANI allocation and nove-id use the same sequence', () => {
  const ws = workspace('zadani'); const one = run(ws, ['post', '--from', 'auditor', '--type', 'ZADANI', '--citace', 'první']); assert.equal(one.status, 0, one.stderr);
  const id1 = JSON.parse(one.stdout).msg.id; const two = run(ws, ['nove-id']); assert.equal(two.status, 0, two.stderr); const id2 = two.stdout.trim();
  const three = run(ws, ['post', '--from', 'owner', '--type', 'ZADANI', '--citace', 'druhý']); assert.equal(three.status, 0, three.stderr);
  assert.deepEqual([id1, id2, JSON.parse(three.stdout).msg.id], ['K-001', 'K-002', 'K-003']);
});
await check('automatic ZADANI and nove-id remain unique when posted concurrently', async () => {
  const ws = workspace('zadani-parallel');
  const jobs = [
    ...Array.from({ length: 6 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bus, 'post', '--from', 'owner', '--type', 'ZADANI', '--citace', 'soubežná úloha'], { cwd: ws, env: { ...process.env, AUDITOR_WORKSPACE: ws }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = ''; child.stdout.setEncoding('utf8').on('data', x => stdout += x); child.stderr.setEncoding('utf8').on('data', x => stderr += x);
      child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr, kind: 'post' }));
    })),
    ...Array.from({ length: 6 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [bus, 'nove-id'], { cwd: ws, env: { ...process.env, AUDITOR_WORKSPACE: ws }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = ''; child.stdout.setEncoding('utf8').on('data', x => stdout += x); child.stderr.setEncoding('utf8').on('data', x => stderr += x);
      child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr, kind: 'reserve' }));
    })),
  ];
  const rows = await Promise.all(jobs); assert(rows.every(x => x.code === 0), rows.map(x => x.stderr).join('\n'));
  const ids = rows.map(x => x.kind === 'post' ? JSON.parse(x.stdout).msg.id : x.stdout.trim());
  assert.equal(new Set(ids).size, ids.length); assert(ids.every(x => /^K-\d{3}$/.test(x)));
});
await check('ZADANI rejects caller-supplied IDs and allocates its own', () => {
  const ws = workspace('explicit-id');
  const rejected = run(ws, ['post', '--from', 'owner', '--type', 'ZADANI', '--id', 'K-001', '--citace', 'vlastník']);
  assert.notEqual(rejected.status, 0, 'explicit ZADANI ID must be rejected');
  const posted = run(ws, ['post', '--from', 'owner', '--type', 'ZADANI', '--citace', 'vlastník']); assert.equal(posted.status, 0, posted.stderr);
  assert.equal(JSON.parse(posted.stdout).msg.id, 'K-001');
});
await check('reserved sequence never moves behind existing workspace messages', () => {
  const ws = workspace('legacy'); fs.writeFileSync(path.join(ws, 'AUDIT', 'bus', 'seed.json'), JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', id: 'K-009', ack: [] }), 'utf8');
  const result = run(ws, ['nove-id']); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), 'K-010');
});
await check('corrupt reservation state fails closed', () => {
  const ws = workspace('corrupt'); fs.writeFileSync(path.join(ws, 'AUDIT', 'bus', '.id-sequence.json'), '{broken', 'utf8');
  const result = run(ws, ['nove-id']); assert.notEqual(result.status, 0); assert(!/^K-\d+$/.test(result.stdout.trim()));
});

process.stdout.write(`${passed}/7 PASS\n`);
if (failures.length) fs.writeFileSync(path.join(evidence, 'bus-id-red.log'), `${failures.join('\n')}\n${passed}/7 PASS\n`, 'utf8');
fs.rmSync(temp, { recursive: true, force: true });
if (failures.length) process.exitCode = 1;
