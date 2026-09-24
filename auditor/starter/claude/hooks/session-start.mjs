#!/usr/bin/env node
// SESSION-START — krátký stav projektu na začátku každé session (výstup jde agentovi do kontextu; drž ho do 8 řádků).
// Hlídá: nevyplněné zadání → /zacatek; otevřené P0/P1 → STOP-THE-LINE; dlouho bez nezávislé kontroly → /kontrola; nezálohovaná práce.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const git = a => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const root = git(['rev-parse', '--show-toplevel']) || process.cwd(); const P = (...p) => path.join(root, ...p);
const out = ['[STAV PROJEKTU]'];
const zad = fs.existsSync(P('docs', 'ZADANI.md')) ? fs.readFileSync(P('docs', 'ZADANI.md'), 'utf8') : '';
if (!zad || /\(vyplní se při \/zacatek\)/.test(zad)) out.push('Zadání projektu ještě není sepsané → první věc: /zacatek (rozhovor s vlastníkem, volba technologie, první testy).');
const nal = fs.existsSync(P('docs', 'kontrola', 'NALEZY.md')) ? fs.readFileSync(P('docs', 'kontrola', 'NALEZY.md'), 'utf8').split(/\r?\n/) : [];
const openHi = nal.filter(l => /^\s*\|/.test(l) && /\|\s*P[01]\s*\|/.test(l) && /\|\s*(otevřen|otevren|open)/i.test(l)).length; const openAll = nal.filter(l => /^\s*\|/.test(l) && /\|\s*P[0-3]\s*\|/.test(l) && /\|\s*(otevřen|otevren|open)/i.test(l)).length;
if (openHi) out.push(`STOP-THE-LINE: ${openHi} otevřených nálezů P0/P1 v docs/kontrola/NALEZY.md — nejdřív je oprav (v pořadí), jiná práce počká.`);
else if (openAll) out.push(`Otevřené nálezy kontrolora (P2/P3): ${openAll} — zařaď je, až bude chvíle.`);
const last = fs.existsSync(P('docs', 'kontrola')) ? fs.readdirSync(P('docs', 'kontrola')).filter(f => /^\d{4}-\d{2}-\d{2}.*\.md$/.test(f)).sort().pop() : null;
const since = last ? +git(['rev-list', '--count', `--since=${last.slice(0, 10)}`, 'HEAD']) || 0 : +git(['rev-list', '--count', 'HEAD']) || 0;
const days = last ? Math.floor((Date.now() - Date.parse(last.slice(0, 10))) / 864e5) : null;
if (zad && !/\(vyplní se při \/zacatek\)/.test(zad) && (!last ? since >= 10 : (days >= 7 || since >= 30))) out.push(`Nezávislá kontrola: ${last ? `naposledy před ${days} dny, od té doby ${since} commitů` : `ještě neproběhla (${since} commitů)`} → navrhni vlastníkovi /kontrola.`);
let aud = null; try { aud = JSON.parse(fs.readFileSync(P('.claude', 'hooks', 'auditor.json'), 'utf8')).workspace; } catch { }
if (aud && fs.existsSync(aud)) { const A = (...p) => path.join(aud, 'AUDIT', ...p); const gate = fs.existsSync(A('05_release_gate.md')) ? fs.readFileSync(A('05_release_gate.md'), 'utf8') : '';
  if (/Verdikt:\s*🔴/.test(gate)) out.push(`STOP-THE-LINE (auditor): vydání zastaveno — oprav položky P0/P1 z ${A('02_HANDOFF.md')} v pořadí; pak vlastníkovi: „Napiš auditorovi: zkontroluj opravy".`);
  else if (fs.existsSync(A('02_HANDOFF.md'))) out.push(`Auditor: handoff ${A('02_HANDOFF.md')} — otevřené položky mají přednost před novou prací.`);
  const lastA = ['ZPRAVA.md', '00_prvni_dojem.md', '05_release_gate.md'].map(f => A(f)).filter(fs.existsSync).map(f => fs.statSync(f).mtimeMs).sort().pop();
  const aDays = lastA ? Math.floor((Date.now() - lastA) / 864e5) : null; const nComm = +git(['rev-list', '--count', 'HEAD']) || 0;
  if ((lastA ? aDays >= 30 : nComm >= 40) && zad && !/\(vyplní se při \/zacatek\)/.test(zad)) out.push(`Samostatný auditor: ${lastA ? `naposledy před ${aDays} dny` : 'ještě neauditoval'} → navrhni vlastníkovi spustit ho (zástupce „Auditor - …" na ploše), hlavně před větším vydáním.`); }
const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean).length; const ahead = git(['rev-list', '--count', '@{u}..HEAD']); const hasRemote = !!git(['remote']);
if (!hasRemote) out.push('Záloha: projekt nemá vzdálené repo (GitHub) — práce je jen na tomto disku. Navrhni vlastníkovi zálohu.');
else if (+ahead > 0) out.push(`Záloha: ${ahead} commitů není na GitHubu — pushni svou větev.`);
if (dirty > 20) out.push(`Rozdělaná práce: ${dirty} neuložených souborů — ulož (commit) po logických krocích.`);
if (out.length === 1) out.push('V pořádku: žádné otevřené P0/P1, kontrola aktuální, práce zálohovaná.');
console.log(out.join('\n'));
