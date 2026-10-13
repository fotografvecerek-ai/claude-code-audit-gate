import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-deploy-guard-'));
const workspace = path.join(temp, 'workspace'), repo = path.join(temp, 'repo');
fs.mkdirSync(workspace); fs.mkdirSync(repo);
const env = { ...process.env, AUDITOR_WORKSPACE: workspace, AUDITOR_TARGET_REPO: repo,
  HYGIENE_RULES: path.join(pkg, 'kapitan-side/hygiene/hygiene-rules.json') };
const captain = path.join(pkg, 'kapitan-side/kapitan-audit-guard.js');
const auditor = path.join(pkg, '.claude/hooks/auditor-guard.js');
const inputFor = command => JSON.stringify({ cwd: repo, tool_name: 'Bash', tool_input: { command } });
const run = (file, command) => spawnSync(process.execPath, [file], { input: inputFor(command), env, encoding: 'utf8', timeout: 10000 });
const check = (name, file, command, expected) => {
  const result = run(file, command);
  assert.equal(result.status, expected, `${name}: exit=${result.status}; stderr=${result.stderr}`);
};

try {
  const captainMutations = [
    'vercel deploy', 'vercel --prod', 'vercel rollback https://example.invalid', 'vercel redeploy id',
    'vercel promote id', 'vercel alias set x y', 'vercel --scope team deploy',
    'vercel deploy --target production', 'vercel deploy --target=production',
    'npx vercel@latest deploy', 'vercel env add NAME', 'vercel env rm NAME', 'vercel env update NAME',
    'vercel --target', 'vercel --scope',
  ];
  for (const command of captainMutations) check(`Captain blocks ${command}`, captain, command, 2);
  for (const command of [
    `node -e "require('node:child_process').execSync('vercel --prod')"`,
    `python -c "import subprocess; subprocess.run(['vercel', '--prod'])"`,
  ]) check(`Captain fails closed for inline Vercel: ${command}`, captain, command, 2);
  for (const command of ['vercel rollback status', 'vercel env ls', 'vercel list', 'vercel inspect id', 'vercel logs id', 'vercel --help', 'vercel --version']) {
    check(`Captain allows ${command}`, captain, command, 0);
  }
  for (const command of [
    'echo "$(vercel rollback https://example.invalid)"',
    'echo "`vercel rollback https://example.invalid`"',
    'echo "$(printf x $(vercel rollback https://example.invalid))"',
    'echo "$(printf x "$(vercel rollback https://example.invalid)")"',
    'echo "$(echo "$(echo "$(echo "$(vercel rollback https://example.invalid)")")")"',
    'echo "$(printf x',
  ]) check(`Captain sees active substitution: ${command}`, captain, command, 2);
  for (const command of [
    "echo '$(vercel rollback https://example.invalid)'", 'echo "\\$(vercel rollback https://example.invalid)"',
    'echo "\\`vercel rollback https://example.invalid\\`"',
  ]) check(`Captain ignores inert literal: ${command}`, captain, command, 0);

  for (const command of [
    'vercel rollback status', 'echo "$(vercel rollback https://example.invalid)"',
    'echo "`vercel rollback https://example.invalid`"', 'echo "$(printf x $(vercel rollback https://example.invalid))"',
    'echo "$(printf x "$(vercel rollback https://example.invalid)")"', 'echo "$(printf x',
    `node -e "require('node:child_process').execSync('vercel --prod')"`,
    `python -c "import subprocess; subprocess.run(['vercel', '--prod'])"`,
    'echo "$(echo "$(echo "$(echo "$(vercel rollback https://example.invalid)")")")"',
  ]) check(`Auditor blocks Vercel or active substitution: ${command}`, auditor, command, 2);
  for (const command of [
    "echo '$(vercel rollback https://example.invalid)'", 'echo "\\$(vercel rollback https://example.invalid)"',
    'echo "\\`vercel rollback https://example.invalid\\`"', 'echo ordinary text',
  ]) check(`Auditor allows inert literal: ${command}`, auditor, command, 0);
  console.log('deploy-command-guard: PASS');
} catch (error) {
  console.error(`deploy-command-guard: FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
