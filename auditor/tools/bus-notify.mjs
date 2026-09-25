#!/usr/bin/env node
// BUS-NOTIFY — doručí nové zprávy z mostu agentovi BĚHEM práce, ne až při dalším startu.
//   node tools/bus-notify.mjs --for kapitan|auditor --event post   (PostToolUse hook: po každém nástroji, když přišlo něco nového → additionalContext)
//   node tools/bus-notify.mjs --for kapitan|auditor --event stop   (Stop hook: než agent skončí tah, nové nepřečtené zprávy ho zastaví a musí je vyřídit)
//   … --once   (Codex: nemá stop_hook_active → každou zprávu zastaví konec tahu jen jednou, jinak by se tah točil dokola)
// Během práce se každá zpráva oznámí jen jednou (stav v AUDIT/bus/.notified-<role>.json); na konci tahu zastaví VŠECHNY nepotvrzené. Rychlé: když se složka mostu nezměnila, jen skončí.
// Nikdy neblokuje práci chybou — při jakékoliv potíži tiše skončí (exit 0).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
try {
  const a = process.argv; const val = k => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : ''; };
  const role = val('--for'), ev = val('--event') || 'post'; const ONCE = a.includes('--once');
  const ws = val('--ws') ? path.resolve(val('--ws')) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const bus = path.join(ws, 'AUDIT', 'bus');   // --ws: kopie v chráněné složce hooků Codexu
  let input = {}; try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { }
  if (!['kapitan', 'auditor'].includes(role) || !fs.existsSync(bus)) process.exit(0);
  const stF = path.join(bus, `.notified-${role}.json`); let st = { mtime: 0, ids: [] }; try { st = JSON.parse(fs.readFileSync(stF, 'utf8')); } catch { }
  const mt = fs.statSync(bus).mtimeMs; if (ev === 'post' && mt === st.mtime) process.exit(0);
  const seen = new Set(st.ids || []); const fresh = [];
  for (const f of fs.readdirSync(bus).filter(f => f.endsWith('.json') && !f.startsWith('.')).sort()) {
    if (seen.has(f) && ev !== 'stop') continue; let m; try { m = JSON.parse(fs.readFileSync(path.join(bus, f), 'utf8')); } catch { continue; }
    if ((m.to === role || m.to === 'both') && m.from !== role && !(m.ack || []).some(x => x.by === role)) fresh.push({ f, m });
  }
  let stopped = new Set(st.stopped || []);
  const save = () => { const ids = [...seen, ...fresh.map(x => x.f)].slice(-2000); fs.writeFileSync(stF, JSON.stringify({ mtime: mt, ids, stopped: [...stopped].slice(-2000) })); };
  if (!fresh.length) { save(); process.exit(0); }
  const who = role === 'kapitan' ? 'auditora' : 'Kapitána';
  const ack = role === 'kapitan' ? 'node .claude/hooks/auditor-bus.mjs ack --msg <soubor>' : 'node tools/bus.mjs ack --by auditor --msg <soubor>';
  const lines = fresh.slice(-8).map(({ f, m }) => `- ${f}: ${m.type} ${m.id || ''} ${m.verdict || m.status || ''} ${String(m.text || '').replace(/\s+/g, ' ').slice(0, 220)}${m.ref ? ' → ' + m.ref : ''}`);
  const msg = `📬 NOVÉ ZPRÁVY OD ${who.toUpperCase()} (${fresh.length}) — přečti je hned, řiď se jimi (P0/P1 a otázky mají přednost) a každou potvrď: ${ack}\n${lines.join('\n')}${fresh.length > 8 ? `\n(+${fresh.length - 8} dalších: inbox --unacked)` : ''}`;
  if (ev === 'stop') { if (input.stop_hook_active) process.exit(0);
    if (ONCE) { const nove = fresh.filter(x => !stopped.has(x.f)); if (!nove.length) { save(); process.exit(0); } nove.forEach(x => stopped.add(x.f)); }
    save(); process.stderr.write(msg + '\nNež skončíš tah, zprávy vyřiď (odpověz, potvrď nebo zařaď).\n'); process.exit(2); }
  save(); process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } })); process.exit(0);
} catch { process.exit(0); }
