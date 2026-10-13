#!/usr/bin/env node
// KATALOG — volitelné skilly, agenti, hooky a provozní pravidla (katalog/katalog.json). NIC se neinstaluje plošně:
// agent posoudí projekt (`doporuc`) a aktivuje JEN to, co projekt potřebuje. Cena je odhad metadata položky; skutečné načítání a aktivace se liší.
// Jména a popisy se mohou přidat do kontextu, obsah závisí na harnessi. Claude Code: .claude/skills|agents|hooks + settings.json; Codex: .agents/skills,
// .codex/agents/*.toml (hooky katalogu zatím jen Claude Code). Evidence: <cíl>/.claude/katalog.json (Codex: .codex/katalog.json).
//   node tools/katalog.mjs seznam
//   node tools/katalog.mjs doporuc --cil <repo|workspace> [--role kapitan|auditor]
//   node tools/katalog.mjs aktivuj <id…> --cil <dir> [--harness claude|codex]
//   node tools/katalog.mjs deaktivuj <id…> --cil <dir>
//   node tools/katalog.mjs stav --cil <dir>
//   node tools/katalog.mjs obnov --cil <dir>        (aktualizace balíku: nová verze aktivních položek; ručně upravené nechá)
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import { profileProject } from './project-profile.mjs';
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
function safePath(rel) {
  // Stabilní parent/final symlinky odmítáme; souběžnou výměnu cest stejným účtem (TOCTOU) tímto neřešíme.
  const root = path.resolve(cil), target = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(root, rel);
  const inside = path.relative(root, target);
  if (!inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) throw new Error(`cesta mimo cíl nebo kořen cíle: ${rel}`);
  let realRoot;
  try { if (fs.lstatSync(root).isSymbolicLink()) throw new Error(`symbolický odkaz v kořeni cíle: ${root}`); realRoot = fs.realpathSync(root); }
  catch (e) { if (e.code === 'ENOENT') throw new Error(`cíl neexistuje: ${root}`); throw e; }
  let current = root;
  for (const part of inside.split(path.sep)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`symbolický odkaz v cílové cestě: ${current}`);
      const real = fs.realpathSync(current), relative = path.relative(realRoot, real);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`cesta mimo cíl: ${current}`);
    } catch (e) { if (e.code === 'ENOENT') break; throw e; }
  }
  return target;
}
const stateFile = h => safePath(path.join(h === 'codex' ? '.codex' : '.claude', 'katalog.json'));
const loadState = h => {
  const file = stateFile(h); let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { aktivni: {} }; throw error; }
  let state;
  try { state = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch (error) { throw new Error(`stav katalogu není platný JSON (${path.basename(file)}): ${error.message}`); }
  if (!state || typeof state !== 'object' || Array.isArray(state) || !state.aktivni || typeof state.aktivni !== 'object' || Array.isArray(state.aktivni)) {
    throw new Error(`stav katalogu má neplatný tvar (${path.basename(file)}); očekávám objekt aktivni`);
  }
  for (const [id, record] of Object.entries(state.aktivni)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !record || typeof record !== 'object' || Array.isArray(record) || !['skill', 'agent', 'pravidla', 'hook'].includes(record.typ)) {
      throw new Error(`stav katalogu obsahuje neplatný záznam položky ${id}`);
    }
    const item = byId[id];
    if (!item || item.typ !== record.typ) throw new Error(`stav katalogu neodpovídá katalogu u položky ${id}`);
    if (item.harness && !item.harness.includes(h)) throw new Error(`stav katalogu uvádí nepodporovaný harness u položky ${id}`);
    if (item.typ === 'hook' && h !== 'claude') throw new Error(`stav katalogu uvádí hook v nepodporovaném harnessu u položky ${id}`);
    if (!record.soubory || typeof record.soubory !== 'object' || Array.isArray(record.soubory)) throw new Error(`stav katalogu má neplatné soubory položky ${id}`);
    const allowed = new Set(outputFiles(item, h).map(rel => rel.split(path.sep).join('/')));
    if (item.typ === 'skill') {
      const source = path.join(KAT, item.zdroj), target = path.join(h === 'codex' ? '.agents/skills' : '.claude/skills', id);
      for (const file of listFiles(source)) allowed.add(path.join(target, path.relative(source, file)).split(path.sep).join('/'));
    }
    // Explicit historical paths from the catalog's documented migration; no arbitrary owned-path claims.
    if (item.typ === 'pravidla') allowed.add(path.join(h === 'codex' ? '.codex' : '.claude', 'pravidla', 'PROVOZ_AGENTU.md').split(path.sep).join('/'));
    for (const [rel, hash] of Object.entries(record.soubory)) {
      if (!rel || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.split(/[\\/]/).some(part => !part || part === '.' || part === '..') || (hash !== '' && !/^[a-f0-9]{16}$/i.test(hash))) {
        throw new Error(`stav katalogu má neplatnou cestu nebo hash u položky ${id}`);
      }
      if (!allowed.has(rel)) throw new Error(`stav katalogu uvádí cestu mimo výstupy položky ${id}: ${rel}`);
      safePath(rel.replaceAll('/', path.sep));
    }
    if (record.managed !== undefined) {
      const managed = record.managed;
      if (!managed || typeof managed !== 'object' || Array.isArray(managed)) throw new Error(`stav katalogu má neplatné vlastnictví položky ${id}`);
      if (managed.block !== undefined && !/^[a-f0-9]{64}$/i.test(managed.block)) throw new Error(`stav katalogu má neplatný hash bloku položky ${id}`);
      if (managed.hooks !== undefined && (!Array.isArray(managed.hooks) || managed.hooks.some(item => !item || typeof item.event !== 'string' || !Number.isSafeInteger(item.index) || item.index < 0 || !/^[a-f0-9]{64}$/i.test(item.hash)))) {
        throw new Error(`stav katalogu má neplatný hash hook skupiny položky ${id}`);
      }
      if ((managed.block !== undefined && item.typ !== 'pravidla') || (managed.hooks !== undefined && item.typ !== 'hook')) throw new Error(`stav katalogu má vlastnictví mimo typ položky ${id}`);
      if (managed.hooks !== undefined && !validHookOwnership(item, managed.hooks)) throw new Error(`stav katalogu obsahuje cizí nebo duplicitní vlastnictví hooků u položky ${id}`);
    }
  }
  return state;
};
const saveState = (h, s) => {
  const f = stateFile(h); fs.mkdirSync(path.dirname(f), { recursive: true }); safePath(f);
  const tmp = `${f}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`; safePath(tmp);
  try { fs.writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`, 'utf8'); safePath(f); fs.renameSync(tmp, f); }
  finally { try { fs.unlinkSync(tmp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
};

// Odhad položky vychází z metadat; skutečné načítání a aktivace se liší podle harnessu a nastavení projektu.
const norm = t => t.replace(/\r\n/g, '\n');  // normalize CRLF to LF for Windows autocrlf=true
const fm = t => { const m = norm(t).match(/^---\n([\s\S]*?)\n---/); const o = {}; if (m) for (const l of m[1].split('\n')) { const x = l.match(/^([\w-]+):\s*(.*)$/); if (x) o[x[1]] = x[2].replace(/^["']|["']$/g, ''); } return o; };
const srcMain = p => p.typ === 'skill' ? path.join(KAT, p.zdroj, 'SKILL.md') : path.join(KAT, p.zdroj);
const cena = p => p.typ === 'skill' || p.typ === 'agent' ? Math.round(((fm(rd(srcMain(p))).description || '').length + p.id.length + 20) / 3) : p.typ === 'pravidla' ? Math.round((rd(path.join(KAT, 'pravidla', 'ZAKLAD.md')).length + 250) / 3.2) : 0;

// holý projekt = žádní vlastní agenti ani skilly a CLAUDE.md/AGENTS.md skoro prázdné (mimo bloky Auditoru a katalogu)
const holyProjekt = dir => { const own = d => { try { return fs.readdirSync(path.join(dir, d)).length > 0; } catch { return false; } };
  const txt = ['CLAUDE.md', 'AGENTS.md'].map(f => rd(path.join(dir, f)).replace(/<!-- (auditor:role|katalog:[\w-]+)[\s\S]*?<!-- \/(auditor:role|katalog:[\w-]+) -->/g, '')).join('\n');
  return !own('.claude/agents') && !own('.claude/skills') && !own('.codex/agents') && !own('.agents/skills') && txt.split(/\n/).filter(l => l.trim()).length < 25; };
function answerChoice(input) { return String(input || '').trim() === 'ano'; }
function outputFiles(p, h) { if (p.typ === 'skill') return [path.join(h === 'codex' ? '.agents/skills' : '.claude/skills', p.id, 'SKILL.md')];
  if (p.typ === 'agent') return [h === 'codex' ? path.join('.codex/agents', `${p.id}.toml`) : path.join('.claude/agents', `${p.id}.md`)];
  if (p.typ === 'pravidla') return [path.join(h === 'codex' ? '.codex' : '.claude', 'prirucka', 'PROVOZ_AGENTU.md')];
  if (p.typ === 'hook') return [path.join('.claude/hooks/katalog', path.basename(p.zdroj))]; return []; }
function existingItem(p, h) { return outputFiles(p, h).some(file => fs.existsSync(path.join(cil, file))); }
function recommendations(dir, selectedRole, selectedHarness) {
  const prof = profileProject(dir), S = new Set(prof.signals); const st = loadState(selectedHarness).aktivni;
  const out = { cil: dir, role: selectedRole, signaly: prof.signals, confidence: prof.confidence, holy: holyProjekt(dir), podpora: prof.databases.includes('postgresql') ? [K.bez_podpory?.postgres || 'PostgreSQL nemá specializovanou katalogovou roli; použij nativní kontroly projektu.'] : [], ano: [], mozna: [], ne: [] };
  for (const p of K.polozky) {
    if (!p.pro.includes(selectedRole)) { out.ne.push({ id: p.id, proc: `jen pro roli ${p.pro.join('/')}` }); continue; }
    if (p.harness && !p.harness.includes(selectedHarness)) { out.ne.push({ id: p.id, proc: `zatím jen pro ${p.harness.join('/')}` }); continue; }
    const hit = (p.signaly || []).filter(s => S.has(s));
    if (p.vsechny_signaly && !p.vsechny_signaly.every(s => S.has(s))) hit.length = 0;
    if (st[p.id]) { out.ne.push({ id: p.id, proc: 'již aktivní' }); continue; }
    if (existingItem(p, selectedHarness)) { out.ne.push({ id: p.id, proc: 'v projektu již existuje položka se stejným ID; ponechávám ji' }); continue; }
    if (hit.length && prof.confidence !== 'low') out.ano.push({ id: p.id, proc: `projekt: ${hit.join(', ')}`, cena: cena(p) });
    else if (hit.length) out.mozna.push({ id: p.id, proc: `slabý profil projektu: ${hit.join(', ')}; ověř ručně`, cena: cena(p) });
    else if ((p.doporucit || []).includes(selectedRole) || p.poznamka) out.mozna.push({ id: p.id, proc: p.poznamka || 'jen při konkrétní potřebě; není to výchozí výbava', cena: cena(p) });
    else out.ne.push({ id: p.id, proc: p.signaly ? `projekt nemá: ${p.signaly.join('/')}` : 'nepotřebné' });
  }
  for (const x of [...out.ano, ...out.mozna]) x.aktivni = false;
  return out;
}

function doporuc() {
  const out = recommendations(cil, role, harness), S = new Set(out.signaly);
  if (JSONOUT) return console.log(JSON.stringify(out, null, 1));
  const L = x => `  ${x.aktivni ? '✓' : '·'} ${x.id.padEnd(22)} ~${String(x.cena).padStart(3)} tok. — ${x.proc}`;
  console.log(`Doporučení z katalogu pro ${role === 'auditor' ? 'auditora' : 'Kapitána'} (${cil}; ${harness}); signály: ${[...S].join(', ') || 'žádné'}`);
  if (out.confidence === 'low') console.log('Profil projektu má nízkou jistotu; doporučení ověř ručně.');
  for (const note of out.podpora) console.log(`Podpora databáze: ${note}`);
  if (out.ano.length) console.log('DOPORUČUJI:\n' + out.ano.map(L).join('\n'));
  if (out.mozna.length) console.log('MOŽNÁ (jen když):\n' + out.mozna.map(L).join('\n'));
  console.log(`NE: ${out.ne.map(x => x.id).join(', ') || '—'}`);
  const add = out.ano.filter(x => !x.aktivni); const agentAdd = add.filter(x => byId[x.id].typ !== 'hook'), hookAdd = add.filter(x => byId[x.id].typ === 'hook');
  if (!add.length) return console.log('Vše doporučené je aktivní.');
  if (agentAdd.length) console.log(`Aktivace (skilly, agenti, pravidla — smí agent): node "${path.join(here, 'katalog.mjs')}" aktivuj ${agentAdd.map(x => x.id).join(' ')} --cil "${cil}"`);
  if (hookAdd.length) console.log(`Hooky (${hookAdd.map(x => x.id).join(', ')}) aktivuje VLASTNÍK — mění pojistky agenta: START → [9] Katalog, nebo při aktualizaci balíku.`);
  console.log(`Odhad metadat doporučených položek: ~${add.reduce((s, x) => s + x.cena, 0)} tokenů; skutečné načítání a cena aktivace se podle harnessu liší.`);
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
const managedHash = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
function generatedHookGroup(p, spec) {
  const fileName = path.basename(p.zdroj);
  return { matcher: spec.matcher, hooks: [{ type: 'command', command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/katalog/${fileName}"`, timeout: 30 }] };
}
function validHookOwnership(p, records) {
  const expected = (p.hooky || []).map(spec => `${spec.udalost}\0${managedHash(JSON.stringify(generatedHookGroup(p, spec)))}`).sort();
  const seen = new Set();
  for (const record of records) {
    const position = `${record.event}\0${record.index}`;
    if (seen.has(position)) return false;
    seen.add(position);
  }
  const actual = records.map(record => `${record.event}\0${record.hash}`).sort();
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
function readManagedBlock(file, id) {
  const target = safePath(file); let text;
  try { text = fs.readFileSync(target, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return { text: '', match: null }; throw error; }
  const [open, close] = MARK(id); const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`${escape(open)}\\r?\\n[\\s\\S]*?${escape(close)}`, 'g'); const matches = [...text.matchAll(expression)];
  const openCount = text.split(open).length - 1, closeCount = text.split(close).length - 1;
  if (openCount !== closeCount || openCount !== matches.length || matches.length > 1) throw new Error(`spravovaný blok ${id} je poškozený nebo duplicitní; ponechávám`);
  const match = matches[0] || null;
  return { text, match: match && { start: match.index, end: match.index + match[0].length, raw: match[0], hash: managedHash(match[0]) } };
}
function checkManagedBlock(file, id, expected) {
  const { match } = readManagedBlock(file, id);
  if (match && (!expected || match.hash !== expected)) throw new Error(`spravovaný blok ${id} byl ručně změněn nebo nemá záznam vlastnictví; ponechávám`);
  return match;
}
function writeManagedBlock(file, id, text, expected) {
  const current = readManagedBlock(file, id); const match = current.match;
  if (match && (!expected || match.hash !== expected)) throw new Error(`spravovaný blok ${id} byl ručně změněn nebo nemá záznam vlastnictví; ponechávám`);
  const [open, close] = MARK(id); const block = text ? `${open}\n${text}\n${close}` : '';
  let next = current.text;
  if (match) next = next.slice(0, match.start) + block + next.slice(match.end);
  else if (block) next = `${next}${next && !next.endsWith('\n\n') ? (next.endsWith('\n') ? '\n' : '\n\n') : ''}${block}\n`;
  if (!next.trim()) { try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; } return null; }
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, next, 'utf8');
  return block ? managedHash(block) : null;
}
function hookSettings(p) {
  const file = safePath('.claude/settings.json');
  try {
    const settings = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || (settings.hooks !== undefined && (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)))) throw new Error('neplatný tvar');
    return { file, settings, exists: true };
  } catch (error) {
    if (error.code === 'ENOENT') return { file, settings: {}, exists: false };
    throw new Error(`${file} není čitelný platný JSON (${error.message}) — neupravuji`);
  }
}
function checkHookOwnership(p, ownership = []) {
  const { settings } = hookSettings(p); const hooks = settings.hooks || {};
  for (const [event, groups] of Object.entries(hooks)) if (!Array.isArray(groups)) throw new Error(`settings hooks.${event} není pole — neupravuji`);
  if (ownership.length && !validHookOwnership(p, ownership)) throw new Error(`záznam vlastnictví hooku ${p.id} neodpovídá jeho generovaným skupinám — ponechávám`);
  for (const record of ownership) {
    const groups = hooks[record.event];
    const group = groups?.[record.index];
    if (group && managedHash(JSON.stringify(group)) !== record.hash) throw new Error(`spravovaná hook skupina ${record.event}[${record.index}] byla ručně změněna; ponechávám`);
  }
  if (!ownership.length) {
    const file = path.basename(p.zdroj), command = `node "$CLAUDE_PROJECT_DIR/.claude/hooks/katalog/${file}"`;
    const exists = Object.values(hooks).some(groups => Array.isArray(groups) && groups.some(group => (group.hooks || []).some(hook => hook.command === command)));
    if (exists) throw new Error(`hook ${file} existuje bez záznamu vlastnictví; ponechávám`);
  }
}
function writeHookSettings(p, add, ownership = []) {
  checkHookOwnership(p, ownership);
  const { file, settings: original, exists } = hookSettings(p); const settings = structuredClone(original); const hooks = structuredClone(settings.hooks || {}); const owned = [];
  const removals = new Map();
  for (const record of ownership) removals.set(record.event, new Set([...(removals.get(record.event) || []), record.index]));
  for (const [event, indexes] of removals) {
    const groups = hooks[event]; if (!Array.isArray(groups)) continue;
    hooks[event] = groups.filter((_, index) => !indexes.has(index)); if (!hooks[event].length) delete hooks[event];
  }
  if (add) {
    for (const spec of p.hooky) {
      const group = generatedHookGroup(p, spec);
      const groups = [...(hooks[spec.udalost] || []), group]; hooks[spec.udalost] = groups;
      owned.push({ event: spec.udalost, index: groups.length - 1, hash: managedHash(JSON.stringify(group)) });
    }
  }
  if (Object.keys(hooks).length) settings.hooks = hooks; else delete settings.hooks;
  if (!Object.keys(settings).length) { if (exists) fs.unlinkSync(file); return owned; }
  fs.mkdirSync(path.dirname(file), { recursive: true }); safePath(file); fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return owned;
}
function preflightManaged(p, h, record) {
  const managed = record?.managed || {};
  if (p.typ === 'pravidla') checkManagedBlock(path.join(cil, h === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'), 'pravidla', managed.block);
  if (p.typ === 'hook') {
    if (record && !Array.isArray(managed.hooks)) throw new Error(`hook ${p.id} nemá záznam vlastnictví skupin; ponechávám`);
    checkHookOwnership(p, managed.hooks || []);
  }
}
function install(p, h, prior) {   // vrací obsahové hash souborů i vlastněných oblastí
  preflightManaged(p, h, prior);
  const out = {}; const put = (src, rel) => { const dst = safePath(rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); safePath(dst); fs.copyFileSync(src, dst); out[rel.split(path.sep).join('/')] = sha(dst); };
  const managed = {};
  if (p.typ === 'skill') { const base = h === 'codex' ? path.join('.agents', 'skills', p.id) : path.join('.claude', 'skills', p.id); for (const f of listFiles(path.join(KAT, p.zdroj))) put(f, path.join(base, path.relative(path.join(KAT, p.zdroj), f))); }
  else if (p.typ === 'agent') { if (h === 'codex') { const rel = path.join('.codex', 'agents', `${p.id}.toml`); const dst = safePath(rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); safePath(dst); fs.writeFileSync(dst, agentToml(rd(path.join(KAT, p.zdroj))), 'utf8'); out[rel.split(path.sep).join('/')] = sha(dst); }
    else put(path.join(KAT, p.zdroj), path.join('.claude', 'agents', `${p.id}.md`)); }
  else if (p.typ === 'pravidla') { const rel = path.join(h === 'codex' ? '.codex' : '.claude', 'prirucka', 'PROVOZ_AGENTU.md'); /* ne „pravidla": vedle .claude/rules by to mátlo (Claude Code načítá jen rules/) */ put(path.join(KAT, p.zdroj), rel);
    managed.block = writeManagedBlock(path.join(cil, h === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'), 'pravidla', rd(path.join(KAT, 'pravidla', 'ZAKLAD.md')).trim() + `\n- **Plná příručka** (subagenti, modely, bezpečnost, QA, git, provoz, Windows pasti, multi-projekt): \`${rel.split(path.sep).join('/')}\` — čti jen potřebnou sekci (Grep podle nadpisu), nikdy celou.`, prior?.managed?.block); }
  else if (p.typ === 'hook') { if (h === 'codex') throw new Error('hooky z katalogu jsou zatím jen pro Claude Code (v Codexu platí pojistky Auditoru a sandbox)');
    put(path.join(KAT, p.zdroj), path.join('.claude', 'hooks', 'katalog', path.basename(p.zdroj))); managed.hooks = writeHookSettings(p, true, prior?.managed?.hooks || []);
    if (p.sablona && !['.claude/STATE.md', 'STATE.md', 'docs/STATE.md'].some(x => fs.existsSync(safePath(x)))) { const d = safePath(p.sablona.do); fs.mkdirSync(path.dirname(d), { recursive: true }); safePath(d); fs.copyFileSync(path.join(KAT, p.sablona.z), d); } }
  return { soubory: out, managed };
}
function uninstall(p, h, rec) {
  preflightManaged(p, h, rec);
  for (const [rel, expected] of Object.entries(rec?.soubory || {})) { const file = safePath(rel); if (expected && fs.existsSync(file) && sha(file) === expected) fs.unlinkSync(file); }
  if (p.typ === 'skill') { const d = safePath(path.join(h === 'codex' ? '.agents' : '.claude', 'skills', p.id)); try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  if (p.typ === 'pravidla') writeManagedBlock(path.join(cil, h === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'), 'pravidla', '', rec?.managed?.block);
  if (p.typ === 'hook') writeHookSettings(p, false, rec?.managed?.hooks || []);
  // prázdné složky po katalogu (agents/, skills/<id>/, hooks/katalog/, pravidla/) — jen prázdné, nikdy cil samotný
  for (const rel of Object.keys(rec?.soubory || {})) { let d = path.dirname(safePath(rel)); while (d.length > cil.length && path.relative(cil, d) && !path.relative(cil, d).startsWith('..')) { safePath(d); try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch (e) { if (e.code !== 'ENOENT') break; } d = path.dirname(d); } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
  safePath(stateFile(harness));
  let s = loadState(harness); let err = 0; let changed = false;
  for (const id of ids) { const p = byId[id]; if (!p) { console.error(`  ✗ ${id}: v katalogu není`); err++; continue; }
    if (cmd === 'aktivuj' && existingItem(p, harness) && !s.aktivni[id]) { console.log(`  · ${id}: cílová role už v projektu existuje; ponechávám ji beze změny`); continue; }
    try {
      if (cmd === 'aktivuj') {
        const prior = s.aktivni[id]; const upr = Object.entries(prior?.soubory || {}).filter(([rel, hs]) => { const f = safePath(rel); return fs.existsSync(f) && (!hs || sha(f) !== hs); });
        if (upr.length) { console.log(`  ⚠ ${id}: ručně upravené (${upr.map(x => x[0]).join(', ')}) — ponechávám beze změny`); continue; }
        const installed = install(p, harness, prior); s = { ...s, aktivni: { ...s.aktivni, [id]: { typ: p.typ, ...installed, cas: prior?.cas || new Date().toISOString() } } }; changed = true; console.log(`  ✓ ${id} aktivní (${harness}${cena(p) ? `, ~${cena(p)} tok. odhad metadat` : ''})`);
      }
      else { uninstall(p, harness, s.aktivni[id]); const active = Object.fromEntries(Object.entries(s.aktivni).filter(([key]) => key !== id)); s = { ...s, aktivni: active }; changed = true; console.log(`  ✓ ${id} deaktivováno`); }
    } catch (e) { console.error(`  ✗ ${id}: ${e.message}`); err++; } }
  if (changed) saveState(harness, { ...s, verze: rd(path.join(here, 'VERZE')).trim() });
  const n = Object.keys(s.aktivni).filter(k => ['skill', 'agent'].includes(byId[k]?.typ)).length;
  if (n > 8) console.log(`  ⚠ aktivních skillů a agentů je ${n}; odhad metadat není skutečná cena načtení a aktivace se může lišit. Nech jen ty, které projekt opravdu používá.`);
  console.log('  Projeví se v nové session (okno spusť znovu).'); process.exit(err ? 1 : 0);
} else if (cmd === 'obnov') {
  let obnovErrors = 0;
  for (const h of ['claude', 'codex']) { let s = loadState(h); let ch = 0;
    for (const [id, rec] of Object.entries(s.aktivni)) { const p = byId[id]; if (!p) continue;
      const upr = Object.entries(rec.soubory || {}).filter(([rel, hs]) => { const f = safePath(rel); return fs.existsSync(f) && (!hs || sha(f) !== hs); });
      if (upr.length) { console.log(`  ⚠ ${id}: ručně upravené (${upr.map(x => x[0]).join(', ')}) — ponechávám, nová verze v katalogu`); continue; }
      try { const stare = Object.keys(rec.soubory || {}); const installed = install(p, h, rec); s = { ...s, aktivni: { ...s.aktivni, [id]: { ...rec, ...installed } } }; ch++;
        // soubory, které nová verze katalogu dává jinam (např. .claude/pravidla → .claude/prirucka), na staré cestě smazat + prázdné složky
        for (const rel of stare.filter(r => !(r in s.aktivni[id].soubory))) { const f = safePath(rel); if (rec.soubory[rel] && fs.existsSync(f) && sha(f) === rec.soubory[rel]) fs.unlinkSync(f); let d = path.dirname(f); while (d.length > cil.length && path.relative(cil, d) && !path.relative(cil, d).startsWith('..')) { safePath(d); try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch { break; } d = path.dirname(d); } }
      } catch (error) { console.error(`  ✗ ${id}: obnova selhala (${error.message})`); obnovErrors++; } }
    if (Object.keys(s.aktivni).length) { saveState(h, { ...s, verze: rd(path.join(here, 'VERZE')).trim() }); console.log(`  katalog (${h}): obnoveno ${ch} aktivních položek`); } }
  if (obnovErrors) process.exitCode = 1;
} else if (cmd === 'pruvodce') {   // vlastník: doporučení + výslovný souhlas (hooky smí aktivovat jen on)
  const out = recommendations(cil, 'kapitan', harness), rec = out.ano.map(x => byId[x.id]);
  if (!rec.length) { console.log('  Katalog: pro tento projekt není nic nového k aktivaci.'); process.exit(0); }
  console.log(`\n  KATALOG pro Kapitána (${path.basename(cil)}) — signály: ${out.signaly.join(', ') || 'bez zvláštních signálů'}:`);
  for (const note of out.podpora) console.log(`  Podpora databáze: ${note}`);
  for (const p of rec) console.log(`   • ${p.id} (${p.typ}) — ${p.k_cemu}`);
  console.log(`  Odhad metadat: ~${rec.reduce((n, p) => n + cena(p), 0)} tokenů; skutečné načítání a cena aktivace se podle harnessu liší. Nic dalšího se neinstaluje.`);
  const ask = async () => { if (has('--ano')) return true; if (!process.stdin.isTTY) return false; const rl = (await import('node:readline')).createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(r => rl.question('  Aktivovat? napiš ano (Enter = ne): ', x => { rl.close(); r(answerChoice(x)); })); };
  if (!(await ask())) { console.log('  Nic neaktivováno (kdykoli: START → [9]).'); process.exit(0); }
  let s = loadState(harness); for (const p of rec) { try { const installed = install(p, harness); s = { ...s, aktivni: { ...s.aktivni, [p.id]: { typ: p.typ, ...installed, cas: new Date().toISOString() } } }; console.log(`   ✓ ${p.id}`); } catch (e) { console.log(`   ✗ ${p.id}: ${e.message}`); } }
  saveState(harness, { ...s, posouzeno: new Date().toISOString(), verze: rd(path.join(here, 'VERZE')).trim() }); console.log('  Projeví se v novém okně Kapitána.');
} else { console.error('Příkazy: seznam | doporuc | aktivuj | deaktivuj | stav | obnov | pruvodce'); process.exit(1); }
}
export { answerChoice };
