#!/usr/bin/env node
// WAIT-IDLE — počká, až v projektu neběží jiná session Claude Code (aby neběželi dva Kapitáni souběžně).
// Heuristika: Claude Code zapisuje transkript session do ~/.claude/projects/<zakódovaná cesta>/*.jsonl; žádný zápis N minut = klid.
// node tools/wait-idle.mjs <repo> [minuty klidu, výchozí 3]   → exit 0 když je klid (nebo složka session neexistuje)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const repo = path.resolve(process.argv[2] || '.'); const idleMin = +(process.argv[3] || 3);
const enc = repo.replace(/[^A-Za-z0-9]/g, '-'); const dir = path.join(os.homedir(), '.claude', 'projects', enc);
const lastActivity = () => { let m = 0; try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) { const t = fs.statSync(path.join(dir, f)).mtimeMs; if (t > m) m = t; } } catch { } return m; };
let shown = false; let force = false;
if (process.stdin.isTTY) { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', d => { const c = d.toString(); if (c === '\r' || c === '\n') force = true; if (c === '\u0003') process.exit(1); }); }
for (;;) {
  if (force) { console.log('\n  Spouštím hned (Enter). Pozor: pokud v projektu opravdu běží jiný Kapitán, pracují teď dva.'); process.exit(0); }
  const ageMin = (Date.now() - lastActivity()) / 60000;
  if (ageMin >= idleMin) { if (shown) console.log('\n  Původní Kapitán skončil (bez aktivity) - spouštím.'); process.exit(0); }
  if (!shown) { console.log(`  V projektu je aktivní jiná session Claude Code (poslední zápis před ${ageMin.toFixed(1)} min).\n  Čekám, až původní Kapitán skončí (${idleMin} min bez aktivity). Enter = spustit hned (např. když je ta aktivita jen automatika na pozadí); Ctrl+C = zrušit.`); shown = true; }
  process.stdout.write(`\r  … čekám (klid ${ageMin.toFixed(1)}/${idleMin} min)   `);
  await new Promise(r => setTimeout(r, 15000));
}
