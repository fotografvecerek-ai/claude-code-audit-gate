#!/usr/bin/env node
// PŘÍSNOST AUDITU za projekt — jediné místo pravdy (standard OWASP ASVS L1/L2/L3, žádná vlastní stupnice).
//   node tools/prisnost.mjs [--ws <workspace>] stav | kontext | nastav <prototyp|osobni|bezny|kriticky> [--vlastnik] | dluh-uzavren | potvrd [--instalator]
// Úroveň je v <workspace>/.rezim.json → "prisnost"; chybí nebo je neplatná = "bezny" (staré instalace beze změny).
// Každá změna se zapíše do AUDIT/_zmeny-nastaveni.log (A-029); úroveň mění jen vlastník (START/instalátor) — pojistka Kapitána `nastav` z agenta blokuje.
// Zvýšení úrovně založí úkol „audit dluhu" v AUDIT/NOVE_CILE.md a zapíše trvalý stav do AUDIT/.prisnost.json (update-install ho nepřepisuje
// a úkol z něj při každé aktualizaci znovu založí); `dluh-uzavren` (zapisuje auditor, ne Kapitán) dluh uzavře. První nastavení ani snížení dluh nezakládá.
// A-029 K3 — INTEGRITA (nezávislá na parsování shellu): nastavení vlastníka (.rezim.json, .opravneni.json, AUDIT/.prisnost.json) platí jen ve verzi
// z posledního SCHVÁLENÉHO commitu gitu workspace (autor vlastník = START/instalátor v terminálu, nebo nástroj dluh-uzavren; kořenový commit
// neschvaluje). Liší-li se disk → platí přísnější z (schválená, BĚŽNÝ, disk), u Kapitána nižší samostatnost, dluh zůstává otevřený; start to ohlásí + log.
// K4: git nefunguje (chybí, přesunut, poškozen, mimo PATH) → FAIL-CLOSED: max(BĚŽNÝ, disk), Kapitán 1, varování při každém startu + log.
// `potvrd` = vlastník v terminálu potvrdí nastavení na disku (update-install, instalátor, START → [7]).
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

export const LEVELS = ['prototyp', 'osobni', 'bezny', 'kriticky'];
export const DEFAULT_LEVEL = 'bezny';
export const LABELS = { prototyp: 'PROTOTYP', osobni: 'OSOBNÍ', bezny: 'BĚŽNÝ', kriticky: 'KRITICKÝ' };
export const RULES = {
  prototyp: 'blokuje jen P0 typu ztráta dat · únik tajemství · poškození stroje; statika + rychlý re-sken, Playwright/UI/a11y/perf jen na pokyn „milník“ (max 1×/den); ověření lehké, 1 kolo; ostatní nálezy do AUDIT/DLUH.md',
  osobni: 'blokuje P0 + P1 bezpečnost (data, tajemství, přihlášení); ASVS L1, UI sanity bez a11y/perf; ověření lehké; ostatní nálezy do AUDIT/DLUH.md',
  bezny: 'blokuje všechny P0/P1; ASVS L2, plný audit a ověření jako dosud',
  kriticky: 'blokuje P0/P1 + P2 bezpečnost; ASVS L3, plný ui-crawl + a11y + perf, CI 2× zelené, plný nezávislý ověřovatel',
};
const DEBT_HEADER = '# Dluh auditu (neblokující nálezy podle úrovně přísnosti)\n\nZapisuj sem nálezy, které při dané úrovni přísnosti neblokují vydání: ID, závažnost, 1 věta. Nic se neztrácí — při přepnutí na vyšší úroveň se dluh jednou celý projde.\n\n';

const rezimFile = ws => path.join(ws, '.rezim.json');
const isLevel = x => LEVELS.includes(x);
function readRezim(ws) {
  let raw; try { raw = fs.readFileSync(rezimFile(ws), 'utf8').replace(/^﻿/, ''); } catch { return {}; }
  try { const j = JSON.parse(raw); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; }
  catch { throw new Error(`Soubor ${rezimFile(ws)} není platný JSON — oprav ho ručně, přísnost do něj nezapíšu (nepřepíšu ostatní nastavení).`); }
}

// ---- integrita proti gitu workspace (A-029 K3, K4) ----
const OWNER = { name: 'vlastník', email: 'vlastnik@auditor.local' };
const TOOL = { name: 'auditor (dluh-uzavren)', email: 'dluh@auditor.local' };
const INSTALL = { name: 'auditor', email: 'auditor@local' };
const APPROVED = new Set([OWNER.email, TOOL.email]);
const F_REZIM = '.rezim.json', F_OPR = '.opravneni.json', F_DLUH = 'AUDIT/.prisnost.json';
const INTEGRITY_FILES = [F_REZIM, F_OPR, F_DLUH];
const gitEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));   // GIT_DIR/GIT_WORK_TREE apod. by přesměrovaly kontrolu
function git(ws, args) {
  const r = spawnSync('git', ['-C', ws, ...args], { encoding: 'utf8', env: gitEnv(), windowsHide: true });
  return { ok: r.status === 0, out: String(r.stdout || ''), chybi: !!r.error };
}
// K4: stav gitu ws. ws musí být kořen vlastního repa (prázdný prefix) — porovnání cest by padalo na 8.3 jménech (Windows) a /private/var (macOS).
// Jakékoli selhání (git mimo PATH, .git smazán/přesunut, poškozený, ws uvnitř cizího repa, stará instalace bez gitu) = FAIL-CLOSED v integrity().
// „Nikdy neměl git" se od „git zmizel" spolehlivě rozlišit nedá (vše na disku přepíše i Kapitán) → obojí fail-closed; opravu udělá vlastník (START → [7], update-install).
function gitState(ws) {
  const r = git(ws, ['rev-parse', '--show-prefix']);
  if (r.chybi) return { ok: false, duvod: 'git není dostupný (mimo PATH)' };
  if (r.ok && r.out.trim() === '') return { ok: true };
  if (!fs.existsSync(path.join(ws, '.git'))) return { ok: false, duvod: r.ok ? 'workspace auditora nemá vlastní .git (je uvnitř jiného repa)' : 'workspace auditora nemá .git (smazán, přesunut, nebo stará instalace bez gitu)' };
  return { ok: false, duvod: 'git workspace auditora je poškozený (.git nejde přečíst)' };
}
const isGitWs = ws => gitState(ws).ok;
// K4: schvaluje jen commit s autorem vlastník / nástroj dluh-uzavren. Kořenový commit (instalace, checkout --orphan) už NESCHVALUJE — platí výchozí.
function approvedBlob(ws, rel) {
  const r = git(ws, ['log', '--format=%H %ae', '--', rel]); if (!r.ok) return null;
  for (const line of r.out.split('\n').map(s => s.trim()).filter(Boolean)) {
    const [h, ae] = line.split(' ');
    if (APPROVED.has(ae)) { const s = git(ws, ['show', `${h}:${rel}`]); return s.ok ? s.out : null; }
  }
  return null;
}
const parseJson = raw => { if (raw == null) return {}; try { const j = JSON.parse(String(raw).replace(/^﻿/, '')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; } };
const readRaw = (ws, rel) => { try { return fs.readFileSync(path.join(ws, rel), 'utf8'); } catch { return null; } };
const levOf = j => isLevel(j.prisnost) ? j.prisnost : DEFAULT_LEVEL;
const kapOf = j => [1, 2, 3].includes(+j.kapitan) ? +j.kapitan : 1;
const debtOf = j => { const d = j.audit_dluhu; return d && d.otevren === true && isLevel(d.uroven) ? { otevren: true, uroven: d.uroven, od: String(d.od || '') } : { otevren: false }; };
const debtKey = d => d.otevren ? `otevřen:${d.uroven}` : 'uzavřen';
const stricter = (...ls) => LEVELS[Math.max(...ls.map(l => LEVELS.indexOf(l)))];

// Efektivní nastavení: { git, duvod?, level, kapitan, debt, disk: { level, kapitan }, zmeny: [{ rel, z, na, plati, label }] }
export function integrity(ws) {
  const dl = levOf(parseJson(readRaw(ws, F_REZIM))), dk = kapOf(parseJson(readRaw(ws, F_OPR))), dd = debtOf(parseJson(readRaw(ws, F_DLUH)));
  const disk = { level: dl, kapitan: dk };
  const st = gitState(ws);
  if (!st.ok) return { git: false, duvod: st.duvod, level: stricter(DEFAULT_LEVEL, dl), kapitan: 1, debt: dd, disk, zmeny: [] };   // K4: fail-closed
  const head = rel => parseJson(approvedBlob(ws, rel));
  const hl = levOf(head(F_REZIM)), hk = kapOf(head(F_OPR)), hd = debtOf(head(F_DLUH));
  const level = dl === hl ? dl : stricter(hl, DEFAULT_LEVEL, dl), kapitan = Math.min(hk, dk), debt = hd.otevren ? hd : dd;
  const zmeny = [];
  if (dl !== hl) zmeny.push({ rel: F_REZIM, z: hl, na: dl, plati: level, label: LABELS[level] });
  if (dk !== hk) zmeny.push({ rel: F_OPR, z: String(hk), na: String(dk), plati: String(kapitan), label: `samostatnost Kapitána ${kapitan}` });
  if (debtKey(dd) !== debtKey(hd)) zmeny.push({ rel: F_DLUH, z: debtKey(hd), na: debtKey(dd), plati: debtKey(debt), label: `audit dluhu ${debt.otevren ? 'otevřen' : 'uzavřen'}` });
  return { git: true, level, kapitan, debt, disk, zmeny };
}
export const summary = it => `platí ${LABELS[it.level]}, samostatnost Kapitána ${it.kapitan}; na disku ${LABELS[it.disk.level]}, samostatnost ${it.disk.kapitan}${it.git ? '' : `; ${it.duvod}`}`;
// Commit nastavení do gitu ws (K4: NEexportováno). Jen vyjmenované soubory — cizí přepis se tím neschválí.
function commitAs(ws, msg, files, who) {
  if (!isGitWs(ws)) return false;
  const tracked = new Set(git(ws, ['ls-files', '--', ...files]).out.split('\n').map(s => s.trim()).filter(Boolean));
  const fl = files.filter(f => fs.existsSync(path.join(ws, f)) || tracked.has(f)); if (!fl.length) return false;
  if (!git(ws, ['add', '-f', '-A', '--', ...fl]).ok) return false;
  return git(ws, ['-c', `user.name=${who.name}`, '-c', `user.email=${who.email}`, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', msg, '--', ...fl]).ok;
}
// K4: ws bez .git (stará instalace, přesunutý .git) dostane nový git — kořenový commit nic neschvaluje, potvrzení je na vlastníkovi. Poškozený .git se nepřepisuje.
export function ensureWsGit(ws) {
  const st = gitState(ws); if (st.ok) return { ok: true, created: false };
  if (/mimo PATH/.test(st.duvod)) return { ok: false, duvod: `${st.duvod} — nainstaluj Git (git-scm.com) a spusť znovu` };
  if (fs.existsSync(path.join(ws, '.git'))) return { ok: false, duvod: `${st.duvod} — oprav ho (nebo přesuň .git stranou) a spusť znovu` };
  const ok = git(ws, ['init', '-q']).ok && git(ws, ['config', 'core.autocrlf', 'false']).ok && git(ws, ['add', '-A']).ok
    && git(ws, ['-c', `user.name=${INSTALL.name}`, '-c', `user.email=${INSTALL.email}`, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'auditor workspace init (obnova gitu)']).ok;
  return ok && isGitWs(ws) ? { ok: true, created: true } : { ok: false, duvod: 'git init workspace auditora selhal' };
}

// ---- potvrzení vlastníka (A-029 K4): terminál, který agent v Claude Code nemá ----
// stdin TTY (START.cmd, terminál) → vlastník volbu právě zadal; jinak (Git Bash/mintty: isTTY=false) výslovné „ano“ z konzole (/dev/tty, na Windows CONIN$).
// AUDITOR_BEZ_TTY (samotest) a CLAUDECODE (proces z Claude Code) schválení vždy ZAKÁŽOU — proměnná nic nepovoluje, jen odebírá.
const NO_TTY = 'schválení nastavení potřebuje terminál vlastníka — spusť START → [7] (samostatnost Kapitána) nebo [10] (přísnost) v okně terminálu (Windows: START.cmd dvojklikem).';
export const blocked = () => process.env.AUDITOR_BEZ_TTY ? 'samotest' : (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) ? 'běží z agenta (Claude Code)' : '';
const TTY_IN = process.platform === 'win32' ? '\\\\.\\CONIN$' : '/dev/tty', TTY_OUT = process.platform === 'win32' ? '\\\\.\\CONOUT$' : '/dev/tty';
export function ttyAvailable() { if (blocked()) return false; try { fs.closeSync(fs.openSync(TTY_IN, 'r')); return true; } catch { return false; } }
export function readConfirm(fd) {   // jeden řádek z konzole (max 64 bajtů); platí jen „ano“
  const b = Buffer.alloc(1); let line = '';
  try { while (line.length < 64 && fs.readSync(fd, b, 0, 1, null) === 1) { const c = b.toString('utf8'); if (c === '\n') break; line += c; } } catch { return false; }
  return /^ano$/i.test(line.trim());
}
export function ttyConfirm(question) {
  const bl = blocked(); if (bl) return { ok: false, duvod: `${bl} — ${NO_TTY}` };
  let fi; try { fi = fs.openSync(TTY_IN, 'r'); } catch { return { ok: false, duvod: `konzole není k dispozici — ${NO_TTY}` }; }
  let fo = null; if (!process.stdout.isTTY) { try { fo = fs.openSync(TTY_OUT, 'w'); } catch { } }
  const say = t => { try { if (fo !== null) fs.writeSync(fo, t, null, 'utf8'); else process.stdout.write(t); } catch { } };
  try { say(`\n${question}\nPotvrď napsáním „ano“ (cokoli jiného = ne): `); return readConfirm(fi) ? { ok: true } : { ok: false, duvod: 'vlastník nepotvrdil' }; }
  finally { try { fs.closeSync(fi); } catch { } if (fo !== null) try { fs.closeSync(fo); } catch { } }
}
// Schválení nastavení vlastníkem = commit s autorem „vlastník“. Volá START/instalátor/opravneni.mjs; bez terminálu vlastníka nic neschválí.
export function ownerApprove(ws, msg, files = INTEGRITY_FILES) {
  if (blocked() || !isGitWs(ws)) return false;
  if (!process.stdin.isTTY) { const c = ttyConfirm(`Schválit nastavení auditora (${msg})? Potvrď jen, když jsi změnu právě udělal ty ze START.`); if (!c.ok) { console.error(`  ⚠ neschváleno: ${c.duvod}`); return false; } }
  return commitAs(ws, msg, files, OWNER);
}
// `potvrd`: vlastník potvrdí nastavení, která jsou na disku (update-install, START → [7], instalátor po založení gitu). --instalator + TTY = bez dalšího dotazu.
export function confirmCurrent(ws, { instalator = false } = {}) {
  const g = ensureWsGit(ws); if (!g.ok) { console.error(`  ⚠ ${g.duvod}`); return false; }
  const it = integrity(ws); if (!it.zmeny.length) { console.log('  ✅ nastavení auditora je schválené vlastníkem'); return true; }
  console.log(`  Nastavení auditora nejsou schválená vlastníkem (${summary(it)}):`);
  for (const z of it.zmeny) console.log(`    ${z.rel}: schváleno ${z.z}, na disku ${z.na}`);
  const bl = blocked(); if (bl) { console.error(`  ⚠ neschváleno: ${bl} — ${NO_TTY}`); return false; }
  if (!(instalator && process.stdin.isTTY)) { const c = ttyConfirm('Potvrdit nastavení na disku jako tvoje?'); if (!c.ok) { console.error(`  ⚠ neschváleno: ${c.duvod}`); return false; } }
  const ok = commitAs(ws, 'vlastník: potvrzení nastavení na disku', INTEGRITY_FILES, OWNER); console.log(ok ? '  ✅ nastavení potvrzeno' : '  ⚠ commit potvrzení selhal'); return ok;
}
const safe = (f, dflt) => { try { return f(); } catch { return dflt; } };
export function readLevel(ws) { return safe(() => integrity(ws).level, DEFAULT_LEVEL); }
export function kapitanLevel(ws) { return safe(() => integrity(ws).kapitan, 1); }

// A-029: každá změna úrovně → řádek v <ws>/AUDIT/_zmeny-nastaveni.log („<ISO čas>  <z> → <na>  zdroj=<…>“, UTF-8, append). AUDITOR_ZDROJ z env
// je jen tvrzení: bez commitu vlastníka se zapíše jako „neověřeno(<zdroj>)“. Start (kontext/preflight) ohlásí poslední změnu mladší než 7 dní.
const CHANGE_LOG = ws => path.join(ws, 'AUDIT', '_zmeny-nastaveni.log');
const RECENT_MS = 7 * 24 * 3600 * 1000;
function logChange(ws, prev, level, verified) {
  const z = String(process.env.AUDITOR_ZDROJ || 'cli').replace(/\s+/g, '_').slice(0, 40);
  fs.appendFileSync(CHANGE_LOG(ws), `${new Date().toISOString()}  ${prev || '(nic)'} → ${level}  zdroj=${verified ? z : `neověřeno(${z})`}\n`, 'utf8');
}
export function lastChange(ws, now = Date.now()) {
  let lines; try { lines = fs.readFileSync(CHANGE_LOG(ws), 'utf8').trim().split(/\r?\n/).filter(l => !/\s(soubor|integrita)=/.test(l)); } catch { return null; }
  const m = /^(\S+)\s+(\S+) → (\S+)\s+zdroj=(\S+)/.exec(lines.pop() || ''); if (!m) return null;
  const t = Date.parse(m[1]); if (!Number.isFinite(t) || now - t > RECENT_MS || now - t < -RECENT_MS) return null;
  return { cas: m[1], z: m[2], na: m[3], zdroj: m[4] };
}
function logIntegrity(ws, z) {
  const mt = safe(() => fs.statSync(path.join(ws, z.rel)).mtime.toISOString(), 'smazáno');
  const sig = `${z.z} → ${z.na}  zdroj=neověřeno  soubor=${z.rel}  platí=${z.plati}  změněno=${mt}`;
  safe(() => { fs.mkdirSync(path.join(ws, 'AUDIT'), { recursive: true }); if (!(readRaw(ws, 'AUDIT/_zmeny-nastaveni.log') || '').includes(sig)) fs.appendFileSync(CHANGE_LOG(ws), `${new Date().toISOString()}  ${sig}\n`, 'utf8'); });
}
// K4: selhání gitu = varování při KAŽDÉM startu (žádný marker ho neumlčí) + řádek do logu (jednou za stav, bez časového razítka v podpisu).
function logNoGit(ws, it) {
  const sig = `integrita=bez-gitu  duvod=${it.duvod}  platí=${it.level}/kapitan${it.kapitan}  disk=${it.disk.level}/kapitan${it.disk.kapitan}`;
  safe(() => { fs.mkdirSync(path.join(ws, 'AUDIT'), { recursive: true }); if (!(readRaw(ws, 'AUDIT/_zmeny-nastaveni.log') || '').includes(sig)) fs.appendFileSync(CHANGE_LOG(ws), `${new Date().toISOString()}  ${sig}\n`, 'utf8'); });
}
function integrityNotes(ws, it) {
  if (!it.git) {
    logNoGit(ws, it);
    return [`[PŘÍSNOST] ⚠ kontrola integrity nastavení nefunguje: ${it.duvod} — platí přísnější nastavení (${LABELS[it.level]}, samostatnost Kapitána ${it.kapitan}). Ohlas vlastníkovi; oprava: START → [7] v terminálu (obnoví git workspace a vlastník potvrdí nastavení).`];
  }
  return it.zmeny.map(z => { logIntegrity(ws, z); return `[PŘÍSNOST] ⚠ nastavení změněno mimo START (neschváleno vlastníkem) — platí ${z.label} (${z.rel}: schváleno ${z.z}, na disku ${z.na}). Ohlas vlastníkovi; potvrdit změnu může jen on přes START.`; });
}

// Trvalá evidence dluhu: AUDIT/.prisnost.json → { audit_dluhu: { otevren, uroven, od } } (mimo NOVE_CILE.md, které update přepisuje).
const debtFile = ws => path.join(ws, 'AUDIT', '.prisnost.json');
const readDebtState = ws => parseJson(readRaw(ws, F_DLUH));
function writeDebtState(ws, audit_dluhu) {
  fs.mkdirSync(path.join(ws, 'AUDIT'), { recursive: true });
  fs.writeFileSync(debtFile(ws), JSON.stringify({ ...readDebtState(ws), audit_dluhu }, null, 2) + '\n', 'utf8');
}
export function debtStatus(ws) { return safe(() => integrity(ws).debt, debtOf(readDebtState(ws))); }
export function closeDebt(ws) {
  const d = debtStatus(ws); if (!d.otevren) return false;
  writeDebtState(ws, { ...(readDebtState(ws).audit_dluhu || {}), ...d, otevren: false, uzavreno: new Date().toISOString() });
  commitAs(ws, `auditor: audit dluhu ${LABELS[d.uroven]} uzavřen`, [F_DLUH], TOOL); return true;
}
const lbl = x => LABELS[x] || x;
export function contextLine(level, ws, it = ws ? safe(() => integrity(ws), null) : null) {
  const l = isLevel(level) ? level : DEFAULT_LEVEL; const base = `[PŘÍSNOST] ${LABELS[l]} — ${RULES[l]}`;
  const out = [it && it.debt.otevren ? `${base} — audit dluhu otevřen` : base];
  const ch = ws ? lastChange(ws) : null;
  if (ch) out.push(`[PŘÍSNOST] Poslední změna přísnosti: ${ch.cas.slice(0, 16).replace('T', ' ')} UTC ${lbl(ch.z)} → ${lbl(ch.na)} (${ch.zdroj}) — nečekanou změnu ohlas vlastníkovi.`);
  if (it) out.push(...integrityNotes(ws, it));
  return out.join('\n');
}

// vlastnik: volá START/instalátor s --vlastnik; schválení (commit vlastníka) jen přes ownerApprove = terminál vlastníka (agent v Claude Code ho nemá).
export function setLevel(ws, level, { vlastnik = false } = {}) {
  if (!isLevel(level)) throw new Error(`Neplatná úroveň přísnosti „${level}“. Platné: ${LEVELS.join(', ')}.`);
  const cur = readRezim(ws);
  const prev = isLevel(cur.prisnost) ? cur.prisnost : null;   // K4: z disku (efektivní úroveň může být kvůli integritě jiná)
  const raised = prev !== null && LEVELS.indexOf(level) > LEVELS.indexOf(prev);
  fs.mkdirSync(ws, { recursive: true });
  fs.writeFileSync(rezimFile(ws), JSON.stringify({ ...cur, prisnost: level }, null, 2) + '\n', 'utf8');
  const auditDir = path.join(ws, 'AUDIT'); fs.mkdirSync(auditDir, { recursive: true });
  const debt = path.join(auditDir, 'DLUH.md');
  if (!fs.existsSync(debt)) fs.writeFileSync(debt, DEBT_HEADER, 'utf8');
  if (raised) {
    const nc = path.join(auditDir, 'NOVE_CILE.md');
    const head = fs.existsSync(nc) ? '' : '# Nové cíle auditu\n\n';
    const line = `- [ ] **DLUH-${LABELS[level]}** — Audit dluhu (AUDIT/DLUH.md) podle úrovně ${LABELS[level]} (přísnost zvýšena z ${LABELS[prev]}) — release gate 🔴 do uzavření.\n`;
    fs.appendFileSync(nc, head + line, 'utf8');
    writeDebtState(ws, { otevren: true, uroven: level, od: new Date().toISOString() });
  }
  const owner = !!vlastnik && ownerApprove(ws, `vlastník: přísnost ${prev || '(nic)'}→${level}`, raised ? [F_REZIM, F_DLUH] : [F_REZIM]);
  if (prev !== level) logChange(ws, prev, level, owner);
  return { level, prev, raised, owner };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2); const wi = a.indexOf('--ws'); const vlastnik = a.includes('--vlastnik');
  const ws = path.resolve(wi >= 0 ? a[wi + 1] : '.'); const rest = a.filter((x, i) => (wi < 0 || (i !== wi && i !== wi + 1)) && x !== '--vlastnik');
  const [cmd, arg] = rest;
  try {
    if (cmd === 'stav') { const l = readLevel(ws); console.log(`Přísnost auditu: ${LABELS[l]} (${l})\n${RULES[l]}`); }
    else if (cmd === 'kontext') { const it = safe(() => integrity(ws), null); console.log(contextLine(it ? it.level : readLevel(ws), ws, it)); }
    else if (cmd === 'nastav') {
      const r = setLevel(ws, String(arg || '').toLowerCase(), { vlastnik });
      console.log(`Přísnost auditu nastavena: ${LABELS[r.level]}.${r.raised ? ' Založen úkol „audit dluhu" v AUDIT/NOVE_CILE.md.' : ''}`);
    } else if (cmd === 'dluh-uzavren') console.log(closeDebt(ws) ? 'Audit dluhu uzavřen.' : 'Žádný otevřený audit dluhu.');
    else if (cmd === 'potvrd') process.exit(confirmCurrent(ws, { instalator: rest.includes('--instalator') }) ? 0 : 2);
    else { console.error('Použití: node tools/prisnost.mjs [--ws <cesta>] stav | kontext | nastav <prototyp|osobni|bezny|kriticky> [--vlastnik] | dluh-uzavren | potvrd [--instalator]'); process.exit(1); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
