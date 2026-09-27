#!/usr/bin/env node
// KAPITÁN AUDIT GUARD — PreToolUse hook do settings projektu Kapitána (registruje setup průvodce).
// Vynucuje: (1) Kapitán zapisuje v AUDIT/ jen do 03_dukazy/ a bus zprávy jen --from kapitan;
//           (2) nikdy neupravuje nálezy, verdikty, handoff, release gate, LEDGER;
//           (3) deploy/publish/prod migrace jen když gate-check PASS pro aktuální HEAD (technická bariéra, ne procesní);
//           (4) force push zakázán. Cesty z env: AUDITOR_WORKSPACE, AUDITOR_TARGET_REPO (setup je zapíše do settings "env").
// FAIL-CLOSED: jakýkoliv pád hooku (i při načítání modulů, např. rozbitý package.json v repu) = blok, ne tichý průchod.
process.on('uncaughtException', e => { process.stderr.write('KAPITAN-AUDIT-GUARD Blocked: hook selhal (' + (e && e.message) + ') — fail-closed; oprav příčinu (např. neplatný package.json) nebo dočasně odeber hook ze settings.\n'); process.exit(2); });
const { execFileSync } = require('node:child_process'); const path = require('node:path');
const norm = p => { if (!p) return ''; p = String(p).replace(/\\/g, '/'); p = p.replace(/(^|[\s"'=(])([A-Za-z]):\//g, (_, pre, d) => `${pre}/${d.toLowerCase()}/`); return p.toLowerCase().replace(/\/+$/, ''); };
const ws = norm(process.env.AUDITOR_WORKSPACE || ''), repo = norm(process.env.AUDITOR_TARGET_REPO || '');
// HYGIENA: pravidla z JEDINÉHO zdroje hygiene-rules.json (kopie v <repo>/.claude/hooks/, originál v <ws>/kapitan-side/hygiene/)
const collapse = p => { const s = String(p || '').replace(/^\\\\[?.]\\/, '').replace(/\\/g, '/'); const lead = s.startsWith('/') ? '/' : ''; const o = []; for (const g of s.split('/')) { if (!g || g === '.') continue; if (g === '..') o.pop(); else o.push(g); } return lead + o.join('/'); };   // „a/../b", \\?\ → pojistku nejde obejít cestou
const fsx = require('node:fs');
let R = null; for (const c of [path.join(__dirname, 'hygiene-rules.js'), path.join(__dirname, 'hygiene', 'hygiene-rules.js'), path.join(process.env.AUDITOR_WORKSPACE || '', 'kapitan-side/hygiene/hygiene-rules.js')]) { try { R = require(c).load(); break; } catch { } }
const PROD_BRANCH = new RegExp(process.env.PROD_BRANCHES || '^(main|master|production|prod|release)$', 'i');
const DEPLOY = [/\bvercel\s+(deploy|--prod|alias|promote)|\bvercel\b.*--prod/i, /\b(npm|pnpm|yarn)\s+publish\b/i, /\bprisma\s+migrate\s+deploy\b/i, /\bsupabase\s+(db\s+push|functions\s+deploy)\b/i, /\bcapgo\b.*(upload|bundle)/i, /\bbuild_ota\.py\b/i, /\b(eas|fastlane)\s+(submit|build)\b/i, /\bgh\s+release\s+create\b/i];
// --- analýza příkazu (stejná jako v hooku auditora): rozhoduje CÍL zápisu, ne slova v příkazu — čtení s 2>/dev/null projde
const WRAP = new Set(['sudo', 'env', 'nohup', 'time', 'exec', 'command', 'call', 'npx', 'bunx', 'xargs', '&', 'start', 'nice']);
function segments(s) { // rozdělí na jednoduché příkazy mimo uvozovky; tokeny bez uvozovek; `2>&1`, `&>` zůstanou jedním tokenem
  const out = []; let tok = '', toks = [], q = null, had = false, quoted = false;
  // citovaný token, který vypadá jako přesměrování (`grep ">" f`), dostane neviditelnou značku → není to přesměrování
  const endTok = () => { if (had) toks.push(quoted && /^(\d|&)?>/.test(tok) ? '\u200b' + tok : tok); tok = ''; had = false; quoted = false; }; const endSeg = () => { endTok(); if (toks.length) out.push(toks); toks = []; };
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && s[i + 1] === '"') { tok += '"'; i++; } else tok += c; continue; }
    if (c === '"' || c === "'") { q = c; had = true; quoted = true; continue; }
    if (c === '&' && (tok.endsWith('>') || s[i + 1] === '>')) { tok += c; had = true; continue; }
    // '>' je VŽDY metaznak přesměrování — i BEZ mezery za předchozím slovem („slovo>cíl"). Dřív se takový token slepil
    // dohromady a writeTargets() ho neviděl jako zápis (A-006, fail-open). Zůstává slepený jen fd-prefix (holé číslo/„&").
    if (c === '>') { if (had && !/^(\d+|&)?>*$/.test(tok)) endTok(); tok += c; had = true; continue; }
    if (c === '`' || c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')' || (c === '$' && s[i + 1] === '(')) { if (c === '&' && !had && !toks.length && s[i + 1] === ' ') { tok = '&'; had = true; endTok(); continue; } endSeg(); continue; }
    if (/\s/.test(c)) { endTok(); continue; }
    tok += c; had = true; }
  endSeg(); return out;
}
const baseW = x => (x || '').replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
// jednoduché příkazy po obalech (npx, sudo, env, xargs…); shell -c / cmd /c / powershell -Command se rozbalí; interpret -e/-c vrátí kód
function commands(cmd, depth = 0, out = []) {
  if (depth > 3) return out;
  for (const toks of segments(cmd)) {
    let i = 0;
    for (;;) { const w = baseW(toks[i]);
      if (/^\w+=/.test(toks[i] || '')) { i++; continue; }
      if (WRAP.has(w)) { i++; if (w === 'start' && toks[i] !== undefined && (toks[i] === '' || /\s/.test(toks[i]))) i++; while (toks[i] && (/^-/.test(toks[i]) || (w === 'start' && /^\//.test(toks[i])))) i++; continue; }
      if (['npm', 'pnpm', 'yarn'].includes(w) && /^(exec|dlx|x)$/.test(toks[i + 1] || '')) { i += 2; while (toks[i] && /^-/.test(toks[i])) i++; continue; }
      break; }
    const w = baseW(toks[i]); if (!w) continue; const a = toks.slice(i + 1); const lower = a.map(x => x.toLowerCase());
    if (['bash', 'sh', 'zsh', 'dash', 'cmd', 'powershell', 'pwsh'].includes(w)) { const k = lower.findIndex(x => /^(-c|\/c|\/k|-command|-encodedcommand)$/.test(x)); if (k >= 0) { commands(a.slice(k + 1).join(' '), depth + 1, out); continue; } }
    if (w === 'eval') { commands(a.join(' '), depth + 1, out); continue; } // eval "git push …" — obsah se rekurzivně tokenizuje jako u shell -c (kolo 2)
    const inline = ['node', 'python', 'python3', 'py', 'deno', 'bun', 'ruby', 'perl'].includes(w) && lower.some(x => /^(-e|-c|--eval|-p|--print)$/.test(x)) ? a.join(' ') : null;
    out.push({ w, a, lower, all: toks.slice(i), inline });
  }
  return out;
}
// KAM příkaz zapisuje: přesměrování (kromě /dev/null, nul, &N) a cíle zapisujících příkazů; cd uvnitř příkazu se sleduje
const NULLS = /^(\/dev\/null|nul|\$null|&\d?|&-)$/i;
const W_LAST = new Set(['cp', 'mv', 'copy', 'move', 'xcopy', 'rsync', 'ln', 'install', 'scp']);
const W_ALL = new Set(['tee', 'touch', 'mkdir', 'md', 'rm', 'del', 'erase', 'rmdir', 'rd', 'truncate', 'unlink']);
const W_PS = { 'set-content': 0, 'add-content': 0, 'out-file': 0, 'new-item': 0, 'remove-item': 0, 'clear-content': 0, 'copy-item': 1, 'move-item': 1, 'rename-item': 0 };
const INLINE_WRITE = /(writeFile|appendFile|createWriteStream|copyFile|renameSync|mkdirSync|rmSync|unlink|open\([^)]*['"][wax]|shutil\.|Set-Content|Out-File|\.write_text|\.write_bytes)/i;
function writeTargets(cmd, cwd0) {
  const res = []; let cur = cwd0;
  const abs = p => { p = String(p).replace(/\\/g, '/'); const n = norm(p); return /^\//.test(n) ? norm(collapse(n)) : norm(collapse(cur + '/' + p)); };
  for (const c of commands(cmd)) {
    if (['cd', 'pushd', 'set-location', 'sl', 'chdir'].includes(c.w)) { const t = c.a.find(x => !/^[-/]/.test(x) || /^\//.test(x) && x.length > 2); if (t) cur = abs(t); continue; }
    if (c.inline) { if (INLINE_WRITE.test(c.inline)) res.push({ inline: true, text: c.inline, cmd: c.w }); continue; }
    // přesměrování: `> f`, `>> f`, `1>f`, `2> f`, `&> f`, `>nul`
    for (let k = 0; k < c.all.length; k++) { const m = /^(\d|&)?>>?(.*)$/.exec(c.all[k]); if (!m) continue; const t = m[2] || c.all[k + 1] || ''; if (!m[2]) k++; if (t && !NULLS.test(t)) res.push({ path: abs(t), cmd: c.w, tok: c.all[k - (m[2] ? 0 : 1)] + (m[2] ? '' : ' ' + t) }); }
    const args = c.a.filter(x => !/^(\d|&)?>>?/.test(x)); const pos = []; for (let k = 0; k < args.length; k++) { if (/^\d?>>?$/.test(args[k])) { k++; continue; } if (!/^-/.test(args[k]) && !(/^\/[a-z?]$/i.test(args[k]) && ['copy', 'move', 'xcopy', 'del', 'erase', 'rd', 'rmdir', 'md', 'mkdir'].includes(c.w))) pos.push(args[k]); }
    const add = p => p && res.push({ path: abs(p), cmd: c.w, tok: `${c.w} ${p}` });
    if (W_LAST.has(c.w)) { const d = args.findIndex(x => x === '-t' || x === '--target-directory'); add(d >= 0 ? args[d + 1] : pos[pos.length - 1]); }
    else if (W_ALL.has(c.w)) pos.forEach(add);
    else if (c.w === 'chmod' || c.w === 'chown') pos.slice(1).forEach(add);
    else if (c.w === 'sed' && c.lower.some(x => /^-i/.test(x) || x === '--in-place')) pos.slice(1).forEach(add);
    else if (c.w in W_PS) { const lw = c.lower; const named = n => { const k = lw.findIndex(x => n.test(x)); return k >= 0 ? args[k + 1] : null; };
      add(W_PS[c.w] === 1 ? (named(/^-dest/) || pos[1]) : (named(/^-(path|literalpath|filepath)$/) || pos[0])); }
  }
  return res;
}
let raw = ''; process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch { process.stderr.write('KAPITAN-GUARD Blocked: vstup hooku není JSON (fail-closed).\n'); process.exit(2); }
  const tool = input.tool_name || '', ti = input.tool_input || {};
  const cwdRaw = input.cwd || process.cwd();
  if (!ws || /\[DOPLŇ|\[DOPLN/.test(ws) || !repo) block('AUDITOR_WORKSPACE / AUDITOR_TARGET_REPO nejsou nastaveny (fail-closed) — spusť setup-auditor, nebo hook odstraň ze settings.');
  if (!R) block('hygiene-rules.json nenalezen (fail-closed) — spusť setup-auditor (kopíruje pravidla do .claude/hooks/).');
  if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(tool)) {
    const fp = norm(collapse(ti.file_path || ti.notebook_path || ''));
    // DELEGACE: Kapitán běží na silném modelu kvůli plánování a rozhovoru s vlastníkem — kód píšou subagenti (implementator, model sonnet).
    // Hlavní vlákno (vstup hooku bez agent_id) nesmí Edit/Write do zdrojového kódu repa; subagent smí. Vypnout jen vlastník: <ws>/.rezim.json → "delegace": "vypnuto".
    if (repo && fp.startsWith(repo + '/') && !input.agent_id && !input.agent_type && process.env.AUDITOR_HARNESS !== 'codex'
      && /\.(js|jsx|mjs|cjs|ts|tsx|py|ps1|psm1|sh|bat|cmd|html?|css|scss|sass|less|vue|svelte|php|rb|go|rs|java|kt|swift|cs|cpp|cc|cxx|c|h|hpp|sql|dart|lua)$/i.test(fp)
      && !/\/\.claude\//.test(fp)) {
      let rz = {}; try { rz = JSON.parse(fsx.readFileSync(path.join(process.env.AUDITOR_WORKSPACE || '', '.rezim.json'), 'utf8')); } catch { }
      if (rz.delegace !== 'vypnuto') block(`DELEGACE: kód (${fp.slice(repo.length + 1)}) nepíšeš v hlavním okně — běžíš na drahém modelu kvůli plánu a rozhovoru s vlastníkem. Deleguj krok subagentovi \`implementator\` (model sonnet; aktivace: node "${process.env.AUDITOR_WORKSPACE}/tools/katalog.mjs" aktivuj implementator --cil .) nebo subagentovi s model: "sonnet" — s přesnými soubory, kotvami a AK. Dokumenty (.md), STATE, KANBAN a nastavení smíš upravovat sám.`);
    }
    if (fp.startsWith(ws + '/audit/')) {
      const ok = fp.startsWith(ws + '/audit/03_dukazy/') || (/\/audit\/bus\/[^/]*_kapitan_[^/]*\.json$/.test(fp));
      if (!ok) block(`Kapitán smí v AUDIT/ zapisovat jen do 03_dukazy/ a bus zprávy --from kapitan (${fp}). Nálezy, verdikty, handoff a gate patří auditorovi.`);
    }
    if (fp.startsWith(ws + '/') && !fp.startsWith(ws + '/audit/')) block(`Workspace auditora je pro Kapitána read-only mimo AUDIT/03_dukazy (${fp}).`);
    if (repo && fp.startsWith(repo + '/')) {
      const relp = fp.slice(repo.length + 1); const base = relp.split('/').pop();
      if (/^\.claude\/(hooks\/|settings(\.local)?\.json$)|^\.codex\/(hooks\.json|config\.toml)$|^\.github\/workflows\/auditor-gate\.yml$|^\.git\/hooks\//.test(relp)) block(`SELF-PROTECT: ${relp} — hooky, settings a CI bránu mění jen vlastník ručně nebo setup-auditor, ne agent.`);
      const isNew = !fsx.existsSync(ti.file_path || ti.notebook_path || '');
      if (!relp.includes('/') && isNew && !R.rootAllow.test(base)) block(`HYGIENA: nový soubor v rootu repa (${base}) — skripty → scripts/, dokumenty → docs/, provizoria → .tmp/tasks/<ID>/.`);
      if (R.junk.test(base) && !R.tmpOkDirs.test(relp)) block(`HYGIENA: provizorní/junk soubor (${relp}) mimo .tmp/tasks/<ID>/ — nevytvářej nepořádek; po úkolu uklidit.`);
      if (R.binExt.test(base) && !R.binOkDirs.test(relp) && !/^\.tmp\/tasks\//.test(relp)) block(`HYGIENA: binárka (${relp}) mimo public/assets — exporty/screenshoty → AUDIT/03_dukazy nebo archiv mimo repo.`);
      if (R.secret.test(relp) && !R.secretOk.test(relp) && isNew) block(`HYGIENA: tajemství (${relp}) — jen .env.example; skutečné hodnoty mimo repo.`);
    }
    process.exit(0);
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(ti.command || '');
    if (/\bgit\s+(-C\s+\S+\s+)?push\b.*(--force|-f\b)/i.test(cmd)) block('force push zakázán.');
    // destruktivní SQL přímo v příkazu (platí i pro úroveň SAMOSTATNÝ/PLNÝ): smazání tabulek/databáze, vyprázdnění, DELETE/UPDATE bez WHERE
    if (/\bdrop\s+(table|database|schema)\b|\btruncate\s+(table\s+)?["\w]|\bdelete\s+from\s+[\w."]+\s*(;|"|'|$)(?![^;]*\bwhere\b)|\bupdate\s+[\w."]+\s+set\b(?![^;]*\bwhere\b)|\bsupabase\s+db\s+reset\b/i.test(cmd)) block('DESTRUKTIVNÍ SQL (DROP/TRUNCATE/DELETE či UPDATE bez WHERE/db reset) — takový zásah dělá jen vlastník ručně, se zálohou.');
    // SELF-PROTECT i přes shell: zápis/mazání/přesun souborů hooků, settings, CI brány (rozhoduje cíl zápisu; git rm/mv/checkout a prettier --write taky)
    const wt = writeTargets(cmd, norm(cwdRaw));
    for (const c of commands(cmd)) { const pos = c.a.filter(x => !/^-/.test(x)); if (c.w === 'git' && /^(rm|mv|checkout|restore)$/.test(c.lower[0] || '')) pos.slice(1).forEach(x => wt.push({ path: norm(collapse(path.resolve(cwdRaw, x))), tok: 'git ' + c.lower[0] + ' ' + x })); if (c.w === 'prettier' && c.lower.includes('--write')) pos.forEach(x => wt.push({ path: norm(collapse(path.resolve(cwdRaw, x))), tok: 'prettier --write ' + x })); }
    const SELF = /\/\.claude\/(hooks(\/|$)|settings(\.local)?\.json$)|\/\.codex\/(hooks|config)|\/\.github\/workflows\/auditor-gate|\/\.git\/hooks(\/|$)/i;
    for (const t of wt) if ((t.inline && /(\.claude\/(hooks|settings)|\.codex\/(hooks|config)|\.github\/workflows\/auditor-gate|\.git\/hooks)/i.test(t.text.replace(/\\/g, '/'))) || (t.path && SELF.test(t.path))) block(`SELF-PROTECT: zápis do .claude/hooks, settings nebo CI brány přes shell je zakázán („${t.tok || t.cmd}").`);
    if (/bus\.mjs\s+post\b/.test(cmd) && !/--from\s+kapitan\b/.test(cmd)) block('bus post: Kapitán smí posílat jen --from kapitan.');
    // AUDIT/ auditora: Kapitán shellem zapisuje jen do 03_dukazy a svých zpráv na busu (bus.mjs zapisuje sám, ne shellem)
    for (const t of wt) if (t.path && t.path.startsWith(ws + '/audit/') && !t.path.startsWith(ws + '/audit/03_dukazy/') && !/\/audit\/bus\/[^/]*_kapitan_[^/]*\.json$/.test(t.path)) block(`Shellový zápis do AUDIT/ mimo 03_dukazy zakázán („${t.tok}").`);
    // git push do produkční větve = deploy (Vercel/GitHub integrace nasazuje automaticky) → gate-check
    // Detekce běží nad TOKENIZOVANÝMI příkazy (commands()), ne nad syrovým textem — "git push" v --text/-m "…" není push (A-005);
    // přesměrování (2>&1, >, | tail) se nepočítá do refspeců; git-bash cesta (/c/Users/…) se před resolve převede na C:\Users\… (win32).
    const gitBashToWin = p => { if (process.platform !== 'win32' || !p) return p; const m = /^\/([A-Za-z])(\/.*)?$/.exec(p); return m ? `${m[1].toUpperCase()}:${(m[2] || '\\').replace(/\//g, '\\')}` : p; };
    const resolveDir = (base, t) => { const c = gitBashToWin(t); return path.isAbsolute(c) ? c : path.resolve(base, c); };
    let cur = cwdRaw, pushProd = false, pushDir = null, depMatch = null, depMatchDir = cwdRaw;
    for (const c of commands(cmd)) {
      if (['cd', 'pushd', 'set-location', 'sl', 'chdir'].includes(c.w)) { const t = c.a.find(x => !/^[-/]/.test(x) || /^\//.test(x) && x.length > 2); if (t) cur = resolveDir(cur, t); continue; }
      if (!depMatch) { const text = c.inline || c.all.join(' '); const dm = DEPLOY.map(re => text.match(re)).find(Boolean); if (dm) { depMatch = dm; depMatchDir = cur; } }
      if (c.w !== 'git') continue; // VŠECHNY git push segmenty v příkazu (ne jen první) — "git push a && git push origin main" musí vyhodnotit i druhý (kolo 2)
      let i = 0, cDir = null;
      while (c.a[i] === '-C' && c.a[i + 1] !== undefined) { cDir = c.a[i + 1]; i += 2; }
      while (c.a[i] === '-c' && c.a[i + 1] !== undefined) i += 2;
      if ((c.a[i] || '').toLowerCase() !== 'push') continue;
      // přesměrování (2>&1, >, | tail se do samostatného segmentu už nedostane) se nepočítá do refspeců
      const rest = c.a.slice(i + 1); const rawArgs = [];
      for (let k = 0; k < rest.length; k++) { const m = /^(\d|&)?>>?(.*)$/.exec(rest[k]); if (m) { if (!m[2]) k++; continue; } rawArgs.push(rest[k]); }
      let segProd = rawArgs.some(a => /^--(all|mirror|tags|branches)$/.test(a));
      const args = rawArgs.filter(a => !a.startsWith('-')); const refspecs = args.slice(1); const targets = refspecs.map(r => r.includes(':') ? r.split(':')[1] : r).map(t => t.replace(/^refs\/heads\//, ''));
      if (targets.some(t => t && t !== 'HEAD' && PROD_BRANCH.test(t))) segProd = true;
      const refspec = refspecs[0] || ''; const target = refspecs.length > 1 ? '' : (refspec.includes(':') ? refspec.split(':')[1] : refspec);
      // skutečný adresář příkazu: -C <dir> > sledovaný cwd (cd/pushd/Set-Location před příkazem) > cwd hooku (worktree má vlastní HEAD!)
      const dir = cDir ? resolveDir(cwdRaw, cDir) : cur;
      let branch = (target && target !== 'HEAD') ? target : ''; if (!branch) { try { branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim(); } catch { branch = 'UNKNOWN'; } }
      if (branch === 'UNKNOWN' || branch === 'HEAD') segProd = true; // nelze určit → fail-closed (gate-check rozhodne)
      segProd = segProd || PROD_BRANCH.test(branch.replace(/^refs\/heads\//, ''));
      if (segProd && !pushProd) { pushProd = true; pushDir = dir; } // první PROD segment rozhoduje o gate adresáři; další (i non-prod) segmenty dir nepřepisují
    }
    if (pushProd || depMatch) {
      // gate-check nad ADRESÁŘEM PŘÍKAZU (worktree má vlastní HEAD a vydává svůj obsah): adresář skutečného push/deploy segmentu.
      // Jen když jde o totéž repo (stejné .git) — jinak auditované repo (fail-closed jako dřív).
      const gdir = pushProd ? pushDir : depMatchDir;
      const common = d => { try { return norm(fsx.realpathSync.native(path.resolve(d, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()))); } catch { return ''; } };   // realpath: krátké názvy 8.3 (RUNNER~1) a odkazy
      const target = process.env.AUDITOR_TARGET_REPO || process.cwd(); const cd0 = common(gdir);
      const gateDir = cd0 && cd0 === common(target) ? gdir : target;
      // důvěryhodná kopie = workspace auditora (mimo repo); kopie v repu jen jako záloha, když workspace není dostupný
      const gc = [path.join(process.env.AUDITOR_WORKSPACE, 'kapitan-side', 'gate-check.mjs'), path.join(__dirname, 'gate-check.mjs')].find(p => fsx.existsSync(p)) || path.join(__dirname, 'gate-check.mjs');
      try { execFileSync(process.execPath, [gc, gateDir], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env }); }
      catch (e) { const err = String(e.stderr || e.message); const line = (err.match(/GATE-CHECK FAIL:.*/) || [])[0] || `gate-check nelze spustit (${(err.match(/ENOENT[^\n]*|Cannot find module[^\n]*/) || ['chyba'])[0]}) — fail-closed`; block(`DEPLOY BLOKOVÁN — ${line}`); }
    }
    process.exit(0);
  }
  process.exit(0);
});
function block(msg) { process.stderr.write(`KAPITAN-AUDIT-GUARD Blocked: ${msg}\n`); process.exit(2); }
