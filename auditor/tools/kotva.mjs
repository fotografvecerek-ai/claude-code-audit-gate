#!/usr/bin/env node
// KOTVA DŮVĚRY (A-026) — nástroj vlastníka. Kotva = `<git common dir repa>/auditor-kotva.json` (viz kapitan-side/kotva.cjs):
// odkud pojistky Kapitána berou workspace auditora a otisk jeho gate-check.mjs. Mění ji JEN vlastník v terminálu
// (instalace, aktualizace, START → [9]); z agenta (CLAUDECODE), v samotestu (AUDITOR_BEZ_TTY) ani bez konzole to nejde.
//   node tools/kotva.mjs stav   [--repo <repo>]
//   node tools/kotva.mjs nastav --repo <repo> [--ws <workspace>] [--instalace]
// --ws chybí = tento workspace (rodič složky tools/). --instalace = volá instalátor/aktualizace: se stdin TTY bez další otázky.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
import { blocked, ttyConfirm } from './prisnost.mjs';

const WS_SELF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = createRequire(import.meta.url)(path.join(WS_SELF, 'kapitan-side', 'kotva.cjs'));

// Ověří, že workspace je auditor tohoto repa (AUDIT/, kapitan-side/gate-check.mjs, AUDITOR_TARGET_REPO == repo). '' = v pořádku.
export function wsProblem(repo, ws) {
  if (!fs.existsSync(path.join(ws, 'AUDIT'))) return `${ws} není workspace auditora (chybí AUDIT/)`;
  for (const f of K.HASHED_FILES) if (!fs.existsSync(path.join(ws, 'kapitan-side', f))) return `ve workspace chybí kapitan-side/${f} — spusť aktualizaci (START → [2])`;
  const target = K.wsTargetRepo(ws), root = K.repoRoot(repo);
  if (!root) return `${repo} není git repo`;
  if (!target || K.canon(target) !== K.canon(root)) return `workspace ${ws} patří jinému repu (${target || 'neuvedeno'})`;
  return '';
}

// Konfigurace brány: z dosavadní kotvy, jinak jednorázově z .claude/settings.json repa (migrace z 1.8.8). Commit ji už nezmění.
function configFor(repo) {
  const cur = K.verifyAnchor(repo);
  const old = cur.anchor || (() => { try { return JSON.parse(fs.readFileSync(K.anchorPath(repo), 'utf8')); } catch { return null; } })();
  if (old && (old.prodBranches || old.gateMaxAgeH)) return { prodBranches: old.prodBranches, gateMaxAgeH: old.gateMaxAgeH };
  return K.readConfigFromRepoSettings(K.repoRoot(repo) || repo);
}

// Zapíše kotvu, když ji vlastník v terminálu potvrdí. Vrací { ok, zmena, duvod }.
export function ensureAnchor(repo, ws, { instalace = false } = {}) {
  const wsAbs = path.resolve(K.toNative(ws));
  const bad = wsProblem(repo, wsAbs); if (bad) return { ok: false, duvod: bad };
  const cur = K.verifyAnchor(repo);
  if (cur.ok && K.canon(cur.ws) === K.canon(wsAbs)) return { ok: true, zmena: false };
  const bl = blocked(); if (bl) return { ok: false, duvod: `${bl} — kotvu mění jen vlastník: ${K.FIX_HINT}` };
  if (!(instalace && process.stdin.isTTY)) {
    const why = cur.ok ? `změnit workspace auditora z ${cur.ws} na ${wsAbs}` : cur.stav === 'hash' ? `schválit novou verzi gate-check.mjs ve ${wsAbs}` : `založit kotvu důvěry: repo ${K.repoRoot(repo)} → auditor ${wsAbs}`;
    const c = ttyConfirm(`Kotva důvěry: ${why}? Potvrď jen, když jsi to právě spustil ty (START).`);
    if (!c.ok) return { ok: false, duvod: c.duvod };
  }
  try { K.writeAnchor(repo, wsAbs, configFor(repo)); } catch (e) { return { ok: false, duvod: e.message }; }
  const v = K.verifyAnchor(repo);
  return v.ok ? { ok: true, zmena: true } : { ok: false, duvod: v.msg };
}

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] || '' : ''; }

function main() {
  const cmd = process.argv[2] || 'stav';
  const repo = path.resolve(K.toNative(arg('--repo') || '.'));
  if (cmd === 'stav') {
    const v = K.verifyAnchor(repo);
    if (v.ok) { console.log(`✓ kotva důvěry v pořádku: ${v.file} → ${v.ws}`); return 0; }
    console.error(`✗ ${v.msg}`); return 1;
  }
  if (cmd === 'nastav') {
    const r = ensureAnchor(repo, arg('--ws') || WS_SELF, { instalace: process.argv.includes('--instalace') });
    if (r.ok) { console.log(r.zmena ? '✓ kotva důvěry zapsána' : '✓ kotva důvěry v pořádku (beze změny)'); return 0; }
    console.error(`✗ kotva nezapsána: ${r.duvod}`); return 1;
  }
  console.error('použití: kotva.mjs stav [--repo R] | nastav --repo R [--ws W] [--instalace]'); return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
