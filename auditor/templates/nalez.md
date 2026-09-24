# A-### — <krátký název> 

| Pole | Hodnota |
|---|---|
| **Třída důkazu** | `REPRODUKOVANÁ CHYBA` (vlastní bezpečný vstup, očekávaný × skutečný výsledek, verze) / `STATICKY DOLOŽENÉ RIZIKO` (průchod kódem + protipříklad, dopad nereprodukován) / `HYPOTÉZA K OVĚŘENÍ` (indicie bez důkazu příčiny/dopadu) / `MEZERA V DŮKAZU` (Kapitán tvrdí PASS, test neověřuje správný stav/artefakt/izolaci/flow) |
| Priorita | P0 (únik/ztráta dat, obejití auth) / P1 (funkce nefunguje, špatná autorizace, SSOT u peněz/oprávnění) / P2 (UX, kvalita, duplicita) / P3 (kosmetika) |
| Pravděpodobnost × dopad | nízká/střední/vysoká × nízký/střední/vysoký → 🔴/🟡/🟢 |
| Oblast | bezpečnost / funkce / UI / a11y / SSOT / architektura / efektivita |
| Standard | např. `OWASP A01:2025`, `ASVS v5.0.0-8.2.1`, `WCAG 2.2 2.5.8` (verze ověřena: ano/ne) |
| Místo | `soubor:řádek`, endpoint, obrazovka + viewport |
| Datum / commit | <datum> / `<hash>` auditovaného stavu |

## Pozorování (fakt, ne interpretace)
- Co přesně bylo vidět: HTTP status, selektor, hodnota, console error, počet.

## Reprodukce
1. Vstupní bod v UI (menu → obrazovka → prvek) nebo příkaz probe/testu.
2. …
Důkaz: `AUDIT/01_nalezy/momentky/A-###_*.png` / výstup: `AUDIT/01_nalezy/static/…`

## Záměr funkce (z intake / [NEZNÁMO — předpoklad])
Co má funkce dělat podle vlastníka; proč je pozorování v rozporu.

## Dopad
Co se stane uživateli/byznysu, když se to neopraví (konkrétní mechanismus, ne obecné varování).

## Návrh řešení (NÁVRH — Kapitán rozhoduje o implementaci)
- **Doporučená varianta**: co, kde (soubor/vrstva), proč tahle.
- Alternativa: … (kdy dává smysl).
- Náčrt (max 15 řádků pseudokódu/signatur, označený NÁVRH):
  ```
  ```
- **Pojistka proti recidivě**: lint pravidlo / test v gate / generátor / hook.
- **Lepší design (volitelné, jen P0/P1)**: jak to řešit systémově, ne bodově (např. policy vrstva místo kontroly v každém handleru).

## Červený test (selhává TEĎ, po opravě musí projít)
Přesný příkaz/soubor: `npx playwright test tools/playwright/…` / `node tools/endpoint-probe.mjs … | jq '.findings[] | select(.endpoint=="…")'` / `grep -c … = 0`.

## Akceptační kritérium pro Kapitána
Objektivně ověřitelný výrok vč. vstupního bodu: „Po `<cesta v UI>` … vrátí …; červený test PASS; původní reprodukce FAIL."

## Co chybí k uzavření
Přesný diff (jen jmenované soubory) · RED test před / GREEN po (oba znovu spuštěné auditorem) · kontrola neúmyslných změn · nezávislý review · nová kontrola dotčené brány · **kombinace stavů/přepínačů**, ne jen jednotlivé cesty.

## Zbytkové riziko po opravě
Co zůstane i po nápravě a proč je přijatelné / co by ho snížilo.
