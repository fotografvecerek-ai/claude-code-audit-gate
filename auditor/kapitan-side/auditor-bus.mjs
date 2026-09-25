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
let ws = process.env.AUDITOR_WORKSPACE || '';
const w = ws.match(/^\/([a-z])\/(.*)$/i); if (w && process.platform === 'win32') ws = `${w[1].toUpperCase()}:/${w[2]}`;
const bus = path.join(ws, 'tools', 'bus.mjs');
if (!ws || !fs.existsSync(bus)) { console.error(`auditor-bus: workspace auditora nenalezen (AUDITOR_WORKSPACE=${ws || 'nenastaveno'}) — spusť Kapitána ze zástupce nebo aktualizuj instalaci (START → [2]).`); process.exit(1); }
const a = process.argv.slice(2); const cmd = a[0];
const fix = { post: ['--from', 'kapitan'], inbox: ['--for', 'kapitan'], wait: ['--for', 'kapitan'], ack: ['--by', 'kapitan'] }[cmd] || [];
const rest = a.slice(1).filter((x, i, arr) => !(['--from', '--for', '--by'].includes(x) || ['--from', '--for', '--by'].includes(arr[i - 1])));
const r = spawnSync(process.execPath, [bus, cmd, ...fix, ...rest], { cwd: ws, stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
