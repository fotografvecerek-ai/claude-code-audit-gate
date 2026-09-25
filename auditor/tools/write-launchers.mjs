#!/usr/bin/env node
// WRITE-LAUNCHERS — spouštěče auditora a Kapitána (jediná implementace pro instalaci i aktualizaci).
// node tools/write-launchers.mjs <workspace> <repo>   → Windows: start-auditor.cmd, start-kapitan.cmd · mac/Linux: start-auditor.sh, start-kapitan.sh
// Auditor bez argumentů: rozjetý audit (existuje intake, handoff, nálezy, gate nebo zpráva) → naváže, kde skončil; jinak začne intake.
import fs from 'node:fs'; import path from 'node:path';
const ws = path.resolve(process.argv[2]); const repo = path.resolve(process.argv[3]); const name = path.basename(repo);
const cont = 'Pokracuj v rozjetem auditu v usporny rezimu (CLAUDE.md 0b): nacti AUDIT/_prubeh.md, z intake a handoffu jen potrebne casti, zkontroluj bus inbox a navaz tam, kde audit skoncil. Audit ani intake neopakuj. Existuje-li AUDIT/NOVE_CILE.md (novinky po aktualizaci), udelej jen ty cile.';
const intake = 'Zacni intake';
const kap = 'Jsi Kapitan - projektovy agent tohoto repa; auditor je nezavisly kontrolor tve prace. Nacti zpravy od auditora (bus inbox) a AUDIT/02_HANDOFF.md, pokud existuje; rid se audit rezimem. Pak pokracuj v bezne praci.';
// Telegram (tools/telegram-setup.mjs → .telegram.json): role s vlastním botem dostane složku stavu bota a kanál; nové okno převezme bota od starého
let tgc = {}; try { tgc = JSON.parse(fs.readFileSync(path.join(ws, '.telegram.json'), 'utf8')); } catch { }
const tok = d => { try { return (fs.readFileSync(path.join(d, '.env'), 'utf8').match(/^TELEGRAM_BOT_TOKEN=(.+)$/m) || [])[1]?.trim() || ''; } catch { return ''; } };
const tg0 = role => tgc[role]?.mode === 'channel' && tgc[role].stateDir && tok(tgc[role].stateDir) ? tgc[role].stateDir : '';   // token musí být na TOMTO počítači
// jeden bot = jedno okno: když má Kapitán omylem token auditora, kanál dostane jen auditor (nástroj telegram-setup to při dalším běhu opraví)
// Codex (tools/codex-setup.mjs → .agents.json): role v Codexu se spouští `codex` se sandboxem; Telegram kanál tam není
let ag = { auditor: 'claude', kapitan: 'claude' }; try { ag = { ...ag, ...JSON.parse(fs.readFileSync(path.join(ws, '.agents.json'), 'utf8')) }; } catch { }
const CX = role => ag[role] === 'codex';
let lvl = 1; try { lvl = JSON.parse(fs.readFileSync(path.join(ws, '.opravneni.json'), 'utf8')).kapitan || 1; } catch { }
const NET = '-c sandbox_workspace_write.network_access=true';
const cxFlags = role => role === 'auditor' ? `-s workspace-write -a never --search ${NET}`
  : lvl >= 3 ? '-s danger-full-access -a never' : lvl === 2 ? `-s workspace-write -a never ${NET}` : '-s workspace-write -a on-request';
const CXM = ' Pravidla a roli mas v AGENTS.md (bezis v Codexu).';
const HD = ag.hooky || '';
// Úsporný režim (výchozí; <ws>/.rezim.json): kompakce kontextu u ~200 tis. tokenů místo ~1 mil. (modely s 1M oknem jinak nesou a znovu čtou
// obří kontext v každém kroku) a subagenti auditora bez určeného modelu na sonnetu. „dukladny" = výchozí chování Claude Code.
let rz = { rezim: 'usporny', okno: 200000 }; try { rz = { ...rz, ...JSON.parse(fs.readFileSync(path.join(ws, '.rezim.json'), 'utf8')) }; } catch { }
const ECO = rz.rezim !== 'dukladny'; const okno = Math.max(50000, +rz.okno || 200000);   // chráněná složka pojistek (codex-setup); spouštěč bez platných otisků agenta nespustí
const tg = role => { if (CX(role)) return ''; const d = tg0(role); if (!d) return ''; if (role === 'kapitan' && tg0('auditor') && tok(tg0('auditor')) === tok(d)) return ''; return d; };
// POZOR: --add-dir i --channels berou víc hodnot — úvodní zpráva proto MUSÍ být před nimi, jinak ji Claude Code spolkne jako další složku
const CH = '--channels plugin:telegram@claude-plugins-official';
// role s botem dostane pokyn rovnou v úvodní zprávě (vlastník ho nemusí psát sám); ASCII kvůli cmd
const TGM = ' Mas vlastniho Telegram bota: zpravy vlastnika ti chodi primo do okna jako udalost kanalu (channel source telegram); odpovidej na ne VYHRADNE nastrojem reply toho kanalu, cesky a kratce - ne skripty ani mostem projektu, jinak odpoved prijde z jineho bota. Hooky ani most projektu kvuli Telegramu nemen.';
const withTg = (msg, role) => CX(role) ? msg.replace(/\.?$/, '.') + CXM : tg(role) ? msg.replace(/\.?$/, '.') + TGM : msg;
if (process.platform === 'win32') {
  const envW = (sd, role) => sd ? [`set "TELEGRAM_STATE_DIR=${sd}"`, 'set "PATH=%USERPROFILE%\\.bun\\bin;%PATH%"', `node "${ws}\\tools\\telegram-ping.mjs" "${sd}" ${role} "${name}" --plugin-dir "${role === 'auditor' ? ws : repo}"`, 'echo  Telegram: zpravy z bota chodi primo do tohoto okna.'] : [];
  const chA = tg('auditor') ? ' ' + CH : '', chK = tg('kapitan') ? ' ' + CH : '';
  const htW = role => CX(role) ? [`node "${HD}\\codex-hooks-check.mjs" "${HD}" || (pause & exit /b 1)`]
    : ECO ? [`set "CLAUDE_CODE_AUTO_COMPACT_WINDOW=${okno}"`, ...(role === 'auditor' ? ['set "CLAUDE_CODE_SUBAGENT_MODEL=sonnet"'] : [])] : [];
  // prompt MSG / uživatelské argumenty: Claude = zpráva před --add-dir (variadické volby); Codex = volby a zpráva na konci
  // kontrola před startem (tools/preflight.mjs): aktualizace + nejnovější instalace Claude Code / Codexu; stdout = cesta k nejnovějšímu claude
  const pfW = role => CX(role) ? [`node "${ws}\\tools\\preflight.mjs" "${ws}" ${role} --repo "${repo}" --agent codex`]
    : ['set "CB=claude"', `for /f "usebackq delims=" %%i in (\`node "${ws}\\tools\\preflight.mjs" "${ws}" ${role} --repo "${repo}" --bin\`) do set "CB=%%i"`];
  const runA = m => CX('auditor') ? `codex --dangerously-bypass-hook-trust -C "${ws}" ${cxFlags('auditor')} ${m}` : `call "%CB%" ${m} --add-dir "${repo}"${chA}`;
  const runK = m => CX('kapitan') ? `codex --dangerously-bypass-hook-trust -C "${repo}" --add-dir "${ws}\\AUDIT\\03_dukazy" --add-dir "${ws}\\AUDIT\\bus" ${cxFlags('kapitan')} ${m}` : `call "%CB%" ${m} --add-dir "${ws}"${chK}`;
  const a = ['@echo off', `title AUDITOR${CX('auditor') ? ' (Codex)' : ''} - ${name}`, `cd /d "${ws}"`, ...pfW('auditor'), ...envW(tg('auditor'), 'auditor'), ...htW('auditor'), 'echo.', `echo  AUDITOR - ${name}.  Uvodni zprava se posle sama.`, 'echo.',
    `if not "%~1"=="" (${runA('%*')} & goto :eof)`,
    'set "RJ="', ...['00_intake.md', '02_HANDOFF.md', '01_nalezy\\A-*.md', '05_release_gate.md', 'ZPRAVA.md', 'ZPRAVA.html'].map(f => `if exist "AUDIT\\${f}" set "RJ=1"`),   // rozjetý audit = cokoliv z jeho výsledků
    `if defined RJ (${runA(`"${withTg(cont, 'auditor')}"`)}) else (${runA(`"${withTg(intake, 'auditor')}"`)})`, ''];
  const k = ['@echo off', `title KAPITAN${CX('kapitan') ? ' (Codex)' : ''} - ${name}`, `cd /d "${repo}"`, `node "${CX('kapitan') && HD ? HD : ws + '\\tools'}\\wait-idle.mjs" "${repo}" 3 || exit /b 1`, ...pfW('kapitan'), ...envW(tg('kapitan'), 'kapitan'), ...htW('kapitan'), 'echo.',
    `echo  KAPITAN - ${name}.  Sam si nacte zpravy od auditora.`, 'echo.', `if "%~1"=="" (${runK(`"${withTg(kap, 'kapitan')}"`)}) else (${runK('%*')})`, ''];
  fs.writeFileSync(path.join(ws, 'start-auditor.cmd'), a.join('\r\n')); fs.writeFileSync(path.join(ws, 'start-kapitan.cmd'), k.join('\r\n'));
} else {
  const q = s => `'${s.replace(/'/g, `'\\''`)}'`;
  const envU = (sd, role) => sd ? [`export TELEGRAM_STATE_DIR=${q(sd)}`, 'export PATH="$HOME/.bun/bin:$PATH"', `node ${q(ws + '/tools/telegram-ping.mjs')} ${q(sd)} ${role} ${q(name)} --plugin-dir ${q(role === 'auditor' ? ws : repo)}`, 'echo "  Telegram: zpravy z bota chodi primo do tohoto okna."'] : [];
  const chA = tg('auditor') ? ' ' + CH : '', chK = tg('kapitan') ? ' ' + CH : '';
  const htU = role => CX(role) ? [`node ${q(HD + '/codex-hooks-check.mjs')} ${q(HD)} || { read -r -p "Enter = konec" _; exit 1; }`]
    : ECO ? [`export CLAUDE_CODE_AUTO_COMPACT_WINDOW=${okno}`, ...(role === 'auditor' ? ['export CLAUDE_CODE_SUBAGENT_MODEL=sonnet'] : [])] : [];
  const pfU = role => CX(role) ? [`node ${q(ws + '/tools/preflight.mjs')} ${q(ws)} ${role} --repo ${q(repo)} --agent codex`]
    : [`CB=$(node ${q(ws + '/tools/preflight.mjs')} ${q(ws)} ${role} --repo ${q(repo)} --bin); [ -n "$CB" ] || CB=claude`];
  const runA = m => CX('auditor') ? `exec codex --dangerously-bypass-hook-trust -C ${q(ws)} ${cxFlags('auditor')} ${m}` : `exec "$CB" ${m} --add-dir ${q(repo)}${chA}`;
  const runK = m => CX('kapitan') ? `exec codex --dangerously-bypass-hook-trust -C ${q(repo)} --add-dir ${q(ws + '/AUDIT/03_dukazy')} --add-dir ${q(ws + '/AUDIT/bus')} ${cxFlags('kapitan')} ${m}` : `exec "$CB" ${m} --add-dir ${q(ws)}${chK}`;
  const a = ['#!/usr/bin/env bash', `cd ${q(ws)} || exit 1`, ...pfU('auditor'), ...envU(tg('auditor'), 'auditor'), ...htU('auditor'), `echo; echo "  AUDITOR - ${name}. Uvodni zprava se posle sama."; echo`,
    `if [ $# -gt 0 ]; then ${runA('"$@"')}; fi`,
    `if [ -e AUDIT/00_intake.md ] || [ -e AUDIT/02_HANDOFF.md ] || ls AUDIT/01_nalezy/A-*.md >/dev/null 2>&1 || [ -e AUDIT/05_release_gate.md ] || [ -e AUDIT/ZPRAVA.md ] || [ -e AUDIT/ZPRAVA.html ]; then ${runA(q(withTg(cont, 'auditor')))}; else ${runA(q(withTg(intake, 'auditor')))}; fi`, ''];
  const k = ['#!/usr/bin/env bash', `cd ${q(repo)} && node ${q((CX('kapitan') && HD ? HD : ws + '/tools') + '/wait-idle.mjs')} ${q(repo)} 3 || exit 1`, ...pfU('kapitan'), ...envU(tg('kapitan'), 'kapitan'), ...htU('kapitan'), `echo; echo "  KAPITAN - ${name}. Sam si nacte zpravy od auditora."; echo`,
    `if [ $# -eq 0 ]; then ${runK(q(withTg(kap, 'kapitan')))}; else ${runK('"$@"')}; fi`, ''];
  for (const [f, c] of [['start-auditor.sh', a], ['start-kapitan.sh', k]]) { fs.writeFileSync(path.join(ws, f), c.join('\n')); fs.chmodSync(path.join(ws, f), 0o755); }
}
console.log('spouštěče auditora a Kapitána zapsány');
