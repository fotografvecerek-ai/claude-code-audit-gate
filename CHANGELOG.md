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
