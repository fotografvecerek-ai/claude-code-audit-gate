#!/usr/bin/env node
// TELEGRAM-PING — při startu okna pošle vlastníkovi krátkou zprávu „🟢 … se spouští" (token a síť fungují na TOMTO počítači; příjem ověří odpověď okna).
// Jen sendMessage (nekoliduje s oknem, které bota poslouchá). Nikdy nechybuje a nezdržuje: bez tokenu/sítě tiše skončí (limit 5 s).
// --plugin-dir <složka>: před startem okna zajistí, že je Telegram plugin v té složce zapnutý (.claude/settings.local.json → enabledPlugins);
//   bez toho `claude --channels` nic nepřijímá — a jiné nástroje nebo projekt můžou enabledPlugins přepsat.
// node tools/telegram-ping.mjs <stateDir> <auditor|kapitan> <projekt> [--test] [--plugin-dir <složka>]
import fs from 'node:fs'; import path from 'node:path';
const args = process.argv.slice(2); const pi = args.indexOf('--plugin-dir'); const pdir = pi >= 0 ? args.splice(pi, 2)[1] : '';
const [sd, role, name] = args.filter(a => !a.startsWith('--')); const TEST = args.includes('--test');
if (pdir) { try { const f = path.join(pdir, '.claude', 'settings.local.json'); let raw = ''; try { raw = fs.readFileSync(f, 'utf8'); } catch { }
  const bom = raw.startsWith('\uFEFF'); const s = raw.trim() ? JSON.parse(raw.replace(/^\uFEFF/, '')) : {}; const P = 'telegram@claude-plugins-official';
  if (s.enabledPlugins?.[P] !== true) { s.enabledPlugins = { ...(s.enabledPlugins || {}), [P]: true }; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, (bom ? '\uFEFF' : '') + JSON.stringify(s, null, 2) + '\n'); console.log('  Telegram plugin znovu zapnut pro ' + path.basename(pdir)); } } catch { } }
const done = (m, c = 0) => { if (m) console.log(m); process.exit(c); };
setTimeout(() => done(TEST ? 'Telegram neodpověděl do 5 s' : ''), 5000).unref();
try {
  const token = (fs.readFileSync(path.join(sd, '.env'), 'utf8').match(/^TELEGRAM_BOT_TOKEN=(.+)$/m) || [])[1]?.trim();
  const to = JSON.parse(fs.readFileSync(path.join(sd, 'access.json'), 'utf8')).allowFrom || [];
  if (!token || !to.length) done(TEST ? 'bot nemá token nebo spárovaného vlastníka' : '');
  const who = role === 'auditor' ? 'Auditor' : 'Kapitán';
  const text = TEST ? `🧪 Test: ${who} projektu ${name} — bot je nastavený. Že okno zprávy přijímá, ověříš tak, že sem napíšeš a ono odpoví.`
    : `🟢 ${who} projektu ${name} se spouští. Napiš sem cokoliv — když do minuty odpoví, spojení funguje celé.`;
  let okCount = 0;
  for (const id of to) { try { const r = await (await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: id, text, disable_notification: !TEST }) })).json(); if (r.ok) okCount++; } catch { } }
  done(TEST ? (okCount ? `zkušební zpráva odeslána (${okCount}×)` : 'odeslání selhalo (token neplatný nebo bot zablokovaný)') : '');
} catch { done(TEST ? 'bot tu není nastavený' : ''); }
