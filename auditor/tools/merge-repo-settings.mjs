#!/usr/bin/env node
// MERGE-REPO-SETTINGS — sloučí stranu Kapitána do <repo>/.claude/settings.json deterministicky (Node, ne PowerShell: PS 5.1 rozbaluje
// jednoprvková pole na skalár a Claude Code pak celý soubor přeskočí = Kapitán bez pojistek). Idempotentní; cizí hooky/nastavení zachová.
// node tools/merge-repo-settings.mjs <repo> <workspace>
import fs from 'node:fs'; import path from 'node:path';
const repo = path.resolve(process.argv[2]); const ws = path.resolve(process.argv[3]);
const posix = p => { p = p.replace(/\\/g, '/'); const m = p.match(/^([A-Za-z]):\/(.*)$/); return m ? `/${m[1].toLowerCase()}/${m[2]}` : p; };
const wsP = posix(ws), repoP = posix(repo);
const sp = path.join(repo, '.claude', 'settings.json'); fs.mkdirSync(path.dirname(sp), { recursive: true });
let s = {}; if (fs.existsSync(sp)) { const raw = fs.readFileSync(sp, 'utf8').replace(/^﻿/, ''); try { s = JSON.parse(raw); } catch (e) { fs.copyFileSync(sp, sp + '.broken-' + Date.now()); console.error(`settings.json nebyl platný JSON (${e.message}) — záloha vedle, začínám od prázdného`); s = {}; } }
const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];   // oprava rozbalených polí z dřívějších verzí
s.env = { ...(s.env && typeof s.env === 'object' ? s.env : {}), AUDITOR_WORKSPACE: wsP, AUDITOR_TARGET_REPO: repoP };
s.permissions = s.permissions && typeof s.permissions === 'object' ? s.permissions : {};
s.permissions.additionalDirectories = [...new Set([...arr(s.permissions.additionalDirectories).map(String), ws.replace(/\\/g, '/')])];
s.hooks = s.hooks && typeof s.hooks === 'object' ? s.hooks : {};
const has = (list, needle) => list.some(e => JSON.stringify(e).includes(needle));
const pre = arr(s.hooks.PreToolUse); if (!has(pre, 'kapitan-audit-guard.js')) pre.push({ matcher: 'Edit|Write|NotebookEdit|Bash|PowerShell', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/kapitan-audit-guard.js" || exit 2', timeout: 15 }] }); s.hooks.PreToolUse = pre;
const ss = arr(s.hooks.SessionStart); if (!has(ss, 'inbox --for kapitan')) ss.push({ matcher: 'startup|resume|compact', hooks: [{ type: 'command', command: `node "${wsP}/tools/bus.mjs" inbox --for kapitan --unacked --brief` }] }); s.hooks.SessionStart = ss;
for (const k of Object.keys(s.hooks)) s.hooks[k] = arr(s.hooks[k]).map(e => (e && typeof e === 'object' && e.hooks !== undefined) ? { ...e, hooks: arr(e.hooks) } : e);
fs.writeFileSync(sp, JSON.stringify(s, null, 2) + '\n');
console.log(`settings Kapitána sloučeny: ${sp} (hooky PreToolUse ${s.hooks.PreToolUse.length}, SessionStart ${s.hooks.SessionStart.length}, additionalDirectories ${s.permissions.additionalDirectories.length})`);
