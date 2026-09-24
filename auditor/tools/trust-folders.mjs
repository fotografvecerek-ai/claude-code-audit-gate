#!/usr/bin/env node
// TRUST-FOLDERS — předem odsouhlasí v Claude Code složky (workspace auditora + repo), aby se při prvním startu neptal
// "Do you trust the files in this folder?". Upravuje ~/.claude.json (záloha .bak), jen klíč projects[<cesta>].hasTrustDialogAccepted.
// node tools/trust-folders.mjs <složka> [<složka> ...]
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const cfg = path.join(os.homedir(), '.claude.json');
let j = {}; if (fs.existsSync(cfg)) { try { j = JSON.parse(fs.readFileSync(cfg, 'utf8')); } catch (e) { console.error(`trust: ${cfg} nejde přečíst (${e.message}) — přeskočeno; Claude Code se při prvním startu jednou zeptá na důvěru složce.`); process.exit(0); } fs.copyFileSync(cfg, cfg + '.bak'); }
j.projects = j.projects && typeof j.projects === 'object' ? j.projects : {};
const done = [];
for (const a of process.argv.slice(2)) { const p = path.resolve(a); if (!fs.existsSync(p)) continue; const cur = j.projects[p] && typeof j.projects[p] === 'object' ? j.projects[p] : {}; if (cur.hasTrustDialogAccepted !== true) { j.projects[p] = { ...cur, hasTrustDialogAccepted: true }; done.push(p); } }
if (done.length) { fs.writeFileSync(cfg, JSON.stringify(j, null, 2) + '\n'); console.log(`trust: složky odsouhlaseny pro Claude Code (${done.length}): ${done.join(', ')}`); } else console.log('trust: složky už byly odsouhlasené');
