#!/usr/bin/env node
// REMOTE-CLONE — připraví lokální kopii GitHub repa klienta pro audit (bez instalace čehokoli u klienta).
// node tools/remote-clone.mjs <url|owner/repo> [--base <složka>] [--branch <větev>]
// → vypíše JSON {repo, name, url, branch, commit}. Existuje-li kopie, jen ji aktualizuje (fetch + reset na vzdálenou větev; lokální změny v kopii se nepřipouštějí).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const a = process.argv.slice(2); const arg = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
let src = a.find((x, i) => !x.startsWith('--') && !['--base', '--branch'].includes(a[i - 1]));
if (!src) { console.error('Zadej adresu repa, např. https://github.com/firma/aplikace nebo firma/aplikace'); process.exit(2); }
src = src.trim().replace(/\/+$/, '');
let m = src.match(/^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i);
if (!m) { console.error(`Tohle nevypadá jako GitHub repo: ${src}`); process.exit(2); }
const [, owner, name] = m; const slug = `${owner}/${name}`;
const base = path.resolve(arg('--base') || path.join(os.homedir(), 'audity')); fs.mkdirSync(base, { recursive: true });
const repo = path.join(base, name);
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false });
const hasGh = run('gh', ['auth', 'status']).status === 0;
if (!fs.existsSync(path.join(repo, '.git'))) {
  const r = hasGh ? run('gh', ['repo', 'clone', slug, repo, '--', '--no-tags']) : run('git', ['clone', '--no-tags', `https://github.com/${slug}.git`, repo]);
  if (r.status !== 0) { console.error(`Klonování selhalo (${slug}).\n${(r.stderr || '').trim()}\nSoukromé repo: potřebuješ k němu přístup (pozvánka od klienta) a přihlášené GitHub CLI: gh auth login`); process.exit(1); }
} else {
  const r = run('git', ['fetch', '--prune', 'origin'], repo); if (r.status !== 0) { console.error(`Aktualizace selhala: ${(r.stderr || '').trim()}`); process.exit(1); }
}
let branch = arg('--branch') || run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repo).stdout.trim().replace(/^origin\//, '') || 'main';
if (run('git', ['checkout', '-q', '-B', branch, `origin/${branch}`], repo).status !== 0) { console.error(`Větev ${branch} neexistuje.`); process.exit(1); }
run('git', ['reset', '-q', '--hard', `origin/${branch}`], repo);
const commit = run('git', ['rev-parse', '--short', 'HEAD'], repo).stdout.trim();
console.log(JSON.stringify({ repo, name, url: `https://github.com/${slug}`, branch, commit }));
