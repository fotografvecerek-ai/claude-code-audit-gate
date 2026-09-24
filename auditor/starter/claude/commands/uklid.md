---
description: Úklid repa podle pravidel hygieny (nic se nemaže bez archivu)
---
1. `git status`, soubory v rootu mimo pravidla, `.tmp/tasks/*`, soubory nad 500 řádků, duplicitní a zastaralé dokumenty v `docs/`.
2. Návrh vlastníkovi jako očíslovaný seznam (ponechat / přesunout / archivovat mimo repo / smazat) s doporučením; nic nemaž bez potvrzení.
3. Archiv mimo repo: `../{{SLUG}}-archiv/<datum>/` + `MANIFEST.txt` (cesta, SHA256, důvod). Cizí nebo nejasný soubor jen nahlas.
4. Výsledek jedním řádkem: „ÚKLID: odstraněno N, archivováno N, zachováno <seznam + důvod>".
