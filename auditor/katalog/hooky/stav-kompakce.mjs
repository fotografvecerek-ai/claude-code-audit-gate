#!/usr/bin/env node
// KATALOG · stav-kompakce — SessionStart (matcher "compact"): hned po kompakci kontextu vloží začátek STATE.md (kde pokračovat),
// aby agent nenavazoval naslepo. Hledá .claude/STATE.md, STATE.md, docs/STATE.md. Max 60 řádků. Nic nenajde = nic nevloží.
import fs from 'node:fs'; import path from 'node:path';
try {
  const inp = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); if (inp.source && inp.source !== 'compact') process.exit(0);
  const root = process.env.CLAUDE_PROJECT_DIR || inp.cwd || process.cwd();
  const f = ['.claude/STATE.md', 'STATE.md', 'docs/STATE.md'].map(x => path.join(root, x)).find(x => fs.existsSync(x)); if (!f) process.exit(0);
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/); const txt = lines.slice(0, 60).join('\n') + (lines.length > 60 ? `\n… (+${lines.length - 60} řádků — drž STATE.md kratší)` : '');
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `[STAV PO KOMPAKCI — ${path.relative(root, f)}]\nPokračuj první nehotovou položkou, neptej se, jestli pokračovat.\n${txt}` } }));
  process.exit(0);
} catch { process.exit(0); }
