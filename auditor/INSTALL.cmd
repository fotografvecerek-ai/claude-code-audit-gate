@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title AUDITOR - instalace
echo ==========================================================
echo   AUDITOR - instalace na jedno kliknuti
echo   Zepta se jen na cestu k repu aplikace. Zbytek nastavi sam.
echo ==========================================================
echo.
where node >nul 2>nul || (echo CHYBI Node.js - nainstaluj: winget install OpenJS.NodeJS.LTS & pause & exit /b 1)
where git  >nul 2>nul || (echo CHYBI Git - nainstaluj: winget install Git.Git & pause & exit /b 1)
where claude >nul 2>nul || (echo CHYBI Claude Code - nainstaluj: npm i -g @anthropic-ai/claude-code & pause & exit /b 1)
where gh >nul 2>nul || echo Pozn.: gh CLI neni nainstalovane - GitHub kroky (secrets, chranena main) se preskoci. Doporuceno: winget install GitHub.cli ^&^& gh auth login
echo.
set "REPO=%~1"
if "%REPO%"=="" set /p "REPO=Cesta k projektu (Enter = nevim, prohledat disky): "
if "%REPO%"=="" (call "%~dp0INSTALL-MULTI.cmd" & exit /b)
set "REPO=%REPO:"=%"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"
if not exist "%REPO%\" (echo Slozka "%REPO%" neexistuje. & pause & exit /b 1)
if not exist "%REPO%\.git" (
  echo Slozka neni git repo - zakladam ho ^(jen .gitignore + prvni ulozeni, nic se nemaze^). Auditor git potrebuje.
  node "%~dp0tools\git-init-project.mjs" "%REPO%" || (pause & exit /b 1)
)
for %%I in ("%REPO%") do set "WS=%%~dpI%%~nxI-audit"
if exist "%WS%\.claude\settings.json" (
  echo Auditor je u tohoto projektu uz nainstalovany - jen aktualizuji nastaveni, rozjety audit zustava.
  node "%~dp0tools\update-install.mjs" "%REPO%" "%WS%"
  echo.
  pause
  exit /b
)
echo.
echo Repo:      %REPO%
echo Workspace: %WS%
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-auditor.ps1" -Repo "%REPO%" -Workspace "%WS%" -Yes
if errorlevel 1 (echo. & echo Pruvodce skoncil chybou - viz vyse. & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0post-install.ps1" -Repo "%REPO%" -Workspace "%WS%"
echo.
pause
