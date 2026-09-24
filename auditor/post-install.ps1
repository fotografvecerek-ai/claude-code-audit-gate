# POST-INSTALL - automatizuje vše po průvodci, co jde: config testů, .env.audit šablona, deploy wrapper, commit instalace do repa,
# GitHub (jen když je `gh` přihlášené): soukromé audit repo + push, deploy klíč, secrets AUDIT_REPO/AUDIT_SSH_KEY, chráněná main s auditor-gate.
# Volá ho INSTALL.cmd. Ručně: powershell -ExecutionPolicy Bypass -File .\post-install.ps1 -Repo C:\dev\app -Workspace C:\dev\app-audit
param([Parameter(Mandatory)][string]$Repo, [Parameter(Mandatory)][string]$Workspace, [int]$Port = 3100, [switch]$NoGitHub, [switch]$NoRepoTouch, [switch]$NoLaunch)
$ErrorActionPreference = 'Continue'
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  ✅ $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  ⚠ $t" -ForegroundColor Yellow }
$name = Split-Path $Repo -Leaf
$todo = @()

Step "Konfigurace testů (obrazovky z routeru)"
node (Join-Path $Workspace 'tools\gen-config.mjs') $Repo --port $Port 2>&1 | ForEach-Object { "  $_" }

Step ".env.audit (testovací prostředí)"
$envA = Join-Path $Workspace 'AUDIT\.auth\.env.audit'
if (-not (Test-Path $envA)) { (Get-Content (Join-Path $Workspace 'templates\env.audit.example') -Raw) -replace 'localhost:3100', "localhost:$Port" | Set-Content $envA -Encoding UTF8; Warn "připravena šablona $envA (testovací databáze a účty - auditor si o ně řekne, až je bude potřebovat; nikdy produkční)"; $todo += "Testovací prostředí: auditor si řekne o testovací databázi a účty, až je bude potřebovat (šablona: $envA). Do té doby audituje kód a repo." } else { Ok "existuje" }

Step "Deploy skripty v projektu"
$patched = @()
if (-not $NoRepoTouch) {
  # nejdřív úklid po starších verzích balíku (v3.8.1/3.9 vkládaly gate-check do příliš mnoha skriptů): vložené řádky mají značku, odstraní se přesně
  node (Join-Path $Workspace 'tools\unpatch-deploy.mjs') $Repo 2>&1 | Where-Object { $_ -notlike 'UNPATCHED *' } | ForEach-Object { "  $_" }
  $cands = @(node (Join-Path $Workspace 'tools\patch-deploy.mjs') $Repo $Workspace --list 2>&1 | Where-Object { $_ -like 'KANDIDAT *' } | ForEach-Object { $_.Substring(9) })
  $log = Join-Path $Workspace 'AUDIT\instalace.log'; Add-Content $log ("[{0}] deploy skripty kandidáti ({1}): {2}" -f (Get-Date -Format s), $cands.Count, ($cands -join ', ')) -Encoding UTF8
  if ($cands.Count) { Ok "nalezeno $($cands.Count) deploy skriptů - které z nich dostanou gate-check, rozhodne auditor v handoffu (seznam: AUDIT\instalace.log)" } else { Ok "deploy skripty podle názvu nenalezeny; vydání hlídá hook Kapitána (vercel, git push)" }
}

Step "Deploy wrapper s gate-checkem"
$dw = Join-Path $Workspace 'deploy-with-gate.cmd'
"@echo off`r`nnode `"$Workspace\kapitan-side\gate-check.mjs`" `"$Repo`" || exit /b 1`r`ncd /d `"$Repo`"`r`n%*" | Set-Content $dw -Encoding ASCII
Ok "$dw  (použití: deploy-with-gate.cmd vercel --prod  - nebo vlož první řádek do svého deploy .bat)"

$appBranch = 'main'
if (-not $NoRepoTouch) {
Step "Commit instalace do repa aplikace"
Push-Location $Repo
# Do gitu jen soubory instalace: (a) v instalačních cestách, (b) NEbyly změněné/nové/připravené už před instalací. Index (staged) uživatele se nemění.
$preF = Join-Path $Workspace 'AUDIT\.pre-install-status.txt'; $preDirty = @(); $left = @()
if (Test-Path $preF) { $preDirty = Get-Content $preF | Where-Object { $_ } | ForEach-Object { $_.Substring(3).Trim().Trim('"') -replace '\\', '/' } }
$paths = @(@('.claude', '.github', '.gitattributes', '.gitignore', 'CLAUDE.md') + $patched) | Where-Object { Test-Path $_ }
$cand = @(); if ($paths) { $cand = @(git status --porcelain --untracked-files=all -- @paths 2>$null | Where-Object { $_ } | ForEach-Object { $_.Substring(3).Trim().Trim('"') }) }
$ours = @(); foreach ($f in $cand) { if ($preDirty -contains $f) { $left += $f } else { $ours += $f } }
if ($ours) { git add -- @ours 2>&1 | Out-Null; git commit -q -m "chore(audit): instalace auditora (hooky, skill audit-rezim, CI brána, hygiena)" -- @ours 2>&1 | ForEach-Object { "  $_" }; if ($LASTEXITCODE -eq 0) { Ok "do gitu uloženo $($ours.Count) souborů instalace" } else { Warn "commit instalace neprošel (viz výše) - soubory jsou na disku, do gitu je uloží Kapitán v audit režimu"; $todo += "Commit souborů instalace v repu (Kapitán)." } } else { Ok "nic nového ke commitu" }
if ($left) { Warn "neuloženo do gitu (měl jsi v nich rozdělané změny už před instalací, nechávám je tobě): $($left -join ', ')" }
$dirtyN = @(git status --porcelain | Where-Object { $_ }).Count
if ($dirtyN -gt 0) { Warn "v projektu zůstává $dirtyN souborů, které nejsou uložené v gitu (bylo to tak už před instalací). Nic s tím dělat nemusíš - auditor to zapíše jako první nález a navrhne, co z toho patří do gitu a co ne." }
$appBranch = git rev-parse --abbrev-ref HEAD
Pop-Location
}

Step "GitHub automatizace (gh CLI)"
$gh = Get-Command gh -ErrorAction SilentlyContinue
$ghOk = $false; if ($gh) { gh auth status 2>&1 | Out-Null; $ghOk = ($LASTEXITCODE -eq 0) }
if ($NoGitHub -or $NoRepoTouch) { Warn "GitHub kroky vynechány (profil bez CI / jen audit)."; $ghOk = $false; if ($NoRepoTouch) { $todo = @() } }
elseif (-not $ghOk) {
  Warn "gh CLI není nainstalované/přihlášené (winget install GitHub.cli; gh auth login). GitHub kroky přeskakuji."
  $todo += "GitHub ručně: soukromé repo pro workspace + push; Settings → Branches → protect '$appBranch' (status check 'auditor-gate', no force push); Secrets AUDIT_REPO a AUDIT_REPO_TOKEN (read-only PAT)."
} else {
  Push-Location $Repo
  $appFull = (gh repo view --json nameWithOwner -q .nameWithOwner 2>$null)
  Pop-Location
  if (-not $appFull) { Warn "repo aplikace nemá GitHub remote - přidej ho a spusť post-install znovu."; $todo += "Nastav GitHub remote repa aplikace a spusť post-install.ps1 znovu." }
  else {
    $owner = $appFull.Split('/')[0]; $auditFull = "$owner/$name-audit"
    Push-Location $Workspace
    $hasRemote = (git remote 2>$null) -contains 'origin'
    if (-not $hasRemote) {
      gh repo view $auditFull 2>&1 | Out-Null
      if ($LASTEXITCODE -ne 0) { gh repo create $auditFull --private --description "Auditor workspace pro $name" 2>&1 | ForEach-Object { "  $_" } }
      git remote add origin "https://github.com/$auditFull.git" 2>$null
    }
    git branch -M main 2>$null
    git config core.autocrlf false 2>$null; git add -A 2>$null; git -c user.name=auditor -c user.email=auditor@local commit -q -m "chore: post-install" 2>$null
    git push -u origin main 2>&1 | ForEach-Object { "  $_" }; if ($LASTEXITCODE -eq 0) { Ok "workspace pushnut → $auditFull" } else { Warn "push workspace selhal - zkontroluj přístup" }
    Pop-Location
    # deploy klíč (read-only) pro CI checkout audit repa + secrets v repu aplikace
    $keyFile = Join-Path $env:TEMP "auditor_deploy_key_$name"
    if (Test-Path $keyFile) { Remove-Item $keyFile, "$keyFile.pub" -Force -ErrorAction SilentlyContinue }
    ssh-keygen -t ed25519 -N '""' -q -C "auditor-gate" -f $keyFile 2>&1 | Out-Null
    if (Test-Path "$keyFile.pub") {
      gh repo deploy-key add "$keyFile.pub" -R $auditFull --title "auditor-gate ($appFull)" 2>&1 | ForEach-Object { "  $_" }
      Get-Content $keyFile -Raw | gh secret set AUDIT_SSH_KEY -R $appFull 2>&1 | ForEach-Object { "  $_" }
      gh secret set AUDIT_REPO -R $appFull -b $auditFull 2>&1 | ForEach-Object { "  $_" }
      Remove-Item $keyFile, "$keyFile.pub" -Force -ErrorAction SilentlyContinue
      Ok "secrets AUDIT_REPO + AUDIT_SSH_KEY nastaveny v $appFull"
    } else { Warn "ssh-keygen selhal - nastav AUDIT_REPO_TOKEN (PAT) ručně"; $todo += "Secrets: AUDIT_REPO=$auditFull, AUDIT_REPO_TOKEN=read-only PAT." }
    # push instalace do repa aplikace (CI workflow musí být na GitHubu) + ochrana větve
    Push-Location $Repo
    git push 2>&1 | ForEach-Object { "  $_" }; if ($LASTEXITCODE -eq 0) { Ok "instalace pushnuta do $appFull ($appBranch)" } else { Warn "push do repa selhal (chráněná větev? pushni ručně)"; $todo += "git push v repu aplikace." }
    Pop-Location
    $defBranch = (gh repo view $appFull --json defaultBranchRefName -q .defaultBranchRefName 2>$null); if (-not $defBranch) { $defBranch = $appBranch }
    $body = @{ required_status_checks = @{ strict = $true; contexts = @('auditor-gate') }; enforce_admins = $true; required_pull_request_reviews = $null; restrictions = $null; allow_force_pushes = $false; allow_deletions = $false } | ConvertTo-Json -Depth 5
    $tmp = Join-Path $env:TEMP 'bp.json'; Set-Content $tmp $body -Encoding UTF8
    gh api -X PUT "repos/$appFull/branches/$defBranch/protection" --input $tmp 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Ok "větev $defBranch chráněna: status check 'auditor-gate', bez force push, platí i pro adminy" }
    else { Warn "ochranu větve $defBranch na GitHubu nejde nastavit automaticky (soukromé repo na Free plánu to neumí). Nevadí: vydání hlídá hook Kapitána a CI. Kdybys chtěl i ochranu na GitHubu: Settings → Rules → New ruleset pro $defBranch, required check 'auditor-gate'." }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

Step "Zástupci na ploše"
try { $wsh = New-Object -ComObject WScript.Shell; $desk = [Environment]::GetFolderPath('Desktop')
  foreach ($pair in @(@("Auditor - $name", 'start-auditor.cmd'), @("Kapitan - $name", 'start-kapitan.cmd'))) { $lnk = $wsh.CreateShortcut((Join-Path $desk "$($pair[0]).lnk")); $lnk.TargetPath = 'cmd.exe'; $lnk.Arguments = "/k `"$Workspace\$($pair[1])`""; $lnk.WorkingDirectory = $Workspace; $lnk.IconLocation = 'shell32.dll,137'; $lnk.Save() }
  Ok "na ploše: 'Auditor - $name' a 'Kapitan - $name' (Kapitán počká, dokud v projektu běží starý)" } catch { Warn "zástupce se nepodařilo vytvořit: $_" }

Step "Přístup Claude Code ke složkám (bez dialogu při prvním startu)"
node (Join-Path $Workspace 'tools\trust-folders.mjs') $Workspace $Repo 2>&1 | ForEach-Object { "  $_" }

Step "Samotest (kontrola, že brány fungují)"
Push-Location $Workspace; $st = node tools\selftest.mjs 2>&1; $stOk = ($LASTEXITCODE -eq 0); Pop-Location
$st | Select-String -Pattern '^FAIL|/\d+ PASS|^Error|Command failed' | ForEach-Object { "  $_" }
if ($stOk) { Ok "samotest v pořádku" } else { Write-Host "  ❌ SAMOTEST NEPROŠEL - auditora zatím nespouštěj. Zkopíruj celý tento výpis a pošli ho Claude, opraví to." -ForegroundColor Red }

Write-Host "`n================ HOTOVO: $name ================" -ForegroundColor Green
Write-Host "CO SE STALO (nic z toho nemusíš dělat ručně):" -ForegroundColor Cyan
Write-Host "  - Auditor je nainstalovaný v  $Workspace  a za chvíli se sám otevře a začne intake (ptá se lidsky; odpovídáš)."
Write-Host "  - Kapitán (tvůj projektový agent) už auditora vidí automaticky, ať ho spustíš jakkoliv (nastavení projektu) - při startu dostane jeho zprávy."
Write-Host "  - Vydání hlídá hook Kapitána (vercel, git push do main)$(if ($patched.Count) { ' a gate-check v: ' + ($patched -join ', ') } else { '; gate-check do deploy skriptů navrhne auditor v handoffu' })."
Write-Host "    Ruční deploy: $dw <tvůj příkaz>"
Write-Host "`nMUSÍŠ NĚCO VYPNOUT? Ne. Jen pokud ti teď běží Kapitán (Claude Code v projektu), ZAVŘI HO A SPUSŤ ZNOVU - nové pojistky" -ForegroundColor Yellow
Write-Host "a zprávy od auditora se načítají jen při startu. Během auditu může Kapitán normálně pracovat; auditor pracuje na vlastní kopii." -ForegroundColor Yellow
if ($todo.Count) { Write-Host "`nCO SE NEPODAŘILO UDĚLAT AUTOMATICKY (můžeš nechat na později, auditor ti připomene):" -ForegroundColor Yellow; $i = 1; foreach ($t in $todo) { Write-Host "  $i. $t"; $i++ } }
Write-Host "`nPozn.: pokud na GitHubu uvidíš červený běh 'auditor-gate', je to správně - zezelená, až auditor povolí vydání."
$oldMsg = "Auditor byl nainstalován. Dokonči jen rozdělanou položku (nic nového nezačínej), ulož práci do gitu (git add + commit + push), napiš mi jednou větou, kde jsi skončil, a ukonči session (/exit). Příště tě spustím znovu - nová session má napojení na auditora."
if ($stOk -and -not $NoLaunch) {
  Write-Host "`nBĚŽÍ TI TEĎ KAPITÁN V TOMTO PROJEKTU?" -ForegroundColor Yellow
  Write-Host "  Do běžícího okna nejde zvenku psát. Zpráva pro něj je ve SCHRÁNCE: přepni do jeho okna, Ctrl+V, Enter." -ForegroundColor Yellow
  Write-Host "  (Text: $oldMsg)"
  try { Set-Clipboard -Value $oldMsg } catch { }
  Start-Process cmd.exe -ArgumentList '/k', "`"$Workspace\start-auditor.cmd`""; Write-Host "`n  Auditor se otevírá v novém okně a sám začne intake - odpovídej mu lidsky." -ForegroundColor Green
  Start-Process cmd.exe -ArgumentList '/k', "`"$Workspace\start-kapitan.cmd`""; Write-Host "  Kapitán se otevírá v druhém okně; pokud v projektu ještě běží starý, počká 3 min klidu (Enter = spustit hned)." -ForegroundColor Green
}
