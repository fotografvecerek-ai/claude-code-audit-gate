# Changelog

Historie změn je v `README.md` (sekce „Změny v…"). Od zveřejnění (v1.0.0) se vede zde.

## 1.0.0 — první veřejná verze
- Vše z interních verzí v2–v3.9.6 (viz README): oddělený auditor, brány (hook/pre-commit/CI), most, šest bran ověření, efektivita, hygiena,
  git praxe, udržitelnost, průzkum disků s výběrem v HTML, instalace bez technických otázek, Windows + mac/Linux.

## 1.0.1
- Dokumentace „co to umí a proč to není běžný audit" v CZ a EN (`docs/CO-TO-UMI.md`, `docs/WHAT-IT-DOES.md`), odkazy z README.

## 1.0.2
- Výchozí maximální paralelizace auditu (subagenty v jedné zprávě, dávky crawl/sond, strop ~10), průběh v AUDIT/_prubeh.md.

## 1.0.3
- CI/CD pro repo samotné: GitHub Actions na Windows/Linux/macOS (syntaxe, samotest, e2e instalace), release workflow na tag `v*` (zip jako Release). Badge v README.
- Docs §3b „Auditor vs. CI“ (CZ+EN) + odstavec v README.

## 1.1.0
- Aktualizace nikdy nepřepisuje AUDIT/ (dřív přepsala CHYBOVNIK.md). Test se zadáním (audit-rezim §4b), nález „funkce bez testu", sekce TST v handoffu; AUDIT/00_prvni_dojem.md do ~1 h; přerámování pro záchranu rozjetého projektu; Auditor vs. CI.
- Docs/README/NAVOD: „Pro koho" výslovně — záchrana rozjetého projektu (primární) vs. prevence od prvního dne (sekundární).

## 1.1.1
- Instalátor: commit pojistek použije vlastní git identitu, když uživatel žádnou nemá; když commit i tak selže, končí červeně (ne „HOTOVO"). Nalezeno CI (macOS/Linux e2e).

## 1.1.2
- Veřejné repo bez osobních odkazů: výchozí cesta v setup-auditor.ps1 obecná, TASK-PROTOCOL bez názvu projektu, checklist udržitelnosti bez fotokoutku. CI převzato z GitHubu (náhrada claude CLI).

## 1.1.3
- Zpráva pro vlastníka AUDIT/ZPRAVA.html: netechnická, semafor, u každého nálezu doporučení; otázky jako interaktivní formulář (ano/ne, varianty, komentář) s předvybranou doporučenou odpovědí a důvodem; odpovědi → Stažené/Auditor_odpovedi_<projekt>.json + schránka, auditor je načte sám. tools/owner-report.mjs.

## 1.2.0
- **Audit z GitHubu** (`START` → [5], `audit-github.ps1|sh`, `tools/remote-clone.mjs`): jen adresa repa, klon vedle workspace, bez Kapitána a bran; ústava §3e (výstup pro klienta, co audit nemůže prokázat); `aktualizovat-repo.cmd|sh` pro novou verzi kódu.
- **Statistika auditu** (`tools/audit-stats.mjs` → `AUDIT/STATISTIKA.html`): soubory a řádky kódu, UI prvky, endpointy, nálezy, verdikty, čas, přesné tokeny z transkriptů podle modelů; ústava §3d.
- START menu: opravené číslo verze.

## 1.3.0
- **Rozcestník** v `START.cmd` / `start.sh`: [1] nový projekt · [2] audit projektu na disku · [3] audit GitHub repa · [4] nápověda · [5] samotest.
- **Nový projekt zdravě od začátku** (`NOVY-PROJEKT.cmd`, `tools/new-project.mjs`, šablona `starter/`): pravidla auditora přímo v projektu
  (CLAUDE.md), nezávislý subagent **kontrolor** (jen čte, zapisuje výhradně do `docs/kontrola/` — vynuceno hookem přes `agent_type`),
  příkazy `/zacatek /zadani /hotovo /kontrola /vydani /uklid`, pojistky `projekt-guard` + pre-commit + `release-check` (vydání jen s 🟢
  kontrolora pro aktuální kód, žádný otevřený P0/P1), CI (pořádek, tajemství, testy, verdikt vydání), dokumenty zadání/stav/provoz/rozhodnutí,
  git, volitelně soukromé repo na GitHubu, zástupce na ploše, agent sám začne `/zacatek`.
- **Kombinace** (výchozí volba při zakládání): vedle projektu i samostatný auditor, který běží periodicky (před větším vydáním, měsíčně);
  jeho 🔴 release gate zablokuje `release-check` projektu, handoff čte agent projektu na začátku session. Volba „jen zdravý start“ zůstává.
- Samotest 94 scénářů (+23 pro nový projekt a kombinaci); CI zakládá nový projekt na všech třech OS.
- `owner-report.mjs` přijímá absolutní cesty `--src/--out`. Opravena volba samotestu v START.cmd (proměnná se v bloku nerozbalovala).

## 1.3.1
- Bezpečnost `owner-report.mjs`: odkazy ve zprávě jen http(s) nebo relativní, uvozovky escapované (text nálezu může pocházet z cizího repa);
  schéma se posuzuje bez bílých a řídicích znaků (`java<TAB>script:` prohlížeč spustí, teď zůstane textem).
- **Kapitán ví, že je Kapitán:** do `CLAUDE.md` projektu se zapisuje blok „Tvoje role: Kapitán“ (mezi značkami, aktualizace ho přepíše; starý
  blok „Audit režim“ nahradí, na Windows se zapíše i když CLAUDE.md chybělo), SessionStart hook `tools/kapitan-role.mjs` roli připomene při každém
  startu i po kompakci, úvodní zpráva `start-kapitan` ji uvádí, skill `audit-rezim` má sekci „Kdo jsi“. Samotest 96.
- **Aktualizace rozjetého auditu bez celého kolečka** (`tools/update-install.mjs`): když workspace existuje, instalátor (START → [2], více projektů,
  audit z GitHubu) jen vymění nástroje, pravidla, pojistky a nastavení (model zachová), commitne jen aktualizované pojistky a spustí samotest.
  Žádný intake, otázky, GitHub kroky ani otevírání oken; `AUDIT/` beze změny. Spouštěče (`tools/write-launchers.mjs`): auditor s rozjetým
  auditem naváže, kde skončil, místo nového intake.
- **Kapitán se dovolá auditorovi** (z reálného běhu: auto-režim zablokoval `bus.mjs`, Kapitán hodiny nic nehlásil): zkratka
  `.claude/hooks/auditor-bus.mjs` v repu (stálá cesta, vždy jako Kapitán, povolená v nastavení), povolení pro most a gate-check;
  role Kapitána a hook při startu mu připomínají hlásit STARTED/DONE u každé položky.
- Pojistka před uložením funguje i ve worktree/sparse checkoutu větve, která ještě nemá `.claude/` (použije pojistky hlavního repa
  místo zablokování commitu).
- **Zprávy z mostu chodí samy během práce** (z reálného běhu: Kapitán i auditor viděli nové zprávy jen při startu, hodiny na sebe čekali):
  `tools/bus-notify.mjs` jako PostToolUse hook doručí novou zprávu hned po dalším kroku agenta (jednou) a jako Stop hook nedovolí skončit tah,
  dokud jsou nepotvrzené zprávy. Obě strany (auditor v šabloně settings, Kapitán přes merge-repo-settings). Nečinné okno, které čeká na člověka,
  zpráva neprobudí sám hook — proto **hlídač mostu na pozadí** (`bus.mjs wait --interval 60`, u Kapitána `auditor-bus.mjs wait`): skončí,
  jakmile přijde zpráva, a tím agenta probudí; ústava auditora, role Kapitána a skill audit-rezim ho vyžadují vždy, když se čeká na druhou
  stranu (postup převzatý z reálného běhu auditora). Samotest 102.

## 1.4.0
- **Telegram pro každého agenta zvlášť**: auditor dostane vlastního bota, Kapitán taky (nebo zůstane jeho stávající most — pozná se sám).
  Oficiální kanál Claude Code (`--channels plugin:telegram@claude-plugins-official`): zpráva z Telegramu přijde přímo do okna, i nečinného,
  agent odpovídá zpět. Každý bot má vlastní složku stavu mimo projekt (`~/.claude/channels/telegram-<projekt>-<role>/`), nové okno převezme
  bota od starého. `tools/telegram-setup.mjs`: Bun, plugin (jen pro danou složku), BotFather, token přes okénko, spárování bez příkazů
  (vlastník napíše botovi, povolí se jen jeho ID). `START → [6]` otevře **průvodce v okně Claude** (`templates/pruvodce_telegram.md`),
  který vede krok za krokem, i instalaci Telegramu, když chybí. Ústava §4b: kdy auditor sám píše vlastníkovi (max ~5 zpráv denně).
- **Příprava počítače**: START/start.sh sám zjistí, co chybí (Git, Node.js, Claude Code), a nainstaluje to (`tools/bootstrap.ps1|sh`:
  winget / Homebrew / apt + oficiální instalátor Claude Code) — i pro klienta, který Claude vůbec nemá.
- **Aktualizace rozjetého auditu audit nikdy neopakuje**: `templates/cile_auditu.json` = cíle přidané novými verzemi; po aktualizaci vznikne
  `AUDIT/NOVE_CILE.md` jen s těmi, které tento audit ještě nemá (a jen v nejmenším rozsahu — např. shrnutí existujících výsledků, jen nové
  commity). Hotové cíle se pamatují v `AUDIT/.balik.json`. Ústava: rozjetý audit (`00_intake.md` existuje) = žádný intake ani průchod znovu.
- **Samostatnost Kapitána** (volba při instalaci, jednou při aktualizaci, `START → [7]`, `tools/opravneni.mjs`): OPATRNÝ / SAMOSTATNÝ
  (skripty projektu a databázi spouští sám, vlastníka neotravuje) / PLNÝ (bez dotazů Claude Code). Pravidla jdou do `.claude/settings.local.json`
  projektu (osobní, necommituje se; naše pravidla označená, cizí zůstávají). Pojistka `kapitan-audit-guard` nově vždy blokuje destruktivní SQL
  (DROP/TRUNCATE/DELETE či UPDATE bez WHERE/db reset); role Kapitána: záloha před zápisem do ostré DB, výsledek auditorovi; auditor zálohu ověřuje.
- Samotest 110.

## 1.4.1
- **Telegram nezávislý na prostředí**: nic se neřídí názvem počítače ani osobními skripty (samotest to hlídá). Složka stavu bota je
  `telegram-<projekt>-<otisk cesty>-<role>`, takže dva projekty stejného jména se nepletou; existující boti z 1.4.0 zůstávají. Spouštěč přidá
  Telegram jen tehdy, když je token bota na tomto počítači; role s botem dostane pokyn k odpovídání rovnou v úvodní zprávě.
- **Kapitán s vlastním mostem projektu dostane nabídku standardního bota** (doporučeno): je to jiný bot, s mostem projektu se nehádá
  a zprávy chodí přímo do okna na každém počítači. Volba „jen vlastní most" se pamatuje; aktualizace se zeptá jednou (`--kapitan-most`).
- **Kontrola při každém startu**: okno s botem pošle vlastníkovi „🟢 … se spouští" (`tools/telegram-ping.mjs`, jen sendMessage, bez sítě tiše
  skončí). `telegram-setup.mjs --test` pošle zkušební zprávu; průvodce [6] ji používá k ověření.
- **Jeden bot = jedno okno**: token, který už používá jiné okno (druhá role nebo jiný projekt), nástroj odmítne a požádá o token nového bota;
  omylem uložený duplicitní token sám smaže (bot zapsaný v konfiguraci má přednost). Neplatná `--kapitan-most` se ignoruje; volba
  „standardní bot" se pamatuje i po nedokončeném založení.
- Spouštěč Kapitána nečeká zbytečně: bez nedávné aktivity v projektu startuje hned; s aktivitou se jednou zeptá (Enter = starého jsem zavřel,
  spusť hned · 1 = počkej na něj). Bez terminálu startuje hned.
- **Plugin se hlídá při každém startu**: spouštěč před spuštěním okna ověří, že je Telegram plugin ve složce zapnutý (`enabledPlugins`
  v `.claude/settings.local.json`), a když ho něco vypnulo, zapne ho znovu (`telegram-ping.mjs --plugin-dir`). Bez toho `--channels` nic nepřijímal.
- Role s botem: na zprávu z kanálu odpovídá výhradně nástrojem `reply` toho kanálu, ne skripty/mostem projektu (jinak odpověď přišla z jiného bota).
- **Úvodní zpráva agenta se už neztrácí**: `--add-dir` i `--channels` v Claude Code berou víc hodnot, takže zpráva uvedená za nimi
  se brala jako další složka a okno startovalo prázdné (Kapitán nedostal svou roli). Spouštěče teď dávají zprávu před volby.
- Nastavení Telegramu plugin po instalaci výslovně zapne (`claude plugin enable --scope local`); samotná instalace to v praxi nestačila.
- Aktualizace před závěrečným samotestem napíše, že probíhá kontrola (1–3 min) — dřív okno vypadalo zamrzle.
- **Rozjetý audit se pozná spolehlivěji**: stačí kterýkoliv výsledek auditu (intake, handoff, nález A-*.md, release gate, zpráva) — spouštěč
  auditora pak vždy naváže a nikdy nezačne intake znovu, ani u starších auditů bez `00_intake.md`. Aktualizace píše jasně, že se jednou
  zeptá jen na nové volby (dřív tvrdila „Na nic se neptám" a pak se ptala). INSTALL.cmd snese cestu v uvozovkách a s lomítkem na konci.
- Dokumentace a checklisty bez interních názvů projektů (příklady „z praxe").
- Po nastavení bota průvodce i nástroj nejdřív řeknou „spusť okna auditora/Kapitána" a teprve potom „napiš botovi" (dřív radily test,
  když okna ještě neběžela a bot neměl komu zprávu předat).
- **Okénko na token bota je vždy navrchu** uprostřed obrazovky (Windows: vlastní okno TopMost místo InputBoxu, který se schovával pod
  ostatní okna; mac: dialog v popředí). Terminál navíc napíše, kde okénko hledat.
- Po aktualizaci a po nastavení Telegramu se sama otevře složka se spouštěči auditora a Kapitána.
- Samotest „nezávislost na počítači" kontroluje jen soubory balíku (ve workspace ležely kopie projektu a samotest po aktualizaci falešně selhal).
- Samotest 126.

## 1.5.0
- **Codex — všechny kombinace**: auditor a/nebo Kapitán v OpenAI Codex CLI (`START → [8]`, `tools/codex-setup.mjs`, volba v `.agents.json`).
  Pravidla v `AGENTS.md`; pojistky přes `.codex/hooks.json` → `tools/codex-hook.mjs` (adaptér: `apply_patch` → kontrola po souborech, env
  pro pojistky, kontext jako JSON) → tytéž `auditor-guard` a `kapitan-audit-guard`. Auditor v sandboxu Codexu (zapisovat smí jen do workspace).
  Samostatnost Kapitána → sandbox/schvalování Codexu. Most: `bus-notify --once` (Codex nemá `stop_hook_active`), start `tools/codex-start.mjs`.
  Skripty pojistek a jejich otisky v chráněné složce `~/.codex/auditor/…` (mimo zápis agentů v sandboxu); Kapitán zapisuje jen do repa,
  `AUDIT/03_dukazy` a `AUDIT/bus`. Spouštěč ověří otisky i důvěru projektu (`tools/codex-hooks-check.mjs`) a jen pak obejde ruční schválení
  hooků; jinak agenta nespustí. Důvěra v `~/.codex/config.toml` se nastaví/opraví bez zdvojení klíče. Nečitelný cizí hooks.json se nepřepíše.
  Adaptér: cesty vždy normalizované („..", `\\?\`), odsazené hlavičky patche, patch přes shell, prázdný patch a pád pojistky = blok.
  Pojistky auditora i Kapitána nově normalizují „.." v cestách i v Claude Code. Aktualizace volbu zachová a pojistky obnoví.
- Počítač jen s Codexem (bez Claude Code): instalace nastaví oba agenty do Codexu.
- Telegram-setup role v Codexu přeskočí (kanál je jen v Claude Code).
- Pojistky pro Codex se kopírují vždy z balíku (ne z kopií ve workspace/repu, které mohou agenti upravit); hlídá se i projektový
  `.codex/config.toml` (sandbox, MCP servery); pomocné skripty spouštěče (wait-idle) z chráněné složky; auditor nesmí shellem měnit spouštěče
  a nastavení agentů; Windows aliasy cest (8.3, `\\.\`, tečky na konci) se převádějí na skutečnou cestu.
- Samotest 154.

## 1.6.0
- **Úsporný režim (výchozí)** — auditor sám nesmí plýtvat tokeny, které radí šetřit:
  - spouštěče nastaví `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` (oba agenti; modely s 1M oknem jinak kompaktují až u ~967 tis. a každý krok
    čte celý kontext znovu) a pro auditora `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`; nastavení auditora `autoCompactWindow: 200000`,
  - subagenti auditora `pruzkumnik` (haiku), `mechanik` (sonnet), `overovatel-lehky` (sonnet), `overovatel` (hlavní model, jen P0/P1),
  - pojistka `tools/usporny-guard.mjs`: obecný subagent bez levného modelu a celé velké soubory (> 60 kB, Read i cat) v hlavním vlákně = blok,
  - ústava §0b (hlavní vlákno jen řídí, čtení cíleně, stav v `_prubeh.md`, jeden klon, max 5 subagentů, měření každé vlny),
  - `tools/uklid-workspace.mjs` (kopie repa v `build/` kromě aktivního klonu, výstupy testů), `audit-stats`: **Ø kontext na krok**, podíl subagentů, modely,
  - rozjetý audit: nový cíl `C-160-USPORNY-REZIM` (změřit před, uklidit, pokračovat úsporně, změřit po),
  - `.rezim.json` → `"dukladny"` vypne omezení (jen vlastník).
- Instalace: `.claude/settings.local.json` (místní nastavení počítače) je v `.gitignore` projektu — dřív zůstával jako nesledovaný soubor,
  který by auditor sám nahlásil jako nepořádek; aktualizace ho už nehlásí jako „rozdělanou práci" uživatele.
- CI: e2e na Windows padal, protože kontrola čekala instalační commit jako poslední (na Windows po něm přijde commit aktualizace pojistek —
  chování instalátoru bylo správné). Kontrola hledá instalační commit podle zprávy; negace `! …` pod `set -e` nic nehlídaly → nahrazeny
  explicitními testy; nově hlídá, že žádný commit auditora neobsahuje soubory uživatele.
- Samotest 165.

## 1.7.0
- **Kontrola před každým startem** (`tools/preflight.mjs`, volají ji spouštěče auditora i Kapitána): agent nikdy nepoběží na staré verzi Claude Code.
  - `claude update` (nejvýš jednou za 30 min), pak najde **všechny** instalace (PATH, nativní, stažené verze, npm, starší lokální npm) a ověří jejich verzi;
    když výchozí `claude` z PATH není nejnovější, spouštěč pustí přímo tu nejnovější (typicky: aktualizace se stáhla do jiné instalace, než se spouští).
  - Víc instalací → upozornění s odkazem na návod; novější Claude Code v aplikaci Claude → upozornění; běžící okna zůstávají na své verzi → připomínka.
  - Role v Codexu: verze proti npm, instalace přes npm se sama aktualizuje.
  - Pevně zadané ID modelu → upozornění (alias se posouvá sám); novější vydání Auditoru na GitHubu → jedna věta, jak aktualizovat.
  - Nikdy neblokuje start (bez sítě jen upozorní); stav v `<workspace>/.preflight.json`. Auditor kontrolu ani otisky nesmí měnit (pojistka).
- **Výchozí model auditora = alias `best`** (nejlepší dostupný model — Fable, jinak Opus — posouvá se sám). Aktualizace převede dřívější výchozí
  `claude-fable-5-1` na `best`; jinak zvolený model nechá.
- **Aktualizace nepřepíše úpravy nástrojů auditora**: otisky nástrojů z instalace (`tools/.balik-otisky.json`) — co auditor upravil a balík ne, zůstane;
  co změnili oba (a pojistky vždy) → záloha do `AUDIT/_nastroje-zaloha/<čas>/`, nová verze a úkol „přenést úpravy" v `NOVE_CILE.md`.
  Ústava: úpravy pro projekt patří do `tools/mistni/`, kam aktualizace nesahá.
- **Měření jen z projektu**: `efficiency-audit` bral každý adresář transkriptů obsahující název repa → do spotřeby Kapitána započítal i workspace
  auditora (`<repo>-audit`) a sousední projekty. Teď přesná shoda cesty (+ worktree). Pluginy a hooky v **uživatelském rozsahu** (běží ve všech
  projektech, jejich logy míchají data projektů) jsou označené „USER"; checklist EFEKTIVITA: data ze sdíleného logu až po přiřazení session → projekt.
  Rozjetý audit dostane cíl `C-170-MERENI-PROJEKTU` (přepočítat čísla). Kontrola před startem upozorní na Telegram plugin zapnutý pro celý počítač.
- **Cesty s diakritikou, mezerami a závorkami na Windows** (např. `…\projekt-hlavní\`, `C:\Users\Jiří\`, `Program Files (x86)`): spouštěče se dřív
  zapisovaly v UTF-8, ale cmd je četl ve staré kódové stránce (852/437) → „hlavn├ş" → cesta neexistuje. Nově UTF-8 bez BOM + `chcp 65001`
  na 2. řádku, workspace přes `%~dp0`, text v echo/title escapovaný; totéž `deploy-with-gate.cmd` (vrací původní kódovou stránku) a `aktualizovat-repo.cmd`.
- **Nepovedené `cd` = agent se nespustí**: dřív spouštěč auditora při chybě pokračoval a pustil agenta v aktuální složce (intake nad cizí složkou).
  Teď chybová hláška a konec. CI na Windows spouští oba spouštěče skutečným cmd v cestě s diakritikou, mezerou a závorkami.
- **Aktualizace v cestě s diakritikou padala** („Error: , The operation completed successfully … unlink"): Node 22+/24 má `fs.cpSync` a `fs.rmSync`
  v C++ (std::filesystem), které na Windows nezvládnou ne-ASCII cesty. Nahrazeno vlastním `tools/fs-bezpecne.mjs` (copyTree/rmTree přes libuv) v aktualizaci,
  úklidu workspace a nastavení Codexu. CI na Windows teď spouští celou aktualizaci rozjetého auditu v cestě s diakritikou.
- **Jedno okno na projekt**: `start-projekt.cmd` otevře jedno okno Windows Terminalu se záložkami „Auditor · projekt" (zelená) a „Kapitán · projekt"
  (modrá), pevné názvy; bez Windows Terminalu dvě okna jako dřív; macOS/Linux přes tmux. Na ploše jeden zástupce „Auditor a Kapitan - projekt"
  (aktualizace ho přidá, staré dva nechá na uživateli); po instalaci se otevře rovnou.
- **Model podle dostupnosti, ne natvrdo**: kontrola před startem pro každou roli projde pořadí aliasů (auditor opus → best → sonnet, Kapitán
  sonnet → opus), krátkým neinteraktivním dotazem ověří, co je na účtu PRÁVĚ dostupné a na jakou verzi se alias přeloží, a spouštěč předá
  `--model`. Paměť 24 h na počítač (`~/.claude/auditor-modely.json`), po změně verze Claude Code znovu; bez sítě první alias bez ověření.
  Pořadí mění vlastník (`.rezim.json` → `"modely"`). Výchozí model v nastavení auditora `opus` (dřívější `claude-fable-5-1`/`best` se převede).
- Obsahuje vše z 1.6.0 (nevydáno samostatně). Samotest 184.

## 1.8.0
- **Katalog skillů, agentů, hooků a pravidel** (`auditor/katalog/`, `tools/katalog.mjs`, `START` → [9]): zkušenosti z provozu jiných projektů
  jako nabídka, **nic se neinstaluje samo**. Agent (Kapitán jednou po startu, auditor při auditu efektivity) spustí `katalog.mjs doporuc`:
  podle projektu (Python, TypeScript, web/API, tajemství, E2E, skripty) navrhne DOPORUČUJI / MOŽNÁ / NE i s cenou v tokenech a aktivuje jen potřebné.
  - Obsah: skilly `uzavrena-smycka` (formalizuj → oprav → nezávisle ověř → review → vydej) a `secret-management` (úložiště OS na Windows/macOS/Linux);
    8 read-only agentů (formalizace kontraktu, nezávislé ověření, code/security/Python/TypeScript review, E2E, manažer stavu); pravidla
    (13 řádků do CLAUDE.md/AGENTS.md + příručka čtená po sekcích); hooky kontrola syntaxe po zápisu (vč. PowerShell 5.1 bez BOM), jmenovitý
    commit s kontrolou syntaxe, ochrana sdíleného stromu (stash, reset --hard, kill podle jména), STATE.md po kompakci.
  - Claude Code i Codex (agent jako `.codex/agents/*.toml`, skill v `.agents/skills/`), Windows i macOS/Linux. Hooky aktivuje jen vlastník.
  - Holý projekt bez pravidel → nález efektivity P2 s doporučenou sadou (převzetí zkušeností). Deaktivace beze zbytků; ruční úpravy přežijí `obnov`.
  - Bez osobních údajů; 5 agentů převzatých z projektu pod MIT s uvedením autora (`katalog/LICENCE-TRETICH-STRAN.md`).
  - Běžící instalace: aktualizace katalog zkopíruje a u Kapitána nabídne průvodce; jinak ho Kapitán při dalším startu jednou posoudí sám.
- **Oprava časované chyby v samotestu**: testovací release gate měla pevné datum 24. 9. 2026 a gate platí 72 h → od 27. 9. by samotest po
  instalaci/aktualizaci selhal („auditora zatím nespouštěj"). Datum je teď vždy dnešní.
- **Pojistky podle zpětné vazby z ostrého provozu**:
  - Hook auditora bral workspace `…/projekt-audit` jako repo `…/projekt` (prefix) → blokoval `>`, `cp`, `mkdir` i ve vlastním AUDIT/. Teď hranice adresáře.
  - Zakázaná slova (vercel, publish, kill…) se hodnotí jen u **spouštěného příkazu** (i za `npx`, `sudo`, `xargs`, `bash -c`, `cmd /c`), ne v argumentech:
    `cat vercel.json`, `grep publish` projdou. Destruktivní SQL dál kdekoliv mimo čtecí příkazy; `Stop-Process` nově blokován.
  - Hook Kapitána volá gate-check nad **adresářem příkazu** (worktree má vlastní HEAD), gate-check snese hash v backticích (`commit \`abc1234\``).
  - `patch-deploy`: brána v Pythonu ZA docstring a `from __future__` (chybně vložená do docstringu se přesune); **nikdy** do skriptů, které jen ukládají
    tajemství (`ulož*/save*/secret*/key*…`, `keyring`, `cmdkey`, `vercel env add`…).
  - `unpatch-deploy` ve výchozím stavu **nic nemění**, jen vypíše nálezy; `--provest` upraví jen soubory bez rozdělané práce a hned je jmenovitě
    commitne (necommitnutý rozdíl by dvojklikem obešel bránu). Instalátor ho už automaticky nespouští, jen zapíše seznam do `AUDIT/instalace.log`.
- **Opravy nástrojů převzaté od auditorů v provozu** (dřív je musel každý obnovovat po aktualizaci): `hygiene-scan` přes `git grep` (bez OOM na desítkách
  tisíc souborů), `endpoint-probe` najde Vercel `api/*.js` a chybějící env/klíč hlásí jako `env_blocked` (ne chyba aplikace), `efficiency-audit`
  deduplikuje spotřebu podle ID zprávy (bez toho 2,3× víc) a přeskakuje `.venv/www`, `bus` ignoruje záznamy bez času, `audit-stats` bere poslední
  verdikt v souboru a všechny ledgery, Playwright specy `waitUntil: 'load'`, `uiBaseUrl` pro UI mimo API a nálezy per worker.
- **Dvě vrstvy — balík a projekt**: úpravy nástrojů pro projekt patří do `tools/local/`, pravidla projektu do `.claude/rules/*-projekt.md`;
  aktualizace do nich nikdy nesahá. Přepsaný upravený nástroj se zálohuje a úkol v `NOVE_CILE.md` uvádí rozsah úprav (+/− řádků).
- Samotest 207 (pojistky z provozu, worktree, katalog).

## 1.8.1
- **Hloubka tam, kde vlastník žije** (zkušenost z ostrého auditu: široký audit řízený pořadím checklistu se k denně používaným funkcím dostal až třetí den):
  - Intake povinně zjistí **top-3 funkce** (co vlastník používá denně a co ho štve) a kde běží produkce; top-3 dostanou plnou hloubku v 1. vlně,
    souběžně s bezpečností: kombinace parametrů proti nezávislému výpočtu (SQL/skript), odpověď > 1 s a 5xx = nález, perzistence, URL, mobil.
  - **Inventura z reality, ne z kódu**: nejdřív naslouchající porty, procesy, služby a plánované úlohy; stav funkce se uzavírá z běhu
    (proces, port, log, odpověď), nikdy z příznaku v kódu (`DISABLE_*`, chybějící knihovna).
  - Provoz: **logy automatizace za 30 dní** (restarty a selhání podle služby) dřív než zálohy. Nový checklist **AI/ML**: pokrytí číslem,
    výpadek a fallback, povinný test „první dotaz po 15 minutách klidu", kvalita proti známým odpovědím.
  - Těžké běhy s nízkou prioritou mimo disk produkce, s hlídáním odezvy produkce.
  - ZPRÁVA pro vlastníka: sekce „Co používáš nejvíc — jak to je" a „Co jsem NEtestoval do hloubky a proč" s otázkou „chceš to teď?".
    Retro po každé vlně (5 otázek) do `CHYBOVNIK.md` s pevným formátem. Rozjetý audit dostane cíl `C-181-HLOUBKA-VLASTNIKA`.
- **Cíl a plán před proudem požadavků** (auditor, Kapitán, katalog, nový projekt): požadavek v rozporu s dohodnutým cílem/plánem agent slepě
  neprovede — důrazně upozorní, co naruší, a doporučí teď / později / nedělat; rozhoduje vlastník. Co není na řadě, jde na `KANBAN.md`
  (v „Dělám" jedna věc). Kvalita je víc než kvantita.
- **Úsudek a tvrzení** (auditor §0c, Kapitán, katalog §11): fakt / předpoklad / odhad / hypotéza se nezaměňují, žádná vymyšlená čísla ani
  výsledky testů, riziko jako mechanismus, navržená ochrana není hotová ochrana, jedna hlavní cesta, kritérium experimentu předem,
  pouhý tlak není nový fakt, návrh ≠ provedeno ≠ ověřeno.
- **Hooky rozhodují podle cíle zápisu, ne podle slov v příkazu**: `grep … <repo> 2>/dev/null`, `2>&1`, `node tools/x-copy.mjs`, `cat` nastavení
  nebo handoffu už neblokují; zápis (`>`, `cp`, `mv`, `copy`, `tee`, `Set-Content`, `sed -i`, `mkdir`, `rm`, vložený kód) do repa, AUDIT/ nebo
  nastavení agentů ano — i po `cd` uvnitř příkazu. Každá blokace vypíše pravidlo i slovo. `build/` klon přes junction/symlink se bere jako build/.
  Samotest: 25 příkazů, které musí projít, 18, které musí být blokované (+ Kapitán 5/5).
- **Aktualizace nerozbije běžící audit**: soubor v `tools/`, `templates/` nebo `checklists/`, který změnil auditor i balík, zůstane v auditorově
  funkční verzi a nová leží vedle jako `<soubor>.new` + úkol „sluč ručně" v `NOVE_CILE.md`. Pojistky jsou výjimka (vždy verze balíku, záloha).
- Samotest 211.

## 1.8.2
- Tři provozní pravidla pro auditora, Kapitána, katalog i nový projekt (Kapitán má je v bloku role, kontroluje samotest):
  - **Mlčení není souhlas**: bez výslovné odpovědi vlastníka žádný nevratný krok, vydání ani změna plánu — vše připravit a čekat; vratné věci
    s označeným předpokladem. Předvybraná odpověď ve formuláři ZPRÁVY není souhlas, dokud ji vlastník neodešle; nepotvrzený handoff není přijetí.
  - **Kdy přestat**: dva neúspěšné pokusy stejným postupem = změnit metodu nebo eskalovat s tím, co bylo vyzkoušeno; třetí pokus stejně se nedělá.
  - **Cesta zpět**: před nevratným krokem jednou větou, jak se vrátí; nejde-li to, dry-run, záloha dotčených dat a výslovné „ano" vlastníka.
    Auditor kontroluje u Kapitána — nevratný krok bez cesty zpět = nález.

## 1.8.3
- **Kdo co dělá: vlastník rozhoduje, Kapitán dělá, auditor ověřuje.** Novou práci zadává vlastník Kapitánovi; auditor ji nevymýšlí ani nezadává
  (ověřoval by pak vlastní návrh). Auditor je pro „jak na tom jsme", „je to pravda", „smí se to vydat", „najdi příčinu" a druhý názor.
  - Když vlastník zadá práci auditorovi (terminál i Telegram), auditor ji nezačne: upozorní a nabídne doslovné předání Kapitánovi — jen na „ano".
  - **Tvrdé pojistky na mostu**: HANDOFF od auditora projde jen s ID nálezu (`AUDIT/01_nalezy/<ID>.md` nebo ID v `02_HANDOFF.md`); nový typ
    `ZADANI` předá úlohu vlastníka jen doslova (`--citace`, vlastní text auditora most odmítne, ID `K-###` přidělí sám); zprávy na most
    jen přes `bus.mjs` (zápis souboru nástrojem nebo shellem hook auditora blokuje). Auditor navíc dál nesmí psát do repa, commitovat ani vydávat.
  - Kapitán: úlohy vlastníka s ID `K-###` (`auditor-bus.mjs nove-id`); u rizikových (data, platby, přihlášení, mazání, migrace) pošle
    před prací akceptační kritéria auditorovi (QUESTION) a do 60 min čeká na doplnění; auditor kritéria doplní, nepíše je za něj.
- **Kapitán na silném modelu, kód na levnějším**: výchozí pořadí Kapitána `opus` → `sonnet` (dřív `sonnet` → `opus`) — podnět vlastníka musí
  rozvést do plánu s akceptačními kritérii a červeným testem, kód deleguje subagentovi `implementator` z katalogu (sonnet, jeden krok podle plánu,
  nic nepřeplánovává) nebo subagentovi s explicitním levným modelem; sám kontroluje diff a integruje. Vlastní pořadí v `.rezim.json` zůstává.
  Auditor kontroluje dodržování pravidel Kapitána; `efficiency-audit usage` měří nově **delegaci** (podíl editací a výstupních tokenů hlavního
  vlákna vs. subagentů, podle modelu) — podíl editací v hlavním vlákně > 0,3 = nález EFF.
- Samotest 217.

## 1.8.4
- **Samotest po aktualizaci rozjetého auditu už nehlásí falešné „NEPROŠEL"** (nalezeno v ostrém provozu na Windows):
  - Nástroj, který si auditor upravil a aktualizace ponechala jeho verzi (vedle `<nástroj>.new`), se v samotestu hlásí jako „SLOUČIT"
    s vysvětlením a úkolem v `NOVE_CILE.md` — neblokuje start; pojistky jsou vždy verze balíku, takže je to neovlivní.
  - Test „žádná logika podle názvu počítače" kontroluje ve workspace jen soubory balíku (vlastní nástroje auditora ne) a `URL.hostname`
    (adresa webu) už nepovažuje za název počítače.

## 1.8.5
- **Start dvou záložek naráz** (Auditor + Kapitán): aktualizaci Claude Code dělá jen první okno, druhé počká (dřív „Another instance is currently
  performing an update" a během výměny souboru druhé okno skončilo „'claude' is not recognized"). Spouštěč navíc chvíli počká, když příkaz
  `claude` zrovna chybí; když claude není v PATH (jen nativní instalace), dostane spouštěč plnou cestu.
- **Telegram: okénko na token** — když se na Windows neukáže (typicky druhé po sobě) nebo ho zavřeš, nástroj si token vyžádá skrytě
  v terminálu místo tichého přeskočení.
- **Jazyk vlastníka**: `tools/jazyk.mjs` (cs/en podle systému; přepis `.rezim.json` → `"jazyk"` nebo env `AUDITOR_LANG`); auditor i Kapitán
  mluví a píší výstupy jazykem vlastníka (dřív natvrdo česky). Rozhraní instalátoru a START v angličtině přijde v 1.9.0.
- Samotest 218.

## 1.8.6
Podle zpětné vazby z provozu (auditor projektu, 24.–27. 9.): co balík jen popisoval, teď vynucuje.
- **Delegace vynucená pojistkou**: Kapitán na silném modelu nesmí v hlavním okně Edit/Write zdrojového kódu (vstup hooku bez `agent_id`);
  subagent (implementator, model sonnet) smí. Dokumenty, STATE, KANBAN a nastavení smí dál. Vypnout jen vlastník (`.rezim.json` → `"delegace": "vypnuto"`);
  v Codexu se nevynucuje (nemá subagenty s agent_id). Auditor měří `delegace.podil_editaci_hlavni` po každé aktualizaci a denně.
- **patch-deploy už nerozbíjí skripty**: v PowerShellu vkládá bránu až za hlavičku (`#requires`, nápověda `<# #>`, `[CmdletBinding()]`, `param(…)`)
  — dřív ParserError a nespustitelný skript; chybně vloženou bránu před `param()` přesune. Vložený řádek je jen ASCII; cesta s diakritikou:
  v `.cmd` s dočasným `chcp 65001` (a návratem), v `.ps1` s UTF-8 BOM (skript v ANSI se nepatchuje, jen nahlásí).
- **Sdílená pravidla** (nový `tools/sdilena-pravidla.mjs`): pravidla ze společného nastavení (`~/.claude/CLAUDE.md`, `~/.claude/rules`) a CLAUDE.md
  v nadřazených složkách / kořeni disku se načítají do KAŽDÉHO projektu a míchala se mezi projekty. Kontrola před startem na ně upozorní,
  instalace i aktualizace se vlastníka u každého zeptá (přesunout do projektu / nechat); agent je sám nepřesune. Měření kontextu je hlásí jako SDÍLENÉ.
- **Upravené nástroje čekající na sloučení (`.new`)** vypisuje kontrola před startem auditora a ústava je řadí jako první úkol — dřív zapadly
  a auditor měřil starou verzí (bez delegace a deduplikace).
- Katalog: příručka provozu se instaluje do `.claude/prirucka/` (dřív `.claude/pravidla/` — vedle `.claude/rules` to mátlo; aktualizace přesune).
- Checklist PROVOZ: plánovaná úloha doložená výstupem, ne jen „Last Result 0" (obal skriptu musí předat návratový kód).
- Samotest 224.

## 1.8.7
- **Pojistky jednoho projektu už neblokují jiné projekty** (nalezeno v provozu: pojistky projektu A běžely v projektu B a pomocník Kapitána je začal obcházet).
  Příčina: pojistky (hooky) ve společném nastavení počítače `~/.claude/settings.json` a pluginy zapnuté pro celý počítač s vlastními hooky.
  - `tools/sdilena-pravidla.mjs` je najde (u pojistky i projekt, kterému patří — podle cesty ke skriptu); kontrola před startem na ně upozorní.
  - Instalace i aktualizace se vlastníka u každé zeptá: pojistku přesunout do projektu, kterému patří; plugin vypnout pro celý počítač
    (a případně zapnout jen pro tento projekt); nebo nechat. Před změnou záloha `settings.json.zaloha-<čas>` (cesta zpět). Agent bez terminálu nic nemění.
- Kapitán: pojistku nikdy neobchází (jiný nástroj, shell, pomocník) — zastaví se a řekne vlastníkovi; auditor obcházení hlásí jako nález P1.
- Samotest 225.

## 1.8.8
Úspora tokenů v základním nastavení (podnět: rozbor „proč dochází limit" a skill session-handoff; zkušenost z provozu: Kapitán na Opusu pustil 9 pomocníků najednou).
- **Pomocníci Kapitána bez určeného modelu běží na sonnetu** (`CLAUDE_CODE_SUBAGENT_MODEL=sonnet` ve spouštěči, dosud jen u auditora). Je to jen záloha:
  `model:` v definici agenta i v konkrétním volání má přednost (dokumentace Claude Code). Kdo chce pro svého agenta hlavní model, dá mu `model: inherit`.
- **Strop souběžných pomocníků** (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`): auditor 5, Kapitán 3; mění vlastník v `.rezim.json` → `"soubeh": {"kapitan": 4}`.
  Starší Claude Code proměnnou ignoruje (bez škody). Režim „dukladny" nemění nic.
- **Stav práce po kompakci i po `/clear` se vloží sám** (`tools/stav-session.mjs`): Kapitán `.claude/STATE.md`, auditor `AUDIT/_prubeh.md`, v Codexu přes codex-start.
  Role Kapitána a zprávy z mostu se nově vkládají i po `/clear`.
- **Skill `predani`** (Kapitán i auditor): po uzavřené úloze / vlně zapíše předání (cíl, hotovo, rozdělané, co běží, jak ověřit, otevřené, pokračuj tady)
  do stavového souboru a vlastník jen napíše `/clear` — nic nekopíruje. Vlastní text inspirovaný skillem session-handoff (Nate Herk).
- Role Kapitána: krátké odpovědi vlastníkovi (výstup je nejdražší), max. N pomocníků najednou, velké soubory a PDF ne celé, stav v STATE.md, nové téma = čistý stůl.
- Auditor: PDF nad 5 stran celé v hlavním vlákně blokuje pojistka (převést na text / číst po stranách); ústava §0b doplněna.
- Konektory (MCP) zapnuté pro celý počítač (`~/.claude.json` → `mcpServers`) hlásí kontrola při startu (1× denně) a START → [2] s postupem;
  automaticky je nepřesouvá (soubor průběžně přepisují běžící okna).
- Katalog: `stav-kompakce` se už nedoporučuje (je součástí výchozího nastavení).
- NÁVOD: sekce ŠETŘENÍ TOKENŮ (co může udělat vlastník).

Opravy z vlastního auditu balíku (nálezy A-001 až A-023, ověřeno auditorem přes bus a šest bran):
- **Zálohovaná práce** (A-001): dosavadní necommitnutý stav balíku (verze 1.4.x–1.8.8) dostal se do gitu jako výchozí bod pro opravy —
  práce jen na jednom disku (nezálohovaná) byl sám první nález.
- **Pojistky Kapitána a auditora těsnější** (A-004, A-005, A-006, A-022): detekce git mutací a odeslání (push/deploy) podle skutečně
  spouštěného podpříkazu, ne podle textu v uvozovkách — i přes `timeout`/`stdbuf`/`builtin`/`eval`, `$(which git)`, `ionice`, `watch`,
  `find -exec`, `-c alias.X=`, `--git-dir`/`GIT_DIR=`. Zápis přesměrováním (`>`, `>>`, `tee`, `dd of=`, i slepené bez mezery nebo v
  uvozovkách) mimo povolený workspace je fail-closed, včetně `node -e`/`python -c` a Edit/Write přes junction/symlink ven. Allowlist
  auditora pro `git`/`gh` povoluje jen čtecí podpříkazy a kontroluje i jejich argumenty (fetch refspec, cíl clone/worktree, `-c
  pager/editor`); allowlist Kapitána navíc hlídá refspec u push, sloučení PR do produkce přes `gh` vyžaduje gate, `bash -lc`, klíčová
  slova shellu a globální volby gitu v libovolném pořadí.
- **Pre-push pojistka opravena** (A-023): čte tlačené refy ze stdin (dřív šlo obejít přes prostředí), detekce odeslání podle prvního
  slova příkazového segmentu, instalace hooku přes sdílenou funkci `installGitHook` — spolehlivá u prvoinstalace i aktualizace.
- **Bezpečné zámky mostu** (A-010): `ack` v `bus.mjs` pod zámkem s atomickým zápisem (ověřeno 50 souběžných zápisů bez ztráty), bezpečný
  stale lock, retry na Windows `EPERM`, čtenáři nikdy nevidí polovičatě zapsaný JSON.
- **Aktualizace instalace úplná, cizí hooky se nepřepisují** (A-007, A-008): vlastní hook se pozná jen podle jednoznačného markeru
  (dřív podle podřetězce, který mohl mít i cizí hook — ten se přepsal beze zálohy); cizí `pre-commit` hook se při instalaci zálohuje do
  `.bak-<čas>` a nahlásí. Přerušená instalace (chybějící závislosti, git hooky chybějící navzdory potvrzené hygieně) se sama doplní,
  nebo skončí zřetelným varováním — nikdy tiše „OK".
- **Katalog: frontmatter s CRLF** (A-021): klon s `autocrlf=true` už nerozbije `name` v TOML (normalizace CRLF→LF); `.gitattributes`
  vynucuje LF pro `auditor/katalog/**`.
- **Dokumentace odpovídá realitě** (A-003): tvrzení o GitHub Release v README doloženo odkazem na `release.yml`; zastaralé pevné počty
  scénářů v CONTRIBUTING.md, README.md a NAVOD.txt nahrazeny popisem bez pevného čísla (mění se s každým PR).
- **Kolo 3 (A-008 P1, poslední kolo):** stará instalace bez markeru + vlastní `.gitattributes` vlastníka už nedostane naše git hooky proti
  jeho volbě (`update-install.mjs` bez markeru bere za „náš" jen pre-commit s markerem, ne pouhou existenci `.gitattributes`); samotest
  přesměrovává `HOME`/`USERPROFILE` na dočasnou složku ve všech scénářích, které spouštějí instalátor/`trust-folders.mjs`, a nová pojistka
  (hash skutečného `~/.claude.json` před/po celém samotestu) hlásí FAIL, pokud by se přece jen zapsalo mimo sandbox; starý marker
  `hotovo:true` z přerušené instalace se maže hned na začátku `setup-auditor.ps1`/`.sh`, ne až na konci.
- Samotest 721.
