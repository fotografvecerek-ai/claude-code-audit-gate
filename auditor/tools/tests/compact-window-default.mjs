#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'compact window '));
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data, 'utf8'); };
const run = (script, ...args) => spawnSync(process.execPath, [path.join(toolsDir, script), ...args], { encoding: 'utf8', timeout: 15000, env: { ...process.env } });
try {
  const settingsWs = path.join(base, 'settings workspace');
  const sourceRepo = path.join(base, 'source repo');
  const settingsFile = path.join(settingsWs, '.claude', 'settings.json');
  write(settingsFile, JSON.stringify({ env: { EXISTING_SETTING: 'keep' }, permissions: { allow: [] } }));
  fs.mkdirSync(path.join(settingsWs, 'tools'), { recursive: true });
  let result = run('write-auditor-settings.mjs', settingsWs, sourceRepo, 'opus');
  assert.equal(result.status, 0, result.stderr);
  let generated = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.equal(generated.autoCompactWindow, 250000, 'New Claude settings default to 250k tokens');
  assert.equal(generated.env.EXISTING_SETTING, 'keep');
  generated.autoCompactWindow = 173000;
  write(settingsFile, JSON.stringify(generated));
  result = run('write-auditor-settings.mjs', settingsWs, sourceRepo, 'opus');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).autoCompactWindow, 173000, 'Existing Claude override is preserved');

  const claudeWs = path.join(base, 'Claude launcher');
  fs.mkdirSync(claudeWs, { recursive: true });
  result = run('write-launchers.mjs', claudeWs, sourceRepo);
  assert.equal(result.status, 0, result.stderr);
  const claudeLaunchers = ['start-auditor.cmd', 'start-kapitan.cmd'].map(name => fs.readFileSync(path.join(claudeWs, name), 'utf8'));
  assert.ok(claudeLaunchers.every(text => text.includes('CLAUDE_CODE_AUTO_COMPACT_WINDOW=250000')), 'Claude launchers use the 250k default');
  write(path.join(claudeWs, '.rezim.json'), JSON.stringify({ okno: 164000 }));
  result = run('write-launchers.mjs', claudeWs, sourceRepo);
  assert.equal(result.status, 0, result.stderr);
  const overriddenLaunchers = ['start-auditor.cmd', 'start-kapitan.cmd'].map(name => fs.readFileSync(path.join(claudeWs, name), 'utf8'));
  assert.ok(overriddenLaunchers.every(text => text.includes('CLAUDE_CODE_AUTO_COMPACT_WINDOW=164000')), 'Launcher override remains effective');

  const codexWs = path.join(base, 'Codex launcher');
  fs.mkdirSync(codexWs, { recursive: true });
  write(path.join(codexWs, '.agents.json'), JSON.stringify({ auditor: 'codex', kapitan: 'codex' }));
  result = run('write-launchers.mjs', codexWs, sourceRepo);
  assert.equal(result.status, 0, result.stderr);
  const codexLaunchers = ['start-auditor.cmd', 'start-kapitan.cmd'].map(name => fs.readFileSync(path.join(codexWs, name), 'utf8'));
  assert.ok(codexLaunchers.every(text => !text.includes('CLAUDE_CODE_AUTO_COMPACT_WINDOW')), 'Codex launchers do not set Claude-specific environment');
  console.log('PASS: compact-window defaults (1 group)');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
