#!/usr/bin/env node
// CODEX-HOOKS-CHECK — spouštěč ho volá před každým startem agenta v Codexu. Ověří, že
//   (1) pojistky jsou přesně ty, které zapsal instalátor (sha256 hooks.json + skriptů v chráněné složce hooků),
//   (2) projekt/workspace je v ~/.codex/config.toml důvěryhodný (jinak Codex projektové hooky vůbec nenačte → agent by běžel bez pojistek).
// Shoda → exit 0: spouštěč smí použít --dangerously-bypass-hook-trust (Codex ho určuje pro automatizaci, která zdroj hooků sama ověřuje).
// Cokoliv jiného → exit 1 a důvod; spouštěč agenta NESPUSTÍ (bez pojistek se nepracuje) a řekne, ať vlastník spustí START → [8].
// Evidence leží v chráněné složce hooků (<CODEX_HOME>/auditor/…/otisky.json), kam agenti v sandboxu Codexu nezapíšou.
//   node codex-hooks-check.mjs <složka-hooků>                                   → kontrola
//   node codex-hooks-check.mjs <složka-hooků> --register <soubor…> --trusted <složka…> --codex-home <dir>   → nová evidence (od nuly)
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const hd = path.resolve(process.argv[2] || '.'); const reg = path.join(hd, 'otisky.json'); const a = process.argv.slice(3);
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const listAfter = flag => { const i = a.indexOf(flag); if (i < 0) return []; const out = []; for (let j = i + 1; j < a.length && !a[j].startsWith('--'); j++) out.push(a[j]); return out; };
if (a.includes('--register')) {
  const files = listAfter('--register').map(f => path.resolve(f)).filter(f => fs.existsSync(f));
  const out = { files: Object.fromEntries(files.map(f => [f, sha(f)])), trusted: listAfter('--trusted').map(d => path.resolve(d)), codexHome: listAfter('--codex-home')[0] || '',
    _: 'Otisky pojistek Auditoru pro Codex (zapisuje jen instalátor; spouštěč podle nich smí obejít ruční schválení hooků).' };
  fs.writeFileSync(reg, JSON.stringify(out, null, 2) + '\n'); console.log(`evidence pojistek Codexu: ${files.length} souborů`); process.exit(0);
}
const fail = m => { console.error(`  POJISTKY CODEXU NESEDÍ: ${m}\n  Agent se nespustí bez pojistek. Spusť START → [8] (obnoví je) a pak spouštěč znovu.`); process.exit(1); };
let cur; try { cur = JSON.parse(fs.readFileSync(reg, 'utf8')); } catch { fail('chybí evidence otisků'); }
const entries = Object.entries(cur.files || {}); if (!entries.length) fail('prázdná evidence');
const bad = entries.filter(([f, h]) => !fs.existsSync(f) || sha(f) !== h).map(([f]) => path.basename(path.dirname(f)) + '/' + path.basename(f));
if (bad.length) fail(`změněné soubory: ${bad.join(', ')}`);
const isWin = process.platform === 'win32'; const norm = p => { const n = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, ''); return isWin ? n.toLowerCase() : n; };
let toml = ''; try { toml = fs.readFileSync(path.join(cur.codexHome || '', 'config.toml'), 'utf8'); } catch { }
const lines = toml.split(/\r?\n/);
for (const dir of cur.trusted || []) {
  let ok = false;
  for (let i = 0; i < lines.length && !ok; i++) { const m = lines[i].match(/^\s*\[projects\.(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\]\s*(#.*)?$/); if (!m) continue;
    const key = m[1] != null ? m[1].replace(/\\(.)/g, '$1') : m[2]; if (norm(key) !== norm(dir)) continue;
    for (let j = i + 1; j < lines.length && !/^\s*\[/.test(lines[j]); j++) if (/^\s*trust_level\s*=\s*["']trusted["']/.test(lines[j])) ok = true; }
  if (!ok) fail(`složka ${dir} není v Codexu označená jako důvěryhodná (config.toml)`);
  const pc = path.join(dir, '.codex', 'config.toml');   // projektový config (sandbox, MCP servery) jen takový, jaký byl při instalaci
  if (fs.existsSync(pc) && !Object.keys(cur.files || {}).some(f => norm(f) === norm(pc))) fail(`nový soubor ${pc} (mohl by změnit sandbox nebo přidat MCP server)`);
}
process.exit(0);
