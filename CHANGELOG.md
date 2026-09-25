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

