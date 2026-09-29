// BUS-STORE — jediné místo, kde se zprávy mostu čtou (včetně potvrzení) a kde vzniká potvrzení (ack).
// Používají ho bus.mjs (inbox/thread/status/metrics/wait/ledger) i bus-notify.mjs — žádná kopie slučovací logiky jinde.
//
// A-027 kolo 4 (změna metody): ack už NENÍ read-modify-write zprávy pod souborovým zámkem (tři kola oprav zámku, pokaždé
// jiný souběh při převzetí stale zámku → lost update). Každé potvrzení je samostatný append-only soubor vedle zprávy:
//   <zpráva>.json.ack.<by>.<ms>.<pid>.<rand>
// Vzniká atomicky: obsah se zapíše do dočasného souboru (<zpráva>.json.ack-pending.tmp-…, flag 'wx') a teprve hotový se
// přejmenuje na konečné jednoznačné jméno — čtenář nikdy neuvidí prázdný ani poloviční sidecar. Ani sidecar, ani dočasný
// soubor nekončí na .json, takže je nikdo nepovažuje za zprávu. Staré zprávy s polem ack fungují beze změny (žádná migrace):
// čtení sloučí pole ack ze zprávy + sidecar soubory a deduplikuje podle `by` (ponechá první = nejstarší záznam).
import fs from 'node:fs'; import path from 'node:path';

export const TRANSIENT_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
export function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
// obal na přechodné chyby (antivir/otevřený handle drží soubor na zlomek sekundy) — retry s narůstajícím backoffem místo pádu
export function withRetry(fn, { tries = 25, baseMs = 8, retryable = e => TRANSIENT_CODES.has(e.code) } = {}) {
  for (let i = 1; ; i++) {
    try { return fn(); }
    catch (e) { if (i >= tries || !retryable(e)) throw e; sleepMs(Math.min(baseMs * i, 200) + Math.floor(Math.random() * baseMs)); }
  }
}

const ACK_SEP = '.json.ack.';
const rand = () => Math.random().toString(36).slice(2);
export const isMessageFile = f => f.endsWith('.json') && !f.startsWith('.');
const ackTag = by => String(by ?? '').replace(/[^A-Za-z0-9_-]/g, '_') || '_';
const ackParts = n => n.slice(n.indexOf(ACK_SEP) + ACK_SEP.length).split('.');   // [by, ms, pid, rand]

// Čtenář nesmí zprávu tiše ztratit kvůli přechodné kolizi se souběžným zápisem — pár rychlých pokusů, pak nahlásit.
function readJson(dir, f, warn) {
  try { return withRetry(() => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), { tries: 15, baseMs: 8, retryable: e => TRANSIENT_CODES.has(e.code) || e.code === 'ENOENT' }); }
  catch (e) { if (e.code !== 'ENOENT') warn(`bus: přeskakuji nečitelnou zprávu ${f}: ${e.message}`); return null; }
}
// Sidecar je vždy kompletní (temp + rename); kdyby byl přesto nečitelný (ruční zásah, poškození disku), potvrzení se
// neztratí — by a čas se vezmou ze jména souboru.
function readAck(dir, n) {
  const [by, ms] = ackParts(n); const t = new Date(+ms);
  const fallback = { by, ts: isNaN(t) ? '' : t.toISOString() };
  try { const a = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); return a && typeof a === 'object' && !Array.isArray(a) ? a : fallback; }
  catch { return fallback; }
}
// Idempotence: dvojí ack téhož `by` = jeden záznam (legacy pole i sidecary dohromady), ponechá první.
export function mergeAcks(legacy, extra) {
  const seen = new Set(); const out = [];
  for (const a of [...(Array.isArray(legacy) ? legacy : []), ...extra]) {
    if (!a || typeof a !== 'object') continue;
    const k = ackTag(a.by); if (seen.has(k)) continue;
    seen.add(k); out.push(a);
  }
  return out;
}
// Všechny zprávy (seřazené podle jména) se sloučeným polem ack. `skip(f)` = zprávu vůbec nečíst (levný hook).
export function readMessages(dir, { skip = () => false, warn = m => console.error(m) } = {}) {
  const names = fs.readdirSync(dir); const side = {};
  for (const n of names) { const i = n.indexOf(ACK_SEP); if (i > 0) (side[n.slice(0, i + 5)] ||= []).push(n); }
  const byTime = (a, b) => (+ackParts(a)[1] || 0) - (+ackParts(b)[1] || 0) || (a < b ? -1 : a > b ? 1 : 0);
  const out = [];
  for (const f of names.filter(isMessageFile).sort()) {
    if (skip(f)) continue;
    const m = readJson(dir, f, warn); if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    out.push({ file: f, ...m, ack: mergeAcks(m.ack, (side[f] || []).sort(byTime).map(n => readAck(dir, n))) });
  }
  return out;
}
// Nové potvrzení: dočasný soubor (wx) → rename na jednoznačné jméno (msg + by + ms + pid + rand). Zprávu nečte ani nepřepisuje.
export function writeAck(dir, msgFile, by) {
  const ms = Date.now();
  const fin = path.join(dir, `${msgFile}.ack.${ackTag(by)}.${ms}.${process.pid}.${rand()}`);
  const tmp = path.join(dir, `${msgFile}.ack-pending.tmp-${process.pid}-${ms}-${rand()}`);
  let tmpLeft = false;
  try {
    withRetry(() => fs.writeFileSync(tmp, JSON.stringify({ by, ts: new Date(ms).toISOString() }) + '\n', { flag: 'wx' })); tmpLeft = true;
    withRetry(() => fs.renameSync(tmp, fin)); tmpLeft = false;
  } finally { if (tmpLeft) { try { fs.unlinkSync(tmp); } catch { } } }
  return path.basename(fin);
}
