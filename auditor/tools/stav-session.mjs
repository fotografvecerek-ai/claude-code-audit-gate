#!/usr/bin/env node
// STAV-SESSION — SessionStart hook (compact | clear): hned po kompakci kontextu nebo po /clear vloží agentovi jeho stavový soubor
// (kde jsme, co je hotovo, další krok), aby nenavazoval naslepo a vlastník nemusel nic kopírovat mezi okny.
//   node tools/stav-session.mjs auditor   → <workspace>/AUDIT/_prubeh.md
//   node tools/stav-session.mjs kapitan   → <repo>/.claude/STATE.md (nebo STATE.md, docs/STATE.md, .codex/STATE.md)
// Stav zapisuje agent průběžně a skill `predani` před /clear. Max 80 řádků. Při startu/resume nic nevkládá (tam platí běžné hooky).
// Nikdy neblokuje: při potížích nic nevypíše a skončí 0.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
try {
  const role = process.argv[2] === 'kapitan' ? 'kapitan' : 'auditor';
  let inp = {}; try { inp = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { }
  if (inp.source && !/^(compact|clear)$/.test(inp.source)) process.exit(0);
  const ws = process.env.AUDITOR_WORKSPACE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const root = role === 'auditor' ? ws : (process.env.CLAUDE_PROJECT_DIR || inp.cwd || process.cwd());
  const kandidati = role === 'auditor' ? ['AUDIT/_prubeh.md'] : ['.claude/STATE.md', 'STATE.md', 'docs/STATE.md', '.codex/STATE.md'];
  const f = kandidati.map(x => path.join(root, x)).find(x => fs.existsSync(x));
  const kde = role === 'auditor' ? 'AUDIT/_prubeh.md' : process.env.AUDITOR_HARNESS === 'codex' ? '.codex/STATE.md' : '.claude/STATE.md';
  let txt;
  if (!f) txt = `Stavový soubor ${kde} zatím neexistuje. Založ ho hned (≤ 1 obrazovka: úloha, hotovo, další krok, rozhodnutí, otevřené otázky) a drž ho aktuální po každém dokončeném kroku.`;
  else { const lines = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/); txt = lines.slice(0, 80).join('\n') + (lines.length > 80 ? `\n… (+${lines.length - 80} řádků — zkrať ${path.relative(root, f)} na 1 obrazovku; starší věci do archivu)` : ''); }
  const hlava = `[STAV PO ${inp.source === 'clear' ? '/clear' : 'KOMPAKCI'} — ${f ? path.relative(root, f).replace(/\\/g, '/') : kde}] Navaž první nehotovou položkou; hotové neopakuj a neptej se, jestli pokračovat. Soubory čti jen ty, které další krok potřebuje.`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `${hlava}\n${txt}` } }));
  process.exit(0);
} catch { process.exit(0); }
