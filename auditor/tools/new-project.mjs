#!/usr/bin/env node
// NEW-PROJECT — založí NOVÝ projekt „zdravě od začátku": pravidla a pojistky auditora zabudované přímo v projektu, bez samostatného auditora.
// Co vznikne: CLAUDE.md s pravidly, subagent kontrolor (nezávislá kontrola, píše jen do docs/kontrola/), příkazy /zacatek /zadani /hotovo
// /kontrola /vydani /uklid, pojistky (PreToolUse guard, pre-commit, release-check, CI), dokumenty zadání/stav/provoz/rozhodnutí, git repo,
// volitelně soukromé repo na GitHubu (záloha), zástupce na ploše a spuštění agenta s /zacatek.
// node tools/new-project.mjs [název nebo cesta] [--base <složka>] [--model <id>] [--yes] [--github] [--no-github] [--auditor|--bez-auditora] [--no-launch] [--no-shortcut] [--no-trust]
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import readline from 'node:readline';
import { execFileSync, spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const ST = path.join(pkg, 'starter');
const argv = process.argv.slice(2); const flag = f => argv.includes(f); const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !['--base', '--model'].includes(argv[i - 1]));
const YES = flag('--yes'); const isWin = process.platform === 'win32'; const isMac = process.platform === 'darwin';
const model = opt('--model') || 'claude-fable-5-1';
const has = c => { try { execFileSync(isWin ? 'where' : 'which', [c], { stdio: 'ignore' }); return true; } catch { return false; } };
const run = (cmd, args, cwd, quiet = true) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
const tryRun = (...a) => { try { return run(...a); } catch { return null; } };
const tryRunI = (cmd, args, env = {}) => { try { execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } }); return true; } catch { return false; } };
const rl = YES || !process.stdin.isTTY ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(r => { if (!rl) return r(def); rl.question(q, a => r(a.trim() || def)); });
const say = (s = '') => console.log(s);

say('\n== Nový projekt — zdravě nastavený od začátku');
say('   Pravidla a pojistky auditora budou přímo v projektu; samostatného auditora můžeš přidat vedle (volba níže).\n');
if (!has('git')) { say('CHYBÍ Git — nainstaluj ho (Windows: winget install Git.Git, mac: xcode-select --install) a spusť znovu.'); process.exit(1); }
if (!has('claude')) say('Pozn.: Claude Code není nainstalovaný (npm i -g @anthropic-ai/claude-code) — projekt založím, agent se ale nespustí.');

// 1) název a umístění — rozhoduje instalátor, uživatel jen pojmenuje
const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'moje-aplikace';
let given = pos[0] || await ask('Jak se bude projekt jmenovat? (napiš pár slov, Enter = moje-aplikace): ', 'moje-aplikace');
const looksPath = /[\\/]/.test(given);
const niceName = looksPath ? path.basename(given) : given; const slug = slugify(niceName);
const defBase = opt('--base') || (isWin ? (fs.existsSync('C:\\') ? 'C:\\dev' : path.join(os.homedir(), 'dev')) : path.join(os.homedir(), 'dev'));
let dir = looksPath ? path.resolve(given) : path.join(defBase, slug);
const nonEmpty = d => fs.existsSync(d) && fs.readdirSync(d).length > 0;
if (nonEmpty(dir)) { let i = 2; while (nonEmpty(`${dir}-${i}`)) i++; say(`Složka ${dir} už existuje a není prázdná — nový projekt založím vedle: ${dir}-${i}`); say('   (Pro existující projekt použij v menu „Auditovat projekt na tomto počítači".)'); dir = `${dir}-${i}`; }
if (/onedrive|dropbox|google drive|icloud/i.test(dir)) say('Pozn.: složka je v synchronizovaném úložišti — doporučuji raději C:\\dev nebo ~/dev (synchronizace tisíců malých souborů zpomaluje práci). Pokračuji.');
fs.mkdirSync(dir, { recursive: true });
say(`Projekt: ${niceName}\nSložka:  ${dir}\n`);
const modeAns = flag('--auditor') ? '1' : flag('--bez-auditora') ? '2' : await ask('Jak má být projekt hlídaný?\n  [1] Zdravý start + samostatný auditor vedle projektu (kombinace, doporučeno)\n      kontrolor v projektu průběžně, auditor před větším vydáním nebo jednou za měsíc\n  [2] Jen zdravý start (kontrolor v projektu; auditora můžeš připojit kdykoliv později)\n  → Enter = 1: ', '1');
const withAud = modeAns !== '2'; const ws = `${dir}-audit`;
say(withAud ? `Režim: kombinace — auditor bude v ${ws}\n` : 'Režim: jen zdravý start\n');

// 2) šablona
const localIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16); const today = localIso().slice(0, 10);
const sub = s => s.replace(/\{\{NAZEV\}\}/g, niceName).replace(/\{\{SLUG\}\}/g, slug).replace(/\{\{DATUM\}\}/g, today).replace(/\{\{MODEL\}\}/g, model);
const MAP = { 'claude': '.claude', 'github': '.github', 'gitignore': '.gitignore', 'gitattributes': '.gitattributes', 'env.example': '.env.example', 'CLAUDE.md.tpl': 'CLAUDE.md', 'README.md.tpl': 'README.md' };
const copyTree = (src, dst) => { for (const e of fs.readdirSync(src, { withFileTypes: true })) { const s = path.join(src, e.name), d = path.join(dst, e.name); if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyTree(s, d); } else if (!fs.existsSync(d)) fs.writeFileSync(d, sub(fs.readFileSync(s, 'utf8'))); } }; // šablona je jen text
for (const e of fs.readdirSync(ST, { withFileTypes: true })) {
  const target = path.join(dir, MAP[e.name] || e.name);
  if (e.isDirectory()) { fs.mkdirSync(target, { recursive: true }); copyTree(path.join(ST, e.name), target); }
  else if (!fs.existsSync(target)) fs.writeFileSync(target, sub(fs.readFileSync(path.join(ST, e.name), 'utf8')));
}
// sdílené pojistky a checklisty z balíku auditora (jediný zdroj — stejná pravidla jako u auditora)
const H = path.join(dir, '.claude', 'hooks'); const HY = path.join(pkg, 'kapitan-side', 'hygiene');
for (const [f, t] of [['hygiene-rules.js'], ['hygiene-rules.json'], ['pre-commit-check.mjs'], ['pre-commit-guard.sh'], ['hooks-package.json', 'package.json']]) fs.copyFileSync(path.join(HY, f), path.join(H, t || f));
const CK = path.join(dir, '.claude', 'kontrola', 'checklists'); fs.mkdirSync(CK, { recursive: true });
for (const f of fs.readdirSync(path.join(pkg, 'checklists')).filter(f => f.endsWith('.md') && f !== 'ZDROJE.md')) fs.copyFileSync(path.join(pkg, 'checklists', f), path.join(CK, f));
const TL = path.join(dir, '.claude', 'tools'); fs.mkdirSync(TL, { recursive: true }); fs.copyFileSync(path.join(pkg, 'tools', 'owner-report.mjs'), path.join(TL, 'owner-report.mjs'));
fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
const firstMsg = '/zacatek';
fs.writeFileSync(path.join(dir, 'scripts', 'start.cmd'), ['@echo off', 'chcp 65001 >nul', `title ${slug} - agent projektu`, 'cd /d "%~dp0.."',
  'if exist ".tmp\\prvni-start" (', '  del ".tmp\\prvni-start"', `  claude "${firstMsg}"`, ') else (', '  claude -c || claude', ')', ''].join('\r\n'));
fs.writeFileSync(path.join(dir, 'scripts', 'start.sh'), ['#!/usr/bin/env bash', 'cd "$(dirname "$0")/.." || exit 1', `if [ -f .tmp/prvni-start ]; then rm -f .tmp/prvni-start; exec claude "${firstMsg}"; fi`, 'claude -c || claude', ''].join('\n'));
try { fs.chmodSync(path.join(dir, 'scripts', 'start.sh'), 0o755); } catch { }
fs.mkdirSync(path.join(dir, '.tmp'), { recursive: true }); fs.writeFileSync(path.join(dir, '.tmp', 'prvni-start'), today);
if (withAud) {
  fs.writeFileSync(path.join(H, 'auditor.json'), JSON.stringify({ workspace: ws, _: 'Samostatný auditor (kombinace). Čtou release-check, session-start a projekt-guard. Mění jen vlastník.' }, null, 2) + '\n');
  const sp = path.join(dir, '.claude', 'settings.json'); const st = JSON.parse(fs.readFileSync(sp, 'utf8'));
  st.permissions.additionalDirectories = [ws.replace(/\\/g, '/')]; fs.writeFileSync(sp, JSON.stringify(st, null, 2) + '\n');
  fs.appendFileSync(path.join(dir, 'CLAUDE.md'), `\n## 11. Samostatný auditor (kombinace)\nVedle projektu je samostatný Auditor (\`${ws.replace(/\\/g, '/')}\`), spouští ho vlastník před větším vydáním nebo jednou za měsíc. Do jeho složky\nnezapisuješ, jen čteš. \`AUDIT/02_HANDOFF.md\` je zadání s nejvyšší prioritou: otevřené P0/P1 = STOP-THE-LINE, oprav je v pořadí (test červený → oprava →\nkontrolor). Když je \`AUDIT/05_release_gate.md\` 🔴, vydání je zablokované (release-check), dokud auditor opravy neověří — hotovou dávku\noznam vlastníkovi jednou větou: „Napiš auditorovi: zkontroluj opravy."\n`);
}
say('✔ pravidla, kontrolor, příkazy, pojistky a dokumenty připravené');

// 3) git: repo, pre-commit, první commit a výchozí verdikt (kostra bez kódu)
if (!fs.existsSync(path.join(dir, '.git'))) { tryRun('git', ['init', '-q', '-b', 'main'], dir) ?? run('git', ['init', '-q'], dir); tryRun('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], dir); }
if (!tryRun('git', ['config', 'user.email'], dir)?.trim()) { run('git', ['config', 'user.email', 'owner@local'], dir); run('git', ['config', 'user.name', 'vlastnik'], dir); }
const hookDir = path.join(dir, '.git', 'hooks'); fs.mkdirSync(hookDir, { recursive: true });
fs.copyFileSync(path.join(H, 'pre-commit-guard.sh'), path.join(hookDir, 'pre-commit')); try { fs.chmodSync(path.join(hookDir, 'pre-commit'), 0o755); } catch { }
run('git', ['add', '-A'], dir); run('git', ['commit', '-q', '-m', 'založení projektu: zdravý start (pravidla, kontrolor, pojistky)'], dir);
const c1 = run('git', ['rev-parse', 'HEAD'], dir).trim();
fs.writeFileSync(path.join(dir, 'docs', 'kontrola', 'VYDANI.md'), `# Verdikt vydání\n\nVerdikt: 🟢   (výchozí stav — kostra bez kódu aplikace; zapsal instalátor, další verdikty píše jen kontrolor)\ncommit ${c1}\ndatum ${localIso()}\ntesty: zatím žádné\n`);
run('git', ['add', 'docs/kontrola/VYDANI.md'], dir); run('git', ['commit', '-q', '-m', 'kontrola: výchozí stav'], dir);
const rc = tryRun(process.execPath, [path.join(H, 'release-check.mjs')], dir); const hy = tryRun(process.execPath, [path.join(H, 'hygiene-all.mjs')], dir);
if (!rc || !hy) { say('CHYBA: vlastní kontrola nově založeného projektu neprošla (release-check / hygiene) — nahlas to prosím jako chybu balíku.'); process.exit(1); }
say(`✔ git repo založeno (větev main, ${run('git', ['rev-list', '--count', 'HEAD'], dir).trim()} commity), pojistka před uložením aktivní`);

// 4) záloha na GitHub — soukromé repo, jen se souhlasem (Enter = ano)
let ghDone = false;
if (!flag('--no-github') && has('gh') && tryRun('gh', ['auth', 'status'], dir) !== null) {
  const a = (flag('--github') ? '1' : YES ? '2' : await ask('Založit SOUKROMÉ repo na GitHubu jako zálohu? [1] ano (doporučeno)  [2] ne  → Enter = 1: ', '1'));
  if (a === '1') { const r = tryRun('gh', ['repo', 'create', slug, '--private', '--source', '.', '--remote', 'origin', '--push'], dir);
    if (r !== null) { ghDone = true; say(`✔ soukromé repo na GitHubu: ${slug} (záloha; CI hlídá pořádek, tajemství, testy a vydání)`); }
    else say('GitHub repo se nepodařilo založit (možná už repo s tímto názvem existuje) — agent ti to později nabídne znovu.'); }
} else if (!flag('--no-github')) say('Pozn.: GitHub CLI není přihlášené — záloha na GitHub se přeskočí; agent ti ji nabídne. (Přihlášení: gh auth login)');

// 4b) samostatný auditor vedle projektu (kombinace): jen workspace auditora, do repa už nesahá (projekt má vlastní pojistky)
let audOk = false;
if (withAud) {
  say('\nInstaluji samostatného auditora vedle projektu (1–3 min, stahuje nástroje pro testy)...');
  const r = isWin ? tryRunI('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(pkg, 'setup-auditor.ps1'), '-Repo', dir, '-Workspace', ws, '-Yes', '-Model', model, '-Kapitan', 'ne', '-Hygiena', 'ne', '-CI', 'ne'])
    : tryRunI('bash', [path.join(pkg, 'setup-auditor.sh')], { AUDITOR_YES: '1', AUDITOR_REPO: dir, AUDITOR_WS: ws, AUDITOR_REMOTE: '', AUDITOR_MODEL: model, AUDITOR_KAPITAN: 'ne', AUDITOR_HYGIENA: 'ne', AUDITOR_CI: 'ne' });
  if (r) {
    fs.writeFileSync(path.join(ws, 'AUDIT', '.zdravy-start.json'), JSON.stringify({ projekt: dir, zalozeno: today, rezim: 'kombinace' }, null, 2) + '\n');
    const envAudit = path.join(ws, 'AUDIT', '.auth', '.env.audit'); if (!fs.existsSync(envAudit)) try { fs.copyFileSync(path.join(ws, 'templates', 'env.audit.example'), envAudit); } catch { }
    const p2 = isWin ? tryRunI('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(pkg, 'post-install.ps1'), '-Repo', dir, '-Workspace', ws, '-NoGitHub', '-NoRepoTouch', '-NoLaunch'])
      : tryRunI('bash', [path.join(ws, 'tools', 'post-install.sh'), dir, ws, '--no-launch']);
    audOk = !!p2; say(audOk ? `✔ auditor připraven v ${ws}` : 'Auditor se nainstaloval, ale závěrečná kontrola neprošla — viz výpis výše.');
  } else say('Instalace auditora selhala (viz výše). Projekt funguje i bez něj; auditora připojíš později přes START → [2].');
}

// 5) důvěra složce, zástupce na ploše, spuštění
if (!flag('--no-trust')) tryRun(process.execPath, [path.join(pkg, 'tools', 'trust-folders.mjs'), dir]);
if (!flag('--no-shortcut')) {
  const desk = [path.join(os.homedir(), 'Desktop'), path.join(os.homedir(), 'Plocha'), path.join(os.homedir(), 'OneDrive', 'Desktop'), path.join(os.homedir(), 'OneDrive', 'Plocha')].find(d => fs.existsSync(d));
  try {
    if (isWin) { const ps = `$w=New-Object -ComObject WScript.Shell;$d=[Environment]::GetFolderPath('Desktop');$l=$w.CreateShortcut((Join-Path $d 'Projekt - ${slug}.lnk'));$l.TargetPath='cmd.exe';$l.Arguments='/k "${path.join(dir, 'scripts', 'start.cmd')}"';$l.WorkingDirectory='${dir}';$l.IconLocation='shell32.dll,43';$l.Save()`; run('powershell', ['-NoProfile', '-Command', ps]); say(`✔ zástupce na ploše: „Projekt - ${slug}"`); }
    else if (desk && isMac) { const f = path.join(desk, `Projekt - ${slug}.command`); fs.writeFileSync(f, `#!/usr/bin/env bash\nexec "${path.join(dir, 'scripts', 'start.sh')}"\n`); fs.chmodSync(f, 0o755); say(`✔ zástupce na ploše: „Projekt - ${slug}.command"`); }
    else if (desk) { const f = path.join(desk, `Projekt - ${slug}.desktop`); fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=Projekt - ${slug}\nExec=x-terminal-emulator -e "${path.join(dir, 'scripts', 'start.sh')}"\nTerminal=false\n`); fs.chmodSync(f, 0o755); say(`✔ zástupce na ploše: „Projekt - ${slug}"`); }
  } catch { say('Zástupce na plochu se nepodařilo vytvořit — agenta spustíš přes scripts/start v projektu.'); }
}
say(`\n================ HOTOVO: ${niceName} ================`);
say('  Co teď: otevře se okno agenta a sám začne rozhovorem (/zacatek) — co má aplikace dělat, pro koho, jaká data.');
say('  Odpovídáš lidsky; u každé otázky je doporučená odpověď, stačí potvrdit.');
say('  Pravidla hlídá sám projekt: testy vznikají se zadáním, nezávislý kontrolor (/kontrola) a vydání jen s jeho 🟢 (/vydani).');
say(`  Příště: poklepej na zástupce „Projekt - ${slug}" na ploše.${ghDone ? '' : ' Zálohu na GitHub ti agent nabídne.'}`);
if (withAud && audOk) { say(`  Auditor: zástupce „Auditor - ${slug}" na ploše. Spusť ho před prvním vydáním pro uživatele a pak jednou za měsíc`); say('  (agent ti to připomene). Když auditor zastaví vydání (🔴), agent opravy udělá přednostně.'); }
if (!flag('--no-launch') && has('claude')) {
  if (isWin) spawn('cmd.exe', ['/c', `start "" cmd.exe /k "${path.join(dir, 'scripts', 'start.cmd')}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  else if (isMac) spawn('open', ['-a', 'Terminal', path.join(dir, 'scripts', 'start.sh')], { detached: true, stdio: 'ignore' }).unref();
  else say(`  Spusť agenta: bash "${path.join(dir, 'scripts', 'start.sh')}"`);
}
rl?.close();
