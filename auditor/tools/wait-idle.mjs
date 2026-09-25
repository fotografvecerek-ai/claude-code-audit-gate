#!/usr/bin/env node
// WAIT-IDLE — počká, až v projektu neběží jiná session Claude Code (aby neběželi dva Kapitáni souběžně).
// Heuristika: Claude Code zapisuje transkript session do ~/.claude/projects/<zakódovaná cesta>/*.jsonl; žádný zápis N minut = klid.
// node tools/wait-idle.mjs <repo> [minuty klidu, výchozí 3]   → exit 0 když je klid (nebo složka session neexistuje)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const repo = path.resolve(process.argv[2] || '.'); const idleMin = +(process.argv[3] || 3);
const enc = repo.replace(/[^A-Za-z0-9]/g, '-'); const dir = path.join(os.homedir(), '.claude', 'projects', enc);
const lastActivity = () => { let m = 0; try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) { const t = fs.statSync(path.join(dir, f)).mtimeMs; if (t > m) m = t; } } catch { } return m; };
// Nikdy zbytečně nečeká: bez nedávné aktivity spustí hned. S aktivitou se JEDNOU zeptá — Enter (výchozí) = spustit hned
// (vlastník ví, že okno zavřel), 1 = počkat na klid. Bez terminálu spustí hned.
const age0 = (Date.now() - lastActivity()) / 60000;
if (age0 >= idleMin || !process.stdin.isTTY) process.exit(0);
console.log(`\n  V projektu před chvílí pracovala jiná session Claude Code (starý Kapitán, nebo jen automatika na pozadí).`);
console.log('  Enter = starého Kapitána jsem zavřel, spusť hned   ·   1 = ještě běží, počkej na něj   ·   Ctrl+C = zrušit');
let mode = await new Promise(r => { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.once('data', d => { const c = d.toString(); if (c === '\u0003') process.exit(1); r(c.trim() === '1' ? 'wait' : 'go'); }); });
if (mode === 'go') { console.log('  Spouštím Kapitána.'); process.exit(0); }
let force = false; process.stdin.on('data', d => { const c = d.toString(); if (c === '\r' || c === '\n') force = true; if (c === '\u0003') process.exit(1); });
console.log(`  Čekám, až bude ${idleMin} min klid. Enter = spustit hned.`);
for (;;) {
  if (force) { console.log('\n  Spouštím hned (Enter).'); process.exit(0); }
  const ageMin = (Date.now() - lastActivity()) / 60000;
  if (ageMin >= idleMin) { console.log('\n  Starý Kapitán skončil - spouštím.'); process.exit(0); }
  process.stdout.write(`\r  … čekám (klid ${ageMin.toFixed(1)}/${idleMin} min) — Enter = spustit hned   `);
  for (let i = 0; i < 15 && !force; i++) await new Promise(r => setTimeout(r, 1000));
}
