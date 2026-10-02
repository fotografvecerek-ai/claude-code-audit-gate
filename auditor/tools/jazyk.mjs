#!/usr/bin/env node
// JAZYK — v jakém jazyce agent mluví s vlastníkem a píše mu výstupy: vypíše „cs" nebo „en".
// Pořadí: env AUDITOR_LANG > <workspace>/.rezim.json → "jazyk" > jazyk systému (Intl / LANG / LC_ALL). Čeština a slovenština → cs, jinak en.
// node tools/jazyk.mjs [workspace]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
export function jazyk(ws = process.cwd()) {
  const norm = v => { v = String(v || '').toLowerCase(); return /^(cs|cz|sk)/.test(v) ? 'cs' : v ? 'en' : ''; };
  if (process.env.AUDITOR_LANG) return norm(process.env.AUDITOR_LANG);
  try { const r = JSON.parse(fs.readFileSync(path.join(ws, '.rezim.json'), 'utf8')); if (r.jazyk) return norm(r.jazyk); } catch { }
  const sys = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  if (sys && !/^(c|posix)(\.|$)/i.test(sys)) return norm(sys);
  try { return norm(Intl.DateTimeFormat().resolvedOptions().locale) || 'en'; } catch { return 'en'; }
}
if (process.argv[1] && ((p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } })(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(jazyk(process.argv[2] || process.cwd()) + '\n');
