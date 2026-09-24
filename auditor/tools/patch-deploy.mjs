#!/usr/bin/env node
// PATCH-DEPLOY — najde deploy skripty v repu a vloží gate-check jako první krok (idempotentně, značka "auditor-gate").
// node tools/patch-deploy.mjs <repo> <workspace> [--list] [--file <rel> ...]
//   bez --file: KANDIDÁTI jen podle NÁZVU (deploy*/release*/publish*/build_ota*/ota_*) v rootu nebo scripts/ (ne archive/, .venv, hooks/, test_*);
//   --list jen vypíše kandidáty (nic nemění); --file <rel> upraví přesně zadané soubory (použije Kapitán podle handoffu auditora).
import fs from 'node:fs'; import path from 'node:path';
const repo = path.resolve(process.argv[2] || process.env.AUDITOR_TARGET_REPO || '.'); const ws = path.resolve(process.argv[3] || process.env.AUDITOR_WORKSPACE || path.join(repo, '..', path.basename(repo) + '-audit'));
const gc = path.join(ws, 'kapitan-side', 'gate-check.mjs'); const MARK = 'auditor-gate'; const DEPLOYISH = /\b(vercel|deploy|publish|ota|netlify|firebase|gh-pages|rsync|scp|ftp|wrangler|fly\s+deploy|eas\s+(build|submit)|capacitor|npx\s+cap\b)/i;
const SKIP = new Set(['node_modules', '.git', '.tmp', 'dist', 'build', '.next', 'coverage', 'vendor', '.claude']);
const argv = process.argv.slice(4); const listOnly = argv.includes('--list'); const explicit = []; for (let i = 0; i < argv.length; i++) if (argv[i] === '--file' && argv[i + 1]) explicit.push(path.resolve(repo, argv[++i]));
const NAME_RE = /^(deploy|release|publish|build_ota|ota_|vydat|nasad)[\w.-]*\.(bat|cmd|ps1|sh|py)$/i; const BAD_DIR = /[\\/](archive|archiv|\.venv|venv|hooks|tests?|migrace|node_modules|\.tmp|reports)[\\/]/i;
const files = []; const walk = (d, depth) => { if (depth > 1) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (/\.(bat|cmd|ps1|sh|py)$/i.test(e.name)) files.push(p); } };
if (explicit.length) { files.length = 0; files.push(...explicit); } else walk(repo, 0);
const q = s => `"${s}"`; const patched = [];
for (const f of files) {
  let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (t.includes(MARK)) continue; const ext = path.extname(f).toLowerCase(); const base = path.basename(f);
  if (!explicit.length) { if (!NAME_RE.test(base) || BAD_DIR.test(f + path.sep) || /^test_/i.test(base)) continue; if (!DEPLOYISH.test(t)) continue; }
  if (listOnly) { console.log(`KANDIDAT ${path.relative(repo, f)}`); continue; }
  const nl = t.includes('\r\n') ? '\r\n' : '\n'; const lines = t.split(/\r?\n/); let ins = 0, line = '';
  if (ext === '.bat' || ext === '.cmd') { if (/^\s*@echo\s+off/i.test(lines[0] || '')) ins = 1; line = `node ${q(gc)} ${q(repo)} || exit /b 1  &:: ${MARK} — vydání jen se zeleným verdiktem auditora`; }
  else if (ext === '.ps1') { line = `node ${q(gc)} ${q(repo)}; if ($LASTEXITCODE -ne 0) { exit 1 }  # ${MARK} — vydání jen se zeleným verdiktem auditora`; }
  else if (ext === '.sh') { if (/^#!/.test(lines[0] || '')) ins = 1; line = `node ${q(gc)} ${q(repo)} || exit 1  # ${MARK} — vydání jen se zeleným verdiktem auditora`; }
  else if (ext === '.py') { while (ins < lines.length && /^(#!|#.*coding|\s*$|"""|'''|from __future__)/.test(lines[ins]) && ins < 5) ins++; line = `import subprocess as _ag, sys as _ags; _ag.run(["node", ${JSON.stringify(gc)}, ${JSON.stringify(repo)}]).returncode == 0 or _ags.exit("${MARK}: vydání zakázáno — chybí zelený verdikt auditora")  # ${MARK}`; }
  lines.splice(ins, 0, line); fs.writeFileSync(f, lines.join(nl)); patched.push(path.relative(repo, f));
}
for (const p of patched) console.log(`PATCHED ${p}`);
if (!patched.length && !listOnly) console.log('žádný deploy skript v repu nenalezen (hook Kapitána hlídá vercel/git push i tak)');
