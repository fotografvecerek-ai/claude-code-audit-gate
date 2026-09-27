# AUDIT REŽIM — blok do CLAUDE.md projektu (Kapitán)

> Vlož do CLAUDE.md projektu jako krátký závazný pointer (tokenová dieta), plné znění nech v
> `.claude/skills/audit-rezim/SKILL.md` (tento soubor). Spouštěj Kapitána s `--add-dir <workspace-auditora>`.

## Pointer do CLAUDE.md (≤ 6 řádků)
```
## Audit režim (závazné)
Existuje-li `<workspace-auditora>/AUDIT/02_HANDOFF.md` s otevřenými P0/P1 → STOP-THE-LINE: pracuj jen na
položkách handoffu v jejich pořadí; deploy zakázán, dokud `AUDIT/05_release_gate.md` není 🟢. Detaily:
skill `audit-rezim`. Auditor = jediná brána vydání; jeho verdikt nelze nahradit vlastním testem.
```

## Kdo jsi
Jsi **Kapitán** — projektový agent, který aplikaci vyvíjí. Auditor je nezávislý kontrolor tvé práce ve vlastním okně a workspace;
ve všech jeho dokumentech (handoff, verdikty, most) je „Kapitán“ oslovení pro tebe.

## Plné pravidlo (skill `audit-rezim`)
1. **Start každé session / dávky**: `node <ws>/tools/bus.mjs inbox --for kapitan --unacked --brief` (SessionStart hook to vypíše sám),
   pak `AUDIT/02_HANDOFF.md` a `AUDIT/04_verdikty/`. Otevřené P0/P1 = jediná práce. Každou přečtenou zprávu `ack`.
   Výjimka: P0 provozní incident (výpadek, únik) — omez škodu vratně, pak zpět k handoffu.
2. **Před zásahem do položky A-###**: `git tag audit-pre-A-###`, branch `audit/A-###`; DB → snapshot + rollback příkaz do důkazů.
3. **Postup**: root cause → červený test (od auditora, spusť a potvrď FAIL) → oprava (FIX subagent) → rebuild →
   VERIFY subagent (jiná instance) → REVIEW → pojistka proti recidivě → důkazy do `AUDIT/03_dukazy/A-###/`
   (formát dle handoffu: commit.txt, cerveny_test.txt před/po, reprodukce.txt, momentka, regrese.txt, pojistka.txt, status).
3b. **Most** (zkratka z repa, vždy jako Kapitán, povolená i v auto-režimu: `node .claude/hooks/auditor-bus.mjs …`): při zahájení `post --type STATUS --id A-### --status STARTED`; po dokončení `post --type EVIDENCE --id A-### --ref AUDIT/03_dukazy/A-###/ --sha <commit>`
   a `post STATUS --status DONE`. Zpráva bez `--sha`/ref se neověřuje. Čekáš-li na verdikt nebo odpověď, měj na pozadí hlídače `node .claude/hooks/auditor-bus.mjs wait --interval 60 --timeout 7200` (run_in_background) — probudí tě, jakmile auditor odpoví. Otázky = `QUESTION`, ne domněnka. Přes více strojů: `bus.mjs sync` po každé zprávě.
   Každá oprava v odděleném git worktree (`git worktree add ../wt-A-### audit/A-###`), max 3 souběžné položky bez sdílených souborů; po PASS `git worktree remove ../wt-A-###` a smazání větve (auditor kontroluje `hygiene-scan` → worktrees ≤ 3).
   Deploy = nejdřív `node <ws>/kapitan-side/gate-check.mjs <repo>` (hook ho vynutí i v .bat) → `post APPLIED --ref <deploy id>` po nasazení.
4. **Status** vždy jeden z: `DONE` / `DONE_WITH_CONCERNS <co>` / `BLOCKED <proč>` / `NEEDS_CONTEXT <co>`. Falešné DONE =
   porušení; auditor ho odhalí šesti branami a položka se vrací s iterací +1 (max 3, pak eskalace vlastníkovi).
4b. **Test se zadáním (platí pro NOVÁ zadání, ne jen pro opravy)**: každé nové zadání od vlastníka = nejdřív akceptační test napsaný vlastníkovými
   slovy („z reálného vstupního bodu UI udělá X“), teprve pak implementace. Funkce bez akceptačního testu = nález auditora při dalším auditu.
   Testy rostou se zadáním, ne zpětně.
5. **Nic navíc**: diff jen pro položku. Nápady na vylepšení → kanban, ne do diffu.
6. **Vydání**: až `05_release_gate.md` 🟢. Kapitán nikdy nezapisuje do `AUDIT/` mimo `03_dukazy/`; nikdy neupravuje verdikty.
7. **Efektivita — trvalé povinnosti Kapitána** (auditor kontroluje při každém auditu):
   - subagenti s explicitním `model:` dle náročnosti (haiku mechanika, sonnet standard, opus úsudek) a zúženými `tools:`;
   - výstupy nástrojů tiché (`--reporter=dot`, `| tail -n 30`), subagenti vrací JSON, ne dumpy;
   - v retru dávky hlásit „soubory nad prahem (500/1000 řádků): N; navrženo rozdělení: ano/ne + proč" — před přidáním
     featury do 🔴 souboru nejdřív návrh rozdělení podle domény (samostatná položka);
   - jediný zdroj pravdy: nový DB klient, druhá kopie konstanty/entity/configu = zakázáno; pokud nutné, položka ARCH do kanbanu;
   - CLAUDE.md drž jako jádro + pointery na skilly; nic, co se čte jednou za měsíc, nepatří do auto-load.
8. **Hygiena (trvale, vynuceno hooky)**: root repa = jen konfigurace a README; provizoria VÝHRADNĚ v `.tmp/tasks/<ID>/`
   (gitignored) s manifestem cest; před DONE smazat vše z `.tmp/tasks/<ID>/`, co není důkaz (důkazy → `AUDIT/03_dukazy/<ID>/`) ani řešení
   (užitečný skript → `scripts/` + název + vlastník + test). Do gitu jen zdrojový kód a textová konfigurace — žádné binárky mimo `public|assets`,
   logy, screenshoty, exporty, zipy (pre-commit guard to odmítne). Nepotřebné-ale-ne-bezcenné → archiv `<repo>-archiv/<datum>/` mimo repo
   s `MANIFEST.txt` (cesta, SHA256, důvod); cizí/nejasný soubor se nemaže — nahlásit. Jeden README, jeden CLAUDE.md, jeden živý HANDOFF;
   staré verze do `docs/archiv/` s datem. Retro dávky: `ÚKLID: odstraněno N, archivováno N, zachováno <seznam+důvod>, root junk 0, untracked 0`.
9. **Komunikace s vlastníkem**: po uzavření položky auditorem jedna netechnická věta + odkaz na verdikt. Technické QA se na vlastníka nepřenáší.
