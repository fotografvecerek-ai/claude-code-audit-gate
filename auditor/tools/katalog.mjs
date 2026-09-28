#!/usr/bin/env node
// KATALOG — volitelné skilly, agenti, hooky a provozní pravidla (katalog/katalog.json). NIC se neinstaluje plošně:
// agent posoudí projekt (`doporuc`) a aktivuje JEN to, co projekt potřebuje. Každá aktivní položka stojí kontext v každém kroku
// (jméno + popis skillu/agenta), proto co nejméně. Claude Code: .claude/skills|agents|hooks + settings.json; Codex: .agents/skills,
// .codex/agents/*.toml (hooky katalogu zatím jen Claude Code). Evidence: <cíl>/.claude/katalog.json (Codex: .codex/katalog.json).
//   node tools/katalog.mjs seznam
//   node tools/katalog.mjs doporuc --cil <repo|workspace> [--role kapitan|auditor]
//   node tools/katalog.mjs aktivuj <id…> --cil <dir> [--harness claude|codex]
//   node tools/katalog.mjs deaktivuj <id…> --cil <dir>
//   node tools/katalog.mjs stav --cil <dir>
//   node tools/katalog.mjs obnov --cil <dir>        (aktualizace balíku: nová verze aktivních položek; ručně upravené nechá)
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)); const KAT = path.resolve(here, '..', 'katalog');
const a = process.argv.slice(2); const cmd = a[0] || 'seznam';
const val = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; }; const has = k => a.includes(k);
const VAL = new Set(['--cil', '--role', '--harness']);   // přepínače s hodnotou; ostatní (--json, --ano…) jsou bez hodnoty
const ids = a.slice(1).filter((x, i, arr) => !x.startsWith('--') && !(i > 0 && VAL.has(arr[i - 1]))).flatMap(x => x.split(',')).map(x => x.trim()).filter(Boolean);
const cil = path.resolve(val('--cil') || '.'); const JSONOUT = has('--json');
const rd = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const sha = f => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16); } catch { return ''; } };
let K; try { K = JSON.parse(rd(path.join(KAT, 'katalog.json'))); } catch { console.error(`katalog nenalezen (${KAT})`); process.exit(1); }
const byId = Object.fromEntries(K.polozky.map(p => [p.id, p]));
const role = val('--role') || (fs.existsSync(path.join(cil, 'AUDIT')) && fs.existsSync(path.join(cil, 'tools', 'bus.mjs')) ? 'auditor' : 'kapitan');
const harness = val('--harness') || (fs.existsSync(path.join(cil, '.codex')) && !fs.existsSync(path.join(cil, '.claude')) ? 'codex' : 'claude');
const stateFile = h => path.join(cil, h === 'codex' ? '.codex' : '.claude', 'katalog.json');
const loadState = h => { try { return JSON.parse(rd(stateFile(h))); } catch { return { aktivni: {} }; } };
const saveState = (h, s) => { fs.mkdirSync(path.dirname(stateFile(h)), { recursive: true }); fs.writeFileSync(stateFile(h), JSON.stringify(s, null, 2) + '\n'); };

// cena v kontextu (odhad): skill/agent = jméno + popis v každém kroku; pravidla = 1 řádek; hooky 0 (stav-kompakce jen po kompakci)
const norm = t => t.replace(/\r\n/g, '\n');  // normalize CRLF to LF for Windows autocrlf=true
const fm = t => { const m = norm(t).match(/^---\n([\s\S]*?)\n---/); const o = {}; if (m) for (const l of m[1].split('\n')) { const x = l.match(/^([\w-]+):\s*(.*)$/); if (x) o[x[1]] = x[2].replace(/^["']|["']$/g, ''); } return o; };
const srcMain = p => p.typ === 'skill' ? path.join(KAT, p.zdroj, 'SKILL.md') : path.join(KAT, p.zdroj);
const cena = p => p.typ === 'skill' || p.typ === 'agent' ? Math.round(((fm(rd(srcMain(p))).description || '').length + p.id.length + 20) / 3) : p.typ === 'pravidla' ? Math.round((rd(path.join(KAT, 'pravidla', 'ZAKLAD.md')).length + 250) / 3.2) : 0;

// holý projekt = žádní vlastní agenti ani skilly a CLAUDE.md/AGENTS.md skoro prázdné (mimo bloky Auditoru a katalogu)
const holyProjekt = dir => { const own = d => { try { return fs.readdirSync(path.join(dir, d)).length > 0; } catch { return false; } };
  const txt = ['CLAUDE.md', 'AGENTS.md'].map(f => rd(path.join(dir, f)).replace(/<!-- (auditor:role|katalog:[\w-]+)[\s\S]*?<!-- \/(auditor:role|katalog:[\w-]+) -->/g, '')).join('\n');
  return !own('.claude/agents') && !own('.claude/skills') && !own('.codex/agents') && txt.split(/\n/).filter(l => l.trim()).length < 25; };
// ---- signály projektu (mělký průchod, bez node_modules/build)
function signaly(dir) {
  const S = new Set(); const cnt = {}; let n = 0; const SKIP = /^(node_modules|\.git|build|dist|\.next|out|vendor|venv|\.venv|__pycache__|coverage|AUDIT|\.claude|\.codex|\.agents)$/;
  const walk = (d, depth) => { if (depth > 4 || n > 20000) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { if (e.isDirectory()) { if (!SKIP.test(e.name)) walk(path.join(d, e.name), depth + 1); continue; } n++; const x = path.extname(e.name).toLowerCase(); cnt[x] = (cnt[x] || 0) + 1;
      if (/^\.env(\.|$)/.test(e.name) && !/example|sample|template/i.test(e.name)) S.add('tajemstvi'); } };
  walk(dir, 0);
  let pj = {}; try { pj = JSON.parse(rd(path.join(dir, 'package.json'))); } catch { } const deps = { ...(pj.dependencies || {}), ...(pj.devDependencies || {}) };
  const req = rd(path.join(dir, 'requirements.txt')) + rd(path.join(dir, 'pyproject.toml'));
  if ((cnt['.py'] || 0) >= 3) S.add('python');
  if (fs.existsSync(path.join(dir, 'tsconfig.json')) || (cnt['.ts'] || 0) + (cnt['.tsx'] || 0) + (cnt['.js'] || 0) + (cnt['.mjs'] || 0) >= 3) S.add('typescript');
  if (Object.keys(deps).some(d => /^(next|react|vue|svelte|nuxt|astro|@angular\/core|express|fastify|koa|hono)$/.test(d)) || /\b(django|flask|fastapi)\b/i.test(req)) S.add('web');
  if (Object.keys(deps).some(d => /^(express|fastify|koa|hono|next|@nestjs\/core)$/.test(d)) || /\b(django|flask|fastapi)\b/i.test(req) || ['app/api', 'pages/api', 'src/app/api', 'api', 'server'].some(p => fs.existsSync(path.join(dir, p)))) S.add('api');
  if (deps.dotenv || /python-dotenv/.test(req)) S.add('tajemstvi');
  if (deps['@playwright/test'] || deps.playwright || deps.cypress || ['playwright.config.ts', 'playwright.config.js', 'cypress.config.ts', 'cypress.config.js', 'e2e', 'tests/e2e'].some(p => fs.existsSync(path.join(dir, p)))) S.add('e2e');
  if ((cnt['.ps1'] || 0) + (cnt['.sh'] || 0) + (cnt['.py'] || 0) + (cnt['.mjs'] || 0) + (cnt['.js'] || 0) > 0) S.add('skripty');
  return S;
}

function doporuc() {
  const S = signaly(cil); const st = { ...loadState('claude').aktivni, ...loadState('codex').aktivni }; const holy = holyProjekt(cil);
  const out = { cil, role, signaly: [...S], holy, ano: [], mozna: [], ne: [] };
  for (const p of K.polozky) {
    if (!p.pro.includes(role)) { out.ne.push({ id: p.id, proc: `jen pro roli ${p.pro.join('/')}` }); continue; }
    if (p.harness && !p.harness.includes(harness)) { out.ne.push({ id: p.id, proc: `zatím jen pro ${p.harness.join('/')}` }); continue; }
    const hit = (p.signaly || []).filter(s => S.has(s));
    if ((p.doporucit || []).includes(role)) out.ano.push({ id: p.id, proc: 'základ pro tuto roli', cena: cena(p) });
    else if (hit.length) out.ano.push({ id: p.id, proc: `projekt: ${hit.join(', ')}`, cena: cena(p) });
    else if (p.poznamka) out.mozna.push({ id: p.id, proc: p.poznamka, cena: cena(p) });
    else out.ne.push({ id: p.id, proc: p.signaly ? `projekt nemá: ${p.signaly.join('/')}` : 'nepotřebné' });
  }
  for (const x of [...out.ano, ...out.mozna]) x.aktivni = !!st[x.id];
  if (!has('--nezapisovat')) { const s = loadState(harness); s.posouzeno = new Date().toISOString(); try { saveState(harness, s); } catch { } }   // připomínka v roli Kapitána zmizí
  if (JSONOUT) return console.log(JSON.stringify(out, null, 1));
  const L = x => `  ${x.aktivni ? '✓' : '·'} ${x.id.padEnd(22)} ~${String(x.cena).padStart(3)} tok. — ${x.proc}`;
  console.log(`Doporučení z katalogu pro ${role === 'auditor' ? 'auditora' : 'Kapitána'} (${cil}; ${harness}); signály: ${[...S].join(', ') || 'žádné'}`);
  if (holy && role === 'kapitan') console.log('PROJEKT NEMÁ VLASTNÍ PRAVIDLA ANI AGENTY — doporučuji celou základní sadu níže: přenáší zkušenosti z provozu jiných projektů (pravidla, smyčka, ověřovatelé, pojistky).');
  if (out.ano.length) console.log('DOPORUČUJI:\n' + out.ano.map(L).join('\n'));
  if (out.mozna.length) console.log('MOŽNÁ (jen když):\n' + out.mozna.map(L).join('\n'));
  console.log(`NE: ${out.ne.map(x => x.id).join(', ') || '—'}`);
  const add = out.ano.filter(x => !x.aktivni); const agentAdd = add.filter(x => byId[x.id].typ !== 'hook'), hookAdd = add.filter(x => byId[x.id].typ === 'hook');
  if (!add.length) return console.log('Vše doporučené je aktivní.');
  if (agentAdd.length) console.log(`Aktivace (skilly, agenti, pravidla — smí agent): node "${path.join(here, 'katalog.mjs')}" aktivuj ${agentAdd.map(x => x.id).join(' ')} --cil "${cil}"`);
  if (hookAdd.length) console.log(`Hooky (${hookAdd.map(x => x.id).join(', ')}) aktivuje VLASTNÍK — mění pojistky agenta: START → [9] Katalog, nebo při aktualizaci balíku.`);
  console.log(`Cena doporučených v kontextu ~${add.reduce((s, x) => s + x.cena, 0)} tokenů na krok (jména + popisy; obsah se načte až při použití).`);
}

// ---- aktivace / deaktivace
const copyDir = (s, d) => { fs.mkdirSync(d, { recursive: true }); for (const e of fs.readdirSync(s, { withFileTypes: true })) { const x = path.join(s, e.name), y = path.join(d, e.name); e.isDirectory() ? copyDir(x, y) : fs.copyFileSync(x, y); } };
const listFiles = d => { const o = []; const w = x => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const y = path.join(x, e.name); e.isDirectory() ? w(y) : o.push(y); } }; if (fs.existsSync(d)) w(d); return o; };
const tomlStr = s => JSON.stringify(s);
function agentToml(md) {
  md = norm(md);  // normalize CRLF to LF
  const f = fm(md); const body = md.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/<!--[\s\S]*?-->\n?/g, '').trim();
  const ro = !/Write|Edit/.test(f.tools || ''); const lit = body.includes("'''") ? `"""\n${body.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}\n"""` : `'''\n${body}\n'''`;
  return `# Z katalogu Auditoru (katalog.mjs). Model se nezadává — agent dědí model session (vybírá se podle dostupnosti).\nname = ${tomlStr(f.name)}\ndescription = ${tomlStr(f.description || '')}\nsandbox_mode = "${ro ? 'read-only' : 'workspace-write'}"\ndeveloper_instructions = ${lit}\n`;
}
const MARK = id => [`<!-- katalog:${id} -->`, `<!-- /katalog:${id} -->`];
function setBlock(file, id, text) { const [o, c] = MARK(id); let t = rd(file); const re = new RegExp(`\\n?${o}[\\s\\S]*?${c}\\n?`, 'g'); t = t.replace(re, '\n');
  if (text) t = (t.trim() ? t.replace(/\s*$/, '\n\n') : '') + `${o}\n${text}\n${c}\n`; t = t.replace(/^\n+/, '');
  if (!t.trim()) { try { fs.unlinkSync(file); } catch { } return; }   // soubor zbyl prázdný (založil ho katalog) → pryč, žádné smetí
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, t.replace(/\n{3,}/g, '\n\n')); }
function settingsHooks(p, add) {
  const sf = path.join(cil, '.claude', 'settings.json'); let s = {}; try { s = JSON.parse(rd(sf).replace(/^\uFEFF/, '')); } catch { if (fs.existsSync(sf)) throw new Error(`${sf} není platný JSON — neupravuji`); }
  s.hooks = s.hooks || {}; const file = path.basename(p.zdroj); const mine = h => (h.hooks || []).some(x => String(x.command || '').includes(`hooks/katalog/${file}`));
  for (const ev of Object.keys(s.hooks)) { s.hooks[ev] = (s.hooks[ev] || []).filter(g => !mine(g)); if (!s.hooks[ev].length) delete s.hooks[ev]; }
  if (add) for (const h of p.hooky) (s.hooks[h.udalost] = s.hooks[h.udalost] || []).push({ matcher: h.matcher, hooks: [{ type: 'command', command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/katalog/${file}"`, timeout: 30 }] });
  if (!Object.keys(s.hooks).length) delete s.hooks;
  if (!Object.keys(s).length) { try { fs.unlinkSync(sf); } catch { } return; }
  fs.mkdirSync(path.dirname(sf), { recursive: true }); fs.writeFileSync(sf, JSON.stringify(s, null, 2) + '\n');
}
function install(p, h) {   // vrací {rel: hash} zapsaných souborů
  const out = {}; const put = (src, rel) => { const dst = path.join(cil, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); out[rel.split(path.sep).join('/')] = sha(dst); };
  if (p.typ === 'skill') { const base = h === 'codex' ? path.join('.agents', 'skills', p.id) : path.join('.claude', 'skills', p.id); for (const f of listFiles(path.join(KAT, p.zdroj))) put(f, path.join(base, path.relative(path.join(KAT, p.zdroj), f))); }
  else if (p.typ === 'agent') { if (h === 'codex') { const rel = path.join('.codex', 'agents', `${p.id}.toml`); const dst = path.join(cil, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, agentToml(rd(path.join(KAT, p.zdroj)))); out[rel.split(path.sep).join('/')] = sha(dst); }
    else put(path.join(KAT, p.zdroj), path.join('.claude', 'agents', `${p.id}.md`)); }
  else if (p.typ === 'pravidla') { const rel = path.join(h === 'codex' ? '.codex' : '.claude', 'prirucka', 'PROVOZ_AGENTU.md'); /* ne „pravidla": vedle .claude/rules by to mátlo (Claude Code načítá jen rules/) */ put(path.join(KAT, p.zdroj), rel);
    setBlock(path.join(cil, h === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'), 'pravidla', rd(path.join(KAT, 'pravidla', 'ZAKLAD.md')).trim() + `\n- **Plná příručka** (subagenti, modely, bezpečnost, QA, git, provoz, Windows pasti, multi-projekt): \`${rel.split(path.sep).join('/')}\` — čti jen potřebnou sekci (Grep podle nadpisu), nikdy celou.`); }
  else if (p.typ === 'hook') { if (h === 'codex') throw new Error('hooky z katalogu jsou zatím jen pro Claude Code (v Codexu platí pojistky Auditoru a sandbox)');
    put(path.join(KAT, p.zdroj), path.join('.claude', 'hooks', 'katalog', path.basename(p.zdroj))); settingsHooks(p, true);
    if (p.sablona && !['.claude/STATE.md', 'STATE.md', 'docs/STATE.md'].some(x => fs.existsSync(path.join(cil, x)))) { const d = path.join(cil, p.sablona.do); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(KAT, p.sablona.z), d); } }
  return out;
}
function uninstall(p, h, rec) {
  for (const rel of Object.keys(rec?.soubory || {})) { try { fs.unlinkSync(path.join(cil, rel)); } catch { } }
  if (p.typ === 'skill') { const d = path.join(cil, h === 'codex' ? '.agents' : '.claude', 'skills', p.id); try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch { } }
  if (p.typ === 'pravidla') setBlock(path.join(cil, h === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'), 'pravidla', '');
  if (p.typ === 'hook') settingsHooks(p, false);
  // prázdné složky po katalogu (agents/, skills/<id>/, hooks/katalog/, pravidla/) — jen prázdné, nikdy cil samotný
  for (const rel of Object.keys(rec?.soubory || {})) { let d = path.dirname(path.join(cil, rel)); while (d.length > cil.length && path.relative(cil, d) && !path.relative(cil, d).startsWith('..')) { try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch (e) { if (e.code !== 'ENOENT') break; } d = path.dirname(d); } }
}

if (cmd === 'seznam') {
  if (JSONOUT) console.log(JSON.stringify(K.polozky.map(p => ({ ...p, cena: cena(p) })), null, 1));
  else { console.log('KATALOG (nic se neinstaluje samo; aktivuje se jen to, co projekt potřebuje):'); for (const p of K.polozky) console.log(`  ${p.typ.padEnd(8)} ${p.id.padEnd(22)} ~${String(cena(p)).padStart(3)} tok. — ${p.k_cemu}`); }
} else if (cmd === 'doporuc') doporuc();
else if (cmd === 'stav') {
  for (const h of ['claude', 'codex']) { const s = loadState(h); const ks = Object.keys(s.aktivni); if (!ks.length) continue;
    console.log(`${h}: ${ks.map(k => `${k} (${s.aktivni[k].typ})`).join(', ')} — v kontextu ~${ks.reduce((n, k) => n + (byId[k] ? cena(byId[k]) : 0), 0)} tokenů na krok`); }
  if (!['claude', 'codex'].some(h => Object.keys(loadState(h).aktivni).length)) console.log('Z katalogu není nic aktivní.');
} else if (cmd === 'aktivuj' || cmd === 'deaktivuj') {
  if (!ids.length) { console.error('Zadej id položek (node tools/katalog.mjs seznam).'); process.exit(1); }
  const s = loadState(harness); let err = 0;
  for (const id of ids) { const p = byId[id]; if (!p) { console.error(`  ✗ ${id}: v katalogu není`); err++; continue; }
    try {
      if (cmd === 'aktivuj') { s.aktivni[id] = { typ: p.typ, soubory: install(p, harness), cas: new Date().toISOString() }; console.log(`  ✓ ${id} aktivní (${harness}${cena(p) ? `, ~${cena(p)} tok. v kontextu` : ''})`); }
      else { uninstall(p, harness, s.aktivni[id]); delete s.aktivni[id]; console.log(`  ✓ ${id} deaktivováno`); }
    } catch (e) { console.error(`  ✗ ${id}: ${e.message}`); err++; } }
  s.verze = rd(path.join(here, 'VERZE')).trim(); saveState(harness, s);
  const n = Object.keys(s.aktivni).filter(k => ['skill', 'agent'].includes(byId[k]?.typ)).length;
  if (n > 8) console.log(`  ⚠ aktivních skillů a agentů je ${n} — každý stojí kontext v každém kroku; nech jen ty, které projekt opravdu používá.`);
  console.log('  Projeví se v nové session (okno spusť znovu).'); process.exit(err ? 1 : 0);
} else if (cmd === 'obnov') {
  for (const h of ['claude', 'codex']) { const s = loadState(h); let ch = 0;
    for (const [id, rec] of Object.entries(s.aktivni)) { const p = byId[id]; if (!p) continue;
      const upr = Object.entries(rec.soubory || {}).filter(([rel, hs]) => fs.existsSync(path.join(cil, rel)) && sha(path.join(cil, rel)) !== hs);
      if (upr.length) { console.log(`  ⚠ ${id}: ručně upravené (${upr.map(x => x[0]).join(', ')}) — ponechávám, nová verze v katalogu`); continue; }
      try { const stare = Object.keys(rec.soubory || {}); s.aktivni[id].soubory = install(p, h); ch++;
        // soubory, které nová verze katalogu dává jinam (např. .claude/pravidla → .claude/prirucka), na staré cestě smazat + prázdné složky
        for (const rel of stare.filter(r => !(r in s.aktivni[id].soubory))) { try { fs.unlinkSync(path.join(cil, rel)); } catch { } let d = path.dirname(path.join(cil, rel)); while (d.length > cil.length && path.relative(cil, d) && !path.relative(cil, d).startsWith('..')) { try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch { break; } d = path.dirname(d); } }
      } catch { } }
    if (Object.keys(s.aktivni).length) { s.verze = rd(path.join(here, 'VERZE')).trim(); saveState(h, s); console.log(`  katalog (${h}): obnoveno ${ch} aktivních položek`); } }
} else if (cmd === 'pruvodce') {   // vlastník: doporučení + souhlas (hooky smí aktivovat jen on)
  process.argv.push('--json'); const S = signaly(cil); const cur = { ...loadState('claude').aktivni, ...loadState('codex').aktivni };
  const rec = K.polozky.filter(p => p.pro.includes('kapitan') && (!p.harness || p.harness.includes(harness)) && !cur[p.id] && ((p.doporucit || []).includes('kapitan') || (p.signaly || []).some(s => S.has(s))));
  if (!rec.length) { console.log('  Katalog: pro tento projekt není nic nového k aktivaci.'); process.exit(0); }
  console.log(`\n  KATALOG pro Kapitána (${path.basename(cil)}) — doporučuji podle projektu (${[...S].join(', ') || 'bez zvláštních signálů'}):`);
  if (holyProjekt(cil)) console.log('  Projekt zatím nemá vlastní pravidla ani agenty — základní sada přenese zkušenosti z provozu jiných projektů.');
  for (const p of rec) console.log(`   • ${p.id} (${p.typ}) — ${p.k_cemu}`);
  console.log(`  V kontextu každého kroku to stojí ~${rec.reduce((n, p) => n + cena(p), 0)} tokenů (jen jména a popisy). Nic dalšího se neinstaluje.`);
  const ask = async () => { if (!process.stdin.isTTY || has('--ano')) return has('--ano'); const rl = (await import('node:readline')).createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(r => rl.question('  Aktivovat? [Enter = ano, n = ne] ', x => { rl.close(); r(!/^n/i.test(x.trim())); })); };
  if (!(await ask())) { const s = loadState(harness); s.posouzeno = new Date().toISOString(); saveState(harness, s); console.log('  Nic neaktivováno (kdykoli: START → [9]).'); process.exit(0); }
  const s = loadState(harness); for (const p of rec) { try { s.aktivni[p.id] = { typ: p.typ, soubory: install(p, harness), cas: new Date().toISOString() }; console.log(`   ✓ ${p.id}`); } catch (e) { console.log(`   ✗ ${p.id}: ${e.message}`); } }
  s.posouzeno = new Date().toISOString(); s.verze = rd(path.join(here, 'VERZE')).trim(); saveState(harness, s); console.log('  Projeví se v novém okně Kapitána.');
} else { console.error('Příkazy: seznam | doporuc | aktivuj | deaktivuj | stav | obnov | pruvodce'); process.exit(1); }
