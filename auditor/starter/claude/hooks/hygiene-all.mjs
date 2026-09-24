#!/usr/bin/env node
// HYGIENE-ALL — stejná pravidla jako pre-commit, ale nad VŠEMI soubory v gitu (pro CI: zachytí i commit s --no-verify nebo z jiného stroje).
// Exit 1 = porušení. Pravidla: .claude/hooks/hygiene-rules.json (jediný zdroj).
import { createRequire } from 'node:module'; import { execFileSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url); const here = path.dirname(fileURLToPath(import.meta.url));
const R = require(path.join(here, 'hygiene-rules.js')).load(path.join(here, 'hygiene-rules.json'));
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64e6 }).split('\0').filter(Boolean);
const bad = [];
for (const f of files) {
  const base = path.basename(f);
  if (!f.includes('/') && !R.rootAllow.test(base)) bad.push(`root: ${f}`);
  if (R.junk.test(base) && !R.tmpOkDirs.test(f)) bad.push(`junk: ${f}`);
  if (R.scriptExt.test(base) && !R.scriptOkDirs.test(f)) bad.push(`skript mimo scripts/: ${f}`);
  if (R.secret.test(f) && !R.secretOk.test(f)) bad.push(`tajemství: ${f}`);
  if (R.buildDirs.test(f)) bad.push(`build výstup: ${f}`);
  if (R.binExt.test(base) && !R.binOkDirs.test(f)) bad.push(`binárka: ${f}`);
}
if (bad.length) { console.error(bad.map(b => 'BLOCK ' + b).join('\n') + `\nhygiene-all: ${bad.length} porušení pravidel pořádku (${files.length} souborů).`); process.exit(1); }
console.log(`hygiene-all: ${files.length} souborů v pořádku`);
