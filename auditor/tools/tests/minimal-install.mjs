import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const auditorDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const psFile = path.join(auditorDir, 'setup-auditor.ps1');
const shFile = path.join(auditorDir, 'setup-auditor.sh');
const updateFile = path.join(auditorDir, 'tools', 'update-install.mjs');
const hasPowerShellSetup = fs.existsSync(psFile);
const hasShellSetup = fs.existsSync(shFile);
const authDirectory = path.join(auditorDir, 'AUDIT', '.auth');
const hasInstalledMarker = fs.existsSync(authDirectory) && fs.statSync(authDirectory).isDirectory() && !fs.lstatSync(authDirectory).isSymbolicLink();
function detectLayout(setupFlags, installedMarker) {
  if (setupFlags[0] !== setupFlags[1]) throw new Error('Source bundle must contain both setup scripts or neither');
  if (setupFlags[0] && installedMarker) throw new Error('Ambiguous layout has both source setup scripts and installed marker');
  if (setupFlags[0]) return 'source';
  if (installedMarker) return 'installed';
  throw new Error('Neither source setup scripts nor installed workspace marker are present');
}
const layout = detectLayout([hasPowerShellSetup, hasShellSetup], hasInstalledMarker);
const hasSourceSetup = layout === 'source';
const psBytes = hasSourceSetup ? fs.readFileSync(psFile) : null;
const ps = psBytes?.toString('utf8').replace(/^\uFEFF/, '') ?? '';
const sh = hasSourceSetup ? fs.readFileSync(shFile, 'utf8') : '';
const update = fs.readFileSync(updateFile, 'utf8');
const workspaceRoot = path.resolve(auditorDir, '..');
const tempParent = path.join(workspaceRoot, '.tmp', 'tasks', 'K-005');
fs.mkdirSync(tempParent, { recursive: true });
const root = fs.mkdtempSync(path.join(tempParent, 'minimal-install-'));
let passed = 0;
function check(name, fn) { try { fn(); passed++; process.stdout.write(`PASS ${name}\n`); } catch (error) { process.stderr.write(`FAIL ${name}: ${error.message}\n`); } }

check('layout requires positive source or installed marker evidence', () => {
  assert.equal(detectLayout([true, true], false), 'source');
  assert.equal(detectLayout([false, false], true), 'installed');
  assert.throws(() => detectLayout([false, false], false), /Neither source setup scripts nor installed workspace marker/);
  assert.throws(() => detectLayout([true, false], true), /both setup scripts or neither/);
  assert.throws(() => detectLayout([true, true], true), /Ambiguous layout/);
});

if (hasSourceSetup) {
  check('PowerShell setup is UTF-8 with BOM and round trips Czech text', () => {
    assert.deepEqual([...psBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = 'ščřžýáíéúůďťňĚŠČŘŽ'; const file = path.join(root, 'roundtrip.txt'); fs.writeFileSync(file, text, 'utf8'); assert.equal(fs.readFileSync(file, 'utf8'), text);
  });
  check('setup scripts have no default package or browser install command', () => {
    assert(!/^\s*(?:npm\s+install|npx\s+playwright\s+install|playwright\s+install\s+chromium)\b/m.test(sh));
    assert(!/^\s*(?:npm\s+install|npx\s+playwright\s+install|playwright\s+install\s+chromium)\b/m.test(ps));
    assert.match(sh, /VOLITELNÉ UI\/a11y testy/); assert.match(ps, /UI\/a11y testy jsou volitelné/);
  });
  check('PowerShell setup has no npm or npx execution site', () => {
    const executableLines = ps.split(/\r?\n/).filter(line => !/^\s*(?:#|Write-Host|\$notes\s*\+=)/.test(line));
    assert(!executableLines.some(line => /(?:^|[;&|])\s*(?:npm\s+install|npx\s+playwright\s+install)/.test(line)));
  });
} else {
  process.stdout.write('INFO confirmed installed workspace marker; setup-script checks are source-bundle-only\n');
}
check('update reports optional tools and preserves marker as completion authority', () => {
  assert.match(update, /inst\.hotovo !== true/);
  assert.match(update, /volitelné UI\/a11y nástroje nejsou nainstalované/);
  assert.doesNotMatch(update, /execFileSync\(['"](?:npm|npx)['"]/);
});
const expected = hasSourceSetup ? 5 : 2;
process.stdout.write(`${passed}/${expected} PASS\n`);
fs.rmSync(root, { recursive: true, force: true });
if (passed !== expected) process.exitCode = 1;
