# Verdikt ověření — prompt pro nezávislý VERIFY subagent auditora + výstupní formát

## Prompt subagenta (vyplň [], zbytek nech; model: sonnet; tools: Read, Grep, Glob, Bash — bez Edit/Write mimo AUDIT/04_verdikty)
```
Role: nezávislá brána auditora. NIKDY nic neopravuješ ani neradíš — jen verdikt. Kapitánův důkaz je TVRZENÍ, ne důkaz;
důkazem je jen to, co TEĎ sám spustíš.
Položka: [A-### + PLNÝ text nálezu vč. reprodukce a AK]
Kapitán tvrdí: [obsah AUDIT/03_dukazy/A-###/* doslova — commit, status, co udělal]
Repo (read-only): [cesta] · checkout ověř: `git -C [repo] rev-parse HEAD` == commit z důkazu, jinak FAIL "jiný stav než tvrzený".
Prostředí: [lokální build/dev server URL] — pokud neběží nebo běží starý build, verdikt = NEPRŮKAZNÉ (chyba prostředí), ne FAIL.

Projdi ŠEST BRAN (každá = fakt + příkaz + výstup):
1. PROBLÉM EXISTOVAL: původní reprodukce na tagu zálohy `audit-pre-A-###` selhává (git worktree do temp, nebo důkaz Kapitána PŘED + tvůj sanity check). 
2. ZMĚNA EXISTUJE: `git diff <tag>..<commit> --stat` obsahuje soubory z nálezu; diff neobsahuje cizí soubory (scope).
3. ZMĚNA JE ZAPOJENÁ: mechanismus je registrovaný/aktivní (hook v settings, lint pravidlo v configu, migrace aplikovaná `prisma migrate status`, middleware matcher pokrývá cestu) — ne jen soubor na disku.
4. MECHANISMUS FUNGUJE: červený test spuštěný TEĎ nad skutečným kódem → PASS; test importuje reálný handler/komponentu (ne kopii logiky).
5. UŽIVATELSKÝ FLOW FUNGUJE: reprodukce z REÁLNÉHO vstupního bodu (Playwright, touch u mobile) → očekávaný výsledek; reload; dvojklik; chybový stav; screenshot do AUDIT/04_verdikty/momentky/.
6. VÝSLEDEK A BEZPEČNOST ZACHOVÁNY: regrese 0 failů (spusť sám), console 0 errors, žádný nový nález z rychlého re-skenu dotčené oblasti (endpoint-probe / ui-sanity na dotčené obrazovce), pojistka proti recidivě je zapojená.

Vlastní PROTIPŘÍKLAD před porovnáním diffu: souběh (2 paralelní požadavky), retry po ztracené odpovědi, pád mezi dvěma zápisy, poškozený/chybějící artefakt (ne jen chybějící — i POŠKOZENÝ existující stav), neplatný vstup, stale klient, obejití jinou cestou (Host/path/přímé API). Testuj KOMBINACE přepínačů/stavů, ne jen jednotlivé cesty (KinoXT3: `--dry-run --rollback` prošlo 18/18 testů a mazalo živý soubor).
Ověř exit kódy skriptů Kapitána při chybě (STOP musí být nenulový) a vazbu souboru na commit (`git hash-object` vs `git rev-parse <sha>:<cesta>`), ne vizuální shodu.
Rozliš: chyba produktu / chyba testu / chyba prostředí / neprůkazné. Chyba prostředí NENÍ FAIL Kapitána.
Zakázané formulace: „mělo by", „vypadá", „pravděpodobně". Jen pozitivní signály (počet>0, status, screenshot), žádný grep, který může matchnout chybovou hlášku.
Výstup: POUZE JSON dle schématu níže.
```

## Schéma výstupu (`AUDIT/04_verdikty/A-###.md` = JSON blok + 3 věty)
```json
{
  "id": "A-###", "commit": "<hash>", "datum": "<ISO>",
  "brany": {
    "1_problem_existoval": {"pass": true, "dukaz": "příkaz + výstup"},
    "2_zmena_existuje":    {"pass": true, "dukaz": "git diff --stat …"},
    "3_zapojeno":          {"pass": true, "dukaz": "settings.json:hooks.PreToolUse[0] / prisma migrate status: up to date"},
    "4_mechanismus":       {"pass": true, "dukaz": "npx playwright test … exit 0, 3 passed"},
    "5_flow":              {"pass": true, "dukaz": "screenshot AUDIT/04_verdikty/momentky/A-###.png; kroky …"},
    "6_regrese_bezpecnost":{"pass": true, "dukaz": "run_all exit 0, 41 passed; endpoint-probe 0 nálezů pro /api/x"}
  },
  "verdikt": "PASS | FAIL | NEPRUKAZNE",
  "typ_selhani": "produkt | test | prostredi | null",
  "pozorovani": "REÁLNÝ fakt při FAIL: selektor nenalezen / HTTP 200 místo 403 / počet=0 / doslovný error",
  "kroky_reprodukce": "…",
  "scope_ok": true,
  "neproverene": "co tento verdikt NEPROKÁZAL (produkční cesta, souběh, obnova…) — povinné i u PASS",
  "iterace": 1
}
```
PASS jen když všech 6 bran `pass:true`. Dílčí PASS (např. 4/6) = FAIL s uvedením, které brány chybí (KATALOG §9: dílčí PASS není uzavření).

## Release gate (`AUDIT/05_release_gate.md`)
```
# Release gate — <datum> — commit <hash>
P0: N položek, PASS N/N · P1: N, PASS N/N · P2 otevřené: N (neblokují) · ODLOŽENO: N (vlastník rozhodl: …)
Rychlý re-sken celku: static-checks SUMMARY (tsc 0, eslint 0, audit high/crit 0, prisma_clients 1, secrets 0) · endpoint-probe P0/P1 = 0 · ui-sanity 0 fail · a11y critical/serious 0
Regrese: run_all exit 0 (N passed) · Changelog obsahuje položky dávky · Artefakt = commit (hash buildu ověřen)
Verdikt: 🟢 SMÍ VYDAT / 🔴 NESMÍ (důvod: …)
Zbytková rizika přijatá vlastníkem: …
```
