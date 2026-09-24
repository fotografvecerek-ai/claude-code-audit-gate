#!/usr/bin/env node
// UNPATCH-DEPLOY — odstraní řádky vložené nástrojem patch-deploy (značka "auditor-gate" + cesta gate-check.mjs) ze všech souborů v repu.
// node tools/unpatch-deploy.mjs <repo>   → "UNPATCHED <rel. cesta>" za každý opravený soubor. Nic jiného nemění (ani .venv, ani archiv se nepřeskakuje — čistí se vše, co bylo poškozeno).
import fs from 'node:fs'; import path from 'node:path';
const repo = path.resolve(process.argv[2] || process.env.AUDITOR_TARGET_REPO || '.');
const SKIP = new Set(['node_modules', '.git']); const files = [];
const walk = (d, depth) => { if (depth > 4) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (/\.(bat|cmd|ps1|sh|py)$/i.test(e.name)) files.push(p); } };
walk(repo, 0);
const isInserted = l => /auditor-gate/.test(l) && /gate-check\.mjs/.test(l) && /kapitan-side/.test(l);
let n = 0;
for (const f of files) { let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; } if (!t.includes('auditor-gate')) continue; const nl = t.includes('\r\n') ? '\r\n' : '\n'; const lines = t.split(/\r?\n/); const kept = lines.filter(l => !isInserted(l)); if (kept.length !== lines.length) { fs.writeFileSync(f, kept.join(nl)); console.log(`UNPATCHED ${path.relative(repo, f)}`); n++; } }
console.log(n ? `obnoveno ${n} souborů do původního stavu` : 'žádný vložený gate-check řádek nenalezen');
