# AUDIT/02_HANDOFF.md — balík pro Kapitána  (auditor → Kapitán)

**Datum:** <datum> · **Auditovaný commit:** `<hash>` · **Auditor verze:** <verze CLAUDE.md auditora> · **Intake:** `AUDIT/00_intake.md`

**Auditovaný stav:** commit `<sha>` na branch `<branch>` (HEAD se během auditu neměnil / změnil v <čas> — kód po změně NEBYL auditován).
**Toto předání není schválení implementace ani nasazení.** Schválení vzniká až verdiktem PASS a 🟢 v `05_release_gate.md`.

## ⛔ STOP-THE-LINE
Tento balík má **nejvyšší prioritu**. Kapitán zastaví všechny ostatní úlohy (nové featury, refaktory, kanban fronta) kromě
P0 provozních incidentů a pracuje výhradně na položkách níže v uvedeném pořadí. Vydání (deploy) je zakázáno, dokud
`AUDIT/05_release_gate.md` není 🟢. Toto pravidlo vynucuje auditor; Kapitán nemá pravomoc ho zrušit — jen vlastník.

## Pravidla práce (závazná)
1. **Záloha před každým zásahem**: `git tag audit-pre-A-###` + branch `audit/A-###` z aktuálního main; DB změna → dump/snapshot před migrací a doložený rollback příkaz. Bez tagu se položka nepřijímá.
2. **Systémově, ne bodově**: nejdřív root cause (proč to vzniklo), pak oprava, pak pojistka proti recidivě (lint/test/hook). Bodová oprava bez pojistky = DONE_WITH_CONCERNS, ne DONE.
3. **Uzavřená smyčka** (skill `uzavrena-smycka`): FIX ≠ VERIFY ≠ REVIEW, červený test před opravou, rebuild před verify, max 3 iterace.
4. **Důkaz do `AUDIT/03_dukazy/A-###/`** — bez něj auditor neověřuje:
   - `commit.txt`: hash(e), branch, tag zálohy, `git diff --stat`
   - `cerveny_test.txt`: přesný příkaz + exit kód + výstup (zkrácený na 50 řádků) — PŘED (fail) i PO (pass)
   - `reprodukce.txt`: původní reprodukce z nálezu spuštěná PO opravě → musí selhat/vrátit bezpečný stav
   - `momentka_*.png` u user-facing položek: průchod z REÁLNÉHO vstupního bodu (touch emulace u mobile)
   - `regrese.txt`: `run_all` 0 failů (příkaz + exit kód)
   - `pojistka.txt`: co brání recidivě (soubor + jak se spouští + důkaz, že je ZAPOJENÁ — registrace hooku/lint pravidla v configu, ne jen soubor na disku)
   - `status`: `DONE` / `DONE_WITH_CONCERNS <co>` / `BLOCKED <proč>` / `NEEDS_CONTEXT <co>`
5. **Nic navíc**: diff dělá jen to, co položka žádá. Nesouvisející „vylepšení" = REVIEW P1 → zpět.
6. **Nemazat cizí soubory**, neměnit `AUDIT/` mimo `03_dukazy/`.
7. Otázky k položce → `AUDIT/03_dukazy/A-###/OTAZKA.md`; auditor odpoví v `04_verdikty/`. Bez odpovědi nepokračuj domněnkou u P0/P1.

## Položky (pořadí = priorita; v rámci priority nejdřív SSOT/architektura, protože ostatní opravy na ní stojí)
| # | ID | Priorita | Oblast | Název | AK (vč. vstupního bodu) | Červený test | Důkaz povinný | Odhad |
|---|---|---|---|---|---|---|---|---|
| 1 | A-001 | P0 | bezpečnost | … | … | `node tools/endpoint-probe.mjs …` → 0 nálezů pro endpoint | commit, test před/po, reprodukce, pojistka | S/M/L |
| 2 | … | | | | | | | |

Plný text každé položky: `AUDIT/01_nalezy/A-###.md` (Kapitán ho čte celý — subagentům předává plný text v promptu).

## Návrhy architektury (P2, samostatná dávka PO uzavření P0/P1 — vlastník schvaluje zařazení)
- ARCH-1: <např. policy vrstva oprávnění> — proč, co se změní, rizika, jak ověřit.
- ARCH-2: <rozdělení souboru X podle domén> — cílový strom, mapování, pořadí přesunů.
- ARCH-3: <SSOT: jeden DB klient / jeden zdroj konstant> — pojistka lint.

## Git praxe (GIT, P1 pokud je práce nezálohovaná)
- GIT-1: <nepushnuto N commitů / N dní> → push teď + pojistka: SessionStart `git pull --rebase`, Stop hook „ahead>0 → připomínka", pre-push rychlé testy; důkaz: `git-practice.mjs` po (ahead 0, dirty_oldest < 1 d)
- GIT-2: <commity > 1 000 řádků / zprávy wip> → pravidlo commit < 400 řádků, conventional commits; důkaz: 10 dalších commitů splňuje
- GIT-3: <main bez ochrany> → chráněná main + CI (tsc, lint, rychlé testy); důkaz: screenshot nastavení + běh CI
- GIT-4: <dlouhé větve / worktrees> → merge nebo smazat; důkaz: `git branch --no-merged` prázdné, worktrees ≤ 3

## Hygiena repa (HYG, P2 — před ARCH položkami, protože úklid odhaluje zdroje pravdy)
- HYG-1: archiv `<repo>-archiv/<datum>/` + `MANIFEST.txt` (cesta, SHA256, důvod) → teprve pak `git rm`; důkaz: manifest + `hygiene-scan` po (root_junk 0, tracked_binaries 0, untracked 0)
- HYG-2: dokumenty klasifikované KONFLIKTNÍ/ZASTARALÉ → jeden platný zdroj, ostatní `docs/archiv/<datum>_…` nebo smazat; důkaz: seznam + diff
- HYG-3: `.gitignore` doplněk + `.gitattributes` + pre-commit guard nainstalovaný (`.git/hooks/pre-commit`); důkaz: pokus o commit `.bat` v rootu = odmítnut
- HYG-4: binárky v historii > 1 MB → rozhodnutí vlastníka o `git filter-repo` (přepis historie, všichni re-clone) — auditor jen navrhuje
- Trvale: provizoria jen v `.tmp/tasks/<ID>/`, úklidový řádek v retru každé dávky

## Efektivita (viz `AUDIT/06_efektivita.md §Baseline`)
- EFF-1: <CLAUDE.md N řádků → jádro + skilly> — důkaz: diff + `efficiency-audit.mjs context` po
- EFF-2: <vypnout MCP servery X, Y (0 volání/7 dní)> — důkaz: `/mcp` výpis po
- EFF-3: <model routing agentů: fixer haiku→sonnet, reviewer opus→sonnet…> — důkaz: frontmattery
- EFF-4: <soubory nad prahem: …> — důkaz: `modules` sken po
- Měření PO provede auditor stejnou metodou po ≥ 5 dávkách / 7 dnech; Kapitán nic neměří sám za auditora.

## Co tento audit NEPROKÁZAL (povinné, ne dovětek)
- Netestováno: <produkční zápisy / plné E2E / obnova zálohy na odděleném stroji / souběh N uživatelů / …>
- Nedotčené produkční cesty: <…>
- Neměřené metriky: <…>
- Předpoklady `[NEZNÁMO]` z intake, na kterých nálezy stojí: <…>

## Komunikace
Vše přes bus (`BRIDGE.md`): `STATUS STARTED` při zahájení, `EVIDENCE --ref --sha` při dokončení, otázky `QUESTION`. Zpráva bez `--sha` a bez ref na `03_dukazy/` se neověřuje.

## Co Kapitán hlásí vlastníkovi
Jen netechnicky, po každé uzavřené položce jednou větou + odkaz na verdikt auditora. Technické QA se na vlastníka nepřenáší.
