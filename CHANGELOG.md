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

## 1.2.0
- **Audit z GitHubu** (`START` → [5], `audit-github.ps1|sh`, `tools/remote-clone.mjs`): jen adresa repa, klon vedle workspace, bez Kapitána a bran; ústava §3e (výstup pro klienta, co audit nemůže prokázat); `aktualizovat-repo.cmd|sh` pro novou verzi kódu.
- **Statistika auditu** (`tools/audit-stats.mjs` → `AUDIT/STATISTIKA.html`): soubory a řádky kódu, UI prvky, endpointy, nálezy, verdikty, čas, přesné tokeny z transkriptů podle modelů; ústava §3d.
- START menu: opravené číslo verze.

## 1.1.3
- Zpráva pro vlastníka AUDIT/ZPRAVA.html: netechnická, semafor, u každého nálezu doporučení; otázky jako interaktivní formulář (ano/ne, varianty, komentář) s předvybranou doporučenou odpovědí a důvodem; odpovědi → Stažené/Auditor_odpovedi_<projekt>.json + schránka, auditor je načte sám. tools/owner-report.mjs.
