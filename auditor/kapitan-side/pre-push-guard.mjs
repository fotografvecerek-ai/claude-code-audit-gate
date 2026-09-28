#!/usr/bin/env node
// PRE-PUSH-GUARD — A-023 AK3: druhá linie (po ochraně větve na GitHubu a kapitan-audit-guard.js) proti pushi na chráněnou
// větev bez zelené brány vydání. Git zavolá tenhle skript se stdin řádky "<local ref> <local sha> <remote ref> <remote sha>",
// jeden na každou tlačenou referenci (viz githooks(5) → pre-push). Volá STEJNÝ gate-check.mjs jako kapitan-audit-guard.js.
// Pozor: `git push --no-verify` a nízkoúrovňový `git send-pack` tenhle hook obejdou — je to DRUHÁ linie, ne jediná.
// Instaluje `tools/install-pre-commit-hook.mjs` (zobecněný instalátor, A-007 kolo 2) jako .git/hooks/pre-push wrapper
// (pre-push-guard.sh) + tento soubor do <repo>/.claude/hooks/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// stejný vzor jako PROD_BRANCH v kapitan-audit-guard.js — nastavitelné přes stejnou env proměnnou, ať se chování nerozjede
const PROD_BRANCH = new RegExp(process.env.PROD_BRANCHES || '^(main|master|production|prod|release)$', 'i');

function defaultBranch(repo) {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim().replace(/^origin\//, '');
  } catch { return ''; }
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function mustGate(input, repo) {
  const def = defaultBranch(repo);
  const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue; // řádek bez dost polí (neúplný vstup) — nevyhodnotitelný, přeskoč
    const branch = parts[2].replace(/^refs\/heads\//, '');
    if (PROD_BRANCH.test(branch) || (def && branch === def)) return true;
  }
  return false;
}

function resolveGateCheck() {
  const cands = [
    process.env.AUDITOR_WORKSPACE ? path.join(process.env.AUDITOR_WORKSPACE, 'kapitan-side', 'gate-check.mjs') : null,
    path.join(__dirname, 'gate-check.mjs'),
  ].filter(Boolean);
  return cands.find(p => fs.existsSync(p)) || path.join(__dirname, 'gate-check.mjs');
}

function main() {
  const repo = process.env.AUDITOR_TARGET_REPO || process.cwd();
  const input = readStdin();
  if (!mustGate(input, repo)) process.exit(0);

  const gc = resolveGateCheck();
  try {
    execFileSync(process.execPath, [gc, repo], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    process.exit(0);
  } catch (e) {
    const err = String(e.stderr || e.message || '');
    const line = (err.match(/GATE-CHECK FAIL:.*/) || [])[0]
      || `gate-check nelze spustit (${(err.match(/ENOENT[^\n]*|Cannot find module[^\n]*/) || ['chyba'])[0]}) — fail-closed`;
    console.error(`PRE-PUSH BLOKOVÁN — push na chráněnou větev vyžaduje zelenou bránu vydání auditora.\n${line}`);
    process.exit(1);
  }
}

main();
