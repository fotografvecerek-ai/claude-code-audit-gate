# Intake dotazník — co se auditor ptá vlastníka PŘED auditem

Pravidla: přes AskUserQuestion, max 3 otázky na kolo, nejdřív ty, co mění rozsah. Ptej se na záměr, data,
uživatele a obavy — ne na standardy (ty doplní auditor sám). Odpovědi → `AUDIT/00_intake.md`. Co vlastník
neví, označ `[NEZNÁMO]` a audit pokračuje s označeným předpokladem.

## Kolo 1 — rozsah
1. **Co aplikace dělá a pro koho** (1–3 věty)? Které 3 funkce jsou pro byznys nejdůležitější (kdyby selhaly, bolí to nejvíc)?
2. **Kde běží audit**: lokální build (výchozí), staging, nebo i produkce? Produkce = jen čtení, žádné mutace — souhlas ano/ne?
3. **Co je mimo rozsah** (moduly ve vývoji, známé dluhy, které se teď neřeší)?

## Kolo 1b — záměr a horizont (rozhoduje, jaká technologie je „vhodná")
3b. Pro koho to je a kolik uživatelů: jen ty / firma (≤ 10) / franšízanti a zákazníci (10–1 000) / veřejný produkt (1 000–100 000) / masový? Kolik dnes, za 12 měsíců, za 3 roky?
3c. Co se stane, když to den nepoběží (nic / ztráta zakázek / pokuta / ztráta dat)? Kdo to bude provozovat (ty + agenti / zaměstnanec / kupující po exitu)? Měsíční rozpočet na provoz a strop?
3d. Na kolika strojích se vyvíjí (notebook, workstation, server) a jak se synchronizují — jen git, nebo i něco jiného?

## Kolo 2 — data a uživatelé
4. Jaká **data** aplikace drží (osobní údaje zákazníků? platby? smlouvy?) a kolik tenantů/uživatelů je reálně aktivních?
5. **Role**: jaké existují a co která smí/nesmí? Existují testovací účty pro 2 tenanty + 2 role (potřebné pro cross-tenant a BFLA testy)? Pokud ne, kdo je vytvoří (Kapitán — položka P1 před auditem)?
5b. **Testovací prostředí pro auditora**: dodáš `.env.audit` (oddělená testovací DB — Supabase branch / lokální Postgres — a testovací účty tenantů A/B)? Auditor z produkčních hodnot nic nevyrábí; bez něj jsou dynamické testy neprůkazné.
6. **Integrace** (Postmark, Stripe, Supabase, ARES, Telegram most, n8n…): které jsou živé a která by nejvíc bolela, kdyby unikl klíč?

## Kolo 3 — obavy a priority
7. **Čeho se bojíš nejvíc** (únik dat mezi tenanty? rozbité PDF nabídky? že to Kapitán vydá rozbité?). Auditor to zařadí jako prioritní oblast.
8. **Co ti vadí na UI dnes** (konkrétní obrazovky/menu/dropdowny, kde tušíš překryvy nebo nelogiku)?
9. **Efektivita**: kolik dávek/issues za týden Kapitán uzavírá, kolik z nich se vrací? Jaké MCP servery/mosty běží trvale (Telegram, n8n, cron)? Máš pocit, že tokeny „tečou" někde konkrétně?

## Kolo 3b — hygiena a provoz
9b. Kam smí jít **archiv** nepotřebných souborů mimo repo (např. `<repo>-archiv/`, NAS, cloud)? Smí Kapitán po archivaci s manifestem mazat, nebo mazání schvaluješ ty?
9c. Existuje záloha dat a kdy byla naposledy **obnovena** (ne vytvořena)? Jaké RPO/RTO je pro tebe přijatelné (hodina dat? den?)?

## Kolo 4 — záměr funkcí (doplní se během fáze 1, jen tam, kde záměr není zřejmý z kódu/dokumentace)
10. Pro funkci `<název>`: „Co má udělat, když uživatel `<vstup>`? Co se NEMÁ stát?" — jedna otázka na funkci, max 3 na kolo, zbytek `[NEZNÁMO — předpoklad: …]`.

## Výstupní struktura `AUDIT/00_intake.md`
```
# Intake — <projekt> — <datum>
## Záměr: stupeň OSOBNÍ|FIRMA|B2B-SÍŤ|PRODUKT|MASOVÝ, uživatelé dnes/12m/3r, dostupnost, rozpočet, provozovatel, stroje
## Profil: účel, uživatelé, stack, prostředí (URL lokál/staging/prod, souhlas s prod: ne/jen čtení)
## Priority vlastníka: 1. … 2. … 3. …   ## Mimo rozsah: …
## Data a role: tenantů N, role [..], test. účty A/B: ano/ne (kdo dodá)
## Integrace: [..] + které jsou kritické
## Efektivita: dávek/týden, návratovost, trvale běžící procesy, podezření
## Funkce (inventář): | ID | název | vstupní bod UI | role | data | záměr (vlastníkova slova / [NEZNÁMO]) | endpointy |
## Otevřené otázky: …
```
