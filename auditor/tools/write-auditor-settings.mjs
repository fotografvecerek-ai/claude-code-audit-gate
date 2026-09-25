#!/usr/bin/env node
// WRITE-AUDITOR-SETTINGS — zapíše <workspace>/.claude/settings.json ze šablony balíku s reálnými cestami a modelem (Node = deterministický JSON).
// node tools/write-auditor-settings.mjs <workspace> <repo> <model>
import fs from 'node:fs'; import path from 'node:path';
const ws = path.resolve(process.argv[2]); const repo = path.resolve(process.argv[3]); const model = process.argv[4] || 'best';   // alias: nejlepší dostupný model (Fable, jinak Opus), posouvá se sám
const posix = p => { p = p.replace(/\\/g, '/'); const m = p.match(/^([A-Za-z]):\/(.*)$/); return m ? `/${m[1].toLowerCase()}/${m[2]}` : p; };
const wsP = posix(ws), repoP = posix(repo);
const tpl = path.join(ws, '.claude', 'settings.json'); const s = JSON.parse(fs.readFileSync(tpl, 'utf8').replace(/^﻿/, ''));
const fix = x => typeof x === 'string' ? x.replace(/\/\/c\/dev\/\[DOPLŇ-repo\]-audit/g, '/' + wsP).replace(/\/c\/dev\/\[DOPLŇ-repo\]-audit/g, wsP).replace(/\/\/c\/dev\/\[DOPLŇ-repo\]/g, '/' + repoP).replace(/\/c\/dev\/\[DOPLŇ-repo\]/g, repoP) : x;
s.permissions = s.permissions || {}; s.permissions.defaultMode = 'auto'; s.permissions.deny = (s.permissions.deny || []).map(fix); s.permissions.allow = s.permissions.allow || [];
s.env = { ...(s.env || {}), AUDITOR_WORKSPACE: wsP, AUDITOR_TARGET_REPO: repoP }; s.model = model; s.autoCompactEnabled = true; s.autoCompactWindow = s.autoCompactWindow || 200000;   // úsporný režim: kompakce u ~200 tis. tokenů, ne u ~1 mil.
s.statusLine = { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/tools/statusline.mjs"' };
if (JSON.stringify(s).includes('[DOPLŇ')) { console.error('settings stále obsahují placeholder [DOPLŇ] — šablona se změnila?'); process.exit(1); }
fs.writeFileSync(tpl, JSON.stringify(s, null, 2) + '\n'); console.log(`settings auditora: ${tpl} (model ${model}, deny ${s.permissions.deny.length}, allow ${s.permissions.allow.length})`);
// otisky nástrojů při instalaci (update-install podle nich pozná, co si auditor v tools/ upravil); při aktualizaci je zapisuje update-install
{ const TW = path.join(ws, 'tools'), MF = path.join(TW, '.balik-otisky.json');
  if (fs.existsSync(TW) && !fs.existsSync(MF)) { const { createHash } = await import('node:crypto');
    const walk = (d, pre = '') => { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === '.balik-otisky.json' || e.name === 'mistni') continue; const r = pre ? `${pre}/${e.name}` : e.name; if (e.isDirectory()) o = o.concat(walk(path.join(d, e.name), r)); else o.push(r); } return o; };
    fs.writeFileSync(MF, JSON.stringify({ _: 'Otisky nástrojů z balíku (update-install podle nich pozná úpravy auditora). Needitovat.', soubory: Object.fromEntries(walk(TW).map(r => [r, createHash('sha256').update(fs.readFileSync(path.join(TW, r))).digest('hex')])) }, null, 1) + '\n'); } }
