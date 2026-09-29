#!/usr/bin/env node
// PŘÍSNOST AUDITU za projekt — jediné místo pravdy (standard OWASP ASVS L1/L2/L3, žádná vlastní stupnice).
//   node tools/prisnost.mjs [--ws <workspace>] stav | kontext | nastav <prototyp|osobni|bezny|kriticky> [--vlastnik] | dluh-uzavren
// Úroveň je v <workspace>/.rezim.json → "prisnost"; chybí nebo je neplatná = "bezny" (staré instalace beze změny).
// Každá změna se zapíše do AUDIT/_zmeny-nastaveni.log (A-029); úroveň mění jen vlastník (START/instalátor) — pojistka Kapitána `nastav` z agenta blokuje.
// Zvýšení úrovně založí úkol „audit dluhu" v AUDIT/NOVE_CILE.md a zapíše trvalý stav do AUDIT/.prisnost.json (update-install ho nepřepisuje
// a úkol z něj při každé aktualizaci znovu založí); `dluh-uzavren` (zapisuje auditor, ne Kapitán) dluh uzavře. První nastavení ani snížení dluh nezakládá.
// A-029 K3 — INTEGRITA (nezávislá na parsování shellu): nastavení vlastníka (.rezim.json, .opravneni.json, AUDIT/.prisnost.json) platí jen ve verzi
// z posledního SCHVÁLENÉHO commitu gitu workspace (autor vlastník = START/instalátor s `--vlastnik` v terminálu, nástroj dluh-uzavren, nebo první commit
// instalace). Liší-li se disk → platí přísnější z (schválená, BĚŽNÝ, disk), u Kapitána nižší samostatnost, dluh zůstává otevřený; start to ohlásí + log.
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

// ---- integrita proti gitu workspace (A-029 K3) ----
const OWNER = { name: 'vlastník', email: 'vlastnik@auditor.local' };
const TOOL = { name: 'auditor (dluh-uzavren)', email: 'dluh@auditor.local' };
const APPROVED = new Set([OWNER.email, TOOL.email]);
const F_REZIM = '.rezim.json', F_OPR = '.opravneni.json', F_DLUH = 'AUDIT/.prisnost.json';
const INTEGRITY_FILES = [F_REZIM, F_OPR, F_DLUH];
const gitEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));   // GIT_DIR/GIT_WORK_TREE apod. by přesměrovaly kontrolu
function git(ws, args) {
  const r = spawnSync('git', ['-C', ws, ...args], { encoding: 'utf8', env: gitEnv(), windowsHide: true });
  return { ok: r.status === 0, out: String(r.stdout || '') };
}
// ws musí být kořen vlastního repa (prázdný prefix) — porovnání cest by padalo na 8.3 jménech (Windows) a /private/var (macOS)
const isGitWs = ws => { const r = git(ws, ['rev-parse', '--show-prefix']); return r.ok && r.out.trim() === ''; };
function approvedBlob(ws, rel) {
  const r = git(ws, ['log', '--format=%H %ae %P', '--', rel]); if (!r.ok) return null;
  for (const line of r.out.split('\n').map(s => s.trim()).filter(Boolean)) {
    const [h, ae, ...parents] = line.split(' ');
    if (APPROVED.has(ae) || parents.length === 0) { const s = git(ws, ['show', `${h}:${rel}`]); return s.ok ? s.out : null; }
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

// Efektivní nastavení: { git, level, kapitan, debt, zmeny: [{ rel, z, na, plati, label }] }
export function integrity(ws) {
  const dl = levOf(parseJson(readRaw(ws, F_REZIM))), dk = kapOf(parseJson(readRaw(ws, F_OPR))), dd = debtOf(parseJson(readRaw(ws, F_DLUH)));
  if (!isGitWs(ws)) return { git: false, level: dl, kapitan: dk, debt: dd, zmeny: [] };
  const head = rel => parseJson(approvedBlob(ws, rel));
  const hl = levOf(head(F_REZIM)), hk = kapOf(head(F_OPR)), hd = debtOf(head(F_DLUH));
  const level = dl === hl ? dl : stricter(hl, DEFAULT_LEVEL, dl), kapitan = Math.min(hk, dk), debt = hd.otevren ? hd : dd;
  const zmeny = [];
  if (dl !== hl) zmeny.push({ rel: F_REZIM, z: hl, na: dl, plati: level, label: LABELS[level] });
  if (dk !== hk) zmeny.push({ rel: F_OPR, z: String(hk), na: String(dk), plati: String(kapitan), label: `samostatnost Kapitána ${kapitan}` });
  if (debtKey(dd) !== debtKey(hd)) zmeny.push({ rel: F_DLUH, z: debtKey(hd), na: debtKey(dd), plati: debtKey(debt), label: `audit dluhu ${debt.otevren ? 'otevřen' : 'uzavřen'}` });
  return { git: true, level, kapitan, debt, zmeny };
}
// Commit nastavení do gitu ws jako vlastník (START/instalátor) nebo nástroj dluh-uzavren. Jen vyjmenované soubory — cizí přepis se tím neschválí.
export function commitSettings(ws, msg, files = INTEGRITY_FILES, who = OWNER) {
  if (!isGitWs(ws)) return false;
  const tracked = new Set(git(ws, ['ls-files', '--', ...files]).out.split('\n').map(s => s.trim()).filter(Boolean));
  const fl = files.filter(f => fs.existsSync(path.join(ws, f)) || tracked.has(f)); if (!fl.length) return false;
  if (!git(ws, ['add', '-f', '-A', '--', ...fl]).ok) return false;
  return git(ws, ['-c', `user.name=${who.name}`, '-c', `user.email=${who.email}`, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', msg, '--', ...fl]).ok;
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
  let lines; try { lines = fs.readFileSync(CHANGE_LOG(ws), 'utf8').trim().split(/\r?\n/).filter(l => !/\ssoubor=/.test(l)); } catch { return null; }
  const m = /^(\S+)\s+(\S+) → (\S+)\s+zdroj=(\S+)/.exec(lines.pop() || ''); if (!m) return null;
  const t = Date.parse(m[1]); if (!Number.isFinite(t) || now - t > RECENT_MS || now - t < -RECENT_MS) return null;
  return { cas: m[1], z: m[2], na: m[3], zdroj: m[4] };
}
function logIntegrity(ws, z) {
  const mt = safe(() => fs.statSync(path.join(ws, z.rel)).mtime.toISOString(), 'smazáno');
  const sig = `${z.z} → ${z.na}  zdroj=neověřeno  soubor=${z.rel}  platí=${z.plati}  změněno=${mt}`;
  safe(() => { fs.mkdirSync(path.join(ws, 'AUDIT'), { recursive: true }); if (!(readRaw(ws, 'AUDIT/_zmeny-nastaveni.log') || '').includes(sig)) fs.appendFileSync(CHANGE_LOG(ws), `${new Date().toISOString()}  ${sig}\n`, 'utf8'); });
}
function integrityNotes(ws, it) {
  if (!it.git) {
    const mk = path.join(ws, 'AUDIT', '.integrita-bez-gitu'); if (fs.existsSync(mk)) return [];
    safe(() => { fs.mkdirSync(path.dirname(mk), { recursive: true }); fs.writeFileSync(mk, new Date().toISOString() + '\n', 'utf8'); });
    return ['[PŘÍSNOST] ⚠ workspace auditora není git (stará instalace) — kontrola integrity nastavení vlastníka neběží, platí soubory na disku.'];
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
  commitSettings(ws, `auditor: audit dluhu ${LABELS[d.uroven]} uzavřen`, [F_DLUH], TOOL); return true;
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

// vlastnik: volá START/instalátor s --vlastnik; commit vlastníka jen z terminálu (agent v Claude Code terminál nemá).
export function setLevel(ws, level, { vlastnik = false } = {}) {
  if (!isLevel(level)) throw new Error(`Neplatná úroveň přísnosti „${level}“. Platné: ${LEVELS.join(', ')}.`);
  const cur = readRezim(ws);
  const prev = isLevel(cur.prisnost) ? readLevel(ws) : null;
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
  const owner = !!(vlastnik && process.stdin.isTTY) && commitSettings(ws, `vlastník: přísnost ${prev || '(nic)'}→${level}`, raised ? [F_REZIM, F_DLUH] : [F_REZIM]);
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
    else { console.error('Použití: node tools/prisnost.mjs [--ws <cesta>] stav | kontext | nastav <prototyp|osobni|bezny|kriticky> [--vlastnik] | dluh-uzavren'); process.exit(1); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
