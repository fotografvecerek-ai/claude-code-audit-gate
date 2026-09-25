#!/usr/bin/env node
// CODEX-SETUP — auditor a/nebo Kapitán v OpenAI Codex CLI místo Claude Code (všechny kombinace).
//   node tools/codex-setup.mjs --ws <workspace> --repo <repo> [--auditor codex|claude] [--kapitan codex|claude] [--yes]
// Co udělá pro roli v Codexu:
//   • pravidla: AGENTS.md (Codex čte AGENTS.md; auditor = ústava z CLAUDE.md, Kapitán = blok role v AGENTS.md repa),
//   • pojistky: .codex/hooks.json → codex-hook.mjs → TYTÉŽ pojistky jako v Claude Code (auditor-guard, kapitan-audit-guard),
//     most: bus-notify po každém kroku a na konci tahu, codex-start při startu; cizí hooky v hooks.json zůstávají,
//   • CHRÁNĚNÁ SLOŽKA HOOKŮ: skripty pojistek a jejich otisky leží v <CODEX_HOME>/auditor/<projekt>-<otisk>/, kam žádný z agentů
//     v sandboxu Codexu nezapíše (Kapitán má zápis jen do repa + AUDIT/03_dukazy + AUDIT/bus, auditor jen do svého workspace),
//   • spouštěč ověří otisky i důvěryhodnost projektu; jen při shodě použije --dangerously-bypass-hook-trust, jinak odmítne start,
//   • projekt/workspace jako důvěryhodný v ~/.codex/config.toml (jinak Codex projektové .codex/ nenačte).
// Volba se pamatuje v <ws>/.agents.json; aktualizace ji obnoví bez otázek.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import readline from 'node:readline'; import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const a = process.argv; const val = k => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : ''; };
const here = path.dirname(fileURLToPath(import.meta.url)); const pkgRoot = path.resolve(here, '..');   // pojistky VŽDY z balíku, ne z kopií, které mohou agenti upravit
const ws = path.resolve(val('--ws') || '.'); const repo = path.resolve(val('--repo') || path.join(ws, '..', path.basename(ws).replace(/-audit$/, '')));
const YES = a.includes('--yes') || !process.stdin.isTTY; const isWin = process.platform === 'win32';
const say = s => console.log(s); const ok = s => console.log(`  ✅ ${s}`); const warn = s => console.log(`  ⚠ ${s}`);
const q = p => `"${p.replace(/\\/g, '/')}"`;
const has = c => { try { execFileSync(isWin ? 'where' : 'which', [c], { stdio: 'ignore' }); return true; } catch { return false; } };
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const HD = path.join(CODEX_HOME, 'auditor', `${path.basename(repo).replace(/[^\w.-]+/g, '_')}-${crypto.createHash('sha1').update(ws.toLowerCase()).digest('hex').slice(0, 8)}`);
const cfgF = path.join(ws, '.agents.json'); let cfg = { auditor: 'claude', kapitan: 'claude' }; try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgF, 'utf8')) }; } catch { }
const remoteOrCombo = fs.existsSync(path.join(ws, 'AUDIT', '.remote.json')) || fs.existsSync(path.join(ws, 'AUDIT', '.zdravy-start.json'));
const kapHooks = path.join(repo, '.claude', 'hooks'); const kapitanSide = !remoteOrCombo && fs.existsSync(path.join(kapHooks, 'kapitan-audit-guard.js'));

// ---------- volba
let aud = val('--auditor'), kap = val('--kapitan');
if (!aud && !kap && !YES) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const cur = cfg.auditor === 'codex' ? (cfg.kapitan === 'codex' ? '4' : '3') : cfg.kapitan === 'codex' ? '2' : '1';
  say('\n== V čem mají agenti běžet?');
  say('  [1] oba v Claude Code');
  if (kapitanSide) say('  [2] Kapitán v Codexu, auditor v Claude Code');
  say('  [3] auditor v Codexu' + (kapitanSide ? ', Kapitán v Claude Code' : ''));
  if (kapitanSide) say('  [4] oba v Codexu');
  const ans = await new Promise(r => rl.question(`Volba (Enter = ${cur}): `, x => { rl.close(); r(x.trim() || cur); }));
  aud = ['3', '4'].includes(ans) ? 'codex' : 'claude'; kap = ['2', '4'].includes(ans) ? 'codex' : 'claude';
}
aud = ['codex', 'claude'].includes(aud) ? aud : cfg.auditor; kap = ['codex', 'claude'].includes(kap) ? kap : cfg.kapitan;
if (kap === 'codex' && !kapitanSide) { warn(remoteOrCombo ? 'u tohoto auditu Kapitán neběží (GitHub/kombinace) — Codex jen pro auditora' : 'strana Kapitána není nainstalovaná (chybí .claude/hooks/kapitan-audit-guard.js) — Kapitán zůstává v Claude Code'); kap = 'claude'; }

// ---------- Codex CLI
if ((aud === 'codex' || kap === 'codex') && !has('codex')) {
  if (YES) warn('Codex CLI (příkaz codex) není nainstalovaný — nainstaluj: npm i -g @openai/codex  (pak se při prvním spuštění přihlas účtem ChatGPT)');
  else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise(r => rl.question('Codex CLI není nainstalovaný. Nainstalovat teď (npm i -g @openai/codex)? [1] ano  [2] ne  → Enter = 1: ', x => { rl.close(); r(x.trim() || '1'); }));
    if (ans === '1') { const r = spawnSync('npm', ['i', '-g', '@openai/codex'], { stdio: 'inherit', shell: isWin }); if (r.status === 0) ok('Codex CLI nainstalován — při prvním spuštění se přihlásíš účtem ChatGPT'); else warn('instalace Codexu selhala — zkus ručně: npm i -g @openai/codex'); }
  }
}

// ---------- hooks.json: naše položky nahradit, cizí nechat (nečitelný soubor NEPŘEPISUJEME)
const OURS = /codex-hook\.mjs|bus-notify\.mjs|codex-start\.mjs/;
function writeHooks(dir, entries) {
  const f = path.join(dir, '.codex', 'hooks.json'); fs.mkdirSync(path.dirname(f), { recursive: true });
  let h = {};
  if (fs.existsSync(f)) { try { h = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { console.error(`  ❌ ${f} nejde přečíst (neplatný JSON) — nepřepisuji ho, oprav ho nebo smaž a spusť znovu.`); process.exit(1); } }
  h.hooks = h.hooks && typeof h.hooks === 'object' ? h.hooks : {};
  for (const ev of Object.keys(h.hooks)) { h.hooks[ev] = (h.hooks[ev] || []).map(m => ({ ...m, hooks: (m.hooks || []).filter(x => !OURS.test(x.command || '')) })).filter(m => m.hooks.length); if (!h.hooks[ev].length) delete h.hooks[ev]; }
  for (const [ev, matcher, hooks] of entries) (h.hooks[ev] ||= []).push({ ...(matcher ? { matcher } : {}), hooks });
  h.description = h.description || 'Pojistky Auditoru pro Codex (spravuje tools/codex-setup.mjs; cizí položky zůstávají).';
  fs.writeFileSync(f, JSON.stringify(h, null, 2) + '\n'); return f;
}
function removeHooks(dir) { if (fs.existsSync(path.join(dir, '.codex', 'hooks.json'))) writeHooks(dir, []); }

// ---------- důvěra projektu v ~/.codex/config.toml (bez ní Codex projektové .codex/ nenačte); klíč může být "…" i '…'
const samePath = (x, y) => { const n = p => path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, ''); return isWin ? n(x).toLowerCase() === n(y).toLowerCase() : n(x) === n(y); };
function trust(dir) {
  const f = path.join(CODEX_HOME, 'config.toml'); let s = ''; try { s = fs.readFileSync(f, 'utf8'); } catch { }
  const lines = s.split(/\r?\n/); let at = -1;
  for (let i = 0; i < lines.length; i++) { const m = lines[i].match(/^\s*\[projects\.(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\]\s*(#.*)?$/); if (m) { const key = m[1] != null ? m[1].replace(/\\(.)/g, '$1') : m[2]; if (samePath(key, dir)) { at = i; break; } } }
  if (at >= 0) {   // tabulka existuje: trust_level nastavit/opravit, nic nezdvojovat
    let j = at + 1; let set = false;
    for (; j < lines.length && !/^\s*\[/.test(lines[j]); j++) if (/^\s*trust_level\s*=/.test(lines[j])) { if (!/"trusted"|'trusted'/.test(lines[j])) warn(`Codex měl ${dir} jako nedůvěryhodný — nastavuji trusted (jinak by se pojistky nenačetly)`); lines[j] = 'trust_level = "trusted"'; set = true; }
    if (!set) lines.splice(at + 1, 0, 'trust_level = "trusted"');
    fs.writeFileSync(f, lines.join('\n').replace(/\s*$/, '') + '\n'); return;
  }
  fs.mkdirSync(CODEX_HOME, { recursive: true });
  const key = dir.includes("'") ? `"${dir.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : `'${dir}'`;   // literální řetězec: Windows cesty bez escapování
  fs.writeFileSync(f, s.replace(/\s*$/, '') + (s.trim() ? '\n\n' : '') + `[projects.${key}]\ntrust_level = "trusted"\n`);
}

// ---------- chráněná složka hooků (mimo dosah agentů v sandboxu)
function prepareHD() {
  fs.rmSync(HD, { recursive: true, force: true }); fs.mkdirSync(HD, { recursive: true });
  fs.writeFileSync(path.join(HD, 'package.json'), '{ "type": "commonjs" }\n');   // pojistky .js jsou CommonJS
  const cp = (src, name) => { if (fs.existsSync(src)) fs.copyFileSync(src, path.join(HD, name || path.basename(src))); };
  for (const f of ['codex-hook.mjs', 'codex-hooks-check.mjs', 'codex-start.mjs', 'bus-notify.mjs', 'kapitan-role.mjs', 'bus.mjs', 'wait-idle.mjs']) cp(path.join(here, f), f);
  cp(path.join(pkgRoot, '.claude', 'hooks', 'auditor-guard.js'));
  cp(path.join(pkgRoot, 'kapitan-side', 'kapitan-audit-guard.js')); cp(path.join(pkgRoot, 'kapitan-side', 'gate-check.mjs'));
  for (const f of ['hygiene-rules.js', 'hygiene-rules.json']) cp(path.join(pkgRoot, 'kapitan-side', 'hygiene', f));
  for (const f of ['codex-hook.mjs', 'kapitan-audit-guard.js', 'auditor-guard.js']) if (!fs.existsSync(path.join(HD, f))) { console.error(`  ❌ v balíku chybí ${f} — spusť z úplného balíku Auditoru`); process.exit(1); }
}
const H = f => path.join(HD, f);
const guardEntry = guard => ['PreToolUse', 'Bash|apply_patch|Edit|Write', [{ type: 'command', command: ['node', q(H('codex-hook.mjs')), '--ws', q(ws), '--repo', q(repo), '--guard', q(H(guard))].join(' '), timeout: 30, statusMessage: 'Pojistka Auditoru' }]];
const startEntry = role => ['SessionStart', 'startup|resume|clear|compact', [{ type: 'command', command: ['node', q(H('codex-hook.mjs')), '--ws', q(ws), '--repo', q(repo), '--context', 'SessionStart', '--', 'node', q(H('codex-start.mjs')), role, q(ws)].join(' '), timeout: 60 }]];
const busEntries = role => [['PostToolUse', '.*', [{ type: 'command', command: ['node', q(H('bus-notify.mjs')), '--ws', q(ws), '--for', role, '--event', 'post'].join(' '), timeout: 15 }]],
  ['Stop', '', [{ type: 'command', command: ['node', q(H('bus-notify.mjs')), '--ws', q(ws), '--for', role, '--event', 'stop', '--once'].join(' '), timeout: 15 }]]];

say('\n== Codex: nastavení agentů');
const trusted = [];
if (aud === 'codex' || kap === 'codex') prepareHD();
// ---------- auditor
if (aud === 'codex') {
  const cm = path.join(ws, 'CLAUDE.md'); const body = fs.existsSync(cm) ? fs.readFileSync(cm, 'utf8') : '';
  fs.writeFileSync(path.join(ws, 'AGENTS.md'), `<!-- Vygenerováno tools/codex-setup.mjs z CLAUDE.md — needitovat ručně (přepíše se při aktualizaci). -->
# Auditor v Codexu
Běžíš v OpenAI Codex CLI. Ústava níže platí beze změny; nástroje Claude Code překládej takto:
- Úpravy souborů = \`apply_patch\` (pojistka hlídá stejná pravidla: zápis jen AUDIT/, tools/, build/; „Blocked" je správně).
- AskUserQuestion = obyčejná otázka v okně (max 3 najednou, s doporučenou odpovědí). TaskCreate/TaskList = průběh v \`AUDIT/_prubeh.md\`.
- Subagenti = subagenti Codexu, jsou-li dostupní; jinak dávky za sebou. WebSearch/WebFetch = vyhledávání Codexu (okno běží s --search).
- Hlídače na pozadí (run_in_background) nespouštěj — nové zprávy od Kapitána ti doručí hook po každém kroku a na konci tahu.
- Telegram kanál Claude Code v Codexu není; vlastníkovi píšeš v okně a do \`AUDIT/ZPRAVA.html\`.

${body}`);
  writeHooks(ws, [guardEntry('auditor-guard.js'), startEntry('auditor'), ...busEntries('auditor')]); trust(ws); trusted.push(ws);
  ok('auditor poběží v Codexu (AGENTS.md, pojistky .codex/hooks.json, sandbox: zapisuje jen do svého workspace, repo jen čte)');
} else removeHooks(ws);
// ---------- Kapitán
if (kap === 'codex') {
  spawnSync(process.execPath, [H('kapitan-role.mjs'), ws, '--agents-md', repo], { stdio: 'ignore' });
  writeHooks(repo, [guardEntry('kapitan-audit-guard.js'), startEntry('kapitan'), ...busEntries('kapitan')]); trust(repo); trusted.push(repo);
  ok('Kapitán poběží v Codexu (role v AGENTS.md projektu, pojistky .codex/hooks.json; zápis jen do repa, AUDIT/03_dukazy a AUDIT/bus)');
  warn('hooky projektu pro Claude Code (.claude/settings.json) Codex nespouští — v Codexu platí jen pojistky Auditoru');
} else if (kapitanSide) removeHooks(repo);
// ---------- otisky (vždy znovu od nuly) + chráněná složka pro spouštěč
if (aud === 'codex' || kap === 'codex') {
  const cfgToml = d => { const f = path.join(d, '.codex', 'config.toml'); return fs.existsSync(f) ? [f] : []; };   // projektový config.toml Codexu (sandbox, MCP) — hlídá se taky
  const files = [...(aud === 'codex' ? [path.join(ws, '.codex', 'hooks.json'), ...cfgToml(ws)] : []), ...(kap === 'codex' ? [path.join(repo, '.codex', 'hooks.json'), ...cfgToml(repo)] : []),
    ...fs.readdirSync(HD).filter(f => f !== 'otisky.json').map(f => H(f))];
  spawnSync(process.execPath, [H('codex-hooks-check.mjs'), HD, '--register', ...files, '--trusted', ...trusted, '--codex-home', CODEX_HOME], { stdio: 'ignore' });
} else fs.rmSync(HD, { recursive: true, force: true });
cfg = { auditor: aud, kapitan: kap, hooky: (aud === 'codex' || kap === 'codex') ? HD : '', zmeneno: new Date().toISOString() };
fs.writeFileSync(cfgF, JSON.stringify(cfg, null, 2) + '\n');
const wl = [path.join(here, 'write-launchers.mjs'), path.join(ws, 'tools', 'write-launchers.mjs')].find(f => fs.existsSync(f));
spawnSync(process.execPath, [wl, ws, repo], { stdio: 'ignore' });
if (aud === 'codex' || kap === 'codex') {
  say(`  Spouštěče aktualizované (${[aud === 'codex' && 'auditor', kap === 'codex' && 'Kapitán'].filter(Boolean).join(' a ')} → Codex). Stará okna zavři a spusť znovu ze složky`);
  say(`  ${ws}  (start-auditor / start-kapitan). Při prvním spuštění se Codex zeptá na přihlášení účtem ChatGPT.`);
  say('  Telegram kanál je jen v Claude Code — role v Codexu ho nemá.');
  if (kap === 'codex') { let lvl = 1; try { lvl = JSON.parse(fs.readFileSync(path.join(ws, '.opravneni.json'), 'utf8')).kapitan || 1; } catch { }
    if (lvl >= 3) warn('Samostatnost PLNÝ = Codex bez sandboxu: pojistky platí, ale Kapitán by technicky mohl přepsat i jejich složku. Doporučeno SAMOSTATNÝ (START → [7]).'); }
} else ok('oba agenti běží v Claude Code (pojistky Codexu odebrány)');
