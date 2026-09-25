#!/usr/bin/env node
// ÚKLID WORKSPACE auditora — zbytečné kopie repa v build/ (každá = tisíce souborů, které pak Grep/Glob a subagenti procházejí znovu a znovu)
// a výstupy testů. Maže JEN uvnitř <workspace>/build/ a test-results/, nikdy aktivní klon build/<repo> ani nic mimo workspace.
//   node tools/uklid-workspace.mjs            → výpis (co by se smazalo, kolik místa)
//   node tools/uklid-workspace.mjs --smazat   → smaže
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ws = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const DO = process.argv.includes('--smazat');
const repo = process.env.AUDITOR_TARGET_REPO || path.basename(ws).replace(/-audit$/, ''); const keep = new Set([path.basename(repo.replace(/[\\/]+$/, '')), path.basename(ws).replace(/-audit$/, ''), '.devserver.pid'].filter(Boolean));   // aktivní klon build/<repo> zůstává vždy
const size = d => { let n = 0, files = 0; const walk = p => { let es = []; try { es = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
  for (const e of es) { const q = path.join(p, e.name); if (e.isDirectory()) walk(q); else { files++; try { n += fs.statSync(q).size; } catch { } } } }; walk(d); return { n, files }; };
const cands = [];
const b = path.join(ws, 'build'); if (fs.existsSync(b)) for (const e of fs.readdirSync(b, { withFileTypes: true })) if (e.isDirectory() && !keep.has(e.name)) cands.push(path.join(b, e.name));
for (const d of ['test-results', 'playwright-report']) if (fs.existsSync(path.join(ws, d))) cands.push(path.join(ws, d));
let tot = 0, totF = 0;
for (const c of cands) { const { n, files } = size(c); tot += n; totF += files; console.log(`  ${DO ? 'mažu' : 'lze smazat'}: ${path.relative(ws, c)}  (${files} souborů, ${(n / 1048576).toFixed(0)} MB)`);
  if (DO) { const rel = path.relative(ws, c); if (rel.startsWith('..') || path.isAbsolute(rel)) continue; fs.rmSync(c, { recursive: true, force: true }); } }
console.log(cands.length ? `  celkem ${totF} souborů, ${(tot / 1048576).toFixed(0)} MB${DO ? ' — smazáno' : ' — smažeš: node tools/uklid-workspace.mjs --smazat'}` : '  build/ je čistý (jen aktivní klon).');
