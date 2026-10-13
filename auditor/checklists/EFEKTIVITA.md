# Checklist EFEKTIVITA — first-pass yield, spotřeba tokenů, model routing, dělení kódu

Cíl: ne „kolik se napsalo", ale **kolik z napsaného prošlo napoprvé bez opravy** a **kolik tokenů to stálo**.
Auditor měří PŘED zásahem (baseline), předá doporučení Kapitánovi, po zapracování měří ZNOVU stejnou metodou
a rozdíl zapíše do `AUDIT/06_efektivita.md`. Bez srovnatelného měření lze uzavřít provedenou změnu konfigurace, ale její přínos zůstává NEOVĚŘENO.

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

Kontroly mechanismu kvality (proč FPY padá), použitelné podle stacku a typu změny. Číselné prahy jsou orientační signály pro další ověření, nikoli samostatný důkaz chyby:
- [ ] AK jmenuje skutečný vstupní bod a očekávaný výsledek na reprezentativních datech; například počet výsledků >0, pokud to úloha vyžaduje.
- [ ] FIX ≠ VERIFY ≠ REVIEW dodrženo (transkripty/labels subagentů); autor si nikdy nedává PASS.
- [ ] Regresní test reprodukuje opravovanou chybu a je uložen v sadě odpovídající projektu; konkrétní název složky není podmínkou.
- [ ] Ověření používá aktuální kód; rebuild proveď, pokud ho daný stack potřebuje.
- [ ] Retro po dávce zapsáno (chybovník §2 roste, stejná třída chyby se neopakuje 2×).
- [ ] Plošné úkoly mají číselné AK ze skenu, ne „hotovo" ze součtu subagentů.
Nález = konkrétní chybějící brána + návrh mechanismu (skript v gate > věta v promptu).

## 2. Audit kontextu a spotřeby tokenů
Nejdřív profil, původ a relevance podle `NASTAVENI_PROJEKTU.md`. Inventura souborů nedokazuje, co platforma skutečně načetla. Odhady drž odděleně pro Claude a Codex; chybějící telemetrie znamená neznámé použití.
Nástroj: `tools/efficiency-audit.mjs context <repo> --harness all` (odhad tokenů ≈ znaky/4; skutečná čísla pouze z kompatibilní telemetrie dané platformy).
Prahy níže jsou podněty k ověření, nikoli automatický verdikt. Řádky se specifickými soubory či hooky Claude platí jen pro ověřenou verzi Claude; u Codexu použij jeho účinné instrukce a možnosti. N/A a neznámé pokrytí přiznej.

| Položka | Kontrola | Práh | Typický fix |
|---|---|---|---|
| `CLAUDE.md` (+ `~/.claude/CLAUDE.md`, `CLAUDE.local.md`) | velikost, duplicity, věci co patří do skillu | > ~200 řádků / > 6 k tokenů = 🟡, > 12 k = 🔴 | jádro = pravidla+pointery; detaily do `.claude/skills/*/SKILL.md` (načte se jen při potřebě) |
| `.claude/rules/*.md` | mají `paths:` glob, nebo se načítají všechny vždy? | pravidla bez `paths` > 3 = 🟡 | přidat `paths:`; sloučit |
| Skilly v `skills:` frontmatteru agentů Claude | ověř explicitní přednačtení plného těla při spuštění; nesměšuj s discovery metadaty | více než 2 = podnět k posouzení relevance | přednačítat jen obsah nutný pro roli; ostatní na vyžádání |
| MCP servery | zdroj a rozsah konfigurace, nativní dostupnost, doložená volání; schémata mohou být odložená podle platformy/verze | 0 doložených volání = kandidát k posouzení, nikoli automatický nález; bez kompatibilního logu použití neznámé | posoudit plánovanou práci a překryv; navrhnout omezení rozsahu či vratné vypnutí; nic automaticky nemaž |
| Hooky `SessionStart`/`UserPromptSubmit` s `additionalContext` | kolik textu injektují při každém promptu | > 500 znaků/prompt = 🟡 | jednou na `startup`, ne na každý prompt |
| Hooky typu `prompt`/`agent` v Claude | ověř frekvenci a skutečná volání modelu | volání na každém tahu = podnět k posouzení | deterministický skript, pokud stačí; jinak nejlevnější dostačující dostupný model |
| Výstupy nástrojů | `pnpm build`/test/lint bez tichého reporteru, `cat` celých souborů, `git log` bez `-n` | > 5 k tokenů/výstup = 🟡 | `--reporter=dot`, `2>&1 \| tail -n 30`, Grep/Read s offsetem |
| Výsledky subagentů | vrací dumpy místo JSON závěru | > 2 k tokenů/výsledek = 🟡 | „Výstup: POUZE JSON {…}" v promptu |
| Délka session / kompakce | počet auto-kompakcí za session | > 3 = podnět k posouzení | stav v souborech a podporovaném správci úloh; nové téma případně do nové relace |
| Opakované čtení | stejný soubor čten > 3× v session | 🟡 | shrnout do kotvy soubor:řádek v promptu subagenta |
| Gate běhy | plná regresní sada při každém verify | > 60 s/gate = 🟡 | smoke + rychlé; `@slow` nightly |
| Telegram most / notifikace / cron | co běží a volá model bez lidského vstupu | opakované běhy bez změny = podnět k ověření nákladů a účelu | událostní trigger, backoff nebo levná kontrola stavu podle skutečné potřeby |
| Model hlavního vlákna | Opus/nejvyšší model na orchestraci mechanické dávky | 🟡 | viz §3 |

Výstup: tabulka `položka | naměřeno | zdroj a jistota | orientační práh | závěr | návrh | odhad přínosu`. Bez srovnatelné telemetrie uváděj kvalitativní hypotézu nebo NEZNÁMO; procenta úspory až po měření.

**Automatická kompakce:** orientační preference je kolem 250 000 tokenů. Respektuj volbu vlastníka, kapacitu konkrétního modelu a rezervu na dokončení kroku. Ověř podporované nastavení; netvrď, že se změnilo, jen podle textu instrukce. Konfigurace hranice, aktuální kontext a souhrnná spotřeba jsou odlišné veličiny. Překročení 150 000 samo o sobě není nález ani důvod požadovat ruční vyčištění relace.
U Claude odlišuj nastavené okno a procentní spouštěč kompakce; u Codexu podporovaný tokenový limit a kapacitu modelu. Balík zachovává vlastní volby a Codexu práh plošně nepřepisuje. Ověř aktuální podporu podle [Claude environment variables](https://code.claude.com/docs/en/env-vars) a [Codex config reference](https://developers.openai.com/codex/config-reference).

## 3. Model routing subagentů
Pravidlo: **model podle náročnosti úsudku a ověřených možností hostitele.** Vyber nejlevnější dostačující dostupný model; bezpečnostní úsudek může vyžadovat silnější model než spuštění testu. Následující názvy jsou příklady pro Claude, nikoli požadavky pro Codex či jinou platformu.

| Role | Úkony | Model | Pozn. |
|---|---|---|---|
| Mechanika | grep/inventář souborů, spuštění testů + JSON výsledek, formátování, přejmenování, lint autofix, generování boilerplate z šablony, překlad textů | **haiku** | `maxTurns` nízké; výstup JSON |
| Standardní práce | FIX běžného bugu, VERIFY průchod Playwright, REVIEW diffu, psaní testu k jasnému AK | **sonnet** | příklad; ověř dostupnost a dostatečnost |
| Úsudek | architektura, zaseknuté P0 (plato), bezpečnostní design review, RLS/tenant model, refaktor hranic modulů, arbitr auditu | **opus** (nejvyšší dostupný) | jen tam, kde chyba stojí víc než tokeny |
| Hlavní vlákno Kapitána | orchestrace, integrace důkazů | podle náročnosti a dostupnosti | drž kontext malý; nezávislý verdikt patří auditorovi |

Kontroly:
- [ ] U Claude ověř účinné `model:` a `tools:` v `.claude/agents/*.md`; u jiné platformy její podporované nastavení. Dědění posuď podle skutečně vybraného modelu a nákladů.
- [ ] Silný model neplýtvá na mechanice; slabší model provádí bezpečnostní review jen pokud jeho schopnosti pro daný rozsah stačí.
- [ ] Potřebu subagentů posuď podle velikosti a rizika změny a pravidel konkrétního projektu. Chybějící subagent sám není nález; vícefázový proces doporuč jen s doloženou potřebou nezávislého ověření nebo oddělení kontextu.
- [ ] Omez počet kol a oprávnění dostupným mechanismem hostitele; nezaváděj nepodporované přepínače.

## 4. Posouzení dělení kódu podle odpovědností
Symptom projektů psaných agenty: malý projekt vyroste, ale zůstane v jednom velkém souboru/bloku → agenti nemohou pracovat paralelně (LOCK na jednom souboru), každá změna čte celý soubor (tokeny), chyba se hledá v celku.

**Prahy (Kapitán kontroluje při každé dávce, `tools/efficiency-audit.mjs modules`):**
| Signál | 🟡 | 🔴 |
|---|---|---|
| Řádky textového zdroje (včetně C/C++ a BASIC/VBA) | > 500 | > 1000 |
| Odhad tokenů souboru | > 15 k | > 30 k (nevejde se rozumně do jednoho čtení) |
| Funkce/komponenta | > 80 řádků | > 200 |
| Počet exportů z jednoho souboru | > 15 | > 30 |
| Souběžné editace | 2 agenti čekali na LOCK téhož souboru v jedné dávce | 3+ |
| Blast radius | změna v oblasti X rozbila test oblasti Y (jiná doména) | opakovaně |
| Import cykly | 1 | > 1 |

**Kdy oddělit blok (relevantní rozhodnutí zapsat do účinných instrukcí projektu podle platformy):**
1. Prahy jsou podnětem k posouzení, nikoli automatickou chybou. Před přidáním featury do velkého souboru zvaž návrh rozdělení podle odpovědností; generované soubory a omezení VBA/C++ posuď podle stacku. Změnu pořadí práce schvaluje vlastník.
2. Dělit podle **domény/odpovědnosti**, s rozhraním a ověřením odpovídajícím jazyku; způsob koordinace vlastníků zvol podle skutečné souběžné práce.
3. Pokud je možné oddělit přesun od změny chování, usnadní to review. Zachování chování dolož regresí, ne samotným diff statem.
4. U monolitu vycházej z existujícího buildu a hostitele. Nepřidávej nový build nebo generátor jen kvůli řádkovému prahu; cenu rozdělení porovnej s doloženým přínosem.
5. Kapitán hlásí v retru dávky: „soubory nad prahem: N, navrženo rozdělení: ano/ne + proč".

## 5. Protokol měření PŘED / PO
Proveď dostupné části pro danou platformu. Nepoužitelné části označ N/A, chybějící telemetrii NEZNÁMO s důvodem; nevynucuj instalaci nástroje jen pro vyplnění tabulky.
1. **Baseline (před handoffem)**: `efficiency-audit.mjs context <repo> --harness all` (oddělený statický odhad), `usage <repo> --harness all`, `churn`, `modules`. Claude usage může vycházet z kompatibilních projektových JSONL; Codex vyžaduje vlastní kompatibilní telemetrii. Bez ní uveď NEZNÁMO, nikoli nulu či náhradní Claude data. Ulož do `AUDIT/06_efektivita.md §Baseline` s datem a commit hashem.
2. **Normalizace**: tokeny / uzavřený issue (PASS) a tokeny / dávku; samotný součet tokenů nic neříká, když se udělalo víc práce.
3. **Zásah** = Kapitán zapracuje položky handoffu (každá má důkaz: diff CLAUDE.md, seznam vypnutých MCP, agent frontmattery, rozdělené soubory).
4. **Po**: stejné příkazy, stejná okna (např. 5 dávek nebo 7 dní), stejný typ práce. Rozdíl v % + absolutně. Šum: < 10 % rozdílu nepovažuj za efekt.
5. **Verdikt**: porovnej s dohodnutým cílem a kvalitou výsledku. Uveď velikost a srovnatelnost vzorku. Bez měření tvrď pouze změnu konfigurace a odhad kontextu, nikoli dosaženou tokenovou úsporu.
6. Pomůcky pouze pro Claude: `/cost` (aktuální session), komunitní `ccusage` nad kompatibilními logy (ověř aktuálnost balíčku před doporučením). U Codexu dolož použitý zdroj; dostupnost nebo účtové limity samy neurčují cenu konkrétní úlohy.
7. Pokud hostitel podporuje nové relace, měř stejnou úlohu v nové relaci a dolož načtení upravených instrukcí. Jinak omezení přiznej. Hash souboru na disku není důkaz aktivace ani úspory.
8. **Latence hooků** měř zvlášť jako latenci, nikoli tokeny, na platném reprezentativním vstupu v cílovém prostředí. Uveď verzi, metodiku a několik opakování; případný rozpočet dohodni podle frekvence a účelu hooku.
9. **Katalog vs. opakované načítání**: skill/agent, který za 14 dní nikdo nevyvolal, je kandidát na vypnutí (silný signál, ne důkaz) — `efficiency-audit.mjs usage` počítá volání Skill/Agent z transkriptů.
10. Bezpečnostní nálezy v konfiguraci (skill tiskne tajemství, hook loguje env) řeš **bez ohledu na tokeny** — nemíchat do „diety".
11. Dieta = kroky seřazené podle poměru úspora/riziko, každý s odhadem KB/tokenů a přiznaným rizikem. Nepoužívaný soubor může mít skrytého konzumenta; před odstraněním ověř závislosti a připrav návrat. Změna sdíleného pluginu ovlivňuje i ostatní projekty.

## Rozsah (user / projekt / local) a přiřazení dat k projektu
- Pluginy, hooky, skilly a instrukce v **uživatelském rozsahu** mohou ovlivnit více projektů. Rozliš dostupná metadata, automaticky načtené tělo a podmíněnou aktivaci; soubor v home sám nedokazuje náklady v každém tahu.
  `efficiency-audit.mjs context` je označí „USER"; doporučení: přesunout do rozsahu projektu (`--scope project|local`), pokud je projekt nepotřebuje všechny.
- Logy pluginů/hooků v home jsou **společné pro všechny projekty**. Čísla z nich (počty volání, podíly modelů…) platí pro projekt až po přiřazení
  session → projekt podle adresáře transkriptu (`~/.claude/projects/<cesta-projektu>/<session>.jsonl`). Bez toho = MEZERA V DŮKAZU, ne nález.
- Spotřeba Kapitána se počítá jen z adresářů transkriptů jeho repa (a worktree), **nikdy** z workspace auditora ani sousedních projektů.
