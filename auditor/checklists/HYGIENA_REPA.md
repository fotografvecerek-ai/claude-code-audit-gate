# Checklist HYGIENA REPA — pořádek ve složkách, git bez binárek, hloubkový obsahový průchod

Nejčastější stav: agent si odkládá provizorní skripty, .bat, logy, screenshoty a kopie „kam ho napadne", root repa je skládka,
v gitu jsou binárky a v dokumentech žijí staré verze pravidel. Audit hygieny má 3 části: **inventura → obsahový průchod → řád + vynucení**.
Nástroj: `tools/hygiene-scan.mjs <repo>` (inventura strojově) + subagenti na obsahový průchod. Auditor nic nemaže — navrhuje, Kapitán provádí se zálohou.

## 1. Inventura (strojově, `hygiene-scan.mjs`)
| Kontrola | Práh | Nález |
|---|---|---|
| Soubory v rootu mimo allowlist (README, LICENSE, package.json, lockfile, configy nástrojů, CLAUDE.md, .gitignore, .env.example) | > 0 | seznam + návrh cílové složky |
| Junk vzory kdekoliv: `*.bak *.old *.orig *.tmp *~ *copy* *final* *test2* *_old *-backup debug.* *.log *.bat *.cmd *.ps1 *.sh` mimo `scripts/`, `nul`, `Thumbs.db`, `.DS_Store` | > 0 | seznam; skripty → `scripts/` s vlastníkem nebo smazat |
| Složky-skládky: `tmp/ temp/ old/ backup*/ archive*/ _*/ new/ test/ (mimo tests) misc/ stuff/` | > 0 | přesun mimo repo do archivu |
| **Binárky v gitu** (`git ls-files`): obrázky mimo `public|assets|docs/img`, `*.zip *.7z *.pdf *.xlsx *.docx *.mp4 *.apk *.exe *.dll *.db *.sqlite *.bin`, soubory s NUL bajty | > 0 | git rm --cached + `.gitignore` + archiv; velké i z historie (`git filter-repo` — jen se souhlasem vlastníka, přepisuje historii) |
| Velké soubory v historii (`git rev-list --objects --all`) | > 1 MB | seznam top 20 |
| `node_modules/`, `.next/`, `dist/`, `coverage/`, `playwright-report/` tracked | > 0 | 🔴 |
| Tajemství v tracked souborech (`.env`, `*.pem`, `*.key`, `credentials*.json`) | > 0 | 🔴 P0 (+ rotace klíče) |
| `.gitignore` chybí vzory pro OS/IDE/build/tmp/`.tmp/tasks` | | doplnit |
| Neodkazované soubory: `.md/.txt/.json/.sql/.py/.js` na které nic neodkazuje (grep názvu v repu) a > 60 dní bez commitu | | kandidáti na archiv |
| Duplicitní názvy souborů v různých složkách (`utils.ts` ×4, `README.md` ×6) | | kandidáti SSOT |
| Větve: sloučené nebo > 60 dní bez commitu; opuštěné worktrees; tagy bez release | | úklid |
| `TODO/FIXME/HACK` počet a stáří (git blame) | > 50 nebo > 180 dní | seznam |
| Untracked soubory v pracovním stromu (`git status --porcelain`) | > 0 při auditu | co to je, kdo vlastní |

## 2. Hloubkový obsahový průchod (subagenti, throwaway kontext, výstup JSON)
Každý dokument/konfig (`*.md *.txt *.json *.yaml *.toml *.env.example .claude/** docs/** scripts/**`) se OTEVŘE a klasifikuje:
`AKTUÁLNÍ` / `ZASTARALÝ` (odkazuje na neexistující soubory, verze, cesty, jména, „TODO 2025") / `DUPLICITNÍ` (totéž jinde — uveď kde) /
`KONFLIKTNÍ` (říká něco jiného než jiný dokument nebo kód — **starý zdroj pravdy**) / `NEZNÁMÝ` (nevíme účel ani vlastníka) / `TAJEMSTVÍ`.
Zvlášť hledej: staré verze pravidel (CLAUDE.md v1/v2, „pravidla_final"), víc README/HANDOFF/PREDANI souborů, konfigurace ve dvou formátech,
seznamy/číselníky duplikované v dokumentu i v kódu, „dočasné" poznámky starší 30 dní, skripty, které nic nevolá.
Pro každý soubor: `{cesta, typ, klasifikace, důkaz (řádek/odkaz), návrh: KEEP|MOVE→cíl|ARCHIVE|DELETE|MERGE→cíl, vlastník}`.
Konfliktní pravidla = SSOT nález P1 (viz ARCHITEKTURA_SSOT): určit JEDEN platný zdroj, ostatní smazat nebo označit „ARCHIV — neplatné od <datum>".

## 3. Řád (co má Kapitán dodržovat — auditor kontroluje při každém auditu)
1. **Cílová struktura** (příklad, přizpůsobit stacku): `src/` (kód podle domén) · `tests/` · `scripts/` (jen pojmenované, dokumentované, s vlastníkem) ·
   `docs/` (živá dokumentace; `docs/adr/` rozhodnutí; `docs/archiv/` s datem) · `.claude/` · `public|assets/` (jediné místo pro obrázky) ·
   `.tmp/tasks/<ID>/` (jediné místo pro provizoria, v `.gitignore`). Root = jen konfigurace a README.
2. **Task-owned provizoria**: každý dočasný soubor vzniká v `.tmp/tasks/<ID>/` s manifestem cest; před DONE se smaže vše, co není důkaz
   ani řešení; důkazy jdou do `AUDIT/03_dukazy/<ID>/` (mimo repo). Užitečný skript → `scripts/` + název + vlastník + test, jinak pryč.
3. **Git = jen zdrojový kód a textová konfigurace.** Žádné binárky mimo `public|assets`, žádné logy, screenshoty, exporty, dumpy, zipy.
   `.gitattributes` + pre-commit guard (`kapitan-side/hygiene/pre-commit-guard.sh`) to blokuje deterministicky.
4. **Archiv místo mazání**: nepotřebné, ale ne-zjevně-bezcenné → `<repo>-archiv/<YYYY-MM-DD>/` **mimo repo** s `MANIFEST.txt` (cesta, SHA256, důvod, kdo).
   Smazat bez archivu smí jen soubory z vlastního `.tmp/tasks/<ID>/`. Cizí/nejasný soubor se nemaže — jde do nálezu `NEZNÁMÝ`.
5. **Dokumentace**: jeden README, jeden CLAUDE.md, jeden HANDOFF (živý); staré verze → `docs/archiv/` s datem v názvu nebo smazat.
   Každý dokument má na začátku „platí od / vlastník / nahrazuje". Konflikt = SSOT nález.
6. **Úklidový záznam** v retru dávky: `ÚKLID: odstraněno N, archivováno N (manifest), zachováno <seznam+důvod>, root junk 0, untracked 0`.

## 4. Vynucení (mechanika, ne apel)
- `kapitan-side/hygiene/pre-commit-guard.sh` (git hook v repu): blokuje commit binárek/zakázaných přípon/souborů > 1 MB/junk vzorů/nových souborů v rootu mimo allowlist. Exit 1 = commit neprojde.
- `kapitan-side/kapitan-audit-guard.js` (PreToolUse): blokuje **zápis** nového souboru do rootu repa mimo allowlist a zápis junk přípon mimo `.tmp/tasks|scripts|tests|docs|public|assets`.
- `.gitattributes` šablona (`kapitan-side/hygiene/gitattributes.template`) + `.gitignore` doplněk (`gitignore.addendum`).
- Auditor při každém auditu: `hygiene-scan.mjs` → počet root junk, tracked binárek, untracked = **plošné AK = 0**; obsahový průchod jen u změněných/nových dokumentů od minula.

## Výstup
JSON `{id, kategorie: root_junk|binarka|skladka|tajemstvi|zastaraly_dokument|konfliktni_pravidlo|neodkazovany|vetve, cesty[], dukaz, navrh (KEEP|MOVE|ARCHIVE|DELETE|MERGE + cíl), priorita, pojistka}`.
