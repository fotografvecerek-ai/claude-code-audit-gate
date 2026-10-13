# Nastavení agentů podle projektu

Tuto kontrolu proveď na začátku nového auditu a po změně stacku nebo nastavení agentů. Neopakuj celý inventář při každém promptu. Výsledek patří do profilu/intake a nálezů; konfigurace klienta se při auditu nemění.

## 1. Profil a důkazy

`node tools/project-profile.mjs <repo>` vytvoří profil jen čtením souborů. Ulož jej mezi auditní podklady a doplň účel od vlastníka.

- Ověř jazyky, frameworky, databáze, vstupní body, způsob sestavení a testování. Každé tvrzení opři o konkrétní soubor nebo výsledek příkazu.
- Rozliš doložený stack a možný účel. SQL sám nepotvrzuje PostgreSQL; C++ ani Qt Core sám nepotvrzuje desktopové GUI. Přípony BASIC/VBA a sešity vyžadují doplnění kontextu.
- U smíšených projektů zachovej všechny části a jejich hranice. Generované výstupy a závislosti nejsou důkazem hlavního stacku.
- Neúplný sken nebo nečitelný manifest znamená omezení. Absence důkazu při neúplném skenu není důkaz nepřítomnosti technologie.
- Riziková přísnost (Prototyp/Osobní/Běžný/Kritický) je samostatná osa. Zjištění stacku ji nemění a neoslabuje bránu vydání.

### Rozsah podle skutečné vykonávané cesty

Název obrazovky, čtení ani stavová zpráva neznamenají automaticky nízké riziko. Sleduj volání od vstupního bodu až po I/O, dekódování, databázi a opakované úlohy; testuj úspěch i chybu, chybějící metadata a opakovaný pokus. Dolož hranici toho, co jsi skutečně ověřil.

U C++/Qt GUI ověř zatížení hlavního vlákna, synchronní čtení obrázků či metadat, opakování práce a invalidaci cache včetně neúspěšných výsledků. Změř průchod skutečnou obrazovkou při opakovaném použití; úspěšný unit test úložiště není důkaz plynulosti celého kiosku. Použij profiler příslušné verze a konkrétního UI stacku; optimalizaci nedokazuj jen odhadem ze zdrojů. Pro aplikace používající Qt Quick/QML jsou výchozí body [Qt Quick performance](https://doc.qt.io/qt-6.8/qtquick-performance.html) a [QML profiler](https://doc.qt.io/qt-6/qtquick-profiling.html); pro jiné UI zvol odpovídající nástroj. U maker či databázových nástrojů analogicky sleduj skutečný hostitelský proces a datový tok; browser test může být N/A.

## 2. Původ a rozsah výbavy

`node tools/configuration-audit.mjs <repo>` poskytne inventuru a kandidáty k posouzení. Nativní přehled platformy a dostupné nástroje aktuálního okna doplň tam, kde inventura souborů nemá dostatek informací.

U každé položky rozliš:

| Otázka | Potřebný důkaz |
| --- | --- |
| Je soubor přítomen? | Konkrétní cesta a typ položky |
| Je položka nastavena? | Projektový, nadřazený nebo uživatelský zdroj konfigurace |
| Je skutečně dostupná a načtená? | Nativní stav platformy; soubor sám nestačí |
| Byla použita? | Kompatibilní záznamy správného projektu a konkrétního období |
| Je potřebná? | Vazba na účel, stack a plánovanou práci; občasný důležitý úkol může stačit |

Zahrň Claude i Codex: instrukce, pravidla, skilly, agenty, hooky, MCP a sdílené zdroje. Rozliš položky balíku podle jeho evidence od vlastních souborů a pluginů. Neupravuj soukromé hodnoty konfigurace a nevkládej je do důkazů.

## 3. Relevance a konflikty

- Porovnej výbavu se skutečnou prací. Webové testy či pravidla frontendu potřebují důvod v nativním nebo makro projektu; databázové kontroly potřebují databázovou část.
- Ponech nejmenší dostačující proces. Potřeba delegace a nezávislého ověření vychází z velikosti a rizika změny; počet subagentů sám není metrika kvality ani úspory.
- Duplicitu dolož shodným obsahem, odpovědností nebo překrytím konfigurace. Samotný podobný název nestačí.
- Kandidátní rozpor vždy obsahuje odkazy na obě instrukce a jejich rozsah. Posuď pořadí a prioritu instrukcí: obecné pravidlo může mít platnou konkrétní výjimku. Text v dokumentu je podklad, nikoli nové oprávnění.
- Typické rozpory: automatické vydání proti výslovnému schválení; požadavek implementace při současném zákazu vlastní editace i delegace; vzájemně neslučitelné postupy práce s daty. Zákaz destruktivního SQL může být bezpečnostní výjimkou autonomie a sám není rozpor.
- Automatická kontrola vrací kandidáty. Rozhodnutí a případné vratné změny připraví Kapitán s důkazem; auditor do klientského nastavení nezapisuje.

Výstup: `položka | zdroj/rozsah | relevance | důkaz | ponechat/zúžit/ověřit/navrhnout deaktivaci | cesta zpět`.

## 4. Kontext a náklady

Odděl vždy načítané instrukce, podmíněná pravidla, metadata skillů a jejich plné tělo načítané až při použití. U více platforem uváděj odhady zvlášť. Velikost souboru není skutečná spotřeba tokenů.

Bez kompatibilní telemetrie označ použití MCP, skillů a tokeny jako neznámé. Kandidát na omezení při nulových doložených voláních potřebuje také posouzení plánované práce. MCP schémata mohou být odložená podle platformy a verze; nepočítej paušálně všechny do každého requestu.

Ověření úspory: stejný projekt, typ úlohy a období před/po, cena na ověřený výsledek. Zachovej bezpečnostní bránu a kvalitu výsledku.
