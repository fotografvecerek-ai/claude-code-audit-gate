#!/usr/bin/env node
// WRITE-LAUNCHERS — spouštěče auditora a Kapitána (jediná implementace pro instalaci i aktualizaci).
// node tools/write-launchers.mjs <workspace> <repo>   → Windows: start-auditor.cmd, start-kapitan.cmd · mac/Linux: start-auditor.sh, start-kapitan.sh
// Auditor bez argumentů: rozjetý audit (existuje intake, handoff, nálezy, gate nebo zpráva) → naváže, kde skončil; jinak začne intake.
import fs from 'node:fs'; import path from 'node:path';
const ws = path.resolve(process.argv[2]); const repo = path.resolve(process.argv[3]); const name = path.basename(repo);
const cont = 'Pokracuj v rozjetem auditu: nacti AUDIT/_prubeh.md, AUDIT/00_intake.md a AUDIT/02_HANDOFF.md, zkontroluj bus inbox a navaz tam, kde audit skoncil. Audit ani intake neopakuj. Existuje-li AUDIT/NOVE_CILE.md (novinky po aktualizaci), udelej jen ty cile.';
const intake = 'Zacni intake';
const kap = 'Jsi Kapitan - projektovy agent tohoto repa; auditor je nezavisly kontrolor tve prace. Nacti zpravy od auditora (bus inbox) a AUDIT/02_HANDOFF.md, pokud existuje; rid se audit rezimem. Pak pokracuj v bezne praci.';
// Telegram (tools/telegram-setup.mjs → .telegram.json): role s vlastním botem dostane složku stavu bota a kanál; nové okno převezme bota od starého
let tgc = {}; try { tgc = JSON.parse(fs.readFileSync(path.join(ws, '.telegram.json'), 'utf8')); } catch { }
const tok = d => { try { return (fs.readFileSync(path.join(d, '.env'), 'utf8').match(/^TELEGRAM_BOT_TOKEN=(.+)$/m) || [])[1]?.trim() || ''; } catch { return ''; } };
const tg0 = role => tgc[role]?.mode === 'channel' && tgc[role].stateDir && tok(tgc[role].stateDir) ? tgc[role].stateDir : '';   // token musí být na TOMTO počítači
// jeden bot = jedno okno: když má Kapitán omylem token auditora, kanál dostane jen auditor (nástroj telegram-setup to při dalším běhu opraví)
const tg = role => { const d = tg0(role); if (!d) return ''; if (role === 'kapitan' && tg0('auditor') && tok(tg0('auditor')) === tok(d)) return ''; return d; };
// POZOR: --add-dir i --channels berou víc hodnot — úvodní zpráva proto MUSÍ být před nimi, jinak ji Claude Code spolkne jako další složku
const CH = '--channels plugin:telegram@claude-plugins-official';
// role s botem dostane pokyn rovnou v úvodní zprávě (vlastník ho nemusí psát sám); ASCII kvůli cmd
const TGM = ' Mas vlastniho Telegram bota: zpravy vlastnika ti chodi primo do okna jako udalost kanalu (channel source telegram); odpovidej na ne VYHRADNE nastrojem reply toho kanalu, cesky a kratce - ne skripty ani mostem projektu, jinak odpoved prijde z jineho bota. Hooky ani most projektu kvuli Telegramu nemen.';
const withTg = (msg, role) => tg(role) ? msg.replace(/\.?$/, '.') + TGM : msg;
if (process.platform === 'win32') {
  const envW = (sd, role) => sd ? [`set "TELEGRAM_STATE_DIR=${sd}"`, 'set "PATH=%USERPROFILE%\\.bun\\bin;%PATH%"', `node "${ws}\\tools\\telegram-ping.mjs" "${sd}" ${role} "${name}" --plugin-dir "${role === 'auditor' ? ws : repo}"`, 'echo  Telegram: zpravy z bota chodi primo do tohoto okna.'] : [];
  const chA = tg('auditor') ? ' ' + CH : '', chK = tg('kapitan') ? ' ' + CH : '';
  const a = ['@echo off', `title AUDITOR - ${name}`, `cd /d "${ws}"`, ...envW(tg('auditor'), 'auditor'), 'echo.', `echo  AUDITOR - ${name}.  Uvodni zprava se posle sama.`, 'echo.',
    `if not "%~1"=="" (claude %* --add-dir "${repo}"${chA} & goto :eof)`,
    'set "RJ="', ...['00_intake.md', '02_HANDOFF.md', '01_nalezy\\A-*.md', '05_release_gate.md', 'ZPRAVA.md', 'ZPRAVA.html'].map(f => `if exist "AUDIT\\${f}" set "RJ=1"`),   // rozjetý audit = cokoliv z jeho výsledků
    `if defined RJ (claude "${withTg(cont, 'auditor')}" --add-dir "${repo}"${chA}) else (claude "${withTg(intake, 'auditor')}" --add-dir "${repo}"${chA})`, ''];
  const k = ['@echo off', `title KAPITAN - ${name}`, `cd /d "${repo}"`, `node "${ws}\\tools\\wait-idle.mjs" "${repo}" 3 || exit /b 1`, ...envW(tg('kapitan'), 'kapitan'), 'echo.',
    `echo  KAPITAN - ${name}.  Sam si nacte zpravy od auditora.`, 'echo.', `if "%~1"=="" (claude "${withTg(kap, 'kapitan')}" --add-dir "${ws}"${chK}) else (claude %* --add-dir "${ws}"${chK})`, ''];
  fs.writeFileSync(path.join(ws, 'start-auditor.cmd'), a.join('\r\n')); fs.writeFileSync(path.join(ws, 'start-kapitan.cmd'), k.join('\r\n'));
} else {
  const q = s => `'${s.replace(/'/g, `'\\''`)}'`;
  const envU = (sd, role) => sd ? [`export TELEGRAM_STATE_DIR=${q(sd)}`, 'export PATH="$HOME/.bun/bin:$PATH"', `node ${q(ws + '/tools/telegram-ping.mjs')} ${q(sd)} ${role} ${q(name)} --plugin-dir ${q(role === 'auditor' ? ws : repo)}`, 'echo "  Telegram: zpravy z bota chodi primo do tohoto okna."'] : [];
  const chA = tg('auditor') ? ' ' + CH : '', chK = tg('kapitan') ? ' ' + CH : '';
  const a = ['#!/usr/bin/env bash', `cd ${q(ws)} || exit 1`, ...envU(tg('auditor'), 'auditor'), `echo; echo "  AUDITOR - ${name}. Uvodni zprava se posle sama."; echo`,
    `if [ $# -gt 0 ]; then exec claude "$@" --add-dir ${q(repo)}${chA}; fi`,
    `if [ -e AUDIT/00_intake.md ] || [ -e AUDIT/02_HANDOFF.md ] || ls AUDIT/01_nalezy/A-*.md >/dev/null 2>&1 || [ -e AUDIT/05_release_gate.md ] || [ -e AUDIT/ZPRAVA.md ] || [ -e AUDIT/ZPRAVA.html ]; then exec claude ${q(withTg(cont, 'auditor'))} --add-dir ${q(repo)}${chA}; else exec claude ${q(withTg(intake, 'auditor'))} --add-dir ${q(repo)}${chA}; fi`, ''];
  const k = ['#!/usr/bin/env bash', `cd ${q(repo)} && node ${q(ws + '/tools/wait-idle.mjs')} ${q(repo)} 3 || exit 1`, ...envU(tg('kapitan'), 'kapitan'), `echo; echo "  KAPITAN - ${name}. Sam si nacte zpravy od auditora."; echo`,
    `if [ $# -eq 0 ]; then exec claude ${q(withTg(kap, 'kapitan'))} --add-dir ${q(ws)}${chK}; else exec claude "$@" --add-dir ${q(ws)}${chK}; fi`, ''];
  for (const [f, c] of [['start-auditor.sh', a], ['start-kapitan.sh', k]]) { fs.writeFileSync(path.join(ws, f), c.join('\n')); fs.chmodSync(path.join(ws, f), 0o755); }
}
console.log('spouštěče auditora a Kapitána zapsány');
