#!/usr/bin/env node
// KATALOG · commit-syntaxe — PreToolUse (Bash|PowerShell) na `git add`/`git commit`:
//   • ve sdíleném stromu jen JMENOVITÝ add/commit (ne `git add -A|--all|-u|.`, ne `git commit -a`) — jinak se přibalí cizí rozdělaná práce,
//   • před commitem kontrola syntaxe commitovaných souborů (staged + jmenované v `git add` téhož příkazu): JS/MJS/CJS, JSON, Python.
// Plný build zůstává branou vydání, tohle je levná brána commitu. Chyba hooku = pustí (fail-open).
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
try {
  const inp = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); if (!/^(Bash|PowerShell)$/.test(inp.tool_name || '')) process.exit(0);
  const cmd = String(inp.tool_input?.command || ''); const cwd = inp.cwd || process.cwd();
  if (!/\bgit\b[^\n;&|]*\b(add|commit)\b/.test(cmd)) process.exit(0);
  const block = m => { process.stderr.write(`COMMIT: ${m}\n`); process.exit(2); };
  if (/\bgit\s+add\s+(?:[^\n;&|]*\s)?(-A|--all|-u|--update)(\s|$)/.test(cmd) || /\bgit\s+add\s+\.(\s|$|;|&)/.test(cmd))
    block('plošný `git add -A/-u/.` přibalí i cizí rozdělanou práci. Přidej soubory jmenovitě: git add <soubor> …');
  if (/\bgit\s+commit\s+(?:[^\n;&|]*\s)?(-a|--all|-am|-a[a-z]*m)(\s|$)/.test(cmd)) block('`git commit -a` přibalí všechny změněné soubory. Použij git add <soubor> a git commit -m … -- <soubor>.');
  if (!/\bgit\s+commit\b/.test(cmd)) process.exit(0);
  const git = a => spawnSync('git', a, { cwd, encoding: 'utf8', timeout: 15000, windowsHide: true });
  const top = (git(['rev-parse', '--show-toplevel']).stdout || '').trim(); if (!top) process.exit(0);
  const files = new Set((git(['diff', '--cached', '--name-only', '--diff-filter=ACM']).stdout || '').split(/\r?\n/).filter(Boolean).map(x => path.join(top, x)));
  for (const m of cmd.matchAll(/\bgit\s+add\s+([^;&|\n]+)/g)) for (const t of m[1].match(/"[^"]+"|'[^']+'|\S+/g) || []) { const p = t.replace(/^["']|["']$/g, ''); if (!p.startsWith('-')) files.add(path.resolve(cwd, p)); }
  const bad = []; const WIN = process.platform === 'win32';
  for (const f of files) { if (!fs.existsSync(f) || !fs.statSync(f).isFile()) continue; const ext = path.extname(f).toLowerCase();
    if (['.js', '.mjs', '.cjs'].includes(ext)) { const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', timeout: 15000 }); if (r.status) bad.push(`${path.relative(top, f)}: ${(r.stderr || '').split(/\r?\n/).find(l => /Error/.test(l)) || 'syntaxe'}`); }
    else if (ext === '.json') { try { JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { bad.push(`${path.relative(top, f)}: ${e.message}`); } }
    else if (ext === '.py') { for (const py of WIN ? ['py', 'python'] : ['python3', 'python']) { const r = spawnSync(py, ['-c', 'import py_compile,sys; py_compile.compile(sys.argv[1], doraise=True)', f], { encoding: 'utf8', timeout: 15000, windowsHide: true }); if (r.error || /not found|Microsoft Store/i.test(r.stderr || '')) continue; if (r.status) bad.push(`${path.relative(top, f)}: ${(r.stderr || '').trim().split(/\r?\n/).pop()}`); break; } } }
  if (bad.length) block(`syntaktická chyba v commitovaných souborech — oprav před commitem:\n  ${bad.slice(0, 10).join('\n  ')}`);
  process.exit(0);
} catch { process.exit(0); }
