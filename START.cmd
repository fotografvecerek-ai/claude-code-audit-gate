@echo off
setlocal
chcp 65001 >nul
title AUDITOR 1.7.0
echo %~dp0 | findstr /i "\\Temp\\ \\AppData\\Local\\Temp" >nul && (
  echo Spoustis to primo ze ZIPu. Nejdriv zip ROZBAL do trvale slozky, napr. C:\dev\_auditor\ a spust START.cmd odtud.
  pause & exit /b 1
)
:kontrola
set "CHYBI="
where node >nul 2>nul || set "CHYBI=%CHYBI% Node.js"
where git >nul 2>nul || set "CHYBI=%CHYBI% Git"
where claude >nul 2>nul || set "CHYBI=%CHYBI% Claude-Code"
if not defined CHYBI goto menu
cls
echo ==========================================================
echo   Na tomto pocitaci chybi:%CHYBI%
echo ==========================================================
echo.
echo   [1] Nainstalovat automaticky (doporuceno) - Git, Node.js, Claude Code
echo   [2] Pokracovat bez toho
echo.
set "I="
set /p "I=Volba (Enter = 1): "
if "%I%"=="2" goto menu
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auditor\tools\bootstrap.ps1"
if errorlevel 1 (pause & goto menu)
echo.
echo Restartuji START, aby videl nove programy...
timeout /t 3 >nul
start "" "%~f0"
exit /b 0
:menu
cls
echo ==========================================================
echo   AUDITOR 1.7.0 - zdrave projekty a nezavisly audit
echo ==========================================================
echo.
echo   Co chces delat?
echo.
echo   [1] Zalozit NOVY projekt        - zdrave nastaveny od zacatku: pravidla,
echo                                     pojistky a kontrola primo v projektu,
echo                                     doporuceno spolu se samostatnym auditorem
echo   [2] Auditovat projekt na DISKU  - rozjety projekt na tomto pocitaci
echo                                     (zadas cestu; Enter = vyhledat na discich
echo                                     a vybrat i vice projektu najednou)
echo   [3] Auditovat GITHUB repo       - jen adresa repa (napr. od klienta);
echo                                     u nej se nic neinstaluje
echo.
echo   ----------------------------------------------------------
echo   [4] Napoveda   [5] Samotest bran   [6] Telegram bot
echo   [7] Samostatnost Kapitana (smi sam spoustet skripty a databazi?)
echo   [8] Codex - auditor nebo Kapitan v OpenAI Codex misto Claude Code   [0] Konec
echo.
set "V="
set /p "V=Volba (cislo a Enter): "
if "%V%"=="1" (call "%~dp0auditor\NOVY-PROJEKT.cmd" & goto menu)
if "%V%"=="2" (call "%~dp0auditor\INSTALL.cmd" & goto menu)
if "%V%"=="3" (call "%~dp0auditor\AUDIT-GITHUB.cmd" & goto menu)
if "%V%"=="4" (start notepad "%~dp0NAVOD.txt" & goto menu)
if "%V%"=="5" goto selftest
if "%V%"=="6" goto telegram
if "%V%"=="7" goto opravneni
if "%V%"=="8" goto codex
if "%V%"=="0" exit /b 0
goto menu

:selftest
set "W="
set /p "W=Cesta k workspace auditora (napr. C:\dev\projekt-audit), Enter = test baliku: "
if defined W (pushd "%W%" && node tools\selftest.mjs & popd) else (node "%~dp0auditor\tools\selftest.mjs")
pause
goto menu

:telegram
set "R="
set /p "R=Cesta k projektu (napr. C:\dev\moje-aplikace), Enter = zpet: "
if not defined R goto menu
for %%I in ("%R%") do set "WS=%%~dpI%%~nxI-audit"
if not exist "%WS%\.claude\settings.json" (echo Auditor u tohoto projektu jeste neni - nejdriv volba [2]. & pause & goto menu)
for %%F in (tools\telegram-setup.mjs tools\telegram-ping.mjs tools\write-launchers.mjs templates\pruvodce_telegram.md) do copy /Y "%~dp0auditor\%%F" "%WS%\%%F" >nul
where claude >nul 2>nul || (echo Claude Code chybi - bez nej pruvodce nepobezi. Spoustim nastroj bez pruvodce. & node "%~dp0auditor\tools\telegram-setup.mjs" --ws "%WS%" --repo "%R%" & pause & goto menu)
echo Otevira se okno pruvodce (Claude) - provede te Telegramem krok za krokem.
start "Pruvodce Telegram" /D "%WS%" cmd /k claude "Jsi ted PRUVODCE, ne auditor v auditu. Precti templates/pruvodce_telegram.md a postupuj podle nej krok za krokem. Repo projektu: %R%"
goto menu
goto menu

:opravneni
set "R="
set /p "R=Cesta k projektu, Enter = zpet: "
if not defined R goto menu
for %%I in ("%R%") do set "WS=%%~dpI%%~nxI-audit"
if not exist "%WS%\.claude\settings.json" (echo Auditor u tohoto projektu jeste neni - nejdriv volba [2]. & pause & goto menu)
node "%~dp0auditor\tools\opravneni.mjs" "%WS%" "%R%" --ask
echo Zavri okno Kapitana a otevri ho znovu ze zastupce - nova pravidla plati od startu.
pause
goto menu

:codex
set "R="
set /p "R=Cesta k projektu, Enter = zpet: "
if not defined R goto menu
set "R=%R:"=%"
if "%R:~-1%"=="\" set "R=%R:~0,-1%"
for %%I in ("%R%") do set "WS=%%~dpI%%~nxI-audit"
if not exist "%WS%\.claude\settings.json" (echo Auditor u tohoto projektu jeste neni - nejdriv volba [2]. & pause & goto menu)
node "%~dp0auditor\tools\codex-setup.mjs" --ws "%WS%" --repo "%R%"
pause
goto menu
