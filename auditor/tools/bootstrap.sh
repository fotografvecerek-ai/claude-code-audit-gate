#!/usr/bin/env bash
# PRIPRAVA POCITACE (mac/Linux) — Git, Node.js LTS, Claude Code (volitelně GitHub CLI) pro počítač, kde ještě nic není.
# Spouští start.sh automaticky, když něco chybí. Ručně: bash auditor/tools/bootstrap.sh
has(){ command -v "$1" >/dev/null 2>&1; }
ok(){ echo "  ✅ $1"; }; warn(){ echo "  ⚠ $1"; }
export PATH="$HOME/.local/bin:$PATH"
echo; echo "== Příprava počítače (Git, Node.js, Claude Code)"
if [ "$(uname)" = "Darwin" ]; then
  has git || { echo "  Git: macOS nabídne nástroje pro vývojáře — potvrď okénko a po dokončení spusť znovu."; xcode-select --install 2>/dev/null; }
  if ! has node || ! has gh; then
    if ! has brew; then echo "  Instaluji Homebrew (zeptá se na heslo k Macu)..."; /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"; fi
    has node || brew install node; has gh || brew install gh
  fi
elif has apt-get; then
  has git || sudo apt-get install -y git
  has node || { curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs; }
  has gh || sudo apt-get install -y gh 2>/dev/null || warn "GitHub CLI (volitelné) nainstaluj podle https://cli.github.com"
elif has dnf; then
  has git || sudo dnf install -y git; has node || sudo dnf install -y nodejs; has gh || sudo dnf install -y gh
else warn "neznámý systém — Git a Node.js 20+ nainstaluj ručně"; fi
has claude || { echo "  Instaluji Claude Code (oficiální instalátor)..."; curl -fsSL https://claude.ai/install.sh | bash; export PATH="$HOME/.local/bin:$PATH"; }
miss=""; for c in git node claude; do has $c || miss="$miss $c"; done
if [ -n "$miss" ]; then echo; echo "CHYBÍ:$miss — doinstaluj podle hlášek výše a spusť start.sh znovu."; exit 1; fi
echo; echo "HOTOVO: $(git --version), Node $(node --version), Claude Code $(claude --version 2>/dev/null)"
echo "Claude Code se při prvním spuštění zeptá na přihlášení (otevře prohlížeč). Potřebuješ předplatné Claude Pro/Max nebo účet Claude Console."
