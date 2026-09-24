#!/usr/bin/env node
// HYGIENE SCAN — read-only inventura pořádku v repu. node tools/hygiene-scan.mjs <repo> > AUDIT/01_nalezy/hygiene.json
// Nic nemaže. Výstup = kandidáti + plošná čísla (root_junk, tracked_binaries, untracked) pro AK „= 0".
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const __dir = path.dirname(fileURLToPath(import.meta.url)); const R = createRequire(import.meta.url)(path.join(__dir, '..', 'kapitan-side', 'hygiene', 'hygiene-rules.js')).load(process.env.HYGIENE_RULES);
const ROOT_ALLOW = R.rootAllow, JUNK = R.junk, SCRIPT_EXT = R.scriptExt, BIN_EXT = R.binExt, BIN_OK_DIRS = R.binOkDirs, DUMP_DIRS = new RegExp(R.dumpDirs.source + '|^' + R.dumpDirs.source.slice(1, -1) + '/?$', 'i');
const repo = path.resolve(process.argv[2] || '.');
const sh = c => { try { return execSync(c, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256e6 }).trim(); } catch { return ''; } };
const rel = p => path.relative(repo, p).split(path.sep).join('/');
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turbo', 'playwright-report', 'test-results']);

const tracked = sh('git ls-files -z').split('\0').filter(Boolean);
const untracked = sh('git status --porcelain --untracked-files=all').split('\n').filter(l => l.startsWith('??')).map(l => l.slice(3));
const allFiles = []; (function walk(d, depth = 0) { if (depth > 12) return; let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of e) { if (SKIP.has(x.name)) continue; const p = path.join(d, x.name); if (x.isDirectory()) walk(p, depth + 1); else allFiles.push(rel(p)); } })(repo);

const rootFiles = allFiles.filter(f => !f.includes('/'));
const root_junk = rootFiles.filter(f => !ROOT_ALLOW.test(f));
const junk = allFiles.filter(f => JUNK.test(path.basename(f)) || (SCRIPT_EXT.test(f) && !R.scriptOkDirs.test(f)));
const dump_dirs = [...new Set(allFiles.map(f => f.split('/')[0]).filter(d => DUMP_DIRS.test(d)))];
const isBinary = f => { try { const fd = fs.openSync(path.join(repo, f), 'r'); const b = Buffer.alloc(4096); const n = fs.readSync(fd, b, 0, 4096, 0); fs.closeSync(fd); return b.subarray(0, n).includes(0); } catch { return false; } };
const tracked_binaries = tracked.filter(f => (BIN_EXT.test(f) && !BIN_OK_DIRS.test(f)) || (!BIN_EXT.test(f) && !R.textExt.test(f) && isBinary(f)))
  .map(f => { let s = 0; try { s = fs.statSync(path.join(repo, f)).size; } catch { } return { f, kb: Math.round(s / 1024) }; });
const tracked_build = tracked.filter(f => R.buildDirs.test(f));
const tracked_secrets = tracked.filter(f => R.secret.test(f) && !R.secretOk.test(f));
// velké objekty v historii
const big_history = sh('git rev-list --objects --all | git cat-file --batch-check="%(objecttype) %(objectname) %(objectsize) %(rest)" | awk \'$1=="blob" && $3>1048576 {print $3" "$4}\' | sort -rn | head -20').split('\n').filter(Boolean).map(l => { const [s, ...p] = l.split(' '); return { mb: +(s / 1048576).toFixed(1), path: p.join(' ') }; });
// dokumenty: stáří + odkazovanost
const docs = allFiles.filter(f => /\.(md|txt)$/i.test(f) && !/^node_modules/.test(f));
const corpus = allFiles.filter(f => /\.(ts|tsx|js|mjs|json|md|yml|yaml|py|html)$/i.test(f)).map(f => { try { return fs.readFileSync(path.join(repo, f), 'utf8'); } catch { return ''; } }).join('\n');
const doc_inventory = docs.map(f => { const last = sh(`git log -1 --format=%cs -- "${f}"`) || null; const base = path.basename(f); const refs = (corpus.match(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length - 1; const days = last ? Math.round((Date.now() - Date.parse(last)) / 864e5) : null; return { f, last_commit: last, days, referenced: refs > 0, kb: Math.round((fs.statSync(path.join(repo, f)).size) / 1024) }; });
const unreferenced_stale_docs = doc_inventory.filter(d => !d.referenced && (d.days === null || d.days > 60) && !/^(README|CHANGELOG|LICENSE|CLAUDE)/i.test(path.basename(d.f)));
const multi_docs = {}; for (const d of docs) { const k = path.basename(d).toLowerCase().replace(/\.(md|txt)$/, '').replace(/[-_ .]?(v?\d+|\(\d+\)|copy|kopie|final|old|new|stara|nova|backup|zaloha|draft)/g, '').replace(/[-_ .]+$/, ''); (multi_docs[k] ||= []).push(d); }
const duplicate_doc_names = Object.fromEntries(Object.entries(multi_docs).filter(([, v]) => v.length > 1));
const dupe_names = {}; for (const f of allFiles.filter(f => /\.(ts|tsx|js|py)$/.test(f))) (dupe_names[path.basename(f)] ||= []).push(f);
const duplicate_code_names = Object.fromEntries(Object.entries(dupe_names).filter(([k, v]) => v.length > 2 && !/^(index|route|page|layout|loading|error|__init__|types|utils|constants)\./.test(k)));
const branches = sh('git for-each-ref --format="%(refname:short)|%(committerdate:short)|%(upstream:short)" refs/heads').split('\n').filter(Boolean).map(l => { const [n, d, u] = l.split('|'); return { branch: n, last: d, days: Math.round((Date.now() - Date.parse(d)) / 864e5), upstream: u || null, merged: sh(`git branch --merged HEAD --format=%(refname:short)`).split('\n').includes(n) }; });
const stale_branches = branches.filter(b => b.days > 60 || (b.merged && !/^(main|master|develop)$/.test(b.branch)));
const worktrees = sh('git worktree list --porcelain').split('\n\n').filter(Boolean).length - 1;
const todos = sh('git grep -n -E "TODO|FIXME|HACK|XXX" -- ":!node_modules" ":!*.lock" | wc -l');
const gi = (() => { try { return fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'); } catch { return ''; } })();
const gitignore_missing = ['node_modules', '.env', '.DS_Store', 'Thumbs.db', '*.log', '.tmp', 'coverage', 'dist', '.next', 'playwright-report', 'test-results'].filter(p => !gi.split('\n').some(l => l.trim().replace(/\/$/, '') === p.replace(/\/$/, '') || l.includes(p)));

const summary = { root_junk: root_junk.length, junk_files: junk.length, dump_dirs: dump_dirs.length, tracked_binaries: tracked_binaries.length, tracked_build_outputs: tracked_build.length, tracked_secrets: tracked_secrets.length, untracked: untracked.length, big_history_objects: big_history.length, unreferenced_stale_docs: unreferenced_stale_docs.length, duplicate_doc_groups: Object.keys(duplicate_doc_names).length, stale_branches: stale_branches.length, worktrees, todos: +todos || 0, gitignore_missing: gitignore_missing.length };
summary.worktrees_over_3 = worktrees > 3; summary.rules_file = R.__file;
summary.verdict = tracked_secrets.length ? '🔴 tajemství v gitu' : (tracked_binaries.length > 5 || root_junk.length > 5 || tracked_build.length) ? '🔴' : (root_junk.length || junk.length || untracked.length || unreferenced_stale_docs.length > 5) ? '🟡' : '🟢';
console.log(JSON.stringify({ repo, head: sh('git rev-parse --short HEAD'), summary, root_junk, junk, dump_dirs, tracked_binaries, tracked_build, tracked_secrets, untracked, big_history, unreferenced_stale_docs, duplicate_doc_names, duplicate_code_names, stale_branches, gitignore_missing, doc_inventory, note: 'Kandidáti. Obsahový průchod dokumentů dělá subagent (HYGIENA_REPA §2). Auditor nic nemaže.' }, null, 2));
