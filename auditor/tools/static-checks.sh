#!/usr/bin/env bash
# STATIC CHECKS — read-only; výstupy do AUDIT/01_nalezy/static/. Spouštěj z workspace auditora: bash tools/static-checks.sh <repo>
# Nic v repu nemění (žádný --fix, žádný install do repa). Tichý výstup = úspora tokenů: čti jen SUMMARY, detaily jsou v souborech.
set -u
REPO="${1:?cesta k repu}"; OUT="AUDIT/01_nalezy/static"; mkdir -p "$OUT"
S="$OUT/SUMMARY.txt"; : > "$S"
say(){ echo "$*" | tee -a "$S"; }
run(){ local name="$1"; shift; ( cd "$REPO" && "$@" ) > "$OUT/$name.txt" 2>&1; local rc=$?; say "$name: exit=$rc lines=$(wc -l < "$OUT/$name.txt")"; return $rc; }

say "== $(date -Iseconds) repo=$REPO commit=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null)"
run tsc         npx tsc --noEmit -p . || true
run eslint      npx eslint . --max-warnings=0 -f unix || true
run audit       pnpm audit --prod --json || true
say "audit high/critical: $(grep -o '"severity":"\(high\|critical\)"' "$OUT/audit.txt" | wc -l)"
run outdated    pnpm outdated || true
command -v gitleaks >/dev/null && run gitleaks gitleaks detect --source . --no-git -r "$PWD/$OUT/gitleaks.json" || say "gitleaks: neinstalován (doporuč: brew/scoop install gitleaks; sken i historie: gitleaks git .)"
command -v semgrep >/dev/null && run semgrep semgrep --config p/typescript --config p/nextjs --config p/react --config p/owasp-top-ten --config p/secrets --json --metrics=off -o "$PWD/$OUT/semgrep.json" . || say "semgrep: neinstalován (pip install semgrep); packy ověř na semgrep.dev/r"
run jscpd       npx --yes jscpd . --min-lines 8 --min-tokens 60 --ignore "**/node_modules/**,**/.next/**,**/dist/**" --reporters console || true
run madge       npx --yes madge --circular --extensions ts,tsx src app lib 2>/dev/null || true
run knip        npx --yes knip --reporter compact || true

# grep pravidla (vlastníkova + bezpečnostní); počet = plošné AK
g(){ local name="$1" pat="$2"; shift 2; local n; n=$(grep -rnE --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist "$pat" "$REPO" | tee "$OUT/grep_$name.txt" | wc -l); say "grep $name: $n"; }
g empty_catch        'catch\s*(\s*\w*\s*)?\s*\{\s*\}'
g raw_unsafe         'queryRawUnsafe|executeRawUnsafe'
g dangerous_html     'dangerouslySetInnerHTML'
g next_public_secret 'NEXT_PUBLIC_[A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD|PRIVATE)'
g service_role_client 'SUPABASE_SERVICE_ROLE|service_role'
g any_type           ':\s*any\b|as any\b'
g console_log        'console\.log\('
g todo_in_auth       'TODO|FIXME|HACK'
g prisma_clients     'new PrismaClient\('
g env_reads          'process\.env\.'
n=$(grep -rnP --include='*.tsx' --include='*.ts' --include='*.html' --exclude-dir=node_modules --exclude-dir=.next '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' "$REPO" 2>/dev/null | tee "$OUT/grep_emoji_in_ui.txt" | wc -l); say "grep emoji_in_ui: $n (PCRE; 0 = OK dle vlastníkova pravidla)"
say "prisma_clients musí být 1; next_public_secret musí být 0; raw_unsafe musí být 0; empty_catch musí být 0."
say "== hotovo → $OUT"
