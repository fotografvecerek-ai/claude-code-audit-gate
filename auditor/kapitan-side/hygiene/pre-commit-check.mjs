#!/usr/bin/env node
// PRE-COMMIT CHECK — jediná implementace hygieny pro git hook (volá ji pre-commit-guard.sh). Exit 1 = commit odmítnut.
import { createRequire } from 'node:module'; import { execSync, execFileSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url); const here = path.dirname(fileURLToPath(import.meta.url));
const { load } = require(path.join(here, 'hygiene-rules.js')); const R = load(process.argv[2]);
const sh = c => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 }); } catch { return ''; } };
const staged = sh('git diff --cached --name-only --diff-filter=AM -z').split('\0').filter(Boolean);
// pravidla UMÍSTĚNÍ (root allowlist, junk, skripty jen ve scripts/) platí jen pro NOVÉ soubory — úprava existujícího souboru na starém místě se nesmí blokovat,
// jinak by Kapitán nemohl opravit chybu, dokud soubor nepřesune (a přesun je samostatná HYG položka). Binárky/tajemství/velikost platí pro nové i změněné.
const added = new Set(sh('git diff --cached --name-only --diff-filter=A -z').split('\0').filter(Boolean));
const problems = [];
for (const f of staged) {
  const base = path.basename(f); const inRoot = !f.includes('/'); const isNew = added.has(f);
  if (isNew && inRoot && !R.rootAllow.test(base)) problems.push(`root: ${f} — nové soubory v rootu jen z allowlistu (skripty → scripts/, dokumenty → docs/)`);
  if (isNew && R.junk.test(base) && !R.tmpOkDirs.test(f)) problems.push(`junk: ${f} — provizoria patří do .tmp/tasks/<ID>/ (gitignored) nebo do archivu mimo repo`);
  if (isNew && R.scriptExt.test(base) && !R.scriptOkDirs.test(f)) problems.push(`script: ${f} — skripty jen ve scripts/ (pojmenované, s vlastníkem)`);
  if (R.secret.test(f) && !R.secretOk.test(f)) problems.push(`secret: ${f} — tajemství se necommitují (a klíč rotuj)`);
  if (R.buildDirs.test(f)) problems.push(`build-output: ${f} — build výstupy do gitu nepatří`);
  if (R.binExt.test(base) && !R.binOkDirs.test(f)) problems.push(`binary: ${f} — binárky jen v public/assets; exporty/dumpy/zipy → archiv mimo repo`);
  const size = +sh(`git cat-file -s ":${f}"`) || 0; if (size / 1024 > R.maxFileKb) problems.push(`size: ${f} ${Math.round(size / 1024)} KB > ${R.maxFileKb} KB`);
  if (!R.binExt.test(base) && !R.textExt.test(base)) { let head = Buffer.alloc(0); try { head = execFileSync('git', ['cat-file', '-p', `:${f}`], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 }).subarray(0, 4096); } catch { } if (head.includes(0)) problems.push(`binary-content: ${f} obsahuje NUL bajty`); }
}
if (problems.length) { console.error(problems.map(p => 'BLOCK ' + p).join('\n') + `\npre-commit-check (${path.basename(R.__file)}): commit odmítnut. Výjimku schvaluje jen vlastník: git commit --no-verify + důvod do zprávy.`); process.exit(1); }
process.exit(0);
