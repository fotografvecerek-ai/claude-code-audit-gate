#!/usr/bin/env bash
# INSTALL-MULTI (WSL/Linux/mac): bash install-multi.sh /cesta/k/projektum [...]   — posouzení → profil → instalace projekt po projektu
set -uo pipefail
PKG="$(cd "$(dirname "$0")" && pwd)"; [ $# -gt 0 ] || { echo "Bez cesty: prohledám domovskou složku, /mnt, /media (Dokumenty, Stažené…)"; set -- --scan; }
REPORT="$HOME/Auditor_pruzkum_$(date +%Y-%m-%d_%H%M).html"
ROWS=(); while IFS= read -r __l; do ROWS+=("$__l"); done < <(node "$PKG/tools/triage.mjs" "$@" --json --html "$REPORT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s))console.log([r.repo,r.name,r.profile,r.github?1:0,r.plan?r.plan.port:3100,r.git.dirty||0,r.git.last||"",r.noGit?1:0].join("|"))})')
[ ${#ROWS[@]} -gt 0 ] || { echo "žádná git repa"; exit 1; }
echo "HTML report: $REPORT"; (command -v xdg-open >/dev/null && xdg-open "$REPORT" >/dev/null 2>&1 || command -v open >/dev/null && open "$REPORT" || true) 2>/dev/null
echo; echo "== Nalezené projekty"
i=0; for row in "${ROWS[@]}"; do i=$((i+1)); IFS='|' read -r repo name prof gh port dirty last ng <<< "$row"; printf "  %2d. %-26s %-12s %-10s %-9s %s\n" "$i" "$name" "${last:-—}" "$prof" "$([ "$ng" = 1 ] && echo BEZ-GITU || echo git)" "$repo"; done
T0=$(date +%s); PLAN=(); HTMLSEL=""
for try in 1 2 3; do
  echo; echo "VÝBĚR: buď v otevřeném HTML zaškrtni projekty a klikni 'Uložit výběr', pak sem stiskni Enter"; read -r -p "       nebo napiš čísla projektů (např. 1 3 5, nebo 'vse'): " SEL
  if [ -z "$SEL" ]; then
    F=$(node -e 'const fs=require("fs"),p=require("path");const t0=+process.argv[1]*1000;let best=null;for(const d of process.argv.slice(2)){try{for(const f of fs.readdirSync(d)){if(!/^Auditor_vyber.*\.json$/.test(f))continue;const st=fs.statSync(p.join(d,f));if(st.mtimeMs>t0&&(!best||st.mtimeMs>best.m))best={m:st.mtimeMs,f:p.join(d,f)}}}catch{}}if(best)console.log(best.f)' "$T0" "$HOME/Downloads" "$HOME/Stažené" "$HOME/Stažené soubory" "$HOME/Desktop" "$HOME/Plocha" "$PKG")
    if [ -n "$F" ]; then HTMLSEL="$F"; echo "  načten výběr z $F"; break; fi
    echo "  Nenašel jsem nový Auditor_vyber.json ve Stažených — klikni v HTML na 'Uložit výběr' a zkus Enter znovu, nebo napiš čísla."; continue
  fi
  [ "$SEL" = "vse" ] && SEL=$(seq -s ' ' 1 ${#ROWS[@]}); break
done
if [ -n "$HTMLSEL" ]; then
  while IFS='|' read -r n vrepo vprof; do
    row=""; for r in "${ROWS[@]}"; do case "$r" in "$vrepo|"*) row="$r";; esac; done
    [ -z "$row" ] && [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le ${#ROWS[@]} ] && row="${ROWS[$((n-1))]}"
    [ -z "$row" ] && { echo "  $vrepo: není v seznamu — přeskakuji"; continue; }
    IFS='|' read -r repo name prof gh port dirty last ng <<< "$row"; [ "$prof" = "PRESKOCIT" ] && prof=JEN_AUDIT
    case "$vprof" in PLNY|LEHKY|JEN_AUDIT) prof=$vprof;; esac
    PLAN+=("$repo|$name|$prof|$gh|$port|$dirty|$ng")
  done < <(node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));for(const v of j.vyber||[])console.log([v.n,v.repo,String(v.profile||"").toUpperCase()].join("|"))' "$HTMLSEL")
else
for n in $SEL; do [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le ${#ROWS[@]} ] || { echo "  ignoruji '$n'"; continue; }
  IFS='|' read -r repo name prof gh port dirty last ng <<< "${ROWS[$((n-1))]}"; [ "$prof" = "PRESKOCIT" ] && prof=JEN_AUDIT
  PLAN+=("$repo|$name|$prof|$gh|$port|$dirty|$ng"); done
fi
[ ${#PLAN[@]} -gt 0 ] || { echo "nic nevybráno"; exit 0; }
echo; echo "== Plán"; PORT=3100; NEWPLAN=(); for p in "${PLAN[@]}"; do IFS='|' read -r repo name prof gh _ dirty ng <<< "$p"; printf "  %-28s %-10s port %s%s\n" "$name" "$prof" "$PORT" "$([ "$ng" = 1 ] && echo '  (založí se git repo)')"; NEWPLAN+=("$repo|$name|$prof|$gh|$PORT|$dirty|$ng"); PORT=$((PORT+1)); done; PLAN=("${NEWPLAN[@]}")
echo "(profil = doporučení z posouzení). Instaluji..."
SUM=(); LAUNCH=()
for p in "${PLAN[@]}"; do IFS='|' read -r repo name prof gh port dirty ng <<< "$p"
  [ "$prof" = "PRESKOCIT" ] && { SUM+=("$name: přeskočeno"); continue; }
  if [ "$ng" = 1 ]; then node "$PKG/tools/git-init-project.mjs" "$repo" || { SUM+=("$name: git init selhal (velké soubory?)"); continue; }; dirty=0; fi
  [ "$dirty" != "0" ] && echo "$name: $dirty souborů není uložených v gitu — v pořádku, instaluji dál; tvoje soubory se nemění, auditor to zapíše jako první nález."
  WS="$(dirname "$repo")/$name-audit"; echo; echo "================ $name → $prof ================"
  case "$prof" in PLNY) K=ano; H=ano; C=$([ "$gh" = 1 ] && echo ano || echo ne); M=claude-fable-5-1;; LEHKY) K=ano; H=ano; C=ne; M=opus;; JEN_AUDIT) K=ne; H=ne; C=ne; M=sonnet;; esac
  AUDITOR_YES=1 AUDITOR_REPO="$repo" AUDITOR_WS="$WS" AUDITOR_REMOTE="" AUDITOR_MODEL=$M AUDITOR_KAPITAN=$K AUDITOR_HYGIENA=$H AUDITOR_CI=$C bash "$PKG/setup-auditor.sh" || { SUM+=("$name: CHYBA průvodce"); continue; }
  node "$WS/tools/gen-config.mjs" "$repo" --port "$port"
  [ -f "$WS/AUDIT/.auth/.env.audit" ] || sed "s/localhost:3100/localhost:$port/" "$WS/templates/env.audit.example" > "$WS/AUDIT/.auth/.env.audit"
  printf '#!/usr/bin/env bash\nnode "%s/kapitan-side/gate-check.mjs" "%s" || exit 1\ncd "%s" && exec "$@"\n' "$WS" "$repo" "$repo" > "$WS/deploy-with-gate.sh"; chmod +x "$WS/deploy-with-gate.sh"
  if [ "$prof" != "JEN_AUDIT" ]; then ( cd "$repo" && PRE="$WS/AUDIT/.pre-install-status.txt"; OURS=(); while IFS= read -r l; do f="${l:3}"; f="${f#\"}"; f="${f%\"}"; [ -n "$f" ] || continue; if [ -f "$PRE" ] && grep -qF -- " $f" "$PRE"; then continue; fi; OURS+=("$f"); done < <(git status --porcelain --untracked-files=all -- $(for f in .claude .github .gitattributes .gitignore CLAUDE.md; do [ -e "$f" ] && printf '%s ' "$f"; done) 2>/dev/null); [ ${#OURS[@]} -gt 0 ] && { git add -- "${OURS[@]}"; git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name || echo auditor-install)}" -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email || echo auditor-install@local)}" commit -q -m "chore(audit): instalace auditora" -- "${OURS[@]}"; }; n=$(git status --porcelain | grep -c .); [ "$n" -gt 0 ] && echo "  v projektu zůstává $n souborů neuložených v gitu (bylo tak už před instalací) — auditor to zapíše jako první nález." ); fi
  if [ "$C" = "ano" ] && command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    APP=$(cd "$repo" && gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
    if [ -n "$APP" ]; then OWNER=${APP%%/*}; AUD="$OWNER/$name-audit"; BR=$(cd "$repo" && git rev-parse --abbrev-ref HEAD)
      ( cd "$WS"; git remote | grep -q origin || { gh repo view "$AUD" >/dev/null 2>&1 || gh repo create "$AUD" --private >/dev/null; git remote add origin "https://github.com/$AUD.git"; }; git branch -M main; git add -A; git -c user.name=auditor -c user.email=auditor@local commit -qm "chore: post-install" 2>/dev/null; git push -u origin main )
      KEY=$(mktemp -u); ssh-keygen -t ed25519 -N "" -q -C auditor-gate -f "$KEY" && gh repo deploy-key add "$KEY.pub" -R "$AUD" --title "auditor-gate ($APP)" && gh secret set AUDIT_SSH_KEY -R "$APP" < "$KEY" && gh secret set AUDIT_REPO -R "$APP" -b "$AUD"; rm -f "$KEY" "$KEY.pub"
      ( cd "$repo" && git push ) || echo "push repa selhal — pushni ručně"
      printf '{"required_status_checks":{"strict":true,"contexts":["auditor-gate"]},"enforce_admins":true,"required_pull_request_reviews":null,"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}' | gh api -X PUT "repos/$APP/branches/$BR/protection" --input - >/dev/null 2>&1 && echo "větev $BR chráněna" || echo "ochranu větve nastav ručně"
    fi
  elif [ "$C" = "ano" ]; then echo "gh nepřihlášené — GitHub kroky ručně"; fi
  if [ "$prof" != "JEN_AUDIT" ] && ! ( cd "$repo" && git ls-files --error-unmatch .claude/hooks/kapitan-audit-guard.js >/dev/null 2>&1 ); then echo "  ❌ $name: pojistky nejsou uložené v gitu (commit selhal - git identita?). Instalace NENÍ hotová."; SUM+=("$name: CHYBA - commit pojistek selhal"); continue; fi
  bash "$WS/tools/post-install.sh" "$repo" "$WS" --no-launch; LAUNCH+=("$WS")
  SUM+=("$name: $prof → $WS (port $port)")
done
echo; echo "================ SOUHRN ================"; printf '  %s\n' "${SUM[@]}"
if [ "$(uname)" = "Darwin" ]; then for w in "${LAUNCH[@]}"; do open -a Terminal "$w/start-auditor.sh"; done; echo "Otevírám auditory v Terminálu (Kapitány spouštěj zástupcem na ploše)."; else echo "Spusť <workspace>/start-auditor.sh v terminálu (Kapitán: start-kapitan.sh)."; fi
echo "Každý projekt má vlastní workspace, bus, gate a port. Start: <workspace>/start-auditor.sh (první zpráva: Začni intake)."
