---
name: uzavrena-smycka
description: 'Uzavřená QA smyčka pro dávku ≥3 bugů/featur: formalizuj → oprav → nezávisle ověř → (fail → zpět autorovi) → review → vydej → pouč se. Použij, když je na stole seznam issues k reálnému dotažení; ne pro jeden triviální fix.'
user-invocable: true
---

# Uzavřená smyčka (solve-issues loop)

> Běží-li u projektu nezávislý Auditor: jeho handoff, verdikty a brána vydání mají přednost; tato smyčka je vnitřní disciplína Kapitána, ne náhrada auditora.

> „Přestaň psát prompty, piš smyčky." Když najdeš chybu, neopravuj JI — uprav SMYČKU, aby ji
> příště chytila sama. Ty (hlavní vlákno, orchestrátor) technicky NEŘEŠÍŠ nic: rozhazuješ práci,
> hlídáš brány, děláš arbitra. Nikdy nefixuj ručně v hlavním vlákně — i drobnost deleguj (context
> pollution). Jediné výjimky orchestrátora: build pro verify a DEPLOY_SEKVENCE (§PRAVIDLA
> PROJEKTU). Subagenti mají throwaway kontext → tvůj kontext zůstává malý → smyčka běží hodiny.
> Zdroje: loop engineering (Anthropic best-practices), TDD red-green, code.claude.com/docs/en/best-practices.

## Kdy použít / nepoužít
- ✅ Dávka ≥3 issues s ověřitelným cílem (bugy z terénu, kanban, audit, feature pack).
- ✅ Opakující se typ práce, kde se vyplatí gate-mechanismus (deploy vlny, datové integrace).
- ❌ Jediný triviální fix (overhead > přínos) — ale i tak platí brány §Vydání.
- ❌ Explorativní research bez definovatelného „hotovo".

## PROJECT CONFIG — čte se, nevypisuj ručně, co lze přečíst
Dva zdroje, oba musí existovat PŘED prvním spuštěním dávky:

**1) Z projektu** (najdi, nevymýšlej):
| Klíč smyčky | Kde |
|---|---|
| BACKLOG | soubor, kde projekt vede úkoly (`KANBAN.md`, `docs/…`, issues) — uveden v `CLAUDE.md`/`AGENTS.md` |
| CHYBOVNÍK | `docs/CHYBOVNIK.md` projektu; běží-li nezávislý Auditor, i jeho `AUDIT/CHYBOVNIK.md` (jen čtení) |
| REPO_CWD | kořen git repa projektu |
| PRAVIDLA_PROJEKTU (kdo smí build+deploy, model routing) | `CLAUDE.md`/`AGENTS.md`; aktivovaná pravidla katalogu `PROVOZ_AGENTU.md` §2 |

**2) Ručně v `CLAUDE.md` sekci „Build + Deploy" / „Direktivy majitele projektu"** (jeden zdroj
pravdy, needituj tuhle tabulku i CLAUDE.md nezávisle na sobě):
| Klíč smyčky | Kde se v CLAUDE.md hledá |
|---|---|
| PROD_URL | „Stack" / „Build + Deploy" |
| LOCK_SOUBORY | „Direktivy majitele projektu", nebo „nepoužívá se" (sólo projekt) |
| SDÍLENÉ_PROCESY | „Stack" (dev server, DB…), nebo „žádné" |
| BUILD_PRO_VERIFY / DEPLOY_SEKVENCE / DEPLOY_VERIFY / ROLLBACK | „Build + Deploy" |
| VERIFY_PROSTŘEDÍ | typicky lokální čerstvý build, NIKDY produkce (ta je v tu chvíli stará) |
| KANÁL_REPORTER | „Komunikace" |
| REGRESE | adresář regresní sady, nebo „zatím žádná" (založ, až vznikne první automatizovatelný AK) |
| MOMENTKY | `reports/momentky/<batch-<datum>>/` nebo dle projektu |

⛔ Klíč, který skill potřebuje PRÁVĚ TEĎ a chybí (typicky DEPLOY_SEKVENCE před vydáním) → STOP,
dopiš do `CLAUDE.md`, nikdy nespouštěj smyčku nanečisto s hádaným postupem.

## Architektura rolí

| Role | Agent | Model | Kontext |
|---|---|---|---|
| ARBITR (ty) | hlavní vlákno | — | jen zadání+verdikty bran, ŽÁDNÉ technické detaily |
| TRIAGE | `kontrakt-formalizator` | výchozí | throwaway; výstup = issue objekty (fáze 0) |
| FIX | [TODO: doménový FIX agent projektu] / general-purpose | výchozí (mechanika levný) | throwaway |
| VERIFY | `overovatel-nezavisly` (`e2e-runner` jen na tvorbu E2E testu PO PASS) | výchozí (P0 → tier výš) | throwaway; nikdy Write/Edit |
| REVIEW | `code-reviewer` (`security-reviewer`/`python-reviewer`/`typescript-reviewer` dle stacku) | výchozí | throwaway |
| ARBITR-POMOCNÍK (jen deterministický noční běh) | `manazer-stavu` | výchozí (2× plato → nejdražší) | toolless, blind — vidí jen AK+VERDICT+historii, ne kód |
| ARCHITEKT (jen zaseknuté P0) | Plan / general-purpose | nejdražší | throwaway |

⛔ FIX ≠ VERIFY ≠ REVIEW — vždy tři různé instance (autor si vlastní práci neschvaluje). Pokud
`kontrakt-formalizator`/`overovatel-nezavisly`/`manazer-stavu` v projektu nejsou aktivní,
fallback `general-purpose` + role popsaná v promptu — aktivuješ je z katalogu Auditoru (`node <workspace>/tools/katalog.mjs aktivuj …`).
Subagent dostává PLNÝ text issue přímo v promptu, ne odkaz „přečti si kanban" — šetří kolo a
brání čtení cizích issues.

## Fáze smyčky

### 0) TRIAGE + FORMALIZACE (nejdůležitější krok — „červený test")
Vykonává TRIAGE agent (paralelně, po issue); orchestrátor jen schvaluje výsledné AK.
**Výstup pro KAŽDÝ issue = objekt `{id, text, ak, vstupni_bod, userFacing, soubory,
cerveny_test}`** — s ním pracují všechny další fáze.
1. **Reprodukce na CONFIG:PROD_URL/VERIFY_PROSTŘEDÍ.** Nereprodukovatelný → NEOPRAVUJ:
   nejčastější příčina je stará verze/bundle u reportera → ověř verzi přes CONFIG:KANÁL_REPORTER,
   zavři jako duplicitu, nebo vrať reporterovi dotaz (fix+verify+review kolo stojí ~10× víc než
   triage).
2. **Acceptance kritérium (AK)** = objektivně ověřitelný výrok, ne pocit (příklad UX: „klik na
   tlačítko X otevře dialog Y"; příklad dat: „dotaz/grep vrátí N záznamů, 0 mismatch"; příklad
   výkonu: „operace < X ms na referenčním vstupu").
   - ⛔ **AK MUSÍ jmenovat PŘESNÝ vstupní bod** (které tlačítko/menu/karta/popup), ne jen že
     funkce technicky projde při přímém volání — „tlačítko existuje" NENÍ AK, „tlačítko je vidět
     po [přesná cesta uživatele]" JE AK.
   - ⛔ **AK filtru/výběru VŽDY zní „vrátí >0 na reálných datech"**, ne „dialog se otevře" — UI
     může být OK a datová vrstva prázdná. Nový filtr = ověřit i datovou stranu + rebuild
     odvozených artefaktů.
3. **Červený test**: způsob, jak AK ověřit, který TEĎ selhává (E2E krok, dotaz, skript). Bez
   červeného testu nevíš, že zelená znamená opraveno.
4. Clustering podle souborů (→ pole `soubory`) → issues na stejný soubor sériově (LOCK), na
   různé soubory paralelně.
5. ⛔ **PLOŠNÉ AK pro plošné úkoly**: úkol „VŠECHNO X" → AK = **měřitelné číslo z
   VYČERPÁVAJÍCÍHO skenu**, ne vzorek. **Nástroj skenu pojmenuj přímo v AK — verifikace = TENTÝŽ
   nástroj znovu.** Reporty dílčích agentů se NESČÍTAJÍ na „hotovo celku" — celek potvrzuje jen
   nezávislý plošný sken; mezera nad prahem → další kolo automaticky, nikdy „vydat s poznámkou".
6. ⛔ **Kill-switch dávky**: >50 % issues nereprodukovatelných → STOP celé dávky. Rozbitý je
   reportovací KANÁL (typicky stará verze u reportera), ne kód. Oprav kanál, pak nová triage.

### 1) FIX (autor)
Spawn s přesným balíčkem (šablona níže). Autor MUSÍ:
- self-check před „hotovo": syntax/parse check, reprodukce AK lokálně, `git status` (žádný cizí
  soubor),
- commit JMENOVITĚ **A** se scope-pathspecem na commitu samém: `git add <soubor> && git commit
  -m "…" -- <soubor>` (i pojmenovaný `git add` může vzít, co mezitím stagnul souběžný agent do
  STEJNÉHO indexu) + push,
- vrátit STATUS: `DONE` / `DONE_WITH_CONCERNS` (+ co) / `NEEDS_CONTEXT` (+ co chybí) / `BLOCKED`
  (+ proč). Falešné „hotovo" je porušení. Arbitr: `NEEDS_CONTEXT` → dodej kontext; `BLOCKED` →
  NIKDY nespouštěj znovu beze změny zadání — rozpadni issue, nebo eskaluj ARCHITEKTOVI.

**Šablona FIX promptu (vyplň `[]` — vše ostatní nech; hodnoty z CONFIG dosaď doslovně):**
```
Role+soubor: pracuj v [CONFIG:REPO_CWD]; edituj VÝHRADNĚ [soubor]; cizí soubory NEEDITUJ, jen
zdokumentuj (soubor+funkce).
LOCK: [protokol z CONFIG:LOCK_SOUBORY, týká-li se editovaného souboru].
Issue: [ID + PLNÝ doslovný text reportu]
Acceptance kritérium: [AK z fáze 0 — přesně, vč. vstupního bodu]
Předchozí pokus: [prázdné při 1. iteraci / verdikt VERIFY + co tvrdil předchozí autor]
Kotvy: [soubor:řádek / grep pattern / funkce — ušetří 80 % hledání]
Zákazy: NEbuild, NEdeploy (smí jen orchestrátor — CONFIG:PRAVIDLA_PROJEKTU) · žádný prázdný
catch{} · UTF-8+diakritika, pokud projekt používá non-ASCII text · research-first (vzor
v okolním kódu, reuse helper)
· ⛔ NIKDY neukončuj [CONFIG:SDÍLENÉ_PROCESY] (gates ho potřebují)
· žádné blokující dotazy — chybí-li kontext, vrať STATUS NEEDS_CONTEXT a skonči
· před commitem `git status` na STAGED — cizí staged soubory `git reset HEAD <f>`
· ⛔ NIKDY `git reset --hard`/`git checkout -- <f>`/`git stash` ve sdíleném stromě — jediná
povolená očista = `git reset HEAD <f>`; konflikt working tree = STOP + DONE_WITH_CONCERNS.
Výstup: STATUS (DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED) · co opraveno (1 věta/AK) ·
self-check důkaz · co je mimo scope · commit hash.
```

### 2) VERIFY (nezávislá brána funkčnosti)
**Příprava (orchestrátor):** před KAŽDOU verify instancí — i opakovanou po FAIL→fix — spusť
CONFIG:BUILD_PRO_VERIFY. Bez rebuild verify testuje starý kód a verdikt je bezcenný.
⛔ **ŽELEZNÉ: ŽÁDNÁ user-facing feature/fix se NEVYDÁ bez POZITIVNÍHO DŮKAZU z reálného flow** —
momentka z průchodu PŘESNĚ tím flow, které použije uživatel. Gates hlídají regrese celku,
NEdokazují novou featuru. „syntax check + review prošel" NENÍ důkaz.
Důkaz > tvrzení: verdikt obsahuje výstup příkazu / počet / screenshot, ne „ověřeno".
**Po PASS zapíše VERIFY agent červený test jako `REG-NNN_<slug>.<ext>` do CONFIG:REGRESE —
jediná povolená výjimka ze „jen verdikt"; orchestrátor ho commitne jmenovitě.**

**Šablona VERIFY promptu (vyplň `[]` — vše ostatní nech; hodnoty z CONFIG dosaď doslovně):**
```
Role: nezávislá brána funkčnosti. ⛔ NIKDY nefixuješ — jen verdikt (+ po PASS ulož červený test
do [CONFIG:REGRESE] jako REG-NNN_<slug>.<ext>).
Issue: [ID] · AK doslova: [AK vč. PŘESNÉHO vstupního bodu]
Scénář: začni OD vstupního bodu z AK (reálné flow uživatele), NE přímým voláním funkce.
Prostředí: [CONFIG:VERIFY_PROSTŘEDÍ]. Mobilní featura → POVINNĚ nástroj s touch emulací (mobilní
viewport, hasTouch, long-press = pointerdown+delay+up) — desktop click nechytí touch bugy.
Čerstvý běh: každý důkaz z příkazu spuštěného TEĎ — žádné cached výstupy, žádné výsledky
z předchozích iterací.
Důkaz: jen POZITIVNÍ signál (dialog vyskočil / počet>0 / „Production: https" / screenshot); ⛔
žádný grep, který může matchnout chybovou hlášku.
User-facing featura → momentka z průchodu do [CONFIG:MOMENTKY], cestu vrať ve verdiktu.
Console: 0 pageerrors. Data-issue: nezávislý přepočet, nevěř číslu autora.
Fix měnící vizuální layout nad klíčovou obrazovkou → spusť i existující vizuální regresní test
pro tu obrazovku, pokud je v CONFIG:REGRESE.
Živý fakt, ne proxy: ověř verzi buildu / skutečný obsah pole / běžící proces — ne session flag,
localStorage marker, „already configured", ani hlášení uživatele.
Zakázané formulace: „mělo by fungovat", „vypadá správně", „pravděpodobně OK" — jen důkaz.
Výstup: POUZE JSON {scenar, pass, pozorovani (REÁLNÝ fakt: selektor nenalezen / počet=0 /
doslovný console error / HTTP status — žádné „proč to asi je"), kroky_reprodukce,
screenshot_path (POVINNÉ u user-facing featur)}.
```

**VERDICT schema (deterministický režim; interaktivní má pole vypsaná v šabloně):**
```js
const VERDICT = {type:'object', required:['scenar','pass','pozorovani','kroky_reprodukce'],
 properties:{
  scenar:{type:'string'},
  pass:{type:'boolean'},
  pozorovani:{type:'string', description:'REÁLNÝ fakt: selektor nenalezen / počet=0 / doslovný console error / HTTP status'},
  kroky_reprodukce:{type:'string'},
  screenshot_path:{type:'string', description:'POVINNÉ u user-facing featur — bez něj se PASS nepočítá'}}}
```

### 3) FAIL → ZPĚT AUTOROVI (jádro smyčky)
Interaktivní režim: zpráva zpátky FIX agentovi s obsahem verdiktu (`pozorovani` +
`kroky_reprodukce`) — pokračuje s kontextem, pokud nástroj podporuje resume/message-to-agent.
**Po každé opravě → rebuild (CONFIG:BUILD_PRO_VERIFY) → nová VERIFY instance (fáze 2), nikdy
verdikt od autora.**
Deterministický režim: nový fix agent s verdiktem v promptu (viz §Orchestrace — zpráva do
workflow agentů typicky nefunguje).
Do návratu jde VŽDY strojový verdikt, nikdy interpretace „proč to asi je" — self-diagnóza agenta
je nespolehlivá bez ohledu na sebejistotu formulace; strojová stopa (selektor/výstup
příkazu/HTTP status/console error) je jediný důvěryhodný zdroj.
**Pojistky proti zacyklení:**
- max **3 iterace** na issue → STOP, zapiš do handoffu/kanbanu jako ODLOŽENÉ s poznámkou obou
  stran (co tvrdí autor, co vidí verify) — rozhodne arbitr. Limit se NIKDY neresetuje; změní-li
  arbitr AK, issue se uzavře a založí nový s čítačem od 0. Pád VERIFY agenta (infrastrukturní
  chyba) se NEPOČÍTÁ jako iterace;
- **plato pravidlo**: 2 iterace se STEJNÝM FAIL → nezkoušej totéž — jiná hypotéza root-cause,
  jiný agent, u P0 ARCHITEKT. Plato akce se počítá do limitu 3 iterací;
- **architektonický vzor**: každá oprava odhaluje NOVÝ problém JINDE (coupling, sdílený stav) →
  to nejsou izolované bugy — nespaluj iterace, rovnou ARCHITEKT;
- agent spadl → resume, je-li to podporováno; bez transkriptu → nový spawn se závěry starého.

### 4) REVIEW (brána kvality kódu, na CELOU dávku najednou)
`code-reviewer` na diff od posledního release tagu, DVĚ dimenze v tomto pořadí:
1. **Scope compliance**: diff dělá VŠECHNO, co issues žádají, a NIC navíc — cizí soubory,
   nesouvisející „vylepšení" a scope creep = P1 nález.
2. **Kvalita**: regrese, prázdný catch{}, encoding, secrets v klientu, user text = data,
   konzistence.
P0/P1 → fáze 3 (zpět autorovi, rebuild + nová VERIFY po opravě). P2 → zapiš, neblokuje.
⛔ Reviewer instruuj: hlásit JEN nálezy ovlivňující správnost/zadání — reviewer poslaný hledat
chyby vždy nějaké najde a honba za všemi vede k over-engineeringu.

### 5) VYDÁNÍ (teprve po PASS všech bran; vykonává VÝHRADNĚ orchestrátor)
CONFIG:DEPLOY_SEKVENCE → CONFIG:DEPLOY_VERIFY → commit outputs JMENOVITĚ + **release tag**
(kotva pro příští REVIEW diff).
Changelog: položka pro KAŽDÝ user-facing fix dávky, netechnicky.
⛔ **DEPLOY_VERIFY FAIL → OKAMŽITĚ CONFIG:ROLLBACK, teprve pak diagnóza.** Nikdy fix-forward na
rozbité produkci.
Deploye DÁVKOVAT. Po vydání krátký netechnický report majiteli projektu (co je nového, ne jak) —
odesílá JEN orchestrátor a **obsahuje momentku každé user-facing featury dávky**.

⛔ **Povinný závěr KAŽDÉ dávky pro majitele projektu — bez téhle tabulky žádný řádek „hotovo" v
dávce neexistuje:**
| Bod | Stav | Důkaz |
|---|---|---|
| ID + text issue | HOTOVO / ODLOŽENO / ZAMÍTNUTO | URL / test (`REG-NNN_slug`) / screenshot cesta |

Každý bod dávky má vlastní řádek — i ten, co se nestihl (ODLOŽENO + proč), i ten, co byl
zamítnutý formalizátorem (STARÁ_VERZE/DUPLICITA/OTÁZKA). „Stav" bez řádku v téhle tabulce se
nepočítá za komunikované majiteli projektu, ani kdyby byl technicky hotový.

### 6) RETRO — self-improvement (bez tohoto to není smyčka, jen pipeline)
Po každé dávce 2 minuty:
1. Každý nový druh selhání (můj i agentů) → řádek do CONFIG:CHYBOVNÍK §1 (chyba → poučení →
   jaká BRÁNA/hook to teď chytá mechanicky). ⛔ JEN tam — ve skillu žádná kopie (dva zdroje pravdy
   driftují).
2. **Uprav mechanismus**: chytila by to některá brána příště sama? Ne → přidej kontrolu do
   brány/šablony promptu, nebo navrhni nový hook (viz `docs/RULES.cs.md` §10 pro seznam hooků
   kitu vs. procesní pravidla).
3. Před další dávkou projeď CONFIG:CHYBOVNÍK jako checklist.
4. **METRIKY dávky** → CONFIG:CHYBOVNÍK §3: datum, počet issues, first-pass-rate, Ø iterací,
   kolik odloženo, kolik nových tříd chyb. Cíl: first-pass-rate roste, Ø iterací klesá.
Chyba, která se zopakuje, je selhání smyčky — ne agenta.

## Regresní sada (červené testy se střádají, ne zahazují)
CONFIG:REGRESE — každý vyřešený issue s automatizovatelným AK tam nechá test
(`REG-NNN_<slug>.<ext>`, zapisuje VERIFY agent po PASS, commituje orchestrátor). Runner
sady je krok DEPLOY_SEKVENCE (Spotify pattern: každý bug = navždy hlídaný). Aby gate
nezdegeneroval růstem:
- deploy gate = smoke + rychlé testy (cíl < ~60 s celkem); pomalý test → tag `@slow`;
- plná sada vč. `@slow` = nightly / před velkou dávkou / po zásahu do sdílených modulů;
- gate, který se kvůli délce přeskakuje, je mrtvý gate — když zpomalí, ROZDĚL, nemaž.

## Orchestrace

**Interaktivně (výchozí):** subagenti paralelně na disjunktní soubory; brány jako samostatní
agenti; návraty přes zprávu do agenta (drží transcript, je-li podporováno). Stav v
STATE.md/backlogu, ať přežije kompakci.

**Deterministicky (velká dávka, noc):** workflow/pipeline nástroj tvého prostředí. Script
spouští orchestrátor → build kroky v něm jsou výkon orchestrátora dle CONFIG:PRAVIDLA_PROJEKTU.
⛔ Zpráva do workflow agentů typicky nefunguje — retry smyčka musí být V KÓDU stage:
```js
// fixPrompt/verifyPrompt = šablony fází 1-2 s dosazeným CONFIGem; buildPrompt = 'Spusť
// <CONFIG:BUILD_PRO_VERIFY> v <CONFIG:REPO_CWD>, vrať posledních 20 řádků výstupu.'
const results = await pipeline(issues,
  async (_, issue) => {
    let last = null, ctx = ''
    for (let iter = 1; iter <= 3; iter++) {
      const fix = await agent(fixPrompt(issue, ctx), {label:`fix:${issue.id}#${iter}`, phase:'Fix'})
      await agent(buildPrompt(), {label:`build:${issue.id}#${iter}`, phase:'Verify'}) // bez rebuild verify testuje starý kód
      let verdict = await agent(verifyPrompt(issue), {label:`verify:${issue.id}#${iter}`, phase:'Verify', schema:VERDICT})
      if (!verdict) verdict = await agent(verifyPrompt(issue), {label:`verify-retry:${issue.id}#${iter}`, phase:'Verify', schema:VERDICT})
      if (!verdict) return {id:issue.id, status:'VERIFY_INFRA_FAIL', iter}   // pád verify ≠ vina fixu, neplýtvej iteracemi
      if (verdict.pass && issue.userFacing && !verdict.screenshot_path)
        verdict = await agent(verifyPrompt(issue) + '\nPOVINNĚ vrať screenshot_path z reálného průchodu.',
          {label:`verify-shot:${issue.id}#${iter}`, phase:'Verify', schema:VERDICT})
      if (verdict?.pass && (!issue.userFacing || verdict.screenshot_path))
        return {id:issue.id, status:'PASS', iter}
      const plato = last && verdict?.pozorovani === last.pozorovani
      ctx = (plato ? 'PLATO: předchozí přístup NEOPAKUJ — jiná root-cause hypotéza.\n' : '')
        + `Předchozí pokus selhal.\nPozorování: ${verdict?.pozorovani}\nReprodukce: ${verdict?.kroky_reprodukce}\nCo autor tvrdil: ${fix}`
      last = verdict
    }
    return {id:issue.id, status:'ODLOZENO', verdict:last}
  }
)
// Eskalaci na ARCHITEKTA noční režim NEDĚLÁ — ODLOZENO a VERIFY_INFRA_FAIL řeší orchestrátor ráno.
```
Trade-off: nový fix agent nemusí mít transcript předchozího — proto `ctx` nese verdikt i tvrzení
autora. Po doběhu jediný REVIEW na celek → vydání ručně (orchestrátor).

## Chybovník
⛔ Ve skillu NENÍ kopie — jediný zdroj pravdy je CONFIG:CHYBOVNÍK (živý; retro píše jen tam).
**Před KAŽDOU dávkou ho načti a projeď jako checklist.** Každá třída jmenuje bránu, která ji MUSÍ
chytat — proklouzne-li, oprav bránu (§6).
Archetypy pro nový projekt (než chybovník naroste):

| Archetyp | Brána |
|---|---|
| Stará verze u reportera („nefunguje" na opraveném) | TRIAGE: verze zařízení dřív než cokoliv |
| Falešný úspěch slabého grepu | VERIFY: jen pozitivní signál + nezávislý re-check |
| Hotovo v kódu, nenalezitelné z reálného vstupu | AK jmenuje vstupní bod; VERIFY scénář jde od něj |
| UI ovládání OK, datová vrstva prázdná | AK „vrátí >0 na reálných datech"; ověřit data + rebuild odvozených artefaktů |
| Sdílený mutable stav (git index, LOCK soubor) | jmenovité commity s pathspecem; diff po cizím UNLOCKu |

## Checklist před spuštěním dávky
- [ ] CONFIG vyplněn (CLAUDE.md/AGENTS.md) — žádné `[TODO]`; CHYBOVNÍK načten jako checklist
- [ ] Verze reportera ověřena (nebo fallback dle KANÁL_REPORTER a riziko přiznáno)
- [ ] Každý issue: objekt s AK (vč. vstupního bodu), userFacing flagem a červeným testem
- [ ] FIX ≠ VERIFY ≠ REVIEW; modely dle rolí; fallback general-purpose připraven
- [ ] BUILD_PRO_VERIFY: rebuild před každou verify instancí (i opakovanou)
- [ ] Pojistky: 3 iterace (plato uvnitř limitu, pád verify se nepočítá), statusy autora, resume
- [ ] Vydání až po branách; ROLLBACK po ruce; deploy dávkovaný; jmenovité commity + release tag
- [ ] Report vydání s momentkou každé user-facing featury
- [ ] Retro: nové třídy → CHYBOVNÍK §1, metriky → §3
