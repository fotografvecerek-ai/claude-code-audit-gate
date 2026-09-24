# Checklist GIT PRAXE — jak často a jak se projekt zálohuje do gitu (commit · push · merge)

Git je první záloha kódu. Práce, která je jen na jednom stroji, není zálohovaná. Nástroj: `tools/git-practice.mjs <repo> --days 90`
→ `AUDIT/01_nalezy/git-practice.json`. Přes více strojů spusť na každém (nepushnutá práce je vidět jen lokálně) a porovnej
`remote_last_commit_age_days`.

## 1. Metriky a prahy
| Metrika | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| Remote existuje a je dosažitelný | ano | — | žádný remote / push selhává |
| Commity za týden (v aktivním období) | ≥ 5 | 2–4 | < 2 při aktivní práci |
| Mezery bez commitu při aktivní práci | ≤ 3 dny | 4–7 | > 7 dní (kód žije jen na disku) |
| Nepushnuté commity (`ahead_of_remote`) | 0 na konci dne | ≤ 5 / < 24 h | > 20 nebo > 7 dní |
| Rozpracované změny bez commitu (`dirty_oldest_age_days`) | < 1 den | 1–3 | > 3 dny |
| Velikost commitu | < 400 řádků, < 20 souborů | do 1 000 | > 1 000 řádků / > 40 souborů (nelze review, nelze bisect) |
| Zprávy (`bad_messages_ratio`: wip/fix/update/.) | < 10 % | 10–30 % | > 30 % |
| Feature větve | < 7 dní, mergnuté | < 14 | > 14 dní nebo nikdy nemergnuté (`long_lived_over_14d`) |
| Merge strategie | jedna (merge --no-ff nebo squash/rebase) konzistentně | mix | nic — všechno přímo do main bez review/CI |
| Tagy/release | každý deploy má tag (kotva pro REVIEW diff a rollback) | občas | žádné |
| Stashe | 0 | 1–2 | > 2 (zapomenutá práce) |
| Ochrany | pre-commit + pre-push/CI + chráněná main | částečně | nic |

## 2. Co auditor ověří ručně
- **Více strojů** (notebook + workstation): stejná větev na obou? Konflikty řešené jak? Existuje pravidlo „pull před prací, push po práci"? (LOCK protokol ze skillu uzavřená smyčka řeší soubory, ne synchronizaci strojů.)
- **Agenti a git**: Kapitán commituje jmenovitě s pathspec (skill §1), FIX subagent nikdy `git add -A`; auditor zkontroluje vzorek 20 posledních commitů na cizí soubory.
- **Push = záloha**: kdy naposledy remote dostal commit (`remote_last_commit_age_days`) vs. kdy se naposledy pracovalo (mtime souborů, session logy). Rozdíl > 1 den při aktivní práci = 🔴 nález „nezálohovaná práce".
- **Release kotvy**: `git tag v<verze>` po každém deployi (DEPLOY_SEKVENCE) — chybí = REVIEW nemá diff základ.
- **Historie**: rewrite (`force push`) na sdílených větvích v reflogu remote? Tajemství v historii (viz HYGIENA).
- **Obnovitelnost**: `git clone` z remote na čistý stroj + build + testy = funguje? (kód bez lokálních necommitnutých souborů)

## 3. Návrh řádu (do handoffu jako GIT-1…, pojistky mechanické)
1. **Commit**: po každém uzavřeném kroku (červený test → zelený), max 400 řádků, zpráva `typ(scope): co a proč` (conventional commits); Kapitán jmenovitě s pathspec.
2. **Push**: minimálně na konci každé dávky a každého dne; hook Kapitána nebo `Stop` hook: `ahead_of_remote > 0` na konci session → připomínka/blok. Přes více strojů `git pull --rebase` před startem session (SessionStart hook).
3. **Větve**: `main` chráněná (CI + gate-check), práce v `audit/A-###` nebo `feat/...`, merge do main jen po VERIFY/REVIEW; větev smazat po merge, worktree odstranit.
4. **Tagy**: `v<verze>` při každém vydání (už v DEPLOY_SEKVENCI skillu); `audit-pre-A-###` před každým auditním zásahem.
5. **CI**: minimálně `tsc + lint + rychlé testy` na push (GitHub Actions) — i pro solo vývojáře je to nezávislý běh mimo stroj.
6. **Pojistky**: pre-commit (hygiena), pre-push (rychlé testy/`node --check`), chráněná main na GitHubu (žádný force push, PR nebo alespoň status check).

## Výstup
JSON `{id, metrika, hodnota, prah, verdikt, dukaz (výstup git-practice.mjs / git log), navrh_reseni, pojistka}` + do handoffu sekce GIT.
