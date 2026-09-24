#!/usr/bin/env bash
# SETUP AUDITOR — průvodce (Linux / WSL / macOS). bash setup-auditor.sh   — stejné kroky jako setup-auditor.ps1
set -euo pipefail
PKG="$(cd "$(dirname "$0")" && pwd)"
ask(){ if [ "${AUDITOR_YES:-}" = "1" ]; then echo "$2"; return; fi; local a; read -r -p "$1 [$2]: " a; echo "${a:-$2}"; }
askyn(){ if [ "${AUDITOR_YES:-}" = "1" ]; then echo "$2"; return; fi; local a; read -r -p "$1  [1] ano   [2] ne   (Enter = $2): " a; case "${a:-}" in "") echo "$2";; 1|a*|A*) echo ano;; *) echo ne;; esac; }
for c in node git claude; do command -v $c >/dev/null || { echo "CHYBÍ: $c"; exit 1; }; done
echo "=== AUDITOR setup ==="
REPO=${AUDITOR_REPO:-$(ask "Cesta k repu aplikace (Kapitán)" "$HOME/dev/moje-aplikace")}; [ -d "$REPO" ] || { echo "Repo neexistuje"; exit 1; }
REPO=$(cd "$REPO" && pwd); NAME=$(basename "$REPO")
WS=${AUDITOR_WS:-$(ask "Workspace auditora (vytvoří se)" "$(dirname "$REPO")/$NAME-audit")}
REMOTE=${AUDITOR_REMOTE:-$(ask "Git remote pro AUDIT workspace (prázdné = jen lokální)" "")}
MODEL=${AUDITOR_MODEL:-$(ask "Model hlavního vlákna auditora (claude-fable-5-1 / opus / sonnet)" "claude-fable-5-1")}

mkdir -p "$WS"; for d in CLAUDE.md README.md BRIDGE.md .claude checklists templates tools kapitan-side starter; do cp -r "$PKG/$d" "$WS/"; done
# AUDIT/ = data auditora - pri aktualizaci se neprepisuje; ze sablony jen chybejici soubory
( cd "$PKG/AUDIT" && find . -type f | while read -r f; do [ -e "$WS/AUDIT/$f" ] || { mkdir -p "$WS/AUDIT/$(dirname "$f")"; cp "$f" "$WS/AUDIT/$f"; }; done )
mkdir -p "$WS"/AUDIT/{01_nalezy/momentky,03_dukazy,04_verdikty,bus,.auth}
[ -d "$REPO/.git" ] && git -C "$REPO" status --porcelain > "$WS/AUDIT/.pre-install-status.txt" 2>/dev/null || true
[ -f "$WS/tools/audit.config.json" ] || cp "$WS/tools/audit.config.example.json" "$WS/tools/audit.config.json"
printf 'node_modules/\ntest-results/\nplaywright-report/\nAUDIT/.auth/\nAUDIT/_archiv/\nbuild/\ntools/node_modules/\n' > "$WS/.gitignore"

node "$WS/tools/write-auditor-settings.mjs" "$WS" "$REPO" "$MODEL" || { echo "Zápis settings auditora selhal"; exit 1; }

( cd "$WS"; [ -d .git ] || { git init -q; git add -A; git -c user.name=auditor -c user.email=auditor@local commit -q -m "auditor workspace init"; }
  [ -n "$REMOTE" ] && { git remote remove origin 2>/dev/null || true; git remote add origin "$REMOTE"; echo "Remote nastaven (první push ručně: git push -u origin main)"; }
  cd tools && { npm install --no-audit --no-fund >/dev/null || echo "VAROVÁNÍ: npm install selhal — spusť ručně v $WS/tools"; } ; { npx playwright install chromium >/dev/null 2>&1 || echo "VAROVÁNÍ: stažení Chromia selhalo (síť?) — spusť ručně: cd $WS/tools && npx playwright install chromium"; } )

K=${AUDITOR_KAPITAN:-$(askyn "Nainstalovat do repa stranu Kapitána (skill + hook + gate-check)?" "ano")}
if [ "$K" = "ano" ]; then
  SK="$REPO/.claude/skills/audit-rezim"; mkdir -p "$SK" "$REPO/.claude/hooks"
  { printf -- '---\nname: audit-rezim\ndescription: Závazný audit režim — stop-the-line při otevřených P0/P1 v AUDIT/02_HANDOFF.md, důkazy do AUDIT/03_dukazy, bus komunikace s auditorem, deploy jen po gate-check. Použij při startu každé dávky.\n---\n'; cat "$PKG/kapitan-side/AUDIT_REZIM.md"; } > "$SK/SKILL.md"
  cp "$PKG/kapitan-side/gate-check.mjs" "$REPO/.claude/hooks/" && cp "$PKG/kapitan-side/kapitan-audit-guard.js" "$PKG/kapitan-side/hygiene/hygiene-rules.js" "$PKG/kapitan-side/hygiene/hygiene-rules.json" "$REPO/.claude/hooks/" && cp "$PKG/kapitan-side/hygiene/hooks-package.json" "$REPO/.claude/hooks/package.json" && cp "$PKG/kapitan-side/hygiene/pre-commit-check.mjs" "$REPO/.claude/hooks/"
  node "$WS/tools/merge-repo-settings.mjs" "$REPO" "$WS" || echo "Sloučení settings Kapitána selhalo"
  grep -q 'Audit režim' "$REPO/CLAUDE.md" 2>/dev/null || printf '\n## Audit režim (závazné)\nExistuje-li `%s/AUDIT/02_HANDOFF.md` s otevřenými P0/P1 → STOP-THE-LINE: pracuj jen na položkách handoffu v jejich pořadí; deploy zakázán, dokud gate-check neprojde (`node %s/kapitan-side/gate-check.mjs`). Detaily: skill `audit-rezim`. Auditor = jediná brána vydání.\n' "$WS" "$WS" >> "$REPO/CLAUDE.md"
  H=${AUDITOR_HYGIENA:-$(askyn "Nainstalovat hygienu do repa (pre-commit guard, .gitattributes, .gitignore doplněk)?" "ano")}
  if [ "$H" = "ano" ]; then
    mkdir -p "$REPO/.git/hooks" && cp "$PKG/kapitan-side/hygiene/"{pre-commit-check.mjs,hygiene-rules.js,hygiene-rules.json} "$REPO/.claude/hooks/" && cp "$PKG/kapitan-side/hygiene/pre-commit-guard.sh" "$REPO/.git/hooks/pre-commit" && chmod +x "$REPO/.git/hooks/pre-commit"
    [ -f "$REPO/.gitattributes" ] || cp "$PKG/kapitan-side/hygiene/gitattributes.template" "$REPO/.gitattributes"
    grep -q 'hygiena (auditor)' "$REPO/.gitignore" 2>/dev/null || cat "$PKG/kapitan-side/hygiene/gitignore.addendum" >> "$REPO/.gitignore"
    echo "Hygiena nainstalována (pre-commit guard aktivní; husky/lefthook: přidej volání skriptu do jejich configu)."
  fi
  C=${AUDITOR_CI:-$(askyn "Nainstalovat GitHub Actions workflow auditor-gate (CI brána mimo agenta; vyžaduje chráněnou main + secrets AUDIT_REPO, AUDIT_REPO_TOKEN)?" "ano")}
  if [ "$C" = "ano" ]; then mkdir -p "$REPO/.github/workflows" && cp "$PKG/kapitan-side/ci/auditor-gate.yml" "$REPO/.github/workflows/auditor-gate.yml" && echo "CI workflow nainstalován → na GitHubu: Settings → Branches → protect main → required status check 'auditor-gate'; Secrets: AUDIT_REPO, AUDIT_REPO_TOKEN (read-only PAT na audit repo)."; fi
  echo "DŮLEŽITÉ: do DEPLOY_SEKVENCE / deploy skriptu přidej jako 1. krok:  node $WS/kapitan-side/gate-check.mjs $REPO || exit 1"
fi

export AUDITOR_WORKSPACE="$WS" AUDITOR_TARGET_REPO="$REPO"
r1=0; echo "{\"cwd\":\"$WS\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$REPO/test.txt\"}}" | node "$WS/.claude/hooks/auditor-guard.js" 2>/dev/null || r1=$?
r2=0; echo "{\"cwd\":\"$WS\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$WS/AUDIT/01_nalezy/A-000.md\"}}" | node "$WS/.claude/hooks/auditor-guard.js" 2>/dev/null || r2=$?
echo "Brána: zápis do repa $([ $r1 -eq 2 ] && echo 'BLOKOVÁN ✅' || echo 'PROŠEL ❌'); zápis do AUDIT/ $([ $r2 -eq 0 ] && echo 'povolen ✅' || echo 'blokován ❌')"
printf '#!/usr/bin/env bash\ncd "%s"; echo; echo "  AUDITOR - %s. Uvodni zprava se posle sama. Kdyby zustal radek > prazdny, napis: Zacni intake"; echo\nif [ $# -eq 0 ]; then exec claude --add-dir "%s" "Zacni intake"; else exec claude --add-dir "%s" "$@"; fi\n' "$WS" "$NAME" "$REPO" "$REPO" > "$WS/start-auditor.sh"; chmod +x "$WS/start-auditor.sh"
printf '#!/usr/bin/env bash\ncd "%s" && node "%s/tools/wait-idle.mjs" "%s" 3 || exit 1\necho; echo "  KAPITAN - %s. Sam si nacte zpravy od auditora. Kdyby zustal radek > prazdny, napis: Nacti zpravy od auditora a pokracuj v praci"; echo\nif [ $# -eq 0 ]; then exec claude --add-dir "%s" "Nacti zpravy od auditora (bus inbox) a AUDIT/02_HANDOFF.md, pokud existuje; ridi se audit rezimem. Pak pokracuj v bezne praci."; else exec claude --add-dir "%s" "$@"; fi\n' "$REPO" "$WS" "$REPO" "$NAME" "$WS" "$WS" > "$WS/start-kapitan.sh"; chmod +x "$WS/start-kapitan.sh"
command -v gitleaks >/dev/null || echo "DOPORUČENO: nainstaluj gitleaks (sken tajemství v historii) — bez něj static-checks tento krok přeskočí."
command -v semgrep >/dev/null || echo "DOPORUČENO: pip install semgrep (pravidla OWASP/Next.js) — bez něj static-checks tento krok přeskočí."
echo "VERCEL/GIT DEPLOY: pokud hosting nasazuje automaticky z push do main, hook Kapitána spouští gate-check už při 'git push' do main/master/production (PROD_BRANCHES env)."
node "$WS/tools/trust-folders.mjs" "$WS" "$REPO"
node "$WS/tools/guard-check.mjs" "$WS" "$REPO" || echo "BRÁNA NEFUNGUJE — auditora nespouštěj, pošli tento výpis Claude."
[ "${AUDITOR_YES:-}" = "1" ] || { echo "== samotest bran"; (cd "$WS" && node tools/selftest.mjs | grep -E "^FAIL|/[0-9]+ PASS") || echo "SELFTEST FAIL — nevydávej, pošli výstup Claude."; }
echo "PROD větve: hook i CI hlídají main|master|production|prod|release — jiný název produkční větve nastav v env PROD_BRANCHES a v .github/workflows/auditor-gate.yml (branches:)."
[ "${AUDITOR_YES:-}" = "1" ] || echo "HOTOVO. Auditor: $WS/start-auditor.sh  (sám začne intake) · Kapitán: $WS/start-kapitan.sh"
