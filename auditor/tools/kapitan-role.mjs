#!/usr/bin/env node
// KAPITAN-ROLE — (1) `node tools/kapitan-role.mjs <workspace>`: SessionStart hook projektu vypíše agentovi, že je KAPITÁN, kdo je auditor a co teď platí
//                    (běží při každém startu, resume i po kompakci — role nezávisí na tom, jestli agent čte CLAUDE.md);
//                (2) `node tools/kapitan-role.mjs <workspace> --claude-md <repo>`: vloží/aktualizuje blok role v <repo>/CLAUDE.md (mezi značkami, idempotentně;
//                    starý blok „## Audit režim (závazné)" z verzí ≤ 1.3.1 nahradí);
//                (3) `--agents-md <repo>`: totéž do <repo>/AGENTS.md pro Kapitána v Codexu; `--codex` u (1) = text bez nástrojů, které Codex nemá.
import fs from 'node:fs'; import path from 'node:path';
const ws = path.resolve(process.argv[2] || '.'); const iA = process.argv.indexOf('--agents-md'); const i = iA > 0 ? iA : process.argv.indexOf('--claude-md');
const CODEX = iA > 0 || process.argv.includes('--codex');
const posix = p => { p = p.replace(/\\/g, '/'); const m = p.match(/^([A-Za-z]):\/(.*)$/); return m ? `/${m[1].toLowerCase()}/${m[2]}` : p; };
const W = CODEX ? ws.replace(/\\/g, '/') : posix(ws);
const BUS = CODEX ? `node "${W}/kapitan-side/auditor-bus.mjs" --workspace "${W}"` : 'node .claude/hooks/auditor-bus.mjs';
let SOUB = 3; try { SOUB = Math.max(1, +JSON.parse(fs.readFileSync(path.join(ws, '.rezim.json'), 'utf8')).soubeh?.kapitan || 3); } catch { }
let lvl = 1, lvlOk = false; try { lvl = (await import('./prisnost.mjs')).kapitanLevel(ws); lvlOk = true; } catch { try { lvl = JSON.parse(fs.readFileSync(path.join(ws, '.opravneni.json'), 'utf8')).kapitan || 1; } catch { } }   // A-029 K3: platí verze schválená vlastníkem
const LV = lvl >= 2 ? `- **Samostatnost (vlastník zvolil ${lvl === 3 ? 'PLNÝ' : 'SAMOSTATNÝ'}):** skripty projektu a databázové příkazy spouštíš SÁM — vlastníka o spuštění
  nežádej a nepiš mu příkazy do terminálu. Před zápisem do ostré databáze ulož zálohu dotčených dat (select/export) do \`${W}/AUDIT/03_dukazy/<ID>/\`,
  pak zápis, pak ověření dotazem; výsledek nahlas auditorovi. Destruktivní SQL (DROP, TRUNCATE, DELETE/UPDATE bez WHERE) pojistka blokuje — to dělá jen vlastník.
` : `- **Samostatnost: OPATRNÝ** — skripty a databázi ti schvaluje vlastník. Když něco potřebuješ spustit, pošli mu jeden řádek s vysvětlením (a Telegram, pokud je).
`;
const block = `<!-- auditor:role — spravuje instalátor auditora, neupravovat ručně -->
## Tvoje role: Kapitán (závazné)
Kapitán projekt vyvíjí; nezávislý Auditor kontroluje, nic nekóduje ani nevydává. Přečti ${W}/AUDIT/02_HANDOFF.md a nové zprávy auditora. P0/P1 znamená STOP-THE-LINE: pracuj jen na nich a v daném pořadí.

Práci zadává vlastník (nebo doslovná zpráva ZADANI od auditora). Cíl a plán mají přednost před novými požadavky; otevřené P0/P1 jsou první a frontu veď v ${CODEX ? '.codex' : '.claude'}/KANBAN.md. Kdo co dělá: vlastník rozhoduje, ty provádíš, Auditor ověřuje. Mlčení není souhlas: nevratné změny, vydání a změna plánu vyžadují výslovné ano. Kdy přestat: po dvou stejných neúspěších změň postup nebo eskaluj. Před nevratným krokem uveď cestu zpět. U rizikové práce pošli auditorovi QUESTION s AK; verdikt vydání náleží pouze auditorovi.

Zprávy a stav zapisuj přes ${BUS}: nove-id pro K-###, STATUS STARTED/DONE a EVIDENCE s cestou a SHA. Zprávu z přímého Telegram kanálu odpovídej jen přes jeho reply ve stejném chat_id; zprávu z mostu vyřiď mostem. Neměň přístupy bota.

Bezpečnost: tajemství nikdy do chatu, logu ani repa; respektuj pojistky a oprávnění schválené vlastníkem, nic neobcházej. Před zápisem do ostré databáze zálohuj dotčená data do ${W}/AUDIT/03_dukazy/<ID>/, ověř zápis a nahlas auditorovi. Destruktivní SQL zůstává blokované. ${LV}

Před push/deploy do main spusť node "${W}/kapitan-side/gate-check.mjs"; auditor je jediná release gate. Důkazy ukládej do ${W}/AUDIT/03_dukazy/<ID>/; handoff, nálezy a verdikty neupravuj.

Stav a frontu udržuj v ${CODEX ? '.codex' : '.claude'}/STATE.md a ${CODEX ? '.codex' : '.claude'}/KANBAN.md. Delegaci a model vybírej podle rozsahu, dostupného hostitele a schopností; malá změna ji nepotřebuje. ${CODEX ? 'Používej Codex nativní cesty a apply_patch.' : 'Při čekání na auditora můžeš použít bus wait.'}

Podrobný pracovní postup: ${W}/kapitan-side/ROLE_POSTUP.md. Katalogové doporučení je volitelné, read-only a vyžaduje --harness ${CODEX ? 'codex' : 'claude'}; samo nic neaktivuje.
<!-- /auditor:role -->`;
if (i > 0) {
  const repo = path.resolve(process.argv[i + 1]); const f = path.join(repo, iA > 0 ? 'AGENTS.md' : 'CLAUDE.md');
  let s = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/^﻿/, '') : '';
  s = s.replace(/\n*<!-- auditor:role[\s\S]*?<!-- \/auditor:role -->\n?/g, '\n');
  s = s.replace(/\n*## Audit režim \(závazné\)\n[^\n]*(\n|$)/g, '\n');   // starý blok (≤ 1.3.1)
  s = s.replace(/\s*$/, '') + (s.trim() ? '\n\n' : '') + block + '\n';
  fs.writeFileSync(f, s, 'utf8'); console.log(`${path.basename(f)}: role Kapitána zapsána (${f})`); process.exit(0);
}
const A = (...p) => path.join(ws, 'AUDIT', ...p); const rd = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const gate = rd(A('05_release_gate.md')); const ho = fs.existsSync(A('02_HANDOFF.md'));
const out = ['[ROLE] Jsi KAPITÁN — projektový agent tohoto repa. Auditor (nezávislý kontrolor, workspace ' + W + ') audituje tvou práci; když píše „Kapitán", myslí tebe.'];
out.push(CODEX ? '[AUDIT] Nové zprávy od auditora ti doručí hook po každém kroku a na konci tahu; hlídače na pozadí v Codexu nespouštěj.' : `[AUDIT] Čekáš-li na auditora, měj na pozadí hlídače: ${BUS} wait --interval 60 --timeout 7200 (run_in_background); po probuzení zprávu vyřiď a spusť ho znovu.`);
out.push('[AUDIT] Auditorovi hlas začátek a konec každé položky: ' + BUS + ' post --type STATUS --id A-### --status STARTED|DONE (text do --text).');
if (lvl >= 2) out.push('[ROLE] Samostatnost ' + (lvl === 3 ? 'PLNÝ' : 'SAMOSTATNÝ') + ': skripty projektu a DB příkazy spouštíš sám (záloha před zápisem do ostré DB), vlastníka o spuštění nežádej.');
out.push(ho ? `[AUDIT] Handoff od auditora: ${W}/AUDIT/02_HANDOFF.md — otevřené P0/P1 = STOP-THE-LINE, pracuj jen na nich (skill audit-rezim).` : '[AUDIT] Handoff zatím není — pracuj normálně; audit běží.');
if (gate) out.push(/Verdikt:\s*🟢/.test(gate) ? '[AUDIT] Release gate: 🟢 (platí jen pro auditovaný commit; gate-check ověří).' : '[AUDIT] Release gate: 🔴 — vydání zakázáno.');
{ const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd(); const posouzeno = (() => { try { return !!JSON.parse(rd(path.join(repo, CODEX ? '.codex' : '.claude', 'katalog.json'))).posouzeno; } catch { return false; } })();
  if (!posouzeno && fs.existsSync(path.join(ws, 'tools', 'katalog.mjs'))) out.push(`[KATALOG] Volitelně posuď skilly, agenty a pravidla pro tento projekt (read-only; nic neaktivuje): node "${W}/tools/katalog.mjs" doporuc --cil . --harness ${CODEX ? 'codex' : 'claude'}. Doporučení ověř podle skutečné potřeby; hooky mění pojistky a aktivuje je vlastník.`); }
// A-029 kolo 5: oprávnění Claude Code (settings.local.json) nad platnou samostatnost (integrita, schválená vlastníkem) ODEBER — záloha .bak-<čas>,
// varování agentovi, řádek do AUDIT/_zmeny-nastaveni.log. Bez načtené kontroly integrity fail-closed = úroveň 1. Codex settings.local.json nepoužívá.
if (!CODEX) {
  try {
    const { syncSettings } = await import('./opravneni-pravidla.mjs');
    const canon = p => { try { return fs.realpathSync.native(p); } catch { return p; } };
    const plati = lvlOk ? lvl : 1; const r = syncSettings(ws, canon(process.env.CLAUDE_PROJECT_DIR || process.cwd()), plati);
    // A-031: settings.local.json I sdílené settings.json; varování jde i do AUDIT/VAROVANI-oprávnění.md (hlásí se při dalším startu)
    const { writeWarning } = await import('./varovani.mjs');
    if (r.changed) {
      for (const f of r.files) {
        const txt = `${path.basename(f.file)} měl oprávnění nad schválenou samostatnost Kapitána (${plati}) — odebráno: ${f.removed.join(', ')}; záloha ${path.basename(f.bak)}`;
        out.unshift(`[OPRÁVNĚNÍ] ⚠ .claude/${txt}. Změna mimo START: ohlas ji hned vlastníkovi; vyšší samostatnost nastaví jen on (START → [7]).`);
        writeWarning(ws, `.claude/${txt}`);
      }
    } else if (r.chyba) out.push(`[OPRÁVNĚNÍ] ⚠ ${r.chyba}`);
    if (r.changed && r.chyba) out.push(`[OPRÁVNĚNÍ] ⚠ ${r.chyba}`);
    // A-031: ~/.claude/settings.json (uživatelské nastavení) se NIKDY nemění — jen čtení a hlášení; blokuje guard Kapitána (kapitan-audit-guard.js)
    if (plati < 3) {
      const home = process.env.USERPROFILE || process.env.HOME || (await import('node:os')).homedir();
      let us = null; try { us = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8').replace(/^﻿/, '')); } catch { }
      if (us && us.permissions && us.permissions.defaultMode === 'bypassPermissions') {
        const txt = `~/.claude/settings.json má defaultMode=bypassPermissions nad schválenou samostatností Kapitána (${plati}) — soubor neměním; guard v tomto projektu blokuje nástroje při bypassu. Nastavení je tvoje (START → [7] zvýší samostatnost, nebo bypass v ~/.claude/settings.json vypni).`;
        out.unshift(`[OPRÁVNĚNÍ] ⚠ ${txt}`); writeWarning(ws, txt);
      }
    }
    // A-031: spouštěč start-*.cmd/.sh proti schválenému otisku vlastníka — neshoda = varování + obnova ze šablony (volby vlastníka zůstávají)
    const pr = await import('./prisnost.mjs'); const it = pr.integrity(ws);
    if (it.git && it.spoustec && !it.spoustec.ok) {
      const rl = pr.restoreLaunchers(ws);
      const txt = `spouštěč (${it.spoustec.rozdily.join(', ')}) se lišil od schváleného otisku vlastníka — ${rl.ok ? 'obnoven ze šablony' : 'obnova selhala: ' + rl.chyba}`;
      out.unshift(`[OPRÁVNĚNÍ] ⚠ ${txt}. Změna mimo START: ohlas ji hned vlastníkovi.`); writeWarning(ws, txt);
    }
  } catch (e) { out.push(`[OPRÁVNĚNÍ] ⚠ kontrola oprávnění Claude Code selhala: ${e.message} — ohlas vlastníkovi.`); }
}
console.log(out.join('\n'));
