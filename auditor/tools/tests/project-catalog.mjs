import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { answerChoice } from '../katalog.mjs';

const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = path.join(toolsDir, 'katalog.mjs');
const profiler = path.join(toolsDir, 'project-profile.mjs');
const evidenceRoot = path.resolve(toolsDir, '..', '..', '.tmp', 'tasks', 'K-005'); fs.mkdirSync(evidenceRoot, { recursive: true });
const root = fs.mkdtempSync(path.join(evidenceRoot, 'project-catalog-'));
let passed = 0;
let total = 0;
const skipped = [];
const failures = [];
function check(name, fn) { total++; try { fn(); passed++; process.stdout.write(`PASS ${name}\n`); } catch (error) { const line = `FAIL ${name}: ${error.message}`; failures.push(line); process.stderr.write(`${line}\n`); } }
function fixture(name, files) {
  const dir = path.join(root, name); fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) { const target = path.join(dir, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content, 'utf8'); }
  return dir;
}
function run(args) { const result = spawnSync(process.execPath, [catalog, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout; }
function refuse(args) { const result = spawnSync(process.execPath, [catalog, ...args], { encoding: 'utf8' }); assert.notEqual(result.status, 0); return `${result.stdout}\n${result.stderr}`; }
const projects = {
  js: fixture('js', { 'src/app.js': 'export const answer = 42;\n' }),
  cpp: fixture('cpp', { 'src/main.cpp': 'int main() { return 0; }\n', 'CMakeLists.txt': 'project(sample LANGUAGES CXX)\n' }),
  vba: fixture('vba', { 'Module1.bas': 'Sub Hello()\nEnd Sub\n' }),
  postgres: fixture('postgres', { 'package.json': '{"dependencies":{"pg":"^8.0.0"}}', 'db/migration.sql': 'select 1;\n' }),
  mixed: fixture('mixed', { 'src/app.js': '', 'src/main.cpp': '', 'db/migration.sql': '' }),
  unknown: fixture('unknown', { 'README.md': 'project notes\n' }),
};
const profile = dir => JSON.parse(spawnSync(process.execPath, [profiler, dir], { encoding: 'utf8' }).stdout);
const suggest = dir => JSON.parse(run(['doporuc', '--cil', dir, '--role', 'kapitan', '--harness', 'claude', '--json']));

check('JavaScript is distinct from TypeScript', () => { assert(profile(projects.js).signals.includes('javascript')); assert(!profile(projects.js).signals.includes('typescript')); });
check('catalog recommendations use profiler signals', () => { assert.deepEqual(suggest(projects.cpp).signaly, profile(projects.cpp).signals); });
check('recommendation is read-only', () => { suggest(projects.js); assert(!fs.existsSync(path.join(projects.js, '.claude', 'katalog.json'))); });
check('unknown project gets no automatic workflow recommendations', () => { const out = suggest(projects.unknown); assert.equal(out.ano.length, 0); });
check('language and database candidates are scoped', () => {
  const js = suggest(projects.js).ano.map(x => x.id); const cpp = suggest(projects.cpp).ano.map(x => x.id); const vba = suggest(projects.vba).ano.map(x => x.id); const pg = suggest(projects.postgres).ano.map(x => x.id);
  assert(js.includes('typescript-reviewer')); assert(cpp.includes('code-reviewer')); assert(!vba.includes('code-reviewer')); assert(!pg.includes('security-reviewer'));
});
check('BASIC .bas is not treated as proven VBA', () => { const p = profile(projects.vba); assert(p.languages.includes('basic')); assert(p.signals.includes('vba-neověřeno')); assert(!p.signals.includes('vba')); });
check('wizard and recommendation share candidate policy', () => { const a = suggest(projects.mixed).ano.map(x => x.id).sort(); const output = run(['pruvodce', '--cil', projects.mixed, '--harness', 'claude']); const b = [...output.matchAll(/^\s*• ([\w-]+) \(/gm)].map(m => m[1]).sort(); assert.deepEqual(a, b); });
check('Enter and non-exact answers refuse; only explicit ano confirms', () => { assert.equal(answerChoice(''), false); assert.equal(answerChoice('ne'), false); assert.equal(answerChoice('Ano'), false); assert.equal(answerChoice('ano'), true); });
check('existing project skills and agents are inventoried', () => { assert.match(fs.readFileSync(catalog, 'utf8'), /\.agents[\\/]skills/); assert.match(fs.readFileSync(catalog, 'utf8'), /\.claude[\\/]agents/); });
check('PostgreSQL reports unsupported catalog role and native checks', () => { const out = suggest(projects.postgres); assert.equal(out.podpora.length, 1); assert.match(out.podpora[0], /SQL lint\/parser/); assert(!out.ano.some(x => x.id === 'security-reviewer')); });
check('explicit --ano activates only relevant candidates', () => { const before = suggest(projects.js).ano.map(x => x.id); const output = run(['pruvodce', '--cil', projects.js, '--harness', 'claude', '--ano']); const state = JSON.parse(fs.readFileSync(path.join(projects.js, '.claude', 'katalog.json'), 'utf8')); assert.deepEqual(Object.keys(state.aktivni).sort(), before.sort()); assert(!output.includes('uzavrena-smycka aktivní')); });
check('existing same-ID agent is preserved and not activated twice', () => { const dir = path.join(projects.js, '.codex', 'agents'); fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, 'typescript-reviewer.toml'); fs.writeFileSync(file, 'owner version\n', 'utf8'); const output = run(['doporuc', '--cil', projects.js, '--role', 'kapitan', '--harness', 'codex', '--json']); const out = JSON.parse(output); assert(!out.ano.some(x => x.id === 'typescript-reviewer')); assert.equal(fs.readFileSync(file, 'utf8'), 'owner version\n'); });
check('manual operating guide is preserved byte-for-byte in Claude and Codex', () => {
  for (const harness of ['claude', 'codex']) {
    const dir = fixture(`manual-${harness}`, { 'README.md': 'x\n' }); const rel = path.join(harness === 'codex' ? '.codex' : '.claude', 'prirucka', 'PROVOZ_AGENTU.md');
    const file = path.join(dir, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); const original = Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('ruční řádky\r\nščřž\n', 'utf8')]); fs.writeFileSync(file, original);
    run(['aktivuj', 'pravidla', '--cil', dir, '--harness', harness]); assert.ok(fs.readFileSync(file).equals(original), `${harness} rewrote the owner guide`);
  }
});
check('corrupt or invalid catalog state fails closed without overwriting state or installing files', () => {
  for (const [name, stateText] of [['corrupt-json', '{not json\n'], ['invalid-shape', '{"aktivni":[]}\n'], ['invalid-record', '{"aktivni":{"typescript-reviewer":{"typ":"agent","soubory":[]}}}\n']]) {
    const dir = fixture(`bad-state-${name}`, { 'src/app.js': 'export const x = 1;\n' }); const stateDir = path.join(dir, '.claude'); fs.mkdirSync(stateDir, { recursive: true });
    const stateFile = path.join(stateDir, 'katalog.json'); const original = Buffer.from(stateText, 'utf8'); fs.writeFileSync(stateFile, original);
    const result = spawnSync(process.execPath, [catalog, 'aktivuj', 'typescript-reviewer', '--cil', dir, '--harness', 'claude'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, `${name} should reject activation`); assert.ok(fs.readFileSync(stateFile).equals(original), `${name} state bytes must survive`);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'agents', 'typescript-reviewer.md')), false, `${name} must not install an agent`);
  }
});
check('edited managed rules marker is preserved on activation and deactivation in both harnesses', () => {
  for (const harness of ['claude', 'codex']) {
    const dir = fixture(`edited-rules-${harness}`, { 'src/app.js': 'export const x = 1;\n', 'CLAUDE.md': 'owner intro\n', 'AGENTS.md': 'owner intro\n' });
    const file = path.join(dir, harness === 'codex' ? 'AGENTS.md' : 'CLAUDE.md');
    run(['aktivuj', 'pravidla', '--cil', dir, '--harness', harness]);
    const stateFile = path.join(dir, harness === 'codex' ? '.codex' : '.claude', 'katalog.json'); const stateBefore = fs.readFileSync(stateFile);
    const edited = fs.readFileSync(file, 'utf8').replace('Plná příručka', 'Ruční úprava příručky'); fs.writeFileSync(file, edited, 'utf8');
    const before = fs.readFileSync(file);
    assert.match(refuse(['aktivuj', 'pravidla', '--cil', dir, '--harness', harness]), /ručně změněn|záznam vlastnictví/); assert.ok(fs.readFileSync(file).equals(before), `${harness} activation changed a manually edited marker`); assert.ok(fs.readFileSync(stateFile).equals(stateBefore), `${harness} refusal rewrote catalog state`);
    assert.match(refuse(['deaktivuj', 'pravidla', '--cil', dir, '--harness', harness]), /ručně změněn|záznam vlastnictví/); assert.ok(fs.readFileSync(file).equals(before), `${harness} deactivation changed a manually edited marker`); assert.ok(fs.readFileSync(stateFile).equals(stateBefore), `${harness} refusal rewrote catalog state`);
  }
});
check('edited hook settings group is preserved and prevents partial deactivation', () => {
  const dir = fixture('edited-hook-settings', { 'src/app.js': 'export const x = 1;\n' });
  run(['aktivuj', 'stav-kompakce', '--cil', dir, '--harness', 'claude']);
  const settingsFile = path.join(dir, '.claude', 'settings.json'); const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  settings.hooks.SessionStart[0].matcher = 'owner matcher'; fs.writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  const stateFile = path.join(dir, '.claude', 'katalog.json'); const stateBefore = fs.readFileSync(stateFile);
  const before = fs.readFileSync(settingsFile); const hookFile = path.join(dir, '.claude', 'hooks', 'katalog', 'stav-kompakce.mjs');
  assert.match(refuse(['aktivuj', 'stav-kompakce', '--cil', dir, '--harness', 'claude']), /ručně změněna/); assert.ok(fs.readFileSync(settingsFile).equals(before), 'reactivation changed a manually edited settings group'); assert.ok(fs.readFileSync(stateFile).equals(stateBefore), 'reactivation refusal rewrote catalog state');
  assert.match(refuse(['deaktivuj', 'stav-kompakce', '--cil', dir, '--harness', 'claude']), /ručně změněna/); assert.ok(fs.readFileSync(settingsFile).equals(before), 'deactivation changed a manually edited settings group'); assert.ok(fs.readFileSync(stateFile).equals(stateBefore), 'deactivation refusal rewrote catalog state');
  assert.equal(fs.existsSync(hookFile), true, 'deactivation must retain hook file while edited settings still refer to it');
});
check('crafted hook ownership hash cannot authorize removal of a foreign hook group', () => {
  const dir = fixture('crafted-hook-ownership', { 'src/app.js': 'export const x = 1;\n' });
  run(['aktivuj', 'stav-kompakce', '--cil', dir, '--harness', 'claude']);
  const settingsFile = path.join(dir, '.claude', 'settings.json'); const stateFile = path.join(dir, '.claude', 'katalog.json');
  const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  const foreign = { matcher: 'owner', hooks: [{ type: 'command', command: 'node owner-hook.mjs' }] };
  settings.hooks.SessionStart[0] = foreign; fs.writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const hash = crypto.createHash('sha256').update(JSON.stringify(foreign), 'utf8').digest('hex');
  state.aktivni['stav-kompakce'].managed.hooks = [{ event: 'SessionStart', index: 0, hash }];
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  const beforeSettings = fs.readFileSync(settingsFile), beforeState = fs.readFileSync(stateFile);
  const hookFile = path.join(dir, '.claude/hooks/katalog/stav-kompakce.mjs'); const beforeHook = fs.readFileSync(hookFile);
  const result = spawnSync(process.execPath, [catalog, 'deaktivuj', 'stav-kompakce', '--cil', dir, '--harness', 'claude'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'foreign settings group must fail closed despite a matching forged hash');
  assert.ok(fs.readFileSync(settingsFile).equals(beforeSettings), 'foreign settings group was changed');
  assert.ok(fs.readFileSync(stateFile).equals(beforeState), 'catalog state was changed');
  assert.ok(fs.readFileSync(hookFile).equals(beforeHook), 'owned hook file was removed');
});
check('hook activation and deactivation preserve unrelated settings groups and fields', () => {
  const original = { customField: { keep: 'value' }, hooks: { SessionStart: [{ matcher: 'owner', hooks: [{ type: 'command', command: 'node owner-hook.mjs' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node other-hook.mjs' }] }] } };
  const dir = fixture('foreign-hook-settings', { 'src/app.js': 'export const x = 1;\n', '.claude/settings.json': `${JSON.stringify(original, null, 2)}\n` });
  const file = path.join(dir, '.claude', 'settings.json');
  run(['aktivuj', 'stav-kompakce', '--cil', dir, '--harness', 'claude']);
  const activated = JSON.parse(fs.readFileSync(file, 'utf8')); assert.deepEqual(activated.customField, original.customField); assert.deepEqual(activated.hooks.SessionStart[0], original.hooks.SessionStart[0]); assert.deepEqual(activated.hooks.PreToolUse, original.hooks.PreToolUse);
  run(['deaktivuj', 'stav-kompakce', '--cil', dir, '--harness', 'claude']);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), original);
});
check('legacy active entries without ownership snapshots cannot replace or remove managed regions', () => {
  const rulesDir = fixture('legacy-rules', { 'src/app.js': 'export const x = 1;\n', 'AGENTS.md': 'owner intro\n' });
  run(['aktivuj', 'pravidla', '--cil', rulesDir, '--harness', 'codex']);
  const rulesStateFile = path.join(rulesDir, '.codex', 'katalog.json'); const rulesState = JSON.parse(fs.readFileSync(rulesStateFile, 'utf8')); delete rulesState.aktivni.pravidla.managed; fs.writeFileSync(rulesStateFile, `${JSON.stringify(rulesState, null, 2)}\n`, 'utf8');
  const rulesFile = path.join(rulesDir, 'AGENTS.md'); const editedRules = fs.readFileSync(rulesFile, 'utf8').replace('Plná příručka', 'legacy edits'); fs.writeFileSync(rulesFile, editedRules, 'utf8'); const rulesBefore = fs.readFileSync(rulesFile);
  assert.match(refuse(['deaktivuj', 'pravidla', '--cil', rulesDir, '--harness', 'codex']), /ručně změněn|záznam vlastnictví/); assert.ok(fs.readFileSync(rulesFile).equals(rulesBefore));

  const hookDir = fixture('legacy-hook', { 'src/app.js': 'export const x = 1;\n' }); run(['aktivuj', 'stav-kompakce', '--cil', hookDir, '--harness', 'claude']);
  const hookStateFile = path.join(hookDir, '.claude', 'katalog.json'); const hookState = JSON.parse(fs.readFileSync(hookStateFile, 'utf8')); delete hookState.aktivni['stav-kompakce'].managed; fs.writeFileSync(hookStateFile, `${JSON.stringify(hookState, null, 2)}\n`, 'utf8');
  const hookSettings = path.join(hookDir, '.claude', 'settings.json'); const settings = JSON.parse(fs.readFileSync(hookSettings, 'utf8')); settings.hooks.SessionStart[0].matcher = 'legacy edits'; fs.writeFileSync(hookSettings, `${JSON.stringify(settings, null, 2)}\n`, 'utf8'); const before = fs.readFileSync(hookSettings);
  assert.match(refuse(['deaktivuj', 'stav-kompakce', '--cil', hookDir, '--harness', 'claude']), /záznam vlastnictví/); assert.ok(fs.readFileSync(hookSettings).equals(before));
});
check('modified active files survive reactivation and deactivation in both harnesses', () => {
  for (const harness of ['claude', 'codex']) {
    const dir = fixture(`modified-${harness}`, { 'src/app.js': 'export const x = 1;\n' });
    run(['aktivuj', 'typescript-reviewer', '--cil', dir, '--harness', harness]);
    const rel = harness === 'claude' ? '.claude/agents/typescript-reviewer.md' : '.codex/agents/typescript-reviewer.toml';
    const file = path.join(dir, rel); fs.writeFileSync(file, 'owner edits\n', 'utf8');
    run(['aktivuj', 'typescript-reviewer', '--cil', dir, '--harness', harness]);
    assert.equal(fs.readFileSync(file, 'utf8'), 'owner edits\n', `${harness} reactivation overwrote edits`);
    run(['deaktivuj', 'typescript-reviewer', '--cil', dir, '--harness', harness]);
    assert.equal(fs.readFileSync(file, 'utf8'), 'owner edits\n', `${harness} deactivation deleted edits`);
  }
});
check('catalog restore refreshes untouched files and ownership while preserving manual edits', () => {
  const clone = path.join(root, 'catalog-renewal-source'); const cloneTools = path.join(clone, 'tools');
  fs.mkdirSync(cloneTools, { recursive: true });
  const cloneScript = path.join(cloneTools, 'katalog.mjs');
  fs.copyFileSync(catalog, cloneScript); fs.copyFileSync(path.join(toolsDir, 'project-profile.mjs'), path.join(cloneTools, 'project-profile.mjs'));
  fs.copyFileSync(path.join(toolsDir, 'VERZE'), path.join(cloneTools, 'VERZE'));
  fs.cpSync(path.join(toolsDir, '..', 'katalog'), path.join(clone, 'katalog'), { recursive: true });
  const runClone = args => { const result = spawnSync(process.execPath, [cloneScript, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout; };
  const dir = fixture('renew-untouched', { 'src/app.ts': 'export const answer: number = 42;\n' });
  const manualDir = fixture('renew-manual', { 'src/app.ts': 'export const answer: number = 42;\n' });
  const rel = '.claude/agents/typescript-reviewer.md'; const source = path.join(clone, 'katalog', 'agenti', 'typescript-reviewer.md');
  const output = project => path.join(project, rel); const statePath = project => path.join(project, '.claude', 'katalog.json');
  for (const project of [dir, manualDir]) runClone(['aktivuj', 'typescript-reviewer', '--cil', project, '--harness', 'claude']);
  const oldState = JSON.parse(fs.readFileSync(statePath(dir), 'utf8'));
  const oldHash = oldState.aktivni['typescript-reviewer'].soubory[rel];
  const manualBytes = Buffer.from('Owner-maintained agent text; never replace on restore.\n', 'utf8');
  fs.writeFileSync(output(manualDir), manualBytes);
  const manualStateBefore = fs.readFileSync(statePath(manualDir));
  const sourceV2 = Buffer.concat([fs.readFileSync(source), Buffer.from('\nCatalog update marker v2.\n', 'utf8')]);
  fs.writeFileSync(source, sourceV2);

  const refreshed = runClone(['obnov', '--cil', dir]);
  assert.match(refreshed, /obnoveno 1 aktivních položek/, 'restore reports one item refreshed');
  assert.ok(fs.readFileSync(output(dir)).equals(sourceV2), 'untouched installed file receives current catalog bytes');
  const newState = JSON.parse(fs.readFileSync(statePath(dir), 'utf8'));
  const newHash = newState.aktivni['typescript-reviewer'].soubory[rel];
  assert.notEqual(newHash, oldHash, 'ownership hash advances with the installed bytes');
  assert.equal(newHash, crypto.createHash('sha256').update(fs.readFileSync(output(dir))).digest('hex').slice(0, 16));

  const manualOutput = runClone(['obnov', '--cil', manualDir]);
  assert.match(manualOutput, /ručně upravené/);
  assert.ok(fs.readFileSync(output(manualDir)).equals(manualBytes), 'manual file remains byte-identical');
  assert.ok(fs.readFileSync(statePath(manualDir)).equals(manualStateBefore), 'manual refusal does not rewrite ownership state');
});
check('deactivation rejects crafted state paths outside target', () => {
  for (const harness of ['claude', 'codex']) {
    const dir = fixture(`state-escape-${harness}`, { 'README.md': 'x\n' }); const outside = path.join(root, `outside-state-${harness}.txt`); fs.writeFileSync(outside, 'keep\n', 'utf8');
    const stateDir = path.join(dir, harness === 'claude' ? '.claude' : '.codex'); fs.mkdirSync(stateDir, { recursive: true });
    const escaped = path.join(root, `outside-absolute-${harness}.txt`); fs.writeFileSync(escaped, 'keep absolute\n', 'utf8');
    const relative = `../outside-state-${harness}.txt`;
    const validHash = '0'.repeat(16);
    fs.writeFileSync(path.join(stateDir, 'katalog.json'), JSON.stringify({ aktivni: { pravidla: { typ: 'pravidla', soubory: { [relative]: validHash, [escaped]: validHash } } } }), 'utf8');
    const result = spawnSync(process.execPath, [catalog, 'deaktivuj', 'pravidla', '--cil', dir, '--harness', harness], { encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.equal(fs.readFileSync(outside, 'utf8'), 'keep\n'); assert.equal(fs.readFileSync(escaped, 'utf8'), 'keep absolute\n');
  }
});
check('deactivation rejects valid hashes on paths not owned by the catalog item', () => {
  const dir = fixture('state-wrong-owned-path', { 'README.md': 'owner data must survive\n' }); const stateDir = path.join(dir, '.claude'); fs.mkdirSync(stateDir, { recursive: true });
  const readme = path.join(dir, 'README.md'); const hash = crypto.createHash('sha256').update(fs.readFileSync(readme)).digest('hex').slice(0, 16); const stateFile = path.join(stateDir, 'katalog.json');
  const state = { aktivni: { 'typescript-reviewer': { typ: 'agent', soubory: { 'README.md': hash } } } }; fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8'); const stateBefore = fs.readFileSync(stateFile), readmeBefore = fs.readFileSync(readme);
  const result = spawnSync(process.execPath, [catalog, 'deaktivuj', 'typescript-reviewer', '--cil', dir, '--harness', 'claude'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'valid hash for an unowned path must be rejected'); assert.ok(fs.readFileSync(readme).equals(readmeBefore)); assert.ok(fs.readFileSync(stateFile).equals(stateBefore));
});
check('catalog state rejects an item type that differs from its catalog ID', () => {
  const dir = fixture('state-type-mismatch', { '.claude/agents/typescript-reviewer.md': 'owner agent\n' }); const stateFile = path.join(dir, '.claude', 'katalog.json');
  const output = path.join(dir, '.claude', 'agents', 'typescript-reviewer.md'); const hash = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex').slice(0, 16);
  const state = { aktivni: { 'typescript-reviewer': { typ: 'skill', soubory: { '.claude/agents/typescript-reviewer.md': hash } } } }; fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8'); const before = fs.readFileSync(output), stateBefore = fs.readFileSync(stateFile);
  const result = spawnSync(process.execPath, [catalog, 'deaktivuj', 'typescript-reviewer', '--cil', dir, '--harness', 'claude'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'type mismatch must be rejected'); assert.ok(fs.readFileSync(output).equals(before)); assert.ok(fs.readFileSync(stateFile).equals(stateBefore));
});
check('activation refuses symlinked destination parent', () => {
  const dir = fixture('symlink-target', { 'README.md': 'x\n' }); const outside = path.join(root, 'symlink-outside'); fs.mkdirSync(outside);
  const parent = path.join(dir, '.claude', 'prirucka'); fs.mkdirSync(path.dirname(parent), { recursive: true });
  try { fs.symlinkSync(outside, parent, 'junction'); }
  catch (error) {
    try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `New-Item -ItemType Junction -Path '${parent}' -Target '${outside}' | Out-Null`], { stdio: 'ignore' }); }
    catch (fallbackError) {
      try { execFileSync('cmd.exe', ['/d', '/c', `mklink /J "${parent}" "${outside}"`], { stdio: 'ignore' }); }
      catch (cmdError) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code) || ['EPERM', 'EACCES', 'ENOTSUP'].includes(fallbackError.code) || ['EPERM', 'EACCES', 'ENOTSUP'].includes(cmdError.code)) { skipped.push(`symlink guard fixture unavailable (${error.code || fallbackError.code || cmdError.code})`); return; } throw cmdError; }
    }
  }
  const result = spawnSync(process.execPath, [catalog, 'aktivuj', 'pravidla', '--cil', dir, '--harness', 'claude'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.equal(fs.existsSync(path.join(outside, 'PROVOZ_AGENTU.md')), false);
});
check('recommendations use only the selected harness state', () => {
  const dir = fixture('split-state', { 'src/app.js': 'export const x = 1;\n' }); const claude = path.join(dir, '.claude'); fs.mkdirSync(claude, { recursive: true });
  fs.writeFileSync(path.join(claude, 'katalog.json'), JSON.stringify({ aktivni: { 'typescript-reviewer': { typ: 'skill', soubory: {} } } }), 'utf8');
  const codex = JSON.parse(run(['doporuc', '--cil', dir, '--role', 'kapitan', '--harness', 'codex', '--json']));
  assert(codex.ano.some(x => x.id === 'typescript-reviewer'));
});
check('catalog wording describes estimated metadata and unknown activations', () => {
  const source = fs.readFileSync(catalog, 'utf8');
  assert.doesNotMatch(source, /každém kroku to stojí|každý stojí kontext|v kontextu každého kroku/);
  assert.match(source, /odhad.*metadata|metadata.*odhad/i);
  assert.match(source, /skutečné načítání a (cena )?aktivace se .*liší/i);
});
check('Czech text round trips as UTF-8', () => { const text = 'ščřžýáíéúůďťňĚŠČŘŽ'; const file = path.join(root, 'utf8.txt'); fs.writeFileSync(file, text, 'utf8'); assert.equal(fs.readFileSync(file, 'utf8'), text); });
process.stdout.write(`${passed}/${total} PASS; ${skipped.length} SKIP\n`);
for (const reason of skipped) process.stdout.write(`SKIP ${reason}\n`);
if (failures.length) { const evidence = path.resolve(toolsDir, '..', '..', '.tmp', 'tasks', 'K-005'); fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, 'project-catalog-red.log'), `${failures.join('\n')}\n${passed}/${total} PASS; ${skipped.length} SKIP\n`, 'utf8'); }
fs.rmSync(root, { recursive: true, force: true });
if (failures.length) process.exitCode = 1;


