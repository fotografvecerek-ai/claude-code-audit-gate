#!/usr/bin/env node
// AUDITOR-BUS — zkratka Kapitána na most k auditorovi. Leží v repu (.claude/hooks/), takže má stálou relativní cestu
// a jedno povolení v nastavení („node .claude/hooks/auditor-bus.mjs") — auto-režim ji nezablokuje a Kapitán nemusí znát cestu k workspace.
// Vždy posílá jako Kapitán (--from kapitan doplní sám). Příklady:
//   node .claude/hooks/auditor-bus.mjs inbox --unacked --brief
//   node .claude/hooks/auditor-bus.mjs post --type STATUS --id A-044 --status STARTED --text "začínám"
//   node .claude/hooks/auditor-bus.mjs post --type EVIDENCE --id A-044 --ref AUDIT/03_dukazy/A-044/ --sha <commit>
//   node .claude/hooks/auditor-bus.mjs ack --msg <soubor-zprávy>
//   node .claude/hooks/auditor-bus.mjs wait --interval 60        (hlídač na pozadí: skončí, jakmile auditor něco pošle → probudí Kapitána)
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
const argv = process.argv.slice(2); const cmd = argv[0]; const forwarded = argv.slice(1);
const workspaceFlags = forwarded.reduce((indices, value, index) => value === '--workspace' ? [...indices, index] : indices, []);
if (workspaceFlags.length > 1) { console.error('auditor-bus: --workspace smí být zadáno pouze jednou.'); process.exit(1); }
const workspaceIndex = workspaceFlags[0] ?? -1;
const explicitWorkspace = workspaceIndex >= 0;
const workspaceValue = explicitWorkspace ? forwarded[workspaceIndex + 1] : process.env.AUDITOR_WORKSPACE || '';
if (explicitWorkspace && (!workspaceValue || workspaceValue.startsWith('--'))) { console.error('auditor-bus: --workspace vyžaduje cestu.'); process.exit(1); }
const nativePath = value => { const match = value.match(/^\/([a-z])\/(.*)$/i); return match && process.platform === 'win32' ? `${match[1].toUpperCase()}:/${match[2]}` : value; };
const ws = workspaceValue ? path.resolve(nativePath(workspaceValue)) : '';
const forwardedArgs = explicitWorkspace ? forwarded.filter((_, index) => index !== workspaceIndex && index !== workspaceIndex + 1) : forwarded;
let validWorkspace = false;
try {
  const rootStat = fs.lstatSync(ws), auditStat = fs.lstatSync(path.join(ws, 'AUDIT'));
  const busStat = fs.lstatSync(path.join(ws, 'tools', 'bus.mjs'));
  validWorkspace = rootStat.isDirectory() && !rootStat.isSymbolicLink() && auditStat.isDirectory() && !auditStat.isSymbolicLink() && busStat.isFile() && !busStat.isSymbolicLink();
} catch { }
if (!validWorkspace) { console.error(`auditor-bus: workspace auditora není platný${explicitWorkspace ? ' (vyžaduje adresář AUDIT/ a tools/bus.mjs)' : ` (AUDITOR_WORKSPACE=${ws || 'nenastaveno'})`} — spusť Kapitána ze zástupce nebo aktualizuj instalaci (START → [2]).`); process.exit(1); }
const bus = path.join(ws, 'tools', 'bus.mjs');
const fix = { post: ['--from', 'kapitan'], inbox: ['--for', 'kapitan'], wait: ['--for', 'kapitan'], ack: ['--by', 'kapitan'] }[cmd] || [];
const rest = forwardedArgs.filter((x, i, arr) => !(['--from', '--for', '--by'].includes(x) || ['--from', '--for', '--by'].includes(arr[i - 1])));
const r = spawnSync(process.execPath, [bus, cmd, ...fix, ...rest], { cwd: ws, stdio: 'inherit', env: { ...process.env, AUDITOR_WORKSPACE: ws } });
process.exit(r.status ?? 1);
