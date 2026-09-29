#!/usr/bin/env node
// SDÍLENÁ PRAVIDLA — pravidla, která se načítají do KAŽDÉHO projektu (a míchají se mezi projekty):
//   • uživatelské: ~/.claude/CLAUDE.md, ~/.claude/rules/**/*.md (bez `paths:` = v každém kroku každého projektu)
//   • nadřazené složky projektu a kořen disku: <…>/CLAUDE.md, CLAUDE.local.md (např. D:\CLAUDE.md platí pro všechny projekty na D:)
//   • pojistky (hooky) ze společného nastavení ~/.claude/settings.json a pluginy zapnuté pro celý počítač (enabledPlugins) — jejich hooky, skilly
//     a agenti běží v KAŽDÉM projektu (např. pojistky jednoho projektu blokují práci v jiném a agent je začne obcházet)
//   • konektory (MCP) pro celý počítač (~/.claude.json → mcpServers) — jen hlášení s postupem, nepřesouvá
// Nikdy nic nepřesouvá samo. Přesun jednoho souboru do projektu jen na výslovné „ano" vlastníka v terminálu (agent bez terminálu ho neudělá).
//   node tools/sdilena-pravidla.mjs seznam --repo <repo> [--json]
//   node tools/sdilena-pravidla.mjs pruvodce --repo <repo>       # vlastník: u každého souboru rozhodne přesunout / nechat
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import readline from 'node:readline';
const a = process.argv.slice(2); const cmd = a[0] || 'seznam'; const val = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
const repo = path.resolve(val('--repo') || process.cwd()); const HOME = os.homedir(); const JSONOUT = a.includes('--json');
const rd = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const tok = t => Math.round((t || '').length / 3.2);
const walk = d => { let o = []; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(walk(p)); else if (e.name.endsWith('.md')) o.push(p); } } catch { } return o; };

export function sdilena(repoDir = repo) {
  const out = []; const add = (file, druh, kde) => { const t = rd(file); if (t == null || !t.trim()) return; const scoped = /^---[\s\S]*?\npaths:/m.test(t);
    out.push({ file, druh, kde, tokeny: tok(t), jenPodleCest: scoped, zminujeProjekt: new RegExp(path.basename(repoDir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t) }); };
  add(path.join(HOME, '.claude', 'CLAUDE.md'), 'uzivatelske', 'všechny projekty na počítači');
  for (const f of walk(path.join(HOME, '.claude', 'rules'))) add(f, 'uzivatelske', 'všechny projekty na počítači');
  const seen = new Set();
  for (let d = path.dirname(repoDir); ; d = path.dirname(d)) {
    if (path.resolve(d) !== path.resolve(HOME)) for (const n of ['CLAUDE.md', 'CLAUDE.local.md']) { const f = path.join(d, n); if (!seen.has(f)) { seen.add(f); add(f, 'nadrazena', `všechny projekty ve složce ${d}`); } }
    if (path.dirname(d) === d) break;
  }
  return out;
}
const rdj = f => { try { return JSON.parse((rd(f) || '').replace(/^\uFEFF/, '')); } catch { return null; } };
const USER_SET = path.join(HOME, '.claude', 'settings.json');
// kořen projektu, kterému patří cesta (nejbližší nadřazená složka s .git nebo .claude)
const vlastnik = p => { let d = path.dirname(p); for (let i = 0; i < 12 && d !== path.dirname(d); i++, d = path.dirname(d)) if (fs.existsSync(path.join(d, '.git')) || (fs.existsSync(path.join(d, '.claude')) && path.resolve(d) !== path.resolve(HOME))) return d; return null; };
export function sdileneHooky(repoDir = repo) {
  const out = []; const u = rdj(USER_SET) || {};
  for (const [ev, groups] of Object.entries(u.hooks || {})) (groups || []).forEach((g, gi) => (g.hooks || []).forEach((h, hi) => {
    const c = String(h.command || ''); const cesty = (c.match(/[A-Za-z]:[\\/][^"'\s]+|(?<![\w$])\/(?:[^"'\s/]+\/)+[^"'\s]+/g) || []).filter(x => fs.existsSync(x));
    const vl = cesty.map(vlastnik).find(Boolean) || null;
    out.push({ druh: 'hook', event: ev, matcher: g.matcher || '', gi, hi, command: c, vlastnik: vl, cizi: !!vl && path.resolve(vl) !== path.resolve(repoDir), vsude: /\$CLAUDE_PROJECT_DIR|%CLAUDE_PROJECT_DIR%/.test(c) });
  }));
  // pluginy pro celý počítač: jen ty, které nesou hooky, skilly nebo agenty (LSP apod. bez nich nevadí)
  const reg = rdj(path.join(HOME, '.claude', 'plugins', 'installed_plugins.json')) || {}; const cesta = {};
  const najdi = (o, key) => { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (k === 'installPath' && typeof v === 'string') cesta[key] = v; else najdi(v, /@/.test(k) ? k : key); } };
  najdi(reg.plugins || reg, '');
  for (const [id, on] of Object.entries(u.enabledPlugins || {})) { if (!on) continue; const ip = cesta[id]; const obsah = [];
    if (ip) { if (fs.existsSync(path.join(ip, 'hooks', 'hooks.json')) || (rdj(path.join(ip, '.claude-plugin', 'plugin.json')) || {}).hooks) obsah.push('pojistky (hooky)');
      if (fs.existsSync(path.join(ip, 'skills'))) obsah.push('skilly'); if (fs.existsSync(path.join(ip, 'agents'))) obsah.push('agenti'); if (fs.existsSync(path.join(ip, 'rules'))) obsah.push('pravidla'); }
    if (obsah.length || /telegram/i.test(id)) out.push({ druh: 'plugin', id, obsah, installPath: ip || null });
  }
  return out;
}

// konektory (MCP) pro celý počítač: ~/.claude.json → mcpServers (scope user) se načítají do KAŽDÉHO projektu a jejich nástroje stojí kontext.
// Jen hlášení: ~/.claude.json průběžně přepisují běžící okna Claude Code, automatický přesun by mohl změnu ztratit nebo soubor poškodit.
export function sdileneMcp() { const j = rdj(path.join(HOME, '.claude.json')) || {}; return Object.entries(j.mcpServers || {}).map(([name, c]) => ({ druh: 'mcp', name, typ: (c && (c.type || (c.url ? 'http' : 'stdio'))) || '?' })); }

const list = sdilena();
const hooky = sdileneHooky(); const mcp = sdileneMcp();
const vKazdemKroku = list.filter(x => !x.jenPodleCest);
if (cmd === 'seznam') {
  if (JSONOUT) { console.log(JSON.stringify({ repo, soubory: list, hooky, mcp, tokenu_v_kazdem_kroku: vKazdemKroku.reduce((s, x) => s + x.tokeny, 0) }, null, 1)); process.exit(0); }
  for (const h of hooky) console.log(h.druh === 'plugin' ? `   • plugin pro celý počítač: ${h.id} (${h.obsah.join(', ') || 'kanál'}) — běží v každém projektu`
    : `   • pojistka pro celý počítač: ${h.event}${h.matcher ? ' [' + h.matcher + ']' : ''} → ${h.command.slice(0, 90)}${h.cizi ? ` — PATŘÍ PROJEKTU ${h.vlastnik}` : ''}`);
  for (const m of mcp) console.log(`   • konektor (MCP) pro celý počítač: ${m.name} (${m.typ}) — načítá se v každém projektu; nepotřebuješ-li ho všude: claude mcp remove ${m.name} -s user, v projektu přidat s -s local`);
  if (!list.length) { console.log('  Sdílená pravidla: žádná — do projektu se načítají jen jeho vlastní.'); process.exit(0); }
  console.log(`  Sdílená pravidla (načítají se i do jiných projektů): ${list.length} souborů, ~${vKazdemKroku.reduce((s, x) => s + x.tokeny, 0)} tokenů v každém kroku`);
  for (const x of list) console.log(`   • ${x.file} (~${x.tokeny} tok.; ${x.kde}${x.jenPodleCest ? '; jen pro soubory podle paths:' : ''}${x.zminujeProjekt ? '; zmiňuje tento projekt' : ''})`);
  process.exit(0);
}
if (cmd === 'pruvodce') {
  if (!vKazdemKroku.length && !hooky.length && !mcp.length) process.exit(0);
  if (!process.stdin.isTTY) { console.log(`  Sdílená pravidla, pojistky a konektory: ${vKazdemKroku.length + hooky.length + mcp.length} položek se načítá do každého projektu — přesun rozhoduje jen vlastník v terminálu (START → [2]); agent ho neprovádí.`); process.exit(0); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); let closed = false; rl.on('close', () => { closed = true; }); const ask = q => closed ? Promise.resolve('') : new Promise(r => { rl.once('close', () => r('')); rl.question(q, x => r(x.trim())); });
  if (vKazdemKroku.length) { console.log(`\n  SDÍLENÁ PRAVIDLA — tyhle soubory se načítají do KAŽDÉHO projektu (${path.basename(repo)} i všech ostatních).`);
  console.log('  Pravidlo, které patří jen jednomu projektu, jinde mate agenty a stojí tokeny v každém kroku. Rozhodni u každého:'); }
  for (const x of vKazdemKroku) {
    console.log(`\n   ${x.file}  (~${x.tokeny} tokenů; platí pro ${x.kde})`);
    const t = (rd(x.file) || '').split(/\r?\n/).filter(l => l.trim()).slice(0, 3).map(l => '     │ ' + l.slice(0, 110)).join('\n'); console.log(t);
    const o = await ask(`   [1] patří jen k projektu ${path.basename(repo)} → přesunout do ${path.join(repo, '.claude', 'rules')}\n   [2] platí pro všechny projekty → nechat\n   → Enter = 2: `);
    if (o !== '1') { console.log('   ponecháno'); continue; }
    const cilD = path.join(repo, '.claude', 'rules'); const cil = path.join(cilD, path.basename(x.file) === 'CLAUDE.md' ? `z-${path.basename(path.dirname(x.file)) || 'disku'}.md` : path.basename(x.file));
    if (fs.existsSync(cil)) { console.log(`   ✗ ${cil} už existuje — nic nepřesouvám (sluč ručně)`); continue; }
    fs.mkdirSync(cilD, { recursive: true }); fs.copyFileSync(x.file, cil); fs.unlinkSync(x.file);
    console.log(`   ✓ přesunuto do ${cil}\n     (cesta zpět: přesuň soubor zpět do ${path.dirname(x.file)}); Kapitán ho při příští práci commitne. Projeví se v nových oknech.`);
  }
  // POJISTKY A PLUGINY PRO CELÝ POČÍTAČ — záloha nastavení před každou změnou (cesta zpět)
  if (hooky.length) {
    console.log(`\n  POJISTKY A PLUGINY PRO CELÝ POČÍTAČ — běží v KAŽDÉM projektu. Pojistky jednoho projektu v jiném blokují běžnou práci a agenti je začnou obcházet.`);
    const u = rdj(USER_SET) || {}; let zmena = false; const proj = [];   // proj: změny nastavení projektů
    const odebrat = [];
    for (const h of hooky) {
      if (h.druh === 'plugin') {
        console.log(`\n   plugin ${h.id}  (${h.obsah.join(', ') || 'kanál'}; zapnutý pro celý počítač)`);
        const o = await ask(`   [1] patří jen k projektu ${path.basename(repo)} → vypnout pro počítač, zapnout jen tady\n   [2] patří jinému projektu / nechci ho všude → vypnout pro počítač (v tom projektu ho zapneš: START → [2] tam, nebo /plugin)\n   [3] má běžet všude → nechat\n   → Enter = 3: `);
        if (o === '1' || o === '2') { u.enabledPlugins[h.id] = false; zmena = true; if (o === '1') proj.push([repo, s => { s.enabledPlugins = { ...(s.enabledPlugins || {}), [h.id]: true }; }]); console.log(`   ✓ ${h.id}: vypnuto pro celý počítač${o === '1' ? ', zapnuto pro ' + path.basename(repo) : ''}`); }
        continue;
      }
      console.log(`\n   pojistka ${h.event}${h.matcher ? ' [' + h.matcher + ']' : ''}: ${h.command.slice(0, 110)}${h.vlastnik ? `\n     (soubor patří projektu ${h.vlastnik})` : ''}`);
      const kam = h.vlastnik || repo;
      const o = await ask(`   [1] patří jen k projektu ${path.basename(kam)} → přesunout do jeho .claude/settings.json\n   [2] má běžet všude → nechat\n   → Enter = ${h.cizi ? '1' : '2'}: `);
      if ((o || (h.cizi ? '1' : '2')) !== '1') continue;
      const grp = (u.hooks[h.event] || [])[h.gi]; const hk = grp && grp.hooks[h.hi]; if (!hk) continue;
      odebrat.push([h.event, h.gi, h.hi]); zmena = true;
      proj.push([kam, s => { s.hooks = s.hooks || {}; (s.hooks[h.event] = s.hooks[h.event] || []).push({ ...(grp.matcher ? { matcher: grp.matcher } : {}), hooks: [hk] }); }]);
      console.log(`   ✓ přesunuto do ${path.join(kam, '.claude', 'settings.json')}`);
    }
    if (zmena) {
      const bak = USER_SET + '.zaloha-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); try { fs.copyFileSync(USER_SET, bak); } catch { }
      for (const [ev, gi, hi] of odebrat.sort((a, b) => b[2] - a[2])) { const g = u.hooks[ev][gi]; g.hooks.splice(hi, 1); }
      for (const ev of Object.keys(u.hooks || {})) { u.hooks[ev] = u.hooks[ev].filter(g => (g.hooks || []).length); if (!u.hooks[ev].length) delete u.hooks[ev]; }
      fs.writeFileSync(USER_SET, JSON.stringify(u, null, 2) + '\n');
      for (const [dir, fn] of proj) { const f = path.join(dir, '.claude', 'settings.json'); const s = rdj(f) || {}; fn(s); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n'); }
      console.log(`\n   Záloha společného nastavení: ${bak}  (cesta zpět: přejmenuj ji zpět na settings.json). Projeví se v nových oknech.`);
    }
  }
  if (mcp.length) {   // jen poradit — viz sdileneMcp
    console.log(`\n  KONEKTORY (MCP) PRO CELÝ POČÍTAČ — ${mcp.map(m => m.name).join(', ')}: jejich nástroje se načítají do každého projektu a stojí kontext.`);
    console.log('  Nepotřebuješ-li některý všude: zavři okna Claude Code, pak `claude mcp get <název>` (ukáže nastavení), `claude mcp remove <název> -s user`');
    console.log('  a v projektu, kde ho chceš, ho přidej znovu s `-s local`. (Automaticky to nedělám — soubor průběžně přepisují běžící okna.)');
  }
  rl.close(); process.exit(0);
}
console.error('Příkazy: seznam | pruvodce'); process.exit(1);
