@echo off
chcp 65001 >nul
setlocal
title Novy projekt - zdravy start
where node >nul 2>nul || (echo CHYBI Node.js - nainstaluj: winget install OpenJS.NodeJS.LTS & pause & exit /b 1)
where git  >nul 2>nul || (echo CHYBI Git - nainstaluj: winget install Git.Git & pause & exit /b 1)
node "%~dp0tools\new-project.mjs" %*
echo.
pause
