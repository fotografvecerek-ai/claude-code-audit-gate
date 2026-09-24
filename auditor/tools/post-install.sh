#!/usr/bin/env bash
# POST-INSTALL (mac/Linux/WSL) — společné kroky po průvodci: úklid starších verzí, důvěra složkám v Claude Code, zástupce na ploše, spuštění oken.
# bash tools/post-install.sh <repo> <workspace> [--no-launch]
REPO="$1"; WS="$2"; NOLAUNCH="${3:-}"; NAME="$(basename "$REPO")"
node "$WS/tools/unpatch-deploy.mjs" "$REPO" | grep -v '^UNPATCHED' || true
node "$WS/tools/patch-deploy.mjs" "$REPO" "$WS" --list | grep '^KANDIDAT' | sed 's/^KANDIDAT //' > "$WS/AUDIT/instalace.log.tmp" 2>/dev/null || true
if [ -s "$WS/AUDIT/instalace.log.tmp" ]; then printf '[%s] deploy skripty kandidáti: %s\n' "$(date +%FT%T)" "$(tr '\n' ' ' < "$WS/AUDIT/instalace.log.tmp")" >> "$WS/AUDIT/instalace.log"; echo "  nalezeno $(wc -l < "$WS/AUDIT/instalace.log.tmp" | tr -d ' ') deploy skriptů - které dostanou gate-check, rozhodne auditor v handoffu"; fi; rm -f "$WS/AUDIT/instalace.log.tmp"
node "$WS/tools/trust-folders.mjs" "$WS" "$REPO"
DESK="$HOME/Desktop"; [ -d "$DESK" ] || DESK="$HOME/Plocha"
if [ -d "$DESK" ]; then
  if [ "$(uname)" = "Darwin" ]; then
    printf '#!/usr/bin/env bash\nexec "%s/start-auditor.sh"\n' "$WS" > "$DESK/Auditor - $NAME.command"; printf '#!/usr/bin/env bash\nexec "%s/start-kapitan.sh"\n' "$WS" > "$DESK/Kapitan - $NAME.command"
    chmod +x "$DESK/Auditor - $NAME.command" "$DESK/Kapitan - $NAME.command"; echo "  na ploše: 'Auditor - $NAME.command' a 'Kapitan - $NAME.command' (poklepáním se otevře Terminál)"
  else
    for pair in "Auditor:start-auditor.sh" "Kapitan:start-kapitan.sh"; do L="${pair%%:*}"; S="${pair##*:}"; printf '[Desktop Entry]\nType=Application\nName=%s - %s\nExec=x-terminal-emulator -e "%s/%s"\nTerminal=false\n' "$L" "$NAME" "$WS" "$S" > "$DESK/$L - $NAME.desktop"; chmod +x "$DESK/$L - $NAME.desktop"; done; echo "  na ploše: 'Auditor - $NAME' a 'Kapitan - $NAME'"
  fi
fi
( cd "$WS" && node tools/selftest.mjs > "$WS/AUDIT/selftest.log" 2>&1 ); ST=$?; grep -E "^FAIL|/[0-9]+ PASS" "$WS/AUDIT/selftest.log" | sed 's/^/  /'
if [ $ST -ne 0 ]; then echo "  ❌ SAMOTEST NEPROŠEL - auditora zatím nespouštěj. Pošli $WS/AUDIT/selftest.log."; exit 1; fi
echo; echo "================ HOTOVO: $NAME ================"
echo "  - Auditor: $WS  (otevře se sám a začne intake - ptá se lidsky; odpovídáš)"
echo "  - Kapitán už auditora vidí automaticky, ať ho spustíš jakkoliv (nastavení projektu); zástupce na ploše navíc počká, dokud běží starý."
echo "  - Vydání hlídá hook Kapitána (vercel, git push do main); gate-check do deploy skriptů navrhne auditor v handoffu. Ruční deploy: $WS/deploy-with-gate.sh <příkaz>"
echo "  MUSÍŠ NĚCO VYPNOUT? Ne. Jen Kapitána spuštěného před instalací nech dokončit a spusť znovu (nové pojistky se načítají při startu)."
if [ "$NOLAUNCH" != "--no-launch" ] && [ "$(uname)" = "Darwin" ]; then open -a Terminal "$WS/start-auditor.sh"; open -a Terminal "$WS/start-kapitan.sh"; echo "  Otevírám auditora a Kapitána v Terminálu."; 
elif [ "$NOLAUNCH" != "--no-launch" ]; then echo "  Spusť: $WS/start-auditor.sh  a  $WS/start-kapitan.sh (každý ve vlastním terminálu)."; fi
