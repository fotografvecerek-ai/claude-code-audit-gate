# Checklist EFEKTIVITA — first-pass yield, spotřeba tokenů, model routing, dělení kódu

Cíl: ne „kolik se napsalo", ale **kolik z napsaného prošlo napoprvé bez opravy** a **kolik tokenů to stálo**.
Auditor měří PŘED zásahem (baseline), předá doporučení Kapitánovi, po zapracování měří ZNOVU stejnou metodou
a rozdíl zapíše do `AUDIT/06_efektivita.md`. Bez měření po = doporučení není uzavřené.

## 1. Metriky kvality výstupu (first-pass yield)
Zdroje: git log, kanban/event log Kapitána (`VRÁCENO — NEFUNGUJE`, iterace), `CHYBOVNÍK §4`, verdikty auditora.

| Metrika | Definice | Zdroj | Cíl |
|---|---|---|---|
| **FPY** | issues s PASS při 1. nezávislém VERIFY / všechny issues dávky | verdikty, chybovník §4 | ↑ trend; < 60 % = 🔴 |
| **Ø iterací / issue** | fix→verify kol do PASS | chybovník §4 | ↓; > 2 = 🟡 |
| **Rework ratio** | commity typu fix/revert/hotfix na soubory změněné ≤ 7 dní předtím / všechny commity | `tools/efficiency-audit.mjs churn` | < 25 % |
| **Churn řádků** | řádky přidané a do 7 dnů zase smazané / řádky přidané | tamtéž | < 20 % |
| **Vráceno vlastníkem** | položky `VRÁCENO — NEFUNGUJE` / položky `ČEKÁ NA PAVLA` | kanban event log | < 15 % |
| **Odloženo** | issues ODLOŽENO po 3 iteracích / dávka | chybovník §4 | → 0 |

Kontroly mechanismu kvality (proč FPY padá):
- [ ] AK jmenuje vstupní bod a „vrátí >0 na reálných datech" (skill uzavřená smyčka §0) — vzorek 10 posledních issues.
- [ ] FIX ≠ VERIFY ≠ REVIEW dodrženo (transkripty/labels subagentů); autor si nikdy nedává PASS.
- [ ] Červený test existuje PŘED opravou; po PASS uložen do regresní sady (počet testů v `tests/regression` roste s uzavřenými issues).
- [ ] Rebuild před každou verify instancí (jinak verify testuje starý kód).
- [ ] Retro po dávce zapsáno (chybovník §2 roste, stejná třída chyby se neopakuje 2×).
- [ ] Plošné úkoly mají číselné AK ze skenu, ne „hotovo" ze součtu subagentů.
Nález = konkrétní chybějící brána + návrh mechanismu (skript v gate > věta v promptu).

## 2. Audit spotřeby tokenů (co se načítá do každého requestu)
Nástroj: `tools/efficiency-audit.mjs context <repo>` (odhad tokenů ≈ znaky/4; přesná čísla z `/cost` a session logů).

| Položka | Kontrola | Práh | Typický fix |
|---|---|---|---|
| `CLAUDE.md` (+ `~/.claude/CLAUDE.md`, `CLAUDE.local.md`) | velikost, duplicity, věci co patří do skillu | > ~200 řádků / > 6 k tokenů = 🟡, > 12 k = 🔴 | jádro = pravidla+pointery; detaily do `.claude/skills/*/SKILL.md` (načte se jen při potřebě) |
| `.claude/rules/*.md` | mají `paths:` glob, nebo se načítají všechny vždy? | pravidla bez `paths` > 3 = 🟡 | přidat `paths:`; sloučit |
| Skilly v `skills:` frontmatteru agentů | vkládá se PLNÝ obsah do každého spuštění subagenta | > 2 skilly/agent = 🟡 | jen skill nutný pro roli; zbytek přes Skill tool |
| MCP servery | počet serverů × nástrojů; schémata nástrojů jdou do KAŽDÉHO requestu | nepoužitý server (0 volání za 7 dní) = 🔴; > 40 nástrojů celkem = 🟡 | vypnout/`disabledMcpjsonServers`; scope `mcpServers:` na subagenta, ne globálně; Telegram most jen tam, kde se posílá |
| Hooky `SessionStart`/`UserPromptSubmit` s `additionalContext` | kolik textu injektují při každém promptu | > 500 znaků/prompt = 🟡 | jednou na `startup`, ne na každý prompt |
| Hooky typu `prompt`/`agent` (Stop, PreToolUse) | každý = další volání modelu | na každém tahu = 🟡 | deterministický skript; prompt-hook jen Haiku a jen kde nutný |
| Výstupy nástrojů | `pnpm build`/test/lint bez tichého reporteru, `cat` celých souborů, `git log` bez `-n` | > 5 k tokenů/výstup = 🟡 | `--reporter=dot`, `2>&1 \| tail -n 30`, Grep/Read s offsetem |
| Výsledky subagentů | vrací dumpy místo JSON závěru | > 2 k tokenů/výsledek = 🟡 | „Výstup: POUZE JSON {…}" v promptu |
| Délka session / kompakce | počet auto-kompakcí za session | > 3 = 🟡 | `/clear` mezi dávkami; stav v TaskList a souborech |
| Opakované čtení | stejný soubor čten > 3× v session | 🟡 | shrnout do kotvy soubor:řádek v promptu subagenta |
| Gate běhy | plná regresní sada při každém verify | > 60 s/gate = 🟡 | smoke + rychlé; `@slow` nightly |
| Telegram most / notifikace / cron | co běží a volá model bez lidského vstupu | každý běh bez výstupu = 🔴 | trigger jen na událost, ne polling |
| Model hlavního vlákna | Opus/nejvyšší model na orchestraci mechanické dávky | 🟡 | viz §3 |

Výstup: tabulka `položka | naměřeno | práh | verdikt | návrh | očekávaná úspora (tokenů/den nebo %)`.

## 3. Model routing subagentů
Pravidlo: **model podle náročnosti úsudku, ne podle důležitosti úkolu.** Bezpečnostní úsudek = vysoký model; spuštění testu a přepsání výsledku = nejnižší.

| Role | Úkony | Model | Pozn. |
|---|---|---|---|
| Mechanika | grep/inventář souborů, spuštění testů + JSON výsledek, formátování, přejmenování, lint autofix, generování boilerplate z šablony, překlad textů | **haiku** | `maxTurns` nízké; výstup JSON |
| Standardní práce | FIX běžného bugu, VERIFY průchod Playwright, REVIEW diffu, psaní testu k jasnému AK | **sonnet** | výchozí pro 80 % práce |
| Úsudek | architektura, zaseknuté P0 (plato), bezpečnostní design review, RLS/tenant model, refaktor hranic modulů, arbitr auditu | **opus** (nejvyšší dostupný) | jen tam, kde chyba stojí víc než tokeny |
| Hlavní vlákno Kapitána | orchestrace, verdikty bran | sonnet výchozí; opus jen pro plánovací fázi dávky | drž kontext malý (skill: kapitán nefixuje) |

Kontroly:
- [ ] Každý `.claude/agents/*.md` má `model:` explicitně (ne `inherit` z Opus hlavního vlákna) a `tools:` zúžené na roli.
- [ ] Žádný subagent nemá bezdůvodně `opus` na mechanice; žádný `haiku` na bezpečnostním review.
- [ ] Projekt bez subagentů → 🔴 nález: doporučit minimálně TRIAGE/FIX/VERIFY/REVIEW (šablony v skillu uzavřená smyčka) — důvod: throwaway kontext + paralelismus + oddělení autora od kontrolora.
- [ ] `maxTurns` u mechanických agentů; `permissionMode` ne `bypassPermissions` mimo kontejner.

## 4. Dělení kódu na bloky (modularizace) — Kapitán má navrhovat sám, včas
Symptom projektů psaných agenty: malý projekt vyroste, ale zůstane v jednom velkém souboru/bloku → agenti nemohou pracovat paralelně (LOCK na jednom souboru), každá změna čte celý soubor (tokeny), chyba se hledá v celku.

**Prahy (Kapitán kontroluje při každé dávce, `tools/efficiency-audit.mjs modules`):**
| Signál | 🟡 | 🔴 |
|---|---|---|
| Řádky souboru (ts/tsx/js/html/py) | > 500 | > 1000 |
| Odhad tokenů souboru | > 15 k | > 30 k (nevejde se rozumně do jednoho čtení) |
| Funkce/komponenta | > 80 řádků | > 200 |
| Počet exportů z jednoho souboru | > 15 | > 30 |
| Souběžné editace | 2 agenti čekali na LOCK téhož souboru v jedné dávce | 3+ |
| Blast radius | změna v oblasti X rozbila test oblasti Y (jiná doména) | opakovaně |
| Import cykly | 1 | > 1 |

**Kdy oddělit blok (pravidlo pro Kapitána, zapsat do CLAUDE.md projektu):**
1. Před přidáním featury do souboru, který je 🔴 → nejdřív návrh rozdělení (samostatná položka, P2), pak featura.
2. Dělit podle **domény/odpovědnosti** (auth, tenant, quotes, mail, ui/dropdown…), ne podle typu souboru; každý blok má jasné rozhraní (export index), vlastní testy a vlastníka v LOCK protokolu.
3. Vyjmutý blok = čistý přesun + import (žádná změna chování v témže commitu); ověření = regrese 0 failů + `git diff --stat` ukazuje jen přesun.
4. Monolit typu `app.html`: dělit na moduly buildem skládané (`build_html.py` už existuje → moduly do `src/modules/*.js`, build je slepí) — chování stejné, editace paralelní.
5. Kapitán hlásí v retru dávky: „soubory nad prahem: N, navrženo rozdělení: ano/ne + proč".

## 5. Protokol měření PŘED / PO (povinný)
1. **Baseline (před handoffem)**: `efficiency-audit.mjs context` (statický kontext), `usage` (tokeny za posledních N sessions z `~/.claude/projects/<slug>/*.jsonl` per model: input/cache/output), `churn`, `modules`. Ulož do `AUDIT/06_efektivita.md §Baseline` s datem a commit hashem.
2. **Normalizace**: tokeny / uzavřený issue (PASS) a tokeny / dávku; samotný součet tokenů nic neříká, když se udělalo víc práce.
3. **Zásah** = Kapitán zapracuje položky handoffu (každá má důkaz: diff CLAUDE.md, seznam vypnutých MCP, agent frontmattery, rozdělené soubory).
4. **Po**: stejné příkazy, stejná okna (např. 5 dávek nebo 7 dní), stejný typ práce. Rozdíl v % + absolutně. Šum: < 10 % rozdílu nepovažuj za efekt.
5. **Verdikt**: 🟢 úspora ≥ 20 % tokenů/issue bez poklesu FPY; 🟡 úspora < 20 % nebo FPY klesl; 🔴 spotřeba vzrostla → vrátit Kapitánovi.
6. Pomůcky: `/cost` v Claude Code (aktuální session), komunitní `ccusage` nad session logy (ověř aktuálnost balíčku před doporučením).
7. **Měř v ČERSTVÉ session** stejnou úlohou (instrukce a hooky se načítají při startu) — velikost instrukcí, počet tahů, usage. Hash shoda upraveného CLAUDE.md na disku ≠ aktivace ≠ úspora.
8. **Latence hooků** měř zvlášť a označ „latence, ne tokeny" (z praxe: 326 ms na každý Bash příkaz) — `time echo '{}' | node hook.js` pro každý hook; > 200 ms na PreToolUse = 🟡.
9. **Katalog vs. opakované načítání**: skill/agent, který za 14 dní nikdo nevyvolal, je kandidát na vypnutí (silný signál, ne důkaz) — `efficiency-audit.mjs usage` počítá volání Skill/Agent z transkriptů.
10. Bezpečnostní nálezy v konfiguraci (skill tiskne tajemství, hook loguje env) řeš **bez ohledu na tokeny** — nemíchat do „diety".
11. Dieta = kroky seřazené podle poměru úspora/riziko, každý s odhadem KB/tokenů a přiznaným rizikem (mrtvý soubor = nulové riziko; změna zdroje pluginu = vyšší).
