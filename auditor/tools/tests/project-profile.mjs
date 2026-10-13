import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.resolve(here, '..', 'project-profile.mjs');
const { profileProject } = await import(pathToFileURL(modulePath));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-profile-'));
const utf8 = 'ščřžýáíéúůďťňĚŠČŘŽ';
const write = (base, name, value = '') => {
  const file = path.join(base, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
};
const profile = name => profileProject(path.join(root, name));
const includes = (items, value) => items.some(item => String(item).toLowerCase() === value.toLowerCase());

try {
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, 'js3'));
  write(path.join(root, 'js3'), 'package.json', JSON.stringify({ dependencies: { playwright: '1.0.0' } }));
  write(path.join(root, 'js3'), 'main.js', 'const x = 1;');
  const js = profile('js3');
  assert.ok(includes(js.languages, 'javascript'), 'JS3 detects JavaScript');
  assert.ok(!includes(js.languages, 'typescript'), 'JS3 must not be mislabeled TypeScript');
  assert.ok(includes(js.signals, 'javascript'));

  fs.mkdirSync(path.join(root, 'react-library'));
  write(path.join(root, 'react-library'), 'package.json', JSON.stringify({ dependencies: { react: '18' } }));
  write(path.join(root, 'react-library'), 'src/index.jsx', 'export const Component = () => null;');
  assert.ok(!includes(profile('react-library').signals, 'web'), 'React core alone does not prove a web framework');

  fs.mkdirSync(path.join(root, 'vite-tool'));
  write(path.join(root, 'vite-tool'), 'package.json', JSON.stringify({ devDependencies: { vite: '5' } }));
  write(path.join(root, 'vite-tool'), 'vite.config.js', 'export default {};');
  assert.ok(!includes(profile('vite-tool').signals, 'web'), 'Vite build config alone does not prove a web app');

  fs.mkdirSync(path.join(root, 'js-with-tooling'));
  write(path.join(root, 'js-with-tooling'), 'package.json', JSON.stringify({ devDependencies: { typescript: '5', vitest: '3' } }));
  write(path.join(root, 'js-with-tooling'), 'src/app.js', 'export const value = 1;');
  const jsWithTooling = profile('js-with-tooling');
  assert.ok(includes(jsWithTooling.languages, 'javascript'));
  assert.ok(!includes(jsWithTooling.languages, 'typescript'), 'Compiler dependency alone does not prove TS source');
  assert.ok(!includes(jsWithTooling.signals, 'typescript'));
  assert.ok(includes(jsWithTooling.signals, 'testovani'));
  assert.ok(!includes(jsWithTooling.signals, 'e2e'), 'Vitest is unit-test tooling, not E2E');

  fs.mkdirSync(path.join(root, 'unit-tests', 'tests'), { recursive: true });
  write(path.join(root, 'unit-tests'), 'tests/add.test.js', 'test("sum", () => {});');
  write(path.join(root, 'unit-tests'), 'tests/smoke.cpp', 'int main() { return 0; }');
  const unitTests = profile('unit-tests');
  assert.ok(includes(unitTests.signals, 'testovani'));
  assert.ok(!includes(unitTests.signals, 'e2e'), 'Generic test names do not imply E2E');
  assert.ok(!unitTests.signals.includes('api'), 'Test filenames do not infer API usage');

  fs.mkdirSync(path.join(root, 'python'));
  write(path.join(root, 'python'), 'pyproject.toml', '[project]\nname="fixture"');
  write(path.join(root, 'python'), 'app.py', 'print("ok")');
  assert.ok(includes(profile('python').languages, 'python'), 'Python source is detected');

  fs.mkdirSync(path.join(root, 'desktop'));
  write(path.join(root, 'desktop'), 'CMakeLists.txt', 'project(f LANGUAGES CXX)\nfind_package(Qt6 REQUIRED COMPONENTS Widgets)');
  write(path.join(root, 'desktop'), 'src/main.cpp', '#include <QApplication>');
  const cpp = profile('desktop');
  assert.ok(includes(cpp.languages, 'cpp'), 'C++ source is detected');
  assert.ok(includes(cpp.stacks, 'qt'), 'Qt evidence is detected');
  assert.ok(!includes(cpp.signals, 'web'), 'Qt desktop is not a web app');
  assert.ok(!includes(cpp.signals, 'api'), 'C++ source alone is not an API');

  fs.mkdirSync(path.join(root, 'cpp-generic'));
  write(path.join(root, 'cpp-generic'), 'CMakeLists.txt', 'project(f LANGUAGES CXX)');
  write(path.join(root, 'cpp-generic'), 'main.cpp', 'int main() { return 0; }');
  const genericCpp = profile('cpp-generic');
  assert.ok(includes(genericCpp.languages, 'cpp'));
  assert.equal(genericCpp.purposes.length, 0, 'Generic C++ stays without an inferred desktop purpose');

  fs.mkdirSync(path.join(root, 'qt-core'));
  write(path.join(root, 'qt-core'), 'CMakeLists.txt', 'find_package(Qt6 REQUIRED COMPONENTS Core)');
  write(path.join(root, 'qt-core'), 'main.cpp', 'int main() { return 0; }');
  const qtCore = profile('qt-core');
  assert.ok(!qtCore.purposes.some(item => item.name === 'desktopová aplikace'), 'Qt Core alone is not a GUI app');

  fs.mkdirSync(path.join(root, 'c-language'));
  write(path.join(root, 'c-language'), 'main.c', 'int main(void) { return 0; }');
  const cLanguage = profile('c-language');
  assert.ok(includes(cLanguage.languages, 'c'), '.c is classified as C');
  assert.ok(!includes(cLanguage.languages, 'cpp'));

  fs.mkdirSync(path.join(root, 'header-only'));
  write(path.join(root, 'header-only'), 'common.h', 'int value;');
  assert.ok(!includes(profile('header-only').languages, 'cpp'), '.h alone does not prove C++');

  fs.mkdirSync(path.join(root, 'macro'));
  write(path.join(root, 'macro'), 'Module1.bas', 'Attribute VB_Name = "Module1"\nSub RunAudit()\nEnd Sub');
  write(path.join(root, 'macro'), 'Workbook.xlsm', 'workbook');
  const vba = profile('macro');
  assert.ok(!includes(vba.languages, 'vba'), '.bas extension alone does not prove VBA');
  assert.ok(includes(vba.signals, 'vba-neověřeno'), 'BAS/VBA possibility is explicitly weak');
  assert.ok(!includes(vba.signals, 'web'), 'VBA workbook is not a web app');
  assert.ok(vba.evidence.some(item => /\.bas$/i.test(item.path)), 'VBA evidence names its source file');

  fs.mkdirSync(path.join(root, 'macro-export'));
  write(path.join(root, 'macro-export'), 'Export.bas', 'Sub ExportData()\nEnd Sub');
  write(path.join(root, 'macro-export'), 'Workbook.xlsm', 'binary marker must not be read');
  write(path.join(root, 'macro-export'), 'exports/result.csv', 'id,value\n1,ok');
  const macroExport = profile('macro-export');
  const macroPurpose = macroExport.purposes.find(item => item.name === 'automatizace tabulek');
  assert.equal(macroPurpose?.confidence, 'low');
  assert.ok(macroPurpose?.evidence.some(item => item.path.endsWith('.bas')));
  assert.ok(macroPurpose?.evidence.some(item => item.path.endsWith('.xlsm')));

  fs.mkdirSync(path.join(root, 'workbook-only'));
  write(path.join(root, 'workbook-only'), 'Book.xlsm', 'workbook marker only');
  const workbook = profile('workbook-only');
  assert.ok(!includes(workbook.languages, 'vba'), 'Workbook alone does not confirm VBA');
  assert.ok(workbook.evidence.some(item => item.signal === 'vba-neověřeno'), 'Workbook is a weak, explicit possibility');

  fs.mkdirSync(path.join(root, 'ts-pg'));
  write(path.join(root, 'ts-pg'), 'package.json', JSON.stringify({ dependencies: { typescript: '5', pg: '8' } }));
  write(path.join(root, 'ts-pg'), 'src/index.ts', 'export const value: number = 1;');
  const tsPg = profile('ts-pg');
  assert.ok(includes(tsPg.languages, 'typescript'));
  assert.ok(includes(tsPg.databases, 'postgresql'), 'pg dependency identifies PostgreSQL');
  assert.ok(includes(tsPg.signals, 'postgres'));
  assert.ok(includes(tsPg.signals, 'typescript'));

  fs.mkdirSync(path.join(root, 'sql'));
  write(path.join(root, 'sql'), 'schema.sql', 'CREATE TABLE item (id INTEGER);');
  const sql = profile('sql');
  assert.ok(includes(sql.languages, 'sql'));
  assert.ok(!includes(sql.databases, 'postgresql'), 'Generic SQL does not imply PostgreSQL');
  assert.ok(includes(sql.signals, 'sql'));

  fs.mkdirSync(path.join(root, 'mixed', 'apps', 'web'), { recursive: true });
  write(path.join(root, 'mixed'), 'package.json', JSON.stringify({ workspaces: ['apps/*'] }));
  write(path.join(root, 'mixed', 'apps', 'web'), 'package.json', JSON.stringify({ dependencies: { react: '18', 'react-dom': '18', vite: '5' } }));
  write(path.join(root, 'mixed', 'apps', 'web'), 'src/App.tsx', 'export default function App() { return <main />; }');
  write(path.join(root, 'mixed'), 'worker.py', 'print("worker")');
  const mixed = profile('mixed');
  assert.ok(includes(mixed.languages, 'typescript') && includes(mixed.languages, 'python'));
  assert.ok(includes(mixed.signals, 'mixed'));
  assert.ok(mixed.evidence.some(item => item.path.includes('apps/web/src/App.tsx')));

  fs.mkdirSync(path.join(root, 'prisma-multifile', 'apps', 'web', 'prisma', 'schema'), { recursive: true });
  write(path.join(root, 'prisma-multifile'), 'apps/web/prisma/schema/00_base.prisma', 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n');
  write(path.join(root, 'prisma-multifile'), 'apps/web/prisma/schema/10_models.prisma', 'model User {\n  id Int @id\n}\n');
  const prisma = profile('prisma-multifile');
  assert.ok(includes(prisma.databases, 'postgresql'), 'Nested multi-file Prisma datasource identifies PostgreSQL');
  assert.ok(prisma.evidence.some(item => item.path === 'apps/web/prisma/schema/00_base.prisma' && item.signal === 'postgres'));

  fs.mkdirSync(path.join(root, 'prisma-false-markers', 'prisma'), { recursive: true });
  write(path.join(root, 'prisma-false-markers'), 'prisma/comment-only.prisma', '// datasource db { provider = "postgresql" }\n/* datasource db { provider = "postgresql" } */\n');
  write(path.join(root, 'prisma-false-markers'), 'prisma/generator.prisma', 'generator client {\n  provider = "prisma-client-js"\n}\n');
  write(path.join(root, 'prisma-false-markers'), 'prisma/string-only.prisma', 'generator client {\n  provider = "prisma-client-js"\n  output = "datasource db { provider = \\"postgresql\\" }"\n}\n');
  const prismaFalseMarkers = profile('prisma-false-markers');
  assert.ok(!includes(prismaFalseMarkers.databases, 'postgresql'), 'Comments, generator blocks, and strings do not imply PostgreSQL');

  fs.mkdirSync(path.join(root, 'prisma-budget', 'prisma', 'schema'), { recursive: true });
  for (let index = 0; index < 101; index++) {
    write(path.join(root, 'prisma-budget'), `prisma/schema/${String(index).padStart(3, '0')}.prisma`, 'model Item { id Int @id }');
  }
  const prismaBudget = profile('prisma-budget');
  assert.equal(prismaBudget.counts.filesScanned, 100, 'Priority Prisma schema reads stay within the dedicated budget');
  assert.equal(prismaBudget.confidence, 'low', 'Hitting the Prisma schema budget marks the profile incomplete');

  fs.mkdirSync(path.join(root, 'prisma-legacy-marker', 'prisma'), { recursive: true });
  write(path.join(root, 'prisma-legacy-marker'), 'prisma/migrations/migration_lock.toml', 'provider = "postgresql"\n');
  assert.ok(!includes(profile('prisma-legacy-marker').databases, 'postgresql'), 'migration_lock.toml is only a weak historical marker');

  fs.mkdirSync(path.join(root, 'capacitor-hybrid'));
  write(path.join(root, 'capacitor-hybrid'), 'package.json', JSON.stringify({ dependencies: { '@capacitor/core': '7', '@capacitor/android': '7', '@capacitor/cli': '7' } }));
  const capacitor = profile('capacitor-hybrid');
  assert.ok(includes(capacitor.stacks, 'capacitor'), 'Capacitor core with a platform identifies hybrid stack');
  assert.ok(includes(capacitor.signals, 'mobile-hybrid'));

  fs.mkdirSync(path.join(root, 'capacitor-plugin-only'));
  write(path.join(root, 'capacitor-plugin-only'), 'package.json', JSON.stringify({ dependencies: { '@capacitor/core': '7', '@capacitor/geolocation': '7' } }));
  assert.ok(!includes(profile('capacitor-plugin-only').signals, 'mobile-hybrid'), 'Capacitor plugin without a platform does not imply hybrid app');

  fs.mkdirSync(path.join(root, 'priority-monorepo', 'apps', 'web'), { recursive: true });
  write(path.join(root, 'priority-monorepo'), 'package.json', JSON.stringify({ workspaces: ['apps/*'], dependencies: { express: '5', pg: '8' } }));
  write(path.join(root, 'priority-monorepo', 'apps', 'web'), 'package.json', JSON.stringify({ dependencies: { next: '15' } }));
  fs.mkdirSync(path.join(root, 'priority-monorepo', '.playwright-mcp'), { recursive: true });
  const priorityRoot = path.join(root, 'priority-monorepo');
  const fakeEntry = (name, kind) => ({ name, isSymbolicLink: () => false, isDirectory: () => kind === 'dir', isFile: () => kind === 'file' });
  const priorityFs = { ...fs, opendirSync(dir, options) {
    if (dir === priorityRoot) {
      const entries = [fakeEntry('.playwright-mcp', 'dir'), fakeEntry('package.json', 'file'), fakeEntry('apps', 'dir')];
      let index = 0;
      return { readSync() { return entries[index++] || null; }, closeSync() {} };
    }
    if (dir === path.join(priorityRoot, '.playwright-mcp')) {
      let index = 0;
      return { readSync() { return index < 20002 ? fakeEntry(`screenshot-${index++}.png`, 'file') : null; }, closeSync() {} };
    }
    return fs.opendirSync(dir, options);
  } };
  const priority = profileProject(priorityRoot, { filesystem: priorityFs });
  assert.ok(includes(priority.databases, 'postgresql'), 'Root package manifest is processed despite large artifacts');
  assert.ok(includes(priority.signals, 'api'), 'Root runtime framework is processed before nested noise');
  assert.ok(includes(priority.stacks, 'next'), 'Active apps/web manifest is found before low-priority tree');
  assert.ok(!priority.evidence.some(item => item.path.includes('.playwright-mcp')));
  assert.ok(priority.counts.skippedArtifactDirectories >= 1);

  fs.mkdirSync(path.join(root, 'manifest-after-limit', 'apps', 'web'), { recursive: true });
  write(path.join(root, 'manifest-after-limit', 'apps', 'web'), 'package.json', JSON.stringify({ dependencies: { next: '15' } }));
  const manifestRoot = path.join(root, 'manifest-after-limit');
  const manifestFs = { ...fs, opendirSync(dir, options) {
    if (dir === manifestRoot) {
      const entries = Array.from({ length: 10005 }, (_, i) => fakeEntry(`virtual-${i}.js`, 'file'));
      entries.push(fakeEntry('apps', 'dir'));
      let index = 0;
      return { readSync() { return entries[index++] || null; }, closeSync() {} };
    }
    return fs.opendirSync(dir, options);
  } };
  const afterLimit = profileProject(manifestRoot, { filesystem: manifestFs });
  assert.ok(includes(afterLimit.stacks, 'next'), 'Nested framework manifest remains discoverable after the source-file cap');
  assert.equal(afterLimit.confidence, 'low', 'The source-file cap still marks the profile incomplete');

  fs.mkdirSync(path.join(root, 'prisma-after-limit', 'apps', 'web', 'prisma', 'schema'), { recursive: true });
  write(path.join(root, 'prisma-after-limit'), 'apps/web/prisma/schema/00_base.prisma', 'datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}\n');
  const prismaAfterRoot = path.join(root, 'prisma-after-limit');
  const prismaAfterFs = { ...fs, opendirSync(dir, options) {
    const entriesByDir = new Map([
      [prismaAfterRoot, [...Array.from({ length: 10005 }, (_, i) => fakeEntry(`virtual-${i}.js`, 'file')), fakeEntry('apps', 'dir')]],
      [path.join(prismaAfterRoot, 'apps'), [fakeEntry('web', 'dir')]],
      [path.join(prismaAfterRoot, 'apps', 'web'), [fakeEntry('prisma', 'dir')]],
      [path.join(prismaAfterRoot, 'apps', 'web', 'prisma'), [fakeEntry('schema', 'dir')]],
      [path.join(prismaAfterRoot, 'apps', 'web', 'prisma', 'schema'), [fakeEntry('00_base.prisma', 'file')]],
    ]);
    if (!entriesByDir.has(dir)) return fs.opendirSync(dir, options);
    const entries = entriesByDir.get(dir); let index = 0;
    return { readSync() { return entries[index++] || null; }, closeSync() {} };
  } };
  const prismaAfterLimit = profileProject(prismaAfterRoot, { filesystem: prismaAfterFs });
  assert.ok(includes(prismaAfterLimit.databases, 'postgresql'), 'Prisma schema remains discoverable after the source-file cap');
  assert.ok(includes(prismaAfterLimit.stacks, 'prisma'), 'Prisma stack evidence is retained after the source-file cap');
  assert.equal(prismaAfterLimit.confidence, 'low', 'The source-file cap still marks the profile incomplete');

  fs.mkdirSync(path.join(root, 'bounded-output', 'docs'), { recursive: true });
  for (let i = 0; i < 160; i++) {
    write(path.join(root, 'bounded-output'), `src/module-${i}.js`, 'export const value = 1;');
    write(path.join(root, 'bounded-output'), `docs/spec-${i}.yaml`, 'ordinary content, not a dependency manifest');
  }
  const bounded = profile('bounded-output');
  assert.ok(bounded.evidence.length <= 100, 'Evidence list is capped');
  assert.ok(bounded.evidenceSummary.truncated && bounded.evidenceSummary.total > bounded.evidence.length);
  assert.ok(bounded.limitations.length <= 30, 'Limitations remain compact');
  assert.ok(!bounded.limitations.some(item => item.includes('spec-')),'Ordinary YAML files are not individually called unparsed manifests');
  const boundedCli = spawnSync(process.execPath, [modulePath, path.join(root, 'bounded-output')], { encoding: 'utf8' });
  assert.equal(boundedCli.status, 0);
  assert.ok(Buffer.byteLength(boundedCli.stdout, 'utf8') <= 40000, 'CLI profile output stays bounded');

  fs.mkdirSync(path.join(root, 'unknown'));
  write(path.join(root, 'unknown'), 'notes.txt', 'ordinary notes');
  const unknown = profile('unknown');
  assert.ok(includes(unknown.signals, 'unknown'));
  assert.equal(unknown.purposes.length, 0, 'No purpose is inferred from the directory name');

  fs.mkdirSync(path.join(root, 'tmp-fixtures', '.tmp/tasks'), { recursive: true });
  write(path.join(root, 'tmp-fixtures'), '.tmp/tasks/generated.ts', 'export const ignored: number = 1;');
  assert.ok(!includes(profile('tmp-fixtures').languages, 'typescript'), 'Temporary fixture artifacts do not alter project profile');

  fs.mkdirSync(path.join(root, 'filtered', '.git'), { recursive: true });
  fs.mkdirSync(path.join(root, 'filtered', 'node_modules', 'pkg'), { recursive: true });
  fs.mkdirSync(path.join(root, 'filtered', 'vendor', 'pkg'), { recursive: true });
  fs.mkdirSync(path.join(root, 'filtered', 'build'), { recursive: true });
  fs.mkdirSync(path.join(root, 'filtered', '.venv', 'Lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'filtered', 'AUDIT'), { recursive: true });
  fs.mkdirSync(path.join(root, 'filtered', '.claude'), { recursive: true });
  fs.mkdirSync(path.join(root, 'filtered', '.codex'), { recursive: true });
  fs.mkdirSync(path.join(root, 'filtered', '.agents'), { recursive: true });
  write(path.join(root, 'filtered'), '.git/leak.py', '');
  write(path.join(root, 'filtered'), 'node_modules/pkg/leak.ts', '');
  write(path.join(root, 'filtered'), 'vendor/pkg/leak.cpp', '');
  write(path.join(root, 'filtered'), 'build/leak.sql', '');
  write(path.join(root, 'filtered'), '.venv/Lib/leak.py', '');
  write(path.join(root, 'filtered'), 'AUDIT/leak.sql', '');
  write(path.join(root, 'filtered'), '.claude/leak.ts', '');
  write(path.join(root, 'filtered'), '.codex/leak.ts', '');
  write(path.join(root, 'filtered'), '.agents/leak.py', '');
  for (const dir of ['.next', 'coverage', '__pycache__', 'cmake-build-debug', '.vs', 'third_party', '_deps']) {
    fs.mkdirSync(path.join(root, 'filtered', dir), { recursive: true });
    write(path.join(root, 'filtered'), `${dir}/leak.cpp`, '');
  }
  write(path.join(root, 'filtered'), 'README.md', 'scaffold');
  try { fs.symlinkSync(path.join(root, 'js3'), path.join(root, 'filtered', 'linked'), 'junction'); } catch {}
  const filtered = profile('filtered');
  assert.equal(filtered.languages.length, 0, 'Ignored scaffolding and symlink targets are excluded');
  assert.ok(filtered.limitations.length > 0, 'Bounded or skipped scan limitations are disclosed');

  fs.mkdirSync(path.join(root, 'invalid-manifest'));
  write(path.join(root, 'invalid-manifest'), 'package.json', '{broken');
  write(path.join(root, 'invalid-manifest'), 'app.js', 'const x = 1;');
  const invalidManifest = profile('invalid-manifest');
  assert.equal(invalidManifest.confidence, 'low', 'Invalid manifests reduce completeness confidence');
  assert.ok(invalidManifest.limitations.length);

  fs.mkdirSync(path.join(root, 'large-manifest'));
  write(path.join(root, 'large-manifest'), 'package.json', `{"scripts":{},"padding":"${'x'.repeat(1024 * 1024)}"}`);
  const largeManifest = profile('large-manifest');
  assert.equal(largeManifest.confidence, 'low', 'Oversized manifests reduce completeness confidence');

  fs.mkdirSync(path.join(root, 'unreadable-manifest'));
  write(path.join(root, 'unreadable-manifest'), 'package.json', '{"dependencies":{}}');
  const unreadablePath = path.join(root, 'unreadable-manifest', 'package.json');
  const unreadableFs = {
    ...fs,
    readFileSync(file, encoding) {
      if (file === unreadablePath) throw Object.assign(new Error('denied'), { code: 'EACCES' });
      return fs.readFileSync(file, encoding);
    },
  };
  assert.equal(profileProject(path.join(root, 'unreadable-manifest'), { filesystem: unreadableFs }).confidence, 'low');

  fs.mkdirSync(path.join(root, 'symlink-test'));
  const fakeLink = { name: 'link', isSymbolicLink: () => true, isDirectory: () => false, isFile: () => false };
  const symlinkFs = { ...fs, opendirSync(dir, options) {
    if (dir !== path.join(root, 'symlink-test')) return fs.opendirSync(dir, options);
    let read = false;
    return { readSync() { if (read) return null; read = true; return fakeLink; }, closeSync() {} };
  } };
  assert.ok(profileProject(path.join(root, 'symlink-test'), { filesystem: symlinkFs }).limitations.some(item => /Symbolické odkazy/.test(item)));

  fs.mkdirSync(path.join(root, 'entry-limit'));
  const entryRoot = path.join(root, 'entry-limit');
  const entryFs = { ...fs, opendirSync(dir, options) {
    if (dir !== entryRoot) return fs.opendirSync(dir, options);
    let index = 0;
    return { readSync() { return index < 20002 ? { name: `unused-${index++}`, isSymbolicLink: () => false, isDirectory: () => false, isFile: () => false } : null; }, closeSync() {} };
  } };
  const entryLimited = profileProject(entryRoot, { filesystem: entryFs });
  assert.equal(entryLimited.confidence, 'low', 'Entry budget includes non-file directory entries');
  assert.ok(entryLimited.limitations.some(item => /20000/.test(item)));

  fs.mkdirSync(path.join(root, 'czech'));
  write(path.join(root, 'czech'), 'README.md', utf8);
  write(path.join(root, 'czech'), '.env', 'password=do-not-leak');
  assert.equal(fs.readFileSync(path.join(root, 'czech', 'README.md'), 'utf8'), utf8, 'UTF-8 Czech text round-trips bit-exactly');
  assert.ok(includes(profile('czech').signals, 'tajemstvi'), 'Secret filename can be signaled without reading its content');
  const serialized = JSON.stringify(profile('czech'));
  assert.ok(!serialized.includes(root), 'Profile output contains no absolute filesystem path');
  assert.ok(!serialized.includes('do-not-leak'), 'Profile output does not expose secret-like config content');
  const cli = spawnSync(process.execPath, [modulePath, path.join(root, 'czech')], { encoding: 'utf8' });
  assert.equal(cli.status, 0, 'CLI succeeds');
  assert.doesNotThrow(() => JSON.parse(cli.stdout), 'CLI output is JSON');
  assert.ok(!cli.stdout.includes(root), 'CLI does not expose the absolute project path');
  const cliError = spawnSync(process.execPath, [modulePath, path.join(root, 'missing-private-repo')], { encoding: 'utf8' });
  assert.equal(cliError.status, 1);
  assert.ok(!cliError.stderr.includes(root), 'CLI errors do not reveal absolute paths');

  console.log('PASS: project-profile scenarios (34 groups)');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
