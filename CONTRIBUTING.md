# Přispívání / Contributing

**EN summary:** This is an independent *audit agent* for Claude Code: it audits an app built by another agent ("Kapitán" = the project
agent), never writes code or deploys, hands findings with proposed fixes to the project agent, enforces stop-the-line, independently
verifies every fix (six gates) and gates the release with technical barriers (hooks, git pre-commit, CI). The tool and its documentation
are currently in **Czech**. The most valuable first contribution is an **English (i18n) layer** — see the issue "i18n". PRs and issues in
English are welcome. Run `node tools/selftest.mjs` before every PR (must be 100 % PASS; 70/70 on Windows, 71/71 elsewhere).

## Co je vítané
- Opravy chyb s reprodukcí (výpis okna, OS, verze Node/Git/Claude Code).
- Nové kontroly do checklistů (`checklists/`) s odkazem na standard (OWASP ASVS/Top 10, WCAG, …).
- Lepší detekce v nástrojích (`tools/*.mjs`): SSOT, hygiena, efektivita, triage projektů.
- Podpora dalších stacků (dnes: Next.js/Prisma/Supabase, HTML monolit, Capacitor, Python).
- Překlad do angličtiny (ústava `CLAUDE.md`, šablony, checklisty, hlášky instalátoru).

## Pravidla
1. **Auditor nikdy nekóduje, nemění repo aplikace a nevydává.** Změna, která by to oslabila, se nepřijme.
2. Každá změna hooků/bran → `node tools/selftest.mjs` 100 % PASS + nový scénář pro chování, které měníš.
3. Instalátor nesmí klást uživateli technické otázky — rozhoduje sám podle posouzení (viz `install-multi.ps1`/`.sh`).
4. PowerShell skripty: UTF-8 **s BOM**, bez „chytrých" uvozovek a pomlček (PowerShell 5.1). JSON zapisují jen Node nástroje, ne `ConvertTo-Json`.
5. Bash skripty: kompatibilní s bash 3.2 (macOS) — žádné `mapfile`, `declare -A`, `xargs -r`, `find -newermt`, `timeout`.
6. Nic osobního do repa: žádné reálné cesty, klíče, jména projektů uživatelů.

## Jak testovat
```
node tools/selftest.mjs                 # brány, bus, gate-check, pre-commit (71 scénářů)
bash install-multi.sh /cesta/k/projektum   # nebo START.cmd na Windows
```
Chyby hlas přes issue se šablonou „Chyba instalace / běhu".
