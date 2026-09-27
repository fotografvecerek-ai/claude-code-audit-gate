---
name: predani
description: Předání auditu do čistého okna — použij, když vlastník napíše „předání", „předej", „handoff", „uklidíme stůl" nebo chce /clear; také sám po dokončení vlny, když je kontext nad ~150 tis. tokenů. Zapíše stav do AUDIT/_prubeh.md, který se po /clear vloží sám.
---

# Předání auditu (čistý stůl bez ztráty rozjetého auditu)

Každý krok znovu čte celý kontext okna; kompakce je ztrátová a nevíš, co vypadlo. Po dokončené vlně proto zapiš předání a doporuč vlastníkovi
`/clear`. Hook `stav-session` po `/clear` i po kompakci vloží `AUDIT/_prubeh.md` do nového kontextu — vlastník nic nekopíruje.

## Postup
1. Projdi celou session: vlny, nálezy, verdikty, zprávy na mostu, rozhodnutí vlastníka, co běží na pozadí.
2. Nic nedohledávej (žádné procházení AUDIT/ ani repa) — zapisuješ, co se v této session stalo.
3. Na začátek `AUDIT/_prubeh.md` dej sekci předání (celý soubor dál ≤ 1 obrazovka; starší průběh zkrať nebo přesuň do `AUDIT/_archiv/`):

```
# PŘEDÁNÍ — <datum a čas>
- Cíl auditu a vlna: <kde v plánu jsme; top-3 funkce vlastníka>
- Hotovo: <vlny, nálezy A-### (priorita), verdikty, ZPRAVA/gate aktualizovány?>
- Rozdělané: <co, v jakém stavu, co chybí>
- Čeká: <na Kapitána (ID, od kdy), na vlastníka (Qn)>; hlídač mostu na pozadí: <ID procesu / nic>
- Běží: <build-env port a PID, jiné procesy na pozadí — nebo nic>
- Klíčové soubory: <cesty, které další krok potřebuje>
- Jak ověřit: `<příkaz>` → <výsledek>
- Neprokázáno / otevřené otázky: <…>
- Pokračuj tady: <jeden další krok>
```

4. Vlastníkovi jedna věta v jeho jazyce: „Předání uloženo do AUDIT/_prubeh.md. Napiš `/clear` — okno naváže samo." Po `/clear` znovu spusť hlídače mostu, byl-li spuštěný.

## Pravidla
- Nevymýšlej stav; rozlišuj ověřeno (tvůj běh) · tvrzení Kapitána · neověřeno. Žádná tajemství v textu.
- Nález, verdikt ani handoff neměníš kvůli předání — jen zapisuješ, kde jsou.
