# Auditor — independent audit agent for Claude Code

[![ci](https://github.com/fotografvecerek-ai/claude-code-audit-gate/actions/workflows/ci.yml/badge.svg)](https://github.com/fotografvecerek-ai/claude-code-audit-gate/actions/workflows/ci.yml)

> **EN:** An independent *audit agent* for [Claude Code](https://code.claude.com). It audits an application built by another agent (the
> project agent, here called **Kapitán**): security (OWASP ASVS / Top 10), every feature, the UI via Playwright (every screen, every
> interactive element), single source of truth, repo hygiene, git practice, agent efficiency (tokens, model routing), sustainability of the
> stack for the stated intent, backups. It **never writes code, never changes the repo, never deploys**. It hands a package of findings with
> proposed fixes to the project agent, enforces *stop-the-line*, independently re-verifies every fix through six gates, and gates the
> release with **technical barriers** (Claude Code hooks, git pre-commit, GitHub Actions) — not just words in a prompt.
>
> The tool, its prompts and documentation are in **Czech** today. An English layer is the most wanted contribution — see
> [CONTRIBUTING.md](CONTRIBUTING.md). Windows (`START.cmd`) and macOS/Linux (`start.sh`) are supported.

**Read first / Čtěte nejdřív:** [docs/WHAT-IT-DOES.md](docs/WHAT-IT-DOES.md) (EN) · [docs/CO-TO-UMI.md](docs/CO-TO-UMI.md) (CZ) — why this is
not a one-shot audit tool but a permanent, independent role in the project, what exactly it audits, how the release gate works, and what
you get.

## CZ — co to je

Samostatný agent pro Claude Code, který **audituje** aplikaci vyvíjenou jiným agentem (**Kapitánem**): bezpečnost, funkčnost každé funkce,
UI přes Playwright (každá obrazovka, každý prvek), jediný zdroj pravdy, pořádek v repu, git praxi, efektivitu agentů (tokeny, modely),
vhodnost technologie pro záměr, zálohy. Sám **nic nekóduje, nemění a nevydává**. Nálezy s návrhem řešení předá Kapitánovi, vynutí
STOP-THE-LINE, každou opravu nezávisle ověří (šest bran) a vydání povolí až zeleným verdiktem — brány jsou technické (hooky, git hook, CI).

Vznikl z reálné potřeby: agenti píšou kód rychle, ale „hotovo" často neznamená hotovo. Auditor je druhý pár očí, který nemá motivaci
schválit vlastní práci.

**Pro koho:** především pro rozjetý projekt v problémech — žere tokeny, agent vyrábí nesmysly, v repu je nepořádek. Auditor zpětně dožene,
co chybí (testy, pořádek, zálohy), a dopředu vynutí, aby testy vznikaly se zadáním. Do hodiny první lidská stránka `AUDIT/00_prvni_dojem.md`.

**Není to jednorázový sken.** Auditor v projektu zůstává: každé vydání jde přes jeho bránu, každý start Kapitána začíná jeho zprávami,
každá oprava se nezávisle ověřuje a chování Kapitána se měří (falešná „hotovo“, kola na opravu, tokeny před/po). Podrobně: [docs/CO-TO-UMI.md](docs/CO-TO-UMI.md).

**Auditor vs. CI:** nenahrazuje CI, krmí ho — každý nález musí skončit jako mechanická pojistka (test/lint/hook/CI check). Co CI neumí
(záměr, průchod funkcí bez testů, „zelený test testuje něco jiného“, nezapojená oprava, smyčka s agentem), dělá auditor. Podrobně v docs §3b.

## Rychlý start

**Windows:** rozbal, poklepej na `START.cmd` → `[1]` (cesta k projektu) nebo `[2]` (prohledá disky, vybereš projekty v prohlížeči).
**macOS / Linux:** `bash start.sh`.

Instalátor se na nic technického neptá. Vytvoří vedle projektu složku `<projekt>-audit` (workspace auditora), nastaví pojistky na obou
stranách, otevře okno auditora (sám začne intake — ptá se lidsky, co aplikace dělá a čeho se bojíš) a okno Kapitána. Podrobně: [`NAVOD.txt`](NAVOD.txt).

Předpoklady: Node 20+, Git, Claude Code; volitelně GitHub CLI (`gh`), gitleaks, semgrep.

## Jak to funguje (zkráceně)

```
 Auditor (vlastní workspace, read-only přístup k repu)          Kapitán (repo aplikace)
 ─────────────────────────────────────────────────────          ─────────────────────────
 intake → hygiena → git → statika → bezpečnost → funkce         běžná práce
 → UI crawl → SSOT → provoz → efektivita → udržitelnost
 → nálezy + návrhy řešení → HANDOFF ──────── bus ──────────►    STOP-THE-LINE: opravuje jen položky handoffu,
                                                                 důkazy do AUDIT/03_dukazy, hlásí přes bus
 nezávislé ověření (6 bran) ◄──────────── EVIDENCE ────────
 VERDICT PASS/FAIL (kola K1, K2…) ──────────────────────────►    oprava / další kolo
 RELEASE GATE 🟢 ───────────────────────────────────────────►    deploy (hook + gate-check + CI to jinak zablokují)
```

Detaily: [`auditor/CLAUDE.md`](auditor/CLAUDE.md) (ústava auditora), [`auditor/BRIDGE.md`](auditor/BRIDGE.md) (most), [`auditor/README.md`](auditor/README.md)
(struktura, nastavení session, historie změn), [`auditor/checklists/`](auditor/checklists/) (co se kontroluje a podle jakých standardů).

## CI

Každý push a PR běží na **Windows, Linuxu i macOS**: syntaxe Node/bash/PowerShell (vč. BOM a zákazu bash4-ismů), samotest bran (71 scénářů)
a end-to-end instalace do fixture repa s rozdělanou prací (ověřuje, že se do gitu uloží jen soubory instalace a brána blokuje). Tag `v*` vydá zip
jako GitHub Release. Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Přispívání

Vítané: opravy s reprodukcí, nové kontroly se standardem, podpora dalších stacků, **překlad do angličtiny**. Pravidla a testy:
[CONTRIBUTING.md](CONTRIBUTING.md). Před PR: `node auditor/tools/selftest.mjs` = 100 % PASS.

## Licence

MIT — [LICENSE](LICENSE).
