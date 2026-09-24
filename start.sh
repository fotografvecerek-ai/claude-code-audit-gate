#!/usr/bin/env bash
# START (WSL/Linux/mac) — menu jako START.cmd
D="$(cd "$(dirname "$0")" && pwd)"
while true; do
  echo; echo "AUDITOR v3.9.6.1"; echo "  [1] Jeden projekt (Enter = prohledat disky)"; echo "  [2] Více projektů (sken → seznam → výběr čísel)"; echo "  [3] Nápověda (NAVOD.txt)"; echo "  [4] Samotest bran"; echo "  [0] Konec"
  read -r -p "Volba: " v
  case "$v" in 1) bash "$D/auditor/install.sh";; 2) bash "$D/auditor/install-multi.sh";; 3) ${PAGER:-less} "$D/NAVOD.txt";; 4) read -r -p "Workspace auditora: " w; (cd "$w" && node tools/selftest.mjs);; 0) exit 0;; esac
done
