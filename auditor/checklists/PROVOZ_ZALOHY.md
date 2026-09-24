# Checklist PROVOZ, ZÁLOHY, LICENCE — obnovitelnost, ne existence zálohy

KinoXT3 §3: „existence ZIPu není obnovitelnost", „health 200 není readiness". Auditor ověřuje **celý řetězec**, ne artefakt.

## 1. Zálohy a obnova (P0 u dat zákazníků)
- [ ] **Inventura autoritativních zdrojů dat**: DB (všechny schémata/tabulky vč. druhé DB), soubory v R2/Storage, konfigurace tenantů, tajemství, e-mailové šablony, číselníky v JSON. Záloha pokrývá 100 % seznamu (plošné AK), ne „hlavní DB".
- [ ] Frekvence a retence odpovídají RPO/RTO, které vlastník řekl v intake (nebo `[NEZNÁMO]` → otázka).
- [ ] **Izolovaný restore test** (v testovacím projektu/DB, nikdy do produkce): obnov poslední zálohu → ověř schéma + povinná data + reálný uživatelský scénář (login, otevřít nabídku, PDF). Datum posledního doloženého testu = důkaz; bez něj 🔴.
- [ ] Sentinel test obnovy pokrývá reprezentativní vzorek napříč tabulkami, ne 3 vybrané hodnoty; prázdné/částečné úložiště selže hlasitě.
- [ ] Zálohy šifrované, mimo primární účet/oblast, přístup omezen; obnova nezávislá na tom, kdo ji vytvořil.
- [ ] Vercel/Supabase: PITR zapnuto? Rollback aplikace = předchozí immutable deployment (`vercel rollback`) — doložit, že byl někdy vyzkoušen.

## 2. Readiness, monitoring, incidenty
- [ ] Liveness (200) ≠ readiness: readiness ověřuje DB, storage, auth provider, migrace aplikované.
- [ ] Chybové alerty existují (Sentry/log alerts) a někam chodí (Telegram bot Kapitána?); test: vyvolej chybu v testu → alert dorazil.
- [ ] Runbook: obnova ze zálohy, rotace tajemství, rollback deploye, kontakt na poskytovatele — existuje a je aktuální (datum).
- [ ] Prostředí: dev/staging/prod oddělené účty a klíče; produkční klíč v `.env.local` vývojáře = 🔴.
- [ ] Rotace tajemství: poslední datum; klíče v gitu kdykoliv v historii → rotovat, ne jen smazat.

## 3. Závislosti a licence
- [ ] `npx license-checker --summary` (ověř nástroj) / `pnpm licenses list`: žádné GPL/AGPL/SSPL v distribuovaném klientském kódu bez rozhodnutí vlastníka; neznámé licence = seznam.
- [ ] Datové zdroje: licence a share-alike podmínky (ODbL trap — OSM v cestovní aplikaci; CC BY-4.0 atribuce u Ortofoto ČR) doloženy v `docs/LICENCE_DAT.md`.
- [ ] Fonty, ikony, obrázky v `public/`: původ a licence známá; cizí fotografie/performeři (KinoXT3) = původ a souhlas.
- [ ] Marketingový text vs. realita: „šifrováno", „zálohováno", „GDPR compliant" v UI/webu odpovídá doloženému stavu (KATALOG §3, §7).

## 4. Dokumentace vs. realita
- [ ] README/CLAUDE.md popisuje skutečný stack, příkazy a strukturu (spusť každý uvedený příkaz → funguje?).
- [ ] Deploy sekvence v dokumentaci = deploy sekvence ve skriptu = to, co Kapitán opravdu dělá (tři zdroje pravdy = SSOT nález).

## Výstup
JSON `{id, oblast: zaloha|readiness|alerting|runbook|prostredi|licence|dokumentace, pozorovani, dukaz, priorita, navrh_reseni, cerveny_test, co_neproverovano}`.
