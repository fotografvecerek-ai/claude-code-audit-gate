#!/usr/bin/env node
// TRIAGE — read-only posouzení více projektů: stack, velikost, git stav, signály dat/plateb/tenantů, deploy, existující Claude/auditor
// instalace → doporučený INSTALAČNÍ PROFIL s důvody. Používá install-multi (.ps1/.sh). Nic nemění.
//   node tools/triage.mjs <cesta|složka-s-projekty> [...]  [--json] [--html soubor] [--scan] [--sit = i síťové disky] [--depth N]
// Profily: PLNY (vše: Kapitán, hygiena, CI, Fable 5.1) · LEHKY (Kapitán + hygiena, bez CI, opus) · JEN_AUDIT (jen workspace auditora, repo se nedotkne)
//          · PRESKOCIT (není git repo / prázdné / archiv)
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
let args = process.argv.slice(2).filter(a => !a.startsWith('--')); const asJson = process.argv.includes('--json'); const scan = process.argv.includes('--scan') || !args.length;
const htmlOut = (process.argv.join(' ').match(/--html\s+(\S+)/) || [])[1] || null;
const INCLUDE_NET = process.argv.includes('--sit');
const PKG_DIR = (() => { const d = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..'); return process.platform === 'win32' ? d.toLowerCase() : d; })();
const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
// každý externí příkaz má časový limit — jedno pomalé repo (síť, OneDrive, obří strom) nesmí zastavit celý průzkum
const shT = (c, cwd, timeout = 15000) => { try { return execSync(c, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout, windowsHide: true, env: GIT_ENV }).trim(); } catch { return null; } };
const sh = (c, cwd, timeout) => shT(c, cwd, timeout) ?? '';
function driveKind(d) { const o = sh(`fsutil fsinfo drivetype ${d.slice(0, 2)}`, undefined, 5000); if (/Remote|Network/i.test(o)) return 'network'; if (/CD-ROM/i.test(o)) return 'cdrom'; return 'local'; }
const MAX_DEPTH = +((process.argv.join(' ').match(/--depth\s+(\d+)/) || [])[1] || 7);
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'vendor', '.tmp', 'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', 'AppData', '$Recycle.Bin', 'System Volume Information', 'Recovery', 'PerfLogs', '.cache', '.npm', '.pnpm-store', 'Library', 'snap', 'proc', 'sys', 'dev', 'run', 'lost+found', '.Trash', '.vscode-server', '.cursor-server', 'WindowsApps', 'Packages', 'Temp', 'tmp', 'Cache', 'Caches', '.gradle', '.m2', '.nuget', 'venv', '.venv', '__pycache__', 'site-packages', 'Steam', 'Games', 'bin', 'obj', 'Scripts', 'wwwroot', 'publish', 'publish-output', 'publish-sc-output', 'publish-sc', 'publish-sc-new', 'out', '.output', 'target', 'release', 'Release', 'Debug']);
function scanRoots() {
  const roots = [];
  if (process.platform === 'win32') { const skipped = []; for (let c = 65; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; try { if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) continue; } catch { continue; }
      const kind = driveKind(d); if (kind === 'network' && !INCLUDE_NET) { skipped.push(d); continue; } if (kind === 'cdrom') continue; roots.push(d); }
    if (skipped.length) process.stderr.write(`  síťové disky přeskočeny: ${skipped.join(', ')}  (zahrneš je parametrem --sit; jsou pomalé)\n`); }
  else { roots.push(process.env.HOME || '/root'); for (const m of ['/mnt', '/media', '/srv', '/opt', '/data']) if (fs.existsSync(m)) roots.push(m); }
  const home = process.env.USERPROFILE || process.env.HOME || '';
  for (const sub of ['Documents', 'Dokumenty', 'Downloads', 'Stažené soubory', 'OneDrive\\Documents', 'OneDrive\\Dokumenty', 'Desktop', 'Plocha', 'dev', 'projects', 'Projects', 'repos', 'src']) { const p = path.join(home, sub); if (fs.existsSync(p)) roots.push(p); }
  const seen = new Set(); return roots.filter(r => { const k = process.platform === 'win32' ? r.toLowerCase() : r; if (seen.has(k)) return false; seen.add(k); return true; });
}
const foundNoGit = new Set();
function findRepos(roots) {
  const found = new Set(); let visited = 0; const t0 = Date.now();
  const walk = (d, depth) => { if (depth > MAX_DEPTH) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    if (es.some(e => e.name === '.git')) { found.add(d); return; }   // repo nalezeno — dovnitř už nejdeme (submoduly ignorujeme)
    if (depth > 0 && es.some(e => e.isFile() && ['package.json', 'CLAUDE.md', 'build_html.py', 'pyproject.toml', 'next.config.js', 'next.config.ts'].includes(e.name))) { found.add(d); foundNoGit.add(d); return; } // projekt bez gitu
    for (const e of es) { if (!e.isDirectory() || e.isSymbolicLink() || SKIP_DIRS.has(e.name) || e.name.startsWith('.') || /^publish/i.test(e.name)) continue; visited++; if (visited % 5000 === 0) process.stderr.write(`  … prohledáno ${visited} složek, nalezeno ${found.size} rep (${Math.round((Date.now() - t0) / 1000)} s)\n`); walk(path.join(d, e.name), depth + 1); } };
  for (const r of roots) { process.stderr.write(`  sken ${r}\n`); walk(r, 0); }
  process.stderr.write(`  hotovo: ${found.size} git rep, ${visited} složek, ${Math.round((Date.now() - t0) / 1000)} s\n`);
  const seen = new Set(); return [...found].filter(p => { const k = process.platform === 'win32' ? p.toLowerCase() : p; if (seen.has(k)) return false; seen.add(k); return !/-audit$/.test(p) && !/[\\/]\.claude[\\/]/.test(p) && k !== PKG_DIR; });
}
if (scan) { const roots = scanRoots(); process.stderr.write(`== Průzkum disků a složek (hloubka ${MAX_DEPTH}): ${roots.join(', ')}\n`); args = findRepos(roots); if (!args.length) { console.error('žádný projekt nenalezen'); process.exit(1); } }
const ex = (...p) => fs.existsSync(path.join(...p));
const readJ = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
// kandidáti: přímo git repo, nebo složka obsahující git repa (1 úroveň)
const MARKERS = ['package.json', 'CLAUDE.md', 'requirements.txt', 'pyproject.toml', 'index.html', 'build_html.py', 'next.config.js', 'next.config.ts', 'capacitor.config.ts'];
const isProject = p => ex(p, '.git') || MARKERS.some(m => ex(p, m)) || (fs.existsSync(p) && fs.readdirSync(p).some(f => /\.(sln|csproj)$/.test(f)));
const repos = []; const noGit = new Set();
for (const a of args) { const p = path.resolve(a); if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) continue;
  if (ex(p, '.git')) repos.push(p); else if (isProject(p)) { repos.push(p); noGit.add(p); }
  else for (const e of fs.readdirSync(p, { withFileTypes: true })) { if (!e.isDirectory() || e.name.endsWith('-audit') || SKIP_DIRS.has(e.name)) continue; const q = path.join(p, e.name); if (ex(q, '.git')) repos.push(q); else if (isProject(q)) { repos.push(q); noGit.add(q); } } }
for (const p of foundNoGit) noGit.add(path.resolve(p));
{ const seen = new Set(); for (let i = repos.length - 1; i >= 0; i--) { const k = process.platform === 'win32' ? repos[i].toLowerCase() : repos[i]; if (seen.has(k) || k === PKG_DIR) repos.splice(i, 1); else seen.add(k); } }
// Jeden průchod stromem: počty kódu + signály (users/tenants/platby/osobní data) z jednoho čtení každého souboru.
// Limity na repo: 20 s, 20 000 souborů, 60 MB přečteno, soubor > 1,5 MB se nečte (počítá se jako "velký"). OneDrive: obsah se
// nečte vůbec (čtení cloudového souboru ho stahuje) — signály jsou pak "neověřeno".
const CODE_RE = /\.(ts|tsx|js|jsx|mjs|py|html|cs)$/i, GREP_RE = /\.(ts|tsx|js|mjs|prisma|sql|py|json|html)$/i;
const SKIP_READ = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|\.min\.(js|css)$|\.map$/i;
const SIG = { users: /\b(model\s+User|users?\b.*(email|password)|createUser|signIn|auth\()/i, tenants: /tenant(Id|_id)|organizationId|orgId|multi-?tenant|RLS|row level security/i, payments: /stripe|invoice|faktur|payment|platb/i, personal: /gdpr|osobn[íi] údaj|rodn[ée] č|IČO|customer|zákazn/i };
function analyze(repo) {
  const t0 = Date.now(); let files = 0, loc = 0, big = 0, bytes = 0, truncated = false; const sig = { users: false, tenants: false, payments: false, personal: false };
  const cloud = /[\\/]OneDrive[^\\/]*[\\/]/i.test(repo + path.sep);
  const walk = (d, depth) => { if (depth > 8 || truncated) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { if (Date.now() - t0 > 8000 || files > 12000 || bytes > 40e6) { truncated = true; return; }
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.') || e.isSymbolicLink()) continue; const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      const isCode = CODE_RE.test(e.name), isGrep = GREP_RE.test(e.name); if (!isCode && !isGrep) continue; if (isCode) files++;
      if (cloud || SKIP_READ.test(e.name)) continue;
      let size = 0; try { size = fs.statSync(p).size; } catch { continue; } if (size > 1.5e6) { if (isCode) big++; continue; }
      let t; try { t = fs.readFileSync(p, 'utf8'); } catch { continue; } bytes += size;
      if (isCode) { const l = t.split('\n').length; loc += l; if (l > 1000) big++; }
      if (isGrep) for (const k in SIG) if (!sig[k] && SIG[k].test(t)) sig[k] = true; } };
  walk(repo, 0); return { code: { files, loc, big, truncated }, sig, cloud };
}

const myEmail = sh('git config --global user.email') || sh('git config user.email'); const myName = sh('git config --global user.name');
const SYS_PATH = /[\\/](opt|usr|snap|Program Files( \(x86\))?|scoop|chocolatey|AppData|\.nvm|\.rbenv|\.pyenv|\.cargo|go[\\/]pkg|node_modules|BuildTools|Common7|ServiceHub|wp-content[\\/](themes|plugins|mu-plugins)|wp-includes|wp-admin)[\\/]/i;
const out = []; const tAll = Date.now();
for (const [ri, repo] of repos.entries()) {
  const name = path.basename(repo); const tR = Date.now(); process.stderr.write(`  [${ri + 1}/${repos.length}] ${name}`); const pkg = readJ(path.join(repo, 'package.json')) || {}; const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const stack = [];
  if (deps.next) stack.push('Next.js' + (ex(repo, 'app') || ex(repo, 'src/app') ? ' (App Router)' : ex(repo, 'pages') ? ' (Pages)' : ''));
  if (deps['@prisma/client'] || ex(repo, 'prisma/schema.prisma')) stack.push('Prisma');
  if (deps['@supabase/supabase-js'] || ex(repo, 'supabase')) stack.push('Supabase');
  if (deps['@capacitor/core']) stack.push('Capacitor');
  if (deps.stripe || deps['@stripe/stripe-js']) stack.push('Stripe');
  if (ex(repo, 'build_html.py')) stack.push('build_html.py (HTML monolit)');
  if (ex(repo, 'requirements.txt') || ex(repo, 'pyproject.toml')) stack.push('Python');
  if (fs.readdirSync(repo).some(f => /\.(csproj|sln)$/.test(f))) stack.push('.NET');
  if (!stack.length && fs.readdirSync(repo).some(f => /\.html$/.test(f))) stack.push('statické HTML');
  const an = analyze(repo); const code = an.code;
  const hasGit = ex(repo, '.git');
  const l1 = hasGit ? sh('git log -1 --format=%cs%n%ci%n%s', repo).split('\n') : [];
  const dirtyRaw = hasGit ? shT('git status --porcelain', repo, 10000) : '';
  const git = { remote: hasGit ? sh('git remote -v', repo).split('\n')[0]?.split(/\s+/)[1] || null : null, branch: hasGit ? sh('git rev-parse --abbrev-ref HEAD', repo) : '', last: l1[0] || '', lastTime: (l1[1] || '').slice(0, 16), lastMsg: (l1[2] || '').slice(0, 80), commits90: hasGit ? +sh('git rev-list --count --since="90 days ago" HEAD', repo) || 0 : 0, dirty: dirtyRaw === null ? -1 : dirtyRaw.split('\n').filter(Boolean).length };
  const lastAgeDays = git.last ? Math.round((Date.now() - Date.parse(git.last)) / 864e5) : null;
  const github = /github\.com/.test(git.remote || '');
  const sig = { ...an.sig, deploy: ex(repo, 'vercel.json') || ex(repo, '.vercel') || ex(repo, 'build_ota.py') || ex(repo, 'ota_version.txt') || ex(repo, 'capacitor.config.ts') || ex(repo, 'Dockerfile') || ex(repo, '.github/workflows') };
  const claude = { claudeMd: ex(repo, 'CLAUDE.md') ? fs.statSync(path.join(repo, 'CLAUDE.md')).size : 0, agents: ex(repo, '.claude/agents') ? fs.readdirSync(path.join(repo, '.claude/agents')).length : 0, skills: ex(repo, '.claude/skills') ? fs.readdirSync(path.join(repo, '.claude/skills')).length : 0, hooks: ex(repo, '.claude/settings.json') ? Object.keys(readJ(path.join(repo, '.claude/settings.json'))?.hooks || {}) : [], auditorInstalled: ex(repo, '.claude/hooks/kapitan-audit-guard.js'), auditorWs: ex(path.dirname(repo), name + '-audit') };
  // doporučení
  const myCommits = hasGit && myEmail ? +sh(`git rev-list --count --author="${myEmail}" HEAD`, repo) || 0 : -1;
  const totalCommits = hasGit ? +sh('git rev-list --count HEAD', repo) || 0 : 0;
  const foreign = SYS_PATH.test(repo) || (git.remote && myCommits === 0 && totalCommits > 0);
  const reasons = []; let profile = 'PLNY';
  const isNoGit = noGit.has(repo) || !ex(repo, '.git');
  if (isNoGit) reasons.push('NENÍ GIT REPO — instalátor ho založí (.gitignore + první commit); to je zároveň první nález: nezálohovaný kód');
  if (foreign && !isNoGit) { profile = 'PRESKOCIT'; reasons.push(SYS_PATH.test(repo) ? 'systémová/nástrojová cesta nebo cizí komponenta (instalace nástroje, WordPress šablona/plugin…) - ne tvůj projekt' : `cizí repo — 0 tvých commitů z ${totalCommits} (${myEmail || 'git e-mail nenastaven'})`); }
  else if (code.files === 0) { profile = 'PRESKOCIT'; reasons.push('žádný kód'); }
  else if (lastAgeDays !== null && lastAgeDays > 180 && git.commits90 === 0) { profile = 'JEN_AUDIT'; reasons.push(`neaktivní ${lastAgeDays} dní — audit ano, brány do repa až při oživení`); }
  else {
    const risky = sig.tenants || sig.payments || sig.personal || sig.users;
    if (!risky && code.loc < 5000 && !sig.deploy) { profile = 'LEHKY'; reasons.push('malý projekt bez uživatelských dat/plateb/deploye'); }
    else { reasons.push([sig.tenants && 'tenanti/RLS', sig.payments && 'platby/faktury', sig.personal && 'osobní data', sig.users && 'uživatelské účty', sig.deploy && 'deploy pipeline'].filter(Boolean).join(', ') || 'aplikace s kódem > 5k LOC'); }
    if (!github) reasons.push('bez GitHub remote → CI brána se přeskočí (a git praxe = 🔴 nezálohováno)');
    if (code.big) reasons.push(`${code.big} souborů > 1000 řádků → hygiena + modularizace jako první`);
    if (git.dirty > 0) reasons.push(`${git.dirty} necommitnutých souborů — před instalací commitni/odlož`);
    if (git.dirty < 0) reasons.push('git status nestihl odpovědět do 10 s (pomalý disk/obří strom) — stav pracovního stromu neznámý');
    if (an.cloud) reasons.push('OneDrive: obsah souborů se nečetl (cloudové soubory by se stahovaly) — signály dat/plateb neověřeny');
    if (code.truncated) reasons.push('velký strom — počty kódu a signály jsou z částečného průchodu (limit 8 s / 12k souborů)');
    if (claude.auditorInstalled) reasons.push('auditor už nainstalován → reinstalace (aktualizace hooků), AUDIT/ zůstane');
    if (!claude.agents) reasons.push('projekt nemá subagenty → auditor to označí jako EFF nález');
  }
  const plan = profile === 'PLNY' ? { kapitan: true, hygiena: true, ci: github, model: 'claude-fable-5-1', port: 3100 + out.length } : profile === 'LEHKY' ? { kapitan: true, hygiena: true, ci: false, model: 'opus', port: 3100 + out.length } : profile === 'JEN_AUDIT' ? { kapitan: false, hygiena: false, ci: false, model: 'sonnet', port: 3100 + out.length } : null;
  process.stderr.write(`  ${((Date.now() - tR) / 1000).toFixed(1)} s\n`);
  out.push({ repo, name, noGit: isNoGit, cloud: an.cloud, stack: stack.join(', ') || 'neznámý', code, git: { ...git, lastAgeDays, myCommits, totalCommits, last: git.last || (isNoGit ? fs.statSync(repo).mtime.toISOString().slice(0, 10) : git.last) }, github, foreign, signals: sig, claude, profile, reasons, plan });
}
process.stderr.write(`  posouzení hotovo: ${out.length} projektů za ${Math.round((Date.now() - tAll) / 1000)} s\n`);
out.sort((a, b) => (a.profile === 'PRESKOCIT') - (b.profile === 'PRESKOCIT') || a.name.localeCompare(b.name));
let portN = 3100; for (const r of out) if (r.plan) r.plan.port = portN++;
if (htmlOut) {
  const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cls = p => ({ PLNY: 'plny', LEHKY: 'lehky', JEN_AUDIT: 'audit', PRESKOCIT: 'skip' }[p] || '');
  const OPTS = ['PLNY', 'LEHKY', 'JEN_AUDIT'];
  const rows = out.map((r, i) => { const n = i + 1; const def = r.profile === 'PRESKOCIT' ? 'JEN_AUDIT' : r.profile; return `<tr class="${cls(r.profile)}" data-n="${n}" data-repo="${esc(r.repo)}" data-name="${esc(r.name)}"><td data-v="${n}"><label><input type="checkbox" class="sel"> <b>${n}</b></label><br><select class="prof">${OPTS.map(o => `<option${o === def ? ' selected' : ''}>${o}</option>`).join('')}</select></td><td><b>${esc(r.name)}</b><br><small>${esc(r.repo)}</small></td><td>${esc(r.stack)}</td><td data-v="${r.git.lastTime}">${esc(r.git.lastTime || '—')}<br><small>${esc(r.git.lastMsg)}</small></td><td data-v="${r.git.commits90}">${r.git.commits90}${r.git.dirty > 0 ? `<br><small class="warn">${r.git.dirty} necommitnuto</small>` : r.git.dirty < 0 ? '<br><small class="warn">dirty ?</small>' : ''}</td><td data-v="${r.code.loc}">${r.code.files} souborů<br><small>${r.code.loc.toLocaleString('cs')} řádků${r.code.big ? `, ${r.code.big} > 1000` : ''}</small></td><td>${Object.entries(r.signals).filter(([, v]) => v).map(([k]) => k).join(', ') || '—'}</td><td>${r.git.remote ? (r.github ? 'GitHub' : esc(r.git.remote)) : '<span class="warn">žádný</span>'}</td><td><span class="tag ${cls(r.profile)}">${r.profile}</span><ul>${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></td></tr>`; }).join('\n');
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Průzkum projektů — Auditor</title>
<style>body{font:14px/1.4 system-ui,Segoe UI,sans-serif;margin:24px;color:#1a1a1a;background:#fafafa}h1{font-size:20px;margin:0 0 4px}table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #ddd;padding:8px;vertical-align:top;text-align:left}th{background:#f0f0f0;cursor:pointer;position:sticky;top:64px}small{color:#666}ul{margin:4px 0 0 16px;padding:0}li{font-size:12px;color:#444}.tag{display:inline-block;padding:2px 8px;border-radius:10px;font-weight:600;font-size:12px}.tag.plny{background:#0f766e;color:#fff}.tag.lehky{background:#0891b2;color:#fff}.tag.audit{background:#ca8a04;color:#fff}.tag.skip{background:#9ca3af;color:#fff}tr.skip td{color:#888}.warn{color:#b91c1c}.sum{margin:0 0 8px}.sum span{margin-right:16px}input[type=text]{padding:6px;width:320px}
.bar{position:sticky;top:0;background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin:8px 0 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;z-index:2;box-shadow:0 2px 6px rgba(0,0,0,.06)}button{padding:8px 14px;border:1px solid #0f766e;background:#0f766e;color:#fff;border-radius:6px;cursor:pointer;font-weight:600}button.sec{background:#fff;color:#0f766e}#cnt{font-weight:600}#out{font-family:Consolas,monospace;padding:6px;width:260px}tr.on td{background:#ecfdf5}select.prof{margin-top:4px;font-size:12px}label{cursor:pointer;white-space:nowrap}</style></head><body>
<h1>Průzkum projektů pro Auditora</h1><div class="sum">${esc(new Date().toLocaleString('cs-CZ'))} · ${out.length} projektů · <span>PLNÝ ${out.filter(r => r.profile === 'PLNY').length}</span><span>LEHKÝ ${out.filter(r => r.profile === 'LEHKY').length}</span><span>JEN AUDIT ${out.filter(r => r.profile === 'JEN_AUDIT').length}</span><span>PŘESKOČIT ${out.filter(r => r.profile === 'PRESKOCIT').length}</span> · čísla odpovídají seznamu v terminálu</div>
<div class="bar"><b>1.</b> zaškrtni projekty (u každého můžeš změnit profil) &nbsp;<b>2.</b> <button id="save">Uložit výběr</button> <small>→ stáhne se <code>Auditor_vyber.json</code> do Stažených; pak se vrať do terminálu a stiskni Enter</small> &nbsp;|&nbsp; nebo <button class="sec" id="copy">Zkopírovat čísla</button> <input id="out" readonly placeholder="čísla vybraných"> <span id="cnt">vybráno 0</span>
&nbsp;|&nbsp; <button class="sec" onclick="pick('plny')">+ všechny PLNÝ</button> <button class="sec" onclick="pick('lehky')">+ LEHKÝ</button> <button class="sec" onclick="pick('audit')">+ JEN AUDIT</button> <button class="sec" onclick="pick(null)">zrušit vše</button> <input type="text" id="q" placeholder="filtr (název, cesta, stack, profil)…" oninput="for(const tr of document.querySelectorAll('tbody tr'))tr.style.display=tr.textContent.toLowerCase().includes(this.value.toLowerCase())?'':'none'"></div>
<table><thead><tr><th onclick="s(0)">#</th><th onclick="s(1)">Projekt</th><th onclick="s(2)">Stack</th><th onclick="s(3)">Poslední změna</th><th onclick="s(4)">Změn / 90 d</th><th onclick="s(5)">Velikost</th><th>Signály</th><th>Remote</th><th onclick="s(8)">Doporučení</th></tr></thead><tbody>
${rows}</tbody></table>
<p><small>Profily: PLNÝ = Kapitán + hygiena + CI + Fable 5.1 · LEHKÝ = bez CI, Opus · JEN AUDIT = jen workspace auditora, repo se nedotkne · PŘESKOČIT = cizí/nástrojové/bez kódu (můžeš vybrat i tak, výchozí profil JEN AUDIT). Vygenerováno read-only, nic nebylo změněno.</small></p>
<script>let dir={};function s(i){const tb=document.querySelector('tbody');const rs=[...tb.rows];dir[i]=!dir[i];rs.sort((a,b)=>{const x=a.cells[i].dataset.v??a.cells[i].textContent,y=b.cells[i].dataset.v??b.cells[i].textContent;const n=parseFloat(x),m=parseFloat(y);const c=(!isNaN(n)&&!isNaN(m))?n-m:String(x).localeCompare(String(y),'cs');return dir[i]?c:-c});rs.forEach(r=>tb.appendChild(r))}
const sel=()=>[...document.querySelectorAll('tbody tr')].filter(t=>t.querySelector('.sel').checked).sort((a,b)=>+a.dataset.n-+b.dataset.n);
function upd(){const v=sel();for(const t of document.querySelectorAll('tbody tr'))t.classList.toggle('on',t.querySelector('.sel').checked);document.getElementById('out').value=v.map(t=>t.dataset.n).join(' ');document.getElementById('cnt').textContent='vybráno '+v.length}
function pick(c){for(const t of document.querySelectorAll('tbody tr')){if(c===null)t.querySelector('.sel').checked=false;else if(t.classList.contains(c))t.querySelector('.sel').checked=true}upd()}
document.addEventListener('change',e=>{if(e.target.classList.contains('sel'))upd()});
document.getElementById('copy').onclick=()=>{const o=document.getElementById('out');o.select();try{navigator.clipboard.writeText(o.value)}catch(e){document.execCommand('copy')}o.blur();document.getElementById('cnt').textContent='zkopírováno: '+o.value};
document.getElementById('save').onclick=()=>{const v=sel();if(!v.length){alert('Nic není zaškrtnuto.');return}const data={vytvoreno:new Date().toISOString(),report:${JSON.stringify(path.resolve(htmlOut))},vyber:v.map(t=>({n:+t.dataset.n,name:t.dataset.name,repo:t.dataset.repo,profile:t.querySelector('.prof').value}))};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='Auditor_vyber.json';document.body.appendChild(a);a.click();a.remove();document.getElementById('cnt').textContent='uloženo '+v.length+' → Stažené: Auditor_vyber.json — teď Enter v terminálu'};
</script></body></html>`;
  fs.writeFileSync(htmlOut, html); process.stderr.write(`HTML report: ${htmlOut}\n`);
}
if (asJson) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
for (const r of out) {
  console.log(`\n■ ${r.name}   ${r.repo}`);
  console.log(`  stack: ${r.stack} · ${r.code.files} souborů / ${r.code.loc} řádků${r.code.big ? ` (${r.code.big} nad 1000 ř.)` : ''}`);
  console.log(`  git: ${r.git.branch || '-'} · poslední commit ${r.git.last || '-'} (${r.git.lastAgeDays ?? '-'} d) · ${r.git.commits90} commitů/90 d · remote ${r.git.remote || 'ŽÁDNÝ'} · ${r.git.dirty < 0 ? '?' : r.git.dirty} dirty`);
  console.log(`  signály: ${Object.entries(r.signals).filter(([, v]) => v).map(([k]) => k).join(', ') || '—'} · Claude: CLAUDE.md ${r.claude.claudeMd} B, agentů ${r.claude.agents}, skillů ${r.claude.skills}, hooky [${r.claude.hooks.join(',')}]${r.claude.auditorInstalled ? ', AUDITOR UŽ NAINSTALOVÁN' : ''}`);
  console.log(`  → DOPORUČENÍ: ${r.profile}${r.plan ? `  (Kapitán ${r.plan.kapitan ? 'ano' : 'ne'}, hygiena ${r.plan.hygiena ? 'ano' : 'ne'}, CI ${r.plan.ci ? 'ano' : 'ne'}, model ${r.plan.model}, port ${r.plan.port})` : ''}`);
  for (const x of r.reasons) console.log(`     - ${x}`);
}
console.log(`\nProfily: PLNY = vše · LEHKY = bez CI, sonnet · JEN_AUDIT = jen workspace auditora, repo se nedotkne · PRESKOCIT`);
