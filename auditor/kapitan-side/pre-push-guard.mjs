#!/usr/bin/env node
// PRE-PUSH-GUARD — A-023 AK3 (kolo 2): druhá linie (po ochraně větve na GitHubu a kapitan-audit-guard.js) proti pushi
// na chráněnou větev bez zelené brány vydání PRO KONKRÉTNÍ TLAČENÝ COMMIT. Git zavolá tenhle skript se stdin řádky
// "<local ref> <local sha> <remote ref> <remote sha>", jeden na každou tlačenou referenci (viz githooks(5) → pre-push).
//
// Kolo 1 (3c22ea3) mělo dvě díry, které auditor našel skutečným `git push` (P19, P21):
//  P19 — brána se posuzovala pro HEAD repa, ne pro TLAČENÝ sha. `git push origin feat:main` tak prošel, když byl
//        gate zelený pro aktuální main, i když se do main tlačil úplně jiný (nezauditovaný) obsah z feat.
//        Oprava: pro každou chráněnou referenci uděláme dočasný `git worktree` PŘESNĚ na tlačeném local sha a přes
//        něj spustíme beze změny stávající gate-check.mjs (ten vždy kontroluje HEAD svého cwd — proto worktree,
//        ne úprava gate-check.mjs, ať zůstane jediná definice brány, DRY).
//  P21 — repo i workspace auditora (AUDITOR_TARGET_REPO/AUDITOR_WORKSPACE) se braly přímo z process.env, který si
//        libovolný volající shell (jiné okno, jiný uživatel spouštějící `git push`) může před pushem nastavit —
//        podvržená hodnota tak mohla ukázat na cizí/prázdný workspace bez červené brány, nebo dokonce na cizí
//        gate-check.mjs, a bránu úplně obejít. Oprava: repo bereme z process.cwd() (git ho sem vždy postaví sám —
//        na rozdíl od env to volající nemůže podvrhnout) a workspace jen z DŮVĚRYHODNÉ konfigurace instalace
//        (<repo>/.claude/settings.json → env.AUDITOR_WORKSPACE, zapsal ji jednou instalátor merge-repo-settings.mjs),
//        s pádem na stejnou výchozí konvenci sourozenecké složky jako gate-check.mjs. Proces.env.AUDITOR_WORKSPACE
//        se pro tohle rozhodnutí už nečte vůbec — a explicitně přepíšeme env i dítěti (gate-check.mjs), takže ani
//        podvržená hodnota předaná DÁL nemá šanci se prosadit.
//
// Smazání chráněné větve (`git push origin :main`, local sha = samé nuly) blokujeme rovnou, bez ohledu na bránu —
// pro smazání není co gatovat (žádný commit) a fail-open by tu byl nejhorší možný výsledek.
//
// Pozor: `git push --no-verify` a nízkoúrovňový `git send-pack` tenhle hook obejdou — je to DRUHÁ linie, ne jediná
// (první je ochrana větve na GitHubu, AK1; třetí kapitan-audit-guard.js, AK4).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// A-023 kolo 3 (X14/X15/X17): PROD_BRANCHES/GATE_MAX_AGE_H se dřív daly přebít přes process.env — libovolný
// shell, který spouští `git push`, si je nastaví předem (`PROD_BRANCHES=^zzz_x git push origin main`) a bránu
// tím pro TUHLE větev vypne. Jediný důvěryhodný zdroj je stejná COMMITNUTÁ konfigurace jako u AUDITOR_WORKSPACE
// (viz X26 níže) — env se pro tyhle dvě hodnoty už nikdy nečte. main/master navíc chráníme VŽDY, bez ohledu
// na to, co config říká (i kdyby byl commitnutý config sám podvržený/chybný).
const DEFAULT_PROD_BRANCH_SRC = '^(main|master|production|prod|release)$';
const ALWAYS_PROD = /^(main|master)$/i;
const ZERO_SHA = /^0{40}$|^0{64}$/; // "local sha" u smazání větve — git posílá samé nuly (SHA-1 i SHA-256 repo)

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

// hlavní pracovní strom (sdílené .git) — settings.json typicky žije jen tam, i když se pushuje z vedlejšího worktree
function mainWorktreeRoot(repo) {
  try {
    const gcd = git(['rev-parse', '--git-common-dir'], repo);
    return path.resolve(repo, gcd, '..');
  } catch { return null; }
}

// X26 (A-023 kolo 3): dřív se .claude/settings.json četlo přímo z pracovního stromu (fs.readFileSync) — necommitnutá
// nebo podvržená úprava (bez `git add`/`commit`) se tak vydávala za důvěryhodnou konfiguraci a mohla ukázat na
// FALEŠNÝ workspace bez červené brány. Jediný důvěryhodný obsah je to, co je SKUTEČNĚ COMMITNUTÉ na HEAD —
// `git show HEAD:<cesta>` čte obsah objektu z gitu, ne soubor z disku, takže necommitnutá modifikace ve working
// tree (i kdyby tam ležela) se do tohohle čtení vůbec nedostane. Nejjednodušší robustní řešení: žádná working
// tree cesta se pro důvěryhodnou konfiguraci nikdy neotevírá.
function readTrustedSettingsFrom(dir) {
  try {
    const raw = git(['show', 'HEAD:.claude/settings.json'], dir).replace(/^﻿/, '');
    return JSON.parse(raw);
  } catch { return null; }
}

// P21: workspace bereme jen z DŮVĚRYHODNÉ konfigurace instalace, nikdy z process.env (ten nastaví kdokoliv, kdo
// spouští `git push`). Zdroj: <repo nebo hlavní worktree>/.claude/settings.json → env.AUDITOR_WORKSPACE (zapsal
// merge-repo-settings.mjs při instalaci), jen COMMITNUTÝ obsah (X26). Bez ní stejná výchozí konvence jako
// gate-check.mjs (sourozenecká složka).
function resolveTrustedSettings(repo) {
  const direct = readTrustedSettingsFrom(repo);
  if (direct) return direct;
  const main = mainWorktreeRoot(repo);
  if (main && path.resolve(main) !== path.resolve(repo)) {
    const viaMain = readTrustedSettingsFrom(main);
    if (viaMain) return viaMain;
  }
  return null;
}
function trustedWorkspace(repo, settings) {
  const wsVal = settings && settings.env && typeof settings.env.AUDITOR_WORKSPACE === 'string' ? settings.env.AUDITOR_WORKSPACE : '';
  if (wsVal && fs.existsSync(wsVal)) return path.resolve(wsVal);
  return path.resolve(repo, '..', path.basename(repo) + '-audit');
}
// X14/X15/X17: PROD_BRANCHES jen z commitnuté konfigurace (stejný zdroj/důvěra jako workspace výš), env se
// nečte vůbec. Neplatný regex v configu = fail-safe na výchozí vzor (nikdy nespadne, nikdy neotevře díru).
function trustedProdBranchRegex(settings) {
  const custom = settings && settings.env && typeof settings.env.PROD_BRANCHES === 'string' ? settings.env.PROD_BRANCHES : '';
  if (custom) { try { return new RegExp(custom, 'i'); } catch { /* neplatný regex v configu — ignorovat, použít default */ } }
  return new RegExp(DEFAULT_PROD_BRANCH_SRC, 'i');
}

// i umístění SAMOTNÉHO gate-check.mjs bereme jen z důvěryhodného ws (ne z process.env) — jinak by šlo podvrženým
// AUDITOR_WORKSPACE nahradit celý skript bránou, která vždy vrátí PASS.
function resolveGateCheck(ws) {
  const cands = [ws ? path.join(ws, 'kapitan-side', 'gate-check.mjs') : null, path.join(__dirname, 'gate-check.mjs')].filter(Boolean);
  return cands.find(p => fs.existsSync(p)) || path.join(__dirname, 'gate-check.mjs');
}

// P19: gate-check.mjs beze změny kontroluje HEAD svého cwd — aby ověřil TLAČENÝ sha (ne aktuální HEAD repa),
// postavíme na něm dočasný detached worktree a spustíme gate-check přes něj; workspace předáme explicitně v env,
// ať se nepočítá (špatně) z umístění dočasného worktree.
function checkGateForSha(repo, ws, sha) {
  const gc = resolveGateCheck(ws);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-prepush-'));
  const wt = path.join(tmpRoot, 'wt');
  try {
    git(['worktree', 'add', '--detach', wt, sha], repo);
  } catch (e) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    throw new Error(`GATE-CHECK FAIL: nelze připravit kontrolu pro ${sha.slice(0, 12)} (git worktree add selhal) — fail-closed`);
  }
  try {
    execFileSync(process.execPath, [gc, wt], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, AUDITOR_WORKSPACE: ws, AUDITOR_TARGET_REPO: wt },
    });
  } finally {
    try { git(['worktree', 'remove', '--force', wt], repo); }
    catch { try { fs.rmSync(wt, { recursive: true, force: true }); git(['worktree', 'prune'], repo); } catch { /* nejde uklidit — dočasná složka, neblokuje push */ } }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function main() {
  const repo = process.cwd(); // P21: git sem hook vždy postaví s cwd = kořen pracovního stromu — na rozdíl od env to volající nepodvrhne
  const settings = resolveTrustedSettings(repo);
  const ws = trustedWorkspace(repo, settings);
  const PROD_BRANCH = trustedProdBranchRegex(settings);
  const def = defaultBranch(repo);
  const lines = readStdin().split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue; // neúplný řádek (git ho tak nikdy neposílá) — nevyhodnotitelný, přeskoč
    const [, localSha, remoteRefRaw, remoteSha] = parts;
    const branch = remoteRefRaw.replace(/^refs\/heads\//, '');
    // main/master jsou chráněné VŽDY (X14/X15/X17) — i kdyby PROD_BRANCH z configu (nebo jeho chybějící/podvržená verze) je vynechal.
    const protectedBranch = ALWAYS_PROD.test(branch) || PROD_BRANCH.test(branch) || (def && branch === def);
    if (!protectedBranch) continue;

    if (ZERO_SHA.test(localSha)) {
      console.error(`PRE-PUSH BLOKOVÁN — smazání chráněné větve "${branch}" (${remoteRefRaw} → ${remoteSha.slice(0, 12)}) je zakázané. Smaž ji ručně po ověření s vlastníkem.`);
      process.exit(1);
    }

    try {
      checkGateForSha(repo, ws, localSha);
    } catch (e) {
      const err = String(e.stderr || e.message || '');
      const gateLine = (err.match(/GATE-CHECK FAIL:.*/) || [])[0]
        || `gate-check nelze spustit pro ${localSha.slice(0, 12)} (${(err.match(/ENOENT[^\n]*|Cannot find module[^\n]*/) || ['chyba'])[0]}) — fail-closed`;
      console.error(`PRE-PUSH BLOKOVÁN — push do "${branch}" (tlačený commit ${localSha.slice(0, 12)}) vyžaduje zelenou bránu vydání auditora PRO TENTO COMMIT.\n${gateLine}`);
      process.exit(1);
    }
  }
  process.exit(0);
}

main();
