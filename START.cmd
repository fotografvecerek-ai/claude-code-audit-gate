@echo off
setlocal
chcp 65001 >nul
title AUDITOR 1.3.0
echo %~dp0 | findstr /i "\\Temp\\ \\AppData\\Local\\Temp" >nul && (
  echo Spoustis to primo ze ZIPu. Nejdriv zip ROZBAL do trvale slozky, napr. C:\dev\_auditor\ a spust START.cmd odtud.
  pause & exit /b 1
)
:menu
cls
echo ==========================================================
echo   AUDITOR 1.3.0 - zdrave projekty a nezavisly audit
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
echo   [4] Napoveda   [5] Samotest bran   [0] Konec
echo.
set "V="
set /p "V=Volba (cislo a Enter): "
if "%V%"=="1" (call "%~dp0auditor\NOVY-PROJEKT.cmd" & goto menu)
if "%V%"=="2" (call "%~dp0auditor\INSTALL.cmd" & goto menu)
if "%V%"=="3" (call "%~dp0auditor\AUDIT-GITHUB.cmd" & goto menu)
if "%V%"=="4" (start notepad "%~dp0NAVOD.txt" & goto menu)
if "%V%"=="5" goto selftest
if "%V%"=="0" exit /b 0
goto menu

:selftest
set "W="
set /p "W=Cesta k workspace auditora (napr. C:\dev\projekt-audit), Enter = test baliku: "
if defined W (pushd "%W%" && node tools\selftest.mjs & popd) else (node "%~dp0auditor\tools\selftest.mjs")
pause
goto menu
