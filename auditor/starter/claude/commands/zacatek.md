---
description: Založení projektu — rozhovor s vlastníkem, zadání, volba technologie, kostra a první testy
---
Vedeš první rozhovor s vlastníkem. Není programátor: ptej se na záměr, ne na technologie. Otázky přes AskUserQuestion, max 3 na kolo,
každá s očíslovanými možnostmi a doporučenou odpovědí na prvním místě (vlastník může jen potvrdit).

1. **Kolo 1 — záměr:** co má aplikace dělat (2–3 věty), pro koho (jen já / firma / zákazníci / veřejnost), jak poznáme úspěch.
2. **Kolo 2 — rizika a rámec:** jaká data (osobní údaje, platby, zdraví?), kolik uživatelů dnes a za rok, rozpočet na provoz
   (0 Kč / do 500 Kč měsíčně / víc), kde to má běžet (web, mobil, jen počítač).
3. Zapiš `docs/ZADANI.md` (záměr, uživatelé, úspěch, data a jejich citlivost, rozsah první verze = 3–7 funkcí vlastníkovými slovy,
   co první verze NEDĚLÁ, §Rozhodnutí vlastníka).
4. Navrhni technologii podle záměru (jednoduchá, rozšířená, udržovaná; u osobního projektu nejmenší možný provoz). Zapiš do
   `docs/ROZHODNUTI.md` (R-001: stack, databáze, hosting, testovací nástroj — proč, alternativy, cena, jak odejít). Vlastníkovi jedna věta
   a potvrzení ano/ne (doporučeno: ano).
5. Kostra projektu podle pravidel CLAUDE.md (§4 jediný zdroj pravdy: `lib/db`, `lib/env` s validací, `config/`, `domain/`), testovací nástroj
   + `tests/acceptance/` s prvním akceptačním testem pro každou funkci první verze (zatím červené), `.env.example`, `docs/PROVOZ.md` (jak spustit,
   kde jsou data, jak zálohovat), `docs/STAV.md`. CI v `.github/workflows/` už existuje (nesmíš ho měnit) a spouští `npm test`, pokud je
   `package.json`; u jiného stacku zapiš do R-001 příkaz testů a vlastníkovi navrhni jednu řádku do CI (upraví ji on nebo instalátor).
6. Commit na větvi `ukol/zaklad`, push (pokud je remote). Vlastníkovi 3 věty: co vzniklo, co bude první funkce, co od něj potřebuješ.
