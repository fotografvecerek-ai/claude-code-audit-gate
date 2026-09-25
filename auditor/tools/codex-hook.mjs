#!/usr/bin/env node
// CODEX-HOOK — adaptér: hooky Codexu (OpenAI Codex CLI) → stejné pojistky, které Auditor používá v Claude Code.
// Codex posílá hookům skoro stejný JSON jako Claude Code (tool_name, tool_input, cwd, exit 2 = zablokovat). Rozdíly, které tu řešíme:
//   • úpravy souborů jdou přes nástroj `apply_patch` (tool_input.command = text patche) → rozložíme na jednotlivé soubory
//     a každý pošleme pojistce jako Claude událost Write/Edit s absolutní cestou,
//   • Codex nenastavuje CLAUDE_PROJECT_DIR ani env ze settings → nastavíme AUDITOR_WORKSPACE / AUDITOR_TARGET_REPO,
//   • kontext pro model chce Codex jako JSON (hookSpecificOutput.additionalContext) → režim --context obalí textový výstup.
// Použití (v .codex/hooks.json):
//   node codex-hook.mjs --ws <workspace> --repo <repo> --guard <pojistka.js>          PreToolUse (Bash, apply_patch, Edit, Write)
//   node codex-hook.mjs --ws <workspace> --repo <repo> --context <Událost> -- <příkaz…>  SessionStart apod.: text příkazu → additionalContext
// Pojistka při chybě adaptéru blokuje (fail-closed); kontextový režim nikdy neblokuje.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const a = process.argv.slice(2); const val = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; };
const ws = val('--ws'), repo = val('--repo'), guard = val('--guard'), ctxEv = val('--context');
const env = { ...process.env, AUDITOR_WORKSPACE: ws, AUDITOR_TARGET_REPO: repo };
let raw = ''; try { raw = fs.readFileSync(0, 'utf8'); } catch { }
let input = {}; try { input = JSON.parse(raw || '{}'); } catch { if (guard) { process.stderr.write('CODEX-HOOK Blocked: vstup hooku není JSON (fail-closed).\n'); process.exit(2); } }
const cwd = input.cwd || process.cwd(); env.CLAUDE_PROJECT_DIR = env.CLAUDE_PROJECT_DIR || cwd;

// soubory z patche Codexu: *** Add File: p / *** Update File: p / *** Delete File: p / *** Move to: p
// cesta vždy přes path.resolve (normalizuje „..", „.", lomítka); prefix \\?\ pryč — jinak by „repo/src/../../ws/AUDIT/…" prošlo pojistkou
const abs = (base, p) => {
  let r = path.resolve(base, String(p).trim().replace(/^\\\\[?.]\\/, ''));
  if (process.platform === 'win32') r = r.split(/[\\/]/).map((g, i) => i ? g.replace(/[. ]+$/, '') : g).join('\\');   // Windows ignoruje tečky/mezery na konci jmen
  // krátká jména 8.3 (APP-AU~1) a odkazy: nejbližší existující předek přes realpath → skutečná cesta
  let head = r, tail = ''; while (!fs.existsSync(head)) { const up = path.dirname(head); if (up === head) break; tail = path.join(path.basename(head), tail); head = up; }
  try { return path.join(fs.realpathSync.native(head), tail); } catch { return r; }
};
function patchFiles(text, base) {
  const out = [];
  for (const m of String(text || '').matchAll(/^\s*\*\*\*\s*(Add|Update|Delete) File:\s*(.+?)\s*$|^\s*\*\*\*\s*Move to:\s*(.+?)\s*$/gm)) out.push({ kind: m[1] || 'Move', file: abs(base, m[2] || m[3]) });
  return out;
}

if (ctxEv) {   // obal textového výstupu příkazu do JSON kontextu Codexu
  const k = a.indexOf('--'); const cmd = k >= 0 ? a.slice(k + 1) : [];
  if (!cmd.length) process.exit(0);
  const r = spawnSync(cmd[0] === 'node' ? process.execPath : cmd[0], cmd.slice(1), { input: raw, env, encoding: 'utf8', timeout: 60000 });
  const text = String(r.stdout || '').trim();
  if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: ctxEv, additionalContext: text } }));
  process.exit(0);
}

if (!guard) process.exit(0);
if (!fs.existsSync(guard)) { process.stderr.write(`CODEX-HOOK Blocked: pojistka ${guard} chybí (fail-closed) — spusť aktualizaci Auditoru.\n`); process.exit(2); }
const run = ev => { const r = spawnSync(process.execPath, [guard], { input: JSON.stringify(ev), env, encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) { process.stderr.write(r.stderr || `CODEX-HOOK Blocked: pojistka skončila chybou (${r.status}) — fail-closed.\n`); process.exit(2); } };
const tool = String(input.tool_name || ''); const ti = input.tool_input || {};
const cmdText = Array.isArray(ti.command) ? ti.command.join(' ') : String(ti.command || '');
const hasPatch = /\*\*\*\s*Begin Patch/i.test(cmdText);
if (/^apply_patch$/i.test(tool) || hasPatch) {   // i patch poslaný přes shell (apply_patch <<EOF) se kontroluje po souborech
  const files = patchFiles(cmdText, cwd);
  if (!files.length) { process.stderr.write('CODEX-HOOK Blocked: patch bez rozpoznatelných souborů (fail-closed).\n'); process.exit(2); }
  for (const f of files) run({ ...input, tool_name: f.kind === 'Add' ? 'Write' : 'Edit', tool_input: { file_path: f.file }, cwd });
  if (!/^apply_patch$/i.test(tool)) run({ ...input, tool_name: 'Bash', tool_input: { ...ti, command: cmdText }, cwd });
  process.exit(0);
}
if (/^(Bash|shell|exec_command|local_shell)$/i.test(tool)) { run({ ...input, tool_name: 'Bash', tool_input: { ...ti, command: cmdText }, cwd }); process.exit(0); }
if (/^(Edit|Write)$/.test(tool)) { const fp = ti.file_path || ti.path; if (!fp) { process.stderr.write('CODEX-HOOK Blocked: úprava bez cesty (fail-closed).\n'); process.exit(2); } run({ ...input, tool_input: { ...ti, file_path: abs(cwd, fp) }, cwd }); process.exit(0); }
run({ ...input, cwd }); process.exit(0);
