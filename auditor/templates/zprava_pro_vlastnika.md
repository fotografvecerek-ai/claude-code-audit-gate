# Zpráva pro vlastníka — <název projektu>

<!-- Píše auditor. Pravidla: žádný žargon (místo "IDOR" → "přihlášený uživatel vidí cizí data"), každý bod = CO JE ZA PROBLÉM + CO TO ZNAMENÁ PRO TEBE
     (peníze, data, zákazníci, čas) + DOPORUČENÍ, JAK TO VYŘEŠIT (lidsky, kdo a kdy) — u KAŽDÉHO nálezu, bez výjimky. Max. 2 obrazovky. Technické detaily jen odkazem na soubor. Aktualizuj po prvním dojmu,
     po handoffu a po každém verdiktu. Render: node tools/owner-report.mjs → AUDIT/ZPRAVA.html -->

**Stav k:** <datum> · **Celkový verdikt:** 🔴 / 🟡 / 🟢 <jedna věta> · **Smí se vydávat:** ano / ne (proč)

## Jedním odstavcem
<3–5 vět lidsky: v jakém stavu projekt je, co je největší riziko, co se teď děje a kdy bude další informace.>

## Nejzávažnější věci (seřazeno podle dopadu)
| | Co je za problém | Co to znamená pro tebe | Doporučení (jak to vyřešit) |
|---|---|---|---|
| 🔴 | <např. Každý přihlášený uživatel si může otevřít faktury jiné firmy> | <únik dat zákazníků, GDPR pokuta> | <Oddělit data firem na úrovni databáze; Kapitán opraví, auditor ověří; hotovo cca …> |
| 🔴 | … | … | … |
| 🟡 | … | … | … |

## Peníze a tokeny
<Kolik agenti spotřebují a proč (např. „každý dotaz načítá 40 stran pravidel"), odhad úspory po úpravě, co už je změřeno.>

## Pořádek a zálohy
<Je práce zálohovaná? Kolik souborů není uložených v gitu? Je v projektu nepořádek, staré a konfliktní dokumenty? Lze obnovit data?>

## Co je v pořádku
<Krátce — co funguje dobře. Vlastník má vidět i to.>

## Co potřebuju od tebe
<!-- Otázky = interaktivní formulář v HTML. Syntaxe jednoho řádku (přesně):
     - [Q1] Otázka lidsky, s tím, co z odpovědi plyne? {ano/ne; doporučeno: ano — proč, jednou větou}
     - [Q2] Otázka s variantami? {varianta A | varianta B | nevím, rozhodni ty; doporučeno: varianta A — proč}
     - [Q3] Otevřená otázka? {text; doporučeno: co bys napsal ty — proč}
     KAŽDÁ otázka MUSÍ mít doporučenou odpověď s důvodem (v HTML je předvybraná; vlastník může jen potvrdit).
     Jen rozhodnutí, která jsou na vlastníkovi. Pokud žádná, napiš větu „Nic, jen si to přečti." -->
- [Q1] <např. Můžu navrhnout rozdělení velkého souboru na menší části? Zrychlí to práci agentů a sníží spotřebu tokenů.> {ano/ne; doporučeno: ano — jeden velký soubor je hlavní příčina vysoké spotřeby tokenů}
- [Q2] <např. Kde běží ostrá data?> {Supabase | vlastní server | nevím; doporučeno: nevím — pokud si nejsi jistý, zjistím to z konfigurace sám}

## Průběh opravy
<Kolik nálezů otevřeno / opraveno / ověřeno; kolikrát agent tvrdil „hotovo" neprávem.>

<sub>Technické podrobnosti: 02_HANDOFF.md (pro Kapitána), 01_nalezy/, 04_verdikty/, 06_efektivita.md, 07_udrzitelnost.md.</sub>
