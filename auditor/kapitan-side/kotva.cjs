'use strict';
// KOTVA DŮVĚRY (A-026) — odkud pojistky Kapitána (kapitan-audit-guard.js, pre-push-guard.mjs, gate-check.mjs) berou
// cestu k workspace auditora, otisk jeho gate-check.mjs a nastavení brány (PROD_BRANCHES, GATE_MAX_AGE_H).
// Dřív to byl `git show HEAD:.claude/settings.json` — ten ale Kapitán změní commitem (i plumbingem mimo pracovní strom).
// Kotva leží v GIT COMMON DIR repa (`.git/auditor-kotva.json`): není v HEAD, v indexu ani v pracovním stromu, nejde ji
// commitnout, sdílí ji všechny worktree téhož repa a každé repo má vlastní. Nezávisí na env (HOME, AUDITOR_WORKSPACE).
// Zapisuje ji jen vlastník (instalace, aktualizace nebo START → [9] v jeho terminálu); pojistka Kapitána zápis blokuje.
// Kotva chybí / je poškozená / workspace neexistuje nebo patří jinému repu / otisk nesedí → vydání zablokované (fail-closed).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ANCHOR_FILE = 'auditor-kotva.json';
const ANCHOR_VERSION = 1;
const HASHED_FILES = ['gate-check.mjs', 'kotva.cjs'];
const DEFAULT_PROD_SRC = '^(main|master|production|prod|release)$';
const ALWAYS_PROD = /^(main|master)$/i;
const DEFAULT_MAX_AGE_H = 72;
const FIX_HINT = 'spusť START → [9] v terminálu vlastníka (Windows: START.cmd dvojklikem)';
const IS_WIN = process.platform === 'win32';
const CASE_INSENSITIVE = IS_WIN || process.platform === 'darwin';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Git Bash styl „/c/Users/x" → „C:\Users\x" (jen Windows); jinak beze změny.
function toNative(p) {
  const s = String(p || '').trim();
  if (!IS_WIN) return s;
  const m = /^\/([A-Za-z])(\/.*)?$/.exec(s);
  return m ? `${m[1].toUpperCase()}:${(m[2] || '/').replace(/\//g, '\\')}` : s;
}

// Kanonická podoba cesty pro POROVNÁNÍ: realpath (8.3 názvy, junction, symlink, macOS /private/var), dopředná lomítka,
// bez koncového lomítka; na Windows a macOS bez ohledu na velikost písmen. Neexistující cesta = jen normalizace.
function canon(p) {
  if (!p) return '';
  let s = path.resolve(toNative(p));
  try { s = fs.realpathSync.native(s); } catch { /* neexistuje — porovnává se normalizovaná podoba */ }
  s = s.replace(/\\/g, '/').replace(/\/+$/, '');
  return CASE_INSENSITIVE ? s.toLowerCase() : s;
}

function realOrResolved(p) {
  const s = path.resolve(toNative(p));
  try { return fs.realpathSync.native(s); } catch { return s; }
}

function gitCommonDir(dir) {
  try { return realOrResolved(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir)); } catch { /* git < 2.31 */ }
  try { return realOrResolved(path.resolve(dir, git(['rev-parse', '--git-common-dir'], dir))); } catch { return ''; }
}

// Kořen HLAVNÍHO pracovního stromu (i z vedlejšího worktree nebo dočasného worktree pre-push kontroly).
function repoRoot(dir) {
  const cd = gitCommonDir(dir);
  if (!cd) return '';
  if (path.basename(cd).toLowerCase() === '.git') return path.dirname(cd);
  try { return realOrResolved(git(['rev-parse', '--show-toplevel'], dir)); } catch { return ''; }
}

function anchorPath(dir) {
  const cd = gitCommonDir(dir);
  return cd ? path.join(cd, ANCHOR_FILE) : '';
}

function sha256File(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return ''; }
}

function wsHashes(ws) {
  const out = {};
  for (const f of HASHED_FILES) out[f] = sha256File(path.join(toNative(ws), 'kapitan-side', f));
  return out;
}

// Repo, ke kterému workspace auditora patří (zapisuje instalátor do <ws>/.claude/settings.json → env.AUDITOR_TARGET_REPO).
function wsTargetRepo(ws) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(toNative(ws), '.claude', 'settings.json'), 'utf8').replace(/^\uFEFF/, ''));
    return j && j.env && typeof j.env.AUDITOR_TARGET_REPO === 'string' ? j.env.AUDITOR_TARGET_REPO : '';
  } catch { return ''; }
}

function readConfigFromRepoSettings(repo) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'settings.json'), 'utf8').replace(/^\uFEFF/, ''));
    const env = (j && j.env) || {};
    const out = {};
    if (typeof env.PROD_BRANCHES === 'string' && env.PROD_BRANCHES) out.prodBranches = env.PROD_BRANCHES;
    if (Number.isFinite(+env.GATE_MAX_AGE_H) && +env.GATE_MAX_AGE_H > 0) out.gateMaxAgeH = +env.GATE_MAX_AGE_H;
    return out;
  } catch { return {}; }
}

const isHex64 = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

function validShape(a) {
  return !!a && typeof a === 'object' && a.verze === ANCHOR_VERSION && typeof a.repo === 'string' && a.repo
    && typeof a.workspace === 'string' && a.workspace && a.hashe && typeof a.hashe === 'object'
    && HASHED_FILES.every(f => isHex64(a.hashe[f]));
}

function prodRegex(anchor) {
  const src = anchor && typeof anchor.prodBranches === 'string' ? anchor.prodBranches : '';
  if (src) { try { return new RegExp(src, 'i'); } catch { /* neplatný regex — výchozí */ } }
  return new RegExp(DEFAULT_PROD_SRC, 'i');
}

function maxAgeOf(anchor) {
  const v = anchor ? +anchor.gateMaxAgeH : NaN;
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_AGE_H;
}

const fail = (stav, msg, extra = {}) => ({ ok: false, stav, msg: `${msg} — ${FIX_HINT}`, ...extra });

// Ověří kotvu repa, ve kterém leží `dir`. Výsledek { ok:true, ws, prodRe, maxAgeH, anchor, file } nebo { ok:false, stav, msg }.
function verifyAnchor(dir) {
  const file = anchorPath(dir);
  if (!file) return fail('neni-git', `kotvu nelze najít — ${dir} není git repo`);
  if (!fs.existsSync(file)) return fail('chybi', `chybí kotva důvěry (${file})`, { file });
  let anchor;
  try { anchor = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return fail('poskozena', `kotva důvěry je poškozená (${file})`, { file }); }
  if (!validShape(anchor)) return fail('poskozena', `kotva důvěry má neplatný obsah (${file})`, { file });
  const root = repoRoot(dir);
  if (!root || canon(anchor.repo) !== canon(root)) return fail('jine-repo', `kotva patří jinému repu (${anchor.repo})`, { file, anchor });
  const ws = realOrResolved(anchor.workspace);
  if (!fs.existsSync(path.join(ws, 'AUDIT')) || !fs.existsSync(path.join(ws, 'kapitan-side', 'gate-check.mjs'))) {
    return fail('ws-chybi', `workspace auditora z kotvy neexistuje nebo je neúplný (${anchor.workspace})`, { file, anchor });
  }
  const target = wsTargetRepo(ws);
  if (!target || canon(target) !== canon(root)) return fail('ws-cizi', `workspace z kotvy (${anchor.workspace}) patří jinému repu (${target || 'neuvedeno'})`, { file, anchor });
  const now = wsHashes(ws);
  const bad = HASHED_FILES.filter(f => now[f] !== anchor.hashe[f]);
  if (bad.length) return fail('hash', `otisk ${bad.join(', ')} ve workspace auditora nesedí s kotvou (změněno po schválení vlastníkem)`, { file, anchor });
  return { ok: true, ws, prodRe: prodRegex(anchor), maxAgeH: maxAgeOf(anchor), anchor, file };
}

function buildAnchor(repo, ws, config = {}) {
  const a = { verze: ANCHOR_VERSION, repo: realOrResolved(repoRoot(repo) || repo), workspace: realOrResolved(ws), hashe: wsHashes(ws), zalozeno: new Date().toISOString() };
  if (config.prodBranches) a.prodBranches = config.prodBranches;
  if (config.gateMaxAgeH) a.gateMaxAgeH = config.gateMaxAgeH;
  return a;
}

// Zápis kotvy (jen z nástrojů vlastníka: instalace, aktualizace, START → [9]). Atomicky: dočasný soubor + přejmenování.
function writeAnchor(repo, ws, config = {}) {
  const file = anchorPath(repo);
  if (!file) throw new Error(`${repo} není git repo`);
  const a = buildAnchor(repo, ws, config);
  if (!HASHED_FILES.every(f => isHex64(a.hashe[f]))) throw new Error(`ve workspace ${ws} chybí kapitan-side/${HASHED_FILES.join(' nebo ')}`);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(a, null, 2) + '\n', { encoding: 'utf8' });
  fs.renameSync(tmp, file);
  return a;
}

module.exports = {
  ANCHOR_FILE, ALWAYS_PROD, DEFAULT_PROD_SRC, DEFAULT_MAX_AGE_H, FIX_HINT, HASHED_FILES,
  canon, toNative, gitCommonDir, repoRoot, anchorPath, sha256File, wsHashes, wsTargetRepo,
  readConfigFromRepoSettings, verifyAnchor, buildAnchor, writeAnchor, prodRegex, maxAgeOf,
};
