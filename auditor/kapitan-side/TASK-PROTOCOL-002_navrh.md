# TASK-PROTOCOL-002 — návrh revize (Auditor → vlastník)

Původní znění: `TASK-PROTOCOL-001_original.md`. Verze 001 je dobrá v jádru (životní cyklus, `ČEKÁ NA PAVLA`,
fail-closed brány, tokenová dieta §8, akceptační testy §9). Níže jen to, co ji **zlevní, zdeterminizuje a napojí na auditora**.
Každý bod: co je v 001 → problém → změna.

## Posouzení: 7 změn

### Z1. A/B otázka na každý neurčený vstup → drahá a otravná; nahradit „tichým defaultem s možností veta"
- 001 §2: každý akční vstup bez režimu = blokující otázka. vlastník diktuje hlasem, posílá i 5 podnětů za hodinu → 5 otázek, 5 kol.
- Změna: Kapitán klasifikuje sám a **oznámí volbu, neptá se**: `CHYBA` blokující použití / bezpečnost → HNED; vše ostatní → FRONTA.
  Formát: „Zapsáno `S-041 — tlačítko X`. Dávám **do fronty** (není blokující). Napiš *hned*, pokud chceš jinak." Práce pokračuje.
  Otázka zůstává jen u P0 (ztráta dat, deploy) a u nejednoznačné klasifikace.
- Efekt: 0 blokujících kol v běžném provozu; vlastník má veto v téže zprávě jako dřív.

### Z2. `UserPromptSubmit` hook „vnutí A/B otázku" → nedeterministické (klasifikace = model) a stojí volání navíc
- 001 §8.3 chce, aby hook poznal „akční vstup". Deterministicky nelze; prompt-hook = +1 volání modelu na KAŽDÝ prompt.
- Změna: hook je **jen marker**: zapíše `{hash, čas, session}` do `.kanban/inbox.jsonl` (žádný obsah zprávy). Klasifikaci dělá hlavní model v tahu.
  **Stop hook (deterministický skript)**: každý marker session musí mít v event logu záznam `TASK <ID>` nebo `NO-TASK <důvod: otázka|info|souhlas|duplicita→ID>`;
  chybí → block s hláškou „nerozhodnutý vstup <hash>", max 1 retry (`stop_hook_active`). To je fail-closed a bez modelu.

### Z3. Zdroj pravdy kanbanu = Markdown `AUDIT_pozadavky_pavel.md` → křehké pro skript + koliduje s `AUDIT/` auditora
- Změna: **event log `.kanban/events.jsonl`** (append-only: `{ts, id, event, from, to, ref, by}`) je jediný zdroj pravdy;
  `KANBAN_pavel.md` je **generovaný pohled** (skript `kanban render`). Validace přechodů = skript nad JSONL (001 §8.7 už to chce).
  Přejmenovat soubor, aby „AUDIT_" patřilo jen auditorovi.

### Z4. `TECHNICKY HOTOVO` vyžaduje „nezávislé review" — bez definice, kdo; napojit na auditora
- Změna: položky původem z `AUDIT/02_HANDOFF.md` (P0/P1) **přeskakují A/B** (jsou STOP-THE-LINE) a `TECHNICKY HOTOVO` u nich
  = verdikt auditora PASS (`AUDIT/04_verdikty/<ID>.md`), ne interní review. U běžných položek stačí interní REVIEW subagent;
  u položek dotýkajících se auth/dat/peněz auditor vždy. Ref v event logu: `{event:"verified", ref:"AUDIT/04_verdikty/A-012.md"}`.
- `VLASTNÍK PŘIJAL` guard: vyžaduje `ref` na vlastníkovo potvrzení (hash zprávy z markeru Z2) — 001 §8.4 to chce, tady je mechanismus.

### Z5. Úklid §7 může smazat důkazy pro auditora
- 001 §7.2 „screenshoty… které už nejsou důkazem" — rozhodnutí nechává na Kapitánovi.
- Změna: cokoliv v `AUDIT/03_dukazy/**` a `tests/regression/**` je **nikdy task-owned** (výslovně v manifestu jako `KEEP`). Screenshot z verify
  se ukládá TAM, ne do `.tmp/`. Úklid maže jen `.tmp/tasks/<ID>/`.

### Z6. Denní balík a „3 aktivní dny" — definovat deterministicky
- Změna: „aktivní den" = den s ≥ 1 záznamem v `events.jsonl`. Sweep zapisuje `{event:"sweep", date}`; druhý téhož dne = no-op.
  `PO SPLATNOSTI` = položka `FRONTA/PŘIPRAVENO` bez `started` a s ≥ 3 sweep záznamy po `added`. Připomínka vlastníkovi ≤ 5 řádků, jen při
  prvním promptu dne (marker Z2 zná datum) — 001 §6 to chce, tohle je test.

### Z7. Metrika kvality přímo z kanbanu (napojení na EFEKTIVITA)
- Event log dává zdarma: `VRÁCENO — NEFUNGUJE` / `ČEKÁ NA PAVLA` = **návratovost od vlastníka**; počet `verified FAIL` / položka = iterace;
  `added → VLASTNÍK PŘIJAL` = lead time. Skript `kanban metrics --since 30d` → auditor to čte do `AUDIT/06_efektivita.md`.
- Přidat do §9 test 13: metriky se spočítají z JSONL a souhlasí s ručním součtem na fixture logu.

## Co v 001 zachovat beze změny
§1 rozdělení vstupu na položky s ID a akceptací Pavlovými slovy · §3 stavy a `ČEKÁ NA PAVLA` · §4 HNED bez přerušování · §5 limit 5 položek/4 h ·
§6 „vlastník nedělá technické QA" · §8.1–2 pointer v CLAUDE.md + plný text ve skillu · §9 akceptační testy (rozšířit o Z2, Z4, Z7) · §11 hranice.

## Náklady / rizika změn
- Z1 riziko: Kapitán špatně klasifikuje jako FRONTA něco, co vlastník chtěl hned → vlastník napíše „hned" (stejný náklad jako dnes odpověď na A/B). Přijatelné.
- Z2/Z3: jednorázová implementace skriptu (~150 řádků Node) + 12 testů z §9; pak nulové tokeny za kontrolu.
- Z4: závislost na dostupnosti auditora u P0/P1 — pokud auditor neběží, položka čeká (správně: bez nezávislého verdiktu nevydávat).

## Pořadí zavedení
1. Z3 (event log + render) → 2. Z2 (marker + Stop guard) → 3. Z1 (tichý default) → 4. Z4/Z5 (napojení na AUDIT/) → 5. Z6/Z7 (sweep + metriky).
Každý krok = položka v kanbanu s důkazem dle §9; přejímku dělá Auditor (šest bran), ne Codex — nebo oba, pokud vlastník chce dvojí bránu.
