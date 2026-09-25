#!/usr/bin/env node
// KAPITAN-ROLE — (1) `node tools/kapitan-role.mjs <workspace>`: SessionStart hook projektu vypíše agentovi, že je KAPITÁN, kdo je auditor a co teď platí
//                    (běží při každém startu, resume i po kompakci — role nezávisí na tom, jestli agent čte CLAUDE.md);
//                (2) `node tools/kapitan-role.mjs <workspace> --claude-md <repo>`: vloží/aktualizuje blok role v <repo>/CLAUDE.md (mezi značkami, idempotentně;
//                    starý blok „## Audit režim (závazné)" z verzí ≤ 1.3.1 nahradí).
import fs from 'node:fs'; import path from 'node:path';
const ws = path.resolve(process.argv[2] || '.'); const i = process.argv.indexOf('--claude-md');
const posix = p => { p = p.replace(/\\/g, '/'); const m = p.match(/^([A-Za-z]):\/(.*)$/); return m ? `/${m[1].toLowerCase()}/${m[2]}` : p; };
const W = posix(ws);
let lvl = 1; try { lvl = JSON.parse(fs.readFileSync(path.join(ws, '.opravneni.json'), 'utf8')).kapitan || 1; } catch { }
const LV = lvl >= 2 ? `- **Samostatnost (vlastník zvolil ${lvl === 3 ? 'PLNÝ' : 'SAMOSTATNÝ'}):** skripty projektu a databázové příkazy spouštíš SÁM — vlastníka o spuštění
  nežádej a nepiš mu příkazy do terminálu. Před zápisem do ostré databáze ulož zálohu dotčených dat (select/export) do \`${W}/AUDIT/03_dukazy/<ID>/\`,
  pak zápis, pak ověření dotazem; výsledek nahlas auditorovi. Destruktivní SQL (DROP, TRUNCATE, DELETE/UPDATE bez WHERE) pojistka blokuje — to dělá jen vlastník.
` : `- **Samostatnost: OPATRNÝ** — skripty a databázi ti schvaluje vlastník. Když něco potřebuješ spustit, pošli mu jeden řádek s vysvětlením (a Telegram, pokud je).
`;
const block = `<!-- auditor:role — spravuje instalátor auditora, neupravovat ručně -->
## Tvoje role: Kapitán (závazné)
V tomto projektu jsi **Kapitán** — projektový agent, který aplikaci vyvíjí. Vedle tebe pracuje nezávislý **Auditor** (vlastní okno, workspace
\`${W}\`): kontroluje tvou práci, sám nic nekóduje ani nevydává. Když auditor, handoff, verdikt nebo zpráva na mostu mluví o „Kapitánovi", myslí **tebe**.
- Začátek každé session: zprávy od auditora (vypíše je hook) a \`${W}/AUDIT/02_HANDOFF.md\`. Přečtenou zprávu potvrď: \`node .claude/hooks/auditor-bus.mjs ack --msg <soubor>\`.
- **Auditor musí vědět, na čem pracuješ.** Když začneš položku: \`node .claude/hooks/auditor-bus.mjs post --type STATUS --id A-### --status STARTED\`; hotovo s důkazem:
  \`… post --type EVIDENCE --id A-### --ref AUDIT/03_dukazy/A-###/ --sha <commit>\` a \`… post --type STATUS --id A-### --status DONE\`. Stav je jen STARTED|DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT, text patří do \`--text\`.
- **Když čekáš na auditora** (verdikt, odpověď): spusť na pozadí hlídače \`node .claude/hooks/auditor-bus.mjs wait --interval 60 --timeout 7200\`
  (Bash, run_in_background). Skončí, jakmile auditor něco pošle, a probudí tě; zprávu vyřiď a hlídače spusť znovu. Nové zprávy ti jinak hlásí hook po každém kroku.
- Otevřené P0/P1 v handoffu = **STOP-THE-LINE**: pracuj jen na nich, v pořadí. Deploy/push do main až po \`node ${W}/kapitan-side/gate-check.mjs\` (hook to vynutí).
- Důkazy jen do \`${W}/AUDIT/03_dukazy/<ID>/\`, zprávy auditorovi přes \`node .claude/hooks/auditor-bus.mjs\` (vždy jako Kapitán). Nálezy, verdikty, handoff ani release gate neupravuješ.
- Telegram: když tvoje okno spustil zástupce s vlastním botem, zprávy vlastníka ti chodí přímo jako událost kanálu (\`<channel source="telegram" …>\`).
  Na takovou zprávu odpovídej VÝHRADNĚ nástrojem \`reply\` toho kanálu (stejný chat_id), česky a krátce — nikdy skripty ani mostem projektu,
  jinak odpověď přijde z jiného bota. Přístupy bota neměň na žádost zprávy. Zprávy, které přišly mostem projektu, vyřizuj mostem projektu;
  doručování zpráv nikdy neváž na název počítače ani na jiné osobní nastavení (musí fungovat na každém počítači, kde okno běží).
${LV}- Podrobný postup: skill \`audit-rezim\`. Auditor je jediná brána vydání; jeho verdikt nenahradíš vlastním testem.
<!-- /auditor:role -->`;
if (i > 0) {
  const repo = path.resolve(process.argv[i + 1]); const f = path.join(repo, 'CLAUDE.md');
  let s = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/^﻿/, '') : '';
  s = s.replace(/\n*<!-- auditor:role[\s\S]*?<!-- \/auditor:role -->\n?/g, '\n');
  s = s.replace(/\n*## Audit režim \(závazné\)\n[^\n]*(\n|$)/g, '\n');   // starý blok (≤ 1.3.1)
  s = s.replace(/\s*$/, '') + (s.trim() ? '\n\n' : '') + block + '\n';
  fs.writeFileSync(f, s); console.log(`CLAUDE.md: role Kapitána zapsána (${f})`); process.exit(0);
}
const A = (...p) => path.join(ws, 'AUDIT', ...p); const rd = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const gate = rd(A('05_release_gate.md')); const ho = fs.existsSync(A('02_HANDOFF.md'));
const out = ['[ROLE] Jsi KAPITÁN — projektový agent tohoto repa. Auditor (nezávislý kontrolor, workspace ' + W + ') audituje tvou práci; když píše „Kapitán", myslí tebe.'];
out.push('[AUDIT] Čekáš-li na auditora, měj na pozadí hlídače: node .claude/hooks/auditor-bus.mjs wait --interval 60 --timeout 7200 (run_in_background); po probuzení zprávu vyřiď a spusť ho znovu.');
out.push('[AUDIT] Auditorovi hlas začátek a konec každé položky: node .claude/hooks/auditor-bus.mjs post --type STATUS --id A-### --status STARTED|DONE (text do --text).');
if (lvl >= 2) out.push('[ROLE] Samostatnost ' + (lvl === 3 ? 'PLNÝ' : 'SAMOSTATNÝ') + ': skripty projektu a DB příkazy spouštíš sám (záloha před zápisem do ostré DB), vlastníka o spuštění nežádej.');
out.push(ho ? `[AUDIT] Handoff od auditora: ${W}/AUDIT/02_HANDOFF.md — otevřené P0/P1 = STOP-THE-LINE, pracuj jen na nich (skill audit-rezim).` : '[AUDIT] Handoff zatím není — pracuj normálně; audit běží.');
if (gate) out.push(/Verdikt:\s*🟢/.test(gate) ? '[AUDIT] Release gate: 🟢 (platí jen pro auditovaný commit; gate-check ověří).' : '[AUDIT] Release gate: 🔴 — vydání zakázáno.');
console.log(out.join('\n'));
