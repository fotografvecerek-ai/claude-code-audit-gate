---
description: Kontrola „hotovo" před ohlášením vlastníkovi
---
Než řekneš vlastníkovi „hotovo", projdi a dolož výstupem příkazů (ne tvrzením):
1. Akceptační test úkolu byl červený a teď je zelený (ukaž oba běhy nebo commit s červeným testem).
2. Celá sada testů zelená (`--reporter=dot` / tichý výstup).
3. Změna je zapojená: route/komponenta registrovaná, migrace aplikovaná, konfigurace načtená — ověř průchodem z reálného vstupního bodu.
4. `git status` čistý, nic v rootu mimo pravidla, `.tmp/tasks/<ID>/` smazané, žádný nový soubor nad 500 řádků bez návrhu rozdělení.
5. `docs/STAV.md` aktualizovaný (1–2 řádky). Commit + push větve.
6. Týká se úkol přihlášení, oprávnění, osobních dat nebo peněz? → kontrolor (režim B) před ohlášením.
Pak vlastníkovi jedna netechnická věta. Status: HOTOVO / HOTOVO S VÝHRADOU <co> / BLOKOVÁNO <proč> / POTŘEBUJI <co>.
