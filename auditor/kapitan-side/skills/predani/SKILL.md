---
name: predani
description: Předání práce do čistého okna — použij, když vlastník napíše „předání", „předej", „handoff", „končíme", „uklidíme stůl" nebo chce /clear; také sám po uzavření úlohy K-###/A-###, když další úloha nesouvisí nebo je kontext nad ~150 tis. tokenů. Zapíše stav do .claude/STATE.md, který se po /clear vloží sám.
---

# Předání (čistý stůl bez ztráty rozdělané práce)

Každý krok znovu čte celý kontext okna — dlouhé okno stojí víc a model v něm dělá víc chyb. Automatická kompakce je ztrátová a nevíš, co vypadlo.
Proto před přechodem na nesouvisející úlohu (a u velkého kontextu) zapiš předání sám a vlastník dá `/clear`. Hook `stav-session` po `/clear`
i po kompakci vloží `.claude/STATE.md` do nového kontextu — **vlastník nic nekopíruje**.

## Postup
1. Projdi celou session (ne jen poslední tahy): úlohy, rozhodnutí vlastníka, co je commitnuté, co rozdělané, co běží na pozadí.
2. **Nic nedohledávej** (žádný `git log`, žádné procházení složek) — zapisuješ, co se v této session stalo. Co nevíš, nepiš.
3. Přepiš `.claude/STATE.md` (Codex: `.codex/STATE.md`) touto strukturou, **max 60 řádků**; prázdná sekce = „nic" (sekce nevynechávej):

```
# STAV — <o čem práce je, 1 řádek> (<datum a čas>)
## Cíl a dohodnutý plán
<cíl vlastníka, plán po krocích; kde v plánu jsme>
## Hotovo a rozhodnuto
- <co, proč, kde (cesta), commit>  · rozhodnutí vlastníka s datem
## Rozdělané
- <úloha K-###/A-###, v jakém stavu, co chybí; necommitnuté soubory>
## Klíčové soubory
- <cesta od kořene repa> — <proč je číst jako první>
## Běží / čeká
- procesy na pozadí (ID, co dělají, jak ukončit), porty, větve/worktree, hlídač mostu, čekání na verdikt auditora — nebo „nic"
## Jak ověřit, že vše funguje
- `<příkaz>` → <očekávaný výsledek>
## Odloženo a otevřené otázky
- Odloženo: <co> — <proč>   · Otevřené: <otázka pro vlastníka>
## Pokračuj tady
<1–2 věty: přesně jeden další krok>
```

4. Kanban (`.claude/KANBAN.md`) uprav, jen pokud se změnil stav položky. Nic dalšího nezapisuj (žádná retrospektiva, žádné hodnocení).
5. Vlastníkovi napiš jednu větu v jeho jazyce: „Předání uloženo do .claude/STATE.md. Napiš `/clear` — nové okno naváže samo." Nic víc.

## Pravidla
- Nevymýšlej stav: co se nestalo nebo neověřil jsi, nepiš jako hotové (ověřeno · předpoklad · neověřeno).
- Cesty přesně, příkazy spustitelné; žádná tajemství, tokeny ani hesla (ani jejich část).
- `/clear` nespouštíš sám a neradíš ho uprostřed rozdělaného kroku — nejdřív dokonči krok nebo ho zapiš do „Rozdělané".
- Nesouvisející nový požadavek vlastníka uprostřed práce = kanban, ne nové téma v tomtéž okně (viz role Kapitána).
