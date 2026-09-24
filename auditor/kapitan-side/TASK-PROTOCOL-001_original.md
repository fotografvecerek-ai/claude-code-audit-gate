# TASK-PROTOCOL-001 — povinný příjem, provedení, přijetí a úklid úkolů

Datum: 24. 9. 2026. Zadavatel: vlastník. Určeno pro Claude Code / kapitána projektu.

## Cíl

Žádný vlastníkův podnět, nápad, požadavek na vylepšení ani hlášení chyby nesmí zapadnout. Zároveň se běžná otázka nebo informace nesmí bezmyšlenkovitě změnit na vývojový úkol. Uživatelsky viditelná práce není uzavřená pouze proto, že prošel test: dokud vlastník výsledek výslovně nepřijme, zůstává v aktivním kanbanu jako `ČEKÁ NA PAVLA`.

Toto pravidlo je závazné. Samotný odstavec v promptu nestačí; Claude má dodat i mechanické brány a jejich testy podle §8.

## 1. Povinné zachycení vstupu

Před zahájením práce zpracuj každý nový vlastníkův vstup takto:

1. Rozděl zprávu na samostatné akční položky. Každé hlášení chyby, návrh, změna nebo požadavek dostane vlastní trvalé ID ve stávající autoritativní frontě `AUDIT_pozadavky_pavel.md`. Nevytvářej druhý konkurenční kanban.
2. Ulož stručné původní znění, typ (`CHYBA / VYLEPŠENÍ / NÁPAD / ÚKLID / ROZHODNUTÍ`), datum, zdroj, prioritu, vlastníka, dotčenou oblast a akceptační výsledek formulovaný Pavlovými slovy.
3. Čistá otázka, informace, pochvala, stavový dotaz nebo souhlas není samostatný implementační úkol, pokud neobsahuje akční požadavek. Pokud jedna zpráva obsahuje otázku i požadavek, zachyť pouze akční část.
4. Duplicitní požadavek nesmí vytvořit druhý úkol: doplň jej k původnímu ID a zaznamenej nový detail.

Zápis úkolu musí proběhnout **před první změnou kódu nebo dat**, nejpozději v témže tahu.

## 2. Povinná volba HNED / DO FRONTY

Pokud vlastník ve zprávě výslovně neurčí „hned“, „teď“, „priorita“ nebo naopak „později“, „na kanban“, „až bude čas“, polož přesně jednu krátkou otázku:

> Zapsal jsem to jako `<ID> — <stručný název>`. Chceš **A) opravit hned**, nebo **B) zařadit do denní fronty na později**? Doporučuji `<A/B>` protože `<jedna věta>`.

Pravidla:

- Pokud vlastník režim už uvedl, znovu se neptej.
- U více nových položek je vypiš v jedné otázce a dovol A/B pro každou; nezahltit vlastníka sérií dotazů.
- Do obdržení volby je stav `INBOX — ČEKÁ NA VOLBU`; nedělej produktovou implementaci. Je dovolena pouze bezpečná read-only diagnostika nutná k doporučení A/B.
- U aktivního bezpečnostního incidentu nebo hrozící ztráty dat nejprve proveď povolené vratné omezení škody, potom ihned polož volbu pro trvalou opravu. Žádná destrukce, migrace ani deploy bez příslušného souhlasu.

## 3. Stavy a povolené přechody

Používej pouze tento životní cyklus:

`INBOX — ČEKÁ NA VOLBU` → `HNED / PŘIPRAVENO` nebo `FRONTA / PŘIPRAVENO` → `ROZPRACOVÁNO` → `TECHNICKY HOTOVO` → `ČEKÁ NA PAVLA` → `VLASTNÍK PŘIJAL` → `ARCHIVOVÁNO`

Vedlejší stavy: `BLOKOVÁNO — <konkrétní důvod>` a `VRÁCENO — NEFUNGUJE`.

- `TECHNICKY HOTOVO` vyžaduje cílené testy, relevantní smoke/build podle rizika, nezávislé review a úklid task-owned dočasných souborů.
- Po technickém dokončení přesuň položku do `ČEKÁ NA PAVLA` a dej vlastníkovi nejkratší praktický scénář ověření výsledku. vlastník hodnotí funkci a UX; technické QA nesmí být přeneseno na něj.
- Bez vlastníkova výslovného potvrzení typu „funguje“, „je to v pořádku“, „přijímám“ nebo ekvivalentu se položka nesmí označit `VLASTNÍK PŘIJAL`, odškrtnout ani odstranit z aktivní fronty.
- Pokud vlastník oznámí chybu nebo nespokojenost, okamžitě přepni na `VRÁCENO — NEFUNGUJE`, zachovej stejné ID a pokračuj v opravě.
- Po Pavlově přijetí úkol z aktivního kanbanu **přesuň** do append-only archivu s datem, verzí/commitem a potvrzením. Nemaž historii beze stopy.
- Neuživatelské interní podúkoly lze technicky uzavřít důkazem; rodičovský vlastníkův požadavek však zůstává `ČEKÁ NA PAVLA`, dokud nepřijme výslednou funkci.

## 4. Režim HNED

Po volbě A:

1. Označ `HNED / PŘIPRAVENO`, stanov akceptační kritéria a vezmi úkol jako nejvyšší vhodnou prioritu.
2. Proveď opravu v uzavřené smyčce: reprodukce → malá oprava → regrese → nezávislé review → technická brána → úklid.
3. Nepřerušuj jej novým běžným požadavkem; nový vstup jen zachyť a polož volbu. Výjimkou je P0/P1 incident.
4. Po technickém dokončení přejdi na `ČEKÁ NA PAVLA`, ne na hotovo.

## 5. Režim DO FRONTY a denní balík

Po volbě B nesmí položka skončit „někdy“ bez termínu:

1. Ulož ji jako `FRONTA / PŘIPRAVENO` s datem přidání a nejpozdějším datem prvního přezkoumání.
2. **Jednou za kalendářní den Europe/Prague**, při prvním aktivním kapitánském cyklu dne, vytvoř jeden konkrétní denní balík odložených požadavků. Nevytvářej kvůli tomu nový OS plánovač bez samostatného souhlasu; zapoj kontrolu do existujícího kapitánského startu/smyčky.
3. Balík obsahuje nejvýše pět logicky souvisejících položek nebo práci přibližně na čtyři hodiny — podle toho, co nastane dřív. Řazení: bezpečnost/ztráta dat → chyby blokující použití → nejstarší položky → vylepšení → nápady čekající na rozhodnutí.
4. Každý den musí být vidět konkrétní posun: zahájení alespoň jedné připravené položky, nebo přesný blokátor s dalším krokem. Prázdné „ponecháno ve frontě“ se nepočítá.
5. Položka starší než tři **aktivní pracovní dny** bez zahájení se zvýrazní jako `PO SPLATNOSTI` a Claude ji vlastníkovi připomene s důvodem a plánem. Nesmí se tiše odsouvat novějšími nápady.
6. Nápad, který ještě není dost konkrétní pro implementaci, dostane plánovaný úkol „upřesnit rozhodnutí“; nezmizí, ale ani se bez rozhodnutí nezačne stavět.

## 6. Připomínání vlastníkovi

- Při první přirozené komunikaci daného dne připomeň jedním krátkým blokem položky `ČEKÁ NA PAVLA` a položky `PO SPLATNOSTI`.
- Stejnou položku nepřipomínej častěji než jednou za 24 hodin, pokud sama neblokuje bezpečnost nebo konkrétní vydání.
- Formát: `ID — co má vlastník ověřit — nejkratší postup — co se stane po potvrzení`.
- Připomínka nesmí tvrdit, že vlastník má provést technické QA, číst logy nebo hledat chybu. Claude předává technicky ověřený výsledek a žádá pouze potvrzení funkce/UX.

## 7. Povinný úklid po každém úkolu

1. Jednorázové soubory vytvářej pouze v adresáři vlastněném úkolem, např. `.tmp/tasks/<ID>/` nebo systémovém `%TEMP%`, a od začátku veď manifest vytvořených cest.
2. Před stavem `TECHNICKY HOTOVO` smaž pouze task-owned dočasné skripty, dávkové soubory, screenshoty, debug logy, fixture výstupy a pracovní kopie, které už nejsou důkazem ani součástí řešení. Ověř, že manifest nemá zbylé neodůvodněné položky.
3. Reálně užitečný skript neponechávej jako anonymní provizorium: přesuň jej do povoleného `scripts/`/`tests/`, pojmenuj, zdokumentuj vlastníka a pokryj testem; jinak jej odstraň.
4. Zachovej zdrojový kód, migrace, auditní/release důkazy, zálohy, uživatelská data a soubory vytvořené někým jiným. Neznámý či sdílený soubor není task-owned a nesmí se smazat jen kvůli „úklidu“.
5. V kanbanu u technického dokončení uveď `ÚKLID: odstraněno <počet>, zachováno <seznam+důvod>, zbytky 0`.

## 8. Mechanické vynucení, které má Claude implementovat

Nevkládej celé toto znění do auto-load jádra. Zachovej tokenovou dietu:

1. Do `CLAUDE.md` přidej pouze krátký závazný pointer na skill/protokol.
2. Plné pravidlo ulož jako projektový skill, např. `.claude/skills/pavel-task-protocol/SKILL.md`.
3. `UserPromptSubmit` hook musí vytvořit/aktualizovat intake marker a vnutit A/B otázku, pokud akční vlastníkův vstup neobsahuje režim. Hook nesmí ukládat tajemství ani celé citlivé zprávy; do markeru patří ID, hash, čas a klasifikace.
4. Stop/kanban guard musí odmítnout:
   - ukončení tahu s akčním Pavlovým vstupem bez ID a stavu;
   - přechod do `VLASTNÍK PŘIJAL` bez odkazu na vlastníkovo potvrzení;
   - označení `TECHNICKY HOTOVO` bez důkazu QA a výsledku úklidu.
5. Guard musí být fail-closed, ale s ochranou proti nekonečné smyčce: jedna jasná chyba, marker opravy a maximálně jeden automatický opakovaný pokus.
6. Denní kontrola fronty se zapojí do existujícího kapitánského startu/smyčky a zapíše datum posledního sweepu; za tentýž den se nespouští znovu.
7. Přechody stavů validuj malým deterministickým skriptem nad kanbanem/event logem. Žádný nový server ani databáze.

## 9. Povinné akceptační testy protokolu

Claude před předáním doloží minimálně:

1. „Nefunguje tlačítko X“ bez režimu → vytvoří se jedno ID, stav `INBOX`, položí se A/B otázka.
2. „Oprav to hned“ → nevznikne zbytečný dotaz, úkol jde do `HNED / PŘIPRAVENO`.
3. „Dej to na později“ → úkol jde do fronty s datem a objeví se v příštím denním balíku.
4. Dvě položky v jedné zprávě → dvě ID, jedna souhrnná A/B otázka.
5. Duplicitní hlášení → aktualizuje původní ID, nevytvoří duplicitu.
6. Technické testy PASS → rodičovský úkol zůstává `ČEKÁ NA PAVLA`.
7. Pokus o `VLASTNÍK PŘIJAL` bez potvrzení → guard FAIL.
8. vlastník potvrdí funkčnost → stav `VLASTNÍK PŘIJAL`, položka se přesune do archivu se zachováním historie.
9. vlastník řekne „nefunguje“ → stejné ID přejde na `VRÁCENO — NEFUNGUJE`.
10. Task-owned jednorázový `.bat`/debug soubor zůstane při technickém dokončení → guard FAIL; po úklidu PASS.
11. Čistý dotaz „jaký je stav?“ → nevytvoří implementační úkol.
12. Denní sweep druhýkrát tentýž den → žádný duplicitní balík; po třech aktivních dnech nečinnosti → `PO SPLATNOSTI`.

## 10. Krátká odpověď, kterou má Claude používat

Při novém neurčeném požadavku:

> Zapsáno jako `<ID> — <název>`. Chceš **A) udělat hned**, nebo **B) dát do denní fronty**? Doporučuji `<A/B>`: `<důvod>`.

Po technickém dokončení:

> `<ID>` je technicky hotové a ověřené; v kanbanu zůstává `ČEKÁ NA PAVLA`. Prosím ověř: `<1–3 jednoduché kroky>`. Napiš „`<ID>` funguje“, nebo co přesně nefunguje. Teprve po potvrzení jej přesunu do archivu.

## 11. Hranice

Tento protokol není souhlas k deploy, migraci, mazání dat, nákupu ani změně produkčních oprávnění. Neobchází bezpečnostní a release brány. Nevyžaduje po vlastníkovi technické testování. Neopravňuje smazat cizí nebo nejasné soubory. Implementace protokolu musí být malá, vratná, cíleně otestovaná a předána Codexu k nezávislé přejímce.

UTF-8 kontrola: ščřžýáíéúůďťňĚŠČŘŽ
