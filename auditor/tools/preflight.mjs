#!/usr/bin/env node
// PREFLIGHT — kontrola PŘED startem agenta (volá ji spouštěč start-auditor / start-kapitan). Cíl: nikdy nepustit agenta na staré verzi
// Claude Code / Codexu (staré verze neznají nové modely — hlásí je jako „disabled — Update to …" — a nemají opravy harnessu).
//   1) Claude Code: `claude update` (když neběžel v posledních 30 min), pak najde VŠECHNY instalace na počítači (PATH, nativní ~/.local/bin,
//      stažené verze ~/.local/share/claude/versions, npm, balík aplikace Claude) a ověří jejich verzi (`--version`).
//      Když výchozí `claude` z PATH není nejnovější spustitelná verze, spouštěč použije přímo tu nejnovější (cestu vypíše na stdout).
//   2) Codex (role v Codexu): `codex --version` proti npm; instalaci přes npm aktualizuje.
//   3) Model podle dostupnosti: pro roli pořadí aliasů (auditor opus→best→sonnet, Kapitán opus→sonnet: plánuje a mluví s vlastníkem, kód píšou jeho subagenti), první PRÁVĚ dostupný se použije
//      (ověření krátkým dotazem, 24 h cache); pevně zadané ID modelu v nastavení → upozornění.
//   4) Balík Auditor: novější vydání na GitHubu → jedna věta, jak aktualizovat (nic neinstaluje samo — aktualizace se ptá).
// Nikdy neblokuje start (bez sítě, bez npm… jen upozorní). Hlášky jdou na stderr, stdout = „cesta ke claude|alias modelu" pro spouštěč (--bin).
//   node tools/preflight.mjs <workspace> auditor|kapitan [--repo <repo>] [--bin] [--agent claude|codex] [--offline]
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawnSync } from 'node:child_process';
import { readLevel, contextLine } from './prisnost.mjs';
const a = process.argv.slice(2); const ws = path.resolve(a[0] || '.'); const role = a[1] === 'kapitan' ? 'kapitan' : 'auditor';
const val = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; }; const has = k => a.includes(k);
const repo = val('--repo') ? path.resolve(val('--repo')) : ''; const agent = val('--agent') || 'claude'; const OFF = has('--offline') || process.env.AUDITOR_PREFLIGHT_OFFLINE === '1';
const WIN = process.platform === 'win32'; const HOME = os.homedir();
const say = s => process.stderr.write(s + '\n');
const sf = path.join(ws, '.preflight.json'); let st = {}; try { st = JSON.parse(fs.readFileSync(sf, 'utf8')); } catch { }
const now = Date.now(); const fresh = k => st[k] && now - st[k] < 30 * 60 * 1000;   // dva spouštěče za sebou (auditor + Kapitán) nekontrolují síť dvakrát
const q = p => p === '' ? '""' : /[\s&()]/.test(p) && !/^".*"$/.test(p) ? `"${p}"` : p;
// Windows: .cmd shimy (npm) a příkazy bez cesty jdou přes cmd.exe → cesty s mezerami musí být v uvozovkách
const run = (cmd, args, t = 20000, cwd) => { try { const sh = WIN && (/\.(cmd|bat)$/i.test(cmd) || !path.isAbsolute(cmd));
  const r = sh ? spawnSync([q(cmd), ...args.map(q)].join(' '), { encoding: 'utf8', timeout: t, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: true, cwd })
    : spawnSync(cmd, args, { encoding: 'utf8', timeout: t, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` }; } catch { return { ok: false, out: '' }; } };
const semver = s => { const m = String(s || '').match(/(\d+)\.(\d+)\.(\d+)/); return m ? m.slice(1).map(Number) : null; };
const cmpv = (x, y) => { for (let i = 0; i < 3; i++) if ((x?.[i] || 0) !== (y?.[i] || 0)) return (x?.[i] || 0) - (y?.[i] || 0); return 0; };
const vs = v => v ? v.join('.') : '?';
const out = { cas: new Date().toISOString(), role };

function claudeCheck() {
  // 1a) aktualizace výchozí instalace (stáhne novou verzi; na Windows ji běžící okna můžou zamknout — proto níž hledáme i stažené verze)
  if (!OFF && !fresh('claudeUpdate')) {
    say('  Kontrola verze Claude Code…');
    // dvě okna (záložky Auditor + Kapitán) startují naráz: aktualizuje jen první, druhé počká, až skončí (jinak „Another instance…"
    // a během výměny souboru claude chvíli neexistuje → spouštěč hlásí „claude is not recognized")
    const lock = path.join(HOME, '.claude', 'auditor-update.lock'); let mine = false;
    const lockAge = () => { try { return Date.now() - fs.statSync(lock).mtimeMs; } catch { return Infinity; } };
    if (lockAge() < 180000) { say('  ℹ Claude Code právě aktualizuje druhé okno — počkám, až skončí…'); const until = Date.now() + 150000; while (lockAge() < 180000 && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000); }
    else { try { fs.unlinkSync(lock); } catch { } try { fs.mkdirSync(path.dirname(lock), { recursive: true }); fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); mine = true; } catch { } }
    const u = mine ? run('claude', ['update'], 120000) : { out: '' }; st.claudeUpdate = now;
    if (mine) try { fs.unlinkSync(lock); } catch { }
    if (/another instance is currently performing an update/i.test(u.out)) {   // aktualizaci spustilo něco jiného (aplikace, jiné okno) → počkat, až claude zase odpovídá
      say('  ℹ Claude Code právě aktualizuje jiný proces — počkám, až skončí…'); const until = Date.now() + 90000;
      while (Date.now() < until && !run('claude', ['--version'], 15000).ok) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      u.out = '';
    }
    const line = (u.out.match(/Successfully updated[^\n]*|up to date[^\n]*/i) || [])[0];
    if (line) say(`  ${/Successfully/i.test(line) ? '⬆' : '✓'} Claude Code: ${line.trim()}`);
    else if (u.out.trim()) say(`  ⚠ claude update: ${u.out.trim().split(/\r?\n/).slice(-2).join(' | ').slice(0, 200)}`);
  }
  // 1b) všechny instalace a jejich verze
  const cands = new Map(); const add = (p, kind) => { if (p && fs.existsSync(p) && !cands.has(path.resolve(p).toLowerCase())) cands.set(path.resolve(p).toLowerCase(), { p: path.resolve(p), kind }); };
  const onPath = (WIN ? run('where', ['claude']) : run('which', ['-a', 'claude'])).out.split(/\r?\n/).map(s => s.trim()).filter(s => s && fs.existsSync(s));
  onPath.forEach((p, i) => add(p, i === 0 ? 'výchozí (PATH)' : 'PATH'));
  add(path.join(HOME, '.local', 'bin', WIN ? 'claude.exe' : 'claude'), 'nativní');
  const vd = path.join(HOME, '.local', 'share', 'claude', 'versions');
  try { for (const f of fs.readdirSync(vd)) { const p = path.join(vd, f); if (fs.statSync(p).isFile() && semver(f)) add(p, 'stažená verze'); } } catch { }
  add(path.join(HOME, '.claude', 'local', WIN ? 'claude.cmd' : 'claude'), 'stará lokální npm');
  const desk = WIN ? path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'Claude', 'claude-code') : path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude-code');
  const deskV = []; try { for (const d of fs.readdirSync(desk)) if (semver(d)) deskV.push(semver(d)); } catch { }
  const list = [...cands.values()].map(c => ({ ...c, v: semver(run(c.p, ['--version'], 15000).out) })).filter(c => c.v);
  if (!list.length) { say('  ⚠ Claude Code jsem nenašel (příkaz claude). Instalace: https://code.claude.com/docs/en/setup'); out.claude = { chyba: 'nenalezen' }; return ''; }
  const def = list.find(c => c.kind === 'výchozí (PATH)') || list[0];
  const best = list.reduce((m, c) => cmpv(c.v, m.v) > 0 ? c : m, def); useBin = best.p; useVer = vs(best.v);
  out.claude = { vychozi: { cesta: def.p, verze: vs(def.v) }, nejnovejsi: { cesta: best.p, verze: vs(best.v) }, instalace: list.map(c => ({ cesta: c.p, verze: vs(c.v), druh: c.kind })) };
  const kinds = new Set(list.filter(c => c.kind !== 'stažená verze').map(c => path.dirname(c.p).toLowerCase()));
  if (best !== def) {
    say(`  ⬆ Výchozí „claude" je stará verze ${vs(def.v)} (${def.p}).`);
    say(`    Spouštím přímo nejnovější ${vs(best.v)} (${best.p}) — agent tak nepoběží na starém harnessu ani se starým seznamem modelů.`);
  } else say(`  ✓ Claude Code ${vs(def.v)} (nejnovější nalezená verze)`);
  if (kinds.size > 1) say(`  ⚠ Na počítači je víc instalací Claude Code (${kinds.size}) — aktualizace pak často míří na jinou, než se spouští.\n    Doporučení: nech jen jednu (nativní) — návod: https://code.claude.com/docs/en/troubleshoot-install#check-for-conflicting-installations`);
  const dmax = deskV.reduce((m, v) => cmpv(v, m) > 0 ? v : m, null);
  if (dmax && cmpv(dmax, best.v) > 0) say(`  ℹ Aplikace Claude má u sebe novější Claude Code ${vs(dmax)}; terminálová instalace je ${vs(best.v)} — spusť „claude update" nebo nativní instalátor.`);
  say('  ℹ Běžící okna Claude zůstávají na verzi, se kterou byla spuštěna — nová verze platí až po jejich zavření a novém spuštění.');
  if (best === def) return onPath.length ? '' : best.p;   // claude není v PATH (jen nativní/stažená instalace) → spouštěč dostane plnou cestu
  // Windows: soubor bez .exe (stažená verze) by cmd neotevřel jako program → odkaz/kopie claude-<verze>.exe ve workspace (ne ve složce Claude)
  if (WIN && !/\.(exe|cmd|bat)$/i.test(best.p)) {
    const bd = path.join(ws, '.bin'), exe = path.join(bd, `claude-${vs(best.v)}.exe`);
    try { fs.mkdirSync(bd, { recursive: true }); if (!fs.existsSync(exe)) { try { fs.linkSync(best.p, exe); } catch { fs.copyFileSync(best.p, exe); } }
      for (const f of fs.readdirSync(bd)) if (/^claude-.*\.exe$/i.test(f) && path.join(bd, f) !== exe) { try { fs.unlinkSync(path.join(bd, f)); } catch { } }   // starší (zamčené běžícím oknem zůstanou)
      if (cmpv(semver(run(exe, ['--version'], 15000).out), best.v) === 0) return exe; } catch { }
    say('    (nejnovější verzi se nepodařilo připravit ke spuštění — spouštím výchozí; spusť „claude update" nebo nativní instalátor)'); return '';
  }
  return best.p;
}

function codexCheck() {
  const cur = semver(run('codex', ['--version'], 15000).out);
  if (!cur) { say('  ⚠ Codex (příkaz codex) nenalezen — instalace: npm i -g @openai/codex'); out.codex = { chyba: 'nenalezen' }; return; }
  out.codex = { verze: vs(cur) };
  if (OFF || fresh('codexUpdate')) return say(`  ✓ Codex ${vs(cur)}`);
  st.codexUpdate = now; const latest = semver(run('npm', ['view', '@openai/codex', 'version'], 20000).out);
  if (!latest || cmpv(latest, cur) <= 0) return say(`  ✓ Codex ${vs(cur)}${latest ? ' (nejnovější)' : ''}`);
  const viaNpm = run('npm', ['ls', '-g', '@openai/codex', '--depth=0'], 20000).out.includes('@openai/codex');
  if (!viaNpm) return say(`  ⚠ Codex ${vs(cur)} je starý (nejnovější ${vs(latest)}) — aktualizuj ho tím, čím jsi ho instaloval (např. brew upgrade codex).`);
  say(`  ⬆ Codex ${vs(cur)} → ${vs(latest)}, aktualizuji…`);
  const r = run('npm', ['i', '-g', '@openai/codex@latest'], 240000); const now2 = semver(run('codex', ['--version'], 15000).out);
  if (r.ok && cmpv(now2, latest) >= 0) { out.codex.verze = vs(now2); say(`  ✓ Codex ${vs(now2)}`); }
  else say(`  ⚠ Aktualizace Codexu se nepovedla${WIN ? ' (běží jiné okno Codexu? zavři ho a spusť znovu)' : ''}: npm i -g @openai/codex@latest`);
}

function novaCheck() {   // nástroje, které auditor upravil a balík mezitím opravil: nová verze leží jako .new, dokud se nesloučí
  const w = d => { let o = []; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory() && e.name !== 'node_modules') o = o.concat(w(p)); else if (e.name.endsWith('.new')) o.push(path.relative(ws, p)); } } catch { } return o; };
  const n = ['tools', 'templates', 'checklists'].flatMap(d => w(path.join(ws, d)));
  if (n.length) say(`  ⚠ ${n.length} nástrojů čeká na sloučení s opravami z balíku (${n.slice(0, 4).join(', ')}${n.length > 4 ? ', …' : ''}) — běží zatím upravené verze. Auditor to vyřeší jako první úkol (AUDIT/NOVE_CILE.md → SLOUCIT).`);
  out.nesloucene = n;
}
function sdilenaCheck() {   // pravidla ze společného nastavení a nadřazených složek se načítají do KAŽDÉHO projektu a míchají se mezi nimi
  const r = run(process.execPath, [path.join(ws, 'tools', 'sdilena-pravidla.mjs'), 'seznam', '--repo', repo || ws, '--json'], 15000); let j = null; try { j = JSON.parse(r.out); } catch { }
  const hk = (j?.hooky || []).filter(h => h.cizi || h.druh === 'plugin' && h.obsah.includes('pojistky (hooky)'));
  if (hk.length) say(`  ⚠ Pojistky pro celý počítač běží i v tomto projektu: ${hk.map(h => h.druh === 'plugin' ? 'plugin ' + h.id : 'pojistka ' + (h.vlastnik ? 'projektu ' + path.basename(h.vlastnik) : h.event)).join(', ')} — cizí pojistky blokují práci a agenti je obcházejí. Oprava: START → [2] (aktualizace se zeptá u každé).`);
  if ((j?.mcp || []).length && !(st.mcp && now - st.mcp < 864e5)) { st.mcp = now; say(`  ℹ Konektory (MCP) pro celý počítač: ${j.mcp.map(m => m.name).join(', ')} — jejich nástroje se načítají do každého projektu. Nepotřebuješ-li je všude, postup ukáže START → [2].`); }
  const x = (j?.soubory || []).filter(s => !s.jenPodleCest); if (!x.length) return;
  say(`  ⚠ Sdílená pravidla: ${x.length} souborů (~${j.tokenu_v_kazdem_kroku} tokenů v každém kroku) se načítá do KAŽDÉHO projektu na počítači, např. ${x[0].file}. Patří-li jen jednomu projektu, přesuň je: START → [2] (aktualizace se zeptá u každého).`);
  out.sdilena = x.map(s => s.file);
}
function scopeCheck() {   // pluginy zapnuté pro celý počítač (user) se načítají v KAŽDÉM projektu — Auditor instaluje Telegram jen pro projekt (--scope local)
  try { const u = JSON.parse(fs.readFileSync(path.join(HOME, '.claude', 'settings.json'), 'utf8').replace(/^\uFEFF/, '')); const on = Object.entries(u.enabledPlugins || {}).filter(([, v]) => v).map(([k]) => k);
    if (on.includes('telegram@claude-plugins-official')) say('  ⚠ Telegram plugin je zapnutý pro celý počítač — načítá se v každém projektu (kontext navíc). Stačí ho mít v projektu:\n    claude plugin disable telegram@claude-plugins-official --scope user   (spouštěče Auditoru si ho v projektu zapnou samy)');
    else if (on.length && !fresh('scope')) { st.scope = now; say(`  ℹ Pluginy pro celý počítač (${on.length}): ${on.join(', ')} — běží ve všech projektech; jejich logy míchají data projektů.`); } } catch { }
}

function modelCheck() {
  const pinned = [];
  const look = (f, who) => { try { const m = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')).model; if (m && /^claude-[a-z]+-\d/i.test(m)) pinned.push(`${who}: ${m}`); } catch { } };
  if (role === 'auditor') look(path.join(ws, '.claude', 'settings.json'), 'auditor');
  if (role === 'kapitan' && repo) { look(path.join(repo, '.claude', 'settings.json'), 'Kapitán'); look(path.join(repo, '.claude', 'settings.local.json'), 'Kapitán'); }
  if (pinned.length) say(`  ℹ Model je pevně zadaný (${pinned.join(', ')}) — nový model se nepoužije sám. Alias „best" / „opus" / „sonnet" se posouvá na nejnovější (/model).`);
}

async function balikCheck() {
  if (OFF || fresh('balik')) return; st.balik = now;
  let cur = null; try { cur = semver(fs.readFileSync(path.join(ws, 'tools', 'VERZE'), 'utf8')); } catch { }
  if (!cur) return;
  try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000);
    const r = await fetch('https://api.github.com/repos/fotografvecerek-ai/claude-code-audit-gate/releases/latest', { signal: ac.signal, headers: { 'User-Agent': 'auditor-preflight' } }); clearTimeout(t);
    const tag = semver((await r.json()).tag_name); if (tag && cmpv(tag, cur) > 0) say(`  ⬆ Je venku nová verze Auditoru ${vs(tag)} (máš ${vs(cur)}) — aktualizuj přes START → [2] (audit nic neopakuje).`);
  } catch { }
}

// MODEL PODLE DOSTUPNOSTI (ne natvrdo): pro roli pořadí ALIASŮ (úroveň modelu, ne verze) — první, který je na tomto účtu PRÁVĚ dostupný,
// se použije. Dostupnost ověří krátký neinteraktivní dotaz (`claude -p … --model <alias>`), který zároveň ukáže, na jakou verzi se alias
// přeložil. Výsledek platí 24 h pro celý počítač (~/.claude/auditor-modely.json) a po změně verze Claude Code se ověřuje znovu.
// Pořadí mění vlastník v <workspace>/.rezim.json: "modely": { "auditor": ["opus","best"], "kapitan": ["sonnet"] } ([] = model podle nastavení).
const DEF_MODELY = { auditor: ['opus', 'best', 'sonnet'], kapitan: ['opus', 'sonnet'] };   // Kapitán plánuje a mluví s vlastníkem → silný model; kód píšou jeho subagenti na levnějších
function modelPick() {
  let rz = {}; try { rz = JSON.parse(fs.readFileSync(path.join(ws, '.rezim.json'), 'utf8')); } catch { }
  let pref = rz.modely?.[role] ?? (role === 'kapitan' && rz.modelKapitan != null ? [rz.modelKapitan] : role === 'auditor' && rz.modelAuditor != null ? [rz.modelAuditor] : DEF_MODELY[role]);
  pref = (Array.isArray(pref) ? pref : [pref]).map(x => String(x).trim()).filter(x => /^[A-Za-z0-9.\[\]_-]+$/.test(x));
  if (!pref.length) { say(`  ✓ Model ${role === 'kapitan' ? 'Kapitána' : 'auditora'}: podle nastavení projektu/účtu`); return ''; }
  const cf = path.join(HOME, '.claude', 'auditor-modely.json'); let cache = {}; try { cache = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch { }
  const probeDir = path.join(os.tmpdir(), 'auditor-model-probe'); try { fs.mkdirSync(probeDir, { recursive: true }); } catch { }   // mimo projekty → žádný transkript v projektu
  const probe = alias => {
    const r = run(bin || useBin, ['-p', 'OK', '--model', alias, '--output-format', 'json', '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--system-prompt', 'Reply OK.'], 120000, probeDir);
    if (/unrecognized_model|not available|not_found_error|model.*(disabled|not found)/i.test(r.out) && !/"is_error":\s*false/.test(r.out)) return { ok: false, jiste: true };
    try { const j = JSON.parse(r.out.slice(r.out.indexOf('{'))); const id = Object.keys(j.modelUsage || {})[0];
      if (!j.is_error && id) return { ok: true, id, okno: j.modelUsage[id].contextWindow || null }; } catch { }
    return { ok: false, jiste: false };   // síť / přihlášení / timeout → nevíme; nezapisuje se jako „nedostupný"
  };
  let chosen = '', info = null, probed = 0;
  for (const al of pref) {
    const c = cache[al]; const valid = c && c.verze === useVer && now - c.cas < 24 * 3600e3;
    let r = valid ? c : null;
    if (!r && !OFF && probed < 3) { probed++; say(`  Ověřuji dostupnost modelu „${al}"…`); const p = probe(al); if (p.ok || p.jiste) { r = { ...p, cas: now, verze: useVer }; cache[al] = r; } }
    if (r?.ok) { chosen = al; info = r; break; }
  }
  try { fs.mkdirSync(path.dirname(cf), { recursive: true }); fs.writeFileSync(cf, JSON.stringify(cache, null, 1) + '\n'); } catch { }
  const who = role === 'kapitan' ? 'Kapitán' : 'Auditor';
  if (chosen) say(`  ✓ ${who} poběží na „${chosen}" → ${info.id}${info.okno ? ` (okno ${Math.round(info.okno / 1000)} tis.)` : ''}${pref[0] !== chosen ? ` — „${pref[0]}" teď dostupný není` : ''}`);
  else { chosen = pref[0]; say(`  ℹ ${who} poběží na „${chosen}" (dostupnost teď nešlo ověřit — alias si verzi vybere sám)`); }
  out.model = { alias: chosen, id: info?.id || null, poradi: pref }; return chosen;
}

let bin = '', useBin = 'claude', useVer = '', model = '';
try {
  if (agent === 'codex') codexCheck(); else { bin = claudeCheck(); model = modelPick(); }
  scopeCheck(); modelCheck(); await balikCheck(); if (role === 'auditor') novaCheck(); sdilenaCheck();
} catch (e) { say(`  ⚠ kontrola před startem: ${e.message}`); }
try { const lvl = readLevel(ws); out.prisnost = lvl; say('  ' + contextLine(lvl, ws).replace(/\n/g, '\n  ')); } catch { }
try { fs.writeFileSync(sf, JSON.stringify({ ...st, posledni: out }, null, 2) + '\n'); } catch { }
// stdout pro spouštěč: „<claude>|<alias modelu>" („-" = model podle nastavení); vždy neprázdné části (cmd for /f přeskočí prázdný token)
if (has('--bin')) process.stdout.write(`${bin || 'claude'}|${model || '-'}`);
