#!/usr/bin/env node
// PATCH-DEPLOY — najde deploy skripty v repu a vloží gate-check jako první krok (idempotentně, značka "auditor-gate").
// node tools/patch-deploy.mjs <repo> <workspace> [--list] [--file <rel> ...]
//   bez --file: KANDIDÁTI jen podle NÁZVU (deploy*/release*/publish*/build_ota*/ota_*) v rootu nebo scripts/ (ne archive/, .venv, hooks/, test_*);
//   --list jen vypíše kandidáty (nic nemění); --file <rel> upraví přesně zadané soubory (použije Kapitán podle handoffu auditora).
//   Nikdy do skriptů, které jen UKLÁDAJÍ tajemství (ulož*/save*/secret*/klic*/key*…, keyring/cmdkey/secret-tool/`vercel env add`…):
//   uložení klíče nesmí záviset na zeleném verdiktu. Python: brána jde ZA docstring modulu a `from __future__`;
//   brána uvnitř docstringu (chybné vložení starší verzí) se opraví přesunem.
import fs from 'node:fs'; import path from 'node:path';
const repo = path.resolve(process.argv[2] || process.env.AUDITOR_TARGET_REPO || '.'); const ws = path.resolve(process.argv[3] || process.env.AUDITOR_WORKSPACE || path.join(repo, '..', path.basename(repo) + '-audit'));
const gc = path.join(ws, 'kapitan-side', 'gate-check.mjs'); const MARK = 'auditor-gate'; const DEPLOYISH = /\b(vercel|deploy|publish|ota|netlify|firebase|gh-pages|rsync|scp|ftp|wrangler|fly\s+deploy|eas\s+(build|submit)|capacitor|npx\s+cap\b)/i;
const SKIP = new Set(['node_modules', '.git', '.tmp', 'dist', 'build', '.next', 'coverage', 'vendor', '.claude']);
const argv = process.argv.slice(4); const listOnly = argv.includes('--list'); const explicit = []; for (let i = 0; i < argv.length; i++) if (argv[i] === '--file' && argv[i + 1]) explicit.push(path.resolve(repo, argv[++i]));
const NAME_RE = /^(deploy|release|publish|build_ota|ota_|vydat|nasad)[\w.-]*\.(bat|cmd|ps1|sh|py)$/i; const BAD_DIR = /[\\/](archive|archiv|\.venv|venv|hooks|tests?|migrace|node_modules|\.tmp|reports)[\\/]/i;
const files = []; const walk = (d, depth) => { if (depth > 1) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (/\.(bat|cmd|ps1|sh|py)$/i.test(e.name)) files.push(p); } };
if (explicit.length) { files.length = 0; files.push(...explicit); } else walk(repo, 0);
const q = s => `"${s}"`; const patched = [], skipped = []; let hotove = 0;
const SECRET_NAME = /^(ulo[zž]|save|store|secret|tajem|kl[ií][cč]|key|token|heslo|passw|cred|set[-_]?(key|token|secret))/i;
const SECRET_BODY = /(keyring\.set_password|cmdkey\s+\/(add|generic)|security\s+add-generic-password|secret-tool\s+store|vercel\s+env\s+add|gh\s+secret\s+set|Set-Secret\b|New-StoredCredential|wrangler\s+secret\s+put|netlify\s+env:set|firebase\s+functions:secrets:set|fly\s+secrets\s+set)/i;
// jen skutečné vydání: skript, který jen ukládá tajemství, bránu nikdy nedostane (ani s --file)
const RELEASE_BODY = /\b(vercel\s+(--prod|deploy)|deploy\b|publish\b|release\b|git\s+push|netlify\s+deploy|firebase\s+deploy|gh-pages|rsync|scp|wrangler\s+(deploy|publish))/i;
const secretOnly = (base, t) => SECRET_NAME.test(base) || (SECRET_BODY.test(t) && !RELEASE_BODY.test(t.split(/\r?\n/).filter(l => !SECRET_BODY.test(l) && !/^\s*(#|::|rem\b|REM\b)/.test(l)).join('\n')));
const isGate = l => l.includes(MARK) && /gate-check/.test(l);
// Python: rozsah docstringu modulu (0-based, včetně) a index, kam patří brána
function pyLayout(lines) {
  let i = 0; while (i < lines.length && /^(#!|\s*#|\s*$)/.test(lines[i])) i++;
  let ds = null; const m = /^\s*[rRuUbB]{0,2}("""|''')/.exec(lines[i] || '');
  if (m) { const qq = m[1]; const rest = lines[i].slice(lines[i].indexOf(qq) + 3); if (rest.includes(qq)) ds = [i, i]; else { let j = i + 1; while (j < lines.length && !lines[j].includes(qq)) j++; ds = [i, Math.min(j, lines.length - 1)]; } i = ds[1] + 1; }
  for (;;) { let k = i; while (k < lines.length && /^(\s*$|\s*#)/.test(lines[k])) k++; if (k < lines.length && /^from\s+__future__\s+import/.test(lines[k])) { i = k + 1; continue; } break; }
  return { ds, ins: i };
}
// PowerShell: brána až ZA hlavičku skriptu — #requires, komentáře, nápověda <# … #>, using, atributy [CmdletBinding()] a blok param(…).
// Řádek před param() = ParserError a skript nejde spustit (param musí být první příkaz).
function ps1HeaderEnd(lines) {
  let i = 0; const n = lines.length;
  const skipBlank = () => { while (i < n && /^\s*(#(?!>).*)?$/.test(lines[i]) && !/^\s*<#/.test(lines[i])) i++; };
  for (;;) {
    skipBlank(); if (i >= n) return i;
    if (/^\s*<#/.test(lines[i])) { while (i < n && !/#>/.test(lines[i])) i++; i++; continue; }            // nápověda / blokový komentář
    if (/^\s*using\s+(namespace|module|assembly)\b/i.test(lines[i])) { i++; continue; }
    if (/^\s*\[[\w.]+(\(.*)?/.test(lines[i]) && !/^\s*\[[\w.]+\]::/.test(lines[i])) {                     // atribut [CmdletBinding(...)] (i víceřádkový)
      let depth = 0; do { for (const ch of lines[i]) { if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; } i++; } while (i < n && depth > 0); continue; }
    if (/^\s*param\s*\(/i.test(lines[i])) { let depth = 0, started = false;
      while (i < n) { for (const ch of lines[i].replace(/#.*$/, '').replace(/'[^']*'|"[^"]*"/g, '')) { if (ch === '(') { depth++; started = true; } else if (ch === ')') depth--; } i++; if (started && depth <= 0) break; }
      return i; }
    return i;
  }
}
for (const f of files) {
  let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const ext = path.extname(f).toLowerCase(); const base = path.basename(f);
  const nl = t.includes('\r\n') ? '\r\n' : '\n'; let lines = t.split(/\r?\n/);
  let repair = false;
  if (t.includes(MARK)) {
    if (ext === '.ps1') {   // brána před param() (starší verze) → přesunout za hlavičku
      const gi = lines.findIndex(isGate); const rest = lines.filter(l => !isGate(l));
      if (gi < 0) continue; if (gi >= ps1HeaderEnd(rest)) { hotove++; continue; }
      lines = rest; repair = true;
    } else if (ext !== '.py') { if (t.split(/\r?\n/).some(isGate)) hotove++; continue; } else {
    const { ds } = pyLayout(lines); const inDs = i => ds && i >= ds[0] && i <= ds[1];
    if (lines.some((l, i) => isGate(l) && !inDs(i))) { hotove++; continue; } // brána už je na správném místě
    if (!lines.some((l, i) => isGate(l) && inDs(i))) continue;              // značka jen v textu, ne brána
    lines = lines.filter((l, i) => !(isGate(l) && inDs(i))); repair = true; // chybně v docstringu → přesunout za něj
  } }
  if (!explicit.length && !repair) { if (!NAME_RE.test(base) || BAD_DIR.test(f + path.sep) || /^test_/i.test(base)) continue; if (!DEPLOYISH.test(t)) continue; }
  if (secretOnly(base, t)) { skipped.push(path.relative(repo, f)); continue; }
  if (listOnly) { console.log(`${repair ? 'OPRAVIT' : 'KANDIDAT'} ${path.relative(repo, f)}`); continue; }
  let ins = 0, line = '';
  if (ext === '.bat' || ext === '.cmd') { if (/^\s*@echo\s+off/i.test(lines[0] || '')) ins = 1; line = `node ${q(gc)} ${q(repo)} || exit /b 1  &:: ${MARK} - vydani jen se zelenym verdiktem auditora`; }
  else if (ext === '.ps1') { ins = ps1HeaderEnd(lines); line = `node ${q(gc)} ${q(repo)}; if ($LASTEXITCODE -ne 0) { exit 1 }  # ${MARK} - vydani jen se zelenym verdiktem auditora`; }   // jen ASCII: PS 5.1 čte UTF-8 bez BOM jako ANSI
  else if (ext === '.sh') { if (/^#!/.test(lines[0] || '')) ins = 1; line = `node ${q(gc)} ${q(repo)} || exit 1  # ${MARK} - vydani jen se zelenym verdiktem auditora`; }
  else if (ext === '.py') { ins = pyLayout(lines).ins; line = `import subprocess as _ag, sys as _ags; _ag.run(["node", ${JSON.stringify(gc)}, ${JSON.stringify(repo)}]).returncode == 0 or _ags.exit("${MARK}: vydani zakazano - chybi zeleny verdikt auditora")  # ${MARK}`; }
  else continue;
  // cesta s diakritikou (např. …\projekt-hlavní\): cmd čte skript v kódové stránce OEM, PowerShell 5.1 UTF-8 bez BOM jako ANSI → cesta by se rozpadla
  const nonAscii = /[^\x00-\x7f]/.test(line); let bom = t.startsWith('\uFEFF') ? '' : '';
  if (nonAscii && (ext === '.bat' || ext === '.cmd')) {
    const cpL = `for /f "tokens=2 delims=:." %%c in ('chcp') do set "_AG_CP=%%c" &:: ${MARK}-cp`;
    lines.splice(ins, 0, cpL, `chcp 65001 >nul &:: ${MARK}-cp`, line.replace(' || exit /b 1', ' || (chcp %_AG_CP% >nul & exit /b 1)'), `chcp %_AG_CP% >nul &:: ${MARK}-cp`);
  } else if (nonAscii && ext === '.ps1' && !t.startsWith('\uFEFF')) {
    if (t.includes('\uFFFD')) { skipped.push(path.relative(repo, f) + ' (skript je v kódování ANSI a cesta k auditorovi má diakritiku — bránu vlož ručně nebo ulož skript jako UTF-8 s BOM)'); continue; }
    bom = '\uFEFF'; lines.splice(ins, 0, line);   // skript je UTF-8 (nebo ASCII) → BOM, aby ho PowerShell 5.1 četl správně i s diakritikou
  } else lines.splice(ins, 0, line);
  fs.writeFileSync(f, bom + lines.join(nl)); patched.push((repair ? 'OPRAVENO ' : '') + path.relative(repo, f));
}
for (const s of skipped) console.log(`VYNECHANO ${s}${/\(/.test(s) ? '' : ' (skript ukládá tajemství — brána by zablokovala uložení klíče)'}`);
for (const p of patched) console.log(`PATCHED ${p}`);
if (!patched.length && !listOnly && hotove) console.log(`beze změny: ${hotove} skriptů už bránu má`);
else if (!patched.length && !listOnly) console.log('žádný deploy skript v repu nenalezen (hook Kapitána hlídá vercel/git push i tak)');
