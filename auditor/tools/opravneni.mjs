#!/usr/bin/env node
// OPRAVNENI — jak samostatný je Kapitán. Volbu dělá vlastník (při instalaci, při aktualizaci jednou, nebo START → [7]).
//   1 OPATRNÝ    — skripty projektu, databázi a další rizikové příkazy schvaluje člověk (Claude Code se zeptá / auto-režim je může odmítnout).
//   2 SAMOSTATNÝ — Kapitán sám spouští skripty projektu (scripts/…) a databázové příkazy (psql, supabase, prisma, Supabase MCP), vlastníka nežádá
//                  o spuštění. Pojistky zůstávají: destruktivní SQL (DROP/TRUNCATE/DELETE bez WHERE) blokuje hook, vydání dál jen přes bránu auditora,
//                  před zápisem do produkční DB záloha do důkazů (pravidlo v roli Kapitána).
//   3 PLNÝ       — navíc bez jakýchkoliv dotazů Claude Code (bypassPermissions); platí jen hooky. Nedoporučeno.
// Zapisuje: <ws>/.opravneni.json (volba) a <repo>/.claude/settings.local.json (osobní nastavení tohoto počítače, necommituje se; naše pravidla
// označená, cizí zůstávají). node tools/opravneni.mjs <ws> <repo> [--level 1|2|3] [--ask]
// A-029 kolo 5: vyšší samostatnost, než jaká platí (integrita), zapíše jen po schválení vlastníka (terminál; z agenta nikdy) — jinak nic nemění, exit 3.
// Tabulka pravidel je v opravneni-pravidla.mjs (sdílí ji SessionStart Kapitána, který nadbytek proti integritě odebírá).
import fs from 'node:fs'; import path from 'node:path'; import readline from 'node:readline'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import { ownerApprove, ttyAvailable, ensureWsGit, integrity, kapitanLevel } from './prisnost.mjs';
import { NAMES, settingsPath, readSettings, applyLevel, writeSettings } from './opravneni-pravidla.mjs';
// A-029 kolo 5: cesty kanonicky (8.3 jména, symlink/junction) — git ws i settings.local.json vždy na skutečném místě
const canon = p => { try { return fs.realpathSync.native(p); } catch { return p; } };
const [wsArg, repoArg] = process.argv.slice(2).filter(a => !a.startsWith('--')); const ws = canon(path.resolve(wsArg || '.')); const repo = canon(path.resolve(repoArg || '.'));
const lvArg = (() => { const i = process.argv.indexOf('--level'); return i > 0 ? process.argv[i + 1] : ''; })();
// A-029 K4: --ask jen s terminálem vlastníka — stdin TTY, nebo konzole (/dev/tty, CONIN$) v Git Bash/mintty, kde stdin TTY není
const ASK = process.argv.includes('--ask') && (process.stdin.isTTY || ttyAvailable());
const MARK = 'auditor-opravneni';
const F_OPR = path.join(ws, '.opravneni.json');
const prevRaw = (() => { try { return fs.readFileSync(F_OPR, 'utf8'); } catch { return null; } })();
let cur = {}; try { cur = JSON.parse(String(prevRaw).replace(/^﻿/, '')) || {}; } catch { }
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
// settings.local.json projektu načti předem — neplatný JSON = stop (cizí obsah, který neumím přečíst, nepřepíšu)
const sp = settingsPath(repo);
let cfg; try { cfg = readSettings(sp); } catch (e) { console.error(`  ⚠ ${e.message}`); process.exit(1); }
const before = kapitanLevel(ws);
fs.writeFileSync(F_OPR, JSON.stringify({ kapitan: +level, nazev: NAMES[level], zmeneno: new Date().toISOString(), _: MARK }, null, 2) + '\n', 'utf8');
// A-029 K3/K4: volba vlastníka v terminálu (--ask) → schválení commitem vlastníka v gitu workspace (ws bez gitu ho nejdřív dostane).
// A-029 kolo 5: vyšší samostatnost, než jaká teď platí, se do oprávnění Claude Code (settings.local.json) zapíše JEN po schválení vlastníka
// (ownerApprove: terminál vlastníka; z agenta — CLAUDECODE/CLAUDE_CODE_ENTRYPOINT — ani ze samotestu nikdy). Jinak se nic nemění a exit 3.
if (ASK) { const g = ensureWsGit(ws); if (!g.ok) console.error(`  ⚠ ${g.duvod}`); }
if (ASK || +level > before) ownerApprove(ws, `vlastník: oprávnění Kapitána ${cur.kapitan || '(nic)'}→${level}`, ['.opravneni.json']);
const eff = kapitanLevel(ws);
if (eff < +level) {
  if (prevRaw === null) fs.rmSync(F_OPR, { force: true }); else fs.writeFileSync(F_OPR, prevRaw, 'utf8');
  console.error(`  ⛔ samostatnost Kapitána ${NAMES[level]} není schválená vlastníkem — oprávnění Claude Code (${sp}) jsem nezměnil, platí ${eff} ${NAMES[eff]}.`);
  console.error('     Změnu udělá jen vlastník: spusť START → [7] v okně terminálu (Windows: START.cmd dvojklikem).');
  process.exit(3);
}
writeSettings(sp, applyLevel(cfg.s, eff));
// zbylé neschválené volby (přísnost, dluh) nabídne vlastníkovi potvrdit
if (ASK) {
  let it = null; try { it = integrity(ws); } catch { }
  if (it && it.git && it.zmeny.length) spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'prisnost.mjs'), '--ws', ws, 'potvrd'], { stdio: 'inherit' });
}
console.log(`  ✅ Kapitán: ${NAMES[level]} (${sp}) — platí od příštího startu jeho okna`);
// role Kapitána v CLAUDE.md projektu podle nové úrovně (jen když je nainstalovaná strana Kapitána)
// spouštěče: Kapitán v Codexu má sandbox a schvalování podle úrovně přímo v příkazu codex
try { const wl = [path.join(ws, 'tools', 'write-launchers.mjs'), path.join(path.dirname(fileURLToPath(import.meta.url)), 'write-launchers.mjs')].find(f => fs.existsSync(f)); if (wl && fs.existsSync(path.join(ws, '.agents.json'))) spawnSync(process.execPath, [wl, ws, repo], { stdio: 'ignore' }); } catch { }
if (fs.existsSync(path.join(repo, '.claude', 'hooks', 'kapitan-audit-guard.js'))) spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'kapitan-role.mjs'), ws, '--claude-md', repo], { stdio: 'ignore' });
