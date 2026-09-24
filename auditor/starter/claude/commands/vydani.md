---
description: Vydání (deploy / push do main) — jen s verdiktem kontrolora 🟢
---
1. Pracovní strom čistý, vše commitnuté, větev sloučená do `main` lokálně (bez pushe).
2. Spusť subagenta **kontrolor** v režimu C (vydání) pro aktuální `HEAD`. Nic mu nevysvětluj navíc.
3. 🔴 → oznam vlastníkovi důvody jednou větou, oprav, opakuj. 🟢 → commitni `docs/kontrola/` a teprve pak push do `main` / deploy.
   `release-check` to vynutí; „VYDÁNÍ BLOKOVÁNO" znamená, že se od verdiktu změnil kód nebo verdikt chybí — neobcházej to.
4. Po vydání: ověř, že běží (hlavní průchod na produkci, jen čtení), zapiš do `docs/STAV.md` a jednu větu vlastníkovi.
