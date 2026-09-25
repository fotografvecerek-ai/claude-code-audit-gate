# INSTALL-MULTI - průvodce pro více projektů: posoudí (triage) → doporučí profil → potvrdíš → nainstaluje projekt po projektu.
# Spouští INSTALL-MULTI.cmd. Ručně: powershell -ExecutionPolicy Bypass -File .\install-multi.ps1 C:\dev  (nebo více cest)
param([Parameter(ValueFromRemainingArguments)][string[]]$Paths)
$ErrorActionPreference = 'Continue'
$pkg = $PSScriptRoot
if (-not $Paths -or $Paths.Count -eq 0) {
  $Paths = @('--scan'); Write-Host "Bez zadané cesty prohledám lokální disky + Dokumenty + Stažené soubory + Plochu (sken pár minut, pak posouzení; průběh se vypisuje)." -ForegroundColor Yellow
  $net = @(); try { $net = @(Get-CimInstance Win32_LogicalDisk -ErrorAction Stop | Where-Object { $_.DriveType -eq 4 } | ForEach-Object { $_.DeviceID }) } catch { }
  if ($net.Count) { Write-Host "Síťové disky ($($net -join ', ')) se nepřohledávají (pomalé). Projekt z nich zadej přes START → [1] cestou." -ForegroundColor Yellow }
}
Write-Host "`n== Posouzení projektů (nic se nemění)" -ForegroundColor Cyan
$desk = [Environment]::GetFolderPath('Desktop'); if (-not $desk) { $desk = $pkg }
$report = Join-Path $desk ("Auditor_pruzkum_{0}.html" -f (Get-Date -Format 'yyyy-MM-dd_HHmm'))
$json = node (Join-Path $pkg 'tools\triage.mjs') @Paths --json --html $report | Out-String
if (-not $json) { Write-Host "Triage selhala nebo nenašla žádné git repo." -ForegroundColor Red; exit 1 }
$items = $json | ConvertFrom-Json
if (-not $items) { Write-Host "Žádná git repa v zadaných cestách." -ForegroundColor Red; exit 1 }
Write-Host "`nHTML report: $report (otevírám v prohlížeči)" -ForegroundColor Cyan; try { Start-Process $report } catch { }
$cnt = @{}; foreach ($it in $items) { $cnt[$it.profile] = 1 + [int]$cnt[$it.profile] }
Write-Host ("`n== Nalezené projekty: {0}   (PLNY {1}, LEHKY {2}, JEN_AUDIT {3}, PRESKOCIT {4} = cizi/nastrojova repa, na konci seznamu)" -f $items.Count, [int]$cnt['PLNY'], [int]$cnt['LEHKY'], [int]$cnt['JEN_AUDIT'], [int]$cnt['PRESKOCIT']) -ForegroundColor Cyan
Write-Host "     #  nazev                      posl. zmena  profil     git       umisteni"
for ($i = 0; $i -lt $items.Count; $i++) { $it = $items[$i]; Write-Host ("  {0,2}. {1,-26} {2,-12} {3,-10} {4,-9} {5}" -f ($i + 1), $it.name, ($(if ($it.git.last) { $it.git.last } else { '-' })), $it.profile, ($(if ($it.noGit) { 'BEZ-GITU' } else { 'git' })), $it.repo) }
function Find-Vyber($since) {
  $dirs = @(); try { $d = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction Stop).'{374DE290-123F-4565-9164-39C4925E467B}'; if ($d) { $dirs += [Environment]::ExpandEnvironmentVariables($d) } } catch { }
  $home2 = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }; foreach ($n in 'Downloads', 'Stažené soubory', 'Stažené') { $dirs += (Join-Path $home2 $n) }; $dirs += $desk, $pkg
  $f = $dirs | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object { Get-ChildItem $_ -Filter 'Auditor_vyber*.json' -File -ErrorAction SilentlyContinue } | Where-Object { $_.LastWriteTime -gt $since } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($f) { try { $j = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json; if ($j.vyber) { Write-Host "  načten výběr z $($f.FullName) ($(@($j.vyber).Count) projektů)" -ForegroundColor Green; return @($j.vyber) } } catch { Write-Host "  soubor $($f.FullName) nejde přečíst: $_" -ForegroundColor Yellow } }
  return $null
}
$t0 = Get-Date; $fromHtml = $null; $nums = $null
for ($try = 0; $try -lt 3; $try++) {
  Write-Host "`nVÝBĚR: buď v otevřeném HTML zaškrtni projekty a klikni 'Uložit výběr', pak sem stiskni Enter" -ForegroundColor Cyan
  Write-Host "       nebo sem napiš čísla projektů (např. 1 3 5, nebo 'vse')." -ForegroundColor Cyan
  $sel = Read-Host "Čísla / Enter"
  if ([string]::IsNullOrWhiteSpace($sel)) { $fromHtml = Find-Vyber $t0; if ($fromHtml) { break }; Write-Host "  Nenašel jsem nový soubor Auditor_vyber.json ve Stažených. Klikni v HTML na 'Uložit výběr' (prohlížeč ho může chtít potvrdit) a zkus Enter znovu, nebo napiš čísla." -ForegroundColor Yellow; continue }
  $nums = if ($sel.Trim() -eq 'vse') { 1..$items.Count } else { $sel -split '[\s,;]+' | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ } | Where-Object { $_ -ge 1 -and $_ -le $items.Count } }
  if ($nums) { break }; Write-Host "  žádné platné číslo (1-$($items.Count))" -ForegroundColor Yellow
}
if (-not $nums -and -not $fromHtml) { Write-Host "nic nevybráno"; exit 0 }
$plan = @(); $port = 3100
if ($fromHtml) {
  foreach ($v in $fromHtml) {
    $it = $items | Where-Object { $_.repo -eq $v.repo } | Select-Object -First 1
    if (-not $it -and $v.n -ge 1 -and $v.n -le $items.Count) { $it = $items[$v.n - 1] }
    if (-not $it) { Write-Host "  $($v.repo): není v aktuálním seznamu (starý výběr?) - přeskakuji" -ForegroundColor Yellow; continue }
    $prof = "$($v.profile)".Trim().ToUpper(); if ($prof -notin 'PLNY', 'LEHKY', 'JEN_AUDIT') { $prof = if ($it.profile -eq 'PRESKOCIT') { 'JEN_AUDIT' } else { $it.profile } }
    $plan += [pscustomobject]@{ repo = $it.repo; name = $it.name; profile = $prof; github = $it.github; port = $port; dirty = $it.git.dirty; noGit = [bool]$it.noGit }; $port++
  }
} else {
  foreach ($n in $nums) {
    $it = $items[$n - 1]; $prof = if ($it.profile -eq 'PRESKOCIT') { 'JEN_AUDIT' } else { $it.profile }
    $plan += [pscustomobject]@{ repo = $it.repo; name = $it.name; profile = $prof; github = $it.github; port = $port; dirty = $it.git.dirty; noGit = [bool]$it.noGit }; $port++
  }
}
if (-not $plan) { Write-Host "nic nevybráno"; exit 0 }
Write-Host "`n== Plán" -ForegroundColor Cyan
$plan | ForEach-Object { Write-Host ("  {0,-28} {1,-10} port {2}{3}" -f $_.name, $_.profile, $_.port, $(if ($_.noGit) { '  (založí se git repo)' } else { '' })) }
Write-Host "(profil = doporučení z posouzení; PLNY = Fable 5.1, LEHKY = Opus, JEN_AUDIT = Sonnet, do projektu se nesahá). Instaluji..." -ForegroundColor Cyan
$summary = @(); $launch = @()
foreach ($p in $plan) {
  if ($p.profile -eq 'PRESKOCIT') { $summary += "$($p.name): přeskočeno"; continue }
  if ($p.noGit) { node (Join-Path $pkg 'tools\git-init-project.mjs') $p.repo; if ($LASTEXITCODE -ne 0) { $summary += "$($p.name): git init selhal (velké soubory?)"; continue }; $p.dirty = 0 }
  if ($p.dirty -gt 0) { Write-Host "`n$($p.name): $($p.dirty) souborů není uložených v gitu - to je v pořádku, instaluji dál; tvoje soubory se nemění a auditor to zapíše jako první nález." -ForegroundColor Yellow }
  $ws = Join-Path (Split-Path $p.repo -Parent) "$($p.name)-audit"
  if (Test-Path (Join-Path $ws '.claude\settings.json')) { node (Join-Path $pkg 'tools\update-install.mjs') $p.repo $ws; $summary += "$($p.name): $(if ($LASTEXITCODE -eq 0) { 'AKTUALIZOVÁNO (rozjetý audit zůstává)' } else { 'CHYBA aktualizace' })"; continue }
  Write-Host "`n================ $($p.name) → $($p.profile) ================" -ForegroundColor Green
  switch ($p.profile) {
    'PLNY'      { $k = 'ano'; $h = 'ano'; $c = if ($p.github) { 'ano' } else { 'ne' }; $m = 'best' }
    'LEHKY'     { $k = 'ano'; $h = 'ano'; $c = 'ne'; $m = 'opus' }
    'JEN_AUDIT' { $k = 'ne';  $h = 'ne';  $c = 'ne'; $m = 'sonnet' }
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pkg 'setup-auditor.ps1') -Repo $p.repo -Workspace $ws -Yes -Model $m -Kapitan $k -Hygiena $h -CI $c
  if ($LASTEXITCODE -ne 0) { $summary += "$($p.name): CHYBA v průvodci"; continue }
  $extra = @('-Port', $p.port); if ($c -eq 'ne') { $extra += '-NoGitHub' }; if ($p.profile -eq 'JEN_AUDIT') { $extra += '-NoRepoTouch' }
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pkg 'post-install.ps1') -Repo $p.repo -Workspace $ws -NoLaunch @extra
  $summary += "$($p.name): $($p.profile) → $ws (port $($p.port))"; $launch += $ws
}
Write-Host "`n================ SOUHRN ================" -ForegroundColor Green
$summary | ForEach-Object { Write-Host "  $_" }
Write-Host "`nKapitán každého projektu už auditora vidí automaticky; vydání hlídá hook + gate-check v deploy skriptech. Auditor se otevře sám (níže)." -ForegroundColor Cyan
Write-Host "Aktualizace balíku: spusť tento průvodce znovu - workspace doplní, AUDIT/ (nálezy, verdikty) zůstane."
if ($launch.Count) {
  Write-Host "`nPokud ti v některém projektu běží starý Kapitán: do jeho okna vlož (Ctrl+V) zprávu ze schránky - dokončí, uloží a ukončí se." -ForegroundColor Yellow
  try { Set-Clipboard -Value "Auditor byl nainstalován. Dokonči jen rozdělanou položku (nic nového nezačínej), ulož práci do gitu (git add + commit + push), napiš mi jednou větou, kde jsi skončil, a ukonči session (/exit). Příště tě spustím znovu - nová session má napojení na auditora." } catch { }
  foreach ($w in $launch) { Start-Process cmd.exe -ArgumentList '/k', "`"$w\start-auditor.cmd`"" }; Write-Host "`n  Auditoři se otevírají v nových oknech ($($launch.Count)) a sami začnou intake. Kapitány spouštěj zástupcem na ploše (počkají na starého)." -ForegroundColor Green
}
