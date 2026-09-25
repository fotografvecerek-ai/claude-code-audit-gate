#!/usr/bin/env bash
# START (mac/Linux) — rozcestník jako START.cmd
D="$(cd "$(dirname "$0")" && pwd)"
miss=""; for c in node git claude; do command -v $c >/dev/null || miss="$miss $c"; done
if [ -n "$miss" ]; then echo "Na tomto počítači chybí:$miss"; read -r -p "[1] Nainstalovat automaticky (doporučeno)  [2] Pokračovat bez toho  (Enter = 1): " i; [ "${i:-1}" = "1" ] && bash "$D/auditor/tools/bootstrap.sh" && export PATH="$HOME/.local/bin:$PATH"; fi
while true; do
  echo; echo "AUDITOR 1.7.0 — co chceš dělat?"
  echo "  [1] Založit NOVÝ projekt       — zdravě od začátku (pravidla, pojistky, kontrola v projektu; doporučeno + samostatný auditor)"
  echo "  [2] Auditovat projekt na DISKU — zadáš cestu; Enter = vyhledat a vybrat i více projektů"
  echo "  [3] Auditovat GITHUB repo      — jen adresa repa, u klienta se nic neinstaluje"
  echo "  [4] Nápověda   [5] Samotest bran   [6] Telegram bot   [7] Samostatnost Kapitána   [8] Codex   [0] Konec"
  read -r -p "Volba (číslo a Enter): " v
  case "$v" in
    1) node "$D/auditor/tools/new-project.mjs";;
    2) bash "$D/auditor/install.sh";;
    3) bash "$D/auditor/audit-github.sh";;
    4) ${PAGER:-less} "$D/NAVOD.txt";;
    5) read -r -p "Workspace auditora (Enter = test balíku): " w; if [ -n "$w" ]; then (cd "$w" && node tools/selftest.mjs); else node "$D/auditor/tools/selftest.mjs"; fi;;
    6) read -r -p "Cesta k projektu: " r; [ -n "$r" ] && { r="$(cd "$r" && pwd)"; w="$(dirname "$r")/$(basename "$r")-audit"; if [ -f "$w/.claude/settings.json" ]; then for f in tools/telegram-setup.mjs tools/telegram-ping.mjs tools/write-launchers.mjs templates/pruvodce_telegram.md; do cp "$D/auditor/$f" "$w/$f"; done; if command -v claude >/dev/null; then (cd "$w" && claude "Jsi ted PRUVODCE, ne auditor v auditu. Precti templates/pruvodce_telegram.md a postupuj podle nej krok za krokem. Repo projektu: $r"); else node "$D/auditor/tools/telegram-setup.mjs" --ws "$w" --repo "$r"; fi; else echo "Auditor u projektu ještě není — nejdřív [2]."; fi; };;
    7) read -r -p "Cesta k projektu: " r; [ -n "$r" ] && { r="$(cd "$r" && pwd)"; node "$D/auditor/tools/opravneni.mjs" "$(dirname "$r")/$(basename "$r")-audit" "$r" --ask; echo "Zavři okno Kapitána a otevři ho znovu."; };;
    8) read -r -p "Cesta k projektu: " r; [ -n "$r" ] && { r="$(cd "$r" && pwd)"; w="$(dirname "$r")/$(basename "$r")-audit"; if [ -f "$w/.claude/settings.json" ]; then node "$D/auditor/tools/codex-setup.mjs" --ws "$w" --repo "$r"; else echo "Auditor u projektu ještě není — nejdřív [2]."; fi; };;
    0) exit 0;;
  esac
done
