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

// A-006 kolo 2: nejbližší EXISTUJÍCÍ předek přes fs.realpathSync (odhalí junction/symlink, který pod povolenou složkou
// (typicky build/) ve skutečnosti vede ven z workspace — naivní řetězcová shoda cesty to nepozná, B24). Fail-safe:
// cokoliv se nedá vyřešit (nic v cestě zatím neexistuje, chyba OS) vrátí vstup beze změny — nikdy nespadne.
function realOf(p) {
  if (!p) return p;
  const fsr = require('node:fs'); let cur = p, suffix = '';
  // Windows: norm() dává cestám tvar „/c/…" (písmeno disku jako první segment) — fs.realpathSync(.native) tohle
  // neumí, bere „/c/…" jako relativní k aktuálnímu disku („C:\c\…") a vždy by to spadlo → realOf byl tiše no-op
  // (junction/symlink vedoucí ven z workspace pod build/ by nikdy neblokoval, viz A-006 kolo 2 B24). Před voláním
  // se převede na „C:/…", výsledek zpět přes norm() do stejného tvaru jako zbytek kódu.
  const toNative = x => process.platform === 'win32' && /^\/[a-z]\//.test(x) ? x[1].toUpperCase() + ':' + x.slice(2) : x;
  for (let guard = 0; guard < 64 && cur; guard++) {
    try { return norm(fsr.realpathSync.native(toNative(cur))) + suffix; } catch { }
    const i = cur.lastIndexOf('/'); if (i <= 0) break;
    suffix = '/' + cur.slice(i + 1) + suffix; cur = cur.slice(0, i);
  }
  return p;
}
const wsReal = realOf(ws), repoReal = realOf(repo);
const realDir = d => wsReal + d.slice(ws.length); // WRITE_ALLOW_DIRS/FILES/DENY jsou vždy `${ws}/…` — nahradí se jen kořen za jeho reálnou podobu
const WRITE_ALLOW_DIRS_REAL = WRITE_ALLOW_DIRS.map(realDir);
const WRITE_ALLOW_FILES_REAL = WRITE_ALLOW_FILES.map(realDir);
const WRITE_DENY_REAL = WRITE_DENY.map(realDir);

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
const WRAP = new Set(['sudo', 'env', 'nohup', 'time', 'exec', 'command', 'call', 'npx', 'bunx', 'xargs', '&', 'start', 'nice', 'timeout', 'stdbuf', 'builtin']);
function extractHeredocs(s) { // A-006 kolo 3: tělo heredocu (<<EOF, <<'EOF', <<-EOF … po ukončovací řádek) se dřív
  if (!s.includes('<<')) return { stripped: s, bodies: [] };  // ZAHODILO (A-006 kolo 2, L22) — teď se ULOŽÍ do bodies[]
  const lines = s.split('\n'); const out = []; const bodies = [];         // (v pořadí výskytu) a komu patří, pozná
  for (let i = 0; i < lines.length; i++) {                                // commands() podle značky „<<…" v tokenech
    out.push(lines[i]);                                                  // hlavičkového řádku (ten zůstává beze změny).
    const m = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(lines[i]); if (!m) continue;
    const term = m[2], strip = /<<-/.test(m[0]); let j = i + 1; const body = [];
    while (j < lines.length && (strip ? lines[j].replace(/^\t+/, '') : lines[j]).replace(/\r$/, '') !== term) { body.push(strip ? lines[j].replace(/^\t+/, '') : lines[j]); j++; }
    bodies.push(body.join('\n'));
    i = j; // tělo i ukončovací řádek se do výstupu (stripped) nezapíší — jen do bodies[]
  }
  return { stripped: out.join('\n'), bodies };
}
function segments(s) { // rozdělí na jednoduché příkazy mimo uvozovky; tokeny bez uvozovek; `2>&1`, `&>` zůstanou jedním tokenem
  // A-006 kolo 3: heredoc se tady už NEODSTRAŇUJE (to dělá extractHeredocs v commands(), před voláním segments()) —
  // navíc se pro každý vrácený segment hlásí, jestli byl uvozen SKUTEČNOU rourou (jedno '|', ne '||' a ne '>|'
  // noclobber) — potřeba pro rozpoznání stdin shellu čteného rourou (`… | sh`, A-006 kolo 3).
  const out = [], piped = []; let tok = '', toks = [], q = null, had = false, quotedStart = false, escaped = false, pendingPipe = false;
  // token, jehož „cíl přesměrování" pochází z uvozovek (`grep ">" f`) NEBO z escapovaného \> ([ a \> b ]), dostane
  // neviditelnou značku → writeTargets() ho nebere jako přesměrování. quotedStart platí JEN když uvozovka OTEVŘELA
  // token (had byl false) — ne když se objeví až uprostřed slepeného `>"cíl"`, to je SKUTEČNÝ zápis (A-006 kolo 2, B08/B32/B39).
  const endTok = () => { if (had) toks.push((quotedStart || escaped) && /^(\d|&)?>/.test(tok) ? '​' + tok : tok); tok = ''; had = false; quotedStart = false; escaped = false; }; const endSeg = () => { endTok(); if (toks.length) { out.push(toks); piped.push(pendingPipe); } toks = []; };
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && s[i + 1] === '"') { tok += '"'; i++; } else tok += c; continue; }
    // '\>' mimo uvozovky = literální '>' (test/[ … \> … ], porovnání řetězců), NE přesměrování — Windows cesty '>'
    // nesmí obsahovat, takže se tím nic legitimního nerozbije (A-006 kolo 2, L20).
    if (c === '\\' && s[i + 1] === '>') { tok += '>'; had = true; escaped = true; i++; continue; }
    if (c === '"' || c === "'") { if (!had) quotedStart = true; q = c; had = true; continue; }
    if (c === '&' && (tok.endsWith('>') || s[i + 1] === '>')) { tok += c; had = true; continue; }
    if (c === '|' && tok.endsWith('>')) { tok += c; had = true; continue; } // '>|' — noclobber override (A-006 kolo 2, B06)
    // '>' je VŽDY metaznak přesměrování — i BEZ mezery za předchozím slovem („slovo>cíl"). Dřív se takový token slepil
    // dohromady a writeTargets() ho neviděl jako zápis (A-006, fail-open). Zůstává slepený jen fd-prefix (holé číslo/„&").
    if (c === '>') { if (had && !/^(\d+|&)?>*$/.test(tok)) endTok(); tok += c; had = true; continue; }
    if (c === '`' || c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')' || (c === '$' && s[i + 1] === '(')) {
      if (c === '&' && !had && !toks.length && s[i + 1] === ' ') { tok = '&'; had = true; endTok(); continue; }
      endSeg(); pendingPipe = c === '|' && s[i - 1] !== '|' && s[i + 1] !== '|'; continue; // A-006 kolo 3: '|' skutečné (ne '||') → další segment je rourou napojen na tento
    }
    if (/\s/.test(c)) { endTok(); continue; }
    tok += c; had = true; }
  endSeg(); return { segs: out, piped };
}
const baseW = x => (x || '').replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
// obaly s hodnotovým přepínačem (kolo 3): -u/-n/-s/-k berou samostatný token jako hodnotu (sudo -u me, nice -n 10, timeout -s KILL 5, xargs -n 1)
const WRAP_VAL = { sudo: /^-[ug]$/, env: /^-u$/, nice: /^-n$/, timeout: /^-[sk]$/i, xargs: /^-[nIiLlPsdEea]$/, stdbuf: /^-[ioe]$/ };
const WRAP_POS = new Set(['timeout']); // povinný poziční argument (limit) i bez přepínače, např. „timeout 60 …"
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', '{', '}', '!']); // složené příkazy (if/then, while/do, { }, !) skrývají první slovo segmentu — jen se přeskočí, žádné vlastní argumenty
// A-006 kolo 3: shellové interprety, které BEZ -c/-Command/skript-souboru čtou příkazy ze svého stdin (heredoc/roura/`<`)
const STDIN_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'cmd', 'powershell', 'pwsh']);
const STDIN_MARK = new Set(['-', '-s']); // pwsh/powershell „-" a posix shelly „-s" = výslovně čti příkazy ze stdin
const STDIN_UNKNOWN = Symbol('stdin-unresolved'); // obsah stdin se nedá staticky zjistit (roura z jiného příkazu než heredoc, `< soubor`) → fail-closed
function analyzeShellArgs(a) { // z argumentů PO -c/-Command (nebo všech, není-li -c/-Command) zjistí: má poziční skript-soubor? „-"/-s"? `< soubor`?
  const positional = []; let explicitStdin = false, redirectIn = null;
  for (let i = 0; i < a.length; i++) { const t = a[i];
    if (/^<<-?/.test(t)) continue; // značka heredocu patří tomuto příkazu — není to poziční argument
    if (t === '<') { redirectIn = a[i + 1] || true; i++; continue; }
    if (STDIN_MARK.has(t)) { explicitStdin = true; continue; }
    if (/^-/.test(t)) continue; // ostatní přepínače (-NoProfile, -l…) nejsou zdroj/cíl stdin
    positional.push(t);
  }
  return { positional, explicitStdin, redirectIn };
}
// jednoduché příkazy po obalech (npx, sudo, env, xargs…); shell -c / cmd /c / powershell -Command se rozbalí; interpret -e/-c vrátí kód
// kolo 3: prosté „NAME=hodnota" jako CELÝ segment (bez příkazu za ním) se pamatuje pro $NAME/${NAME} použité později ve STEJNÉM příkazu (W=~/x; git -C $W …)
function commands(cmd, depth = 0, out = [], vars = {}) {
  if (depth > 3) return out;
  const heredocs = extractHeredocs(cmd); // A-006 kolo 3: tělo heredocu se dřív zahazovalo — teď se (pro stdin shell) rekurzivně parsuje jako příkazy
  const { segs, piped } = segments(heredocs.stripped);
  let hIdx = 0;
  const segHeredoc = segs.map(toks => toks.some(t => /^<<-?[A-Za-z_]/.test(t)) ? heredocs.bodies[hIdx++] : undefined);
  for (let si = 0; si < segs.length; si++) {
    const toks = segs[si];
    if (toks.length === 1 && /^[A-Za-z_]\w*=/.test(toks[0])) { const eq = toks[0].indexOf('='); vars[toks[0].slice(0, eq)] = toks[0].slice(eq + 1); continue; }
    const subst = t => (t || '').replace(/\$\{(\w+)\}|\$(\w+)/g, (m, b, p) => { const n = b || p; return vars[n] !== undefined ? vars[n] : m; });
    let i = 0;
    for (;;) { const w = baseW(subst(toks[i]));
      if (/^\w+=/.test(toks[i] || '')) { const eq = toks[i].indexOf('='); vars[toks[i].slice(0, eq)] = toks[i].slice(eq + 1); i++; continue; }
      if (KEYWORDS.has(w)) { i++; continue; }
      if (WRAP.has(w)) {
        i++; if (w === 'start' && toks[i] !== undefined && (toks[i] === '' || /\s/.test(toks[i]))) i++;
        while (toks[i] && (/^-/.test(toks[i]) || (w === 'start' && /^\//.test(toks[i])))) { const valRe = WRAP_VAL[w]; const takesVal = valRe && valRe.test(toks[i]); i++; if (takesVal && toks[i] !== undefined) i++; }
        if (WRAP_POS.has(w) && toks[i] !== undefined && !/^-/.test(toks[i])) i++;
        continue;
      }
      if (['npm', 'pnpm', 'yarn'].includes(w) && /^(exec|dlx|x)$/.test(baseW(subst(toks[i + 1])) || '')) { i += 2; while (toks[i] && /^-/.test(toks[i])) i++; continue; }
      break; }
    const w = baseW(subst(toks[i])); if (!w) continue; const a = toks.slice(i + 1).map(subst); const lower = a.map(x => x.toLowerCase());
    if (STDIN_SHELLS.has(w)) {
      const isShellC = x => /^(-c|\/c|\/k|-command|-encodedcommand)$/.test(x) || (['bash', 'sh', 'zsh', 'dash', 'ksh'].includes(w) && /^-[a-z]*c$/i.test(x));
      const k = lower.findIndex(isShellC);
      const lone = k >= 0 && a[k + 1] === '-'; // `-Command -` / `-c -` = čti PŘÍKAZY ze stdin, ne inline text
      if (k >= 0 && !lone) { commands(a.slice(k + 1).join(' '), depth + 1, out, vars); continue; }
      // bez -c/-Command (nebo s ním, ale jen jako „-"): stdin shell — najdi zdroj (vlastní heredoc → sousední heredoc
      // přes rouru → jinak neznámá roura/`< soubor` = fail-closed; A-006 kolo 3)
      const stdinArgs = k >= 0 ? a.slice(k + 1) : a;
      const { positional, explicitStdin, redirectIn } = analyzeShellArgs(stdinArgs);
      if (lone || explicitStdin || positional.length === 0) {
        let feed = null;
        if (segHeredoc[si] !== undefined) feed = segHeredoc[si];
        else if (redirectIn) feed = STDIN_UNKNOWN;
        else if (piped[si]) feed = segHeredoc[si - 1] !== undefined ? segHeredoc[si - 1] : STDIN_UNKNOWN;
        if (feed === STDIN_UNKNOWN) { out.push({ w: '__stdin_unresolved__', a: [], lower: [], all: [`${w}${redirectIn ? ' < ' + redirectIn : ' (roura)'}`], inline: null }); continue; }
        if (typeof feed === 'string') { commands(feed, depth + 1, out, vars); continue; }
        // feed === null → v tomto konstruktu není heredoc/roura/`<` vůbec (např. samotné „bash" bez dalšího kontextu) — beze změny
      }
    }
    if (w === 'eval') { commands(a.join(' '), depth + 1, out, vars); continue; } // eval "git push …" — obsah se rekurzivně tokenizuje jako u shell -c (kolo 2)
    const inline = ['node', 'python', 'python3', 'py', 'deno', 'bun', 'ruby', 'perl'].includes(w) && lower.some(x => /^(-e|-c|--eval|-p|--print)$/.test(x)) ? a.join(' ') : null;
    out.push({ w, a, lower, all: [subst(toks[i]), ...a], inline });
  }
  return out;
}
function denyHit(cmd) {   // → { why, tok } nebo null
  for (const c of commands(cmd)) {
    if (c.w === '__stdin_unresolved__') return { why: 'stdin shellového interpretu se nedá staticky ověřit (roura odjinud než z heredoc, nebo `< soubor`) — fail-closed (A-006 kolo 3)', tok: c.all[0] };
    if (c.inline) { for (const [re, why] of ANY_DENY) { const m = c.inline.match(re); if (m) return { why, tok: m[0] }; } continue; }
    for (const [f, why] of WORD_DENY) if (f(c.w, c.lower)) return { why, tok: [c.w, ...c.a.slice(0, 2)].join(' ') };
    const ro = READONLY.has(c.w) || (c.w === 'git' && /^(grep|log|show|diff|blame|status|ls-files)$/.test(c.lower[0] || ''));
    const m = !ro && c.all.join(' ').match(SQL_DENY); if (m) return { why: 'destruktivní SQL', tok: m[0] };
  }
  return null;
}
// KAM příkaz zapisuje: přesměrování (kromě /dev/null, nul, &N) a cíle zapisujících příkazů; cd uvnitř příkazu se sleduje
const NULLS = /^(\/dev\/null|\/dev\/stdout|\/dev\/stderr|nul|\$null|&\d?|&-)$/i;
const W_LAST = new Set(['cp', 'mv', 'copy', 'move', 'xcopy', 'rsync', 'ln', 'install', 'scp']);
const W_ALL = new Set(['tee', 'touch', 'mkdir', 'md', 'rm', 'del', 'erase', 'rmdir', 'rd', 'truncate', 'unlink']);
const W_PS = { 'set-content': 0, 'add-content': 0, 'out-file': 0, 'new-item': 0, 'remove-item': 0, 'clear-content': 0, 'copy-item': 1, 'move-item': 1, 'rename-item': 0 };
const INLINE_WRITE = /(writeFile|appendFile|createWriteStream|copyFile|renameSync|mkdirSync|rmSync|unlink|open\([^)]*['"][wax]|shutil\.|Set-Content|Out-File|\.write_text|\.write_bytes)/i;
// A-006 kolo 2: cíl přesměrování/zápisu, který se nedá bezpečně vyřešit na konkrétní cestu (~, $VAR, ${VAR},
// %VAR%, příkazová substituce $(...), zpětné apostrofy) MUSÍ blokovat fail-closed — ne se tiše vzít jako
// doslovná relativní cesta (to by kontrolu obešlo, protože se nikdy nerozřeší na skutečný zakázaný cíl).
const UNRESOLVABLE = /^~(\/|$)|\$\{?\w+\}?|%\w+%|\$\(|`/;
function writeTargets(cmd, cwd0) {
  const res = []; let cur = cwd0;
  const abs = p => { p = String(p).replace(/\\/g, '/'); const n = norm(p); return /^\//.test(n) ? norm(collapse(n)) : norm(collapse(cur + '/' + p)); };
  const mk = (p, w, tok) => UNRESOLVABLE.test(p) ? { unresolved: true, raw: p, cmd: w, tok } : { path: abs(p), cmd: w, tok };
  for (const c of commands(cmd)) {
    if (['cd', 'pushd', 'set-location', 'sl', 'chdir'].includes(c.w)) { const t = c.a.find(x => !/^[-/]/.test(x) || /^\//.test(x) && x.length > 2); if (t) cur = abs(t); continue; }
    // A-006 kolo 3: vložený kód (node -e, python -c…) se dřív `continue`-em vyhnul kontrole přesměrování celého
    // segmentu → `node -e 1 > ../out` prošlo (E14). Podezřelý zápis uvnitř kódu se pořád zaznamená, ale segment
    // se dál zpracuje stejně jako každý jiný — přesměrování se kontroluje VŽDY, bez ohledu na příkaz.
    if (c.inline && INLINE_WRITE.test(c.inline)) res.push({ inline: true, text: c.inline, cmd: c.w });
    // přesměrování: `> f`, `>> f`, `1>f`, `2> f`, `&> f`, `>nul`, `>|f` (noclobber override, A-006 kolo 2 B06)
    for (let k = 0; k < c.all.length; k++) { const m = /^(\d|&)?>>?\|?(.*)$/.exec(c.all[k]); if (!m) continue; const had2 = !!m[2]; const t = m[2] || c.all[k + 1] || ''; if (!had2) k++; const tokStr = c.all[k - (had2 ? 0 : 1)] + (had2 ? '' : (t ? ' ' + t : ''));
      // prázdný/přerušený cíl (žádný token za '>') — typicky $(...)/zpětné apostrofy rozštěpily příkaz na segmenty a cíl
      // zmizel; nesmí se to tiše přeskočit (fail-open), musí blokovat jako neřešitelný cíl (A-006 kolo 2).
      if (!t) res.push({ unresolved: true, raw: '(prázdný/přerušený cíl přesměrování)', cmd: c.w, tok: tokStr });
      else if (!NULLS.test(t)) res.push(mk(t, c.w, tokStr)); }
    const args = c.a.filter(x => !/^(\d|&)?>>?/.test(x)); const pos = []; for (let k = 0; k < args.length; k++) { if (/^\d?>>?$/.test(args[k])) { k++; continue; } if (!/^-/.test(args[k]) && !(/^\/[a-z?]$/i.test(args[k]) && ['copy', 'move', 'xcopy', 'del', 'erase', 'rd', 'rmdir', 'md', 'mkdir'].includes(c.w))) pos.push(args[k]); }
    const add = p => p && res.push(mk(p, c.w, `${c.w} ${p}`));
    if (c.w === 'dd') { const of = c.a.find(x => /^of=/.test(x)); if (of) add(of.slice(3)); } // dd if=… of=CÍL (A-006 kolo 2, B16)
    else if (W_LAST.has(c.w)) { const d = args.findIndex(x => x === '-t' || x === '--target-directory'); add(d >= 0 ? args[d + 1] : pos[pos.length - 1]); }
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
const GIT_MUT_SUBCMDS = new Set(['push', 'commit', 'merge', 'rebase', 'reset', 'checkout', 'switch', 'restore', 'tag', 'stash', 'clean', 'am', 'cherry-pick', 'revert']);
// A-004 kolo 3: podpříkaz gitu a cíl (-C) se čtou POZIČNĚ z už tokenizovaných argumentů (c.a), NE regexem nad
// spojeným textem (starý GIT_MUT nad c.all.join(' ')) — hodnota přepínače (-m "text", -c "text") je v c.a JEDEN
// token, takže text uvnitř (byť zmiňuje „git push") se už nikdy neparsuje jako by šlo o další podpříkaz
// (opravuje AH07/AH10/AH18). Globální volby gitu v libovolném pořadí: -c k=v, -C dir, --no-pager, -P,
// --git-dir[=|_]…, --work-tree[=|_]…, --bare, --exec-path[=…] → pak teprve podpříkaz.
function gitInvocation(a, cwd0) {
  let target = cwd0, sub = null, i = 0;
  for (; i < a.length; i++) {
    const t = a[i];
    if (t === '-C') { if (a[i + 1] !== undefined) { target = a[i + 1]; i++; } continue; }
    if (t === '-c') { i++; continue; } // -c name=value = dva tokeny (name=value nemůže být podpříkaz)
    if (t === '--git-dir' || t === '--work-tree') { i++; continue; }
    if (/^--(git-dir|work-tree)=/.test(t)) continue;
    if (/^(--no-pager|-P|--bare|--exec-path)(=.*)?$/.test(t)) continue;
    if (/^-/.test(t)) continue; // neznámá globální volba gitu (bez odděleného hodnotového tokenu) — přeskočit
    sub = t.toLowerCase(); i++; break;
  }
  return { target, sub, subArgs: a.slice(i) };
}

let raw = ''; process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch { process.stderr.write('AUDITOR-GUARD Blocked: vstup hooku není JSON (fail-closed).\n'); process.exit(2); }
  const tool = input.tool_name || '', ti = input.tool_input || {}, cwd = norm(input.cwd || process.cwd());
  if (!ws || /\[dopl/i.test(ws)) { process.stderr.write('AUDITOR-GUARD: AUDITOR_WORKSPACE není nastaven / obsahuje placeholder — spusť setup průvodce (fail-closed).\n'); process.exit(2); }

  if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(tool)) {
    const fp = norm(collapse(ti.file_path || ti.notebook_path || '')); if (!fp) process.exit(0);
    // A-006 kolo 3 (E23): stejně jako u Bash/PowerShell musí i tady projít reálná cesta (fs.realpathSync) —
    // junction/symlink pod povolenou složkou (typicky build/lnk) může ve skutečnosti vést ven z workspace;
    // naivní řetězcová shoda nad `fp` samotným by to nepoznala. Blok padne, když selže buď literální, nebo reálná cesta.
    const fpReal = realOf(fp);
    if (WRITE_DENY.some(d => fp.startsWith(d)) || WRITE_DENY_REAL.some(d => fpReal.startsWith(d))) block(`Zápis do ${fp} zakázán — 03_dukazy/ patří Kapitánovi.`);
    if ((repo && (fp === repo || fp.startsWith(repo + '/'))) || (repoReal && (fpReal === repoReal || fpReal.startsWith(repoReal + '/')))) block(`Zápis do repa aplikace zakázán (${fp}). Auditor nekóduje — sepiš nález/návrh do AUDIT/.`);
    const inAllow = p => WRITE_ALLOW_DIRS.some(a => p.startsWith(a)) || WRITE_ALLOW_FILES.includes(p) || WRITE_ALLOW_DIRS_REAL.some(a => p.startsWith(a)) || WRITE_ALLOW_FILES_REAL.includes(p);
    if (!inAllow(fp) || !inAllow(fpReal)) block(`Zápis mimo povolené složky (${fp}). Povoleno: AUDIT/, tools/, .claude/, build/ (lokální klon pro testy) ve workspace auditora.`);
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
      const { target: rawTarget, sub, subArgs } = gitInvocation(c.a, cur);
      if (!sub) continue;
      const target = absTarget(rawTarget);
      // force push: jen skutečný --force/-f/--force-with-lease argument gitu za „push", nikdy text zprávy commitu (opravuje AH15)
      const isForce = sub === 'push' && subArgs.some(x => x === '--force' || x === '-f' || x === '--force-with-lease' || /^--force-with-lease=/.test(x));
      if (isForce) block('force push zakázán i ve workspace.');
      const isMutating = GIT_MUT_SUBCMDS.has(sub) || (sub === 'branch' && subArgs[0] && /^-[dDm]/.test(subArgs[0]));
      if (!isMutating) continue;
      const inRepo = repo && (target === repo || target.startsWith(repo + '/'));
      // build/ klon může být junction/symlink jinam (disk mimo produkci) → skutečné cesty položek build/ se berou jako build/
      let buildReal = []; try { const fsg = require('node:fs'), pg = require('node:path'); const bd = pg.join(WORKSPACE, 'build'); buildReal = fsg.readdirSync(bd).map(n => { try { return norm(fsg.realpathSync.native(pg.join(bd, n))); } catch { return ''; } }).filter(Boolean); } catch { }
      const inBuild = target.startsWith(ws + '/build/') || buildReal.some(r => target === r || target.startsWith(r + '/'));
      const inWs = target === ws || target.startsWith(ws + '/') || inBuild;
      if (inRepo || !inWs) block(`git ${sub} mimo workspace auditora zakázán (cíl: ${target}). Auditor commituje jen svůj AUDIT repozitář.`);
      if (inBuild && !/^(checkout|switch|restore|stash)$/i.test(sub)) block(`git ${sub} v build/ klonu zakázán — klon slouží jen ke čtení a spuštění testů (povoleno: clone, fetch, pull, checkout, switch).`);
    }
    // zápis shellem: rozhoduje CÍL zápisu (přesměrování, cp/mv/copy/Set-Content…), ne slova v příkazu — `grep x <repo> 2>/dev/null` projde
    const wt = writeTargets(cmd, cwd); const inRepo = p => repo && (p === repo || p.startsWith(repo + '/'));
    // A-006: nestačilo ověřit „není to v repu aplikace" — cíl navíc MUSÍ ležet uvnitř povoleného workspace (stejný
    // allowlist jako pro Edit/Write výše). Nejasný/venkovní cíl přesměrování (mimo repo i mimo workspace) = blok (fail-closed).
    // A-006 kolo 2: navíc povolit JEN pro shellové zápisy cíl uvnitř OS dočasné složky (os.tmpdir() — %TEMP%, /tmp) —
    // agenti ji běžně a záměrně používají pro jednorázové skripty/scratchpad (viz rules/common/isolated-environment.md);
    // bez výjimky by pojistka tlačila k jejímu obcházení. Repo aplikace (inRepo výše) i vše ostatní mimo workspace/tmpdir
    // zůstává blokované; Edit/Write kontrola na řádku výše (fp) tuto výjimku NEMÁ — platí jen pro Bash/PowerShell.
    const TMP = norm(require('node:os').tmpdir());
    const TMPReal = realOf(TMP);
    const inTmp = p => p === TMP || p.startsWith(TMP + '/') || p === TMPReal || p.startsWith(TMPReal + '/');
    const inWorkspace = p => WRITE_ALLOW_DIRS.some(a => p.startsWith(a)) || WRITE_ALLOW_FILES.includes(p) || WRITE_ALLOW_DIRS_REAL.some(a => p.startsWith(a)) || WRITE_ALLOW_FILES_REAL.includes(p) || inTmp(p);
    for (const t of wt) {
      if (t.inline) { if (repoRe && repoRe.test(norm(t.text))) block(`Shellový zápis do repa aplikace zakázán (vložený kód ${t.cmd} zapisuje a zmiňuje cestu repa). Výstupy patří do AUDIT/.`); continue; }
      // A-006 kolo 2: nejasný/neřešitelný cíl (~, $VAR, ${VAR}, %VAR%, $(...), zpětné apostrofy) blokuje rovnou —
      // fail-closed, nikdy se nebere jako doslovná relativní cesta (to by kontrolu obešlo).
      if (t.unresolved) block(`Cíl zápisu se nedá bezpečně rozřešit ("${t.raw}" u "${t.tok}") — nepoužívej proměnné/tildu/substituci v cíli zápisu (A-006 kolo 2: fail-closed).`);
      // A-006 kolo 2: reálná cesta (fs.realpathSync) navíc — junction/symlink pod povolenou složkou (typicky build/)
      // může ve skutečnosti vést ven z workspace; naivní řetězcová shoda by to nepoznala (B24). Cíl musí projít OBĚMA.
      const rp = realOf(t.path);
      if (t.path && /\/audit\/bus\/[^/]*\.json$/.test(t.path)) block(`Zprávy na mostu jen přes tools/bus.mjs, ne shellem („${t.tok}").`);
      if (inRepo(t.path) || (repoReal && (rp === repoReal || rp.startsWith(repoReal + '/')))) block(`Shellový zápis do repa aplikace zakázán („${t.tok}" → ${t.path}). Výstupy patří do AUDIT/.`);
      if (WRITE_DENY.some(d => t.path.startsWith(d)) || WRITE_DENY_REAL.some(d => rp.startsWith(d))) block(`Shellový zápis do ${t.path} zakázán — 03_dukazy/ patří Kapitánovi („${t.tok}").`);
      if (!inWorkspace(t.path) || !inWorkspace(rp)) block(`Shellový zápis mimo povolený workspace zakázán („${t.tok}" → ${t.path}). Cíl přesměrování musí být uvnitř AUDIT/, tools/, .claude/, build/ nebo test-results/ ve workspace auditora (A-006: fail-closed pro nejasný/venkovní cíl).`);
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
