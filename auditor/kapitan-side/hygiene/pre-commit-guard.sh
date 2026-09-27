#!/usr/bin/env bash
# PRE-COMMIT GUARD — wrapper git hooku; logika je v pre-commit-check.mjs (jediná implementace, sdílená pravidla hygiene-rules.json).
# Instalace (dělá setup průvodce): kopie tohoto souboru + pre-commit-check.mjs + hygiene-rules.js + hygiene-rules.json do <repo>/.claude/hooks/ a tento wrapper do .git/hooks/pre-commit.
DIR="$(git rev-parse --show-toplevel)/.claude/hooks"
# worktree/sparse checkout větve, která pojistky ještě nemá → použij pojistky z hlavního pracovního stromu (sdílí stejné .git)
if [ ! -f "$DIR/pre-commit-check.mjs" ]; then MAIN="$(cd "$(git rev-parse --git-common-dir)/.." 2>/dev/null && pwd)"; [ -f "$MAIN/.claude/hooks/pre-commit-check.mjs" ] && DIR="$MAIN/.claude/hooks"; fi
[ -f "$DIR/pre-commit-check.mjs" ] || { echo "pre-commit-guard: chybí $DIR/pre-commit-check.mjs — spusť setup-auditor (fail-closed)"; exit 1; }
exec node "$DIR/pre-commit-check.mjs" "$DIR/hygiene-rules.json"
