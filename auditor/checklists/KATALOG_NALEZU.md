# Katalog opakujících se auditních nálezů

## 1. Ukládání dat a ztráta uživatelských změn

### Falešné potvrzení úspěchu

Aplikace zobrazila „Uloženo“, přestože lokální zápis selhal. Úspěch vzdálené AI operace byl zaměněn za úspěch celé transakce.

Audituj:

- zda se úspěch hlásí až po dokončení všech povinných kroků;
- co se stane, když server uspěje, ale lokální uložení selže;
- zda časovač nebo opožděný callback nepřepíše chybový stav.

### Opožděná odpověď přepíše novější stav

Starší AI odpověď, síťový požadavek nebo asynchronní operace mohla přepsat text, který uživatel mezitím ručně upravil.

Stejný vzorec se objevil na více místech:

- AI generování deníku;
- presence a souběžné DELETE/POST;
- výstrahy a odpovědi providerů;
- synchronizace a obnova dat.

Audituj generační čítače, identitu požadavku, abort signály a kontrolu, zda se původní stav od zahájení operace nezměnil.

### Průběžné hlasové rozpoznávání maže ruční doplnění

Nový průběžný výsledek rozpoznávání řeči nahradil celé textové pole a odstranil text, který uživatel mezitím ručně dopsal.

Audituj kombinaci:

1. průběžný automatický vstup;
2. ruční editace;
3. další automatický výsledek;
4. ukončení rozpoznávání.

### Outbox nebyl bezpečný při pádu nebo reloadu

Potvrzení položek se ukládalo až po dokončení celé dávky. Reload uprostřed odesílání proto způsobil opakované odeslání již úspěšných položek.

Audituj:

- potvrzení každé položky okamžitě;
- idempotentní ACK;
- přidání nové položky během flush;
- 20+ offline položek;
- reload po každém jednotlivém kroku;
- ztracenou odpověď po úspěšném serverovém zápisu.

### Chyběla serverová idempotence

Klientský outbox mohl opakovat požadavek po ztrátě odpovědi a server jej zpracoval podruhé.

Audituj stabilní `operationId`, atomické uložení idempotency klíče, rozumnou expiraci a chování při nedostupném úložišti idempotence.

### „Jedna položka na místo“ zaměněna za „jednu návštěvu“

Datový model nerozlišoval opakované návštěvy stejného místa. Editace, fotografie a publikace tak mohly pracovat s nesprávnou událostí.

Audituj stabilní identitu události. Datum, název nebo místo obvykle nejsou dostatečný primární identifikátor.

### Datum fotografie se měnilo kvůli UTC

Převod timestampu přes UTC mohl přesunout fotografii do předchozího nebo následujícího místního dne.

Audituj:

- EXIF čas;
- místní časovou zónu;
- ruční změnu data;
- import poblíž půlnoci;
- chybějící časovou zónu;
- shodu všech zapisovatelů.

### Různé části aplikace počítaly den cesty jinak

Editor, AI generování a publikace neměly jednotný výpočet dne cesty.

Audituj, zda existuje jediná sdílená funkce a zda ji používají všichni volající.

---

## 2. Autentizace, autorizace a vlastnictví

### IDOR a chybějící kontrola vlastníka

Některé operace přijímaly identifikátor zařízení nebo profilu bez dostatečného ověření, že přihlášený uživatel daný objekt skutečně vlastní.

Audituj každý read, update a delete samostatně. Nestačí chránit pouze vytvoření objektu.

### TOFU first-claim nad veřejně zjistitelným ID

Libovolný držitel validně vypadajícího tokenu mohl jako první „obsadit“ dosud neexistující profil podle veřejně zjistitelného `deviceId`.

Audituj první založení objektu zvlášť. „Kdo přijde první, je vlastník“ je bezpečné jen tehdy, pokud první nárok obsahuje ověřený registrační důkaz nebo ověřenou identitu.

### Enumerace existence profilu

Server vracel jinou odpověď pro existující cizí profil než pro neexistující profil. Útočník tak mohl zjišťovat, která ID existují.

Audituj shodu statusů, struktury těla, chybových textů a přibližně i časování.

### Staré řádky neměly vlastníka

Nová autorizace fungovala pro nové záznamy, ale historické řádky neobsahovaly `user_id` nebo jiný prokazatelný vztah k uživateli.

Audituj migrační cestu, ne pouze nové INSERTy. Neznámé vlastnictví se nesmí automaticky přidělit podle prvního žadatele.

### Změna účtu neizolovala rozběhnuté operace

Operace spuštěná pod účtem A mohla doběhnout až po přihlášení účtu B a zapsat výsledek do nového kontextu.

Audituj vlastnictví na začátku i před commitem výsledku. Při logoutu ruš naplánované a čekající operace.

### Login mohl hlásit úspěch bez skutečné session

Dokončení OAuth nebo návrat z externího flow bylo zaměněno za existenci platné aplikační session.

Audituj skutečné načtení session, uživatele a oprávnění. Callback nebo otevření deeplinku samo o sobě není přihlášení.

### Token v URL

Citlivý vlastnický token byl použit v PostgREST URL. URL se může objevit v logu, historii, proxy nebo monitoringu.

Audituj, zda se tajemství neposílá v query stringu. Preferuj autorizaci v hlavičce nebo serverovou identitu.

---

## 3. Soukromí, zálohy a fotografie

### Pending fotografie mohly být veřejné

Návrh fotografie čekající na schválení nebyl jednoznačně oddělen od veřejně publikovaných objektů.

Audituj Storage RLS, metadata publikace, veřejné URL a starší objekty vytvořené před opravou.

### Deklarované E2E šifrování neodpovídalo realitě

Produkt mohl působit, že cloudová záloha je end-to-end šifrovaná, přestože kontrakt a uložená data tomu plně neodpovídaly.

Audituj:

- kde vzniká klíč;
- kdo ho může obnovit;
- zda server někdy vidí plaintext;
- co přesně záloha obsahuje;
- zda marketingový text odpovídá technickému řešení.

### Cloudová záloha nebyla úplná

Uživatel mohl očekávat kompletní zálohu dovolené, ale fotografie míst, doklady nebo GPS stopa v ní nebyly.

Audituj nejen technickou funkci, ale i pravdivost názvu, popisu a očekávání uživatele.

### Novější upload neznamená novější obsah

Konflikty se rozhodovaly podle času uploadu místo podle revize obsahu. Starší data odeslaná později mohla přepsat novější stav.

Audituj revize, parent revision, timestamp zdroje, TOCTOU a legacy objekty bez revize.

### Sentinel testy nedetekovaly skutečné selhání obnovy

Kontrola několika vybraných hodnot vytvářela dojem, že obnova funguje, přestože část dat mohla chybět.

Audituj reprezentativnost sentinelů, prázdné úložiště, částečnou obnovu a skutečnou nativní storage vrstvu.

### Neověřený původ a licence fotografií

Test pokrýval pouze vzorek, ale závěr byl vztahován na celý katalog.

Audituj reprezentativní výběr, identitu objektu na fotografii, původ, licenci, autora a možnost dalšího šíření.

---

## 4. API, kvóty a placené služby

### Fail-open při výpadku kvót

Při nedostupném Redis nebo budget systému mohl placený endpoint pokračovat bez kontroly rozpočtu.

Audituj, zda placené a výpočetně drahé operace selžou bezpečně.

### Validace proběhla až po rezervaci kvóty

Neplatný požadavek mohl spotřebovat uživatelský limit nebo rezervovat placenou operaci.

Správné pořadí:

1. metoda a autentizace;
2. typy, délky a rozsahy;
3. normalizace;
4. až potom rezervace kvóty;
5. následně síťové volání.

### Retry nebyl účtován

Endpoint provedl několik externích fetchů, ale rozpočet se zvýšil pouze jednou.

Audituj každý retry, fallback, paralelní větev a následné volání externí služby.

### Testoval se jeden endpoint, nikoliv celá plocha

Jednotlivý zelený test byl mylně prezentován jako důkaz, že všechny placené handlery mají kvóty a validaci.

Audituj automatickou inventuru všech handlerů a test, který selže při přidání nového nechráněného endpointu.

### Citlivý marker mohl uniknout do odpovědi nebo logu

Audit zahrnoval syntetické tajemství a kontrolu, že se neobjeví v odpovědi, chybě ani logu.

Tento test používej obecně pro API klíče, bearer tokeny, callback URL a přihlašovací údaje.

---

## 5. Filtry, vyhledávání a datová správnost

### Kombinované filtry obcházely upřesnění

Jednotlivé filtry fungovaly, ale jejich kombinace přeskočila část podmínek nebo použila jinou cestu.

Audituj kartézské kombinace hlavních filtrů a shodu výsledků mezi seznamem, mapou a databází.

### Tri-state filtr se choval jako boolean

Hodnoty „ano“, „ne“ a „neuvedeno“ nebyly vždy odlišeny. Chybějící údaj mohl být považován za negativní.

Audituj `true`, `false`, `null`, chybějící klíč a historická data.

### Vzácné typy POI mizely kvůli obecné bráně významnosti

Globální filtr `_vyznam()` skrýval vzácné, ale relevantní typy bez ohledu na jejich skutečný význam.

Audituj interakci obecných pravidel s výjimkami. Popis nebo hezký název sám o sobě není důkaz významnosti.

### Výsledky se lišily podle země nebo datového backendu

Oprava ověřená na Itálii nemusela fungovat na dalších zemích nebo mezi JSON a SQLite cestou.

Audituj stejnou logiku nad reprezentativními zeměmi, starými daty a všemi podporovanými backendy.

---

## 6. Mapy, trasy a informační vrstvy

### Funkce existovala, ale nebyla zapojená do reálného flow

Například helper pro regiony prošel testem, ale nebylo prokázáno, že uživatel hranici skutečně uvidí.

Audituj cestu od vstupu přes stav až k renderu. Existence funkce a unit test nejsou důkazem uživatelského výsledku.

### Trasa nedodržovala rozpočet nebo nebyla úplně změřena

Test jedné větve nestačil pro oba generátory, restart výpočtu, zámky, časový limit a kilometrický limit.

Audituj všechny generátory, částečnou trasu, nedostupnou trasu a chování při restartu.

### Odhad vypadal jako přesná hodnota

Neúplný profil nebo cena byly zobrazeny bez dostatečného odlišení od přesně vypočtené hodnoty.

Audituj `estimated`, `partial`, `unavailable` a coverage celé trasy.

### Staré provozní informace působily aktuálně

Údaj o palivu nebo jiný průměr mohl být korektně vykreslen, ale pocházel ze zastaralého zdroje.

Audituj stáří, verzi zdroje, datum aktualizace a jasné upozornění uživatele.

### Opožděný provider přepsal novější výstrahu

Pozdější dokončení staršího dotazu přepsalo čerstvější výsledek.

Audituj závody u počasí, požárů, radaru, dopravních dat a dalších vícezdrojových služeb.

### Výkonové tvrzení nebylo změřeno srovnatelně

3D nebo mapová změna byla označena za rychlou bez A/B měření na stejném telefonu, stejném APK a stejných podmínkách.

Audituj zařízení, build, dataset, scénář, zahřátí a opakovatelnost.

---

## 7. Uživatelské rozhraní a přístupnost

### Draft se choval jako okamžitý commit

Uživatel mohl očekávat, že změny v dialogu jsou dočasné, ale aplikace je aplikovala ještě před potvrzením.

Audituj otevřít → změnit → zrušit → znovu otevřít a otevřít → potvrdit → reload.

### Dialog nebyl kompletně přístupný

Přidání klávesnicové alternativy samo o sobě nedokazuje přístupnost.

Audituj:

- focus trap;
- návrat fokusu;
- Escape;
- popisky;
- role dialogu;
- čtečku obrazovky;
- ovládání bez myši;
- mobilní touch flow.

### Reorganizace menu byla uzavřena podle jedné položky

Dílčí test jedné skupiny byl zaměněn za dokončení celé informační architektury menu.

Audituj celou hierarchii, konzistenci názvů, duplicity a dostupnost funkcí.

### UI tvrdilo více, než systém skutečně dělal

Například „záloha“, „šifrováno“, „aktuální“ nebo „uloženo“ neodpovídalo skutečnému technickému stavu.

Auditní agent musí kontrolovat také pravdivost textů, ne pouze funkčnost kódu.

---

## 8. Release, build a provozní brány

### Zelený build byl zaměněn za správný výsledek

Build nebo unit test neprokazoval správné chování uživatelského flow.

Audituj odděleně:

- sestavení;
- funkční test;
- uživatelský scénář;
- identitu artefaktu;
- produkční ověření.

### Release brána nebyla integrálně ověřena

Klasifikátor prošel 9/9, ale nebyla ověřena kombinace:

- `.gate-ok`;
- přesný commit;
- PID ancestry;
- držitel kapitánského zámku;
- nezávislý reviewer;
- skutečný runner.

Audituj celou bránu jako celek. Test pomocné funkce není test bezpečnostního mechanismu.

### Artefakt neodpovídal schválenému SHA

Evidence vydání sama uváděla, že artefakt nemá shodu s release commitem.

Audituj hash zdroje, build výstupu, APK/web artefaktu a přesnou identitu nasazené verze.

### Produkční marker byl pouze kanár

Kontrolní skript dokazoval přítomnost určitého kódu, ale ne skutečné runtime chování ani bezpečnost.

Audituj, co důkaz opravdu potvrzuje a co už je pouze inference.

### Testovací infrastruktura vytvářela falešné chyby

Nalezené příklady:

- test mířil na landing page místo aplikace;
- chyběl lokální server;
- sandbox blokoval vytvoření procesu nebo dočasného adresáře;
- zastaralý test očekával odstraněné chování;
- výkonový test byl flaky;
- test údajně našel šest vad mazání, ale chyba byla v testu.

Auditní agent musí umět odlišit:

1. chybu produktu;
2. chybu testu;
3. chybu prostředí;
4. neprůkazný výsledek.

---

## 9. Chyby samotného auditního a pracovního procesu

### Dílčí PASS byl vydáván za uzavření celé položky

To byl jeden z nejčastějších problémů. Test jedné větve vedl k označení celého tématu jako hotového, přestože v kolonce „co zbývá“ byly další podmínky.

Pravidlo:

> Položka může být uzavřena pouze tehdy, když nemá žádnou neověřenou akceptační podmínku.

### Hlášení implementátora bylo zaměněno za nezávislý důkaz

„Testy prošly“ nebo „produkce je čistá“ není nezávislá přejímka.

Požaduj:

- commit nebo hash;
- skutečnou cestu souboru;
- přesný příkaz;
- exit kód;
- počet kontrol;
- omezení důkazu;
- vlastní opakování testu auditorem.

### Test kopíroval logiku místo volání skutečné funkce

Takový test může být zelený, i když produkční kód není vůbec zapojen.

Audituj, zda test importuje nebo spouští skutečný handler, helper nebo uživatelský flow.

### Registr existoval, ale nadhodnocoval stav

Původní souhrn označoval mnoho položek jako `CODEX-PASS`, i když šlo pouze o dílčí důkaz. Po korekci zůstaly celé uzavřené pouze tři položky z 53.

Audituj konzistenci mezi:

- stavem;
- důkazem;
- kolonkou „co zbývá“;
- produkční aktivací.

### Návrh existoval, ale nebyl aktivní

Opakující se příklady:

- hook byl napsaný, ale nezaregistrovaný;
- konfigurace neexistovala;
- rotace měla jen dry-run;
- SQL migrace nebyla aplikovaná;
- test byl zelený, ale skutečný flow mechanismus nepoužíval.

Auditní agent musí rozlišovat:

1. návrh;
2. implementovaný zdroj;
3. registrovaný mechanismus;
4. aktivní konfiguraci;
5. reálnou provozní událost;
6. změřený účinek.

### Bezpečnostní mechanismus byl fail-open bez viditelného alarmu

Fail-open může být záměrný, ale rozbitá kontrolní infrastruktura nesmí zmizet tiše.

Audituj varování, telemetry a možnost zjistit, že ochrana neběžela.

### Dočasné soubory zůstávaly v pracovním stromu

V projektu byly vidět scratch soubory, testovací obrázky, logy, kopie cest a další jednorázové artefakty.

Audituj vlastnictví dočasných souborů a povinný úklid po dokončení úkolu. Nemaž ale soubory nejasného původu.

---

## 10. Tokenová a agentní optimalizace

### Obrovské automaticky načítané soubory

Pravidla, stav, auditní historie a synchronizační soubory měly stovky kilobajtů až několik megabajtů. Každý tah tak mohl nést zbytečný kontext.

Audituj:

- co se načítá automaticky;
- velikost po bajtech;
- duplicity;
- historické uzavřené bloky;
- možnost indexu a cíleného čtení.

### Optimalizace byla označena za hotovou podle velikosti textu

Zmenšení souboru není důkaz nižší účtované spotřeby tokenů.

Požaduj skutečné usage hodnoty:

- input;
- cache read;
- cache creation;
- output;
- modelový mix;
- počet volání;
- srovnatelnou třídu práce.

### Hook existoval, ale nebyl zapojený

Tokenový strop a modelový guard byly nejprve pouze implementované. Teprve kontrola registrace a aktivních konfiguračních souborů prokázala skutečné zapojení.

Audituj vždy zdroj, registraci, konfiguraci a reálný smoke test.

### Tokenový strop byl slepý kvůli zastaralému zdroji

Guard četl denní report, ale report se několik dní automaticky neaktualizoval. Ochrana tak byla formálně aktivní, ale prakticky propouštěla vše.

Audituj celý datový řetězec ochrany, ne pouze rozhodovací funkci.

### Model routing měl více zdrojů pravdy

Pravidla pro volbu modelu byla rozptýlená. To vede k rozporům a k tomu, že agent používá dražší model i na mechanickou práci.

Audituj jediný strojově čitelný zdroj, pointery z dokumentace a test konzistence.

### Compact hook nebyl ověřen skutečným compactem

Přímé zavolání skriptu prošlo, ale nebyla pozorována reálná událost z agentního prostředí.

Audituj reálný lifecycle event a přesně jedno vložení kontextu. Opakované vložení stejného stavu je skrytý zdroj tokenů.

### Měření před a po nebylo srovnatelné

Nízký den během HOLD nelze porovnat s plným pracovním dnem. Rozdílný počet úkolů, modelů a strojů zkresluje výsledek.

Požaduj:

- úplné dny;
- stejnou metodiku;
- srovnatelnou obtížnost;
- minimální vzorek;
- kontrolu dvojího započítání;
- kvalitu a reopen rate.

---

# Doporučený mentální model auditního agenta

U každého tvrzení „hotovo“ postupuj přes šest bran:

1. **Existuje problém?** Reprodukuj původní selhání.
2. **Existuje změna?** Ověř skutečný soubor, commit a diff.
3. **Je změna zapojená?** Ověř registraci a aktivní konfiguraci.
4. **Funguje mechanismus?** Spusť test nad skutečným kódem.
5. **Funguje uživatelský flow?** Ověř reálnou cestu, reload, souběh a chybové stavy.
6. **Je zachovaný výsledek a bezpečnost?** Ověř regresi, data, oprávnění a provozní stav.

Nikdy nezaměňuj:

- existenci testu za jeho úspěšné spuštění;
- úspěšný test za úplnou akceptaci;
- commit za aktivaci;
- aktivaci za provozní účinek;
- hlášení implementátora za nezávislý důkaz;
- build PASS za správné chování;
- chybu prostředí za chybu aplikace;
- uplynutí času za dostatečný měřicí vzorek.