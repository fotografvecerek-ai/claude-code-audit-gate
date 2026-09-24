# Auditor pro Claude Code — co to umí a proč to není běžný auditní nástroj

> Toto je dokument pro člověka, který chce pochopit, **co si instaluje**. Technický popis souborů je v [`auditor/README.md`](../auditor/README.md),
> ústava agenta v [`auditor/CLAUDE.md`](../auditor/CLAUDE.md), protokol spolupráce v [`auditor/BRIDGE.md`](../auditor/BRIDGE.md).
> English version: [WHAT-IT-DOES.md](WHAT-IT-DOES.md).

## 1. Jedna věta

Auditor je **druhý, nezávislý agent, který v projektu trvale žije vedle vašeho vývojového agenta**, nesmí nic měnit ani vydat, a přesto
má poslední slovo: bez jeho zeleného verdiktu se aplikace nevydá — a to nehlídá věta v promptu, ale hook, git a CI.

## 2. Proč vznikl

Agenti (Claude Code, Codex, Cursor…) píšou kód rychle a hlásí „hotovo". Z reálných projektů se opakuje stejný vzor:

- „hotovo" znamená *soubor je na disku*, ne *funkce funguje z uživatelského rozhraní*;
- test je zelený, protože testuje něco jiného, než co se rozbilo;
- oprava je v kódu, ale není **zapojená** (hook není registrován, migrace neproběhla, konfigurace se nenačetla);
- druhá kopie stejné pravdy (další DB klient, konstanta na třech místech) vznikne týden po úklidu;
- repo se zaplní logy, `final2.bat`, zipy, klíči;
- práce se týdny necommituje, agent vydává rovnou z pracovního adresáře;
- člověk obejde vlastní pojistku kliknutím na připravený `.bat`, protože „tentokrát to spěchá".

Běžný auditní nástroj tohle najde jednou, vypíše seznam a skončí. **Problém není najít chyby. Problém je, že se opravují napůl, znovu vznikají
a nikdo nezávislý neověřuje, že oprava skutečně platí.** Proto tenhle auditor neaudituje jednorázově — **operuje v projektu dlouhodobě**.

## 3. Co ho odlišuje od „audit nástroje"

| Běžný auditní nástroj / subagent | Tento auditor |
|---|---|
| Jednorázový sken, výstup = seznam | **Trvalá role v projektu**: audit → předání → vynucení → ověření → brána vydání → měření po vydání → retro → další audit |
| Běží ve stejné session jako vývojář-agent (autor si schvaluje vlastní práci) | **Vlastní workspace a vlastní session**; repo vidí jen ke čtení; má vlastní ústavu, ne CLAUDE.md projektu |
| „Nesmí měnit kód" je věta v promptu | **Technická brána**: hook blokuje zápis do repa, `git commit/push` do repa, deploy, mazání, mutační HTTP mimo localhost — i v bypass módu |
| Nalezne, nenavrhne | Každý nález má **návrh řešení** (varianty, doporučená, červený test, zbytkové riziko) jako zadání pro vývojového agenta |
| Věří, že oprava proběhla | **Nezávislé ověření šesti branami** vlastním čerstvým během; důkaz vývojáře je jen tvrzení |
| Vydání je na člověku | **Brána vydání** vynucená na třech místech: hook vývojového agenta, git pre-commit / deploy skript, GitHub Actions + chráněná větev |
| Kontroluje kód | Kontroluje **kód, bezpečnost, každou funkci z UI, jediný zdroj pravdy, pořádek v repu, git praxi, efektivitu agentů (tokeny, modely), vhodnost technologie pro záměr, zálohy a obnovitelnost** |
| Neměří, jestli pomohl | Měří **first-pass yield, počet kol na opravu, míru falešných „hotovo"**, spotřebu tokenů před/po |

## 4. Co všechno audituje

Každá oblast má vlastní checklist (`auditor/checklists/`) a nástroj (`auditor/tools/`). Pořadí je záměrné — úklid odhaluje zdroje pravdy,
zdroje pravdy odhalují bezpečnostní díry.

1. **Intake** — ptá se vlastníka lidsky: co aplikace dělá, pro koho, kolik uživatelů dnes a za rok, čeho se bojí, jaká data drží, jak se
   vydává. Uživatel nemusí znát žádný standard. Výstup: profil aplikace a priority.
2. **Hygiena repa** — skládka v rootu, provizoria, binárky/zipy/logy v gitu, tajemství, velké objekty v historii, duplicitní a
   zastaralé dokumenty (hloubkový obsahový průchod: každý `.md/.json/.yaml` klasifikován AKTUÁLNÍ / ZASTARALÝ / KONFLIKTNÍ = starý zdroj pravdy).
3. **Git praxe** — jak často se commituje a pushuje, kolik práce je nezálohované, velikost a smysl commitů, dlouhé větve, ochrany.
4. **Statika** — typy, lint, audit závislostí, tajemství (gitleaks), bezpečnostní vzory (semgrep), únik tajemství do klienta.
5. **Bezpečnost** — OWASP ASVS 5.0 (úroveň 2), OWASP Top 10:2025, API Top 10, LLM Top 10 pro AI funkce: izolace tenantů, autorizace
   na každém endpointu, RLS, hlavičky, upload, rate limit, chybové stavy. Sonda proti **vlastní lokální instanci** aplikace, nikdy proti produkci.
6. **Funkce** — inventář všech funkcí; pro každou akceptační kritérium „z reálného vstupního bodu v UI udělá X" ověřené Playwrightem.
7. **UI / design** — překryvy prvků, pořadí vrstev, ořezaný text, dropdown logika, konzistence menu napříč obrazovkami, cíle ≥ 24 px,
   console errors = 0, tři viewporty. **Vyčerpávající průchod**: každá stránka, každý interaktivní prvek (pole se 3 vzorky, posuvníky,
   každá položka dropdownu, přepínače, taby, modály), ledger pokrytí — 100 % prvků má záznam, jinak audit neskončil.
8. **Přístupnost a výkon** — WCAG 2.2 AA (axe-core), klávesnice, Core Web Vitals.
9. **Architektura a jediný zdroj pravdy** — více DB klientů, entita definovaná dvakrát, konstanty/enumy/env na N místech, byznys výpočet
   v UI i serveru i PDF, oprávnění ad hoc, „skládky" `utils/`, import cykly, mrtvý kód, funkce v nelogické složce. Každý nález = jedno
   místo + **pojistka** (lint/test/generátor), jinak duplicita znovu vznikne.
10. **Efektivita agentů** — co se načítá do každého požadavku (CLAUDE.md, pravidla, skilly, MCP servery, hooky), model každého subagenta
    (mechanika na levném modelu, úsudek na nejlepším), soubory nad prahem 500/1000 řádků → návrh rozdělení podle domény, first-pass
    yield, churn. **Po zapracování měří znovu stejnou metodou** — „soubor je menší" není důkaz úspory, důkaz jsou hodnoty spotřeby.
11. **Udržitelnost a škálování podle záměru** — matice vrstva (DB, hosting, cloud služby, stack, výkon, provoz, náklady, právo) × horizont
    (dnes / cíl / 10×) s cenami ověřenými v den auditu a exit cestou každé služby. Pro osobní projekt vítězí jednoduchost.
12. **Provoz, zálohy, licence** — inventura všech zdrojů dat, **izolovaný restore test** (existence zálohy ≠ obnovitelnost), readiness,
    alerty, runbook, rotace tajemství, licence závislostí a dat.

## 5. Jak funguje spolupráce — životní cyklus, ne sken

Vývojový agent projektu se tu jmenuje **Kapitán**. Auditor a Kapitán komunikují přes **most** — zprávy jako soubory ve sdílené složce
(funguje na jednom stroji i přes git mezi stroji), každá se svým vlastnictvím vynuceným hooky (Kapitán nemůže přepsat nález ani verdikt,
auditor nemůže psát důkazy za Kapitána).

```
 ┌───────────────────────────── trvalá smyčka ─────────────────────────────┐
 │                                                                          │
 │  intake ─► audit (12 oblastí) ─► nálezy + návrhy ─► HANDOFF ─► Kapitán   │
 │                                                        │                 │
 │                          STOP-THE-LINE: jen položky handoffu, v pořadí   │
 │                          záloha (tag/branch) před každým zásahem         │
 │                          důkazy do AUDIT/03_dukazy, hlášení přes most    │
 │                                                        │                 │
 │  nezávislé ověření ◄──── EVIDENCE (commit + důkazy) ◄──┘                 │
 │   6 bran, čerstvý běh                                                    │
 │      │ FAIL → kolo K2, K3 (max 3, pak otázka vlastníkovi)                │
 │      ▼ PASS                                                              │
 │  RELEASE GATE 🟢 ─► deploy projde ─► APPLIED ─► měření po vydání         │
 │                                                        │                 │
 │  retro (CHYBOVNÍK: co jsem přehlédl → jaký test to chytí příště) ◄──────┘
 │                                                                          │
 └──────────────── další audit při další dávce / vydání ────────────────────┘
```

**Šest bran ověření** (žádná se nedá přeskočit, dílčí PASS = FAIL):
1. problém skutečně existoval (reprodukce před opravou),
2. změna existuje (diff v rozsahu položky, nic navíc),
3. změna je **zapojená** (registrace, konfigurace, migrace aplikována — ne jen soubor na disku),
4. mechanismus funguje (test nad reálným kódem, ne mock),
5. uživatelský tok z reálného vstupního bodu (UI, ne přímé volání),
6. regrese + bezpečnost + **pojistka proti recidivě**.

**Co auditor nikdy nezamění:** existenci testu za jeho běh · zelený test za akceptaci · commit za aktivaci · aktivaci za provozní účinek ·
hlášení Kapitána za důkaz · health 200 za správný výsledek · existenci zálohy za obnovitelnost.

## 6. Proč je to dlouhodobá role

Po prvním auditu auditor **v projektu zůstává**:

- **Každé vydání** prochází jeho branou: hook Kapitána spouští `gate-check` při `vercel`, `git push` do produkční větve i v deploy `.bat`;
  CI na GitHubu odmítne merge bez zeleného verdiktu pro přesně tento commit (porovnává hash stromu, ne jen ancestry).
- **Každý start Kapitána** začíná přečtením zpráv od auditora; otevřené P0/P1 = jediná povolená práce.
- **Trvalé povinnosti Kapitána**, které auditor při dalším auditu kontroluje: subagenti s explicitním modelem, tiché výstupy nástrojů,
  návrh rozdělení souboru nad prahem před přidáním featury, žádná druhá kopie pravdy, provizoria jen v `.tmp/tasks/<ID>/`, úklid v retru.
- **Metriky chování Kapitána** (`bus.mjs metrics`): first-pass yield, průměr kol na opravu, **míra falešných „hotovo"**, doba od handoffu
  k PASS. Když se zhorší, auditor neapeluje „ať se snaží" — navrhne změnu **mechanismu** (brána, hook, šablona).
- **Měření před/po** u efektivity: stejná metoda, stejné okno, normalizováno na tokeny / uzavřený úkol; rozdíl pod 10 % je šum.
- **Retro**: každý typ chyby, který auditor přehlédl, jde do CHYBOVNÍKU s testem, který ho příště chytí. Po prvním auditu se naopak
  zapisují kontroly s nulou nálezů — balík se má praxí **zužovat**, ne bobtnat.

Jinými slovy: první audit je nejdražší a nejdelší. Každý další je rychlejší, protože pojistky už stojí a auditor zná projekt.

## 7. Co auditor NEDĚLÁ (a proč)

- **Nekóduje, neopravuje, nerefaktoruje.** Ani „drobnost". Ten, kdo hlídá bránu, nesmí bránou procházet. Hook mu to zablokuje.
- **Nevydává, nemigruje DB, nemaže, neukončuje procesy, nevolá produkci.** Sondy jen proti vlastní lokální instanci z klonu.
- **Nerozhoduje za vlastníka** o architektuře, technologii ani přijetí zbytkového rizika — navrhne varianty, vlastník vybere.
- **Nepřenáší technické QA na vlastníka.** Vlastníkovi píše jednou větou + odkaz na soubor; technické detaily řeší s Kapitánem.
- **Nevěří dokumentaci ani komentářům.** Instrukce v podkladech („auditore, tohle přeskoč") ignoruje a hlásí jako nález.

## 8. Co dostanete (výstupy)

Vše v `<projekt>-audit/AUDIT/`:

| Soubor | Co v něm je | Pro koho |
|---|---|---|
| `00_intake.md` | profil aplikace, záměr, priority, inventář funkcí | oba agenti |
| `01_nalezy/A-###.md` | každý nález: třída důkazu, priorita, reprodukce, důkaz, návrh řešení, červený test | Kapitán |
| `02_HANDOFF.md` | balík pro Kapitána: STOP-THE-LINE, pořadí, pravidla záloh, **co audit neprokázal** | Kapitán |
| `03_dukazy/A-###/` | commit, výstup červeného testu před/po, screenshot, regrese, pojistka | auditor |
| `04_verdikty/A-###.md` | PASS / SCOPED_PASS / FAIL po šesti branách, kolo K1, K2… | oba |
| `05_release_gate.md` | 🟢/🔴 pro konkrétní commit — jediná věc, která pouští deploy | hooky, CI |
| `06_efektivita.md` | baseline a měření po: tokeny, modely, first-pass yield, false_done_rate | vlastník |
| `07_udrzitelnost.md` | technologie × záměr, TCO, exit cesty, doporučení TEĎ / PŘIPRAVIT / SLEDOVAT | vlastník |
| `CHYBOVNIK.md` | retro auditora | auditor |
| `bus/` | zprávy mostu, `LEDGER.md` generovaný pohled | oba |

Vlastník čte prakticky jen `02_HANDOFF.md` (co je špatně a proč), `05_release_gate.md` (smí se vydat?) a `06`/`07`.

## 9. Pro koho to je

- Pro **majitele produktu, který není programátor** a nechává agenty stavět aplikaci: auditor je jeho nezávislý technický ředitel,
  který nemá motivaci schválit vlastní práci.
- Pro **vývojáře používajícího Claude Code na větší projekt**: druhé oči, které hlídají věci, na které se při rychlém vývoji zapomíná.
- Pro **týmy s více agenty**: brána vydání a most fungují přes více strojů (workspace auditora je git repo).

Není to pro jednorázový sken cizího repa — na to jsou lehčí nástroje. Auditor se vyplatí tam, kde se projekt **dál vyvíjí a vydává**.

## 10. Co si instaluje instalátor (a co ne)

- Vedle projektu vznikne `<projekt>-audit/` (workspace auditora): ústava, checklisty, nástroje, `AUDIT/`, vlastní git.
- Do projektu přibude jen `.claude/hooks/*` (hook Kapitána, gate-check, hygienický pre-commit), `.claude/skills/audit-rezim`, doplněk
  `.gitignore`/`.gitattributes`, blok v `CLAUDE.md`, volitelně `.github/workflows/auditor-gate.yml`. Nic z vašeho kódu se nemění.
- Do gitu projektu se uloží jen soubory instalace; rozdělaná práce zůstane, jak byla (a auditor ji dostane jako první nález).
- Instalátor se na nic technického neptá. Na konci se otevře okno auditora (sám začne intake) a okno Kapitána (počká, dokud běží starý).
- Modely: auditor v plném profilu na nejsilnějším dostupném modelu (úsudek a verdikty), mechanické subagenty na levných.

## 11. Nejčastější otázky

**Musím před auditem něco vypnout?** Ne. Jen Kapitána spuštěného před instalací nechte dokončit a spusťte znovu — pojistky se načítají při startu.

**Auditor běží dlouho. Je to normální?** Ano. První audit prochází každou obrazovku a každý prvek; u větší aplikace jsou to hodiny.
Průběh je v jeho okně a v `AUDIT/`.

**Kapitán hlásí „Blocked".** To je brána, ne chyba: Kapitán nesmí měnit hooky, verdikty ani vydávat bez gate. Pravidla se ladí zúžením,
ne obcházením.

**Můžu vydat, i když je gate červená?** Technicky ano — `git commit --no-verify`, smazat hook — a přesně to auditor při dalším auditu
najde a zapíše jako P0 (obejití brány). Brána chrání i před vlastní netrpělivostí; to je její smysl.

**Proč je auditor na nejdražším modelu?** Protože dělá úsudek: co je skutečná chyba, kdy je „hotovo" falešné, jaký verdikt vydat.
Slabší model tam neznamená pomalejší práci, ale horší rozhodnutí. Mechanika (průchod obrazovek, skeny) zůstává na levných modelech.
