# AUDITOR v2 — samostatný auditní agent pro Claude Code

Balík definuje agenta **Auditor**, který audituje aplikaci (kód, bezpečnost, UI přes Playwright,
každou funkci), **nic nekóduje, nic nevydává**, navrhuje řešení a vynucuje, aby je **Kapitán**
(agent projektu) zapracoval a doložil důkazem.

## Verdikt: odděleně, ne uvnitř projektu

Auditor žije ve **vlastním adresáři a vlastní session**, repo aplikace vidí jen ke čtení.

| Kritérium | Uvnitř projektu (subagent Kapitána) | Odděleně (vlastní workspace) |
|---|---|---|
| Nezávislost verdiktu | Kapitán ho spouští, čte jeho výstup, může ho „přesvědčit" nebo přeskočit | Kapitán ho nemůže obejít — verdikt vzniká mimo jeho vlákno |
| Dědění CLAUDE.md | Subagent automaticky dědí CLAUDE.md projektu vč. deploy sekvencí a pravidel autora | Vlastní CLAUDE.md = vlastní pravidla; projektový CLAUDE.md čte jen jako *podklad* |
| Vynutitelnost „nic neměnit" | `disallowedTools` v subagentu je jen parent-only guard (viz repro issue u Claude Code) — subagenti subagenta ho nedědí | `permissions.deny` + PreToolUse hook v settings auditora platí pro celou session i její subagenty |
| Kontext | Sdílí kontext s vývojem → „autor si schvaluje vlastní práci" | Čistý kontext, jen zadání + důkazy |
| Cena | Nulové nastavení | Jednorázově: workspace, `--add-dir`, hook |

Rozhodující důvod: **bránu nesmí držet ten, koho brána hlídá.** Stejný princip má už skill
`uzavrena-smycka` (FIX ≠ VERIFY ≠ REVIEW). Varianta „subagent v projektu" je v balíku taky
(`.claude/agents/auditor.md`) — pro rychlé dílčí kontroly, ne pro hlavní audit.

Zdroje: code.claude.com/docs/en/permissions (deny > allow, `Edit(//abs/**)`, `--add-dir`),
code.claude.com/docs/en/hooks-guide (PreToolUse exit 2 blokuje i v bypass módu),
dev.to/terminalblog (disallowedTools nedědí subagenti).

## Struktura

```
auditor/
├── CLAUDE.md                     ← ústava auditora (role, zákazy, fáze, standardy)
├── .claude/settings.json         ← deny pravidla + registrace hooku
├── .claude/hooks/auditor-guard.js← tvrdá brána: zápis jen do workspace, žádný push/deploy
├── .claude/agents/auditor.md     ← varianta B: subagent uvnitř projektu (jen dílčí kontroly)
├── checklists/
│   ├── BEZPECNOST.md             ← ASVS 5.0 L2 výběr, OWASP Top10:2025, API Top10, LLM Top10 (AI funkce CRM)
│   ├── UI_FUNKCE.md              ← funkční inventář, překryvy/vrstvy/dropdowny/menu, a11y, konzistence
│   ├── ARCHITEKTURA_SSOT.md      ← jediný zdroj pravdy, duplicity, umístění a seskupení funkcí
│   ├── EFEKTIVITA.md             ← first-pass yield, audit tokenů, model routing, dělení bloků, měření před/po
│   ├── UDRZITELNOST_SKALOVANI.md ← fit technologie (DB, hosting, cloud služby, stack, náklady) vůči záměru: dnes / cíl / 10×
│   ├── GIT_PRAXE.md              ← frekvence commitů/pushů/merge, nezálohovaná práce, velikost commitů, ochrany
│   ├── HYGIENA_REPA.md           ← pořádek ve složkách, git bez binárek, hloubkový obsahový průchod dokumentů, řád + vynucení
│   ├── PROVOZ_ZALOHY.md          ← obnovitelnost záloh, readiness, alerty, runbook, licence, dokumentace vs. realita
│   ├── KATALOG_NALEZU.md         ← vlastníkův katalog opakujících se nálezů (z reálných projektů autora) — povinný checklist + šest bran
│   └── ZDROJE.md                 ← registr standardů/rulesetů a jak je použít strojově
├── templates/                    ← intake dotazník, nález, handoff Kapitánovi, verdikt ověření (šest bran), release gate
├── tools/
│   ├── playwright/ui-sanity.spec.ts   ← překryvy, elementFromPoint vrstvy, ořez, h-scroll, ikony, dropdown logika, menu konzistence
│   ├── playwright/ui-crawl.spec.ts    ← VYČERPÁVAJÍCÍ průchod: každá stránka, každý prvek, ledger pokrytí (100 % nebo důvod)
│   ├── playwright/a11y.spec.ts        ← axe-core WCAG 2.2 AA + klávesnice
│   ├── endpoint-probe.mjs             ← anon / cross-tenant / BFLA / malformed / headers (jen localhost)
│   ├── ssot-scan.mjs                  ← kandidáti na více zdrojů pravdy a sémantické duplicity
│   ├── efficiency-audit.mjs           ← context | usage | churn | modules (baseline a měření po)
│   ├── triage.mjs                     ← read-only posouzení projektů (--scan disky/Dokumenty/Stažené, --html report, --json)
│   ├── gen-config.mjs                 ← audit.config.json z Next.js routeru / HTML (chrání ručně upravený config)
│   ├── build-env.mjs                  ← vlastní testovací instance z klonu (up/down/status), .env.audit od vlastníka
│   ├── run.mjs                        ← wrapper npm scriptů (repo z env)
│   ├── git-practice.mjs               ← commit/push/merge metriky, ahead of remote, dirty age, větve, hooks/CI
│   ├── hygiene-scan.mjs               ← root junk, binárky/tajemství v gitu, skládky, neodkazované dokumenty, větve
│   └── static-checks.sh               ← tsc, eslint, pnpm audit, semgrep, gitleaks, jscpd, madge, knip, grep pravidla
├── tools/bus.mjs                 ← komunikační most (viz BRIDGE.md)
├── BRIDGE.md                     ← protokol mostu
├── NOVY-PROJEKT.cmd + tools/new-project.mjs ← nový projekt zdravě od začátku (bez samostatného auditora)
├── starter/                      ← šablona nového projektu: CLAUDE.md, subagent kontrolor, příkazy, hooky projekt-guard/release-check/session-start, CI, docs
├── INSTALL-MULTI.cmd / install-multi.sh ← průzkum disků → HTML report → profily → instalace více projektů
├── INSTALL.cmd / install.sh      ← instalace na jedno kliknutí (jeden projekt)
├── setup-auditor.ps1 / .sh       ← průvodce nastavením (parametry -Repo -Workspace -Remote -Model -Yes / env AUDITOR_*)
├── post-install.ps1              ← config z routeru, .env.audit šablona, deploy wrapper, commit, GitHub přes gh (repo, deploy klíč, secrets, ochrana větve)
├── AUDIT/CHYBOVNIK.md            ← retro auditora (co přehlédl → jaký test to chytí) + metriky
└── kapitan-side/
    ├── AUDIT_REZIM.md            ← skill do repa: stop-the-line, zálohy, důkazy, most, worktree, trvalé povinnosti efektivity
    ├── kapitan-audit-guard.js    ← hook Kapitána: zápis jen 03_dukazy + bus from=kapitan; deploy jen po gate-check
    ├── gate-check.mjs            ← technická bariéra vydání: 🟢 gate pro aktuální HEAD, čistý strom, max stáří
    ├── hygiene/                  ← pre-commit-guard.sh (binárky/junk/root/tajemství), gitattributes.template, gitignore.addendum
    ├── TASK-PROTOCOL-001_original.md
    └── TASK-PROTOCOL-002_navrh.md ← posouzení + 7 změn (tichý default, deterministické hooky, event log, napojení na auditora)
```

## Více projektů: průzkum → posouzení → instalace (doporučeno pro celý disk)
**Windows:** poklepej na `INSTALL-MULTI.cmd` (bez parametru prohledá všechny lokální disky + Dokumenty + Stažené soubory + Plochu; nebo
`INSTALL-MULTI.cmd C:\dev`). `tools/triage.mjs` každé git repo read-only posoudí (stack, velikost, poslední změna, změny za 90 dní, signály
uživatelé/tenanti/platby/osobní data/deploy, existující Claude/auditor instalace, cizí/nástrojová repa) a doporučí profil:
**PLNÝ** (Kapitán + hygiena + CI + opus) · **LEHKÝ** (bez CI, sonnet) · **JEN AUDIT** (jen workspace, repo se nedotkne) · **PŘESKOČIT**.
Vygeneruje **HTML report** na Plochu (název, cesta, stack, poslední změna + commit, změn/90 d, velikost, signály, remote, doporučení s důvody;
řaditelný, filtrovatelný) a otevře ho. V terminálu ukáže **očíslovaný seznam** (název, poslední změna, doporučení, umístění) — napíšeš čísla
projektů k auditu (`1 3 5` nebo `vse`), u každého Enter = doporučený profil (nebo jiný), a instaluje jen vybrané, každý s vlastním
workspace, busem, gate a portem (3100, 3101, …). **WSL/Linux/mac:** `bash install-multi.sh [cesty]`.

## Instalace na jedno kliknutí (jeden projekt)
**Windows:** rozbal zip, poklepej na `INSTALL.cmd` (nebo `INSTALL.cmd C:\dev\<repo>`). Zeptá se jen na cestu k repu; workspace vytvoří
vedle něj jako `<repo>-audit`, vše ostatní nastaví s výchozími hodnotami (model opus, strana Kapitána, hygiena, CI) a pak spustí `post-install.ps1`:
vygeneruje `tools/audit.config.json` z routeru, založí šablonu `.env.audit`, vytvoří `deploy-with-gate.cmd`, commitne instalaci do repa,
a je-li přihlášené `gh` CLI, založí soukromé audit repo + push, deploy klíč, secrets `AUDIT_REPO`/`AUDIT_SSH_KEY`, chráněnou větev
se status checkem `auditor-gate`, pushne repo a spustí selftest. Na konci vypíše, co zbývá na tobě (typicky jen `.env.audit` a přihlášení
testovacích účtů). **WSL/Linux/mac:** `bash install.sh /cesta/k/repu`.
Předpoklady: Node 20+, Git, Claude Code; volitelně `gh` (`winget install GitHub.cli` + `gh auth login`), gitleaks, semgrep.

## Instalace — průvodce (interaktivní)
Windows: `powershell -ExecutionPolicy Bypass -File .\setup-auditor.ps1` · Linux/WSL/mac: `bash setup-auditor.sh`
Průvodce se zeptá na cestu repa a workspace, vytvoří workspace + git, zapíše `settings.json` s tvými cestami (env + deny),
nainstaluje Playwright/axe, se souhlasem nainstaluje stranu Kapitána do repa (skill `audit-rezim`, hook `kapitan-audit-guard.js`,
`--add-dir`, pointer do CLAUDE.md), otestuje brány a vytvoří `start-auditor.cmd|sh` a `start-kapitan.cmd|sh`.
Ručně po něm: `tools/audit.config.json` (obrazovky, selektory, test. účty A/B) a **gate-check jako 1. krok deploy sekvence/.bat**.

## Brána vydání mimo agenta (CI + chráněná větev)
`kapitan-side/ci/auditor-gate.yml` (průvodce ho nainstaluje se souhlasem) spouští `gate-check` na GitHubu při push/PR do main.
Nastav **Branch protection** pro `main`: required status check `auditor-gate`, zákaz force push, žádné obcházení; Secrets `AUDIT_REPO` a
`AUDIT_REPO_TOKEN` (read-only PAT na repo workspace auditora). Tím je bariéra technická i pro ruční push z jiného klienta.
Omezení: PR z forku secrets nedostane (job se přeskočí, gate vynutí až push do main); CI používá VÝHRADNĚ gate-check z audit repa
(kopie v `<repo>/.claude/hooks/` je jen záloha pro lokální hook a agent ji nesmí editovat — SELF-PROTECT v hooku);
`.audit-ws/` je vyloučen z `git status`, jinak by gate hlásil špinavý strom. Stáří gate: 72 h (hook i CI, `GATE_MAX_AGE_H`).
Gate platí pro merge --no-ff i squash auditovaného commitu, pokud je **hash stromu** shodný (obsah, názvy, mode bity).

## Jak je session auditora nastavená (co průvodce zapíše do `.claude/settings.json` workspace)
- **model**: `claude-fable-5-1` (PLNÝ — hlavní vlákno = úsudek a verdikty, tam se nejlepší model vyplatí) / `opus` (LEHKÝ) / `sonnet` (JEN AUDIT) — přepneš `/model`;
  subagenti auditora dostávají levnější model v promptu (mechanika haiku/sonnet). Není-li Fable na účtu dostupný, Claude Code to řekne při startu → `/model opus`.
- **permissions**: `defaultMode: auto` (deny + hook mají přednost); `allow` pro `node`, `npx playwright/tsc/jscpd/madge/knip`, `pnpm/npm`, `git`, `curl`, `semgrep`, `gitleaks`,
  WebFetch na dokumentační domény a WebSearch → dlouhý audit nečeká na potvrzení; `deny` (edit repa, `.env`, `vercel`, `publish`) má vždy přednost
  a **PreToolUse hook** (`auditor-guard.js`, fail-closed) blokuje mutace: zápis mimo `AUDIT/ tools/ build/`, git mimo workspace, deploy, kill, mutační HTTP mimo localhost.
- **env**: `AUDITOR_WORKSPACE`, `AUDITOR_TARGET_REPO` (čtou je hooky i nástroje).
- **autoCompactEnabled: true**; po kompakci se znovu načte CLAUDE.md (~4,5 k tokenů) a `SessionStart(compact)` hook vypíše nepřečtené zprávy z busu
  + připomínku načíst `AUDIT/00_intake.md` a `02_HANDOFF.md`; stav auditu drž v TaskList a v souborech `AUDIT/`, ne v hlavě.
- **Kontext**: auto-load = jen CLAUDE.md + settings; checklisty, katalog a šablony se čtou na vyžádání; žádné MCP servery (Playwright běží jako CLI,
  ne MCP — tokenová dieta). Repo je přidané přes `--add-dir` (čtení).
- **Skilly**: auditor žádné projektové skilly nepotřebuje — jeho „skilly" jsou checklisty; Kapitán dostane skill `audit-rezim`.
  Uživatelské skilly z `~/.claude/skills` (např. `uzavrena-smycka`) vidí obě strany; subagenti je nedědí (to je záměr).
- Spuštění: `start-auditor.cmd` = `claude --add-dir <repo>` z workspace; první zpráva „Začni intake".

## Ověření po instalaci (vždy, i po každé změně hooků)
`node tools/selftest.mjs` — 94 scénářů bran (auditor, Kapitán, pre-commit, bus, gate-check, nový projekt: projekt-guard, kontrolor, release-check) musí být 100 % PASS.
Na Windows navíc jednou spusť `claude --verbose` a ověř, že shellové příkazy chodí jako `Bash` (Git Bash) — hooky mají větev i pro
`PowerShell`, ale rozhodující je skutečný `tool_name`.

## Testovací prostředí auditora
`AUDIT/.auth/.env.audit` (šablona `templates/env.audit.example`) — oddělená DB (Supabase branch nebo lokální Postgres) a testovací účty;
`build-env.mjs` bez něj instanci nespustí. Cena Supabase branchingu závisí na plánu — ověř v den nastavení.

## Most Auditor ↔ Kapitán
`BRIDGE.md` — zprávy jako soubory v `AUDIT/bus/` (`tools/bus.mjs post|inbox|ack|status|metrics|wait|sync`), vlastnictví vynucené hooky
obou stran, stavový řetězec položky, kola K1/K2…, `false_done_rate`. Přes více strojů = git remote workspace auditora.

## Instalace ručně (Windows / PowerShell, Claude Code)

1. Vytvoř workspace vedle repa: `C:\dev\<projekt>-audit\` a nakopíruj obsah `auditor/`.
2. V `.claude/settings.json` doplň `[DOPLŇ]` (deny pravidla a `env` — hooky čtou cesty z `env`):
   absolutní cestu repa (tvar `//c/dev/<projekt>/**`) a workspace auditora. Průvodce to dělá sám.
3. Spusť auditora z jeho workspace s repem přidaným ke čtení:
   ```
   cd C:\dev\<projekt>-audit
   claude --add-dir C:\dev\<projekt>
   ```
   `--add-dir` zpřístupní čtení; **zápis do repa blokuje deny rule `Edit(//c/dev/<projekt>/**)`**
   a hook blokuje `git push`, `vercel`, `pnpm publish`, `rm -rf` atd.
4. Ověř bránu: požádej auditora „vytvoř soubor test.txt v repu" → musí být Blocked.
5. Do CLAUDE.md projektu (Kapitán) vlož blok z `kapitan-side/AUDIT_REZIM.md` a přidej
   `--add-dir C:\dev\<projekt>-audit` při spouštění Kapitána, aby četl handoff a psal důkazy
   do `AUDIT/`.
6. `cd tools && npm install && npx playwright install chromium` (ve workspace auditora, ne v repu);
   `cp tools/audit.config.example.json tools/audit.config.json` a doplň obrazovky, selektory, test. účty.
7. Hook čte cesty z env `AUDITOR_WORKSPACE` a `AUDITOR_TARGET_REPO` (nebo je doplň přímo do skriptu).

## Spouštění nástrojů (z workspace auditora)
Vlastní instance: `node tools/build-env.mjs up --ref <commit> --port 3100` (vyžaduje `AUDIT/.auth/.env.audit` s TESTOVACÍ DB od vlastníka), `down` po auditu.
Zkratky (repo z env `AUDITOR_TARGET_REPO`, nastaví setup): `cd tools && npm run eff|ssot|hyg|git|probe|static|ui|crawl|a11y|env:up|env:down`.
```
bash tools/static-checks.sh C:/dev/<repo>           # statika → AUDIT/01_nalezy/static/SUMMARY.txt
node tools/ssot-scan.mjs C:/dev/<repo>              # SSOT kandidáti
node tools/efficiency-audit.mjs all C:/dev/<repo>   # baseline efektivity (kontext, usage, churn, moduly)
node tools/endpoint-probe.mjs tools/audit.config.json C:/dev/<repo>
npx playwright test -c tools/playwright.config.ts   # ui-sanity + a11y + crawl (crawl: CRAWL_MAX_PAGES=100)
```
Pořadí auditu, fáze a pravidla: `CLAUDE.md`. Auditor sám nic z toho nespouští proti produkci.

## Kanál Auditor ↔ Kapitán

Jediný sdílený prostor je adresář **`<workspace-auditora>/AUDIT/`**:

```
AUDIT/
├── 00_intake.md            auditor: odpovědi z dotazníku + kontext aplikace
├── 01_nalezy/A-###.md      auditor: nálezy (šablona templates/nalez.md)
├── 02_HANDOFF.md           auditor → Kapitán: prioritizovaný balík + návrhy řešení
├── 03_dukazy/A-###/        Kapitán → auditor: commit hash, screenshot, výstup testu, záloha
├── 04_verdikty/A-###.md    auditor: PASS/FAIL nezávislého ověření (šest bran)
├── 05_release_gate.md      auditor: finální verdikt před vydáním (Kapitán bez něj nevydává)
├── 06_efektivita.md        auditor: baseline → po zapracování → rozdíl (tokeny/issue, FPY)
├── 07_udrzitelnost.md      auditor: záměr × technologie (DB, hosting, služby, TCO, exit cesty) — rozhodnutí vlastníka
└── CHYBOVNIK.md            auditor: retro
```

Auditor nikdy nezapisuje mimo `AUDIT/` a `tools/`; Kapitán zapisuje jen do `03_dukazy/`.

## Změny v1.3.0
- Rozcestník `START.cmd`/`start.sh`: [1] nový projekt · [2] audit projektu na disku · [3] audit GitHub repa.
- **Nový projekt zdravě od začátku**: `NOVY-PROJEKT.cmd` → `tools/new-project.mjs` → šablona `starter/` (CLAUDE.md, subagent `kontrolor`,
  příkazy `/zacatek /zadani /hotovo /kontrola /vydani /uklid`, hooky `projekt-guard.js`, `release-check.mjs`, `session-start.mjs`,
  `hygiene-all.mjs` + sdílená hygiena z `kapitan-side/hygiene/`, checklisty auditora do `.claude/kontrola/checklists/`, CI, dokumenty).
  Nezávislost kontrolora vynucuje hook podle `agent_type`/`agent_id` z hook vstupu Claude Code. Ústava §3f: jak auditovat takový projekt.
- **Kombinace** (výchozí při zakládání): vedle nového projektu i samostatný auditor bez strany Kapitána (`AUDIT/.zdravy-start.json`),
  periodický; jeho 🔴 gate blokuje `release-check` projektu, handoff čte agent projektu při startu (ústava §3f). Workspace dostává i `starter/`.
- Samotest 94 scénářů.

## Změny v1.2.0
- Audit z GitHubu (`audit-github.ps1|sh`, `AUDIT-GITHUB.cmd`, `tools/remote-clone.mjs`, ústava §3e) a statistika auditu (`tools/audit-stats.mjs`, §3d).

## Změny v1.1.3
- **Zpráva pro vlastníka** `AUDIT/ZPRAVA.html`: netechnická, max. 2 obrazovky, semafor, „co to znamená pro tebe", „co potřebuju od tebe"; auditor ji píše
  podle `templates/zprava_pro_vlastnika.md` a aktualizuje po prvním dojmu, handoffu a každém verdiktu (`tools/owner-report.mjs`, bez závislostí, tisknutelná).

## Změny v1.1.0
- **Aktualizace zachovává audit**: `AUDIT/` (nálezy, verdikty, handoff, bus, retro CHYBOVNÍK, průběh) se při opakované instalaci NIKDY nepřepisuje —
  dřív se šablonový `CHYBOVNIK.md` kopíroval přes retro auditora. Aktualizuje se jen balík (ústava, checklisty, nástroje, šablony, hooky, settings).
- Pravidlo „test se zadáním" pro nová zadání Kapitána (audit-rezim §4b) + nález „funkce bez akceptačního testu" + sekce TST v handoffu.
- `AUDIT/00_prvni_dojem.md`: první lidská stránka pro vlastníka po 1. vlně (tokeny, nepořádek, zálohy, naléhavost) — do ~1 h, ne po celém auditu.
- Přerámování „pro koho": primárně záchrana rozjetého projektu; sekce Auditor vs. CI.

## Změny v1.0.2
- Ústava §3: výchozí je maximální paralelizace — nezávislé oblasti jako subagenty v jedné zprávě (první vlna 6), UI crawl a sondy v dávkách
  souběžně (6–10), strop ~10, průběh v `AUDIT/_prubeh.md`; model routing subagentů (sonnet/haiku mechanika, verdikty = hlavní model).

## Změny v1.0.0 (veřejná verze)
- Odosobněno pro komunitu: „Pavel“ → vlastník, role busu `pavel` → `owner`, protokoly `TASK-PROTOCOL-*`, žádné reálné cesty.
- macOS: bash skripty kompatibilní s bash 3.2, `tools/post-install.sh` (úklid, důvěra složkám, zástupci `.command`/`.desktop`, samotest,
  otevření Terminálu), spouštěče s úvodní zprávou a záložní instrukcí.
- Auditor běží v `auto mode` (deny + hook mají přednost). Kořen repa: README (EN+CZ), LICENSE (MIT), CONTRIBUTING, šablony issue, CHANGELOG.

## Změny v3.9.6
- Spouštěče vypisují nad řádek `>` záložní instrukci (co napsat, kdyby se úvodní zpráva neposlala); `start-kapitan.cmd` posílá Kapitánovi
  úvodní zprávu (načti bus inbox + handoff, řiď se audit režimem, pak běžná práce).

## Změny v3.9.5
- Instalátor bez rozhodovacích otázek: git init automaticky, síťové disky se přeskočí (věta), profil = doporučení, instalace po výběru
  projektů rovnou, auditor + Kapitán se otevřou vždy. Technické poznámky (gitleaks/semgrep, deploy skripty, PROD_BRANCHES) → `AUDIT/instalace.log`.
  Zůstává jen: cesta k projektu nebo výběr projektů.

## Změny v3.9.4 (kritická oprava)
- **Kapitán běžel bez pojistek**: PowerShell 5.1 při zápisu `<repo>/.claude/settings.json` rozbalil jednoprvková pole (`additionalDirectories`,
  `hooks.PreToolUse`) na skalár, Claude Code hlásil „Settings Error … Expected array" a celý soubor přeskočil. Obě nastavení (auditor i Kapitán) teď
  zapisuje Node (`tools/write-auditor-settings.mjs`, `tools/merge-repo-settings.mjs`): deterministický JSON, idempotentní, cizí hooky zachová,
  rozbalená pole z dřívějších verzí opraví. Bash varianta už nepotřebuje `jq`.

## Změny v3.9.3
- Vlastní stavový řádek auditora (`tools/statusline.mjs`: AUDITOR · projekt · model · nálezy · gate) přebije globální statusline uživatele,
  který každou session značí KAPITÁN; okno auditora je tak k rozeznání na první pohled.
- `wait-idle`: Enter = spustit hned (aktivita v projektu může být automatika — fleet worker, noční úloha —, na tu čekat nemá smysl).

## Změny v3.9.2 (oprava chyby v3.8.1–3.9.1)
- **Chyba**: `patch-deploy` hledal deploy skripty podle OBSAHU a vložil gate-check do 72 souborů včetně `.venv/Scripts/activate.bat`, hook skriptů
  Kapitána a utilit (commit zachytil pre-commit guard, na disku ale zůstaly změněné). **Oprava**: `tools/unpatch-deploy.mjs` odstraní vložené řádky
  přesně podle značky (instalátor ho spouští automaticky jako první); `patch-deploy` vybírá jen podle NÁZVU (deploy*/release*/publish*/build_ota*) v rootu
  nebo `scripts/`, nikdy archive/.venv/hooks/test_*, a upravuje jen po výslovném souhlasu `[2]` (výchozí = nechat na auditorovi/Kapitánovi) nebo s `--file`.
- Pre-commit guard: pravidla umístění (root allowlist, junk, skripty jen ve scripts/) platí jen pro NOVÉ soubory; úprava existujícího souboru se neblokuje.
- Instalátor hlásí commit poctivě (kontrola exit kódu; dřív „uloženo" i po odmítnutí).

## Změny v3.9.1
- Výchozí model auditora u PLNÉHO profilu = **Fable 5.1** (`claude-fable-5-1`); LEHKÝ = Opus, JEN AUDIT = Sonnet. Důvod: hlavní vlákno auditora dělá úsudek
  (co je chyba, falešné DONE, verdikty) — slabší model = horší verdikty; mechanika zůstává na levných subagentech.

## Změny v3.9
- **Souběh starého a nového Kapitána**: `start-kapitan.cmd` (a zástupce na ploše) čeká přes `tools/wait-idle.mjs`, dokud v projektu běží jiná
  session Claude Code (transkripty v `~/.claude/projects/<cesta>/*.jsonl`, 3 min bez zápisu = klid). Do běžící session zvenku psát nejde →
  instalátor dá do schránky zprávu pro starého Kapitána (dokonči, commit+push, /exit).
- Zástupci na ploše „Auditor - <projekt>" a „Kapitan - <projekt>"; po instalaci se otevře auditor i (čekající) Kapitán.
- Starý způsob spouštění Kapitána zůstává platný: pojistky jsou v `.claude/settings.json` repa (hook, SessionStart inbox, additionalDirectories).

## Změny v3.8.1 (z reálného samotestu na Windows: 67/70)
- gate-check volal git přes shell — cmd.exe sežral `^` v `HEAD^{tree}` → merge/squash gate falešně FAIL; teď `execFileSync` bez shellu.
- pre-commit-check detekoval NUL přes `| head -c`, který v cmd.exe není → binárka prošla; teď čte bajty přímo z `git cat-file`.
- Instalátor uloží do gitu jen soubory instalace přes pathspec commit; index (staged soubory) uživatele se nemění.
- `tools/trust-folders.mjs`: workspace + repo odsouhlaseny v `~/.claude.json` (žádný dialog „trust this folder" při startu).
- `tools/patch-deploy.mjs`: gate-check vložen jako první krok do deploy skriptů v repu (.bat/.cmd/.ps1/.sh, `*ota*.py`…), idempotentně.
- Závěr instalace říká, co se stalo a že se nic nedělá ručně; nová sekce „Musím něco vypnout?" (Kapitána restartovat, jinak nic).

## Změny v3.8 (podle prvního reálného běhu na Windows)
- **Samotest padal na Windows** („nothing to commit" u testu změny mode bitu — git na Windows práva nesleduje) a shodil celý běh → test se na Windows
  přeskakuje; výsledek je „N/N PASS" (70 na Windows, 71 jinde).
- **Test brány v PowerShellu hlásil PROŠEL, i když brána fungovala** (samotest ji potvrdil) → test dělá `tools/guard-check.mjs` přes Node, stejně jako
  samotest, ne PowerShell pipeline. Hooky navíc při nečitelném vstupu (ne-JSON) blokují místo propouštění.
- **Auditor se po instalaci sám otevře** (`[1] ano` / Enter) a `start-auditor.cmd` bez parametru rovnou pošle „Zacni intake" — nic se nepíše.
- Všechny volby jsou čísla s Enterem jako výchozí (profil 1/2/3, ano/ne 1/2, síťové disky 1/2, git init 1/2).
- Průzkum: `projects`/`Projects` (stejná složka na Windows) se nepočítá dvakrát; balík sám, WordPress šablony/pluginy a nástroje (BuildTools, ServiceHub)
  jsou PŘESKOČIT; posouzení má limit 8 s na repo; otázka na síťové disky místo tichého přeskočení.
- GitHub: ochrana se nastavuje na výchozí větev repa, ne na aktuálně odhlášenou feature větev; hláška o Free plánu vysvětlena bez úkolu pro vlastníka.
- Šum `LF will be replaced by CRLF` z interních git příkazů potlačen (`core.autocrlf false` ve workspace).

## Změny v3.7.1
- **Necommitnuté soubory už instalaci neblokují.** Instalátor uloží do gitu jen soubory, které sám vytvořil (stav repa před instalací si zapíše do
  `AUDIT/.pre-install-status.txt` a soubory z něj z commitu vyjme); rozdělaná práce zůstává vlastníkovi a auditor ji bere jako výchozí nález GIT/HYG.
- Oprava: `git add` se seznamem cest, z nichž některá neexistovala (`.github` u profilu bez CI), nepřidal nic, takže se instalace u LEHKÉHO profilu
  nikdy necommitla. Přidávají se jen existující cesty.
- Závěrečné hlášky pro laika: „CO TEĎ" se třemi kroky; věci k doplnění jako „auditor si o ně řekne sám".

## Změny v3.7
- **Výběr projektů v HTML**: report má u každého projektu číslo (shodné s terminálem), zaškrtávátko a výběr profilu; tlačítko „Uložit výběr"
  stáhne `Auditor_vyber.json` do Stažených a průvodce ho po Enteru sám načte (Stažené / Plocha / složka balíku; jen soubor novější než report).
  Náhradní cesty: „Zkopírovat čísla" do schránky, nebo čísla napsat ručně. Sloupce lze třídit, čísla zůstávají.
- Sken přeskakuje výstupy buildů/publish (`bin`, `obj`, `Scripts`, `wwwroot`, `publish*`, `out`, `target`, `Release`, `Debug`) — dřív se objevovaly
  desítky „projektů" typu `publish-output\Scripts`.

## Změny v3.6.2
- **Průzkum se „zasekával" po skenu**: posuzování 100+ rep četlo obsah všech souborů 4× bez limitu, git bez timeoutu, bez výpisu průběhu,
  a průvodce pak celou triáž spustil podruhé. Nyní: jeden průchod na repo s limity (20 s / 20k souborů / 60 MB; soubor > 1,5 MB se nečte),
  git s timeoutem (15–20 s, `GIT_OPTIONAL_LOCKS=0`), průběh `[12/103] název  0,4 s`, síťové disky se ve skenu přeskakují (`--sit` je zahrne),
  v OneDrive se obsah nečte (cloudové soubory by se stahovaly) — vše uvedeno v důvodech. Druhý běh triáže odstraněn; seznam má hlavičku a počty profilů.
- v3.6.1: `.ps1` uloženy jako UTF-8 s BOM (PowerShell 5.1 jinak čte Windows-1250 a pomlčka rozbije parser); selftest si nastaví lokální git identitu.

## Změny v3.6
- Session auditora: `permissions.allow` pro bezobslužný běh (deny + hook mají přednost), `autoCompactEnabled: true`, připomínka po kompakci; README sekce „Jak je session nastavená".

## Změny v3.5
- **INSTALL-MULTI**: sken všech lokálních disků + Dokumenty/Stažené/Plocha, `triage.mjs` posoudí každé repo a doporučí profil
  (PLNÝ/LEHKÝ/JEN AUDIT/PŘESKOČIT; cizí a nástrojová repa rozpozná podle cesty a nulového počtu tvých commitů), **HTML report** na Plochu,
  instalace projekt po projektu s vlastním portem. Průvodce a post-install umí profilové parametry (`-Kapitan/-Hygiena/-CI`, `-Port`, `-NoGitHub`, `-NoRepoTouch`).

## Změny v3.4
- **INSTALL.cmd / install.sh** — instalace na jedno kliknutí; průvodce má neinteraktivní režim (`-Yes` / `AUDITOR_YES=1`); `post-install.ps1`
  automatizuje GitHub přes `gh` (audit repo, deploy klíč místo PAT, secrets, chráněná větev), `gen-config.mjs` odvodí obrazovky z routeru,
  `deploy-with-gate.cmd` obalí libovolný deploy příkaz gate-checkem. CI podporuje `AUDIT_SSH_KEY` i `AUDIT_REPO_TOKEN`.

## Změny v3.3 (zapracované návrhy z finální kontroly)
- **CI brána** `kapitan-side/ci/auditor-gate.yml` + návod na chráněnou main → gate platí i mimo agenta; gate-check přijímá merge/squash
  auditovaného commitu bez obsahové změny (ancestor + shodný strom), jinak by každý merge do main gate zneplatnil.
- **Samotest** `tools/selftest.mjs` (71 scénářů) — průvodce ho spouští na konci; povinný po každé změně hooků.
- `gate-check.mjs` se instaluje i do `<repo>/.claude/hooks/` jako záloha; hook i CI preferují kopii z workspace auditora.
- **SELF-PROTECT**: Kapitán nesmí (Edit/Write ani shellem) měnit `.claude/hooks/**`, `.claude/settings*.json`, `.git/hooks/**`, CI bránu.
- gate-check porovnává **hash stromu** (řeší squash i změny mode bitů); `git push --all|--mirror|--tags` = vždy gate-check; `cd` na novém řádku/v závorce se rozpozná.
- `templates/env.audit.example`, retro po prvním auditu (CHYBOVNIK §3), ověření `tool_name` na Windows.

## Změny v3.2 (2. kolo recenze + E2E test)
- E2E simulace celé smyčky (handoff → oprava → push blokován → důkaz → K1 FAIL/K2 PASS → gate 🟢 → deploy povolen → změna → blokován) prošla 12/12.
- Nalezeno a opraveno: pád hooku = fail-open (Node čte nejbližší `package.json`; teď vlastní `package.json` v hooks + `|| exit 2` wrapper);
  push z **git worktree** posuzován podle větve hlavního checkoutu (teď skutečné cwd/`cd`/`-C`; neurčitelná větev = gate-check);
  `npm run` zkratky bez repa (wrapper `run.mjs`); chybějící postup pro vlastní testovací instanci (`build-env.mjs` + `.env.audit`);
  číslování fází, `07_udrzitelnost.md` v README, parita setup .sh/.ps1.

## Změny v3.1 (po nezávislé recenzi balíku + nové pilíře)
- Opraveno z recenze: Kapitánův hook je **fail-closed** bez env; `git push` do main/master/production spouští gate-check (Vercel Git deploy);
  gate-check přijímá české i ISO datum; mutační HTTP mimo localhost blokováno nezávisle na pořadí argumentů; allowlist zápisu má přesné shody;
  pravidla hygieny mají **jediný zdroj** (`hygiene-rules.json`) pro sken, hook i pre-commit; endpoint-probe hlásí NEPRŮKAZNÉ při 0 endpointech
  a nevyplněném configu; `__proto__` payload jako string; emoji grep v PCRE; bus `inbox --limit`; EVIDENCE vyžaduje `--sha`;
  auditor má `build/` pro lokální klon (bez commit/push); retence momentek a mazání `.auth/`.
- Nové pilíře: **UDRŽITELNOST/ŠKÁLOVÁNÍ podle záměru** (intake kolo 1b, matice vrstva × horizont, TCO s ověřenými ceníky, exit cesty)
  a **GIT PRAXE** (`git-practice.mjs`: commity/týden, nepushnutá práce, dirty age, velikost commitů, větve, ochrany).

## Změny v3
- **Hygiena repa** jako samostatný pilíř: inventura (`hygiene-scan.mjs`), hloubkový obsahový průchod dokumentů (staré/konfliktní zdroje pravdy),
  řád (root jen konfigurace, `.tmp/tasks/<ID>/`, archiv mimo repo s manifestem před smazáním) a **trojí vynucení**: pre-commit guard v gitu,
  PreToolUse hook Kapitána (nový soubor v rootu / junk mimo .tmp = Blocked), auditorův sken s AK = 0.
- **Provoz/zálohy/licence**: izolovaný restore test, readiness, alerty, runbook, licence závislostí a dat.
- Průvodce instaluje hygienu do repa se souhlasem.

## Změny v2 (přehodnocení v1 + poučení z auditu KinoXT3)
- **Chyba v1 opravena**: plošné deny `git commit/push` bránilo auditorovi commitovat vlastní AUDIT repo → hook je teď cestově citlivý (git jen ve workspace, nikdy v repu).
- Placeholdery `[DOPLŇ]` nahrazuje průvodce; cesty jdou do `settings.json → env`, hooky je čtou.
- Most (`bus.mjs`) místo „sdílená složka": funguje přes stroje, má vlastnictví zpráv, kola review, `replyTo`, stavový řetězec, metriky chování Kapitána (**false_done_rate**).
- Strana Kapitána má vlastní hook a **gate-check** — vydání nelze obejít ani ručním kliknutím na .bat (KinoXT3: člověk obešel HOLD).
- Nálezy mají **třídu důkazu** (reprodukovaná chyba / staticky doložené riziko / hypotéza / mezera v důkazu); handoff i verdikt mají povinné „co jsem neprokázal".
- Ověření vyžaduje vlastní protipříklady a **kombinace stavů/přepínačů** (KinoXT3: 18/18 zelených testů, `--dry-run --rollback` mazal živý soubor).
- UI crawler má síťový guard (mutace, externí hosty, rizikové GET blokovány mimo izolované prostředí).
- Efektivita: měření v čerstvé session, latence hooků zvlášť, počty volání Skill/Agent z transkriptů, dieta seřazená podle úspora/riziko.
