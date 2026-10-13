#!/usr/bin/env node
// AUDIT-STATS — přesné počty tokenů z dostupné telemetrie; závěry a otázky píše auditor.
// node tools/audit-stats.mjs [workspace] [--json] [--open] → AUDIT/STATISTIKA.md + statistika.json
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ws = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.AUDITOR_WORKSPACE || path.join(here, '..'));
const A = (...p) => path.join(ws, 'AUDIT', ...p);
const n = value => Number(value || 0).toLocaleString('cs-CZ');

// 3) Tokeny a čas z transkriptů Claude Code
const enc = p => p.replace(/[^A-Za-z0-9]/g, '-');
const projRoot = path.join(os.homedir(), '.claude', 'projects');
const dirs = (() => {
  const candidate = path.join(projRoot, enc(ws));
  try { const stat = fs.lstatSync(candidate); return stat.isDirectory() && !stat.isSymbolicLink() ? [candidate] : []; } catch { return []; }
})().sort();
const MAX_DEPTH = 16, MAX_TRANSCRIPTS = 2000, MAX_SCAN_ENTRIES = 20000, MAX_FILE_BYTES = 20 * 1024 * 1024, MAX_RECORDS = 500000;
const tok = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, byModel: Object.create(null) };
let incomplete = false, malformedRecords = 0, invalidUsageRecords = 0, duplicateUsageRows = 0, supersededUsageRows = 0, missingIdentityRecords = 0;
let scannedEntries = 0, processedRecords = 0, recordLimitReached = false;
const jsonl = [];
const wj = (dir, depth = 0) => {
  if (depth > MAX_DEPTH || jsonl.length >= MAX_TRANSCRIPTS) { incomplete = true; return; }
  let stream;
  try { stream = fs.opendirSync(dir, { encoding: 'utf8', bufferSize: 32 }); } catch { incomplete = true; return; }
  try {
    let entry;
    while ((entry = stream.readSync()) !== null) {
      scannedEntries++;
      if (scannedEntries > MAX_SCAN_ENTRIES) { incomplete = true; return; }
      if (entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) wj(file, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        if (jsonl.length >= MAX_TRANSCRIPTS) { incomplete = true; return; }
        jsonl.push(file);
      }
    }
  } finally { try { stream.closeSync(); } catch { } }
};
dirs.forEach(dir => wj(dir));
jsonl.sort();
const uniqueUsage = new Map();
let anonymousUsageId = 0;
for (const f of jsonl) {
  if (recordLimitReached) break;
  let transcript;
  try { if (fs.statSync(f).size > MAX_FILE_BYTES) { incomplete = true; continue; } transcript = fs.readFileSync(f, 'utf8'); }
  catch { incomplete = true; continue; }
  for (const line of transcript.split('\n')) {
    if (!line.trim()) continue;
    if (processedRecords >= MAX_RECORDS) { incomplete = true; recordLimitReached = true; break; }
    processedRecords++;
    let r; try { r = JSON.parse(line); } catch { incomplete = true; malformedRecords++; continue; }
    if (!r || typeof r !== 'object' || Array.isArray(r)) { incomplete = true; malformedRecords++; continue; }
    const m = r.message;
    if (m == null) { if (Object.hasOwn(r, 'message')) { incomplete = true; malformedRecords++; } continue; }
    if (typeof m !== 'object' || Array.isArray(m)) { incomplete = true; malformedRecords++; continue; }
    if (m.role !== 'assistant' || !m.usage) continue;
    const usage = m.usage;
    const tokenFields = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
    const validUsage = usage && typeof usage === 'object' && !Array.isArray(usage)
      && tokenFields.some(key => usage[key] !== undefined)
      && tokenFields.every(key => usage[key] === undefined || (typeof usage[key] === 'number' && Number.isSafeInteger(usage[key]) && usage[key] >= 0));
    if (!validUsage) { incomplete = true; invalidUsageRecords++; continue; }
    const identity = typeof m.id === 'string' && m.id ? m.id : typeof r.uuid === 'string' && r.uuid ? r.uuid : null;
    if (!identity) { incomplete = true; missingIdentityRecords++; }
    const id = identity || `anonymous:${anonymousUsageId++}`;
    const mod = (typeof m.model === 'string' && m.model ? m.model : '?').replace(/^claude-/, '').slice(0, 120);
    const previous = uniqueUsage.get(id);
    if (previous) {
      duplicateUsageRows++;
      if (JSON.stringify(previous.usage) === JSON.stringify(usage) && previous.model === mod) continue;
      supersededUsageRows++;
    }
    uniqueUsage.set(id, { usage, model: mod });
  }
}
const safeAdd = (a, b) => Number.isSafeInteger(a) && Number.isSafeInteger(b) && Number.isSafeInteger(a + b) ? a + b : null;
const safeSum = values => values.reduce((sum, value) => sum === null ? null : safeAdd(sum, value), 0);
for (const { usage: u, model: mod } of uniqueUsage.values()) {
  const values = [u.input_tokens || 0, u.output_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0];
  const [input, output, cacheRead, cacheWrite] = values;
  const rowTotal = safeSum(values);
  const bm = tok.byModel[mod] || { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const next = [safeAdd(tok.input, input), safeAdd(tok.output, output), safeAdd(tok.cacheRead, cacheRead), safeAdd(tok.cacheWrite, cacheWrite), safeAdd(bm.input, input), safeAdd(bm.output, output), safeAdd(bm.cacheRead, cacheRead), safeAdd(bm.cacheWrite, cacheWrite)];
  const aggregateTotal = [next[0], next[1], next[2], next[3]].every(Number.isSafeInteger)
    ? safeSum([next[0], next[1], next[2], next[3]]) : null;
  const modelTotal = [next[4], next[5], next[6], next[7]].every(Number.isSafeInteger)
    ? safeSum([next[4], next[5], next[6], next[7]]) : null;
  if (rowTotal === null || next.some(value => value === null) || aggregateTotal === null || modelTotal === null) {
    incomplete = true; invalidUsageRecords++; continue;
  }
  tok.calls++;
  [tok.input, tok.output, tok.cacheRead, tok.cacheWrite] = next.slice(0, 4);
  tok.byModel[mod] = { calls: bm.calls + 1, input: next[4], output: next[5], cacheRead: next[6], cacheWrite: next[7] };
}
const total = tok.input + tok.output + tok.cacheRead + tok.cacheWrite;
const status = tok.calls ? incomplete ? 'partial' : 'measured' : 'unknown';
const claudeTokens = tok.calls ? { input: tok.input, output: tok.output, cacheRead: tok.cacheRead, cacheWrite: tok.cacheWrite, total } : null;
const byModel = tok.calls ? Object.fromEntries(Object.entries(tok.byModel).map(([model, usage]) => [model, { ...usage, total: usage.input + usage.output + usage.cacheRead + usage.cacheWrite }])) : null;
const report = {
  generatedAt: new Date().toISOString(),
  tokenUsage: {
    claude: { status, source: 'Claude Code transcript usage records', tokens: claudeTokens, byModel },
    codex: { status: 'unknown', source: 'Codex token usage telemetry is unavailable to this report', tokens: null, byModel: null },
  },
  coverage: {
    claude: { status, transcriptFiles: jsonl.length, processedRecords, usageRecords: tok.calls, malformedRecords, invalidUsageRecords, duplicateUsageRows, supersededUsageRows, missingIdentityRecords, ...(incomplete ? { partial: true } : {}) },
    codex: { status: 'unknown', reason: 'No compatible token telemetry source is available.' },
  },
};

// 4) Výstup
fs.mkdirSync(A(), { recursive: true });
fs.writeFileSync(A('statistika.json'), JSON.stringify(report, null, 2), 'utf8');
const display = value => value == null ? 'neznámé' : n(value);
const modelRows = Object.entries(byModel || {}).map(([model, usage]) => `| ${model.replace(/[|\r\n]/g, ' ')} | ${n(usage.input)} | ${n(usage.cacheRead)} | ${n(usage.cacheWrite)} | ${n(usage.output)} | ${n(usage.total)} |`).join('\n');
const md = `# Spotřeba tokenů\n\nZdroj Claude: ${report.tokenUsage.claude.source}. Stav: ${status}.\n\nPokrytí: ${jsonl.length} transcriptů, ${tok.calls} záznamů spotřeby${incomplete ? ' (částečné)' : ''}. Codex: neznámé — telemetrie není dostupná.\n\n| Model | Vstup | Čtení cache | Zápis cache | Výstup | Celkem |\n|---|---:|---:|---:|---:|---:|\n${modelRows || '| — | — | — | — | — | — |'}\n\nCelkem Claude: ${display(claudeTokens?.total)} tokenů.\n`;
fs.writeFileSync(A('STATISTIKA.md'), md, 'utf8');
const safeEnv = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'SystemDrive', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const render = spawnSync(process.execPath, [path.join(here, 'owner-report.mjs'), ws, '--src', 'STATISTIKA.md', '--out', 'STATISTIKA.html', ...(process.argv.includes('--open') ? ['--open'] : [])], { cwd: ws, encoding: 'utf8', timeout: 15000, env: safeEnv, stdio: ['ignore', 'pipe', 'pipe'] });
if (render.error || render.status !== 0) {
  process.stderr.write(`HTML renderer selhal${render.error?.code ? ` (${render.error.code})` : ''}.\n`);
  process.exitCode = 1;
} else if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report)}\n`);
else process.stdout.write(`Statistika tokenů: Claude ${status}; ${display(claudeTokens?.total)} tokenů z ${jsonl.length} transcriptů; Codex neznámé.\n`);
