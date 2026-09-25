#!/usr/bin/env bash
# INSTALL (WSL/Linux/mac) — jedno spuštění: bash install.sh /cesta/k/repu
set -uo pipefail
PKG="$(cd "$(dirname "$0")" && pwd)"; REPO="${1:-}"
[ -z "$REPO" ] && read -r -p "Cesta k projektu (prázdné = prohledat disky): " REPO
[ -z "$REPO" ] && exec bash "$PKG/install-multi.sh"
REPO="$(cd "$REPO" && pwd)" || { echo "složka neexistuje"; exit 1; }
[ -d "$REPO/.git" ] || { echo "$REPO není git repo."; echo "Zakládám git repo (jen .gitignore + první uložení, nic se nemaže)."; node "$PKG/tools/git-init-project.mjs" "$REPO" || exit 1; }
WS="$(dirname "$REPO")/$(basename "$REPO")-audit"
[ -f "$WS/.claude/settings.json" ] && { echo "Auditor je u tohoto projektu už nainstalovaný — jen aktualizuji nastavení, rozjetý audit zůstává."; exec node "$PKG/tools/update-install.mjs" "$REPO" "$WS"; }
AUDITOR_YES=1 AUDITOR_REPO="$REPO" AUDITOR_WS="$WS" AUDITOR_REMOTE="" AUDITOR_MODEL=best bash "$PKG/setup-auditor.sh" || { echo "průvodce selhal"; exit 1; }
node "$WS/tools/gen-config.mjs" "$REPO"
[ -f "$WS/AUDIT/.auth/.env.audit" ] || cp "$WS/templates/env.audit.example" "$WS/AUDIT/.auth/.env.audit"
printf '#!/usr/bin/env bash\nnode "%s/kapitan-side/gate-check.mjs" "%s" || exit 1\ncd "%s" && exec "$@"\n' "$WS" "$REPO" "$REPO" > "$WS/deploy-with-gate.sh"; chmod +x "$WS/deploy-with-gate.sh"
( cd "$REPO" && PRE="$WS/AUDIT/.pre-install-status.txt"; OURS=(); while IFS= read -r l; do f="${l:3}"; f="${f#\"}"; f="${f%\"}"; [ -n "$f" ] || continue; if [ -f "$PRE" ] && grep -qF -- " $f" "$PRE"; then continue; fi; OURS+=("$f"); done < <(git status --porcelain --untracked-files=all -- $(for f in .claude .github .gitattributes .gitignore CLAUDE.md; do [ -e "$f" ] && printf '%s ' "$f"; done) 2>/dev/null); [ ${#OURS[@]} -gt 0 ] && { git add -- "${OURS[@]}"; git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name || echo auditor-install)}" -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email || echo auditor-install@local)}" commit -q -m "chore(audit): instalace auditora (hooky, skill audit-rezim, CI brána, hygiena)" -- "${OURS[@]}"; } )
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  APP=$(cd "$REPO" && gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
  if [ -n "$APP" ]; then
    OWNER=${APP%%/*}; AUD="$OWNER/$(basename "$REPO")-audit"; BR=$(cd "$REPO" && git rev-parse --abbrev-ref HEAD)
    ( cd "$WS"; git remote | grep -q origin || { gh repo view "$AUD" >/dev/null 2>&1 || gh repo create "$AUD" --private >/dev/null; git remote add origin "https://github.com/$AUD.git"; }; git branch -M main; git add -A; git -c user.name=auditor -c user.email=auditor@local commit -qm "chore: post-install" 2>/dev/null; git push -u origin main )
    K=$(mktemp -u); ssh-keygen -t ed25519 -N "" -q -C auditor-gate -f "$K" && gh repo deploy-key add "$K.pub" -R "$AUD" --title "auditor-gate ($APP)" && gh secret set AUDIT_SSH_KEY -R "$APP" < "$K" && gh secret set AUDIT_REPO -R "$APP" -b "$AUD"; rm -f "$K" "$K.pub"
    ( cd "$REPO" && git push ) || echo "push repa selhal — pushni ručně"
    printf '{"required_status_checks":{"strict":true,"contexts":["auditor-gate"]},"enforce_admins":true,"required_pull_request_reviews":null,"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}' | gh api -X PUT "repos/$APP/branches/$BR/protection" --input - >/dev/null 2>&1 && echo "větev $BR chráněna (auditor-gate)" || echo "ochranu větve nastav ručně (Free plán soukromé repo ji nepodporuje)"
  else echo "repo aplikace nemá GitHub remote — GitHub kroky přeskočeny"; fi
else echo "gh CLI nepřihlášené — GitHub kroky (secrets, chráněná main) udělej ručně nebo spusť znovu po 'gh auth login'"; fi
( cd "$REPO" && git ls-files --error-unmatch .claude/hooks/kapitan-audit-guard.js >/dev/null 2>&1 ) || { echo "  ❌ POJISTKY NEJSOU ULOŽENÉ V GITU (commit selhal - chybí git identita? nastav: git config --global user.name/user.email). Instalace NENÍ hotová."; exit 1; }
command -v claude >/dev/null || { echo "Claude Code tu není — auditor i Kapitán poběží v Codexu."; node "$PKG/tools/codex-setup.mjs" --ws "$WS" --repo "$REPO" --auditor codex --kapitan codex --yes; }
bash "$WS/tools/post-install.sh" "$REPO" "$WS"
