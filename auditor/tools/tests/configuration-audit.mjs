import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(toolsDir, 'configuration-audit.mjs');
const { auditConfiguration } = await import(pathToFileURL(modulePath));
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-config-audit-'));
const repo = path.join(base, 'project');
const home = path.join(base, 'user-home');
const codexHome = path.join(base, 'separate-codex-home');
const utf8 = 'ščřžýáíéúůďťňĚŠČŘŽ';
const write = (root, relative, content = '') => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return file;
};

try {
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const sharedInstruction = 'Shared, identical instruction with Czech: ' + utf8;
  write(repo, 'AGENTS.md', [
    'Please implement and edit the source code.',
    'Automatic release is allowed without owner approval.',
    'Destructive SQL is forbidden; reversible source changes may proceed autonomously.',
  ].join('\n'));
  write(repo, 'AGENTS.override.md', 'Automatic release is allowed without owner approval.\nPlease implement and edit source code.');
  write(repo, 'CLAUDE.local.md', 'Local Claude root instructions.');
  write(repo, '.claude/CLAUDE.md', 'Claude instructions in the supported project location.');
  write(repo, 'src/AGENTS.override.md', '   \n');
  write(repo, 'src/AGENTS.md', 'Nested Codex fallback instructions.');
  write(repo, 'src/CLAUDE.md', 'Nested Claude instructions.');
  write(repo, 'docs/AGENTS.md', 'Nested app docs instructions.');
  write(repo, 'docs/AGENTS.override.md', 'Nested docs override instructions.');
  write(repo, 'projects/AGENTS.md', 'A real app directory named projects is still scanned.');
  write(repo, '.claude/worktrees/wt/CLAUDE.md', 'Archived worktree instruction must be skipped.');
  write(repo, 'packages/private/.claude/worktrees/agent-42/CLAUDE.md', 'Nested private worktree says never edit source code.');
  write(repo, 'packages/private/.codex/worktrees/agent-42/AGENTS.md', 'Nested private Codex worktree says never edit source code.');
  write(repo, 'archivebundle/auditor/SKILL.md', 'Never edit source code; this archived copy is not an active instruction.');
  write(repo, '.trash/CLAUDE.md', 'Trash instruction must be skipped.');
  write(repo, 'zip-check/auditor/CLAUDE.md', 'Archive check instruction must be skipped.');
  write(repo, '.archive/CLAUDE.md', 'Archive snapshot instruction must be skipped.');
  write(repo, 'archive/AGENTS.md', 'A real app directory named archive stays visible.');
  write(path.dirname(repo), 'CLAUDE.md', 'Require owner approval before release.');
  write(path.dirname(repo), 'AGENTS.md', 'Parent Codex instruction is visible in inventory but is not loaded from repository-root cwd.');
  write(repo, '.claude/rules/no-code.md', 'Do not edit source code or delegate coding.');
  write(repo, '.claude/rules/scoped.md', '---\npaths:\n  - "src/**"\n---\nScoped rule.');
  write(repo, '.claude/rules/duplicate.md', sharedInstruction);
  write(repo, '.agents/skills/duplicate/SKILL.md', sharedInstruction);
  write(repo, '.claude/skills/typescript-reviewer/SKILL.md', 'Review TypeScript changes.');
  write(repo, '.claude/agents/e2e-runner.md', 'Run browser end-to-end checks.');
  write(repo, 'app.py', 'print("project")');
  write(repo, '.claude/settings.json', JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'do-not-print-VERY_SECRET' }] }] },
    mcpServers: { localTools: { command: 'secret-command', env: { TOKEN: 'VERY_SECRET' } } },
    enabledPlugins: { 'sample-plugin@market': true },
  }));
  write(repo, '.mcp.json', `\uFEFF${JSON.stringify({ mcpServers: { projectServer: { url: 'https://secret.invalid/token' }, 'cílový-server': { url: 'hidden' } } })}`);
  write(repo, '.claude/katalog.json', `\uFEFF${JSON.stringify({ aktivni: { 'typescript-reviewer': { typ: 'skill' }, 'e2e-runner': { typ: 'agent' } } })}`);
  write(repo, '.codex/katalog.json', JSON.stringify({ aktivni: { 'python-reviewer': { typ: 'agent' } } }));
  write(repo, '.codex/agents/python-reviewer.toml', '[agent]\nname="python-reviewer"\n');
  write(repo, '.codex/hooks/config.toml', '[hooks.after_edit]\ncommand="secret-command"\n');
  write(repo, '.codex/config.toml', 'model="secret-model-value"\n');
  write(repo, '.codex/config.json', `{"padding":"${'x'.repeat(270 * 1024)}"}`);
  write(repo, '.claude/settings.local.json', '{ invalid json');
  write(repo, '.agents/skills/local-skill/SKILL.md', 'local skill');
  write(home, '.agents/skills/user-skill/SKILL.md', 'shared user skill');
  write(home, '.claude/CLAUDE.md', 'Global user-wide Claude instructions require approval before release.');
  write(home, '.claude/rules/global.md', 'User-wide Claude rule.');
  write(home, '.claude/settings.json', JSON.stringify({ mcpServers: { userServer: { command: 'hidden-user-command' } } }));
  write(home, '.codex/config.toml', '[mcp_servers.user]\ncommand="hidden"\n');
  write(codexHome, 'AGENTS.md', 'Global Codex instructions shadowed by override.');
  write(codexHome, 'AGENTS.override.md', 'Global Codex override instructions.');
  write(home, '.claude.json', `\uFEFF${JSON.stringify({ projects: {
    [repo]: { mcpServers: { targetOnly: { command: 'hidden' } } },
    [path.join(base, 'foreign-project')]: { mcpServers: { foreignSecret: { command: 'must-not-inventory' } } },
  } })}`);
  write(home, '.claude/projects/foreign-project/transcript.jsonl', 'must not be read');

  const readonlyHash = file => requireHash(fs.readFileSync(file));
  const originalHashes = [path.join(repo, '.claude/settings.json'), path.join(repo, '.mcp.json'), path.join(repo, '.claude/katalog.json')].map(readonlyHash);
  const result = auditConfiguration(repo, { home, codexHome, harness: 'all', includeShared: true });
  assert.ok(Array.isArray(result.inventory));
  assert.ok(Array.isArray(result.findings));
  assert.ok(result.inventory.some(item => item.path === 'AGENTS.md' && item.scope === 'project'));
  assert.ok(result.inventory.some(item => item.path === '../CLAUDE.md' && item.scope === 'parent'));
  const parentCodexInstruction = result.inventory.find(item => item.path === '../AGENTS.md');
  assert.equal(parentCodexInstruction?.scope, 'parent');
  assert.equal(parentCodexInstruction?.activation, 'not-loaded');
  assert.ok(result.inventory.some(item => item.path === '$USER/.claude/rules/global.md' && item.scope === 'user'));
  const userClaude = result.inventory.find(item => item.path === '$USER/.claude/CLAUDE.md' && item.scope === 'user');
  assert.ok(userClaude, 'Shared Claude audit inventories the global user CLAUDE.md');
  assert.ok(userClaude.tokensEstimate > 0, 'Global instructions contribute to context token estimates');
  assert.ok(result.inventory.some(item => item.kind === 'mcp-server' && item.name === 'targetOnly'));
  assert.ok(result.inventory.some(item => item.kind === 'mcp-server' && item.name === 'localTools'));
  assert.ok(result.inventory.some(item => item.kind === 'mcp-server' && item.name === 'projectServer' && item.activation === 'unknown'));
  assert.ok(result.inventory.some(item => item.kind === 'mcp-server' && item.name === 'cílový-server'));
  assert.ok(!JSON.stringify(result).includes('foreignSecret'), 'Global Claude project settings stay isolated');
  assert.ok(!JSON.stringify(result).includes('VERY_SECRET'));
  assert.ok(!JSON.stringify(result).includes('secret-command'));
  assert.ok(!JSON.stringify(result).includes('secret.invalid'));
  assert.ok(result.inventory.some(item => item.kind === 'codex-agent' && item.provenance?.status === 'catalog-declared' && item.provenance?.manifestPath === '.codex/katalog.json'));
  assert.ok(result.inventory.some(item => item.kind === 'skill' && item.provenance?.status === 'unmanaged'));
  assert.ok(result.inventory.some(item => item.state === 'unknown' && item.path.endsWith('settings.local.json')));
  assert.ok(result.inventory.some(item => item.state === 'unknown' && item.path.endsWith('.codex/config.json')));
  assert.ok(result.inventory.every(item => ['unknown', 'configured', 'not-loaded', 'excluded'].includes(item.activation)));
  assert.ok(result.inventory.some(item => item.path === 'AGENTS.md' && item.state === 'shadowed' && item.activation === 'excluded'), 'The active override shadows AGENTS.md in combined-harness audits');
  assert.ok(result.inventory.every(item => item.usage === 'unknown'));
  assert.ok(result.inventory.some(item => item.kind === 'rule' && item.scoped === true));
  assert.ok(result.inventory.some(item => item.path === 'CLAUDE.local.md' && item.harness === 'claude'));
  assert.ok(result.inventory.some(item => item.path === '.claude/CLAUDE.md' && item.harness === 'claude'));
  assert.ok(result.inventory.some(item => item.path === 'src/CLAUDE.md' && item.scoped === true));
  assert.ok(result.inventory.some(item => item.path === 'docs/AGENTS.md' && item.scoped === true));
  assert.ok(result.inventory.some(item => item.path === 'projects/AGENTS.md'), 'Ordinary app subdirectories remain scannable');
  assert.ok(result.inventory.some(item => item.path === 'archive/AGENTS.md'), 'An application archive directory is not globally skipped');
  assert.ok(!result.inventory.some(item => /(?:^|\/)(?:\.trash|\.archive|zip-check|\.claude\/worktrees)(?:\/|$)/i.test(item.path)), 'Trash, hidden archive snapshots, and Claude worktrees are excluded');
  assert.ok(!result.inventory.some(item => /(?:^|\/)(?:\.claude|\.codex)\/worktrees(?:\/|$)/i.test(item.path)), 'Nested Claude and Codex worktree instructions are excluded');
  assert.deepEqual([path.join(repo, '.claude/settings.json'), path.join(repo, '.mcp.json'), path.join(repo, '.claude/katalog.json')].map(readonlyHash), originalHashes, 'Audit is read-only');
  assert.ok(result.limitations.some(item => /effective|aktivace|použití/i.test(item)));

  const duplicates = result.findings.filter(item => item.type === 'duplicate-instructions');
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].status, 'candidate');
  assert.equal(duplicates[0].sources.length, 2);
  assert.ok(duplicates[0].sources.every(source => Number.isInteger(source.line)));

  const conflicts = result.findings.filter(item => item.type === 'instruction-conflict');
  assert.ok(conflicts.some(item => item.sources.some(source => source.path === 'AGENTS.override.md') && item.sources.some(source => source.path === '../CLAUDE.md')));
  assert.ok(conflicts.some(item => item.sources.some(source => source.path === 'AGENTS.override.md') && item.sources.some(source => source.path === '.claude/rules/no-code.md')));
  assert.ok(!conflicts.some(item => item.sources.some(source => source.path === 'AGENTS.md')), 'A Codex instruction shadowed by the root override cannot create a conflict');
  assert.ok(!conflicts.some(item => item.sources.some(source => source.path.startsWith('src/'))), 'Path-scoped descendant instructions do not conflict with root instructions');
  assert.ok(!conflicts.some(item => item.sources.some(source => source.path.includes('archivebundle/'))), 'Archived skill copies are not treated as active instructions');
  assert.ok(!conflicts.some(item => /destructive SQL/i.test(item.reason)), 'Destructive SQL prohibition is not treated as autonomy conflict');
  assert.ok(result.findings.some(item => item.type === 'catalog-relevance' && item.id === 'typescript-reviewer'));
  assert.ok(result.findings.every(item => item.status === 'candidate'));
  assert.ok(Number.isInteger(result.counts.findings));

  const codexProject = auditConfiguration(repo, { home, codexHome, harness: 'codex', includeShared: true });
  assert.ok(codexProject.inventory.some(item => item.path === '$CODEX_HOME/AGENTS.override.md' && item.scope === 'user'));
  assert.equal(codexProject.inventory.find(item => item.path === '$CODEX_HOME/AGENTS.md')?.state, 'shadowed');
  assert.ok(codexProject.inventory.some(item => item.path === 'AGENTS.md' && item.state === 'shadowed' && item.activation === 'excluded'));
  assert.ok(codexProject.inventory.some(item => item.path === '../AGENTS.md' && item.scope === 'parent' && item.activation === 'not-loaded'), 'Parent Codex instructions remain inventoried but are not loaded');
  assert.ok(codexProject.inventory.some(item => item.path === 'docs/AGENTS.md' && item.state === 'shadowed' && item.activation === 'excluded'), 'Nested Codex override shadows nested AGENTS.md');
  assert.ok(codexProject.inventory.some(item => item.path === 'src/AGENTS.md' && item.state === 'present'), 'Empty nested override falls back to AGENTS.md');

  const projectOnly = auditConfiguration(repo, { home, codexHome, harness: 'codex', includeShared: false });
  assert.ok(!projectOnly.inventory.some(item => item.scope === 'user'));
  assert.ok(projectOnly.inventory.some(item => item.scope === 'project' && item.kind === 'codex-agent'));
  assert.ok(!projectOnly.inventory.some(item => item.scope === 'parent' || item.scope === 'user'), '--no-shared excludes parent and user scope');
  assert.ok(projectOnly.inventory.every(item => item.harness === 'codex' || item.harness === 'shared'));
  const codexShared = auditConfiguration(repo, { home, codexHome, harness: 'codex', includeShared: true });
  assert.ok(!codexShared.inventory.some(item => item.path === '$USER/.claude/CLAUDE.md'), 'Codex audit does not include global Claude instructions');

  const claudeOnly = auditConfiguration(repo, { home, harness: 'claude', includeShared: false });
  assert.ok(!claudeOnly.inventory.some(item => item.harness === 'codex'));

  const isolatedEnv = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: codexHome, CLAUDE_CODE_HOME: home };
  const cli = spawnSync(process.execPath, [modulePath, repo, '--harness', 'all', '--no-shared'], { encoding: 'utf8', env: isolatedEnv, timeout: 10000 });
  assert.equal(cli.status, 0, cli.stderr);
  assert.doesNotThrow(() => JSON.parse(cli.stdout));
  assert.ok(!cli.stdout.includes(base));
  assert.ok(!cli.stdout.includes('VERY_SECRET'));
  const codexCli = spawnSync(process.execPath, [modulePath, repo, '--harness', 'codex'], { encoding: 'utf8', env: isolatedEnv, timeout: 10000 });
  assert.equal(codexCli.status, 0, codexCli.stderr);
  assert.ok(JSON.parse(codexCli.stdout).inventory.some(item => item.path === '$CODEX_HOME/AGENTS.override.md'), 'CLI resolves CODEX_HOME from the environment');
  const cliError = spawnSync(process.execPath, [modulePath, path.join(base, 'not-a-project')], { encoding: 'utf8', env: isolatedEnv, timeout: 10000 });
  assert.equal(cliError.status, 1);
  assert.ok(!cliError.stderr.includes(base));

  const symlinkRoot = path.join(base, 'symlink-root');
  fs.mkdirSync(symlinkRoot);
  const fakeLink = { name: 'linked', isSymbolicLink: () => true, isDirectory: () => false, isFile: () => false };
  const symlinkFs = { ...fs, opendirSync(dir, options) {
    if (dir !== symlinkRoot) return fs.opendirSync(dir, options);
    let read = false;
    return { readSync() { if (read) return null; read = true; return fakeLink; }, closeSync() {} };
  } };
  assert.ok(auditConfiguration(symlinkRoot, { home, includeShared: false, filesystem: symlinkFs }).limitations.some(item => /Symbolické odkazy/.test(item)));

  const entryRoot = path.join(base, 'entry-limit');
  fs.mkdirSync(entryRoot);
  const entryFs = { ...fs, opendirSync(dir, options) {
    if (dir !== entryRoot) return fs.opendirSync(dir, options);
    let index = 0;
    return { readSync() { return index < 20002 ? { name: `unused-${index++}`, isSymbolicLink: () => false, isDirectory: () => false, isFile: () => false } : null; }, closeSync() {} };
  } };
  const limited = auditConfiguration(entryRoot, { home, includeShared: false, filesystem: entryFs });
  assert.equal(limited.completeness, 'partial');
  assert.ok(limited.limitations.some(item => /20000/.test(item)));

  const catalogPath = path.resolve(toolsDir, '../katalog/katalog.json');
  const missingCatalogFs = { ...fs, lstatSync(file, ...args) {
    if (path.resolve(file) === catalogPath) throw Object.assign(new Error('missing test catalog'), { code: 'ENOENT' });
    return fs.lstatSync(file, ...args);
  } };
  const missingCatalog = auditConfiguration(repo, { home, harness: 'claude', includeShared: false, filesystem: missingCatalogFs });
  assert.equal(missingCatalog.completeness, 'partial', 'Missing built-in catalog marks the audit incomplete');
  assert.ok(missingCatalog.limitations.some(item => /Vestavěný katalog/.test(item)));

  const malformedCatalogFs = { ...fs, readFileSync(file, ...args) {
    if (path.resolve(file) === catalogPath) return '{ malformed catalog';
    return fs.readFileSync(file, ...args);
  } };
  const malformedCatalog = auditConfiguration(repo, { home, harness: 'claude', includeShared: false, filesystem: malformedCatalogFs });
  assert.equal(malformedCatalog.completeness, 'partial', 'Malformed built-in catalog marks the audit incomplete');
  assert.ok(malformedCatalog.limitations.some(item => /Vestavěný katalog/.test(item)));

  console.log('PASS: configuration-audit scenarios (17 groups)');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}

function requireHash(value) {
  return value.toString('base64');
}
