// SPOUSTEC — otisk spouštěčů start-*.cmd/.sh (A-031). Spouštěč obsahuje příkaz `claude` s volbami (model, kanály, souběh); kdo ho přepíše,
// změní i to, co se spustí příště, bez ohledu na schválenou samostatnost. Proto:
//   <ws>/.spoustec.json = { verze, repo, soubory: { "start-kapitan.cmd": "<sha256>", … } } — zapisuje write-launchers.mjs po vygenerování;
//   schvaluje ho vlastník commitem v gitu workspace (prisnost.mjs potvrd), stejně jako .rezim.json / .opravneni.json;
//   neshoda spouštěče na disku se SCHVÁLENÝM otiskem = varování + obnova regenerací (write-launchers je deterministický z .telegram.json,
//   .agents.json, .rezim.json, .opravneni.json — vlastníkovy volby se tím neztratí).
// Čistý modul bez závislosti na prisnost.mjs (ten ho importuje).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

export const F_SPOUSTEC = '.spoustec.json';
export const LAUNCHERS = ['start-auditor.cmd', 'start-kapitan.cmd', 'start-projekt.cmd', 'start-auditor.sh', 'start-kapitan.sh', 'start-projekt.sh'];
const HERE = path.dirname(fileURLToPath(import.meta.url));

export const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
export function hashLaunchers(ws) {
  const out = {};
  for (const f of LAUNCHERS) { try { out[f] = sha256(fs.readFileSync(path.join(ws, f))); } catch { } }
  return out;
}
export function writeFingerprint(ws, repo) {
  const j = { verze: 1, repo: path.resolve(repo), soubory: hashLaunchers(ws) };
  fs.writeFileSync(path.join(ws, F_SPOUSTEC), JSON.stringify(j, null, 2) + '\n', 'utf8');
  return j;
}
// Porovná spouštěče na disku se schváleným otiskem (objekt z JSON) → { ok, rozdily: [jméno] }. Bez schváleného otisku (null) = ok (nic ke kontrole).
export function compareFingerprint(approved, ws) {
  const a = approved && typeof approved === 'object' && approved.soubory && typeof approved.soubory === 'object' ? approved.soubory : null;
  if (!a) return { ok: true, rozdily: [] };
  const now = hashLaunchers(ws); const rozdily = [];
  for (const f of new Set([...Object.keys(a), ...Object.keys(now)])) if (a[f] !== now[f]) rozdily.push(f);
  return { ok: rozdily.length === 0, rozdily };
}
// Obnova: znovu vygeneruje spouštěče z deterministických vstupů (write-launchers.mjs vedle tohoto modulu, jinak ve ws/tools). → { ok, chyba? }
export function regenLaunchers(ws, repo, approved = null) {
  const a = approved && approved.soubory && typeof approved.soubory === 'object' ? approved.soubory : null;
  if (a) for (const f of LAUNCHERS) if (!(f in a)) { try { fs.unlinkSync(path.join(ws, f)); } catch { } }   // spouštěč, který schválený otisk nezná (podstrčený), pryč
  const wl = [path.join(HERE, 'write-launchers.mjs'), path.join(ws, 'tools', 'write-launchers.mjs')].find(f => fs.existsSync(f));
  if (!wl) return { ok: false, chyba: 'write-launchers.mjs nenalezen' };
  if (!repo || !fs.existsSync(repo)) return { ok: false, chyba: 'cesta k repu projektu není známá' };
  const r = spawnSync(process.execPath, [wl, ws, repo], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? { ok: true } : { ok: false, chyba: String(r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 200) };
}
