#!/usr/bin/env node
// INSTALL-PRE-COMMIT-HOOK — nainstaluje .git/hooks/pre-commit (A-007: prvoinstalace nesmí přepsat cizí hook bez zálohy).
// Existuje-li cíl a NEobsahuje marker "pre-commit-check" (= není to náš hook), zazálohuje se do pre-commit.bak-<čas> a hláška se vypíše.
// Obsahuje-li marker (naše dřívější verze), přepíše se bez zálohy. Volají setup-auditor.ps1 i setup-auditor.sh (jediná implementace).
// node tools/install-pre-commit-hook.mjs <repo> <zdrojový pre-commit-guard.sh>
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const MARKER = /pre-commit-check/;

export function installPreCommitHook(repo, src) {
  const dir = path.join(repo, '.git', 'hooks');
  fs.mkdirSync(dir, { recursive: true });
  const pc = path.join(dir, 'pre-commit');
  let zaloha = null;
  if (fs.existsSync(pc) && !MARKER.test(fs.readFileSync(pc, 'utf8'))) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // yyyyMMddHHmmss
    zaloha = `${pc}.bak-${stamp}`;
    fs.copyFileSync(pc, zaloha);
  }
  fs.copyFileSync(src, pc);
  try { fs.chmodSync(pc, 0o755); } catch { }
  return zaloha;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , repo, src] = process.argv;
  if (!repo || !src) { console.error('použití: node install-pre-commit-hook.mjs <repo> <pre-commit-guard.sh>'); process.exit(1); }
  const zaloha = installPreCommitHook(path.resolve(repo), path.resolve(src));
  if (zaloha) console.log(`Tvuj puvodni pre-commit hook je zalohovan do ${zaloha}`);
}
