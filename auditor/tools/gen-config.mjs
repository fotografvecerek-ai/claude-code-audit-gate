#!/usr/bin/env node
// GEN-CONFIG — vygeneruje tools/audit.config.json z repa: obrazovky z Next.js App/Pages routeru (nebo HTML souborů), baseUrl 3100.
// node tools/gen-config.mjs <repo> [--force]   (nepřepíše existující config bez --force)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ws = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const repo = path.resolve(process.argv[2] || process.env.AUDITOR_TARGET_REPO || '.');
const out = path.join(ws, 'tools', 'audit.config.json'); const force = process.argv.includes('--force'); const port = (process.argv.join(' ').match(/--port\s+(\d+)/) || [])[1] || process.env.AUDIT_PORT || '3100';
const example = JSON.parse(fs.readFileSync(path.join(ws, 'tools', 'audit.config.example.json'), 'utf8'));
const untouched = fs.existsSync(out) && JSON.stringify(JSON.parse(fs.readFileSync(out, 'utf8'))) === JSON.stringify(example);
if (fs.existsSync(out) && !force && !untouched) { console.log(`seznam obrazovek už existuje a je upravený - ponechán (${out})`); process.exit(0); }
const screens = [];
const walk = (d, fn, depth = 0) => { if (depth > 8 || !fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.next', '.git'].includes(e.name)) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p, fn, depth + 1) : fn(p); } };
const appDir = ['app', 'src/app'].map(d => path.join(repo, d)).find(fs.existsSync);
if (appDir) walk(appDir, p => { if (!/[\\/]page\.(tsx|jsx|ts|js|mdx)$/.test(p)) return; const rel = path.relative(appDir, path.dirname(p)).split(path.sep).filter(s => !/^\(.*\)$/.test(s) && !/^@/.test(s)); if (rel.some(s => /^\[/.test(s))) return; const route = '/' + rel.join('/'); screens.push({ name: rel.join('_') || 'home', path: route, auth: !/login|register|reset|forgot|auth|public/i.test(route) }); });
const pagesDir = ['pages', 'src/pages'].map(d => path.join(repo, d)).find(fs.existsSync);
if (!screens.length && pagesDir) walk(pagesDir, p => { const rel = path.relative(pagesDir, p).replace(/\\/g, '/'); if (/^(api\/|_app|_document)/.test(rel) || /\[/.test(rel)) return; const route = '/' + rel.replace(/\.(tsx|jsx|ts|js|mdx)$/, '').replace(/\/?index$/, ''); screens.push({ name: route.slice(1).replace(/\//g, '_') || 'home', path: route || '/', auth: !/login|register|auth/i.test(route) }); });
if (!screens.length) walk(repo, p => { if (/\.html$/.test(p) && !/node_modules|dist|build|test/.test(p)) screens.push({ name: path.basename(p, '.html'), path: '/' + path.relative(repo, p).replace(/\\/g, '/'), auth: false }); });
if (!screens.length) screens.push(...example.screens);
const cfg = { ...example, baseUrl: `http://localhost:${port}`, isolatedEnv: false, screens: screens.slice(0, 60) };
delete cfg._isolatedEnv_note; delete cfg._baseUrl_note;
fs.writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n');
console.log(`seznam obrazovek pro testy: ${screens.length} (${appDir ? 'App Router' : pagesDir ? 'Pages Router' : 'HTML'}) → ${out}; testovací účty si auditor vyžádá v intake`);
