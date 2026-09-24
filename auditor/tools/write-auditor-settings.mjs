#!/usr/bin/env node
// WRITE-AUDITOR-SETTINGS — zapíše <workspace>/.claude/settings.json ze šablony balíku s reálnými cestami a modelem (Node = deterministický JSON).
// node tools/write-auditor-settings.mjs <workspace> <repo> <model>
import fs from 'node:fs'; import path from 'node:path';
const ws = path.resolve(process.argv[2]); const repo = path.resolve(process.argv[3]); const model = process.argv[4] || 'claude-fable-5-1';
const posix = p => { p = p.replace(/\\/g, '/'); const m = p.match(/^([A-Za-z]):\/(.*)$/); return m ? `/${m[1].toLowerCase()}/${m[2]}` : p; };
const wsP = posix(ws), repoP = posix(repo);
const tpl = path.join(ws, '.claude', 'settings.json'); const s = JSON.parse(fs.readFileSync(tpl, 'utf8').replace(/^﻿/, ''));
const fix = x => typeof x === 'string' ? x.replace(/\/\/c\/dev\/\[DOPLŇ-repo\]-audit/g, '/' + wsP).replace(/\/c\/dev\/\[DOPLŇ-repo\]-audit/g, wsP).replace(/\/\/c\/dev\/\[DOPLŇ-repo\]/g, '/' + repoP).replace(/\/c\/dev\/\[DOPLŇ-repo\]/g, repoP) : x;
s.permissions = s.permissions || {}; s.permissions.defaultMode = 'auto'; s.permissions.deny = (s.permissions.deny || []).map(fix); s.permissions.allow = s.permissions.allow || [];
s.env = { ...(s.env || {}), AUDITOR_WORKSPACE: wsP, AUDITOR_TARGET_REPO: repoP }; s.model = model; s.autoCompactEnabled = true;
s.statusLine = { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/tools/statusline.mjs"' };
if (JSON.stringify(s).includes('[DOPLŇ')) { console.error('settings stále obsahují placeholder [DOPLŇ] — šablona se změnila?'); process.exit(1); }
fs.writeFileSync(tpl, JSON.stringify(s, null, 2) + '\n'); console.log(`settings auditora: ${tpl} (model ${model}, deny ${s.permissions.deny.length}, allow ${s.permissions.allow.length})`);
