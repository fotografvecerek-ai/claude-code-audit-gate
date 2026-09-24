# Checklist ARCHITEKTURA — jediný zdroj pravdy (SSOT), duplicity, umístění a seskupení funkcí

Nejčastější vada projektů psaných agenty: **několik funkcí, každá s vlastním zdrojem téhož** (druhý DB klient,
druhá kopie konstanty, druhá definice entity, druhý config). Auditor hledá každý případ, kde stejná informace
žije na ≥ 2 místech, a navrhuje JEDNO místo + mechanismus, který druhé místo znemožní (lint/test), ne jen „sjednotit".

## 1. Jediný zdroj pravdy — co kontrolovat (nástroj: `tools/ssot-scan.mjs <repo>` + ruční review)
| Oblast | Signál duplicity | Test/sken | Cílový stav |
|---|---|---|---|
| **DB přístup** | > 1 `new PrismaClient()`, > 1 `createClient(` (Supabase), přímé `pg`/`postgres` vedle Prismy, fetch na vlastní API z server kódu | sken `db_clients` | jeden `lib/db.ts` (singleton) + jeden datový přístupový vzor; žádný dotaz mimo repository/service vrstvu |
| **Datový model** | entita definována v Prisma schema **a** ručně v TS `interface`, **a** v zod, **a** v Supabase generated types — bez odvození | sken `entity_shapes` (stejný název typu/interface v ≥ 2 souborech) | Prisma = zdroj; zod přes `prisma-zod-generator`/`z.infer`; TS typy z Prisma; Supabase types generované, ne psané |
| **Konstanty / enumy** | DPH sazba, stavy nabídky, role, měny, limity plánů, názvy tenantů jako literál na ≥ 2 místech | sken `literals` (stejný „významový" literál v ≥ 3 souborech) | `config/constants.ts` / DB enum; UI čte z jednoho místa |
| **Konfigurace** | `process.env.X` čten v N souborech, různé defaulty; dvě `.env` sady; hodnoty i v DB i v env | sken `env_reads` | jeden `lib/env.ts` s validací (zod) a jedním defaultem; ostatní importují |
| **Byznys logika** | výpočet ceny/DPH/čísla dokladu/termínu implementován v UI i na serveru i v PDF šabloně | jscpd + grep klíčových slov (`vat`, `dph`, `total`, `round`) | jedna funkce v `domain/`, importovaná všude; PDF a UI jen zobrazují |
| **Stav v UI** | stejná data držená ve 2 store/context/URL současně; cache vedle SWR/React Query cache | grep `useState` + `useQuery` na stejný klíč | jeden cache klíč, jeden owner stavu |
| **Uživatelské texty** | stejná hláška/název v N komponentách, různé varianty (CZ/EN mix) | sken `literals` na UI texty | i18n/slovník nebo `copy.ts` |
| **Pravidla oprávnění** | role kontrolována v komponentě i v handleru i v middleware různě | grep `role ===`/`can(` | jedna `permissions.ts` (policy), použitá na serveru; UI ji jen zrcadlí |
| **Dokumentace/CLAUDE.md** | pravidla projektu ve 2 souborech (drift) | diff CLAUDE.md vs skill vs README | jeden zdroj + pointery (skill uzavřená smyčka: „dva zdroje pravdy driftují") |
| **Datové soubory / seedy** | číselník v JSON i v DB i hardcoded (např. kategorie míst) | grep názvů kategorií | DB/JSON jeden zdroj, ostatní generováno buildem |

Nález SSOT = P1 pokud jde o data/peníze/oprávnění (rozjedou se hodnoty), jinak P2. **Návrh řešení musí obsahovat
pojistku**: lint pravidlo (`no-restricted-imports` na `@prisma/client` mimo `lib/db`), test (`grep -c "new PrismaClient" = 1`),
nebo generátor — jinak duplicita znovu vznikne.

## 2. Duplicitní kód
- Nástroj: `npx jscpd <repo> --min-lines 8 --min-tokens 60 --reporters json --output AUDIT/01_nalezy/jscpd` (ověř aktuální flagy).
- Práh: duplicita > 3 % řádků = 🟡, > 8 % = 🔴; každý klon ≥ 30 řádků = samostatný nález.
- Sémantické duplicity (jiný kód, stejný účel): dva `formatDate`, dva `slugify`, dva fetch wrappery, dvě komponenty `Dropdown`/`Select` — sken `dup_names` (stejný název funkce/komponenty v ≥ 2 souborech) + ruční review.
- Návrh: jedna implementace v `lib/`/`domain/`, ostatní smazat; červený test = počet definic = 1.

## 3. Umístění a seskupení funkcí (struktura složek)
Otázky na každý modul/soubor (ruční review nad `efficiency-audit.mjs modules` + `tree -L 3`):
- [ ] Je funkce tam, kde by ji hledal nový vývojář? (doména `quotes/` má service, schema, UI, testy pohromadě — ne `utils/quoteHelpers3.ts`)
- [ ] `utils/`, `helpers/`, `common/`, `misc/` — kolik souborů a co v nich je? > 15 souborů bez domény = 🟡 „skládka".
- [ ] Závislosti jdou jedním směrem: `ui → application/service → domain → infra(db)`; `domain` nic neimportuje z `ui`/`db`. Import cykly (`npx madge --circular src` — ověř nástroj) = 🔴.
- [ ] Jeden soubor = jedna odpovědnost: komponenta neobsahuje SQL/fetch + formátování + validaci zároveň.
- [ ] Veřejné rozhraní modulu přes `index.ts`; ostatní soubory modulu neimportují „dovnitř" jiného modulu.
- [ ] Názvy: soubor říká, co dělá (`createQuote.ts`), ne `handler2.ts`, `new-final.ts`, `test-copy.tsx`.
- [ ] Mrtvý kód: exporty bez importu (`npx ts-prune`/`knip` — ověř) → seznam ke smazání.
- [ ] Featura = jasná cesta: UI vstup → action/route → service → repo. Chybí-li vrstva, logika bude v UI → duplicita.

**Návrh přeskupení** (do handoffu jako NÁVRH ARCHITEKTURY, P2, samostatná dávka): cílový strom složek, mapování
starých souborů na nové (tabulka), pořadí přesunů (nejdřív listy, pak jádro), pravidlo „přesun = commit bez změny
chování, regrese 0 failů". Vazba na EFEKTIVITA §4 (dělení bloků) — dělit rovnou do správné domény.

## Výstup
JSON `{id, kategorie: ssot|duplicita|umisteni, mista: [soubor:řádek,…], co_je_duplikovano, dopad, priorita, navrh_reseni (jedno místo + pojistka), cerveny_test}`.
