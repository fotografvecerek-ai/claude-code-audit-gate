#!/usr/bin/env bash
# START (mac/Linux) — rozcestník jako START.cmd
D="$(cd "$(dirname "$0")" && pwd)"
while true; do
  echo; echo "AUDITOR 1.3.0 — co chceš dělat?"
  echo "  [1] Založit NOVÝ projekt       — zdravě od začátku (pravidla, pojistky, kontrola v projektu; doporučeno + samostatný auditor)"
  echo "  [2] Auditovat projekt na DISKU — zadáš cestu; Enter = vyhledat a vybrat i více projektů"
  echo "  [3] Auditovat GITHUB repo      — jen adresa repa, u klienta se nic neinstaluje"
  echo "  [4] Nápověda   [5] Samotest bran   [0] Konec"
  read -r -p "Volba (číslo a Enter): " v
  case "$v" in
    1) node "$D/auditor/tools/new-project.mjs";;
    2) bash "$D/auditor/install.sh";;
    3) bash "$D/auditor/audit-github.sh";;
    4) ${PAGER:-less} "$D/NAVOD.txt";;
    5) read -r -p "Workspace auditora (Enter = test balíku): " w; if [ -n "$w" ]; then (cd "$w" && node tools/selftest.mjs); else node "$D/auditor/tools/selftest.mjs"; fi;;
    0) exit 0;;
  esac
done
