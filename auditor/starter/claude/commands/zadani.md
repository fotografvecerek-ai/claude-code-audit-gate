---
description: Nové zadání od vlastníka — nejdřív akceptační test, pak kód
argument-hint: popis toho, co má aplikace nově umět
---
Nové zadání: $ARGUMENTS

1. Přepiš zadání do 1–3 akceptačních kritérií vlastníkovými slovy („z <vstupního bodu v UI> uživatel <role> udělá X a uvidí Y").
   Nejasné → jedna otázka přes AskUserQuestion s doporučenou odpovědí; jinak pokračuj s označeným předpokladem.
2. Zapiš je do `docs/ZADANI.md §Funkce` a jako test do `tests/acceptance/`. Spusť — musí být ČERVENÝ (jinak testuje něco jiného).
3. Teprve pak implementace na větvi `ukol/<co>` podle CLAUDE.md. Hotovo = `/hotovo`.
4. Zadání se týká přihlášení, oprávnění, osobních dat nebo peněz → po dokončení požádej kontrolora o ověření (režim B), ne jen vlastní test.
