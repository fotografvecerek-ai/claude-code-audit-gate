# Checklist UDRŽITELNOST A ŠKÁLOVÁNÍ — je technologie vhodná pro dnešní použití i pro záměr?

Bez záměru nelze technologii posoudit: totéž řešení je správné pro jednoho uživatele a špatné pro tisíc. Proto **nejdřív intake
(kolo 1b)**, teprve pak hodnocení. Auditor nehodnotí „moderní/nemoderní", ale **fit** vůči 3 horizontům: dnes · cílový stav dle vlastníka · 10× nad cíl
(co se stane, když se povede víc). Ceny a limity služeb se **ověřují webem v den auditu** (primární ceníky), necitují se z paměti.

## 0. Intake — záměr (kolo 1b, přes AskUserQuestion)
1. Pro koho to je a kolik jich bude: jen ty / tvoje firma (≤ 10) / franšízanti a zákazníci (10–1 000) / veřejný produkt (1 000–100 000) / masový (100 000+)? Horizont: 12 měsíců a 3 roky.
2. Co se stane, když to 1 den nepoběží: nic / ztráta zakázek / smluvní pokuta / ztráta dat zákazníků? (→ požadovaná dostupnost a RPO/RTO)
3. Kdo to bude provozovat: ty sám + agenti / zaměstnanec / externí firma / kupující po exitu (M&A — investor bude číst stack)?
4. Rozpočet na provoz měsíčně dnes a strop; kde jsou data uložena právně (EU/GDPR, DPA s dodavateli)?
5. Exit/růst: je v plánu prodej, franšíza, white-label, mobilní app, offline režim (fotokoutek offline-first!)?
Výstup do `AUDIT/00_intake.md §Záměr`: `stupeň: OSOBNÍ | FIRMA | B2B-SÍŤ | PRODUKT | MASOVÝ` + horizonty + dostupnost + rozpočet + provozovatel.

## 1. Matice hodnocení (každá vrstva × 3 horizonty → 🟢 vyhovuje / 🟡 vyhovuje s podmínkou / 🔴 nevyhovuje + migrační cesta)
| Vrstva | Co posoudit | Typické signály |
|---|---|---|
| **Databáze** | typ (Postgres/SQLite/Supabase/Neon), model tenantů (sdílená DB + RLS vs. DB per tenant), indexy na reálných dotazech, velikost dat za rok, PITR, connection pooling (serverless!), limity plánu (řádky, storage, connections) | SQLite pro B2B-SÍŤ = 🔴; Postgres bez pooleru na Vercelu = 🟡; RLS bez testů = 🔴 (viz BEZPEČNOST) |
| **Hosting/compute** | Vercel/serverless vs. VPS vs. kontejner; cold starty, limity funkcí (čas, velikost), regiony (EU), cena při 10× provozu, vendor lock-in (Next.js features jen na Vercelu?) | dlouhé joby (PDF, import) v serverless = 🟡/🔴 → fronta/worker |
| **Cloudové služby** | inventura: Supabase (auth, storage, edge fn), R2, Postmark, Stripe, Capgo, n8n, Cloudflare … pro každou: k čemu, cena dnes / při cíli / při 10×, limity free tieru, DPA/EU, **exit cesta** (jak odejít, kolik to stojí), single point of failure | služba použitá na 5 % funkcí, ale bez ní nic nejede = 🟡; služba bez exportu dat = 🔴 |
| **Aplikační stack** | Next.js/Prisma/TS: verze, EOL, upgrade dluh; monolit vs. rozdělení (viz EFEKTIVITA §4); mobilní vrstva (Capacitor + OTA) — bezpečnost OTA, store pravidla | závislosti > 2 major verze pozadu = 🟡 |
| **Výkon a limity** | odhad zátěže pro cíl (uživatelé × akce/den), nejdražší dotazy (EXPLAIN), N+1, cache, velikost bundlu; **smoke load test** lokálně (k6/autocannon — ověř nástroj) na 10× dnešek | žádná měřená čísla = HYPOTÉZA, ne PASS |
| **Provoz (solo zakladatel)** | kolik hodin/měsíc údržby stack vyžaduje, bus-factor 1, runbook, monitoring, kdo drží klíče, náklady na to, aby to převzal někdo jiný (M&A due diligence) | infrastruktura, kterou umí spravovat jen vlastník + agent = 🟡 pro PRODUKT/M&A |
| **Náklady** | TCO tabulka: dnes / cíl / 10× pro každou službu (ověřené ceníky s datem) + lidský čas; bod, kde se vyplatí změna (např. VPS místo serverless) | růst nákladů nelineární vs. tržby = 🔴 |
| **Právo a data** | GDPR role (správce/zpracovatel per služba), DPA, umístění dat, retence, právo na výmaz napříč službami | osobní data v službě bez DPA = P1 |

## 2. Rozhodovací pravidla (aby audit nevyráběl „přepiš to na Kubernetes")
- **OSOBNÍ/FIRMA**: jednoduchost a cena vítězí; managed služby OK; migrace jen při konkrétní bolesti. Nález = jen tam, kde technologie dnes selhává nebo blokuje zálohu/bezpečnost.
- **B2B-SÍŤ** (franšízanti, CRM 2028): tenant izolace, zálohy, dostupnost, exit cesta u každé služby, cena při 10×; multi-tenant v jedné DB s RLS je OK, pokud je testovaná; plán „DB per velký tenant" má existovat na papíře.
- **PRODUKT/MASOVÝ**: měřená čísla (load test), pooling, fronty, observabilita, region/EU, náklady per uživatel, vendor lock-in mapa, tým > 1.
- Změna technologie se navrhuje **jen s migrační cestou** (kroky, cena, riziko, rollback, co se tím získá v číslech) — jinak jde o poznámku, ne nález.
- „Vhodné pro budoucnost" ≠ „přestavět teď": auditor rozliší **udělat teď** (blokuje záměr do 12 měsíců) / **připravit** (rozhraní, abstrakce, export dat) / **sledovat** (metrika + práh, při kterém se rozhodne).

## 3. Výstup
`AUDIT/07_udrzitelnost.md`: stupeň záměru · matice vrstva × horizont s verdikty · TCO tabulka (ceníky s datem a URL) · seznam
služeb s exit cestou · 3–7 doporučení rozdělených na TEĎ / PŘIPRAVIT / SLEDOVAT, každé s prahem a důkazem · „Co jsem neprokázal"
(bez load testu = odhad; bez ceníku = neověřeno). Nálezy P0/P1 (např. chybějící pooling způsobující výpadky, služba bez exportu dat)
jdou do handoffu jako ostatní; zbytek je **rozhodnutí vlastníka**, ne úkol Kapitána.
