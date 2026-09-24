#!/usr/bin/env node
// GIT-INIT-PROJECT — založí git repo ve složce s kódem, která ho ještě nemá (auditor git potřebuje: zálohy, gate, tagy).
// Nejdřív .gitignore (aby se necommitly node_modules, .env, buildy, binárky), pak git init -b main + první commit.
// node tools/git-init-project.mjs <složka>
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const dir = path.resolve(process.argv[2] || '.'); const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (fs.existsSync(path.join(dir, '.git'))) { console.log('už je git repo'); process.exit(0); }
const sh = c => execSync(c, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const shq = c => { try { return sh(c); } catch { return ''; } };
const gi = path.join(dir, '.gitignore'); const base = ['node_modules/', '.next/', 'dist/', 'build/', 'coverage/', '.env', '.env.*', '!.env.example', '*.log', '.DS_Store', 'Thumbs.db', '.tmp/', '*.zip', '*.7z', '*.bak', '__pycache__/', 'venv/', '.venv/', 'bin/', 'obj/'].join('\n');
const add = fs.readFileSync(path.join(pkg, 'kapitan-side', 'hygiene', 'gitignore.addendum'), 'utf8');
fs.writeFileSync(gi, (fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') + '\n' : '') + base + '\n' + add);
shq('git init -q -b main') || sh('git init -q'); shq('git symbolic-ref HEAD refs/heads/main');
if (!shq('git config user.email')) { sh('git config user.email "owner@local"'); sh('git config user.name "vlastník"'); }
sh('git add -A'); const n = sh('git diff --cached --name-only').split('\n').filter(Boolean).length;
const big = sh('git diff --cached --name-only').split('\n').filter(f => f && fs.existsSync(path.join(dir, f)) && fs.statSync(path.join(dir, f)).size > 5 * 1024 * 1024);
if (big.length) { console.error(`POZOR: soubory > 5 MB by šly do gitu: ${big.slice(0, 10).join(', ')} — přidej je do .gitignore nebo přesuň mimo projekt a spusť znovu.`); sh('git reset -q'); process.exit(3); }
sh('git commit -q -m "chore: initial commit (založeno instalátorem auditora)"');
console.log(`git repo založeno v ${dir}: ${n} souborů v prvním commitu (větev main). Remote přidej: git remote add origin <url> && git push -u origin main`);
