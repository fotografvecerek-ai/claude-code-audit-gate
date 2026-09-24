#!/usr/bin/env node
// GATE-CHECK — technická bariéra proti vydání bez verdiktu auditora (i když ji chce obejít člověk kliknutím na .bat).
// Použití v DEPLOY_SEKVENCI Kapitána (první krok) a v deploy skriptech/.bat:  node <auditor-ws>/kapitan-side/gate-check.mjs <repo>  || exit 1
// PASS (exit 0) jen když AUDIT/05_release_gate.md obsahuje řádek `Verdikt: 🟢` A `commit <hash>` shodný s aktuálním HEAD repa A není starší než GATE_MAX_AGE_H (výchozí 72 h, env GATE_MAX_AGE_H).
// Cokoliv jiného = exit 2 se zprávou. Chybějící soubor = exit 2 (fail-closed). Žádná výjimka „jen tentokrát".
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
// git voláme bez shellu (execFileSync): na Windows by cmd.exe znak ^ v `HEAD^{tree}` sežral a gate by falešně selhal
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const repo = path.resolve(process.argv[2] || process.env.AUDITOR_TARGET_REPO || '.');
const ws = process.env.AUDITOR_WORKSPACE || path.resolve(repo, '..', path.basename(repo) + '-audit');
const gate = path.join(ws, 'AUDIT', '05_release_gate.md');
const maxAgeH = +(process.env.GATE_MAX_AGE_H || 72);
const fail = m => { console.error(`GATE-CHECK FAIL: ${m}\n→ vydání zakázáno. Požádej auditora o release gate pro aktuální HEAD (bus: STATUS/EVIDENCE).`); process.exit(2); };
if (!fs.existsSync(gate)) fail(`chybí ${gate}`);
const txt = fs.readFileSync(gate, 'utf8');
let head = ''; try { head = git(['rev-parse', 'HEAD'], repo); } catch { fail('nelze zjistit HEAD repa'); }
const m = txt.match(/commit\s+([0-9a-f]{7,40})/i); if (!m) fail('gate neuvádí commit');
const exact = head.startsWith(m[1]) || m[1].startsWith(head.slice(0, m[1].length));
if (!exact) {
  // merge --no-ff i squash bez obsahové změny: porovnáváme HASH STROMU (obsah + názvy + mode bity), ne ancestry ani diff --stat
  let gatedTree = '', headTree = '';
  try { gatedTree = git(['rev-parse', `${m[1]}^{tree}`], repo); } catch { fail(`gated commit ${m[1]} není v tomto repu (chybí fetch?)`); }
  try { headTree = git(['rev-parse', 'HEAD^{tree}'], repo); } catch { }
  if (!gatedTree || gatedTree !== headTree) fail(`gate je pro commit ${m[1]}, HEAD je ${head.slice(0, 12)} — obsah se od auditu liší (strom ${gatedTree.slice(0, 8)} ≠ ${headTree.slice(0, 8)})`);
  console.log(`gate-check: HEAD ${head.slice(0, 12)} má shodný strom s gated commitem ${m[1]} (merge/squash beze změny obsahu — ok)`);
}
if (!/Verdikt:\s*🟢/.test(txt)) fail('verdikt není 🟢');
// datum: ISO (2026-09-24[T10:00]) nebo české (24. 9. 2026); bez rozpoznatelného data = mtime souboru
let when = NaN; const iso = txt.match(/(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?)/); const cz = txt.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
if (iso) when = Date.parse(iso[1]); else if (cz) when = new Date(+cz[3], +cz[2] - 1, +cz[1], +(cz[4] || 12), +(cz[5] || 0)).getTime();
if (isNaN(when)) when = fs.statSync(gate).mtimeMs;
const age = (Date.now() - when) / 36e5;
if (age > maxAgeH) fail(`gate je ${Math.round(age)} h starý (limit ${maxAgeH} h; GATE_MAX_AGE_H)`);
if (age < -1) fail('gate má datum v budoucnosti');
try { const dirty = git(['status', '--porcelain'], repo); if (dirty) fail('pracovní strom není čistý — vydává se jiný kód než auditovaný'); } catch { }
console.log(`GATE-CHECK PASS: 🟢 pro ${head.slice(0, 12)} (${Math.round(age)} h)`); process.exit(0);
