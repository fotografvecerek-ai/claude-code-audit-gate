#!/usr/bin/env node
// INSTALL-PRE-COMMIT-HOOK — nainstaluje git hook do .git/hooks/<hookName> (A-007: prvoinstalace nesmí přepsat cizí hook bez zálohy).
// Zobecněno pro víc hooků (A-023 AK3: pre-push druhá linie) — jedna implementace, ať se logika neduplikuje.
// MARKER (A-007 kolo 2): jednoznačný ŘÁDEK "# auditor-managed-hook: <hookName>", ne podřetězec — cizí hook, který náhodou obsahuje
// text "pre-commit-check" (např. "npm run pre-commit-check"), se dřív přepsal BEZ ZÁLOHY. Za náš hook počítáme jen soubor, který
// má tenhle přesný řádek; zdrojové soubory (pre-commit-guard.sh, pre-push-guard.sh) ho proto musí obsahovat jako komentář.
// Existuje-li cíl a marker NEMÁ (= není to náš hook, nebo je to naše starší instalace před zavedením markeru), zazálohuje se
// do <hookName>.bak-<čas> a hláška se vypíše. Marker MÁ (naše dřívější verze) → přepíše se beze zálohy.
// Volají setup-auditor.ps1 i setup-auditor.sh (jediná implementace) pro pre-commit i pre-push.
// node tools/install-pre-commit-hook.mjs <repo> <zdrojový soubor hooku> [hookName=pre-commit]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const markerRe = hookName => new RegExp(`^#\\s*auditor-managed-hook:\\s*${hookName}\\s*$`, 'm');

export function installGitHook(repo, src, hookName = 'pre-commit') {
  const dir = path.join(repo, '.git', 'hooks');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, hookName);
  let zaloha = null;
  if (fs.existsSync(target) && !markerRe(hookName).test(fs.readFileSync(target, 'utf8'))) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // yyyyMMddHHmmss
    zaloha = `${target}.bak-${stamp}`;
    fs.copyFileSync(target, zaloha);
  }
  fs.copyFileSync(src, target);
  try { fs.chmodSync(target, 0o755); } catch { }
  return zaloha;
}

// zpětná kompatibilita jménem (nic jiného už na tuhle konkrétní signaturu nespoléhá, ale ponecháno kvůli srozumitelnosti volání)
export const installPreCommitHook = (repo, src) => installGitHook(repo, src, 'pre-commit');

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , repo, src, hookName] = process.argv;
  if (!repo || !src) { console.error('použití: node install-pre-commit-hook.mjs <repo> <zdrojový hook> [hookName=pre-commit]'); process.exit(1); }
  const zaloha = installGitHook(path.resolve(repo), path.resolve(src), hookName || 'pre-commit');
  if (zaloha) console.log(`Tvuj puvodni ${hookName || 'pre-commit'} hook je zalohovan do ${zaloha}`);
}
