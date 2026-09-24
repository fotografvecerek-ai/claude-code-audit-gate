#!/usr/bin/env node
// RELEASE-CHECK — technická brána vydání zdravého projektu. Volá ji projekt-guard před deployem/pushem do produkční větve, CI a deploy skripty.
// PASS (exit 0) jen když:
//   1. docs/kontrola/VYDANI.md obsahuje `Verdikt: 🟢` a `commit <hash>` (píše ho JEN subagent kontrolor — vynucuje projekt-guard),
//   2. od toho commitu se změnilo nanejvýš docs/kontrola/ (jinak se vydává jiný kód, než jaký kontrolor prošel),
//   3. verdikt není starší než RELEASE_MAX_AGE_H (výchozí 72 h),
//   4. v docs/kontrola/NALEZY.md není otevřený nález P0 ani P1,
//   5. pracovní strom je čistý (mimo docs/kontrola/),
//   6. v kombinaci se samostatným auditorem (.claude/hooks/auditor.json) jeho release gate není 🔴.
// Cokoliv jiného = exit 2 se zprávou „RELEASE-CHECK FAIL: …". Použití v deploy skriptu: node .claude/hooks/release-check.mjs || exit 1
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const fail = m => { console.error(`RELEASE-CHECK FAIL: ${m}`); process.exit(2); };
let root = ''; try { root = git(['rev-parse', '--show-toplevel'], process.argv[2] || process.cwd()); } catch { fail('nejsem v git repu'); }
const K = path.join(root, 'docs', 'kontrola');
const vf = path.join(K, 'VYDANI.md'); if (!fs.existsSync(vf)) fail('chybí docs/kontrola/VYDANI.md — kontrolor ještě vydání neschválil (/vydani)');
const txt = fs.readFileSync(vf, 'utf8');
if (!/Verdikt:\s*🟢/.test(txt)) fail('verdikt kontrolora není 🟢');
const m = txt.match(/commit\s+([0-9a-f]{7,40})/i); if (!m) fail('verdikt neuvádí commit');
let head = ''; try { head = git(['rev-parse', 'HEAD'], root); } catch { fail('nelze zjistit HEAD'); }
if (!head.startsWith(m[1])) {
  try { git(['cat-file', '-e', `${m[1]}^{commit}`], root); } catch { fail(`schválený commit ${m[1]} v repu není`); }
  const changed = git(['diff', '--name-only', m[1], 'HEAD'], root).split('\n').filter(Boolean).filter(f => !f.startsWith('docs/kontrola/'));
  if (changed.length) fail(`od schválení (${m[1]}) se změnil kód: ${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ` a dalších ${changed.length - 5}` : ''} — kontrolor musí projít znovu`);
}
let when = NaN; const iso = txt.match(/(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?)/); if (iso) when = Date.parse(iso[1]); if (isNaN(when)) when = fs.statSync(vf).mtimeMs;
const maxH = +(process.env.RELEASE_MAX_AGE_H || 72); const age = (Date.now() - when) / 36e5;
if (age > maxH) fail(`verdikt je ${Math.round(age)} h starý (limit ${maxH} h)`);
const nf = path.join(K, 'NALEZY.md');
if (fs.existsSync(nf)) { const open = fs.readFileSync(nf, 'utf8').split(/\r?\n/).filter(l => /^\s*\|/.test(l) && /\|\s*P[01]\s*\|/.test(l) && /\|\s*(otevřen|otevren|open)/i.test(l)); if (open.length) fail(`${open.length} otevřených nálezů P0/P1 v docs/kontrola/NALEZY.md — nejdřív opravit (STOP-THE-LINE)`); }
// kombinace se samostatným auditorem: jeho 🔴 release gate zastaví vydání (🟢 nebo žádný gate = nic navíc; auditor je periodický)
try { const aj = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'hooks', 'auditor.json'), 'utf8')); const g = path.join(aj.workspace || '', 'AUDIT', '05_release_gate.md');
  if (aj.workspace && fs.existsSync(g) && /Verdikt:\s*🔴/.test(fs.readFileSync(g, 'utf8'))) fail(`samostatný auditor zastavil vydání (${g}) — oprav položky jeho AUDIT/02_HANDOFF.md a požádej ho o ověření`); } catch (e) { if (String(e && e.message).startsWith('RELEASE')) throw e; }
const dirty = git(['status', '--porcelain'], root).split('\n').filter(Boolean).filter(l => !l.slice(3).startsWith('docs/kontrola/'));
if (dirty.length) fail(`pracovní strom není čistý (${dirty.length} souborů) — vydával by se jiný kód než schválený`);
console.log(`RELEASE-CHECK PASS: 🟢 kontrolora pro ${head.slice(0, 12)} (${Math.round(age)} h)`); process.exit(0);
