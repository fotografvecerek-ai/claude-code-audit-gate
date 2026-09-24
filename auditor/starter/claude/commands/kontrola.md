---
description: Nezávislá plná kontrola projektu subagentem kontrolor (náhrada auditora)
---
Spusť subagenta **kontrolor** v režimu A (plná kontrola). V zadání mu dej jen: „Režim A, plná kontrola od commitu <hash poslední kontroly
nebo 'začátek'>." Nepopisuj mu, co je hotové nebo v pořádku — to má zjistit sám.
Po návratu:
1. Commitni `docs/kontrola/` (jen tuto složku) zprávou „kontrola: <datum>".
2. Jsou otevřené P0/P1 → STOP-THE-LINE: oznam vlastníkovi jednou větou a začni opravovat v pořadí (každá oprava: test červený → oprava →
   kontrolor režim B → teprve pak další).
3. Otevři vlastníkovi `docs/kontrola/ZPRAVA.html` (Windows `start "" <cesta>`, mac `open`, Linux `xdg-open`) a napiš jednu větu.
