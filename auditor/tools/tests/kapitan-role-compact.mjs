import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roleScript = path.join(toolsDir, 'kapitan-role.mjs');
const packageRoot = path.resolve(toolsDir, '..');
const tempRoot = path.resolve(toolsDir, '../../..');
fs.mkdirSync(path.join(tempRoot, '.tmp'), { recursive: true });
const temp = fs.mkdtempSync(path.join(tempRoot, '.tmp', 'auditor-role-compact-'));
const utf8 = 'ščřžýáíéúůďťňĚŠČŘŽ';
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (base, relative, text) => {
  const file = path.join(base, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8'); return file;
};
const run = (args, env) => spawnSync(process.execPath, [roleScript, ...args], { encoding: 'utf8', env, timeout: 10000 });
let maxRoleBytes = 0;

try {
  const workspace = path.join(temp, 'workspace with spaces'); fs.mkdirSync(workspace);
  fs.mkdirSync(path.join(workspace, 'AUDIT'), { recursive: true });
  const home = path.join(temp, 'isolated home'); fs.mkdirSync(home);
  write(workspace, '.rezim.json', JSON.stringify({ soubeh: { kapitan: 3 } }));
  write(workspace, '.opravneni.json', JSON.stringify({ kapitan: 3 }));
  const userSettings = write(home, '.claude/settings.json', JSON.stringify({ permissions: { defaultMode: 'bypassPermissions' }, marker: utf8 }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_HOME: home, CODEX_HOME: path.join(home, '.codex') };

  for (const [flag, fileName] of [['--claude-md', 'CLAUDE.md'], ['--agents-md', 'AGENTS.md']]) {
    const repo = path.join(temp, `${flag.slice(2)} repo with spaces`); fs.mkdirSync(repo);
    const instructions = write(repo, fileName, `Vlastní pokyn ${utf8}\n`);
    const localSettings = write(repo, '.claude/settings.local.json', JSON.stringify({ permissions: { defaultMode: 'bypassPermissions' }, marker: utf8 }));
    const settingsBefore = digest(userSettings), localBefore = digest(localSettings);
    const first = run([workspace, flag, repo], { ...env, CLAUDE_PROJECT_DIR: repo });
    assert.equal(first.status, 0, first.stderr);
    const once = fs.readFileSync(instructions);
    const second = run([workspace, flag, repo], { ...env, CLAUDE_PROJECT_DIR: repo });
    assert.equal(second.status, 0, second.stderr);
    assert.ok(fs.readFileSync(instructions).equals(once), `${flag} is idempotent`);
    const text = fs.readFileSync(instructions, 'utf8');
    assert.ok(text.includes(`Vlastní pokyn ${utf8}\n`), `${flag} preserves existing Czech UTF-8 text`);
    assert.ok(fs.readFileSync(instructions).subarray(0, Buffer.byteLength(`Vlastní pokyn ${utf8}\n`, 'utf8')).equals(Buffer.from(`Vlastní pokyn ${utf8}\n`, 'utf8')), `${flag} writes Czech text as UTF-8 bytes`);
    const match = text.match(/<!-- auditor:role[\s\S]*?<!-- \/auditor:role -->/);
    assert.ok(match, `${flag} writes a managed role block`);
    const roleBytes = Buffer.byteLength(match[0], 'utf8'); maxRoleBytes = Math.max(maxRoleBytes, roleBytes);
    assert.ok(roleBytes <= 4500, `${flag} role core is at most 4500 UTF-8 bytes (got ${roleBytes})`);
    for (const required of ['Kapitán', 'Auditor', 'STOP-THE-LINE', 'pracuj jen na nich', 'souhlas', 'tajemství', 'ostré databáze', 'chat_id', 'ROLE_POSTUP.md']) {
      assert.ok(match[0].includes(required), `${flag} preserves core invariant: ${required}`);
    }
    for (const required of ['Cíl a plán mají přednost', 'KANBAN.md', 'Kdo co dělá', 'mlčení není souhlas', 'Kdy přestat', 'cestu zpět']) {
      assert.ok(match[0].toLowerCase().includes(required.toLowerCase()), `${flag} preserves workflow invariant: ${required}`);
    }
    assert.ok(match[0].includes('## Tvoje role: Kapitán (závazné)'), `${flag} keeps the stable role heading`);
    assert.ok(!match[0].includes('každá položka stojí kontext v každém kroku'), `${flag} avoids unsupported per-turn catalog claims`);
    assert.equal(digest(userSettings), settingsBefore, `${flag} does not touch user-level Claude settings`);
    assert.equal(digest(localSettings), localBefore, `${flag} exits before settings synchronization`);
    if (flag === '--agents-md') {
      assert.ok(match[0].includes('C:/'), 'Codex receives native Windows absolute paths');
      assert.ok(!match[0].includes('/c/'), 'Codex does not receive Git Bash absolute paths');
      assert.match(match[0], /node "C:\/[^\n]*gate-check\.mjs"/);
      assert.ok(!/implementator|sonnet|haiku/i.test(match[0]), 'Codex role does not assume Claude model names or a fixed helper');
      assert.ok(match[0].includes('.codex/STATE.md') && match[0].includes('.codex/KANBAN.md'));
    assert.ok(match[0].includes('node "C:/') && match[0].includes('/kapitan-side/auditor-bus.mjs" --workspace "C:/'), 'Codex role uses the explicit workspace wrapper');
      write(workspace, 'tools/katalog.mjs', '// fixture only\n');
      for (const relative of ['tools/bus.mjs', 'tools/bus-store.mjs', 'kapitan-side/auditor-bus.mjs']) {
        const source = path.join(packageRoot, relative); const target = path.join(workspace, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
      }
      write(repo, '.claude/katalog.json', JSON.stringify({ posouzeno: true }));
      const runtime = run([workspace, '--codex'], { ...env, CLAUDE_PROJECT_DIR: repo });
      assert.equal(runtime.status, 0, runtime.stderr);
      assert.match(runtime.stdout, /node "C:\/[^\n]*\/kapitan-side\/auditor-bus\.mjs" --workspace "C:\/[^\n]*" post/);
      assert.match(runtime.stdout, /doporuc --cil \. --harness codex/);
      assert.doesNotMatch(runtime.stdout, /Po posouzení se tahle věta přestane zobrazovat|každá položka stojí kontext/);
      write(repo, '.codex/katalog.json', JSON.stringify({ posouzeno: true }));
      const reviewedRuntime = run([workspace, '--codex'], { ...env, CLAUDE_PROJECT_DIR: repo });
      assert.equal(reviewedRuntime.status, 0, reviewedRuntime.stderr);
      assert.doesNotMatch(reviewedRuntime.stdout, /doporuc --cil \. --harness codex/);
      const isolatedEnv = { ...env, CLAUDE_PROJECT_DIR: repo }; delete isolatedEnv.AUDITOR_WORKSPACE;
      const wrapper = path.join(workspace, 'kapitan-side', 'auditor-bus.mjs');
      const runWrapper = (...args) => spawnSync(process.execPath, [wrapper, ...args], { cwd: repo, encoding: 'utf8', env: isolatedEnv, timeout: 10000 });
      const idResult = runWrapper('nove-id', '--workspace', workspace);
      assert.equal(idResult.status, 0, idResult.stderr);
      const generatedId = idResult.stdout.trim(); assert.match(generatedId, /^K-\d+$/);
      const post = runWrapper('post', '--workspace', workspace, '--from', 'auditor', '--type', 'STATUS', '--id', generatedId, '--status', 'STARTED', '--text', utf8);
      assert.equal(post.status, 0, post.stderr);
      const busFiles = fs.readdirSync(path.join(workspace, 'AUDIT/bus')).filter(file => file.endsWith('.json') && !file.startsWith('.'));
      assert.equal(busFiles.length, 1);
      const message = JSON.parse(fs.readFileSync(path.join(workspace, 'AUDIT/bus', busFiles[0]), 'utf8'));
      assert.equal(message.id, generatedId); assert.equal(message.from, 'kapitan'); assert.equal(message.to, 'auditor'); assert.equal(message.text, utf8);
      const invalidWorkspace = runWrapper('nove-id', '--workspace', path.join(temp, 'missing workspace'));
      assert.equal(invalidWorkspace.status, 1, 'Missing explicit workspaces fail closed');
    }
  }
  console.log(`kapitan-role-compact: PASS (max role core ${maxRoleBytes} UTF-8 bytes)`);
} catch (error) {
  console.error(`kapitan-role-compact: FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
