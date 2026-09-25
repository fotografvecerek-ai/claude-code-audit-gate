# AUDIT GITHUB REPA - audit cizího projektu jen z adresy GitHub repa. U klienta se nic neinstaluje a do jeho repa se nic nezapisuje.
# Spouští AUDIT-GITHUB.cmd (START.cmd -> [5]). Ručně: powershell -ExecutionPolicy Bypass -File .\audit-github.ps1 https://github.com/firma/aplikace
param([string]$Url, [string]$Base, [string]$Branch)
$ErrorActionPreference = 'Continue'
$pkg = $PSScriptRoot
Write-Host "`n== Audit GitHub repa (u klienta se nic neinstaluje)" -ForegroundColor Cyan
if (-not $Url) { $Url = (Read-Host "Adresa repa (např. https://github.com/firma/aplikace)").Trim() }
if (-not $Url) { Write-Host "Nic nezadáno."; exit 1 }
if (-not $Base) { $Base = Join-Path $env:USERPROFILE 'audity' }
$args2 = @($Url, '--base', $Base); if ($Branch) { $args2 += '--branch', $Branch }
$json = node (Join-Path $pkg 'tools\remote-clone.mjs') @args2
if ($LASTEXITCODE -ne 0 -or -not $json) { Write-Host "Repo se nepodařilo stáhnout (viz výše). Soukromé repo: klient tě musí přizvat jako spolupracovníka (stačí Read) a ty musíš mít přihlášené GitHub CLI (gh auth login)." -ForegroundColor Red; exit 1 }
$r = $json | ConvertFrom-Json
Write-Host "  kopie repa: $($r.repo)  (větev $($r.branch), commit $($r.commit))" -ForegroundColor Green
$ws = Join-Path (Split-Path $r.repo -Parent) "$($r.name)-audit"
if (Test-Path (Join-Path $ws '.claude\settings.json')) { node (Join-Path $pkg 'tools\update-install.mjs') $r.repo $ws; Write-Host "  Kód klienta stažen znovu (commit $($r.commit)). Napiš auditorovi: Repo aktualizováno, zkontroluj změny." -ForegroundColor Green; Start-Process cmd.exe -ArgumentList '/k', "`"$ws\start-auditor.cmd`""; exit 0 }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pkg 'setup-auditor.ps1') -Repo $r.repo -Workspace $ws -Yes -Model 'best' -Kapitan ne -Hygiena ne -CI ne
if ($LASTEXITCODE -ne 0) { Write-Host "Instalace auditora selhala." -ForegroundColor Red; exit 1 }
# režim vzdáleného auditu: auditor ví, že Kapitán není a výstup je pro klienta
$remote = [ordered]@{ url = $r.url; branch = $r.branch; commit = $r.commit; stazeno = (Get-Date).ToString('s'); klon = $r.repo }
node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(JSON.parse(process.argv[2]), null, 2))" (Join-Path $ws 'AUDIT\.remote.json') ($remote | ConvertTo-Json -Compress)
"@echo off`r`nnode `"$pkg\tools\remote-clone.mjs`" `"$($r.url)`" --base `"$Base`" --branch $($r.branch) && echo Kopie repa aktualizovana. Napis auditorovi: Repo aktualizovano, zkontroluj zmeny.`r`npause" | Set-Content (Join-Path $ws 'aktualizovat-repo.cmd') -Encoding ASCII
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pkg 'post-install.ps1') -Repo $r.repo -Workspace $ws -NoGitHub -NoRepoTouch -NoLaunch
Write-Host "`n================ HOTOVO: audit $($r.url) ================" -ForegroundColor Green
Write-Host "  Auditor pracuje nad kopií repa v $($r.repo) - klientovi se nic neinstaluje ani nemění."
Write-Host "  Výstup pro klienta: $ws\AUDIT\ZPRAVA.html (lidsky), 02_HANDOFF.md (zadání pro jeho vývojáře/agenta), STATISTIKA.html."
Write-Host "  Nová verze kódu od klienta: poklepej na $ws\aktualizovat-repo.cmd"
Start-Process cmd.exe -ArgumentList '/k', "`"$ws\start-auditor.cmd`""
Write-Host "  Auditor se otevírá v novém okně a sám začne intake." -ForegroundColor Green
