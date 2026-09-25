# PRIPRAVA POCITACE - nainstaluje, co auditor a Kapitan potrebuji: Git, Node.js LTS, Claude Code (volitelne GitHub CLI).
# Pro pocitac, kde jeste nic neni (napr. klient bez Claude). Spousti START.cmd automaticky, kdyz neco chybi. Rucne:
#   powershell -ExecutionPolicy Bypass -File auditor\tools\bootstrap.ps1
param([switch]$BezGh)
$ErrorActionPreference = 'Continue'
function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + (Join-Path $env:USERPROFILE '.local\bin') }
function Ok($t) { Write-Host "  ✅ $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  ⚠ $t" -ForegroundColor Yellow }
Write-Host "`n== Příprava počítače (Git, Node.js, Claude Code)" -ForegroundColor Cyan
$winget = Has winget
if (-not $winget) { Warn 'winget chybí (starší Windows) - otevřu stránky ke stažení, nainstaluj ručně a spusť znovu.' }
$items = @(@('git', 'Git.Git', 'Git', 'https://git-scm.com/download/win'), @('node', 'OpenJS.NodeJS.LTS', 'Node.js LTS', 'https://nodejs.org/'))
if (-not $BezGh) { $items += ,@('gh', 'GitHub.cli', 'GitHub CLI (volitelné)', 'https://cli.github.com/') }
foreach ($i in $items) {
  if (Has $i[0]) { Ok "$($i[2]) už je"; continue }
  if ($winget) { Write-Host "  Instaluji $($i[2])... (může vyskočit okénko Windows - potvrď ho)"; winget install --id $i[1] -e --silent --accept-package-agreements --accept-source-agreements | Out-Null; Refresh-Path }
  if (Has $i[0]) { Ok "$($i[2]) nainstalováno" } else { Warn "$($i[2]) se nepodařilo nainstalovat automaticky - otevírám $($i[3])"; Start-Process $i[3] }
}
if (Has claude) { Ok 'Claude Code už je' } else {
  Write-Host '  Instaluji Claude Code (oficiální instalátor)...'
  try { Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression } catch { Warn "instalátor Claude Code selhal: $_" }
  Refresh-Path
  if (Has claude) { Ok 'Claude Code nainstalováno' } else { Warn 'Claude Code se nepodařilo nainstalovat - návod: https://code.claude.com/docs/en/setup'; Start-Process 'https://code.claude.com/docs/en/setup' }
}
$missing = @('git', 'node', 'claude') | Where-Object { -not (Has $_) }
if ($missing) { Write-Host "`nCHYBÍ: $($missing -join ', '). Po ruční instalaci zavři toto okno a spusť START.cmd znovu." -ForegroundColor Red; exit 1 }
Write-Host "`nHOTOVO: Git $((git --version) -replace 'git version ',''), Node $(node --version), Claude Code $(claude --version 2>$null)" -ForegroundColor Green
Write-Host 'Claude Code se při prvním spuštění zeptá na přihlášení (otevře prohlížeč). Potřebuješ předplatné Claude Pro/Max nebo účet Claude Console.'
Write-Host 'Nově nainstalované programy vidí jen nová okna: START.cmd se teď restartuje sám.'
exit 0
