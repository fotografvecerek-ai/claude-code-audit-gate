@echo off
setlocal
chcp 65001 >nul
title AUDITOR v3.9.6.1
echo %~dp0 | findstr /i "\\Temp\\ \\AppData\\Local\\Temp" >nul && (
  echo Spoustis to primo ze ZIPu. Nejdriv zip ROZBAL do trvale slozky, napr. C:\dev\_auditor\ a spust START.cmd odtud.
  pause & exit /b 1
)
:menu
cls
echo ==========================================================
echo   AUDITOR v3.9.6.1 - nezavisly auditni agent pro Claude Code
echo ==========================================================
echo.
echo   [1] Jeden projekt        - zadas cestu (nebo Enter = prohledat disky)
echo   [2] Vice projektu        - prohleda disky + Dokumenty + Stazene,
echo                              ukaze ocislovany seznam, vyberes cisla
echo   [3] Napoveda             - otevre NAVOD.txt
echo   [4] Samotest bran        - overi instalaci (po instalaci)
echo   [0] Konec
echo.
set /p "V=Volba: "
if "%V%"=="1" (call "%~dp0auditor\INSTALL.cmd" & goto menu)
if "%V%"=="2" (call "%~dp0auditor\INSTALL-MULTI.cmd" & goto menu)
if "%V%"=="3" (start notepad "%~dp0NAVOD.txt" & goto menu)
if "%V%"=="4" (
  set /p "W=Cesta k workspace auditora (napr. C:\dev\projekt-audit): "
  pushd "%W%" && node tools\selftest.mjs & popd
  pause & goto menu
)
if "%V%"=="0" exit /b 0
goto menu
