#!/usr/bin/env node
// KATALOG · kontrola-skriptu — PostToolUse (Write|Edit|MultiEdit): po zápisu skriptu hned kontrola syntaxe v cílovém prostředí.
//   .js/.mjs/.cjs → node --check · .py → py_compile · .ps1 → parser PowerShellu (na Windows 5.1) + diakritika bez BOM (5.1 ji čte špatně)
//   .sh → bash -n · .json → JSON.parse. Chyba = exit 2 (agent dostane výpis a hned opraví). Chybí-li nástroj nebo selže hook = pustí (fail-open).
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
try {
  const inp = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); const ti = inp.tool_input || {};
  const f = path.resolve(inp.cwd || process.cwd(), ti.file_path || ti.path || ''); if (!ti.file_path && !ti.path) process.exit(0);
  if (!fs.existsSync(f) || fs.statSync(f).size > 2e6) process.exit(0);
  const ext = path.extname(f).toLowerCase(); const WIN = process.platform === 'win32';
  const run = (cmd, args, env) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000, windowsHide: true, env: { ...process.env, ...env } });
  const fail = m => { const L = String(m).trim().split(/\r?\n/).filter(l => !/^\s+at |^Node\.js v|^Traceback|^\s+File "(?!.*\.py", line)|^\s+\^+\s*$|importlib/.test(l));
    process.stderr.write(`KONTROLA SKRIPTU: ${path.basename(f)} — ${L.slice(-6).join('\n')}\nOprav a ulož znovu.\n`); process.exit(2); };
  if (['.js', '.mjs', '.cjs'].includes(ext)) { const r = run(process.execPath, ['--check', f]); if (r.status) fail(r.stderr || 'syntaktická chyba'); }
  else if (ext === '.json') { try { JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { fail(e.message); } }
  else if (ext === '.py') { for (const py of WIN ? ['py', 'python'] : ['python3', 'python']) { const r = run(py, ['-c', 'import py_compile,sys; py_compile.compile(sys.argv[1], doraise=True)', f]); if (r.error || /not found|was not found|Microsoft Store/i.test(r.stderr || '')) continue; if (r.status) fail(r.stderr); break; } }
  else if (ext === '.sh' && !WIN) { const r = run('bash', ['-n', f]); if (!r.error && r.status) fail(r.stderr); }
  else if (ext === '.ps1') {
    const b = fs.readFileSync(f); const bom = b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
    if (WIN && !bom && b.some(x => x > 0x7F)) fail('soubor má diakritiku/ne-ASCII znaky bez UTF-8 BOM — Windows PowerShell 5.1 ho přečte špatně. Ulož s BOM nebo bez diakritiky.');
    const ps = "$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($env:KS_FILE,[ref]$null,[ref]$e);if($e){$e|%{\"$($_.Extent.StartLineNumber): $($_.Message)\"};exit 1}";
    for (const sh of WIN ? ['powershell', 'pwsh'] : ['pwsh']) { const r = run(sh, ['-NoProfile', '-NonInteractive', '-Command', ps], { KS_FILE: f }); if (r.error) continue; if (r.status) fail(r.stdout || r.stderr); break; }
  }
  process.exit(0);
} catch { process.exit(0); }
