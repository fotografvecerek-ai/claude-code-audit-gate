#!/usr/bin/env node
// SSOT SCAN — read-only sken kandidátů na "více zdrojů pravdy" a sémantické duplicity.
// node tools/ssot-scan.mjs <repo> > AUDIT/01_nalezy/ssot-scan.json
// Výstup jsou KANDIDÁTI — auditor každý ručně posoudí (kontext!) a teprve pak z něj dělá nález.
import fs from 'node:fs'; import path from 'node:path';
const repo = path.resolve(process.argv[2] || '.');
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'generated', 'playwright-report', 'test-results', '.turbo']);
const files = [];
(function walk(d, depth = 0) { if (depth > 10) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (/\.(ts|tsx|js|jsx|mjs|cjs|py|html)$/.test(p) && !/\.d\.ts$|\.min\.js$/.test(p)) files.push(p); } })(repo);
const rel = p => path.relative(repo, p);
const src = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
const linesOf = (t, idx) => t.slice(0, idx).split('\n').length;
const collect = (re, label) => { const out = []; for (const [f, t] of src) for (const m of t.matchAll(re)) out.push({ file: rel(f), line: linesOf(t, m.index), match: m[0].slice(0, 120), label }); return out; };
const group = (rows, key) => { const g = {}; for (const r of rows) (g[key(r)] ||= []).push(r); return g; };
const multi = (g, min) => Object.fromEntries(Object.entries(g).filter(([, v]) => new Set(v.map(x => x.file)).size >= min).sort((a, b) => b[1].length - a[1].length));

// 1) DB klienti a přímé přístupy
const db_clients = [
  ...collect(/new\s+PrismaClient\s*\(/g, 'prisma'),
  ...collect(/\bcreate(Browser|Server)?Client\s*\(/g, 'supabase'),
  ...collect(/\b(new\s+Pool|new\s+Client|postgres\()\s*\(?/g, 'pg-direct'),
  ...collect(/\bfetch\(\s*[`'"](\/api\/|https?:\/\/[^'"`]*\/api\/)/g, 'server-calls-own-api?'),
  ...collect(/\b(psycopg2|sqlite3)\.connect\(/g, 'py-db'),
];
// 2) Entity/typy definované vícekrát (stejný název interface/type/schema v ≥2 souborech)
const entity_shapes = multi(group(collect(/\b(?:interface|type|class)\s+([A-Z]\w{2,})\b|const\s+([A-Z]\w{2,}Schema)\s*=\s*z\./g, 'shape').map(r => ({ ...r, name: (r.match.match(/(?:interface|type|class)\s+(\w+)|const\s+(\w+Schema)/) || [])[1] || (r.match.match(/const\s+(\w+Schema)/) || [])[1] })), r => r.name), 2);
// 3) process.env čtení mimo jeden soubor
const env_reads = multi(group(collect(/process\.env\.([A-Z0-9_]+)/g, 'env').map(r => ({ ...r, name: r.match.replace('process.env.', '') })), r => r.name), 2);
// 4) Významové literály opakující se v ≥3 souborech (čísla/řetězce, které vypadají jako konstanty)
const litRows = [];
for (const [f, t] of src) for (const m of t.matchAll(/(['"`])([^'"`\n]{3,40})\1|(?<![\w.])(0\.\d{2}|\d{2,3}(?:\.\d+)?)(?![\w.])/g)) {
  const v = (m[2] ?? m[3]).trim(); if (!v || /^(http|\.\/|\.\.\/|\/|use |react|@|node:)/i.test(v) || /^\s*$/.test(v)) continue;
  if (/^(import|export|default|true|false|null|undefined|string|number|boolean|className|div|span)$/i.test(v)) continue;
  litRows.push({ file: rel(f), line: linesOf(t, m.index), name: v });
}
const literals = Object.fromEntries(Object.entries(multi(group(litRows, r => r.name), 3)).filter(([k]) => /dph|vat|kč|czk|eur|%|admin|owner|member|draft|sent|paid|cancel|pending|active|tenant|plan|limit|^\d/i.test(k) || k.length >= 12).slice(0, 80));
// 5) Duplicitní názvy funkcí/komponent napříč soubory
const dup_names = multi(group(collect(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_]\w{3,})|(?:export\s+)?const\s+([a-zA-Z_]\w{3,})\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/g, 'fn').map(r => ({ ...r, name: (r.match.match(/function\s+(\w+)|const\s+(\w+)/) || []).slice(1).find(Boolean) })).filter(r => r.name && !/^(handle|on|get|set|use|render|main|index|default)$/i.test(r.name)), r => r.name), 2);
// 6) Byznys výpočty na více místech
const business_calc = multi(group(collect(/\b(dph|vat|withVat|bezDph|sDph|total(Price|Amount)?|subtotal|discount|sleva|round(To|Money)?|invoiceNumber|cisloDokladu|quoteNumber)\b/gi, 'calc').map(r => ({ ...r, name: r.match.toLowerCase() })), r => r.name), 3);
// 7) Oprávnění kontrolovaná ad hoc
const permission_checks = collect(/\b(role\s*(===|==|!==)\s*['"]\w+['"]|isAdmin\b|hasRole\(|can\(|permissions?\.includes\()/g, 'perm');
// 8) Skládky
const dumps = {}; for (const f of files) { const seg = rel(f).split(path.sep).find(s => /^(utils?|helpers?|common|misc|shared|lib)$/i.test(s)); if (seg) dumps[seg] = (dumps[seg] || 0) + 1; }

const out = { repo, files: files.length,
  db_clients: { count: db_clients.length, verdict: db_clients.filter(x => x.label === 'prisma').length > 1 || db_clients.filter(x => x.label === 'supabase').length > 2 ? '🔴 více DB klientů' : '🟢', rows: db_clients },
  entity_shapes_multi_defined: entity_shapes, env_reads_multi_file: env_reads, repeated_literals: literals, duplicate_function_names: dup_names,
  business_calc_spread: business_calc, permission_checks_adhoc: { count: permission_checks.length, files: [...new Set(permission_checks.map(r => r.file))].length, rows: permission_checks.slice(0, 60) },
  dump_folders: dumps,
  note: 'Kandidáti, ne nálezy. Každý posoudit v kontextu; nález = totéž definováno/počítáno/čteno na ≥2 místech bez odvození z jednoho zdroje.' };
console.log(JSON.stringify(out, null, 2));
