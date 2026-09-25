#!/usr/bin/env node
// OPRAVNENI — jak samostatný je Kapitán. Volbu dělá vlastník (při instalaci, při aktualizaci jednou, nebo START → [7]).
//   1 OPATRNÝ    — skripty projektu, databázi a další rizikové příkazy schvaluje člověk (Claude Code se zeptá / auto-režim je může odmítnout).
//   2 SAMOSTATNÝ — Kapitán sám spouští skripty projektu (scripts/…) a databázové příkazy (psql, supabase, prisma, Supabase MCP), vlastníka nežádá
//                  o spuštění. Pojistky zůstávají: destruktivní SQL (DROP/TRUNCATE/DELETE bez WHERE) blokuje hook, vydání dál jen přes bránu auditora,
//                  před zápisem do produkční DB záloha do důkazů (pravidlo v roli Kapitána).
//   3 PLNÝ       — navíc bez jakýchkoliv dotazů Claude Code (bypassPermissions); platí jen hooky. Nedoporučeno.
// Zapisuje: <ws>/.opravneni.json (volba) a <repo>/.claude/settings.local.json (osobní nastavení tohoto počítače, necommituje se; naše pravidla
// označená, cizí zůstávají). node tools/opravneni.mjs <ws> <repo> [--level 1|2|3] [--ask]
import fs from 'node:fs'; import path from 'node:path'; import readline from 'node:readline'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const [wsArg, repoArg] = process.argv.slice(2).filter(a => !a.startsWith('--')); const ws = path.resolve(wsArg || '.'); const repo = path.resolve(repoArg || '.');
const lvArg = (() => { const i = process.argv.indexOf('--level'); return i > 0 ? process.argv[i + 1] : ''; })(); const ASK = process.argv.includes('--ask') && process.stdin.isTTY;
const NAMES = { 1: 'OPATRNÝ', 2: 'SAMOSTATNÝ', 3: 'PLNÝ' };
const MARK = 'auditor-opravneni';   // značka našich pravidel (v poli _auditorOpravneni), ať je umíme odebrat
const ALLOW = [
  'Bash(node scripts/:*)', 'Bash(node ./scripts/:*)', 'Bash(node scripts\\:*)', 'Bash(python scripts/:*)', 'Bash(python -X utf8 scripts/:*)', 'Bash(python scripts\\:*)', 'Bash(py scripts/:*)',
  'Bash(powershell -NoProfile -ExecutionPolicy Bypass -File scripts/:*)', 'Bash(powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\:*)', 'Bash(powershell -File scripts/:*)', 'Bash(bash scripts/:*)',
  'Bash(psql:*)', 'Bash(supabase:*)', 'Bash(npx supabase:*)', 'Bash(npx prisma:*)', 'Bash(npm run:*)', 'Bash(pnpm run:*)',
  'mcp__supabase', 'mcp__Supabase'
];
let cur = {}; try { cur = JSON.parse(fs.readFileSync(path.join(ws, '.opravneni.json'), 'utf8')); } catch { }
let level = lvArg || '';
if (!level && ASK) {
  console.log('\n== Jak samostatný má být Kapitán?');
  console.log('  [1] OPATRNÝ    — skripty, databázi a rizikové příkazy mu schvaluješ ty (musíš být u počítače)');
  console.log('  [2] SAMOSTATNÝ — skripty projektu i databázi spouští sám a neotravuje tě; pojistky zůstávají: mazání/DROP v databázi');
  console.log('                   blokuje hook, před zápisem do ostré databáze udělá zálohu, vydání dál jen přes auditora  (doporučeno, když nejsi u PC)');
  console.log('  [3] PLNÝ       — navíc bez jakýchkoliv dotazů Claude Code; platí jen pojistky (nedoporučeno)');
  level = await new Promise(r => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(`Volba (Enter = ${cur.kapitan || 2}): `, a => { rl.close(); r(a.trim() || String(cur.kapitan || 2)); }); });
}
if (!level) level = String(cur.kapitan || 1);
if (!['1', '2', '3'].includes(level)) { console.error('úroveň musí být 1, 2 nebo 3'); process.exit(1); }
// settings.local.json projektu: odeber naše stará pravidla, přidej podle úrovně
const sp = path.join(repo, '.claude', 'settings.local.json'); fs.mkdirSync(path.dirname(sp), { recursive: true });
let s = {}; try { s = JSON.parse(fs.readFileSync(sp, 'utf8').replace(/^﻿/, '')); } catch { }
s.permissions = s.permissions && typeof s.permissions === 'object' ? s.permissions : {};
const ours = new Set(Array.isArray(s._auditorOpravneni) ? s._auditorOpravneni : []);
s.permissions.allow = (Array.isArray(s.permissions.allow) ? s.permissions.allow : []).filter(r => !ours.has(r));
if (s._auditorDefaultMode) { if (s.permissions.defaultMode === 'bypassPermissions') delete s.permissions.defaultMode; delete s._auditorDefaultMode; }
if (level !== '1') { const add = ALLOW.filter(r => !s.permissions.allow.includes(r)); s.permissions.allow.push(...add); s._auditorOpravneni = add; } else delete s._auditorOpravneni;
if (level === '3' && s.permissions.defaultMode !== 'bypassPermissions') { s.permissions.defaultMode = 'bypassPermissions'; s._auditorDefaultMode = true; }
fs.writeFileSync(sp, JSON.stringify(s, null, 2) + '\n');
fs.writeFileSync(path.join(ws, '.opravneni.json'), JSON.stringify({ kapitan: +level, nazev: NAMES[level], zmeneno: new Date().toISOString(), _: MARK }, null, 2) + '\n');
console.log(`  ✅ Kapitán: ${NAMES[level]} (${sp}) — platí od příštího startu jeho okna`);
// role Kapitána v CLAUDE.md projektu podle nové úrovně (jen když je nainstalovaná strana Kapitána)
// spouštěče: Kapitán v Codexu má sandbox a schvalování podle úrovně přímo v příkazu codex
try { const wl = [path.join(ws, 'tools', 'write-launchers.mjs'), path.join(path.dirname(fileURLToPath(import.meta.url)), 'write-launchers.mjs')].find(f => fs.existsSync(f)); if (wl && fs.existsSync(path.join(ws, '.agents.json'))) spawnSync(process.execPath, [wl, ws, repo], { stdio: 'ignore' }); } catch { }
if (fs.existsSync(path.join(repo, '.claude', 'hooks', 'kapitan-audit-guard.js'))) spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'kapitan-role.mjs'), ws, '--claude-md', repo], { stdio: 'ignore' });
