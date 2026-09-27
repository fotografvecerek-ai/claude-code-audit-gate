#!/usr/bin/env node
// AUDITOR GUARD — PreToolUse hook. Exit 2 = blokuje akci (platí i v bypassPermissions módu).
// Vynucuje: (1) zápis souborů JEN do <workspace>/AUDIT, tools, .claude (ne do 03_dukazy — to je Kapitánův prostor),
//           (2) zprávy na busu jen s from=auditor,
//           (3) git commit/push POVOLEN jen ve workspace auditora (jeho vlastní AUDIT repo), ZAKÁZÁN v repu aplikace,
//           (4) žádný deploy/publish/migrace/destrukce/kill; mutační HTTP jen na localhost,
//           (5) žádný shellový zápis (>, tee, cp, mv, sed -i) do repa aplikace.
// Cesty bere z env (nastaví je setup průvodce do .claude/settings.json → "env"): AUDITOR_WORKSPACE, AUDITOR_TARGET_REPO.
// FAIL-CLOSED: jakýkoliv pád hooku (i při načítání modulů, např. rozbitý package.json v repu) = blok, ne tichý průchod.
process.on('uncaughtException', e => { process.stderr.write('AUDITOR-GUARD Blocked: hook selhal (' + (e && e.message) + ') — fail-closed; oprav příčinu (např. neplatný package.json) nebo dočasně odeber hook ze settings.\n'); process.exit(2); });

const WORKSPACE = process.env.AUDITOR_WORKSPACE || '';
const REPO = process.env.AUDITOR_TARGET_REPO || '';

function norm(p) { if (!p) return ''; p = String(p).replace(/\\/g, '/'); p = p.replace(/(^|[\s"'=(])([A-Za-z]):\//g, (_, pre, d) => `${pre}/${d.toLowerCase()}/`); return p.toLowerCase().replace(/\/+$/, ''); }
const collapse = p => { const s = String(p || '').replace(/^\\\\[?.]\\/, '').replace(/\\/g, '/'); const lead = s.startsWith('/') ? '/' : ''; const o = []; for (const g of s.split('/')) { if (!g || g === '.') continue; if (g === '..') o.pop(); else o.push(g); } return lead + o.join('/'); };   // „a/../b", \\?\ → pojistku nejde obejít cestou
const ws = norm(WORKSPACE), repo = norm(REPO);
const WRITE_ALLOW_DIRS = ['AUDIT/', 'tools/', '.claude/', 'build/', 'test-results/'].map(s => `${ws}/${s.toLowerCase()}`);
const WRITE_ALLOW_FILES = ['.gitignore', 'README.md', 'CLAUDE.md', 'BRIDGE.md'].map(s => `${ws}/${s.toLowerCase()}`);
const WRITE_DENY = [`${ws}/audit/03_dukazy/`];

// DENY hodnotí SPUSTITELNÉ slovo příkazu (po obalech npx/sudo/env/xargs…), ne argumenty: `cat vercel.json`, `grep -r publish` projdou.
// Vložený kód (bash -c, cmd /c, powershell -Command, node -e, python -c) se prověří celý. Destruktivní SQL blokuje kdekoliv mimo čtecí příkazy.
const WORD_DENY = [
  [(w, a) => w === 'vercel', 'deploy'], [(w, a) => ['netlify', 'firebase', 'wrangler', 'fly', 'flyctl', 'eas'].includes(w) && /^(deploy|publish|submit)$/i.test(a[0] || ''), 'deploy'], [(w) => w === 'gh-pages', 'deploy'],
  [(w, a) => ['npm', 'pnpm', 'yarn', 'bun'].includes(w) && a[0] === 'publish', 'publish'],
  [(w, a) => w === 'prisma' && /^(migrate|db)$/.test(a[0] || '') && /^(dev|deploy|reset|push)$/.test(a[1] || ''), 'migrace'], [(w, a) => w === 'supabase' && /^(db push|functions deploy|migration up)$/.test(`${a[0] || ''} ${a[1] || ''}`), 'migrace'],
  [(w, a) => w === 'rm' && a.some(x => /^-[a-z]*r/i.test(x) || x === '--recursive'), 'rekurzivní mazání'], [(w, a) => w === 'remove-item' && a.some(x => /^-rec/i.test(x)), 'rekurzivní mazání'], [(w, a) => ['del', 'erase', 'rd', 'rmdir'].includes(w) && a.some(x => /^\/[sq]$/i.test(x)), 'mazání'],
  [(w) => ['kill', 'taskkill', 'pkill', 'killall', 'stop-process', 'tskill'].includes(w), 'ukončení procesu (Kapitánův dev server / most)'],
];
// vložený kód interpretu (node -e, python -c…) se neparsuje — prověří se celý text starými vzory (konzervativně)
const ANY_DENY = [[/\bvercel\b/i, 'deploy'], [/\b(npm|pnpm|yarn)\s+publish\b/i, 'publish'], [/\bprisma\s+(migrate\s+(dev|deploy|reset)|db\s+push)\b/i, 'migrace'],
  [/\brm\s+-[a-z]*r/i, 'rekurzivní mazání'], [/\b(rmSync|rmtree|Remove-Item)\b/i, 'mazání'], [/\b(kill|taskkill|pkill|killall|Stop-Process)\b/i, 'ukončení procesu (Kapitánův dev server / most)']];
const SQL_DENY = /\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE)\b/i;
const READONLY = new Set(['cat', 'type', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'head', 'tail', 'less', 'more', 'wc', 'ls', 'dir', 'find', 'findstr', 'select-string', 'sls', 'get-content', 'gc', 'echo', 'printf', 'write-output', 'write-host', 'jq', 'diff', 'stat', 'file', 'sort', 'uniq', 'test', '[']);
const WRAP = new Set(['sudo', 'env', 'nohup', 'time', 'exec', 'command', 'call', 'npx', 'bunx', 'xargs', '&', 'start', 'nice']);
function segments(s) { // rozdělí na jednoduché příkazy mimo uvozovky; tokeny bez uvozovek; `2>&1`, `&>` zůstanou jedním tokenem
  const out = []; let tok = '', toks = [], q = null, had = false, quoted = false;
  // citovaný token, který vypadá jako přesměrování (`grep ">" f`), dostane neviditelnou značku → není to přesměrování
  const endTok = () => { if (had) toks.push(quoted && /^(\d|&)?>/.test(tok) ? '\u200b' + tok : tok); tok = ''; had = false; quoted = false; }; const endSeg = () => { endTok(); if (toks.length) out.push(toks); toks = []; };
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && s[i + 1] === '"') { tok += '"'; i++; } else tok += c; continue; }
    if (c === '"' || c === "'") { q = c; had = true; quoted = true; continue; }
    if (c === '&' && (tok.endsWith('>') || s[i + 1] === '>')) { tok += c; had = true; continue; }
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
function denyHit(cmd) {   // → { why, tok } nebo null
  for (const c of commands(cmd)) {
    if (c.inline) { for (const [re, why] of ANY_DENY) { const m = c.inline.match(re); if (m) return { why, tok: m[0] }; } continue; }
    for (const [f, why] of WORD_DENY) if (f(c.w, c.lower)) return { why, tok: [c.w, ...c.a.slice(0, 2)].join(' ') };
    const ro = READONLY.has(c.w) || (c.w === 'git' && /^(grep|log|show|diff|blame|status|ls-files)$/.test(c.lower[0] || ''));
    const m = !ro && c.all.join(' ').match(SQL_DENY); if (m) return { why: 'destruktivní SQL', tok: m[0] };
  }
  return null;
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
// mutační HTTP mimo localhost — nezávisle na pořadí argumentů (URL první i flagy první), každý subpříkaz zvlášť
function mutatingRemoteHttp(cmd) {
  for (const part of cmd.split(/\|\|?|&&|;|\n/)) {
    const http = /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|http|xh|httpie)\b/i.test(part); if (!http) continue;
    const mut = /(^|\s)(-X\s*(POST|PUT|PATCH|DELETE)|--request\s+(POST|PUT|PATCH|DELETE)|-d(\s|$|@)|--data(-\w+)?\b|-F\s|--form\b|-T\s|--upload-file\b|--json\b|-Method\s+(Post|Put|Patch|Delete)|--method[= ]+(POST|PUT|PATCH|DELETE)|--post-data|--post-file|\b(POST|PUT|PATCH|DELETE)\s+https?:)/i.test(part);
    const remote = /https?:\/\/(?!localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/i.test(part) || (/\b(curl|wget|iwr|irm)\b/i.test(part) && !/https?:\/\//i.test(part) && /\s[a-z0-9.-]+\.[a-z]{2,}(\/|\s|$)/i.test(part));
    if (mut && remote) return true;
  }
  return false;
}
const GIT_MUT = /\bgit\b(?:\s+-C\s+(\S+))?(?:\s+-c\s+\S+)*\s+(push|commit|merge|rebase|reset|checkout|switch|restore|tag|stash|branch\s+-[dDm]|clean|am|cherry-pick|revert)\b/gi;

let raw = ''; process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch { process.stderr.write('AUDITOR-GUARD Blocked: vstup hooku není JSON (fail-closed).\n'); process.exit(2); }
  const tool = input.tool_name || '', ti = input.tool_input || {}, cwd = norm(input.cwd || process.cwd());
  if (!ws || /\[dopl/i.test(ws)) { process.stderr.write('AUDITOR-GUARD: AUDITOR_WORKSPACE není nastaven / obsahuje placeholder — spusť setup průvodce (fail-closed).\n'); process.exit(2); }

  if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(tool)) {
    const fp = norm(collapse(ti.file_path || ti.notebook_path || '')); if (!fp) process.exit(0);
    if (WRITE_DENY.some(d => fp.startsWith(d))) block(`Zápis do ${fp} zakázán — 03_dukazy/ patří Kapitánovi.`);
    if (repo && (fp === repo || fp.startsWith(repo + '/'))) block(`Zápis do repa aplikace zakázán (${fp}). Auditor nekóduje — sepiš nález/návrh do AUDIT/.`);
    if (!WRITE_ALLOW_DIRS.some(a => fp.startsWith(a)) && !WRITE_ALLOW_FILES.includes(fp)) block(`Zápis mimo povolené složky (${fp}). Povoleno: AUDIT/, tools/, .claude/, build/ (lokální klon pro testy) ve workspace auditora.`);
    if (/\/audit\/bus\/[^/]*\.json$/.test(fp)) block('Zprávy na mostu jen přes tools/bus.mjs (kontroluje vlastnictví a to, že auditor zadává Kapitánovi jen nálezy) — ne zápisem souboru.');
    if (/\/audit\/bus\/ledger\.md$/.test(fp)) block('LEDGER.md generuje bus.mjs — needitovat ručně.');
    if (/\/tools\/(preflight\.mjs|verze|\.balik-otisky\.json)$/.test(fp)) block('Kontrolu před startem (tools/preflight.mjs), VERZE a otisky nástrojů mění jen aktualizace balíku — spouštěč je volá před startem agenta.');
    process.exit(0);
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(ti.command || '');
    const dh = denyHit(cmd); if (dh) block(`Zakázáno (${dh.why} — „${dh.tok}"): auditor nevydává, nemigruje, nemaže, neukončuje procesy, nemutuje mimo localhost.`);
    if (mutatingRemoteHttp(cmd)) block('Zakázáno (mutační HTTP mimo localhost): sondy jen proti lokálnímu buildu; produkce jen se souhlasem vlastníka a mimo tento hook.');
    // git mutace: povoleno jen když cíl = workspace auditora (cwd ve workspace a žádné -C/cesta do repa)
    // Detekce běží nad TOKENIZOVANÝMI příkazy (commands()), ne nad syrovým textem — echo/komentáře/„git push" v -m "…" nejsou git příkaz (A-004).
    const repoRe = repo ? new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w.-])') : null;
    let cur = cwd;
    const absTarget = p => { p = String(p).replace(/\\/g, '/'); const n = norm(p); return /^\//.test(n) ? norm(collapse(n)) : norm(collapse(cur + '/' + p)); };
    for (const c of commands(cmd)) {
      if (['cd', 'pushd', 'set-location', 'sl', 'chdir'].includes(c.w)) { const t = c.a.find(x => !/^[-/]/.test(x) || /^\//.test(x) && x.length > 2); if (t) cur = absTarget(t); continue; }
      if (c.w !== 'git') continue;
      for (const m of c.all.join(' ').matchAll(GIT_MUT)) {
        const target = m[1] ? norm(m[1]) : cur;
        const inRepo = repo && (target === repo || target.startsWith(repo + '/') || (repoRe.test(m[1] ? norm(m[1]) : '')));
        // build/ klon může být junction/symlink jinam (disk mimo produkci) → skutečné cesty položek build/ se berou jako build/
        let buildReal = []; try { const fsg = require('node:fs'), pg = require('node:path'); const bd = pg.join(WORKSPACE, 'build'); buildReal = fsg.readdirSync(bd).map(n => { try { return norm(fsg.realpathSync.native(pg.join(bd, n))); } catch { return ''; } }).filter(Boolean); } catch { }
        const inBuild = target.startsWith(ws + '/build/') || buildReal.some(r => target === r || target.startsWith(r + '/'));
        const inWs = target === ws || target.startsWith(ws + '/') || inBuild;
        if (inRepo || !inWs) block(`git ${m[2]} mimo workspace auditora zakázán (cíl: ${target}). Auditor commituje jen svůj AUDIT repozitář.`);
        if (inBuild && !/^(checkout|switch|restore|stash)$/i.test(m[2])) block(`git ${m[2]} v build/ klonu zakázán — klon slouží jen ke čtení a spuštění testů (povoleno: clone, fetch, pull, checkout, switch).`);
      }
    }
    if (/\bgit\s+(-C\s+\S+\s+)?push\b.*--force|\bgit\s+push\s+-f\b/i.test(cmd)) block('force push zakázán i ve workspace.');
    // zápis shellem: rozhoduje CÍL zápisu (přesměrování, cp/mv/copy/Set-Content…), ne slova v příkazu — `grep x <repo> 2>/dev/null` projde
    const wt = writeTargets(cmd, cwd); const inRepo = p => repo && (p === repo || p.startsWith(repo + '/'));
    for (const t of wt) {
      if (t.inline) { if (repoRe && repoRe.test(norm(t.text))) block(`Shellový zápis do repa aplikace zakázán (vložený kód ${t.cmd} zapisuje a zmiňuje cestu repa). Výstupy patří do AUDIT/.`); continue; }
      if (t.path && /\/audit\/bus\/[^/]*\.json$/.test(t.path)) block(`Zprávy na mostu jen přes tools/bus.mjs, ne shellem („${t.tok}").`);
      if (inRepo(t.path)) block(`Shellový zápis do repa aplikace zakázán („${t.tok}" → ${t.path}). Výstupy patří do AUDIT/.`);
    }
    if (/bus\.mjs\s+post\b/.test(cmd) && !/--from\s+auditor\b/.test(cmd)) block('bus post: auditor smí posílat jen --from auditor.');
    // spouštěče a nastavení agentů (Codex, Telegram, samostatnost) mění jen instalátor — ani shellem (rozhoduje cíl zápisu)
    const PROT = /(\/\.codex\/|\/start-(auditor|kapitan|projekt)\.(cmd|sh)$|\/preflight\.mjs$|\/\.bin(\/|$)|\/\.preflight\.json$|\/\.balik-otisky\.json$|\/\.agents\.json$|\/\.opravneni\.json$|\/\.telegram\.json$|codex-hooks)/i;
    const PROT_TXT = /(\.codex[\\/]|start-(auditor|kapitan|projekt)\.(cmd|sh)|preflight\.mjs|\.preflight\.json|\.balik-otisky\.json|\.agents\.json|\.opravneni\.json|\.telegram\.json|codex-hooks)/i;
    for (const t of wt) if ((t.inline && PROT_TXT.test(t.text)) || (t.path && PROT.test(t.path))) block(`Spouštěče a nastavení agentů (start-*, .agents.json, .codex/, Telegram, samostatnost) mění jen instalátor, ne auditor („${t.tok || t.cmd}").`);
    process.exit(0);
  }
  process.exit(0);
});
function block(msg) { process.stderr.write(`AUDITOR-GUARD Blocked: ${msg}\n`); process.exit(2); }
