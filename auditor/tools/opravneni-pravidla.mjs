// OPRAVNENI-PRAVIDLA — jediná tabulka oprávnění Claude Code podle samostatnosti Kapitána (1 OPATRNÝ / 2 SAMOSTATNÝ / 3 PLNÝ)
// a jejich zápis do <repo>/.claude/settings.local.json. Používají ji:
//   opravneni.mjs  — zapíše pravidla úrovně, která PLATÍ podle integrity (schválená vlastníkem, prisnost.mjs kapitanLevel);
//   kapitan-role.mjs (SessionStart Kapitána) — A-029 kolo 5: nadbytečná oprávnění proti platné úrovni ODEBERE (záloha .bak-<čas>, varování, log).
// Spravujeme jen: permissions.allow (pravidla z ALLOW), permissions.defaultMode=bypassPermissions a značky _auditorOpravneni/_auditorDefaultMode.
// Ostatní klíče a cizí pravidla zůstávají beze změny. Soubory čteme i zapisujeme výslovně v UTF-8.
import fs from 'node:fs'; import path from 'node:path';

export const NAMES = { 1: 'OPATRNÝ', 2: 'SAMOSTATNÝ', 3: 'PLNÝ' };
export const ALLOW = [
  'Bash(node scripts/:*)', 'Bash(node ./scripts/:*)', 'Bash(node scripts\\:*)', 'Bash(python scripts/:*)', 'Bash(python -X utf8 scripts/:*)', 'Bash(python scripts\\:*)', 'Bash(py scripts/:*)',
  'Bash(powershell -NoProfile -ExecutionPolicy Bypass -File scripts/:*)', 'Bash(powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\:*)', 'Bash(powershell -File scripts/:*)', 'Bash(bash scripts/:*)',
  'Bash(psql:*)', 'Bash(supabase:*)', 'Bash(npx supabase:*)', 'Bash(npx prisma:*)', 'Bash(npm run:*)', 'Bash(pnpm run:*)',
  'mcp__supabase', 'mcp__Supabase'
];
const BYPASS = 'bypassPermissions';
const M_ALLOW = '_auditorOpravneni', M_MODE = '_auditorDefaultMode';   // značky našich pravidel, ať je umíme odebrat
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = x => Array.isArray(x) ? x : [];
const omit = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
// Co úroveň smí: allow z tabulky od 2, bypassPermissions jen 3.
const allowsRules = level => +level >= 2, allowsBypass = level => +level === 3;

export const settingsPath = repo => path.join(repo, '.claude', 'settings.local.json');
// { s, raw } — chybí = prázdné nastavení; neplatný JSON = výjimka (nikdy nepřepisujeme cizí obsah, který neumíme přečíst)
export function readSettings(sp) {
  let raw; try { raw = fs.readFileSync(sp, 'utf8'); } catch { return { s: {}, raw: null }; }
  let s; try { s = JSON.parse(raw.replace(/^﻿/, '')); } catch { throw new Error(`${sp} není platný JSON — oprav ho ručně, oprávnění do něj nezapíšu.`); }
  return { s: isObj(s) ? s : {}, raw };
}

// Nové nastavení pro úroveň (nemutuje vstup): odebere naše stará pravidla, přidá pravidla úrovně.
export function applyLevel(s0, level) {
  const perm = isObj(s0.permissions) ? s0.permissions : {};
  const ours = new Set(arr(s0[M_ALLOW]));
  const base = arr(perm.allow).filter(r => !ours.has(r));
  const keepMode = !(s0[M_MODE] && perm.defaultMode === BYPASS) && perm.defaultMode !== undefined;
  const add = allowsRules(level) ? ALLOW.filter(r => !base.includes(r)) : [];
  const setMode = allowsBypass(level) && perm.defaultMode !== BYPASS;
  const permissions = { ...omit(perm, 'allow', 'defaultMode'), allow: [...base, ...add], ...(setMode ? { defaultMode: BYPASS } : keepMode ? { defaultMode: perm.defaultMode } : {}) };
  return { ...omit(s0, 'permissions', M_ALLOW, M_MODE), permissions, ...(add.length ? { [M_ALLOW]: add } : {}), ...(setMode ? { [M_MODE]: true } : {}) };
}

// Nadbytek proti úrovni (nemutuje vstup): bypassPermissions pod úrovní 3, pravidla z ALLOW pod úrovní 2 — bez ohledu na značku
// (zápis mimo opravneni.mjs značku mít nemusí). Nic nepřidává. → { s, removed: [...] }
export function stripExcess(s0, level) {
  const perm = isObj(s0.permissions) ? s0.permissions : null; if (!perm) return { s: s0, removed: [] };
  const dropMode = !allowsBypass(level) && perm.defaultMode === BYPASS;
  const badRules = allowsRules(level) ? [] : arr(perm.allow).filter(r => ALLOW.includes(r));
  const removed = [...(dropMode ? [`defaultMode=${BYPASS}`] : []), ...badRules];
  if (!removed.length) return { s: s0, removed };
  const permissions = { ...omit(perm, ...(dropMode ? ['defaultMode'] : [])), ...(badRules.length ? { allow: perm.allow.filter(r => !ALLOW.includes(r)) } : {}) };
  const leftMarks = arr(s0[M_ALLOW]).filter(r => !badRules.includes(r));
  const s = { ...omit(s0, 'permissions', M_ALLOW, ...(dropMode ? [M_MODE] : [])), permissions, ...(leftMarks.length ? { [M_ALLOW]: leftMarks } : {}) };
  return { s, removed };
}

export const writeSettings = (sp, s) => { fs.mkdirSync(path.dirname(sp), { recursive: true }); fs.writeFileSync(sp, JSON.stringify(s, null, 2) + '\n', 'utf8'); };
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// SessionStart: srovná settings.local.json s platnou úrovní. Mění soubor JEN když je co odebrat (záloha <soubor>.bak-<čas>, řádek do
// <ws>/AUDIT/_zmeny-nastaveni.log). → { changed, removed?, bak?, chyba? }
export function syncSettings(ws, repo, level) {
  const sp = settingsPath(repo);
  let cur; try { cur = readSettings(sp); } catch (e) { return { changed: false, chyba: e.message }; }
  if (cur.raw === null) return { changed: false };
  const r = stripExcess(cur.s, level); if (!r.removed.length) return { changed: false };
  const bak = `${sp}.bak-${stamp()}`;
  fs.writeFileSync(bak, cur.raw, 'utf8');
  writeSettings(sp, r.s);
  try {
    fs.mkdirSync(path.join(ws, 'AUDIT'), { recursive: true });
    fs.appendFileSync(path.join(ws, 'AUDIT', '_zmeny-nastaveni.log'), `${new Date().toISOString()}  opravneni=srovnano  soubor=${sp}  plati=kapitan${level}  odebrano=${r.removed.join(' | ')}  zaloha=${path.basename(bak)}\n`, 'utf8');
  } catch { }
  return { changed: true, removed: r.removed, bak };
}
