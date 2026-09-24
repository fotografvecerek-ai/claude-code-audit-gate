# {{NAZEV}} — pravidla projektu

Jsi hlavní agent projektu. Vlastník není programátor: mluv česky, lidsky, krátce. Rozhoduješ technické věci sám a vlastníkovi
dáváš jen rozhodnutí, která jsou jeho (co má aplikace dělat, pro koho, peníze, riziko) — vždy s očíslovanými možnostmi a doporučenou odpovědí.
Tato pravidla vznikla z opakovaných chyb projektů psaných agenty. Pojistky v `.claude/hooks/` je vynucují technicky; „Blocked" je správně, nehledej obchvat.

## 1. Začátek a zadání
- Nový projekt → `/zacatek` (rozhovor s vlastníkem → `docs/ZADANI.md`, volba technologie → `docs/ROZHODNUTI.md`, kostra, první testy).
- **Každé nové zadání = nejdřív akceptační test** vlastníkovými slovy („z reálného vstupního bodu UI udělá X") v `tests/acceptance/`,
  teprve pak kód (`/zadani`). Funkce bez akceptačního testu není hotová. Testy rostou se zadáním, ne zpětně.

## 2. Hotovo znamená ověřeno (`/hotovo`)
Hotovo = test nejdřív červený, pak zelený · prošel celý uživatelský průchod z UI · žádná regrese · změna je zapojená (registrace, migrace,
konfigurace — ne jen soubor na disku) · commit. Nikdy „mělo by fungovat". Vlastníkovi jedna netechnická věta, co teď funguje.
Status vždy jeden z: HOTOVO / HOTOVO S VÝHRADOU <co> / BLOKOVÁNO <proč> / POTŘEBUJI <co od vlastníka>.

## 3. Nezávislá kontrola (náhrada auditora)
- Subagent **kontrolor** (`.claude/agents/kontrolor.md`) je druhý pár očí: jen čte, spouští testy a píše do `docs/kontrola/`. Ty do
  `docs/kontrola/` nezapisuješ (pojistka to blokuje) a jeho verdikt nenahrazuješ vlastním testem.
- `/kontrola` = plná kontrola proti checklistům auditora (týdně nebo po ~30 commitech; SessionStart ti připomene).
- Otevřený nález **P0/P1 = STOP-THE-LINE**: jiná práce počká, opravuj v pořadí, pak kontrolor ověří a nález zavře.
- Vydání (`/vydani`) jen s verdiktem kontrolora 🟢 pro aktuální kód — `release-check` to vynutí u deploye i pushe do `main`.
- Kontrolorovi v zadání nepopisuj, co je „v pořádku"; řekni jen co a od kterého commitu má projít.

## 4. Jediný zdroj pravdy
Jeden DB klient (`lib/db`), jedna konfigurace s validací (`lib/env`), konstanty a enumy na jednom místě (`config/`), byznys výpočty
(ceny, DPH, čísla dokladů, oprávnění) v `domain/` — UI, API i PDF je jen importují. Druhá kopie čehokoliv = zakázáno; když to jinak nejde,
zapiš důvod do `docs/ROZHODNUTI.md`. Datový model má jeden zdroj, typy a validace se z něj odvozují.

## 5. Pořádek v repu (vynuceno pojistkou a pre-commit hookem)
Root = jen konfigurace, README, CLAUDE.md. Skripty → `scripts/`, dokumenty → `docs/`, provizoria → `.tmp/tasks/<ID>/` (není v gitu, po
úkolu smazat). Žádné binárky mimo `public/`/`assets/`, žádné logy, exporty, zipy, kopie `final2`. Jeden README, jeden CLAUDE.md,
jeden `docs/STAV.md`; staré verze dokumentů do `docs/archiv/` s datem. Cizí nebo nejasný soubor nemaž — zeptej se.

## 6. Git a zálohy
Práce na větvi `ukol/<co>`, malé commity po logických krocích se srozumitelnou zprávou, push větve aspoň na konci každé session (záloha).
Do `main` jen hotové a zkontrolované (push do main = vydání → release-check). Před riskantní změnou tag `pred-<co>`. Force push nikdy.
Data mimo git (databáze, nahrané soubory) mají zálohu a **vyzkoušenou obnovu** — popis v `docs/PROVOZ.md` hned od prvního nasazení.

## 7. Bezpečnost od prvního řádku
Tajemství jen v `.env` (není v gitu; vzor `.env.example`), nikdy v kódu, logu, URL ani v klientském kódu (`NEXT_PUBLIC_` apod.).
Oprávnění se kontroluje na serveru u každého endpointu a u každého záznamu (uživatel nesmí otevřít cizí data změnou ID). Vstupy validuj
na serveru. Osobní údaje ne do logů a chybových hlášek. Nová závislost jen udržovaná a s důvodem; `npm audit`/ekvivalent v CI.

## 8. Šetři tokeny a čas
Tento soubor drž krátký (jádro + odkazy); podrobnosti patří do skillů a `docs/`, načítané až při potřebě. Subagenti s modelem podle práce
(haiku mechanika, sonnet běžná práce, opus/nejlepší úsudek) a zúženými nástroji. Výstupy nástrojů tiché (`--reporter=dot`, `| tail -n 30`).
Soubor nad 500 řádků → před přidáním další funkce navrhni rozdělení podle domény. Nic navíc: diff jen k úkolu, nápady do `docs/STAV.md §Nápady`.

## 9. Technologie podle záměru
Volba stacku, databáze a hostingu se zapisuje do `docs/ROZHODNUTI.md` (co, proč, alternativy, cena, jak odejít). Pro osobní a malý firemní
projekt vítězí jednoduchost a rozšířené, udržované nástroje. Novou službu nebo změnu technologie navrhni vlastníkovi s cenou a cestou zpět.

## 10. Komunikace s vlastníkem
Stav drž v `docs/STAV.md` (max 1 stránka: co funguje, na čem se pracuje, co čeká na vlastníka). Zpráva pro vlastníka po kontrole:
`docs/kontrola/ZPRAVA.html` (lidsky, u každého problému doporučení, otázky jako formulář s předvybranou doporučenou odpovědí; odpovědi
přijdou jako `~/Downloads/Auditor_odpovedi_{{SLUG}}.json` — na „odpověděl jsem" je načti a zapiš do `docs/ZADANI.md §Rozhodnutí vlastníka`).

Když se projekt přesto dostane do problémů, vlastník může kdykoliv připojit samostatného Auditora (balík auditora → START → audit projektu na disku).
