@echo off
setlocal
chcp 65001 >nul
title AUDITOR - vice projektu
echo ==========================================================
echo   AUDITOR - pruvodce pro vice projektu
echo   1) posoudi kazdy projekt  2) doporuci profil  3) nainstaluje
echo   Bez parametru prohleda VSECHNY lokalni disky + Dokumenty + Stazene soubory + Plochu.
echo   Nebo: INSTALL-MULTI.cmd C:\dev  (jen tato slozka)
echo ==========================================================
echo.
where node >nul 2>nul || (echo CHYBI Node.js - winget install OpenJS.NodeJS.LTS & pause & exit /b 1)
where git  >nul 2>nul || (echo CHYBI Git - winget install Git.Git & pause & exit /b 1)
where claude >nul 2>nul || (echo CHYBI Claude Code - npm i -g @anthropic-ai/claude-code & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-multi.ps1" %*
echo.
pause
