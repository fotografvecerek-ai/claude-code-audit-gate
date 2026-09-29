#!/usr/bin/env node
// PŘÍSNOST AUDITU za projekt — jediné místo pravdy (standard OWASP ASVS L1/L2/L3, žádná vlastní stupnice).
//   node tools/prisnost.mjs [--ws <workspace>] stav | kontext | nastav <prototyp|osobni|bezny|kriticky>
// Úroveň je v <workspace>/.rezim.json → "prisnost"; chybí nebo je neplatná = "bezny" (staré instalace beze změny).
// Každá změna se zapíše do AUDIT/_zmeny-nastaveni.log (A-029); úroveň mění jen vlastník (START/instalátor) — pojistka Kapitána `nastav` z agenta blokuje.
// Zvýšení úrovně založí úkol „audit dluhu" v AUDIT/NOVE_CILE.md; první nastavení (klíč dosud chyběl) ani snížení ne.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

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
export function readLevel(ws) { try { const p = readRezim(ws).prisnost; return isLevel(p) ? p : DEFAULT_LEVEL; } catch { return DEFAULT_LEVEL; } }
// A-029: každá změna úrovně → řádek v <ws>/AUDIT/_zmeny-nastaveni.log („<ISO čas>  <z> → <na>  zdroj=<AUDITOR_ZDROJ|cli>“, UTF-8, append);
// start auditora (kontext/preflight) ohlásí poslední změnu, je-li mladší než 7 dní — nečekaná změna úrovně je vidět.
const CHANGE_LOG = ws => path.join(ws, 'AUDIT', '_zmeny-nastaveni.log');
const RECENT_MS = 7 * 24 * 3600 * 1000;
function logChange(ws, prev, level) {
  const zdroj = String(process.env.AUDITOR_ZDROJ || 'cli').replace(/\s+/g, '_').slice(0, 40);
  fs.appendFileSync(CHANGE_LOG(ws), `${new Date().toISOString()}  ${prev || '(nic)'} → ${level}  zdroj=${zdroj}\n`, 'utf8');
}
export function lastChange(ws, now = Date.now()) {
  let lines; try { lines = fs.readFileSync(CHANGE_LOG(ws), 'utf8').trim().split(/\r?\n/); } catch { return null; }
  const m = /^(\S+)\s+(\S+) → (\S+)\s+zdroj=(\S+)/.exec(lines.pop() || ''); if (!m) return null;
  const t = Date.parse(m[1]); if (!Number.isFinite(t) || now - t > RECENT_MS || now - t < -RECENT_MS) return null;
  return { cas: m[1], z: m[2], na: m[3], zdroj: m[4] };
}
const lbl = x => LABELS[x] || x;
export function contextLine(level, ws) {
  const l = isLevel(level) ? level : DEFAULT_LEVEL; const base = `[PŘÍSNOST] ${LABELS[l]} — ${RULES[l]}`;
  const ch = ws ? lastChange(ws) : null;
  return ch ? `${base}\n[PŘÍSNOST] Poslední změna přísnosti: ${ch.cas.slice(0, 16).replace('T', ' ')} UTC ${lbl(ch.z)} → ${lbl(ch.na)} (${ch.zdroj}) — nečekanou změnu ohlas vlastníkovi.` : base;
}

export function setLevel(ws, level) {
  if (!isLevel(level)) throw new Error(`Neplatná úroveň přísnosti „${level}“. Platné: ${LEVELS.join(', ')}.`);
  const cur = readRezim(ws);
  const prev = isLevel(cur.prisnost) ? cur.prisnost : null;
  const raised = prev !== null && LEVELS.indexOf(level) > LEVELS.indexOf(prev);
  fs.mkdirSync(ws, { recursive: true });
  fs.writeFileSync(rezimFile(ws), JSON.stringify({ ...cur, prisnost: level }, null, 2) + '\n', 'utf8');
  const auditDir = path.join(ws, 'AUDIT'); fs.mkdirSync(auditDir, { recursive: true });
  if (prev !== level) logChange(ws, prev, level);
  const debt = path.join(auditDir, 'DLUH.md');
  if (!fs.existsSync(debt)) fs.writeFileSync(debt, DEBT_HEADER, 'utf8');
  if (raised) {
    const nc = path.join(auditDir, 'NOVE_CILE.md');
    const head = fs.existsSync(nc) ? '' : '# Nové cíle auditu\n\n';
    const line = `- [ ] **DLUH-${LABELS[level]}** — Audit dluhu (AUDIT/DLUH.md) podle úrovně ${LABELS[level]} (přísnost zvýšena z ${LABELS[prev]}) — release gate 🔴 do uzavření.\n`;
    fs.appendFileSync(nc, head + line, 'utf8');
  }
  return { level, prev, raised };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2); const wi = a.indexOf('--ws');
  const ws = path.resolve(wi >= 0 ? a[wi + 1] : '.'); const rest = a.filter((_, i) => i !== wi && i !== wi + 1 || wi < 0);
  const [cmd, arg] = rest;
  try {
    if (cmd === 'stav') { const l = readLevel(ws); console.log(`Přísnost auditu: ${LABELS[l]} (${l})\n${RULES[l]}`); }
    else if (cmd === 'kontext') console.log(contextLine(readLevel(ws), ws));
    else if (cmd === 'nastav') {
      const r = setLevel(ws, String(arg || '').toLowerCase());
      console.log(`Přísnost auditu nastavena: ${LABELS[r.level]}.${r.raised ? ' Založen úkol „audit dluhu" v AUDIT/NOVE_CILE.md.' : ''}`);
    } else { console.error('Použití: node tools/prisnost.mjs [--ws <cesta>] stav | kontext | nastav <prototyp|osobni|bezny|kriticky>'); process.exit(1); }
  } catch (e) { console.error(e.message); process.exit(1); }
}
