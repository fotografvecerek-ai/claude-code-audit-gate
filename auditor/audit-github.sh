#!/usr/bin/env bash
# AUDIT GITHUB REPA (mac/Linux) — audit cizího projektu jen z adresy repa; u klienta se nic neinstaluje.
# bash audit-github.sh https://github.com/firma/aplikace [--branch main]
PKG="$(cd "$(dirname "$0")" && pwd)"; URL="${1:-}"; shift || true
[ -n "$URL" ] || read -r -p "Adresa repa (např. https://github.com/firma/aplikace): " URL
[ -n "$URL" ] || { echo "Nic nezadáno."; exit 1; }
BASE="${AUDIT_BASE:-$HOME/audity}"
J=$(node "$PKG/tools/remote-clone.mjs" "$URL" --base "$BASE" "$@") || { echo "Repo se nepodařilo stáhnout. Soukromé repo: přístup od klienta + gh auth login."; exit 1; }
get(){ node -e 'console.log(JSON.parse(process.argv[1])[process.argv[2]])' "$J" "$1"; }
REPO=$(get repo); NAME=$(get name); RURL=$(get url); BR=$(get branch); WS="$(dirname "$REPO")/$NAME-audit"
echo "  kopie repa: $REPO (větev $BR, commit $(get commit))"
if [ -f "$WS/.claude/settings.json" ]; then node "$PKG/tools/update-install.mjs" "$REPO" "$WS"; echo "  Kód klienta stažen znovu. Napiš auditorovi: Repo aktualizováno, zkontroluj změny."; [ "$(uname)" = "Darwin" ] && open -a Terminal "$WS/start-auditor.sh"; exit 0; fi
AUDITOR_YES=1 AUDITOR_REPO="$REPO" AUDITOR_WS="$WS" AUDITOR_REMOTE="" AUDITOR_MODEL=best AUDITOR_KAPITAN=ne AUDITOR_HYGIENA=ne AUDITOR_CI=ne bash "$PKG/setup-auditor.sh" || { echo "Instalace auditora selhala."; exit 1; }
node -e 'const j=JSON.parse(process.argv[2]);require("fs").writeFileSync(process.argv[1],JSON.stringify({url:j.url,branch:j.branch,commit:j.commit,stazeno:new Date().toISOString(),klon:j.repo},null,2))' "$WS/AUDIT/.remote.json" "$J"
printf '#!/usr/bin/env bash\nnode "%s/tools/remote-clone.mjs" "%s" --base "%s" --branch %s && echo "Kopie repa aktualizována. Napiš auditorovi: Repo aktualizováno, zkontroluj změny."\n' "$PKG" "$RURL" "$BASE" "$BR" > "$WS/aktualizovat-repo.sh"; chmod +x "$WS/aktualizovat-repo.sh"
node "$WS/tools/gen-config.mjs" "$REPO" >/dev/null; [ -f "$WS/AUDIT/.auth/.env.audit" ] || cp "$WS/templates/env.audit.example" "$WS/AUDIT/.auth/.env.audit"
bash "$WS/tools/post-install.sh" "$REPO" "$WS" --no-launch
echo; echo "HOTOVO: audit $RURL — výstup pro klienta: $WS/AUDIT/ZPRAVA.html, 02_HANDOFF.md, STATISTIKA.html · nová verze kódu: $WS/aktualizovat-repo.sh"
if [ "$(uname)" = "Darwin" ]; then open -a Terminal "$WS/start-auditor.sh"; else echo "Spusť: $WS/start-auditor.sh"; fi
