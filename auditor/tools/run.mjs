#!/usr/bin/env node
// Wrapper pro npm scripty: doplní cestu repa z env AUDITOR_TARGET_REPO (nastaví setup do settings.json → env) a spustí nástroj z kořene workspace.
import { spawnSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ws = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const repo = process.env.AUDITOR_TARGET_REPO;
if (!repo) { console.error('AUDITOR_TARGET_REPO není nastaven — spouštěj z Claude Code session auditora (settings.json → env) nebo exportuj ručně.'); process.exit(1); }
const [tool, ...rest] = process.argv.slice(2);
const map = { eff: ['node', ['tools/efficiency-audit.mjs', 'all', repo]], ssot: ['node', ['tools/ssot-scan.mjs', repo]], hyg: ['node', ['tools/hygiene-scan.mjs', repo]], git: ['node', ['tools/git-practice.mjs', repo]], probe: ['node', ['tools/endpoint-probe.mjs', 'tools/audit.config.json', repo]], static: ['bash', ['tools/static-checks.sh', repo]] };
if (!map[tool]) { console.error('nástroje: ' + Object.keys(map).join(', ')); process.exit(1); }
const [cmd, args] = map[tool]; const r = spawnSync(cmd, [...args, ...rest], { cwd: ws, stdio: 'inherit', shell: process.platform === 'win32' }); process.exit(r.status ?? 1);
