# SETUP AUDITOR - průvodce nastavením (Windows / PowerShell 5+). Spusť z rozbaleného balíku: powershell -ExecutionPolicy Bypass -File .\setup-auditor.ps1
# Co udělá: 1) zeptá se na cesty, 2) vytvoří workspace auditora + AUDIT/ + git, 3) zapíše settings.json s env a deny pravidly pro TVOJE cesty,
#           4) nainstaluje nástroje (Playwright, axe), 5) nainstaluje stranu Kapitána do repa (skill audit-rezim + hook + gate-check) - jen se souhlasem,
#           6) otestuje brány, 7) vytvoří start-auditor.cmd a start-kapitan.cmd. Nic z toho neběží jako agent - je to jednorázová instalace, kterou spouští vlastník.
param([string]$Repo, [string]$Workspace, [string]$Remote, [string]$Model = 'claude-fable-5-1', [switch]$Yes, [string]$Kapitan = 'ano', [string]$Hygiena = 'ano', [string]$CI = 'ano')
$ErrorActionPreference = 'Stop'
function Ask($q, $default) { if ($Yes) { Write-Host "$q -> $default"; return $default }; $a = Read-Host "$q [$default]"; if ([string]::IsNullOrWhiteSpace($a)) { $default } else { $a } }
function AskYN($q, $default) { if ($Yes) { Write-Host "$q -> $default"; return $default }; $a = (Read-Host "$q  [1] ano   [2] ne   (Enter = $default)").Trim().ToLower(); if ($a -eq '') { return $default }; if ($a -eq '1' -or $a.StartsWith('a')) { 'ano' } else { 'ne' } }
function Posix($p) { $p = (Resolve-Path $p).Path -replace '\\', '/'; if ($p -match '^([A-Za-z]):/(.*)$') { "/$($Matches[1].ToLower())/$($Matches[2])" } else { $p } }
function Need($cmd, $hint) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "CHYBÍ: $cmd - $hint" -ForegroundColor Red; exit 1 } }

Write-Host "`n=== AUDITOR setup ===" -ForegroundColor Cyan
Need node "nainstaluj Node 20+ (winget install OpenJS.NodeJS.LTS)"; Need git "winget install Git.Git"; Need claude "npm i -g @anthropic-ai/claude-code"
$pkg = $PSScriptRoot
$repo = if ($Repo) { $Repo } else { Ask "Cesta k repu aplikace (Kapitán)" "C:\dev\photobone-CRM-2028" }
if (-not (Test-Path $repo)) { Write-Host "Repo neexistuje: $repo" -ForegroundColor Red; exit 1 }
$name = Split-Path $repo -Leaf
$ws = if ($Workspace) { $Workspace } else { Ask "Workspace auditora (vytvoří se)" (Join-Path (Split-Path $repo -Parent) "$name-audit") }
$remote = if ($Remote) { $Remote } elseif ($Yes) { '' } else { Ask "Git remote pro AUDIT workspace (prázdné = jen lokální git; doporučeno soukromý GitHub repo pro práci přes více strojů)" '' }
$model = if ($Yes) { $Model } else { Ask "Model hlavního vlákna auditora (claude-fable-5-1 = nejlepší úsudek; opus; sonnet = levnější)" $Model }

# 1) workspace
New-Item -ItemType Directory -Force -Path $ws | Out-Null
foreach ($d in 'CLAUDE.md','README.md','BRIDGE.md','.claude','checklists','templates','tools','kapitan-side','AUDIT') { Copy-Item -Recurse -Force (Join-Path $pkg $d) $ws }
foreach ($d in 'AUDIT/01_nalezy/momentky','AUDIT/03_dukazy','AUDIT/04_verdikty','AUDIT/bus','AUDIT/.auth') { New-Item -ItemType Directory -Force -Path (Join-Path $ws $d) | Out-Null }
# stav repa PŘED instalací: co bylo změněné/nové už předtím, instalace necommitne (patří to vlastníkovi / auditorovi jako nález)
if (Test-Path (Join-Path $repo '.git')) { $pre = git -C $repo status --porcelain 2>$null; Set-Content (Join-Path $ws 'AUDIT/.pre-install-status.txt') ($pre -join "`n") -Encoding UTF8 }
if (-not (Test-Path (Join-Path $ws 'tools/audit.config.json'))) { Copy-Item (Join-Path $ws 'tools/audit.config.example.json') (Join-Path $ws 'tools/audit.config.json') }
@"
node_modules/
test-results/
playwright-report/
AUDIT/.auth/
AUDIT/_archiv/
build/
tools/node_modules/
"@ | Set-Content (Join-Path $ws '.gitignore') -Encoding UTF8

# 2) settings.json s TVÝMI cestami (env čtou hooky; deny pravidla chrání repo)
$wsP = Posix $ws; $repoP = Posix $repo
node (Join-Path $ws 'tools/write-auditor-settings.mjs') $ws $repo $model; if ($LASTEXITCODE -ne 0) { Write-Host 'Zápis settings auditora selhal' -ForegroundColor Red; exit 1 }

# 3) git
Push-Location $ws
if (-not (Test-Path .git)) { git init -q 2>$null; git config core.autocrlf false; git add -A 2>$null; git -c user.name=auditor -c user.email=auditor@local commit -q -m "auditor workspace init" 2>$null }
if ($remote) { git remote remove origin 2>$null; git remote add origin $remote; Write-Host "Remote nastaven: $remote (první push udělej ručně: git push -u origin main)" }
# 4) nástroje
Push-Location tools; try { npm install --no-audit --no-fund | Out-Null } catch { Write-Host "VAROVÁNÍ: npm install selhal - spusť ručně v $ws\tools" -ForegroundColor Yellow }; try { npx playwright install chromium | Out-Null } catch { Write-Host "VAROVÁNÍ: stažení Chromia selhalo - spusť ručně: npx playwright install chromium" -ForegroundColor Yellow }; Pop-Location
Pop-Location

# 5) strana Kapitána
$k = if ($Yes) { $Kapitan } else { AskYN "Nainstalovat do repa stranu Kapitána (skill audit-rezim + hook kapitan-audit-guard + gate-check v deploy)?" "ano" }
if ($k -eq 'ano') {
  $sk = Join-Path $repo '.claude/skills/audit-rezim'; New-Item -ItemType Directory -Force -Path $sk | Out-Null
  $body = Get-Content (Join-Path $pkg 'kapitan-side/AUDIT_REZIM.md') -Raw
  "---`nname: audit-rezim`ndescription: Závazný audit režim - stop-the-line při otevřených P0/P1 v AUDIT/02_HANDOFF.md, důkazy do AUDIT/03_dukazy, bus komunikace s auditorem, deploy jen po gate-check. Použij při startu každé dávky.`n---`n$body" | Set-Content (Join-Path $sk 'SKILL.md') -Encoding UTF8
  $hk = Join-Path $repo '.claude/hooks'; New-Item -ItemType Directory -Force -Path $hk | Out-Null
  Copy-Item (Join-Path $pkg 'kapitan-side/gate-check.mjs') $hk -Force; Copy-Item (Join-Path $pkg 'kapitan-side/kapitan-audit-guard.js') $hk -Force; Copy-Item (Join-Path $pkg 'kapitan-side/hygiene/hooks-package.json') (Join-Path $hk 'package.json') -Force
  Copy-Item (Join-Path $pkg 'kapitan-side/hygiene/hygiene-rules.js') $hk -Force; Copy-Item (Join-Path $pkg 'kapitan-side/hygiene/hygiene-rules.json') $hk -Force; Copy-Item (Join-Path $pkg 'kapitan-side/hygiene/pre-commit-check.mjs') $hk -Force
  node (Join-Path $ws 'tools/merge-repo-settings.mjs') $repo $ws; if ($LASTEXITCODE -ne 0) { Write-Host 'Sloučení settings Kapitána selhalo' -ForegroundColor Red }
  $cm = Join-Path $repo 'CLAUDE.md'
  if ((Test-Path $cm) -and -not (Select-String -Path $cm -Pattern 'Audit režim' -Quiet)) {
    "`n## Audit režim (závazné)`nExistuje-li ``$wsP/AUDIT/02_HANDOFF.md`` s otevřenými P0/P1 → STOP-THE-LINE: pracuj jen na položkách handoffu v jejich pořadí; deploy zakázán, dokud gate-check neprojde (``node $wsP/kapitan-side/gate-check.mjs``). Detaily: skill ``audit-rezim``. Auditor = jediná brána vydání.`n" | Add-Content $cm -Encoding UTF8
  }
  $h = if ($Yes) { $Hygiena } else { AskYN "Nainstalovat hygienu do repa (pre-commit guard, .gitattributes, .gitignore doplněk)?" "ano" }
  if ($h -eq 'ano') {
    New-Item -ItemType Directory -Force -Path (Join-Path $repo '.git/hooks') | Out-Null
    Copy-Item (Join-Path $pkg 'kapitan-side/hygiene/pre-commit-guard.sh') (Join-Path $repo '.git/hooks/pre-commit') -Force
    if (-not (Test-Path (Join-Path $repo '.gitattributes'))) { Copy-Item (Join-Path $pkg 'kapitan-side/hygiene/gitattributes.template') (Join-Path $repo '.gitattributes') }
    $gi = Join-Path $repo '.gitignore'; if (-not (Test-Path $gi) -or -not (Select-String -Path $gi -Pattern 'hygiena \(auditor\)' -Quiet)) { Get-Content (Join-Path $pkg 'kapitan-side/hygiene/gitignore.addendum') | Add-Content $gi -Encoding UTF8 }
    Write-Host "Hygiena nainstalována (pre-commit guard běží přes Git Bash, který Git for Windows používá pro hooky)."
  }
  $c = if ($Yes) { $CI } else { AskYN "Nainstalovat GitHub Actions workflow auditor-gate (CI brána mimo agenta; vyžaduje chráněnou main + secrets)?" "ano" }
  if ($c -eq 'ano') { New-Item -ItemType Directory -Force -Path (Join-Path $repo '.github/workflows') | Out-Null; Copy-Item (Join-Path $pkg 'kapitan-side/ci/auditor-gate.yml') (Join-Path $repo '.github/workflows/auditor-gate.yml') -Force; if ($Yes) { Write-Host "CI brána (GitHub Actions) nainstalována." } else { Write-Host "CI workflow nainstalován → GitHub: Settings → Branches → protect main → required status check 'auditor-gate'; Secrets: AUDIT_REPO, AUDIT_REPO_TOKEN." -ForegroundColor Yellow } }
  if ($Yes) { Write-Host "Strana Kapitána nainstalována (hook, skill audit-rezim, gate-check)." } else { Write-Host "Strana Kapitána nainstalována. DŮLEŽITÉ: do DEPLOY_SEKVENCE / deploy .bat přidej jako 1. krok:  node $ws\kapitan-side\gate-check.mjs $repo || exit /b 1" -ForegroundColor Yellow }
}

# 6) test bran
$env:AUDITOR_WORKSPACE = $wsP; $env:AUDITOR_TARGET_REPO = $repoP
node (Join-Path $ws 'tools/guard-check.mjs') $ws $repo; if ($LASTEXITCODE -ne 0) { Write-Host "BRÁNA NEFUNGUJE - auditora nespouštěj, pošli tento výpis Claude." -ForegroundColor Red }

# 7) launchery
"@echo off`ntitle AUDITOR - $name`ncd /d `"$ws`"`necho.`necho  AUDITOR - $name.  Uvodni zprava se posle sama. Kdyby zustal radek ^> prazdny, napis:  Zacni intake`necho.`nif `"%~1`"==`"`" (claude --add-dir `"$repo`" `"Zacni intake`") else (claude --add-dir `"$repo`" %*)" | Set-Content (Join-Path $ws 'start-auditor.cmd') -Encoding ASCII
"@echo off`ntitle KAPITAN - $name`ncd /d `"$repo`"`nnode `"$ws\tools\wait-idle.mjs`" `"$repo`" 3 || exit /b 1`necho.`necho  KAPITAN - $name.  Sam si nacte zpravy od auditora. Kdyby zustal radek ^> prazdny, napis:  Nacti zpravy od auditora a pokracuj v praci`necho.`nif `"%~1`"==`"`" (claude --add-dir `"$ws`" `"Nacti zpravy od auditora (bus inbox) a AUDIT/02_HANDOFF.md, pokud existuje; ridi se audit rezimem. Pak pokracuj v bezne praci.`") else (claude --add-dir `"$ws`" %*)" | Set-Content (Join-Path $ws 'start-kapitan.cmd') -Encoding ASCII
$log = Join-Path $ws 'AUDIT\instalace.log'; $notes = @()
if (-not (Get-Command gitleaks -ErrorAction SilentlyContinue)) { $notes += "gitleaks chybí (sken tajemství se přeskočí; instalace: winget install gitleaks)" }
if (-not (Get-Command semgrep -ErrorAction SilentlyContinue)) { $notes += "semgrep chybí (bezpečnostní vzory se přeskočí; instalace: pip install semgrep)" }
$notes += "hook Kapitána spouští gate-check při git push do main/master/production (env PROD_BRANCHES)"
Add-Content $log (("[{0}] setup {1}" -f (Get-Date -Format s), $name) + "`n" + (($notes | ForEach-Object { "  - $_" }) -join "`n")) -Encoding UTF8
if (-not $Yes) { $notes | ForEach-Object { Write-Host "POZN.: $_" -ForegroundColor Yellow } } else { Write-Host "Poznámky pro auditora (chybějící volitelné nástroje apod.): AUDIT\instalace.log" }
if (-not $Yes) { Write-Host "`nHOTOVO. Spusť:  $ws\start-auditor.cmd   (auditor sám začne intake)" -ForegroundColor Green; Write-Host "Kapitán:        $ws\start-kapitan.cmd" }
