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
let lvl = 1; try { lvl = (await import('./prisnost.mjs')).kapitanLevel(ws); } catch { try { lvl = JSON.parse(fs.readFileSync(path.join(ws, '.opravneni.json'), 'utf8')).kapitan || 1; } catch { } }   // A-029 K3: platí verze schválená vlastníkem
const NET = '-c sandbox_workspace_write.network_access=true';
const cxFlags = role => role === 'auditor' ? `-s workspace-write -a never --search ${NET}`
  : lvl >= 3 ? '-s danger-full-access -a never' : lvl === 2 ? `-s workspace-write -a never ${NET}` : '-s workspace-write -a on-request';
const CXM = ' Pravidla a roli mas v AGENTS.md (bezis v Codexu).';
const HD = ag.hooky || '';
// Kapitán existuje (ne audit z GitHubu, ne kombinace se zdravým startem) → i společný spouštěč start-projekt (jedno okno, dvě záložky)
const hasK = !fs.existsSync(path.join(ws, 'AUDIT', '.remote.json')) && !fs.existsSync(path.join(ws, 'AUDIT', '.zdravy-start.json'));
// Úsporný režim (výchozí; <ws>/.rezim.json): kompakce kontextu u ~200 tis. tokenů místo ~1 mil. (modely s 1M oknem jinak nesou a znovu čtou
// obří kontext v každém kroku); subagenti OBOU rolí bez určeného modelu na sonnetu (CLAUDE_CODE_SUBAGENT_MODEL je jen záloha — model: v definici
// agenta i v konkrétním volání má přednost) a strop souběžných subagentů (auditor 5, Kapitán 3; .rezim.json → "soubeh": {"auditor":5,"kapitan":3})
// — z provozu: Kapitán na Opusu pustil 9 pomocníků najednou. „dukladny" = výchozí chování Claude Code.
let rz = { rezim: 'usporny', okno: 200000 }; try { rz = { ...rz, ...JSON.parse(fs.readFileSync(path.join(ws, '.rezim.json'), 'utf8')) }; } catch { }
// Model: vybírá tools/preflight.mjs při každém startu podle PRÁVĚ dostupných modelů (pořadí aliasů podle role, .rezim.json → "modely").
const ECO = rz.rezim !== 'dukladny'; const okno = Math.max(50000, +rz.okno || 200000);   // chráněná složka pojistek (codex-setup); spouštěč bez platných otisků agenta nespustí
const soub = role => Math.max(1, Math.min(20, +((rz.soubeh || {})[role]) || (role === 'auditor' ? 5 : 3)));
const ecoEnv = (role, pre) => [`${pre}CLAUDE_CODE_AUTO_COMPACT_WINDOW=${okno}`, `${pre}CLAUDE_CODE_SUBAGENT_MODEL=sonnet`, `${pre}CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=${soub(role)}`];
const tg = role => { if (CX(role)) return ''; const d = tg0(role); if (!d) return ''; if (role === 'kapitan' && tg0('auditor') && tok(tg0('auditor')) === tok(d)) return ''; return d; };
// POZOR: --add-dir i --channels berou víc hodnot — úvodní zpráva proto MUSÍ být před nimi, jinak ji Claude Code spolkne jako další složku
const CH = '--channels plugin:telegram@claude-plugins-official';
// role s botem dostane pokyn rovnou v úvodní zprávě (vlastník ho nemusí psát sám); ASCII kvůli cmd
const TGM = ' Mas vlastniho Telegram bota: zpravy vlastnika ti chodi primo do okna jako udalost kanalu (channel source telegram); odpovidej na ne VYHRADNE nastrojem reply toho kanalu, jazykem vlastnika a kratce - ne skripty ani mostem projektu, jinak odpoved prijde z jineho bota. Hooky ani most projektu kvuli Telegramu nemen.';
const withTg = (msg, role) => CX(role) ? msg.replace(/\.?$/, '.') + CXM : tg(role) ? msg.replace(/\.?$/, '.') + TGM : msg;
if (process.platform === 'win32') {
  const envW = (sd, role) => sd ? [`set "TELEGRAM_STATE_DIR=${sd}"`, 'set "PATH=%USERPROFILE%\\.bun\\bin;%PATH%"', `node "${ws}\\tools\\telegram-ping.mjs" "${sd}" ${role} "${name}" --plugin-dir "${role === 'auditor' ? ws : repo}"`, 'echo  Telegram: zpravy z bota chodi primo do tohoto okna.'] : [];
  const chA = tg('auditor') ? ' ' + CH : '', chK = tg('kapitan') ? ' ' + CH : '';
  const htW = role => CX(role) ? [`node "${HD}\\codex-hooks-check.mjs" "${HD}" || (pause & exit /b 1)`]
    : ECO ? ecoEnv(role, 'set "').map(x => x + '"') : [];
  // prompt MSG / uživatelské argumenty: Claude = zpráva před --add-dir (variadické volby); Codex = volby a zpráva na konci
  // kontrola před startem (tools/preflight.mjs): aktualizace + nejnovější instalace Claude Code / Codexu; stdout = cesta k nejnovějšímu claude
  const pfW = role => CX(role) ? [`node "${ws}\\tools\\preflight.mjs" "${ws}" ${role} --repo "${repo}" --agent codex`]
    : ['set "CB=claude"', 'set "MOD=-"', `for /f "usebackq tokens=1,2 delims=|" %%i in (\`node "${ws}\\tools\\preflight.mjs" "${ws}" ${role} --repo "${repo}" --bin\`) do (set "CB=%%i" & set "MOD=%%j")`,
      'set "MODARG="', 'if not "%MOD%"=="-" if not "%MOD%"=="" set "MODARG=--model %MOD% "',
      // pojistka: claude se zrovna aktualizuje (soubor na chvíli chybí) → chvíli počkat, ať okno neskončí „claude is not recognized"
      'if /i "%CB%"=="claude" for /l %%n in (1,1,12) do where claude >nul 2>nul || timeout /t 5 /nobreak >nul'];
  const runA = m => CX('auditor') ? `codex --dangerously-bypass-hook-trust -C "${ws}" ${cxFlags('auditor')} ${m}` : `call "%CB%" %MODARG%${m} --add-dir "${repo}"${chA}`;
  const runK = m => CX('kapitan') ? `codex --dangerously-bypass-hook-trust -C "${repo}" --add-dir "${ws}\\AUDIT\\03_dukazy" --add-dir "${ws}\\AUDIT\\bus" ${cxFlags('kapitan')} ${m}` : `call "%CB%" %MODARG%${m} --add-dir "${ws}"${chK}`;
  // cmd čte .cmd v kódové stránce konzole (852/437) → cesty s diakritikou („hlavní", C:\Users\Jiří) by se rozbily. Proto: UTF-8 bez BOM + chcp 65001
  // hned na 2. řádku (další řádky cmd dekóduje už jako UTF-8), workspace přes %~dp0 a KAŽDÉ „cd" s kontrolou — agent se nikdy nespustí ve špatné složce.
  const esc = t => String(t).replace(/([&|<>^()%])/g, m => m === '%' ? '%%' : '^' + m);   // text v echo/title (ne v uvozovkách)
  const fail = what => ['goto :eof', ':chyba', 'echo.', `echo  CHYBA: slozku ${esc(what)} se nepodarilo otevrit - agenta nespoustim.`, 'echo  Zkontroluj, ze slozka existuje, a posli tento vypis.', 'pause', 'exit /b 1'];
  const a = ['@echo off', 'chcp 65001 >nul', `title AUDITOR${CX('auditor') ? ' (Codex)' : ''} - ${esc(name)}`, 'cd /d "%~dp0." || goto :chyba', ...pfW('auditor'), ...envW(tg('auditor'), 'auditor'), ...htW('auditor'), 'echo.', `echo  AUDITOR - ${esc(name)}.  Uvodni zprava se posle sama.`, 'echo.',
    `if not "%~1"=="" (${runA('%*')} & goto :eof)`,
    'set "RJ="', ...['00_intake.md', '02_HANDOFF.md', '01_nalezy\\A-*.md', '05_release_gate.md', 'ZPRAVA.md', 'ZPRAVA.html'].map(f => `if exist "AUDIT\\${f}" set "RJ=1"`),   // rozjetý audit = cokoliv z jeho výsledků
    `if defined RJ (${runA(`"${withTg(cont, 'auditor')}"`)}) else (${runA(`"${withTg(intake, 'auditor')}"`)})`, ...fail('auditora ' + ws), ''];
  const k = ['@echo off', 'chcp 65001 >nul', `title KAPITAN${CX('kapitan') ? ' (Codex)' : ''} - ${esc(name)}`, `cd /d "${repo}" || goto :chyba`, `node "${CX('kapitan') && HD ? HD : ws + '\\tools'}\\wait-idle.mjs" "${repo}" 3 || exit /b 1`, ...pfW('kapitan'), ...envW(tg('kapitan'), 'kapitan'), ...htW('kapitan'), 'echo.',
    `echo  KAPITAN - ${esc(name)}.  Sam si nacte zpravy od auditora.`, 'echo.', `if "%~1"=="" (${runK(`"${withTg(kap, 'kapitan')}"`)}) else (${runK('%*')})`, ...fail('projektu ' + repo), ''];
  // JEDNO okno na projekt: Windows Terminal se dvěma záložkami (Auditor zeleně, Kapitán modře); bez Windows Terminalu dvě klasická okna.
  // Vždy NOVÉ okno (každý projekt své; do cizího okna se záložky nepřimíchají). Záložky mají pevný název a barvu (claude je nepřepíše).
  if (hasK) { const tt = t => String(t).replace(/[;"]/g, ',').replace(/%/g, '%%');
    const pj = ['@echo off', 'chcp 65001 >nul', 'cd /d "%~dp0." || goto :chyba', 'where wt >nul 2>nul || goto :okna',
      `wt -w new new-tab --title "Auditor · ${tt(name)}" --suppressApplicationTitle --tabColor "#2E7D32" -d "%~dp0." cmd /k start-auditor.cmd ; new-tab --title "Kapitán · ${tt(name)}" --suppressApplicationTitle --tabColor "#1565C0" -d "%~dp0." cmd /k start-kapitan.cmd`,
      'goto :eof', ':okna', 'echo  Windows Terminal nenalezen - oteviram dve okna ^(auditor a Kapitan^).', 'start "Auditor" cmd /k call "%~dp0start-auditor.cmd"', 'start "Kapitan" cmd /k call "%~dp0start-kapitan.cmd"', ...fail('auditora ' + ws), ''];
    fs.writeFileSync(path.join(ws, 'start-projekt.cmd'), pj.join('\r\n'), 'utf8');
  } else { try { fs.unlinkSync(path.join(ws, 'start-projekt.cmd')); } catch { } }
  fs.writeFileSync(path.join(ws, 'start-auditor.cmd'), a.join('\r\n'), 'utf8'); fs.writeFileSync(path.join(ws, 'start-kapitan.cmd'), k.join('\r\n'), 'utf8');   // UTF-8 bez BOM (BOM by rozbil 1. řádek)
} else {
  const q = s => `'${s.replace(/'/g, `'\\''`)}'`;
  const envU = (sd, role) => sd ? [`export TELEGRAM_STATE_DIR=${q(sd)}`, 'export PATH="$HOME/.bun/bin:$PATH"', `node ${q(ws + '/tools/telegram-ping.mjs')} ${q(sd)} ${role} ${q(name)} --plugin-dir ${q(role === 'auditor' ? ws : repo)}`, 'echo "  Telegram: zpravy z bota chodi primo do tohoto okna."'] : [];
  const chA = tg('auditor') ? ' ' + CH : '', chK = tg('kapitan') ? ' ' + CH : '';
  const htU = role => CX(role) ? [`node ${q(HD + '/codex-hooks-check.mjs')} ${q(HD)} || { read -r -p "Enter = konec" _; exit 1; }`]
    : ECO ? ecoEnv(role, 'export ') : [];
  const pfU = role => CX(role) ? [`node ${q(ws + '/tools/preflight.mjs')} ${q(ws)} ${role} --repo ${q(repo)} --agent codex`]
    : [`PF=$(node ${q(ws + '/tools/preflight.mjs')} ${q(ws)} ${role} --repo ${q(repo)} --bin); CB=\${PF%%|*}; MOD=\${PF#*|}; [ -n "$CB" ] || CB=claude`,
      'MA=(); if [ -n "$MOD" ] && [ "$MOD" != "-" ] && [ "$MOD" != "$PF" ]; then MA=(--model "$MOD"); fi'];
  const runA = m => CX('auditor') ? `exec codex --dangerously-bypass-hook-trust -C ${q(ws)} ${cxFlags('auditor')} ${m}` : `exec "$CB" \${MA[@]+"\${MA[@]}"} ${m} --add-dir ${q(repo)}${chA}`;
  const runK = m => CX('kapitan') ? `exec codex --dangerously-bypass-hook-trust -C ${q(repo)} --add-dir ${q(ws + '/AUDIT/03_dukazy')} --add-dir ${q(ws + '/AUDIT/bus')} ${cxFlags('kapitan')} ${m}` : `exec "$CB" \${MA[@]+"\${MA[@]}"} ${m} --add-dir ${q(ws)}${chK}`;
  const a = ['#!/usr/bin/env bash', `cd ${q(ws)} || { echo "  CHYBA: slozku auditora se nepodarilo otevrit - agenta nespoustim."; exit 1; }`, ...pfU('auditor'), ...envU(tg('auditor'), 'auditor'), ...htU('auditor'), `echo; echo "  AUDITOR - ${name}. Uvodni zprava se posle sama."; echo`,
    `if [ $# -gt 0 ]; then ${runA('"$@"')}; fi`,
    `if [ -e AUDIT/00_intake.md ] || [ -e AUDIT/02_HANDOFF.md ] || ls AUDIT/01_nalezy/A-*.md >/dev/null 2>&1 || [ -e AUDIT/05_release_gate.md ] || [ -e AUDIT/ZPRAVA.md ] || [ -e AUDIT/ZPRAVA.html ]; then ${runA(q(withTg(cont, 'auditor')))}; else ${runA(q(withTg(intake, 'auditor')))}; fi`, ''];
  const k = ['#!/usr/bin/env bash', `cd ${q(repo)} || { echo "  CHYBA: slozku projektu se nepodarilo otevrit - agenta nespoustim."; exit 1; }`, `node ${q((CX('kapitan') && HD ? HD : ws + '/tools') + '/wait-idle.mjs')} ${q(repo)} 3 || exit 1`, ...pfU('kapitan'), ...envU(tg('kapitan'), 'kapitan'), ...htU('kapitan'), `echo; echo "  KAPITAN - ${name}. Sam si nacte zpravy od auditora."; echo`,
    `if [ $# -eq 0 ]; then ${runK(q(withTg(kap, 'kapitan')))}; else ${runK('"$@"')}; fi`, ''];
  for (const [f, c] of [['start-auditor.sh', a], ['start-kapitan.sh', k]]) { fs.writeFileSync(path.join(ws, f), c.join('\n')); fs.chmodSync(path.join(ws, f), 0o755); }
  // jedno okno na projekt: tmux (dvě záložky Auditor/Kapitan, přepínání Ctrl+b n), na macOS bez tmuxu dvě okna Terminálu
  if (hasK) { const sess = 'aud-' + name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 30);
    const pj = ['#!/usr/bin/env bash', `cd ${q(ws)} || exit 1`,
      `if command -v tmux >/dev/null 2>&1; then tmux has-session -t ${q(sess)} 2>/dev/null || { tmux new-session -d -s ${q(sess)} -n Auditor ${q(ws + '/start-auditor.sh')}; tmux new-window -t ${q(sess)} -n Kapitan ${q(ws + '/start-kapitan.sh')}; }; exec tmux attach -t ${q(sess)}; fi`,
      `if [ "$(uname)" = "Darwin" ]; then open -a Terminal ${q(ws + '/start-auditor.sh')}; open -a Terminal ${q(ws + '/start-kapitan.sh')}; exit 0; fi`,
      `echo "  Pro jedno okno se dvema zalozkami nainstaluj tmux. Jinak spust ve dvou oknech: ${ws}/start-auditor.sh a ${ws}/start-kapitan.sh"`, ''];
    fs.writeFileSync(path.join(ws, 'start-projekt.sh'), pj.join('\n')); fs.chmodSync(path.join(ws, 'start-projekt.sh'), 0o755);
  } else { try { fs.unlinkSync(path.join(ws, 'start-projekt.sh')); } catch { } }
}
// A-031: otisk spouštěčů (sha256) — schvaluje ho vlastník commitem spolu s nastavením (prisnost.mjs potvrd); neshoda disku se schváleným otiskem = varování + obnova.
try { const { writeFingerprint } = await import('./spoustec.mjs'); writeFingerprint(ws, repo); } catch (e) { console.error(`  ⚠ otisk spouštěčů se nepodařilo zapsat: ${e.message}`); }
console.log('spouštěče auditora a Kapitána zapsány');
