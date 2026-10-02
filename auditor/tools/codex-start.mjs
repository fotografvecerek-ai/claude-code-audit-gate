#!/usr/bin/env node
// CODEX-START — text, který agent v Codexu dostane při startu, resume a po kompakci (SessionStart hook přes codex-hook.mjs --context).
// Obdoba SessionStart hooků z Claude Code: role, zprávy z mostu, nové cíle po aktualizaci.
// node tools/codex-start.mjs auditor|kapitan <workspace>
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const [role, wsArg] = process.argv.slice(2); const ws = path.resolve(wsArg || '.'); const here = path.dirname(fileURLToPath(import.meta.url));
const run = (script, args) => { try { return String(spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 30000 }).stdout || '').trim(); } catch { return ''; } };
const out = [];
if (role === 'kapitan') out.push(run(path.join(here, 'kapitan-role.mjs'), [ws, '--codex']));
else {
  out.push('[ROLE] Jsi AUDITOR (běžíš v Codexu). Ústava = AGENTS.md v tomto workspace. Nekóduješ, nevydáváš; zápis jen do AUDIT/, tools/, build/.');
  out.push('[AUDIT] Po startu/kompakci načti AUDIT/_prubeh.md (z intake a handoffu jen potřebné části); rozjetý audit neopakuj; úsporný režim (§0b). Nové zprávy od Kapitána ti doručí hook po každém kroku a na konci tahu.');
  out.push(run(path.join(here, 'prisnost.mjs'), ['--ws', ws, 'kontext']));
  const nc = path.join(ws, 'AUDIT', 'NOVE_CILE.md');
  if (fs.existsSync(nc)) out.push('[AUDIT] Po aktualizaci balíku jsou nové cíle — udělej JEN je:\n' + fs.readFileSync(nc, 'utf8').split(/\r?\n/).slice(0, 20).join('\n'));
}
const inbox = run([path.join(here, 'bus.mjs'), path.join(ws, 'tools', 'bus.mjs')].find(f => fs.existsSync(f)), ['inbox', '--for', role === 'kapitan' ? 'kapitan' : 'auditor', '--unacked', '--brief']);
if (inbox) out.push(inbox);
// po kompakci / clear: stav práce (AUDIT/_prubeh.md nebo .codex/STATE.md) — stejný nástroj jako v Claude Code
{ let raw = ''; try { raw = fs.readFileSync(0, 'utf8'); } catch { } let src = ''; try { src = JSON.parse(raw || '{}').source || ''; } catch { }
  if (/^(compact|clear)$/.test(src)) { try { const r = spawnSync(process.execPath, [path.join(here, 'stav-session.mjs'), role === 'kapitan' ? 'kapitan' : 'auditor'], { input: raw, encoding: 'utf8', timeout: 15000, env: { ...process.env, AUDITOR_WORKSPACE: ws } });
    const t = JSON.parse(r.stdout || '{}').hookSpecificOutput?.additionalContext; if (t) out.push(t); } catch { } } }
process.stdout.write(out.filter(Boolean).join('\n'));
