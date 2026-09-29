#!/usr/bin/env node
// PRE-PUSH-GUARD — A-023 AK3 (kolo 2): druhá linie (po ochraně větve na GitHubu a kapitan-audit-guard.js) proti pushi
// na chráněnou větev bez zelené brány vydání PRO KONKRÉTNÍ TLAČENÝ COMMIT. Git zavolá tenhle skript se stdin řádky
// "<local ref> <local sha> <remote ref> <remote sha>", jeden na každou tlačenou referenci (viz githooks(5) → pre-push).
//
//  P19 — brána se posuzuje pro TLAČENÝ sha, ne pro HEAD repa: pro každou chráněnou referenci dočasný `git worktree`
//        přesně na tlačeném sha a přes něj stávající gate-check.mjs (jediná definice brány, DRY).
//  P21 — repo bereme z process.cwd() (git hook sem vždy postaví sám), nikdy z env.
//  A-026 (1.8.9) — workspace auditora, otisk jeho gate-check.mjs i PROD_BRANCHES jen z KOTVY DŮVĚRY
//        (`<git common dir>/auditor-kotva.json`, viz kotva.cjs). Dřívější zdroj `git show HEAD:.claude/settings.json`
//        (X26) šel změnit commitem, i plumbingem mimo pracovní strom → falešný workspace s bránou, která vždy projde
//        (X28/X28b/X29). Kotva není v HEAD ani v pracovním stromu; env se nečte vůbec. Kotva chybí / je poškozená /
//        ws neexistuje nebo patří jinému repu / otisk nesedí → push na chráněnou větev ODMÍTNUT (fail-closed).
//
// Smazání chráněné větve (local sha = samé nuly) blokujeme rovnou — není co gatovat.
// Pozor: `git push --no-verify`, `core.hooksPath` a `git send-pack` tenhle hook obejdou — je to DRUHÁ linie, ne jediná.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ZERO_SHA = /^0{40}$|^0{64}$/; // "local sha" u smazání větve — git posílá samé nuly (SHA-1 i SHA-256 repo)
const ALWAYS_PROD = /^(main|master)$/i; // main/master chráněné VŽDY, i bez kotvy
const DEFAULT_PROD = /^(main|master|production|prod|release)$/i;
const NO_MODULE = 'vedle pre-push-guard.mjs chybí kotva.cjs — spusť aktualizaci (START → [2]) a pak START → [9]';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function defaultBranch(repo) {
  try { return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repo).replace(/^origin\//, ''); }
  catch { return ''; }
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function loadKotva() {
  try { return createRequire(import.meta.url)('./kotva.cjs'); } catch { return null; }
}

// Dítěti (gate-check) nepředáme nic, co by šlo podvrhnout — gate-check env nečte, tohle je jen druhá pojistka.
function cleanEnv() {
  const e = { ...process.env };
  for (const k of ['AUDITOR_WORKSPACE', 'AUDITOR_TARGET_REPO', 'GATE_MAX_AGE_H', 'PROD_BRANCHES']) delete e[k];
  return e;
}

// P19: dočasný detached worktree na tlačeném sha; sdílí git common dir → gate-check v něm najde stejnou kotvu.
function checkGateForSha(repo, gc, sha) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-prepush-'));
  const wt = path.join(tmpRoot, 'wt');
  try {
    git(['worktree', 'add', '--detach', wt, sha], repo);
  } catch {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    throw new Error(`GATE-CHECK FAIL: nelze připravit kontrolu pro ${sha.slice(0, 12)} (git worktree add selhal) — fail-closed`);
  }
  try {
    execFileSync(process.execPath, [gc, wt], { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv() });
  } finally {
    try { git(['worktree', 'remove', '--force', wt], repo); }
    catch { try { fs.rmSync(wt, { recursive: true, force: true }); git(['worktree', 'prune'], repo); } catch { /* dočasná složka, neblokuje */ } }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function gateFailLine(e, sha) {
  const err = String(e.stderr || e.message || '');
  return (err.match(/GATE-CHECK FAIL:.*/) || [])[0]
    || `gate-check nelze spustit pro ${sha.slice(0, 12)} (${(err.match(/ENOENT[^\n]*|Cannot find module[^\n]*/) || ['chyba'])[0]}) — fail-closed`;
}

function main() {
  const repo = process.cwd();
  const K = loadKotva();
  const kotva = K ? K.verifyAnchor(repo) : { ok: false, msg: NO_MODULE };
  const prodRe = kotva.ok ? kotva.prodRe : DEFAULT_PROD;
  const def = defaultBranch(repo);
  const lines = readStdin().split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue; // neúplný řádek (git ho tak nikdy neposílá)
    const [, localSha, remoteRefRaw, remoteSha] = parts;
    const branch = remoteRefRaw.replace(/^refs\/heads\//, '');
    const isProtected = ALWAYS_PROD.test(branch) || prodRe.test(branch) || (def && branch === def);
    if (!isProtected) continue;

    if (ZERO_SHA.test(localSha)) {
      console.error(`PRE-PUSH BLOKOVÁN — smazání chráněné větve "${branch}" (${remoteRefRaw} → ${remoteSha.slice(0, 12)}) je zakázané. Smaž ji ručně po ověření s vlastníkem.`);
      process.exit(1);
    }
    if (!kotva.ok) {
      console.error(`PRE-PUSH BLOKOVÁN — push do "${branch}": ${kotva.msg}`);
      process.exit(1);
    }
    try {
      checkGateForSha(repo, path.join(kotva.ws, 'kapitan-side', 'gate-check.mjs'), localSha);
    } catch (e) {
      console.error(`PRE-PUSH BLOKOVÁN — push do "${branch}" (tlačený commit ${localSha.slice(0, 12)}) vyžaduje zelenou bránu vydání auditora PRO TENTO COMMIT.\n${gateFailLine(e, localSha)}`);
      process.exit(1);
    }
  }
  process.exit(0);
}

main();
