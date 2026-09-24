# Checklist UI, DESIGN a FUNKČNOST (Playwright)

Prostředí: lokální build (`VERIFY_PROSTŘEDÍ` z projektu), nikdy produkce bez souhlasu. Viewporty:
`mobile` 390×844 `{isMobile:true, hasTouch:true}`, `tablet` 768×1024, `desktop` 1440×900.
Každý FAIL = screenshot do `AUDIT/01_nalezy/momentky/<A-id>_<viewport>.png` + selektor + hodnoty.

## 1. Funkční inventář (každá funkce aplikace)
Pro každou položku `AUDIT/00_intake.md §Funkce`:
- [ ] **Vstupní bod**: funkce je dosažitelná z reálného UI (menu → obrazovka → tlačítko), ne jen přes URL/API. AK jmenuje přesnou cestu.
- [ ] **Happy path** funguje podle záměru (vlastníkova formulace „co má udělat") → PASS s momentkou.
- [ ] **Datová strana**: výsledek je vidět v datech (seznam vrátí >0, DB řádek existuje) — UI OK + prázdná data = FAIL.
- [ ] **Negativní cesty**: prázdný formulář, neplatná hodnota, dlouhý text (500 znaků), diakritika ščřž, emoji, extrémní čísla → validační hláška, ne 500/zamrznutí.
- [ ] **Stavové cesty**: offline/pomalá síť (Playwright `route` delay 3 s) → loading stav, žádný dvojitý submit, žádná ztráta vstupu.
- [ ] **Oprávnění**: funkce skrytá pro roli, která ji nemá — a zároveň blokovaná na serveru (viz BEZPEČNOST A).
- [ ] **Idempotence**: dvojklik/Enter dvakrát → jeden záznam.
- [ ] **Persistence**: reload stránky po akci → stav zůstal.

## 2. Vizuální integrita (automaticky, `tools/playwright/ui-sanity.spec.ts`)
- [ ] **Překryvy**: žádné dva viditelné interaktivní prvky (button, a, input, [role=menuitem]) se nepřekrývají (průnik bounding boxů > 4 px²), pokud nejsou rodič/potomek.
- [ ] **Pořadí vrstev**: pro střed každého interaktivního prvku `document.elementFromPoint()` vrací tento prvek nebo jeho potomka — jinak ho něco překrývá (sticky header, toast, backdrop, ikona).
- [ ] **Ořezaný text**: `scrollWidth > clientWidth` u prvků bez `overflow:hidden` záměru (labely, tlačítka, buňky tabulky) → seznam.
- [ ] **Horizontální scroll**: `document.documentElement.scrollWidth <= innerWidth` na každé obrazovce/viewportu.
- [ ] **Ikony a obrázky**: `img.naturalWidth === 0`, SVG s 0×0, chybějící ikona (prázdný `<svg>` bez `<path>`).
- [ ] **Velikost cílů**: interaktivní prvky ≥ 24×24 px (WCAG 2.2 2.5.8), na mobile doporučeno ≥ 44 px.
- [ ] **Console**: 0 `pageerror`, 0 `console.error` (hydration mismatch, failed fetch) na každé obrazovce.
- [ ] **Vizuální regrese**: `toHaveScreenshot` baseline per obrazovka × viewport (masky na dynamický obsah, `animations:'disabled'`). Baseline se schvaluje po prvním auditu; diff > threshold = nález.

## 3. Menu, dropdowny, Settings (logika)
- [ ] Dropdown: otevře klikem/Enter/Space; zavře klikem mimo, Escape, výběrem; **nejvýš jeden otevřený** současně; šipky ↑↓ procházejí položky; focus se po zavření vrátí na trigger.
- [ ] Dropdown nevyjíždí mimo viewport (bounding box uvnitř `innerWidth/innerHeight`), na mobile se přepíná na sheet/fullscreen.
- [ ] Menu/Settings: **stejné pořadí a názvy** položek napříč obrazovkami (extrakce textů → porovnání); žádná položka vede na 404; aktivní položka zvýrazněna.
- [ ] Settings uspořádání: skupiny logicky (Účet → Tenant → Fakturace → Integrace → Nebezpečná zóna), destruktivní akce vizuálně oddělené + potvrzení.
- [ ] Modály: focus trap, Escape zavře, backdrop klik zavře (nebo záměrně ne — musí být uvedeno v intake), scroll body zamčený.
- [ ] Toasty nepřekrývají primární akci déle než 5 s, jsou zavíratelné.

## 4. Formuláře a tabulky
- [ ] Label u každého inputu (axe `label`), chybová hláška u pole, ne jen nahoře; submit disabled během odeslání.
- [ ] DataTable: řazení/filtr/stránkování drží stav v URL nebo storage; prázdný stav má text + akci; 1000 řádků → longtask < 200 ms.
- [ ] Datum/čas/měna v cs-CZ formátu (24. 9. 2026, 1 234,56 Kč), DPH zaokrouhlení konzistentní s PDF.

## 5. Přístupnost a výkon
- [ ] axe-core (tagy `wcag2a, wcag2aa, wcag22aa`) → 0 `critical`/`serious`; `moderate` = P3 seznam.
- [ ] Klávesnice: celý hlavní flow (login → vytvořit záznam → uložit) bez myši; viditelný focus.
- [ ] Kontrast ≥ 4.5:1 text, ≥ 3:1 UI komponenty (teal brand ověřit).
- [ ] Lighthouse (pokud je): LCP < 2.5 s, CLS < 0.1, INP < 200 ms na hlavních obrazovkách lokálního prod buildu.

## 6. Konzistence designu
- [ ] Jeden zdroj tokenů (Tailwind theme/shadcn): grep hardcoded hex barev mimo theme → počet; nekonzistentní spacing/radius = P3.
- [ ] Stejná akce = stejné tlačítko (primary/secondary), ikony z jedné sady, žádné emoji v UI (vlastníkovo pravidlo).
- [ ] Texty: UTF-8 diakritika bez „?" nebo mojibake; žádné anglické zbytky v CZ UI (sken všech obrazovek → počet).

## Výstup
JSON `{id, obrazovka, viewport, kategorie, selektor, pozorovani, screenshot_path, priorita, navrh_reseni, cerveny_test}`.
