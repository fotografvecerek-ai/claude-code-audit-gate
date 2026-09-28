#!/usr/bin/env node
// BUS — komunikační most Auditor ↔ Kapitán. Jeden soubor = jedna zpráva (žádné merge konflikty), git = transport mezi stroji.
// Adresář: <workspace-auditora>/AUDIT/bus/<ts>_<from>_<type>_<id>.json  ·  ledger: AUDIT/bus/LEDGER.md (generovaný pohled)
//
//   node tools/bus.mjs post --from auditor --type HANDOFF --id A-012 --ref AUDIT/02_HANDOFF.md --text "P0 tenant izolace, 6 položek"
//   node tools/bus.mjs post --from auditor --type VERDICT --id A-012 --verdict FAIL --reply-to <soubor EVIDENCE> --text "K2: brána 3 …"
//   Každá zpráva má msgId (= název souboru), replyTo (vazba na zprávu, na kterou reaguje) a u VERDICT automaticky round (K1, K2, …).
//   stage (stavový řetězec položky, počítá bus.mjs status): zapsano → doruceno → implementovano → nezavisle_overeno → schvaleno → aplikovano → aktivni → zmereno
//   node tools/bus.mjs inbox --for kapitan [--since 2026-09-24] [--unacked]      # co je nového pro roli
//   node tools/bus.mjs ack --by kapitan --msg <soubor-zprávy>                      # potvrzení přečtení
//   node tools/bus.mjs thread --id A-012                                            # celá historie položky
//   node tools/bus.mjs status                                                       # stav všech položek (poslední typ zprávy per ID)
//   node tools/bus.mjs metrics [--since 30d]                                        # chování Kapitána: iterace, falešné DONE, doba do PASS
//   node tools/bus.mjs wait --for auditor [--interval 120] [--timeout 7200]         # čeká na novou zprávu (git pull v intervalu)
//   node tools/bus.mjs sync                                                         # git pull --rebase && add AUDIT && commit && push (jen workspace)
//
// Typy: HANDOFF (auditor→kapitan) · EVIDENCE (kapitan→auditor, ref 03_dukazy/<id>/) · VERDICT (auditor→kapitan, PASS|SCOPED_PASS|FAIL|NEPRUKAZNE)
//       SCOPED_PASS = prošel jen jmenovaný rozsah (--scope "…") a zároveň je otevřen nový blok — položka NENÍ uzavřená.
//       APPLIED (kapitan: změna nasazena/aktivní, --ref commit/deploy id) · MEASURED (auditor: změřeno po vydání)
//       QUESTION / ANSWER · STATUS (kapitan: DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT|STARTED) · GATE (auditor: 🟢|🔴) · NOTE
//       ZADANI (auditor|owner → kapitan): úloha vlastníka předaná DOSLOVA (--citace "…"); auditor k ní nesmí nic přidat (--text zakázán), ID K-### samo.
// Role: vlastník rozhoduje, Kapitán dělá, auditor ověřuje. Auditor zadává Kapitánovi JEN nálezy auditu: HANDOFF od auditora musí mít ID
//       nálezu (AUDIT/01_nalezy/<ID>.md nebo ID v AUDIT/02_HANDOFF.md) — novou práci auditor vymýšlet ani zadávat nemůže.
//   node tools/bus.mjs nove-id [--prefix K]                                         # další volné ID úlohy vlastníka (K-001, K-002…)
// Vlastnictví: zprávy s from=auditor smí psát jen auditor, from=kapitan jen Kapitán — hlídají hooky obou stran (auditor-guard.js, kapitan-audit-guard.js).
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';

const ROOT = process.env.AUDITOR_WORKSPACE && fs.existsSync(process.env.AUDITOR_WORKSPACE) ? process.env.AUDITOR_WORKSPACE : findRoot(process.cwd());
const BUS = path.join(ROOT, 'AUDIT', 'bus'); fs.mkdirSync(BUS, { recursive: true });
const args = parse(process.argv.slice(2)); const cmd = args._[0];
const ROLES = ['auditor', 'kapitan', 'owner']; const TYPES = ['HANDOFF', 'EVIDENCE', 'VERDICT', 'QUESTION', 'ANSWER', 'STATUS', 'GATE', 'NOTE', 'APPLIED', 'MEASURED', 'ZADANI'];
const STAGES = ['zapsano', 'doruceno', 'implementovano', 'nezavisle_overeno', 'schvaleno', 'aplikovano', 'aktivni', 'zmereno'];

function findRoot(d) { for (let i = 0; i < 6; i++) { if (fs.existsSync(path.join(d, 'AUDIT'))) return d; const p = path.dirname(d); if (p === d) break; d = p; } return process.cwd(); }
function parse(a) { const o = { _: [] }; for (let i = 0; i < a.length; i++) { if (a[i].startsWith('--')) { const k = a[i].slice(2); const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; o[k] = v; } else o._.push(a[i]); } return o; }

// A-010 kolo 2: pomocné funkce pro bezpečný zámek + atomický zápis přes reálné (i Windows) přechodné chyby.
// sleepMs = synchronní spánek (žádný busy-loop). withRetry = obal na EPERM/EBUSY/EACCES (antivir/otevřený handle drží
// soubor na zlomek sekundy) — zkusí to znovu s narůstajícím backoffem místo okamžitého pádu na exit 1.
function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
const TRANSIENT_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
function withRetry(fn, { tries = 25, baseMs = 8, retryable = e => TRANSIENT_CODES.has(e.code) } = {}) {
  for (let i = 1; ; i++) {
    try { return fn(); }
    catch (e) { if (i >= tries || !retryable(e)) throw e; sleepMs(Math.min(baseMs * i, 200) + Math.floor(Math.random() * baseMs)); }
  }
}
function statOrNull(p) { try { return fs.statSync(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
// Testovatelnost bez čekání na produkční 10s/60s výchozí hodnoty (viz selftest.mjs A-010 kolo2).
const LOCK_STALE_MS = +(process.env.AUDITOR_BUS_STALE_MS || 10000);
const LOCK_TIMEOUT_MS = +(process.env.AUDITOR_BUS_LOCK_TIMEOUT_MS || 60000);

// Bezpečné odstranění starého (stale) zámku. Přejmenování na unikátní jméno je na daném svazku atomické — vyhraje
// ho vždy jen JEDEN souběžící proces (ostatní dostanou ENOENT, protože zámek už přejmenoval někdo jiný, nebo ho
// mezitím normálně uvolnil jeho vlastník), takže smazán je vždy nanejvýš jednou. Funguje i pro adresář místo
// souboru (A-010 kolo2 bod 4: zámek-jako-adresář dřív = věčná smyčka), protože rmSync níž je rekurzivní.
function claimStaleLock(lockPath) {
  const grave = `${lockPath}.stale-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { withRetry(() => fs.renameSync(lockPath, grave)); }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  try { withRetry(() => fs.rmSync(grave, { recursive: true, force: true })); } catch { }
  return true;
}
// Čtenář nesmí zprávu tiše ztratit jen kvůli přechodné kolizi se souběžným zápisem (Windows EPERM/EBUSY při
// rename přes otevřený handle) — pár rychlých pokusů, teprve pak vzdát a nahlásit (ne tiše zahodit).
function readMsg(f) {
  try { return withRetry(() => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(BUS, f), 'utf8')) }), { tries: 15, baseMs: 8, retryable: e => TRANSIENT_CODES.has(e.code) || e.code === 'ENOENT' }); }
  catch (e) { if (e.code !== 'ENOENT') console.error(`bus: přeskakuji nečitelnou zprávu ${f}: ${e.message}`); return null; }
}
function all() { return fs.readdirSync(BUS).filter(f => f.endsWith('.json')).sort().map(readMsg).filter(r => r && typeof r.ts === 'string' && r.ts); }   // záznam bez ts (ruční/poškozený) by shodil ack/ledger
function sinceTs(s) { if (!s) return 0; const m = String(s).match(/^(\d+)d$/); return m ? Date.now() - m[1] * 864e5 : Date.parse(s); }
function git(c) { try { return execSync(`git ${c}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (e) { return `ERR: ${String(e.stderr || e.message).trim().split('\n')[0]}`; } }
function ledger() {
  const ledgerPath = path.join(BUS, 'LEDGER.md');
  // vlastní zámek (souběžné post/ack ho regenerují zároveň) — jen tenhle soubor, ne zprávy samotné
  withLock(ledgerPath, () => {
    const rows = all(); const lines = ['# BUS ledger (generováno bus.mjs — needitovat)', '', '| čas | od | typ | ID | text | ref | ack |', '|---|---|---|---|---|---|---|'];
    for (const r of rows.slice(-200)) lines.push(`| ${r.ts.slice(0, 16)} | ${r.from} | ${r.type} | ${r.id || ''} | ${(r.text || '').replace(/\|/g, '/').slice(0, 80)} | ${r.ref || ''} | ${(r.ack || []).map(a => a.by).join(',')} |`);
    atomicWrite(ledgerPath, lines.join('\n') + '\n');
  });
}
const out = o => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2));

function nextId(pre) { const n = all().map(r => String(r.id || '')).map(i => (i.match(new RegExp(`^${pre}-(\\d+)$`)) || [])[1]).filter(Boolean).map(Number); return `${pre}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`; }

// A-010 kolo 1: souběžné `ack` (50 agentů potvrzuje tutéž zprávu naráz) dělaly read-modify-write bez zámku → ztracená potvrzení.
// A-010 kolo 2 (verdikt FAIL, viz AUDIT/04_verdikty/A-010.md): kolo-1 zámek měl vlastní race — stat() na zámek, co mezitím
// zmizel (ENOENT), vracel Infinity → "starší než staleMs" → smazal cizí PRÁVĚ vzniklý zámek → dva procesy naráz v kritické
// sekci → tichá ztráta. Oprava: ENOENT NIKDY neznamená "smazat", jen "zkusit znovu získat"; mazání jen po úspěšném statu
// A opravdovém stáří, vždy atomicky (claimStaleLock = rename na unikátní jméno, pak unlink/rmSync — nikdy přímý unlink
// zámku, který třeba mezitím patří někomu jinému); vlastnický token v obsahu zámku ověřený před uvolněním, aby proces
// nikdy nesmazal zámek, který mu už nepatří (i po legitimním "ukradení" starého zámku někým jiným); rename/open s retry
// na EPERM/EBUSY/EACCES (Windows, otevřený handle); a horní časová mez, aby zámek-jako-adresář nezpůsobil věčnou smyčku.
function withLock(file, fn, { staleMs = LOCK_STALE_MS, timeoutMs = LOCK_TIMEOUT_MS } = {}) {
  const lock = `${file}.lock`;
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + timeoutMs;
  let owned = false;
  for (; ;) {
    try { withRetry(() => fs.writeFileSync(lock, token, { flag: 'wx' })); owned = true; break; }
    catch (e) {
      if (e.code !== 'EEXIST' && e.code !== 'EISDIR') throw e;   // EISDIR: zámek je omylem adresář (dřívější pád/bug) — řeš jako "existuje", ne fatálně
      const st = statOrNull(lock);   // st === null → zámek MEZITÍM zmizel (ENOENT) → nikdy nemazat, jen zkusit znovu (tohle byla přesně chyba kola 1)
      if (st && (Date.now() - st.mtimeMs) > staleMs) { claimStaleLock(lock); continue; }
      if (Date.now() > deadline) throw new Error(`bus: zámek ${path.basename(lock)} se nepodařilo získat do ${timeoutMs}ms (drží ho jiný proces, nebo je poškozený)`);
      sleepMs(10 + Math.floor(Math.random() * 20));   // krátký backoff, ne busy-loop
    }
  }
  try { return fn(); }
  finally {
    if (owned) { try { if (fs.readFileSync(lock, 'utf8') === token) withRetry(() => fs.unlinkSync(lock)); } catch { } }   // smaž jen VLASTNÍ zámek (token) — nikdy cizí
  }
}
function atomicWrite(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let tmpLeft = false;
  try { withRetry(() => fs.writeFileSync(tmp, data)); tmpLeft = true; withRetry(() => fs.renameSync(tmp, file)); tmpLeft = false; }
  finally { if (tmpLeft) { try { fs.unlinkSync(tmp); } catch { } } }   // úklid .tmp i při pádu na EPERM po vyčerpání retry (dřív zůstával ležet)
}

switch (cmd) {
  case 'post': {
    const { from, type, id = '-', ref = '', text = '' } = args; const verdict = args.verdict, status = args.status;
    if (!ROLES.includes(from)) die(`--from musí být ${ROLES.join('|')}`); if (!TYPES.includes(type)) die(`--type musí být ${TYPES.join('|')}`);
    if (type === 'VERDICT' && !['PASS', 'SCOPED_PASS', 'FAIL', 'NEPRUKAZNE'].includes(verdict)) die('VERDICT vyžaduje --verdict PASS|SCOPED_PASS|FAIL|NEPRUKAZNE');
    if (verdict === 'SCOPED_PASS' && !args.scope) die('SCOPED_PASS vyžaduje --scope "co přesně prošlo" (a text s novým blokem)');
    if (args['reply-to'] && !fs.existsSync(path.join(BUS, path.basename(args['reply-to'])))) die('--reply-to: zpráva nenalezena');
    const round = type === 'VERDICT' ? 'K' + (all().filter(r => r.id === id && r.type === 'VERDICT').length + 1) : undefined;
    if (type === 'STATUS' && !['STARTED', 'DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'].includes(status)) die('STATUS vyžaduje --status STARTED|DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT');
    if (type === 'HANDOFF' && from === 'auditor') { const A = path.join(ROOT, 'AUDIT'); let ho = ''; try { ho = fs.readFileSync(path.join(A, '02_HANDOFF.md'), 'utf8'); } catch { }
      const esc = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!id || id === '-' || !(fs.existsSync(path.join(A, '01_nalezy', `${id}.md`)) || new RegExp(`(^|[^\\w-])${esc}(?![\\w-])`).test(ho))) die(`HANDOFF od auditora jen pro nález auditu: ${id} není v AUDIT/01_nalezy/${id}.md ani v 02_HANDOFF.md. Novou práci zadává vlastník Kapitánovi — auditor ověřuje (úlohu vlastníka předej doslova: --type ZADANI --citace "…").`); }
    if (type === 'ZADANI') {
      if (from === 'kapitan') die('ZADANI posílá vlastník (nebo auditor jako doslovné předání vlastníkovy úlohy) — Kapitán úlohu přijímá: STATUS --id K-### --status STARTED');
      if (!args.citace || !String(args.citace).trim()) die('ZADANI vyžaduje --citace "přesná slova vlastníka" (auditor úlohu jen předává, nenavrhuje)');
      if (from === 'auditor' && String(text).trim()) die('ZADANI od auditora nesmí mít --text: auditor k úloze vlastníka nic nepřidává (návrh, postup, AK dělá Kapitán; auditor pak ověřuje)');
    }
    if (type === 'EVIDENCE' && (!ref || !args.sha)) die('EVIDENCE vyžaduje --ref AUDIT/03_dukazy/<id>/ A --sha <commit repa> (bez nich auditor neověřuje)');
    const ts = new Date().toISOString(); const to = type === 'ZADANI' ? 'kapitan' : from === 'auditor' ? 'kapitan' : from === 'kapitan' ? 'auditor' : 'both';
    const idF = type === 'ZADANI' && !/^K-\d+$/.test(id) ? nextId('K') : id;
    // souběžné posty se stejnou milisekundou+from+type+id (stejný název souboru) se nikdy nesmí přepsat — wx (exclusive
    // create) + při kolizi odlišující sufix a zkusit znovu, dokud nenajdeme volné jméno.
    let file, msg;
    for (let n = 0; ; n++) {
      file = `${ts.replace(/[:.]/g, '-')}_${from}_${type}_${idF}${n ? `-${n}` : ''}.json`;
      msg = { msgId: file, ts, from, to, type, id: idF, ref, text, ...(args.citace ? { citace: String(args.citace) } : {}), ...(verdict ? { verdict } : {}), ...(args.scope ? { scope: args.scope } : {}), ...(round ? { round } : {}), ...(status ? { status } : {}), replyTo: args['reply-to'] ? path.basename(args['reply-to']) : null, sha: args.sha || null, commit: git('rev-parse --short HEAD'), ack: [] };
      try { withRetry(() => fs.writeFileSync(path.join(BUS, file), JSON.stringify(msg, null, 2) + '\n', { flag: 'wx' })); break; }
      catch (e) { if (e.code !== 'EEXIST' || n > 1000) throw e; }
    }
    // zpráva už je trvale zapsaná — selhání pomocného ledgeru (např. vyčerpaný retry na EPERM) NESMÍ vrátit exit 1:
    // agent by si to vyložil jako "post se nepovedl" a poslal duplicitní zprávu (A-010 kolo2 bod 3)
    try { ledger(); } catch (e) { console.error(`bus: LEDGER.md se nepodařilo aktualizovat (zpráva ${file} je zapsaná): ${e.message}`); }
    out({ posted: file, msg }); break;
  }
  case 'nove-id': { out(nextId(args.prefix || 'K')); break; }
  case 'inbox': {
    const role = args.for; if (!ROLES.includes(role)) die('--for auditor|kapitan|owner');
    const since = sinceTs(args.since); const limit = +(args.limit || (args.brief ? 15 : 100));
    let rows = all().filter(r => (r.to === role || r.to === 'both') && Date.parse(r.ts) >= since && (!args.unacked || !(r.ack || []).some(a => a.by === role)));
    const total = rows.length; rows = rows.slice(-limit);
    if (args.brief && total > limit) console.log(`(${total - limit} starších zpráv skryto — bus.mjs inbox --for ${role} --limit ${total})`);
    out(args.brief ? rows.map(r => `${r.ts.slice(0, 16)} ${r.from}→${role} ${r.type} ${r.id} ${r.verdict || r.status || ''} ${r.text.slice(0, 90)} ${r.ref ? '→ ' + r.ref : ''}`).join('\n') || '(inbox prázdný)' : rows); break;
  }
  case 'ack': { const p = path.join(BUS, path.basename(args.msg || '')); if (!fs.existsSync(p)) die('zpráva nenalezena');
    withLock(p, () => { const m = JSON.parse(withRetry(() => fs.readFileSync(p, 'utf8'))); (m.ack ||= []).push({ by: args.by, ts: new Date().toISOString() }); atomicWrite(p, JSON.stringify(m, null, 2) + '\n'); });
    // potvrzení už je trvale zapsané v samotné zprávě — ledger je jen pomocný přehled, jeho selhání ack nesmí shodit
    try { ledger(); } catch (e) { console.error(`bus: LEDGER.md se nepodařilo aktualizovat (ack pro ${path.basename(p)} je zapsané): ${e.message}`); }
    out({ acked: p }); break; }
  case 'thread': out(all().filter(r => r.id === args.id)); break;
  case 'status': {
    const last = {}, rowsBy = {}; for (const r of all()) if (r.id && r.id !== '-') { (rowsBy[r.id] ||= []).push(r); last[r.id] = { ts: r.ts, from: r.from, type: r.type, verdict: r.verdict, status: r.status, round: r.round, ref: r.ref }; }
    for (const [id, rows] of Object.entries(rowsBy)) {
      const has = (t, f) => rows.some(r => r.type === t && (!f || f(r)));
      let stage = 'zapsano';
      if (has('HANDOFF', r => (r.ack || []).length) || rows.some(r => r.from === 'kapitan')) stage = 'doruceno';
      if (has('EVIDENCE')) stage = 'implementovano';
      const lastV = rows.filter(r => r.type === 'VERDICT').at(-1);
      if (lastV?.verdict === 'PASS') stage = 'nezavisle_overeno';
      if (has('GATE', r => /🟢/.test(r.text))) stage = lastV?.verdict === 'PASS' ? 'schvaleno' : stage;
      if (has('APPLIED')) stage = 'aplikovano';
      if (has('APPLIED', r => /aktiv/i.test(r.text))) stage = 'aktivni';
      if (has('MEASURED')) stage = 'zmereno';
      last[id].stage = stage; last[id].rounds = rows.filter(r => r.type === 'VERDICT').length; last[id].open = lastV?.verdict !== 'PASS';
    }
    out(last); break; }
  case 'metrics': {
    // Chování Kapitána: iterace do PASS, falešné DONE (STATUS DONE následované VERDICT FAIL), doba od HANDOFF do PASS, otevřené položky
    const since = sinceTs(args.since || '90d'); const byId = {}; for (const r of all()) if (r.id && r.id !== '-' && Date.parse(r.ts) >= since) (byId[r.id] ||= []).push(r);
    const items = []; let falseDone = 0, doneClaims = 0, iters = [], leadH = [], open = 0, blocked = 0;
    for (const [id, rows] of Object.entries(byId)) {
      const verdicts = rows.filter(r => r.type === 'VERDICT'); const fails = verdicts.filter(v => v.verdict === 'FAIL').length; const pass = verdicts.find(v => v.verdict === 'PASS');
      const handoff = rows.find(r => r.type === 'HANDOFF'); const dones = rows.filter(r => r.type === 'STATUS' && r.status === 'DONE');
      for (const d of dones) { doneClaims++; const nextV = verdicts.find(v => v.ts > d.ts); if (nextV && nextV.verdict === 'FAIL') falseDone++; }
      if (verdicts.length) iters.push(fails + (pass ? 1 : 0)); if (pass && handoff) leadH.push((Date.parse(pass.ts) - Date.parse(handoff.ts)) / 36e5);
      if (!pass) open++; if (rows.some(r => r.type === 'STATUS' && r.status === 'BLOCKED') && !pass) blocked++;
      items.push({ id, verdicts: verdicts.length, fails, pass: !!pass, done_claims: dones.length, blocked: rows.some(r => r.status === 'BLOCKED') });
    }
    const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
    const fpy = iters.length ? +(iters.filter(i => i === 1).length / iters.length).toFixed(2) : null;
    out({ since: args.since || '90d', items: items.length, open, blocked, first_pass_yield: fpy, avg_iterations_to_pass: avg(iters), false_done_rate: doneClaims ? +(falseDone / doneClaims).toFixed(2) : null, false_done: falseDone, done_claims: doneClaims, avg_lead_hours_handoff_to_pass: avg(leadH), verdict: fpy === null ? '—' : fpy < 0.6 || (doneClaims && falseDone / doneClaims > 0.2) ? '🔴' : fpy < 0.8 ? '🟡' : '🟢', detail: items }); break;
  }
  case 'wait': {
    const role = args.for || 'auditor'; const interval = +(args.interval || 120) * 1000; const deadline = Date.now() + +(args.timeout || 7200) * 1000;
    const seen = new Set(all().filter(r => r.to === role || r.to === 'both').map(r => r.file));
    const hasRemote = !!git('remote') && !git('remote').startsWith('ERR');
    (async () => { while (Date.now() < deadline) { if (hasRemote) git('pull --rebase --quiet'); const fresh = all().filter(r => (r.to === role || r.to === 'both') && !seen.has(r.file)); if (fresh.length) { out(fresh); process.exit(0); } await new Promise(r => setTimeout(r, interval)); } console.error('timeout bez nové zprávy'); process.exit(3); })(); break;
  }
  case 'sync': { const hasRemote = !!git('remote') && !git('remote').startsWith('ERR'); const r = [hasRemote ? git('pull --rebase --quiet') : 'lokální režim (bez remote)', git('add AUDIT'), git(`commit -q -m "bus: ${args.m || 'sync'}"`) || 'commit', hasRemote ? git('push --quiet') : 'push přeskočen']; out({ root: ROOT, remote: hasRemote, steps: r }); break; }
  default: die('příkazy: post | inbox | ack | thread | status | metrics | wait | sync');
}
function die(m) { console.error('bus: ' + m); process.exit(1); }
