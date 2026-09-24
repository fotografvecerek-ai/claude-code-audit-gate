#!/usr/bin/env node
// GUARD-CHECK — rychlý test brány auditora po instalaci (volá setup-auditor.ps1/.sh). Nezávisle na shellu: hook dostane JSON přes stdin z Node.
// node tools/guard-check.mjs <workspace> <repo>   → exit 0 = brána funguje (zápis do repa blokován, zápis do AUDIT/ povolen), jinak exit 1 + důvod
import path from 'node:path'; import { spawnSync } from 'node:child_process';
const ws = path.resolve(process.argv[2] || process.env.AUDITOR_WORKSPACE || '.'); const repo = path.resolve(process.argv[3] || process.env.AUDITOR_TARGET_REPO || '');
const posix = p => { p = p.replace(/\\/g, '/'); const m = p.match(/^([A-Za-z]):\/(.*)$/); return m ? `/${m[1].toLowerCase()}/${m[2]}` : p; };
const env = { ...process.env, AUDITOR_WORKSPACE: posix(ws), AUDITOR_TARGET_REPO: posix(repo) };
const run = input => spawnSync(process.execPath, [path.join(ws, '.claude', 'hooks', 'auditor-guard.js')], { input: JSON.stringify(input), env, encoding: 'utf8', timeout: 15000 });
const w = f => ({ cwd: ws, tool_name: 'Write', tool_input: { file_path: f } });
const r1 = run(w(path.join(repo, 'test.txt'))), r2 = run(w(path.join(ws, 'AUDIT', '01_nalezy', 'A-000.md'))), r3 = run({ cwd: ws, tool_name: 'Bash', tool_input: { command: `git -C "${repo}" commit -m x` } });
const ok = r1.status === 2 && r2.status === 0 && r3.status === 2;
console.log(`Brána auditora: zápis do repa ${r1.status === 2 ? 'BLOKOVÁN ✅' : `PROŠEL ❌ (exit ${r1.status}: ${(r1.stderr || '').trim().slice(0, 200)})`}; zápis do AUDIT/ ${r2.status === 0 ? 'povolen ✅' : `blokován ❌ (${(r2.stderr || '').trim().slice(0, 200)})`}; git commit do repa ${r3.status === 2 ? 'BLOKOVÁN ✅' : 'PROŠEL ❌'}`);
process.exit(ok ? 0 : 1);
