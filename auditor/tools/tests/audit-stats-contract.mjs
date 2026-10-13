#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'audit stats contract '));
const ws = path.join(base, 'workspace with spaces');
const repo = path.join(base, 'source project');
const home = path.join(base, 'isolated home');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); };
const hash = file => fs.readFileSync(file).toString('base64');
try {
  fs.mkdirSync(repo, { recursive: true });
  const authored = new Map([
    ['ZPRAVA.md', '# Zpráva\n\n- [Q1] Má auditor zachovat tento dotaz? {ano/ne; doporučení: ano — důvod od auditora}\n'],
    ['KANBAN.md', '# Kanban\n\n- Doložit ručně ověřený výsledek.\n'],
    ['SEBEREFLEXE.md', '# Sebereflexe\n\nDalší audit ověřím celý, včetně závěrů agenta.\n'],
  ]);
  for (const [name, content] of authored) write(path.join(ws, 'AUDIT', name), content);
  const before = new Map([...authored.keys()].map(name => [name, hash(path.join(ws, 'AUDIT', name))]));
  const encodedWorkspace = ws.replace(/[^A-Za-z0-9]/g, '-');
  const transcript = [
    { message: { id: 'usage-1', role: 'assistant', model: 'claude-test-model', usage: { input_tokens: 17, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 } } },
    { message: { id: 'usage-1', role: 'assistant', model: 'claude-test-model', usage: { input_tokens: 17, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 } } },
    { message: { id: 'usage-1', role: 'assistant', model: 'claude-test-model', usage: { input_tokens: 25, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 } } },
    { message: { id: 'usage-2', role: 'assistant', model: 'constructor', usage: { input_tokens: 2, output_tokens: 4 } } },
    { message: { id: 'bad-usage', role: 'assistant', model: '__proto__', usage: { input_tokens: '99', output_tokens: -4 } } },
    { message: { id: 'near-safe-total', role: 'assistant', model: 'large', usage: { input_tokens: Number.MAX_SAFE_INTEGER - 46 } } },
    { message: { id: 'aggregate-overflow', role: 'assistant', model: 'large', usage: { input_tokens: 1 } } },
    { message: { id: 'unsafe-field', role: 'assistant', model: 'large', usage: { input_tokens: Number.MAX_SAFE_INTEGER + 1 } } },
    { message: { id: 'empty-usage', role: 'assistant', model: 'empty', usage: {} } },
    { message: { role: 'assistant', model: 'anonymous', usage: { input_tokens: 0 } } },
    '{malformed transcript row',
    'null',
  ].map(row => typeof row === 'string' ? row : JSON.stringify(row)).join('\n') + '\n';
  write(path.join(home, '.claude', 'projects', encodedWorkspace, 'session.jsonl'), transcript);
  const env = { ...process.env, HOME: home, USERPROFILE: home, AUDITOR_WORKSPACE: ws, AUDITOR_TARGET_REPO: repo };
  const run = spawnSync(process.execPath, [path.join(toolsDir, 'audit-stats.mjs'), ws, '--json'], { encoding: 'utf8', env, timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(ws, 'AUDIT', 'statistika.json'), 'utf8'));
  assert.deepEqual(JSON.parse(run.stdout), report, '--json returns the same token-only contract');
  assert.deepEqual(Object.keys(report).sort(), ['coverage', 'generatedAt', 'tokenUsage'].sort(), 'Statistics contains only token usage, source, coverage, and model breakdown');
  assert.equal(report.tokenUsage.claude.status, 'partial', 'Malformed transcript records make coverage partial');
  assert.equal(report.tokenUsage.claude.tokens.input, Number.MAX_SAFE_INTEGER - 19);
  assert.equal(report.tokenUsage.claude.tokens.output, 9);
  assert.equal(report.tokenUsage.claude.tokens.cacheRead, 7);
  assert.equal(report.tokenUsage.claude.tokens.cacheWrite, 3);
  assert.equal(report.tokenUsage.claude.tokens.total, Number.MAX_SAFE_INTEGER);
  assert.ok(Number.isSafeInteger(report.tokenUsage.claude.tokens.total), 'Aggregates stay finite safe integers');
  assert.equal(report.tokenUsage.claude.byModel['test-model'].input, 25, 'Later cumulative usage for the same message replaces its earlier snapshot');
  assert.equal(report.tokenUsage.claude.byModel.constructor.input, 2, 'Special model property names are recorded as data, not object prototypes');
  assert.equal(report.tokenUsage.codex.status, 'unknown');
  assert.equal(report.tokenUsage.codex.tokens, null, 'Missing Codex telemetry is unknown, not zero');
  assert.match(report.tokenUsage.claude.source, /transcript/i);
  assert.equal(report.coverage.claude.transcriptFiles, 1);
  assert.equal(report.coverage.claude.usageRecords, 4);
  assert.equal(report.coverage.claude.malformedRecords, 2);
  assert.equal(report.coverage.claude.invalidUsageRecords, 4);
  assert.equal(report.coverage.claude.duplicateUsageRows, 2);
  assert.equal(report.coverage.claude.supersededUsageRows, 1);
  assert.equal(report.coverage.claude.missingIdentityRecords, 1, 'Usage without a stable message identity is counted but marked partial');
  const goals = JSON.parse(fs.readFileSync(path.resolve(toolsDir, '../templates/cile_auditu.json'), 'utf8')).cile;
  const reportGoal = goals.find(goal => goal.id === 'C-120-ZPRAVA');
  const statsGoal = goals.find(goal => goal.id === 'C-120-STATISTIKA');
  const upgradeGoal = goals.find(goal => goal.id === 'C-1810-REPORT-REFLEXE');
  assert.match(reportGoal.postup, /auditor.*autorem/i);
  assert.match(reportGoal.postup, /celý vyrenderovaný report/i);
  assert.match(reportGoal.postup, /relevantním rozsahu/i);
  assert.match(reportGoal.postup, /neopakuj bez konkrétního signálu/i);
  assert.match(statsGoal.cil, /spotřeby tokenů/i);
  assert.match(statsGoal.postup, /neznámá, ne nula/i);
  assert.match(statsGoal.postup, /nálezů.*skript je neodvozuje/i);
  assert.equal(upgradeGoal.od_verze, '1.8.10');
  assert.deepEqual(upgradeGoal.hotovo_kdyz, ['AUDIT/.c1810-report-reflexe-ACK.md']);
  assert.match(upgradeGoal.postup, /renderer ani instalátor jej nesmí vytvářet/i);
  assert.match(upgradeGoal.postup, /ACK dokládá aktuální přečtení/i);
  assert.match(upgradeGoal.postup, /relevantním rozsahu/i);
  assert.doesNotMatch(upgradeGoal.postup, /znovu prověř celý audit/i);
  assert.deepEqual([...authored.keys()].map(name => hash(path.join(ws, 'AUDIT', name))), [...before.values()], 'Agent-authored report, kanban, and reflection are byte-identical');
  assert.ok(!run.stdout.includes(base), 'Report output does not disclose fixture paths');

  const render = spawnSync(process.execPath, [path.join(toolsDir, 'owner-report.mjs'), ws, '--src', 'ZPRAVA.md', '--out', 'ZPRAVA.html'], { encoding: 'utf8', env, timeout: 10000 });
  assert.equal(render.status, 0, render.stderr);
  const html = fs.readFileSync(path.join(ws, 'AUDIT', 'ZPRAVA.html'), 'utf8');
  assert.ok(html.includes('Má auditor zachovat tento dotaz?'), 'The renderer preserves the auditor-authored question');
  assert.deepEqual([...authored.keys()].map(name => hash(path.join(ws, 'AUDIT', name))), [...before.values()], 'Rendering also leaves authored source files unchanged');

  const capWorkspace = path.join(base, 'bounded transcript workspace');
  fs.mkdirSync(path.join(capWorkspace, 'AUDIT'), { recursive: true });
  const capTranscript = path.join(home, '.claude', 'projects', capWorkspace.replace(/[^A-Za-z0-9]/g, '-'), 'session.jsonl');
  write(capTranscript, 'null\n'.repeat(500001));
  const capRun = spawnSync(process.execPath, [path.join(toolsDir, 'audit-stats.mjs'), capWorkspace, '--json'], { encoding: 'utf8', timeout: 15000, env: { ...env, AUDITOR_WORKSPACE: capWorkspace } });
  assert.equal(capRun.status, 0, capRun.stderr);
  const capReport = JSON.parse(fs.readFileSync(path.join(capWorkspace, 'AUDIT', 'statistika.json'), 'utf8'));
  assert.equal(capReport.coverage.claude.processedRecords, 500000);
  assert.equal(capReport.coverage.claude.malformedRecords, 500000);
  assert.equal(capReport.coverage.claude.status, 'unknown');
  assert.equal(capReport.coverage.claude.partial, true, 'The row cap marks the report partial instead of scanning unbounded duplicate or invalid records');
  console.log('PASS: audit-stats report contract (1 group)');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
