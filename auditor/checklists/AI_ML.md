# AI/ML — checklist (modely, embeddingy, vyhledávání, překlad, doporučování)

AI funkce je **položka inventury s metrikou**, ne „research". Stav uzavíráš z běhu (proces, port, log, odpověď), ne z příznaků v kódu
(`DISABLE_AI`, chybějící knihovna = nanejvýš hypotéza).

## 1. Inventura (pro každý model / index / službu)
- [ ] Kde běží (lokální proces a port / cloud API / sidecar), kdo ho spouští (služba, plánovač), kde je log.
- [ ] Verze modelu a indexu, kdy byl index naposledy přestavěn, jak dlouho přestavba trvá.
- [ ] Závislosti: klíč API (kde uložen), kvóty a limity, cena za 1 000 dotazů (ověřit u poskytovatele v den auditu).

## 2. Pokrytí (číslo, ne dojem)
- [ ] Kolik položek, které má AI pokrývat, skutečně pokrývá: `pokryto / celkem` (např. záznamy s embeddingem / všechny záznamy).
      Počítá se nezávisle (SQL / skript), ne z tvrzení aplikace. Pokrytí < 95 % u funkce, kterou vlastník používá denně = nález P1.
- [ ] Jazyková vrstva: dotazy v jazycích, které uživatelé reálně používají (překlad, diakritika, synonyma) — 5 dotazů na jazyk.

## 3. Výpadek a fallback
- [ ] Co uživatel uvidí, když AI neběží (proces zastavený v testovací instanci / API vrací chybu): srozumitelná hláška, nebo tichý prázdný výsledek?
      Tichý prázdný výsledek = nález P1 (uživatel si myslí, že nic neexistuje).
- [ ] Automatický restart a alert při pádu (propojit s `PROVOZ_ZALOHY.md §0` — restarty za 30 dní).

## 4. Studený start
- [ ] **Povinný test „první dotaz po 15 minutách klidu"**: čas odpovědi prvního dotazu vs. dalších; > 5 s nebo timeout = nález (P1 u denní funkce).
- [ ] Po restartu služby: kdy je AI znovu použitelná (načtení modelu/indexu), co vidí uživatel mezitím.

## 5. Kvalita výsledků (jen proti nezávislé pravdě)
- [ ] 10 dotazů s předem známou správnou odpovědí (připraví vlastník nebo auditor z dat): kolik je v top-5. Kritérium stanov PŘED během.
- [ ] Deterministické části (filtry, řazení, stránkování kolem AI) testuj jako běžné funkce — kombinace proti SQL (Fáze 2 bod 0).

## Výstup
Řádek ve ZPRAVĚ „co z AI funguje / pokrytí / studený start" a nálezy `A-###`; co jsi netestoval do hloubky → sekce ZPRAVY
„Co jsem NEtestoval do hloubky" s otázkou `Qn`.
