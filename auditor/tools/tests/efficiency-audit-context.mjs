import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(toolsDir, 'efficiency-audit.mjs');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-efficiency-context-'));
const repo = path.join(base, 'project');
const home = path.join(base, 'home');
const write = (root, relative, content) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
};
const run = (...args) => {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex'), CLAUDE_CODE_HOME: home };
  const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', env, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

try {
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  write(base, 'AGENTS.md', 'Codex instruction above the repository root must remain visible but not count as loaded: ' + 'x'.repeat(5000));
  write(base, 'CLAUDE.md', 'Claude ancestor instructions remain in the Claude context subtotal.');
  write(repo, 'AGENTS.md', 'Codex root instructions shadowed by override: ' + 'x'.repeat(5000));
  write(repo, 'AGENTS.override.md', 'Codex root override takes precedence.');
  write(repo, 'src/AGENTS.override.md', '  \n');
  write(repo, 'src/AGENTS.md', 'Nested instructions are conditional and must not be always-loaded: ' + 'x'.repeat(5000));
  write(repo, 'projects/AGENTS.md', 'A real projects app directory stays visible.');
  write(repo, '.archive/AGENTS.md', 'Hidden archived instruction is excluded.');
  write(repo, 'archive/AGENTS.md', 'A real archive app directory stays inventoried.');
  write(repo, '.trash/AGENTS.md', 'Trash instruction is excluded.');
  write(repo, '.claude/worktrees/old/CLAUDE.md', 'Worktree instruction is excluded.');
  write(repo, 'CLAUDE.md', 'Claude root instructions.');
  write(repo, '.claude/rules/always.md', 'Always loaded rule.');
  write(repo, '.claude/rules/scoped.md', '---\npaths:\n  - "src/**"\n---\nScoped rule with a deliberately large context budget: ' + 'x'.repeat(2000));
  write(repo, '.claude/settings.json', JSON.stringify({ mcpServers: { local: { command: 'hidden-secret-command' } } }));
  write(repo, '.codex/agents/reviewer.toml', '[agent]\nname="reviewer"\ndescription="review"\n');
  write(repo, '.agents/skills/review/SKILL.md', 'On demand skill.');
  write(repo, 'src/native.cpp', 'int main() { return 0; }');
  write(repo, 'Module.bas', 'Sub Audit()\nEnd Sub');
  write(repo, 'Workbook.xlsm', 'binary workbook must not be enumerated as source');
  write(home, '.claude/CLAUDE.md', 'User Claude rule.');
  write(home, '.claude/rules/user.md', '---\npaths:\n  - "docs/**"\n---\nUser scoped.');
  write(home, '.codex/config.toml', '[mcp_servers.local]\ncommand="hidden"\n');
  write(home, '.codex/sessions/fake.jsonl', 'secret Codex telemetry must not be read');
  write(home, '.claude/projects/fake/session.jsonl', '{"timestamp":"2026-01-01T00:00:00.000Z","message":{"id":"c1","model":"claude-test","usage":{"input_tokens":3,"output_tokens":5}}}\n');
  const claudeDir = path.join(home, '.claude', 'projects', repo.replace(/[^A-Za-z0-9]/g, '-').toLowerCase());
  write(claudeDir, 'session.jsonl', '{"timestamp":"2026-10-08T00:00:00.000Z","message":{"id":"c1","model":"claude-test","usage":{"input_tokens":3,"output_tokens":5}}}\n');

  const claude = run('context', repo, '--harness', 'claude');
  assert.ok('always_loaded_tokens_est' in claude && Array.isArray(claude.items), 'Legacy context fields remain');
  assert.equal(claude.configuration.harness, 'claude');
  assert.ok(claude.configuration.activation === 'unknown');
  assert.ok(!JSON.stringify(claude).includes('hidden-secret-command'));
  assert.ok(!claude.note.includes('MCP schémata nástrojů se posílají v každém requestu'));
  const parentClaudeInstructions = claude.items.find(item => item.file === '../CLAUDE.md');
  assert.ok(parentClaudeInstructions && parentClaudeInstructions.activation === 'unknown');
  assert.ok(claude.always_loaded_tokens_est >= parentClaudeInstructions.tokens_est, 'Claude ancestor instructions remain in its subtotal');

  const codex = run('context', repo, '--harness', 'codex');
  assert.equal(codex.configuration.harness, 'codex');
  assert.ok(codex.items.some(item => item.kind === 'codex-agent'));
  const nestedCodexInstructions = codex.items.find(item => item.file === 'src/AGENTS.md');
  const parentCodexInstructions = codex.items.find(item => item.file === '../AGENTS.md');
  const shadowedCodexInstructions = codex.items.find(item => item.file === 'AGENTS.md');
  assert.ok(nestedCodexInstructions?.scoped === true, 'Nested Codex instructions are path scoped');
  assert.ok(parentCodexInstructions && parentCodexInstructions.activation === 'not-loaded', 'Parent Codex AGENTS are inventoried as not loaded from repository-root cwd');
  assert.ok(codex.always_loaded_tokens_est < parentCodexInstructions.tokens_est, 'Parent Codex AGENTS do not inflate the subtotal');
  assert.ok(codex.items.some(item => item.file === 'AGENTS.md' && item.state === 'shadowed' && item.activation === 'excluded'), 'Nonempty AGENTS.override.md shadows AGENTS.md');
  assert.ok(codex.always_loaded_tokens_est < shadowedCodexInstructions.tokens_est, 'Shadowed instructions do not inflate always-loaded token estimate');
  assert.match(shadowedCodexInstructions.note, /Vyloučeno|přebíjí/i, 'Shadowed instructions are labeled as excluded');
  assert.ok(codex.items.some(item => item.file === 'src/AGENTS.md' && item.state === 'present'), 'Empty nested override falls back to AGENTS.md');
  assert.ok(codex.items.some(item => item.file === 'projects/AGENTS.md' && item.scoped === true), 'Ordinary app subdirectories remain inventoried');
  assert.ok(codex.items.some(item => item.file === 'archive/AGENTS.md' && item.scoped === true), 'A real archive app directory is not globally skipped');
  assert.ok(!codex.items.some(item => /(?:^|\/)(?:\.archive|\.trash|\.claude\/worktrees)(?:\/|$)/i.test(item.file)), 'Hidden archives, trash, and worktree instructions are excluded');
  assert.ok(codex.always_loaded_tokens_est < nestedCodexInstructions.tokens_est, 'Nested instructions are not included in always-loaded token estimate');
  assert.ok(!codex.items.some(item => item.kind === 'claude_md'));
  assert.ok(codex.coverage.usage === 'unknown');

  const both = run('context', repo, '--harness', 'all');
  assert.ok(both.harnesses.claude && both.harnesses.codex);
  assert.ok(both.harnesses.claude.always_loaded_tokens_est > 0);
  assert.ok(both.harnesses.codex.always_loaded_tokens_est > 0);
  assert.ok(both.harnesses.claude.items.some(item => item.file === 'CLAUDE.md'));
  assert.ok(both.harnesses.codex.items.some(item => item.file === 'AGENTS.md'));
  assert.ok(!both.harnesses.claude.items.some(item => item.file === 'AGENTS.md'));
  assert.ok(!both.harnesses.codex.items.some(item => item.file === 'CLAUDE.md'));
  assert.equal(both.legacy_fields_scope, 'claude-subtotal', 'Legacy top-level fields are labeled as Claude subtotal');
  assert.equal(both.always_loaded_tokens_scope, 'claude-subtotal');
  assert.equal(both.items_scope, 'claude-subtotal');
  assert.equal(both.mcp_servers_scope, 'claude-subtotal');
  assert.equal(both.always_loaded_tokens_est, both.harnesses.claude.always_loaded_tokens_est);
  assert.notEqual(both.always_loaded_tokens_est, both.harnesses.claude.always_loaded_tokens_est + both.harnesses.codex.always_loaded_tokens_est,
    'The legacy field is not presented as a combined Claude+Codex total');
  assert.equal(both.claudeSubtotal.always_loaded_tokens_est, both.harnesses.claude.always_loaded_tokens_est);
  const all = run('all', repo);
  assert.ok(all.context.harnesses.claude && all.context.harnesses.codex);
  assert.equal(all.usage.codex.status, 'unknown');
  assert.ok(all.usage.claude);

  const usageCodex = run('usage', repo, '--harness', 'codex');
  assert.equal(usageCodex.status, 'unknown');
  assert.equal(usageCodex.per_model, null, 'Unknown is not reported as zero usage');
  assert.ok(!JSON.stringify(usageCodex).includes('secret Codex telemetry'));
  const usageClaude = run('usage', repo, '--harness', 'claude');
  assert.equal(usageClaude.status, 'measured');
  assert.equal(usageClaude.sessions, 1, 'Claude log coverage is scoped to the exact target project');
  assert.ok(!JSON.stringify(usageClaude).includes('fake.jsonl'), 'Foreign project transcripts are not included');

  const modules = run('modules', repo);
  assert.equal(modules.files_scanned, 2, 'Native text modules are included, binary workbooks are excluded');

  console.log('PASS: efficiency audit context scenarios (9 groups)');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
