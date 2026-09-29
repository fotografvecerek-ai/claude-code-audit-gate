#!/usr/bin/env node
// UNPATCH-DEPLOY — najde řádky vložené nástrojem patch-deploy (značka "auditor-gate" + cesta kapitan-side/gate-check.mjs).
// node tools/unpatch-deploy.mjs <repo>                       → jen VYPÍŠE nálezy ("NALEZ <soubor>:<řádek>"), NIC nemění (výchozí).
// node tools/unpatch-deploy.mjs <repo> --provest [--file <rel> ...]
//   → odstraní řádky jen v souborech bez necommitnutých změn a hned je jmenovitě commitne ("UNPATCHED <soubor>").
//     Soubor s rozdělanou prací se přeskočí (nikdy nevznikne necommitnutý rozdíl, kterým by dvojklik na skript obešel bránu).
//   Mimo git se soubory jen upraví.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const repo = path.resolve(process.argv[2] || process.env.AUDITOR_TARGET_REPO || '.');
const argv = process.argv.slice(3); const provest = argv.includes('--provest');
const explicit = []; for (let i = 0; i < argv.length; i++) if (argv[i] === '--file' && argv[i + 1]) explicit.push(path.resolve(repo, argv[++i]));
const SKIP = new Set(['node_modules', '.git']); const files = [];
const walk = (d, depth) => { if (depth > 4) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (/\.(bat|cmd|ps1|sh|py)$/i.test(e.name)) files.push(p); } };
if (explicit.length) files.push(...explicit); else walk(repo, 0);
const isInserted = l => (/auditor-gate/.test(l) && /gate-check\.mjs/.test(l) && /kapitan-side/.test(l)) || /&:: auditor-gate-cp$/.test(l.trim());
const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
const inGit = git('rev-parse', '--is-inside-work-tree').stdout?.trim() === 'true';
const rel = f => path.relative(repo, f).replace(/\\/g, '/');
const found = [];
for (const f of files) {
  let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; } if (!t.includes('auditor-gate')) continue;
  const lines = t.split(/\r?\n/); const idx = lines.map((l, i) => isInserted(l) ? i + 1 : 0).filter(Boolean);
  if (idx.length) found.push({ f, t, lines, idx });
}
if (!found.length) { console.log('žádný vložený gate-check řádek nenalezen'); process.exit(0); }
if (!provest) {
  for (const x of found) console.log(`NALEZ ${rel(x.f)}:${x.idx.join(',')}`);
  console.log(`nalezeno ${found.length} souborů s bránou — nic neměním. Odstranit (jen čisté soubory, s commitem): --provest [--file <soubor>]`);
  process.exit(0);
}
const done = [], dirty = [];
for (const x of found) {
  const r = rel(x.f);
  if (inGit) { const st = git('status', '--porcelain', '--', r).stdout.trim(); if (st && !/^\?\?/.test(st)) { dirty.push(r); continue; } }
  const nl = x.t.includes('\r\n') ? '\r\n' : '\n'; fs.writeFileSync(x.f, x.lines.filter(l => !isInserted(l)).join(nl)); done.push(r);
}
for (const d of dirty) console.log(`PRESKOCENO ${d} (má necommitnuté změny — nejdřív je dokonči nebo commitni)`);
if (inGit && done.length) {
  const tracked = done.filter(r => git('ls-files', '--error-unmatch', '--', r).status === 0);
  if (tracked.length) {
    const c = git('commit', '-m', 'chore(audit): odstranění vložených gate-check řádků (unpatch-deploy)', '--', ...tracked);
    if (c.status !== 0) {
      // commit neprošel (hook, identita) → vrátit soubory do stavu HEAD, ať nezůstane rozdíl obcházející bránu
      git('checkout', 'HEAD', '--', ...tracked);
      console.log(`CHYBA commit neprošel, změny vráceny: ${(c.stderr || c.stdout).trim().split('\n').slice(-2).join(' ')}`); process.exit(1);
    }
  }
}
for (const r of done) console.log(`UNPATCHED ${r}`);
console.log(done.length ? `odstraněno z ${done.length} souborů${inGit ? ' (commitnuto)' : ''}` : 'nic neodstraněno');
