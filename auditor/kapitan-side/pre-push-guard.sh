#!/usr/bin/env bash
# auditor-managed-hook: pre-push
# PRE-PUSH GUARD — wrapper git hooku; logika je v pre-push-guard.mjs (A-023 AK3, druhá linie po ochraně větve na GitHubu).
# Instalace (dělá setup průvodce): kopie tohoto souboru do .git/hooks/pre-push + pre-push-guard.mjs a gate-check.mjs do <repo>/.claude/hooks/.
DIR="$(git rev-parse --show-toplevel)/.claude/hooks"
# worktree/sparse checkout větve, která pojistky ještě nemá → použij pojistky z hlavního pracovního stromu (sdílí stejné .git)
if [ ! -f "$DIR/pre-push-guard.mjs" ]; then MAIN="$(cd "$(git rev-parse --git-common-dir)/.." 2>/dev/null && pwd)"; [ -f "$MAIN/.claude/hooks/pre-push-guard.mjs" ] && DIR="$MAIN/.claude/hooks"; fi
[ -f "$DIR/pre-push-guard.mjs" ] || { echo "pre-push-guard: chybí $DIR/pre-push-guard.mjs — spusť setup-auditor (fail-closed)"; exit 1; }
exec node "$DIR/pre-push-guard.mjs"
