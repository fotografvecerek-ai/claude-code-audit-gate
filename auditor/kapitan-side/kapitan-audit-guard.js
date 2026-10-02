#!/usr/bin/env node
// KAPITÁN AUDIT GUARD — PreToolUse hook do settings projektu Kapitána (registruje setup průvodce).
// Vynucuje: (1) Kapitán zapisuje do workspace auditora jen do AUDIT/03_dukazy/, zprávy jen přes bus.mjs --from kapitan (allowlist A-029);
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
// A-029 kolo 2: kanonická podoba cesty pro porovnání s ws/repo — realpath nejbližšího EXISTUJÍCÍHO předka + zbytek (8.3 jména
// RUNNER~1 na Windows, /var → /private/var na macOS, symlink/junction vedoucí do ws). Vstup je norm() (lowercase) — segmenty se proto
// dohledávají bez ohledu na velikost písmen (Linux má FS citlivý na velikost). Nekanonizovatelné = beze změny (porovnává se obojí).
const toNative = n => process.platform === 'win32' ? n.replace(/^\/([a-z])(\/|$)/, (_, d) => `${d.toUpperCase()}:/`) : n;
const canonMemo = new Map();
function canonN(n) {
  if (!n || !/^\//.test(n)) return n;
  if (canonMemo.has(n)) return canonMemo.get(n);
  const segs = toNative(n).split('/').filter(Boolean);
  let head = process.platform === 'win32' && /^[A-Za-z]:$/.test(segs[0] || '') ? segs.shift() + '/' : '/';
  let i = 0;
  for (; i < segs.length; i++) {
    let next = path.join(head, segs[i]);
    if (!fsx.existsSync(next)) { let hit; try { hit = fsx.readdirSync(head).find(e => e.toLowerCase() === segs[i].toLowerCase()); } catch { } if (!hit) break; next = path.join(head, hit); }
    head = next;
  }
  let out = n; try { out = norm(collapse([fsx.realpathSync.native(head), ...segs.slice(i)].join('/'))); } catch { }
  canonMemo.set(n, out); return out;
}
const relOf = (q, roots) => { for (const v of roots) if (v && (q === v || q.startsWith(v + '/'))) return q.slice(v.length); return null; };
// všechny relativní polohy cesty vůči kořenům (doslovně i kanonicky) — fail-closed: rozhoduje KAŽDÁ z nich
const relsOf = (p, roots) => [...new Set([p, canonN(p)])].map(q => relOf(q, roots)).filter(r => r !== null);
let R = null; for (const c of [path.join(__dirname, 'hygiene-rules.js'), path.join(__dirname, 'hygiene', 'hygiene-rules.js'), path.join(process.env.AUDITOR_WORKSPACE || '', 'kapitan-side/hygiene/hygiene-rules.js')]) { try { R = require(c).load(); break; } catch { } }
// A-026 (1.8.9): workspace auditora, otisk jeho gate-check.mjs i PROD_BRANCHES jen z KOTVY DŮVĚRY (`<git common dir>/auditor-kotva.json`,
// viz kotva.cjs). Dřívější zdroj `git show HEAD:.claude/settings.json` (A-023 X26) šel změnit commitem i plumbingem (X28/X28b/X29)
// a env (AUDITOR_WORKSPACE, PROD_BRANCHES) si shell Kapitána nastaví sám (X14/X32). Kotva chybí/vadná = deploy/push na prod BLOK.
let KOTVA = null; for (const c of [path.join(__dirname, 'kotva.cjs'), path.join(__dirname, '..', 'kapitan-side', 'kotva.cjs')]) { try { KOTVA = require(c); break; } catch { } }
const NO_KOTVA = { ok: false, stav: 'modul', msg: 'vedle kapitan-audit-guard.js chybí kotva.cjs — spusť aktualizaci (START → [2]) a pak START → [9]' };
const anchorMemo = new Map();
function anchorOf(dir) { if (!KOTVA) return NO_KOTVA; const k = String(dir || ''); if (!anchorMemo.has(k)) anchorMemo.set(k, KOTVA.verifyAnchor(k || process.cwd())); return anchorMemo.get(k); }
const ALWAYS_PROD = /^(main|master)$/i; // main/master chráněné VŽDY, i bez kotvy
const DEFAULT_PROD = /^(main|master|production|prod|release)$/i;
const isProdBranch = (b, d) => { const k = anchorOf(d || HOOK_CWD); /* A-026: PROD větve z kotvy repa PŘÍKAZU, ne z env */ return ALWAYS_PROD.test(b) || (k.ok ? k.prodRe : DEFAULT_PROD).test(b); };
const UNTRUSTED_ENV = ['AUDITOR_WORKSPACE', 'AUDITOR_TARGET_REPO', 'GATE_MAX_AGE_H', 'PROD_BRANCHES'];
// A-026 AK1: kotva a vnitřek .git (config, hooks, kotva) jsou pro agenta nedotknutelné — i přes proměnnou, glob, symlink nebo skript.
const ANCHOR_RE = /auditor-?kotv|kotva\.json/i;
const flat = s => String(s || '').replace(/["'`+\s\\]/g, '');
const IN_GIT_DIR = /(^|\/)\.git(\/|$)/i;
const PROTECTED_NAMES = ['.git', '.claude', '.codex', 'hooks', 'settings.json', 'settings.local.json', 'auditor-kotva.json', 'start-kapitan.cmd', 'start-kapitan.sh', 'start-projekt.cmd', 'start-projekt.sh', 'start-auditor.cmd', 'start-auditor.sh'];
const globRe = seg => new RegExp('^' + seg.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
const globHitsProtected = p => String(p || '').split('/').some(seg => /[*?[]/.test(seg) && (() => { try { const re = globRe(seg); return PROTECTED_NAMES.some(n => re.test(n)); } catch { return true; } })());
// A-031: spouštěče start-kapitan/projekt/auditor (.cmd/.sh) — přepsat je smí jen START (vlastník); otisk hlídá prisnost.mjs
const LAUNCHER_RE = /start-?(kapitan|projekt|auditor)\.(cmd|sh)/i;
let HOOK_CWD = process.cwd();
// A-023 AK4 fix (a): DEPLOY se vyhodnocuje jen když PRVNÍ SLOVO segmentu (c.w, případně skutečný interpret u -e/-c) odpovídá nástroji —
// dřív regex běžel nad celým textem segmentu (včetně obsahu v uvozovkách), takže echo/grep/git commit -m se slovem „vercel --prod" apod. blokovaly (KH11, KH12, K35, K40).
const DEPLOY = [
  { bin: /^vercel$/, re: /\bvercel\s+(deploy|--prod|alias|promote)|\bvercel\b.*--prod/i },
  { bin: /^(npm|pnpm|yarn)$/, re: /\b(npm|pnpm|yarn)\s+publish\b/i },
  { bin: /^prisma$/, re: /\bprisma\s+migrate\s+deploy\b/i },
  { bin: /^supabase$/, re: /\bsupabase\s+(db\s+push|functions\s+deploy)\b/i },
  { bin: /^capgo$/, re: /\bcapgo\b.*(upload|bundle)/i },
  { bin: /^(python3?|py|build_ota\.py)$/, re: /\bbuild_ota\.py\b/i },
  { bin: /^(eas|fastlane)$/, re: /\b(eas|fastlane)\s+(submit|build)\b/i },
  { bin: /^gh$/, re: /\bgh\s+release\s+create\b/i },
  { bin: /^gh$/, re: /\bgh\s+pr\s+merge\b/i },
];
// --- analýza příkazu (stejná jako v hooku auditora): rozhoduje CÍL zápisu, ne slova v příkazu — čtení s 2>/dev/null projde
const WRAP = new Set(['sudo', 'env', 'nohup', 'time', 'exec', 'command', 'call', 'npx', 'bunx', 'xargs', '&', 'start', 'nice']);
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', '{', '}', '!']); // A-005 kolo 3: "if cond; then git push…; fi" — 'then' by jinak skryl 'git' jako c.w
// A-023 AK4 fix (c) / kolo 3 (N08): heredoc (`cat <<'EOF' ... EOF`) tělo je DATA zapisovaná do souboru/streamu, ne
// shellové příkazy — naivní dělení na '\n' ho dřív rozsekalo na samostatné segmenty (KH15: "git push origin main"
// v těle heredocu se vyhodnotilo jako skutečný push). Kolo 2 tělo BLINDNĚ ODSTRAŇOVALO (stripHeredocs) — když bylo
// napojené rourou na STDIN shell ("cat <<'EOF' | sh"), tělo se ztratilo úplně a nikdo ho neprověřil (N08, regrese).
// Teď se tělo ULOŽÍ (bodies[]) a pro stdin shell (bez -c/-Command, čte příkazy ze svého stdin) se dohledá zdroj:
// vlastní heredoc → sousední heredoc přes SKUTEČNOU rouru „|" (ne „||") → jinak neznámá roura/`< soubor` = fail-closed.
// Stejný algoritmus jako auditor/.claude/hooks/auditor-guard.js (A-006 kolo 3) — port kvůli konzistenci obou hooků.
function extractHeredocs(s) {
  if (!s.includes('<<')) return { stripped: s, bodies: [] };
  const lines = s.split('\n'); const out = []; const bodies = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const m = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(lines[i]); if (!m) continue;
    const term = m[2], strip = /<<-/.test(m[0]); let j = i + 1; const body = [];
    while (j < lines.length && (strip ? lines[j].replace(/^\t+/, '') : lines[j]).replace(/\r$/, '') !== term) { body.push(strip ? lines[j].replace(/^\t+/, '') : lines[j]); j++; }
    bodies.push(body.join('\n'));
    i = j; // tělo i ukončovací řádek se do výstupu (stripped) nezapíší — jen do bodies[]
  }
  return { stripped: out.join('\n'), bodies };
}
function segments(s) { // rozdělí na jednoduché příkazy mimo uvozovky; tokeny bez uvozovek; `2>&1`, `&>` zůstanou jedním tokenem
  // heredoc se tady už NEODSTRAŇUJE (to dělá extractHeredocs v commands(), před voláním segments()) — navíc se pro
  // každý vrácený segment hlásí, jestli byl uvozen SKUTEČNOU rourou (jedno '|', ne '||') — potřeba pro rozpoznání
  // stdin shellu čteného rourou (`… | sh`, N08).
  const out = [], piped = []; let tok = '', toks = [], q = null, had = false, quoted = false, pendingPipe = false;
  // citovaný token, který vypadá jako přesměrování (`grep ">" f`), dostane neviditelnou značku → není to přesměrování
  const endTok = () => { if (had) toks.push(quoted && /^(\d|&)?>/.test(tok) ? '\u200b' + tok : tok); tok = ''; had = false; quoted = false; }; const endSeg = () => { endTok(); if (toks.length) { out.push(toks); piped.push(pendingPipe); } toks = []; };
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && s[i + 1] === '"') { tok += '"'; i++; } else tok += c; continue; }
    if (c === '"' || c === "'") { q = c; had = true; quoted = true; continue; }
    if (c === '&' && (tok.endsWith('>') || s[i + 1] === '>')) { tok += c; had = true; continue; }
    // '>' je VŽDY metaznak přesměrování — i BEZ mezery za předchozím slovem („slovo>cíl"). Dřív se takový token slepil
    // dohromady a writeTargets() ho neviděl jako zápis (A-006, fail-open). Zůstává slepený jen fd-prefix (holé číslo/„&").
    if (c === '>') { if (had && !/^(\d+|&)?>*$/.test(tok)) endTok(); tok += c; had = true; continue; }
    if (c === '`' || c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')' || (c === '$' && s[i + 1] === '(')) {
      if (c === '&' && !had && !toks.length && s[i + 1] === ' ') { tok = '&'; had = true; endTok(); continue; }
      endSeg(); pendingPipe = c === '|' && s[i - 1] !== '|' && s[i + 1] !== '|'; continue; // '|' skutečné (ne '||') → další segment je rourou napojen na tento
    }
    if (/\s/.test(c)) { endTok(); continue; }
    tok += c; had = true; }
  endSeg(); return { segs: out, piped };
}
// A-023 AK4 fix (b): jednoduché "VAR=hodnota" přiřazení jako samostatný segment (před ';'/'&&'/novým řádkem) → mapa pro dosazení do -C/-c.
function buildVarMap(cmd) {
  // A-026 (H07/H16): i `export/declare/local/readonly/typeset X=…`, víc přiřazení v jednom segmentu a PowerShell `$x = "…"`
  const map = {};
  for (const toks of segments(String(cmd)).segs) {
    let t = toks; if (/^(export|declare|local|readonly|typeset|set)$/i.test(t[0] || '')) t = t.slice(1).filter(x => !/^-/.test(x));
    if (t.length && t.every(x => /^[A-Za-z_]\w*=/.test(x))) { for (const x of t) { const m = /^([A-Za-z_]\w*)=(.*)$/s.exec(x); map[m[1]] = m[2]; } continue; }
    if (/^\$[A-Za-z_]\w*$/.test(t[0] || '') && t[1] === '=' && t.length === 3) map[t[0].slice(1)] = t[2];
    else if (t.length === 1 && /^\$[A-Za-z_]\w*=/.test(t[0])) { const m = /^\$([A-Za-z_]\w*)=(.*)$/s.exec(t[0]); map[m[1]] = m[2]; }
  }
  return map;
}
function subVars(s, map) { return String(s).replace(/\$\{?(\w+)\}?/g, (m, name) => (name in map ? map[name] : m)); }
const baseW = x => (x || '').replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
// A-023 kolo 3 (N08): shellové interprety, které BEZ -c/-Command/skript-souboru čtou příkazy ze svého stdin (heredoc/roura/`<`)
const STDIN_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'cmd', 'powershell', 'pwsh']);
const STDIN_MARK = new Set(['-', '-s']); // pwsh/powershell „-" a posix shelly „-s" = výslovně čti příkazy ze stdin
const STDIN_UNKNOWN = Symbol('stdin-unresolved'); // obsah stdin se nedá staticky zjistit (roura z jiného příkazu než heredoc, `< soubor`) → fail-closed
function analyzeShellArgs(a) { // z argumentů PO -c/-Command (nebo všech, není-li -c/-Command) zjistí: má poziční skript-soubor? „-"/"-s"? `< soubor`?
  const positional = []; let explicitStdin = false, redirectIn = null;
  for (let i = 0; i < a.length; i++) { const t = a[i];
    if (/^<<-?/.test(t)) continue; // značka heredocu patří tomuto příkazu — není to poziční argument
    if (t === '<') { redirectIn = a[i + 1] || true; i++; continue; }
    if (STDIN_MARK.has(t)) { explicitStdin = true; continue; }
    if (/^-/.test(t)) continue; // ostatní přepínače nejsou zdroj/cíl stdin
    positional.push(t);
  }
  return { positional, explicitStdin, redirectIn };
}
// jednoduché příkazy po obalech (npx, sudo, env, xargs…); shell -c / cmd /c / powershell -Command se rozbalí; interpret -e/-c vrátí kód
// A-026 (H11): obsah skriptu, který shell spouští (`sh p.sh`, `source p.sh`): heredoc zapsaný do téhož souboru v tomtéž příkazu,
// jinak soubor z disku. Soubor vzniká v tomtéž příkazu jinak (echo > p.sh) a obsah nejde zjistit → STDIN_UNKNOWN (fail-closed).
const MAX_SCRIPT = 1024 * 1024;
const scriptKey = p => norm(collapse(path.resolve(HOOK_CWD, String(p || '').replace(/^~(?=\/|\\|$)/, process.env.HOME || process.env.USERPROFILE || '~'))));
function readScript(p) { try { const f = path.resolve(HOOK_CWD, p); const st = fsx.statSync(f); if (!st.isFile() || st.size > MAX_SCRIPT) return null; return fsx.readFileSync(f, 'utf8'); } catch { return null; } }
function scriptSource(p, ctx) {
  const key = scriptKey(p);
  if (ctx.files.has(key)) return ctx.files.get(key);
  if (ctx.written.has(key)) return STDIN_UNKNOWN;
  const txt = readScript(p);
  return txt === null ? null : txt;
}
// heredoc zapsaný přesměrováním do souboru (`cat <<EOF > p.sh`) → mapa soubor → tělo; ostatní cíle přesměrování = „zapsáno, obsah neznámý"
function heredocFiles(segs, segHeredoc) {
  const files = new Map(), written = new Set();
  segs.forEach((toks, si) => {
    for (let k = 0; k < toks.length; k++) { const m = /^(\d|&)?>>?(.*)$/.exec(toks[k]); if (!m) continue; const t = m[2] || toks[k + 1] || ''; if (!t || NULLS.test(t)) continue;
      if (segHeredoc[si] !== undefined) files.set(scriptKey(t), segHeredoc[si]); else written.add(scriptKey(t)); }
  });
  return { files, written };
}
// `X<<<Y` slepené bez mezer → [X, '<<<', Y] (H04)
function splitHereStrings(toks) { const o = []; for (const t of toks) { const k = t.indexOf('<<<'); if (k < 0) { o.push(t); continue; } if (k > 0) o.push(t.slice(0, k)); o.push('<<<'); if (t.length > k + 3) o.push(t.slice(k + 3)); } return o; }
const XARGS_VAL = /^(-[InPdLsEa]|--(replace|max-args|max-procs|delimiter|max-lines|max-chars|eof|arg-file))$/;
const XARGS_RISKY = new Set([...['bash', 'sh', 'zsh', 'dash', 'cmd', 'powershell', 'pwsh', 'git', 'eval', 'env', 'source', '.', 'node', 'python', 'python3', 'py', 'deno', 'bun', 'ruby', 'perl', 'npx', 'npm', 'pnpm', 'yarn', 'vercel', 'gh', 'supabase', 'prisma', 'eas', 'fastlane', 'capgo', 'iex', 'invoke-expression']]);
const MAX_DEPTH = 5;
const unresolved = (out, why) => out.push({ w: '__stdin_unresolved__', a: [], lower: [], all: [why], inline: null });
// jednoduché příkazy po obalech (npx, sudo, env, xargs…); shell -c / cmd /c / powershell -Command se rozbalí; interpret -e/-c vrátí kód
function commands(cmd, depth = 0, out = [], vm = null) {
  if (depth > MAX_DEPTH) { unresolved(out, 'příliš hluboké vnoření'); return out; } // A-026: dřív tiché „nic" = fail-open
  const varMap = vm || buildVarMap(cmd);
  const heredocs = extractHeredocs(cmd); // N08: tělo heredocu se dřív zahazovalo — teď se (pro stdin shell) rekurzivně parsuje jako příkazy
  const { segs: segs0, piped } = segments(heredocs.stripped);
  const segs = segs0.map(splitHereStrings);
  let hIdx = 0;
  const segHeredoc = segs.map(toks => toks.some(t => /^<<-?[A-Za-z_]/.test(t)) ? heredocs.bodies[hIdx++] : undefined);
  const ctx = heredocFiles(segs, segHeredoc);
  for (let si = 0; si < segs.length; si++) {
    const toks = segs[si];
    let i = 0, viaXargs = false;
    for (;;) { const w = baseW(toks[i]);
      if (/^\w+=/.test(toks[i] || '')) { i++; continue; }
      if (KEYWORDS.has(w)) { i++; continue; } // A-005 kolo 3: then/do/else/elif/{/}/! nejsou příkaz — přeskočit a dál rozbalovat obaly/hledat "git"
      if (w === 'xargs') { viaXargs = true; i++; while (toks[i] && /^-/.test(toks[i])) { i += XARGS_VAL.test(toks[i]) ? 2 : 1; } continue; } // A-026 H10: -I {} apod. mají hodnotu
      if (WRAP.has(w)) { i++; if (w === 'start' && toks[i] !== undefined && (toks[i] === '' || /\s/.test(toks[i]))) i++; while (toks[i] && (/^-/.test(toks[i]) || (w === 'start' && /^\//.test(toks[i])))) i++; continue; }
      if (['npm', 'pnpm', 'yarn'].includes(w) && /^(exec|dlx|x)$/.test(toks[i + 1] || '')) { i += 2; while (toks[i] && /^-/.test(toks[i])) i++; continue; }
      break; }
    // A-026 (H07): příkazové slovo z proměnné (`x="git push origin main"; $x`) — dosadit a rozebrat znovu
    if (/^\$\{?\w+\}?$|^\$env:\w+$/i.test(toks[i] || '')) {
      const rest = toks.slice(i);
      const sub = subVars(rest.map(t => (/\s/.test(t) && t !== rest[0] ? `"${t}"` : t)).join(' '), varMap);
      if (!/^\$/.test(sub)) { commands(sub, depth + 1, out, varMap); continue; }
      if (rest.slice(1).some(t => /^(push|send-pack)$/i.test(t))) { out.push({ w: 'git', a: rest.slice(1), lower: rest.slice(1).map(x => x.toLowerCase()), all: rest, inline: null }); continue; }
    }
    const w = baseW(toks[i]); if (!w) continue; const a = toks.slice(i + 1); const lower = a.map(x => x.toLowerCase());
    // A-026 (H10): xargs dosazuje argumenty ze stdin — shell/git/interpret za ním nejde staticky ověřit
    if (viaXargs && XARGS_RISKY.has(w)) { unresolved(out, `xargs ${w}`); continue; }
    // A-026 (H04): here-string (`bash <<< "git push …"`) = příkazy pro shell ze stdin
    const hs = a.indexOf('<<<');
    if (STDIN_SHELLS.has(w) && hs >= 0) { const body = subVars(a[hs + 1] || '', varMap); if (/\$/.test(body)) unresolved(out, `${w} <<< ${body}`); else commands(body, depth + 1, out, varMap); continue; }
    if (STDIN_SHELLS.has(w)) {
      // A-005 kolo 3: "bash -lc", "sh -lc" apod. — krátké sloučené volby POSIX shellů končící na "c" (ne jen samotné -c)
      const isShellC = x => /^(-c|\/c|\/k|-command|-encodedcommand)$/i.test(x) || (['bash', 'sh', 'zsh', 'dash'].includes(w) && /^-[a-z]{1,3}c$/i.test(x));
      const k = lower.findIndex(isShellC);
      const lone = k >= 0 && a[k + 1] === '-'; // `-Command -` / `-c -` = čti PŘÍKAZY ze stdin, ne inline text
      if (k >= 0 && !lone) { commands(a.slice(k + 1).join(' '), depth + 1, out, varMap); continue; }
      // N08: bez -c/-Command (nebo jen "-c -"/"-Command -") — stdin shell: najdi zdroj (vlastní heredoc → sousední
      // heredoc přes SKUTEČNOU rouru → jinak neznámá roura/`< soubor` = fail-closed).
      const stdinArgs = k >= 0 ? a.slice(k + 1) : a;
      const { positional, explicitStdin, redirectIn } = analyzeShellArgs(stdinArgs);
      if (lone || explicitStdin || positional.length === 0) {
        let feed = null;
        if (segHeredoc[si] !== undefined) feed = segHeredoc[si];
        else if (redirectIn) feed = STDIN_UNKNOWN;
        else if (piped[si]) feed = segHeredoc[si - 1] !== undefined ? segHeredoc[si - 1] : STDIN_UNKNOWN;
        if (feed === STDIN_UNKNOWN) { unresolved(out, `${w}${redirectIn ? ' < ' + redirectIn : ' (roura)'}`); continue; }
        if (typeof feed === 'string') { commands(feed, depth + 1, out, varMap); continue; }
        // feed === null → v tomto konstruktu není heredoc/roura/`<` vůbec (samotné „bash" bez kontextu) — beze změny
      } else if (!['cmd', 'powershell', 'pwsh'].includes(w)) {
        // A-026 (H11): `sh p.sh` — obsah skriptu se rozebere stejně jako inline příkazy
        const src = scriptSource(subVars(positional[0], varMap), ctx);
        if (src === STDIN_UNKNOWN) { unresolved(out, `${w} ${positional[0]} (skript vzniká v tomtéž příkazu)`); continue; }
        if (typeof src === 'string') commands(src, depth + 1, out);
      }
    }
    if (w === 'source' || w === '.') {
      const src = a[0] ? scriptSource(subVars(a[0], varMap), ctx) : null;
      if (src === STDIN_UNKNOWN) { unresolved(out, `${w} ${a[0]} (skript vzniká v tomtéž příkazu)`); continue; }
      if (typeof src === 'string') commands(src, depth + 1, out);
    }
    if (w === 'eval' || w === 'iex' || w === 'invoke-expression') { commands(subVars(a.join(' '), varMap), depth + 1, out, varMap); continue; } // eval "git push …" — obsah se rekurzivně tokenizuje jako u shell -c (kolo 2)
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
// A-005 kolo 3: "$(which git) push origin main" — $(...) je v segments() dělicí metaznak, takže "git" a "push" skončí
// v RŮZNÝCH segmentech a hlavní smyčka (c.w !== 'git' → continue) to nevidí. Fallback skenuje SYROVÝ text (jen když
// obsahuje $(...) nebo zpětné apostrofy — běžný text zprávy commitu bez nich projde beze změny).
const GIT_MUT_WORDS = new Set(['push', 'commit', 'merge', 'rebase', 'reset', 'tag', 'clean', 'am', 'cherry-pick', 'revert']);
// A-023 AK4 fix (d): bare "git" ve vlastním tokenu je NORMÁLNÍ segment, který už vidí hlavní smyčka (c.w === 'git') — bral ho sem
// jen zbytečně navíc (a K38 "git commit -m "$(date) push fix"" bez uvozovkově-citlivého dělení tokenů rozsekal citovanou zprávu
// na "push" jako SAMOSTATNÝ token → falešný nález). looksLikeGitToken proto řeší jen obal přes $(...)/zpětné apostrofy.
function looksLikeGitToken(tok) { return /\$\([^)]*\bgit\b[^)]*\)/i.test(tok) || /`[^`]*\bgit\b[^`]*`/i.test(tok); }
// citově-vědomé dělení na tokeny: celý "…" nebo '…' řetězec (i s mezerami uvnitř) zůstává JEDEN token — jinak citovaný text
// zprávy commitu ("$(date) push fix") rozseká mezera před "push" na samostatný token a fallback ho vyhodnotí jako push (K38).
function quoteAwareWords(s) {
  const out = []; let tok = '', q = null, had = false;
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { tok += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; tok += c; had = true; continue; }
    if (/\s/.test(c)) { if (had) out.push(tok); tok = ''; had = false; continue; }
    tok += c; had = true;
  }
  if (had) out.push(tok);
  return out;
}
// GIT_MUT_RE: "git" a mutační slovo (push/commit/…) v LIBOVOLNÉM pořadí ve STEJNÉM $(...) nebo `...` úseku — nezávisle na
// citování (doplněk k tokenovému lookaheadu níž, který citovaný úsek vidí jako jeden token a lookahead ho tak nenajde).
const GIT_MUT_ALT = [...GIT_MUT_WORDS].join('|');
const GIT_MUT_SPAN_RE = new RegExp(`\\bgit(\\.exe)?\\b[\\s\\S]*?\\b(${GIT_MUT_ALT})\\b|\\b(${GIT_MUT_ALT})\\b[\\s\\S]*?\\bgit(\\.exe)?\\b`, 'i');
function fallbackPushScan(rawCmd) {
  if (!/\$\(|`/.test(rawCmd)) return false;
  const spans = rawCmd.match(/\$\([^)]*\)|`[^`]*`/g) || [];
  if (spans.some(sp => GIT_MUT_SPAN_RE.test(sp))) return true;
  // obal typu "$(which git) push origin main" — "git" a mutační slovo v RŮZNÝCH (necitovaných) tokenech
  const toks = quoteAwareWords(rawCmd);
  for (let i = 0; i < toks.length; i++) {
    if (looksLikeGitToken(toks[i]) || /\$\(/.test(toks[i]) || /`/.test(toks[i])) {
      for (let j = i + 1; j < toks.length && j < i + 6; j++) {
        const w = toks[j].replace(/^-+/, '').toLowerCase();
        if (GIT_MUT_WORDS.has(w)) return true;
      }
    }
  }
  return false;
}
// A-029: FAIL-CLOSED ALLOWLIST zápisu Kapitána do workspace auditora (ne výčet zakázaných souborů — ten 3× selhal: A-004/A-005/A-022).
// Kapitán smí ve ws zapsat JEN do AUDIT/03_dukazy/** a volat bus (post|ack|inbox|wait|nove-id|thread). Když se příkaz ws dotýká
// (cesta ws, jméno složky ws jako cesta, $AUDITOR_WORKSPACE, cwd/cd ve ws), musí KAŽDÝ jeho segment být známé čtení nebo zápis
// s rozpoznaným cílem mimo ws / do 03_dukazy — cokoli jiného (neznámý program, inline skript, xargs, find -delete…) = blok.
// prisnost.mjs nastav je blokované VŽDY (úroveň mění jen vlastník přes START/instalátor, ty běží mimo Claude Code).
// Sdílí to Claude Code i Codex (codex-hook.mjs posílá Bash/shell/apply_patch do TÉTO pojistky).
const READ_CMDS = new Set(['cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ls', 'dir', 'wc', 'stat', 'file', 'diff', 'cmp', 'echo', 'printf', 'test', '[', 'pwd', 'cd', 'pushd', 'popd', 'chdir', 'set-location', 'sl',
  'true', 'false', 'sleep', 'date', 'basename', 'dirname', 'realpath', 'readlink', 'tr', 'sort', 'uniq', 'cut', 'jq', 'od', 'xxd', 'md5sum', 'sha1sum', 'sha256sum', 'type', 'which', 'tree', 'column', 'nl', 'iconv',
  'get-content', 'gc', 'select-string', 'sls', 'get-childitem', 'gci', 'test-path', 'get-item', 'gi', 'resolve-path', 'write-output', 'write-host', 'select-object', 'measure-object', 'format-list', 'format-table', 'out-string', 'convertfrom-json', 'findstr', 'find']);
const GIT_READ = /^(status|log|diff|show|rev-parse|ls-files|blame|branch|describe|shortlog|cat-file|ls-tree|grep|remote)$/;
const WS_SCRIPTS = { 'tools/bus.mjs': /^(post|ack|inbox|wait|nove-id|thread)$/, 'tools/prisnost.mjs': /^(stav|kontext)$/, 'tools/gate-check.mjs': null, 'kapitan-side/gate-check.mjs': null };
const REPO_SCRIPTS = { '.claude/hooks/auditor-bus.mjs': /^(post|ack|inbox|wait|nove-id|thread)$/, '.claude/hooks/gate-check.mjs': null };
const MOVERS = new Set(['mv', 'move', 'move-item', 'mi', 'ln', 'mklink', 'rename-item', 'ren', 'rsync', 'new-item', 'ni']); // i ZDROJ je zápis (mv odstraní, ln/new-item odkáže do ws)
function wsViolations(cmd0, cwd0) {
  if (!ws) return [];
  // proměnná s cestou ws ($AUDITOR_WORKSPACE, ${…}, %…%, $env:…) se dosadí — cíl zápisu pak jde vyhodnotit jako cesta
  const cmd = String(cmd0).replace(/\$\{AUDITOR_WORKSPACE\}|\$env:AUDITOR_WORKSPACE\b|\$AUDITOR_WORKSPACE\b|%AUDITOR_WORKSPACE%/gi, () => process.env.AUDITOR_WORKSPACE);
  // kolo 2: ws i cíle se porovnávají doslovně I kanonicky (8.3, /private/var, symlink/junction) — dotyk ws = kterákoli varianta
  const wsVars = [...new Set([ws, canonN(ws)])], repoVars = [...new Set([repo, canonN(repo)])];
  const inWs = p => relsOf(p, wsVars).length > 0;
  const okDest = p => relsOf(p, wsVars).every(r => r.startsWith('/audit/03_dukazy/'));
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const baseRe = new RegExp('(^|/)(' + wsVars.map(v => esc(v.split('/').pop())).join('|') + ')(/|$)');
  const low = norm(cmd), cmds = commands(cmd);
  const pathTok = t => /[\\/]/.test(t) && t.length < 1024 && !/[$%`]/.test(t);
  const tokPath = t => { t = t.replace(/^(\d|&)?>>?/, ''); return norm(collapse(/^([\\/]|[A-Za-z]:)/.test(t) ? norm(t) : cwd0 + '/' + t)); };
  const wt = writeTargets(cmd, cwd0);
  const touches = inWs(cwd0) || wsVars.some(v => low.includes(v)) || /(\$\{?|%|\$env:)auditor_workspace/i.test(cmd)
    || wt.some(t => t.path && inWs(t.path))
    || cmds.some(c => c.all.some(t => baseRe.test(norm(t)) || pathTok(t) && inWs(tokPath(t))) || c.w === '__stdin_unresolved__');
  const bad = [];
  // prisnost.mjs nastav = VŽDY blok (i balíková kopie mimo ws s --ws relativně)
  for (const c of cmds) if (c.all.some(t => /(^|[\\/])prisnost\.mjs$/i.test(t)) && c.lower.includes('nastav')) bad.push(`prisnost.mjs nastav — úroveň přísnosti mění jen vlastník (START → volba / instalátor)`);
  if (!touches) return bad;
  for (const t of wt) { if (t.inline) bad.push(`inline skript (${t.cmd} -e/-c) u příkazu, který míří do workspace auditora`); else if (!okDest(t.path)) bad.push(`zápis do ${relsOf(t.path, wsVars)[0] || '/'} („${t.tok}")`); else if (/[$%`]|(?:^|[\s=:>|&;(])~/.test(t.tok || '')) bad.push(`cíl zápisu s nerozvinutou proměnnou („${t.tok}")`); }
  let cur = cwd0;
  const abs = p => { p = String(p).replace(/\\/g, '/'); const n = norm(p); return /^\//.test(n) ? norm(collapse(n)) : norm(collapse(cur + '/' + p)); };
  const isWriter = w => W_LAST.has(w) || W_ALL.has(w) || w in W_PS || MOVERS.has(w) || w === 'chmod' || w === 'chown';
  for (const c of cmds) {
    const w = c.w; const pos = c.a.filter(x => !/^-/.test(x) && !/^(\d|&)?>>?/.test(x) && !/^​/.test(x));
    if (['cd', 'pushd', 'set-location', 'sl', 'chdir'].includes(w)) { const t = c.a.find(x => !/^[-/]/.test(x) || /^\//.test(x) && x.length > 2); if (t) cur = abs(t); continue; }
    if (w === '__stdin_unresolved__') { bad.push('stdin shellu nelze ověřit'); continue; }
    if (c.inline) { bad.push(`inline skript ${w} -e/-c`); continue; }
    if (w === 'find') { if (c.lower.some(x => /^-(exec|execdir|ok|okdir|delete|fprint\w*|fls)$/.test(x))) bad.push('find -exec/-delete'); continue; }
    if (READ_CMDS.has(w)) continue;
    if (w === 'sed' && !c.lower.some(x => /^-i/.test(x) || x === '--in-place') && !c.lower.some(x => /(^|;|\s)w\s|\/w\s/.test(x))) continue;
    if (w === 'git') { const sub = c.a.find((x, i) => !/^-/.test(x) && !(i > 0 && /^-(C|c)$/.test(c.a[i - 1]))); if (sub && GIT_READ.test(sub.toLowerCase()) && !(sub.toLowerCase() === 'branch' && c.lower.some(x => /^-(d|D|m|M|c|C|f)$|^--(delete|move|copy|force|set-upstream-to)/.test(x)))) continue; bad.push(`git ${sub || ''} (zápis do gitu workspace)`); continue; }
    if (w === 'xargs') { bad.push('xargs'); continue; }
    if (['node', 'bun', 'deno'].includes(w)) {
      const si = c.a.findIndex(x => !/^-/.test(x)); const script = si >= 0 ? abs(c.a[si]) : '';
      const sub = (c.a.slice(si + 1).find((x, k, arr) => !/^-/.test(x) && (arr[k - 1] || '').toLowerCase() !== '--ws') || '').toLowerCase();
      const hit = (roots, table) => { const rs = script ? relsOf(script, roots) : []; return Object.entries(table).find(([rel]) => rs.length && rs.every(r => r === '/' + rel)); };
      const e = hit(wsVars, WS_SCRIPTS) || hit(repoVars, REPO_SCRIPTS);
      if (e && (!e[1] || e[1].test(sub))) { if (/bus\.mjs$/.test(e[0]) && sub === 'ack' && /\/tools\/bus\.mjs$/.test(script) && !/--by\s+kapitan\b/i.test(c.all.join(' '))) bad.push('bus ack jen --by kapitan'); continue; }
      bad.push(`${w} ${pos[0] || ''}${sub ? ' ' + sub : ''} (skript, který není na seznamu povolených pro workspace auditora)`); continue;
    }
    if (isWriter(w)) {
      if (MOVERS.has(w)) pos.map(abs).filter(p => !okDest(p)).forEach(p => bad.push(`${w} ${p}`));
      if (!pos.length) bad.push(`${w} bez rozpoznaného cíle`);
      continue; // cíle z writeTargets() už prověřené výš
    }
    bad.push(`${w} (program, u kterého nejde ověřit, že do workspace auditora nezapisuje)`);
  }
  return bad;
}
// --- A-026: aliasy gitu (N15) a ochrana kotvy důvěry + vnitřku .git (obchvaty: proměnná, glob, $(…)/backtick, node -e/python -c,
// uložený skript, ln -s, git config --file, core.hooksPath). Co staticky nejde (obfuskace přes kódy znaků, base64) = zbytkové riziko.
const GIT_BUILTINS = new Set(['add', 'am', 'apply', 'archive', 'bisect', 'blame', 'branch', 'bundle', 'cat-file', 'checkout', 'cherry-pick', 'clean', 'clone', 'commit',
  'commit-tree', 'config', 'describe', 'diff', 'fetch', 'for-each-ref', 'format-patch', 'fsck', 'gc', 'grep', 'hash-object', 'help', 'init', 'log', 'ls-files',
  'ls-remote', 'ls-tree', 'merge', 'merge-base', 'mktree', 'mv', 'name-rev', 'notes', 'pull', 'push', 'read-tree', 'rebase', 'reflog', 'remote', 'reset', 'restore',
  'rev-list', 'rev-parse', 'revert', 'rm', 'send-pack', 'shortlog', 'show', 'show-ref', 'stash', 'status', 'submodule', 'switch', 'symbolic-ref', 'tag',
  'update-index', 'update-ref', 'version', 'worktree', 'write-tree', 'sparse-checkout', 'maintenance', 'lfs']);
function staticAliases(cmd) { // `git config [--global|--local] alias.X Y` v tomtéž příkazu (runtime dotaz by ho ještě neviděl)
  const m = {};
  for (const c of commands(cmd)) { if (c.w !== 'git') continue; const k = c.lower.indexOf('config'); if (k < 0) continue; const r = c.a.slice(k + 1).filter(x => !/^-/.test(x)); if (/^alias\./i.test(r[0] || '') && r[1] !== undefined) m[r[0].slice(6).toLowerCase()] = r.slice(1).join(' '); }
  return m;
}
function aliasOf(sub, cfg, cmdAliases, dir) {
  for (const e of cfg) { const mm = /^alias\.([^=]+)=([\s\S]*)$/i.exec(e); if (mm && mm[1].toLowerCase() === sub) return mm[2]; }
  if (Object.prototype.hasOwnProperty.call(cmdAliases, sub)) return cmdAliases[sub];
  try { return execFileSync('git', ['config', '--get', `alias.${sub}`], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { return null; }
}
const GIT_READ_ONLY = /^(status|log|diff|show|rev-parse|ls-files|blame|describe|shortlog|cat-file|ls-tree|grep|remote|fetch|help|version|show-ref|for-each-ref|rev-list|merge-base|name-rev|ls-remote)$/;
const gitSubOf = c => { let i = 0; while (i < c.a.length && /^-/.test(c.a[i])) i += /^-(C|c)$|^--(git-dir|work-tree|exec-path|config-env)$/.test(c.a[i]) ? 2 : 1; return (c.a[i] || '').toLowerCase(); };
const kotvaMjsSub = c => { const k = c.a.findIndex(x => /(^|[\\/])kotva\.mjs$/i.test(x)); return k < 0 ? null : (c.a.slice(k + 1).find(x => !/^-/.test(x)) || 'stav').toLowerCase(); };
function isReadOnly(c) {
  if (c.w === 'find') return !c.lower.some(x => /^-(exec|execdir|ok|okdir|delete|fprint\w*|fls)$/.test(x));
  if (READ_CMDS.has(c.w)) return true;
  if (c.w === 'git') { const s = gitSubOf(c); return GIT_READ_ONLY.test(s) || (s === 'config' && c.lower.some(x => /^--(get|get-all|get-regexp|list|show-origin)$|^-l$/.test(x))); }
  if (['node', 'bun', 'deno'].includes(c.w) && kotvaMjsSub(c) === 'stav') return true;
  return false;
}
const HOOKS_CFG = /(^|[\s=])(core\.hookspath|include\.path|includeif\.)/i;
const INLINE_GIT = /\.git(?![\w])|git-dir|git_dir|common-dir|hookspath/i;
const SCRIPT_RUNNERS = new Set(['node', 'bun', 'deno', 'python', 'python3', 'py', 'ruby', 'perl']);
const AGENT_ENV_TAMPER = /(-u\s*|--unset[= ]\s*|unset\s+|remove-item\s+env:|\$env:|delete\s+process\.env\.?|\[['"]?)(claudecode|claude_code_entrypoint|auditor_bez_tty)\b|\b(claudecode|claude_code_entrypoint|auditor_bez_tty)\s*=/i;
function anchorViolations(cmd, wt, varMap) {
  const cmds = commands(cmd); const subst = subVars(cmd, varMap);
  if (AGENT_ENV_TAMPER.test(cmd)) return 'změna proměnných, podle kterých nástroje poznají agenta (CLAUDECODE / CLAUDE_CODE_ENTRYPOINT / AUDITOR_BEZ_TTY)';
  for (const c of cmds) { const s = kotvaMjsSub(c); if (s !== null && s !== 'stav') return `kotva.mjs ${s}`; }
  const anyWriter = wt.length > 0 || cmds.some(c => !isReadOnly(c));
  if ((ANCHOR_RE.test(flat(cmd)) || ANCHOR_RE.test(flat(subst))) && anyWriter) return 'příkaz zmiňuje kotvu důvěry a něco zapisuje nebo spouští';
  if (/\$\(|`/.test(cmd) && /rev-parse[\s\S]*--(git-common-dir|git-dir|absolute-git-dir|git-path)/i.test(cmd) && anyWriter) return 'cesta do .git z $(git rev-parse …) u zapisujícího příkazu';
  const fromSubst = new Set([...cmd.matchAll(/([A-Za-z_]\w*)=(\$\(|`)/g)].map(m => m[1].toLowerCase()));
  const lockOnly = c => ['rm', 'del', 'unlink'].includes(c.w);
  if (wt.length > 0 && (LAUNCHER_RE.test(flat(cmd)) || LAUNCHER_RE.test(flat(subst)))) return 'příkaz zapisuje a zmiňuje spouštěč Kapitána (start-*.cmd/.sh) — mění ho jen vlastník přes START (A-031)';
  for (const t of wt) {
    if (t.inline) { if (LAUNCHER_RE.test(flat(t.text))) return `inline skript (${t.cmd}) zapisuje spouštěč Kapitána (A-031)`; if (ANCHOR_RE.test(flat(t.text)) || INLINE_GIT.test(t.text) || INLINE_GIT.test(flat(t.text))) return `inline skript (${t.cmd}) zapisuje do .git nebo kotvy`; continue; }
    if (!t.path) continue;
    const p = t.path, pc = canonN(p);
    if (LAUNCHER_RE.test(p.split('/').pop()) || LAUNCHER_RE.test(pc.split('/').pop())) return `zápis spouštěče Kapitána („${t.tok}") — mění ho jen vlastník přes START (A-031)`;
    if (ANCHOR_RE.test(p.split('/').pop()) || ANCHOR_RE.test(pc.split('/').pop())) return `zápis kotvy („${t.tok}")`;
    if ((IN_GIT_DIR.test(p) || IN_GIT_DIR.test(pc)) && !(/\.lock$/.test(p) && ['rm', 'del', 'unlink'].includes(t.cmd))) return `zápis dovnitř .git („${t.tok}")`;
    if (globHitsProtected(p)) return `cíl zápisu s globem může mířit na chráněnou cestu („${t.tok}")`;
    if (/[$%`]/.test(p) && /\.claude|\.git|\.codex|settings|hooks|kotv/i.test(p)) return `cíl zápisu s nerozvinutou proměnnou („${t.tok}")`;
    const refs = [...p.matchAll(/\$\{?(\w+)\}?/g)].map(m => m[1].toLowerCase());
    if (refs.some(r => fromSubst.has(r))) return `cíl zápisu z výstupu příkazu $(…) („${t.tok}")`;
  }
  for (const c of cmds) {
    if (c.w === '__stdin_unresolved__' || isReadOnly(c)) continue;
    const toks = c.a.map(x => subVars(x, varMap).replace(/\\/g, '/'));
    if (c.w === 'git') {
      if (toks.some(x => HOOKS_CFG.test(x))) return 'git a core.hooksPath / include.path (vypnutí nebo přesměrování hooků)';
      const f = c.lower.findIndex(x => x === '--file' || x === '-f' || /^--file=/.test(x));
      if (gitSubOf(c) === 'config' && f >= 0) { const tgt = c.lower[f].includes('=') ? toks[f].slice(7) : toks[f + 1] || ''; if (IN_GIT_DIR.test(tgt) || IN_GIT_DIR.test(canonN(norm(path.resolve(HOOK_CWD, tgt)))) || ANCHOR_RE.test(flat(tgt)) || /[$`*?]/.test(tgt)) return `git config --file ${tgt}`; }
      continue;
    }
    if (MOVERS.has(c.w) && toks.some(x => IN_GIT_DIR.test(x) || /(^|\/)\.git$/i.test(x))) return `${c.w} s .git (odkaz nebo přesun do/z .git)`;
    const intoGit = toks.find(x => /(^|\/)\.git\/[^\s]/i.test(x));
    if (intoGit && !(lockOnly(c) && /\.lock$/i.test(intoGit))) return `${c.w} ${intoGit} (program pracuje s vnitřkem .git)`;
    if (SCRIPT_RUNNERS.has(c.w) && !c.inline) {
      const si = c.a.findIndex(x => !/^-/.test(x)); if (si < 0) continue;
      const sp = scriptKey(subVars(c.a[si], varMap));
      const trusted = [ws, canonN(ws), repo && repo + '/.claude/hooks'].filter(Boolean).some(r => sp === r || sp.startsWith(r + '/'));
      if (trusted) continue;
      const body = readScript(subVars(c.a[si], varMap));
      if (body && ((ANCHOR_RE.test(flat(body)) && INLINE_WRITE.test(body)) || /core\.hookspath/i.test(body))) return `uložený skript ${c.a[si]} zapisuje kotvu nebo mění hooky gitu`;
    }
  }
  return '';
}
let raw = ''; process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch { process.stderr.write('KAPITAN-GUARD Blocked: vstup hooku není JSON (fail-closed).\n'); process.exit(2); }
  const tool = input.tool_name || '', ti = input.tool_input || {};
  const cwdRaw = input.cwd || process.cwd(); HOOK_CWD = cwdRaw;
  if (!ws || /\[DOPLŇ|\[DOPLN/.test(ws) || !repo) block('AUDITOR_WORKSPACE / AUDITOR_TARGET_REPO nejsou nastaveny (fail-closed) — spusť setup-auditor, nebo hook odstraň ze settings.');
  if (!R) block('hygiene-rules.json nenalezen (fail-closed) — spusť setup-auditor (kopíruje pravidla do .claude/hooks/).');
  // A-031: bypassPermissions (Claude Code payload má permission_mode) nad schválenou samostatností Kapitána z integrity → blok. Pole chybí nebo jiná
  // hodnota (default, acceptEdits, plan, auto) = neblokuje. Úroveň čte prisnost.mjs kapitan-uroven (schválená vlastníkem v gitu ws; chyba = 1).
  if (input.permission_mode === 'bypassPermissions') {
    let lv = 1; try { lv = parseInt(String(execFileSync(process.execPath, [path.join(process.env.AUDITOR_WORKSPACE || '', 'tools', 'prisnost.mjs'), '--ws', process.env.AUDITOR_WORKSPACE || '', 'kapitan-uroven'], { encoding: 'utf8', timeout: 8000, windowsHide: true })).trim(), 10) || 1; } catch { lv = 1; }
    if (lv < 3) block(`BYPASS OPRÁVNĚNÍ: okno běží v režimu bypassPermissions, ale schválená samostatnost Kapitána je ${lv} (platí jen 3 PLNÝ). Ukonči bypass (Shift+Tab nebo restart bez --dangerously-skip-permissions; případně smaž defaultMode v ~/.claude/settings.json) — samostatnost zvýší jen vlastník: START → [7] (A-031).`);
  }
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
    // A-029: doslovně i kanonicky (8.3, /private/var, symlink/junction na ws) — každá poloha ve ws musí být v AUDIT/03_dukazy/
    for (const r of relsOf(fp, [...new Set([ws, canonN(ws)])])) {
      if (r.startsWith('/audit/03_dukazy/')) continue;   // zprávy na most jen přes bus.mjs (ne přímým zápisem souboru)
      if (r.startsWith('/audit/')) block(`Kapitán smí v AUDIT/ zapisovat jen do 03_dukazy/; zprávy auditorovi jen přes bus.mjs / auditor-bus.mjs (${fp}). Nálezy, verdikty, handoff a gate patří auditorovi.`);
      block(`Workspace auditora je pro Kapitána read-only mimo AUDIT/03_dukazy (${fp}).`);
    }
    // A-026: kotva důvěry a vnitřek jakéhokoli .git (config, hooks, kotva) — doslovně i kanonicky (symlink/junction do .git)
    const fpc = canonN(fp);
    if (LAUNCHER_RE.test(fp.split('/').pop()) || LAUNCHER_RE.test(fpc.split('/').pop())) block(`SPOUŠTĚČ: ${fp} — spouštěč Kapitána mění jen vlastník přes START (A-031).`);
    if (ANCHOR_RE.test(fp.split('/').pop()) || ANCHOR_RE.test(fpc.split('/').pop())) block(`KOTVA DŮVĚRY: ${fp} — kotvu mění jen vlastník (START → [9]), ne agent (A-026).`);
    if (IN_GIT_DIR.test(fp) || IN_GIT_DIR.test(fpc)) block(`SELF-PROTECT: ${fp} — vnitřek .git (config, hooks, kotva důvěry) agent nemění (A-026).`);
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
    if (fallbackPushScan(cmd)) block('Podezřelý příkaz zmiňuje git (přes $(...) nebo zpětné apostrofy) a mutační slovo (push/commit/…) skrz nerozpoznaný obal — fail-closed (A-005 kolo 3).');
    // N08 (A-023 kolo 3): stdin shellu (`… | sh`, `sh < soubor`) se nedá staticky ověřit zdroj příkazů (roura odjinud
    // než z heredoc, nebo `< soubor`) — fail-closed, ať se nedá obejít push/deploy skrytý za neznámý stdin.
    if (commands(cmd).some(c => c.w === '__stdin_unresolved__')) block('stdin shellového interpretu se nedá staticky ověřit (roura odjinud než z heredoc, nebo `< soubor`) — fail-closed (A-023 kolo 3, N08).');
    // destruktivní SQL přímo v příkazu (platí i pro úroveň SAMOSTATNÝ/PLNÝ): smazání tabulek/databáze, vyprázdnění, DELETE/UPDATE bez WHERE
    if (/\bdrop\s+(table|database|schema)\b|\btruncate\s+(table\s+)?["\w]|\bdelete\s+from\s+[\w."]+\s*(;|"|'|$)(?![^;]*\bwhere\b)|\bupdate\s+[\w."]+\s+set\b(?![^;]*\bwhere\b)|\bsupabase\s+db\s+reset\b/i.test(cmd)) block('DESTRUKTIVNÍ SQL (DROP/TRUNCATE/DELETE či UPDATE bez WHERE/db reset) — takový zásah dělá jen vlastník ručně, se zálohou.');
    // SELF-PROTECT i přes shell: zápis/mazání/přesun souborů hooků, settings, CI brány (rozhoduje cíl zápisu; git rm/mv/checkout a prettier --write taky)
    // A-026 (H16): cíl zápisu se vyhodnocuje i po dosazení proměnných z příkazu (`d=.cla; cp x ${d}ude/settings.json`)
    const varMap = buildVarMap(cmd);
    const wt = [...writeTargets(cmd, norm(cwdRaw)), ...writeTargets(subVars(cmd, varMap), norm(cwdRaw))];
    for (const c of commands(cmd)) { const pos = c.a.filter(x => !/^-/.test(x)); if (c.w === 'git' && /^(rm|mv|checkout|restore)$/.test(c.lower[0] || '')) pos.slice(1).forEach(x => wt.push({ path: norm(collapse(path.resolve(cwdRaw, x))), tok: 'git ' + c.lower[0] + ' ' + x })); if (c.w === 'prettier' && c.lower.includes('--write')) pos.forEach(x => wt.push({ path: norm(collapse(path.resolve(cwdRaw, x))), tok: 'prettier --write ' + x })); }
    const SELF = /\/\.claude\/(hooks(\/|$)|settings(\.local)?\.json$)|\/\.codex\/(hooks|config)|\/\.github\/workflows\/auditor-gate|\/\.git\/hooks(\/|$)/i;
    for (const t of wt) if ((t.inline && /(\.claude\/(hooks|settings)|\.codex\/(hooks|config)|\.github\/workflows\/auditor-gate|\.git\/hooks)/i.test(t.text.replace(/\\/g, '/'))) || (t.path && (SELF.test(t.path) || SELF.test(canonN(t.path))))) block(`SELF-PROTECT: zápis do .claude/hooks, settings nebo CI brány přes shell je zakázán („${t.tok || t.cmd}").`);
    const anchorBad = anchorViolations(cmd, wt, varMap);
    if (anchorBad) block(`KOTVA DŮVĚRY / .git: ${anchorBad} — kotvu důvěry, hooky a config gitu mění jen vlastník (START → [9]); agent je nesmí přepsat ani obejít (A-026).`);
    if (/(^|[^\w-])bus\.mjs\s+post\b/.test(cmd) &&!/--from\s+kapitan\b/.test(cmd)) block('bus post: Kapitán smí posílat jen --from kapitan.');
    // AUDIT/ auditora: Kapitán shellem zapisuje jen do 03_dukazy a svých zpráv na busu (bus.mjs zapisuje sám, ne shellem)
    // A-029: workspace auditora = fail-closed allowlist (jen AUDIT/03_dukazy/** a bus.mjs), viz wsViolations()
    const wsBad = wsViolations(cmd, norm(cwdRaw));
    if (wsBad.length) block(`Workspace auditora je pro Kapitána jen ke čtení — zapisovat smíš jen do AUDIT/03_dukazy/ a zprávy posílat přes bus.mjs/auditor-bus.mjs (A-029). Zamítnuto: ${wsBad.slice(0, 3).join('; ')}.`);
    // git push do produkční větve = deploy (Vercel/GitHub integrace nasazuje automaticky) → gate-check
    // Detekce běží nad TOKENIZOVANÝMI příkazy (commands()), ne nad syrovým textem — "git push" v --text/-m "…" není push (A-005);
    // přesměrování (2>&1, >, | tail) se nepočítá do refspeců; git-bash cesta (/c/Users/…) se před resolve převede na C:\Users\… (win32).
    const gitBashToWin = p => { if (process.platform !== 'win32' || !p) return p; const m = /^\/([A-Za-z])(\/.*)?$/.exec(p); return m ? `${m[1].toUpperCase()}:${(m[2] || '\\').replace(/\//g, '\\')}` : p; };
    const resolveDir = (base, t) => { const c = gitBashToWin(t); return path.isAbsolute(c) ? c : path.resolve(base, c); };
    // A-023 AK4 fix (b): "W=<cesta>; git -C $W push origin HEAD" (KH13) — $W se dřív předalo resolveDir doslovně jako text '$W',
    // takže se pracovalo s neexistujícím adresářem, branch vyšla 'UNKNOWN' a to se falešně vyhodnotilo jako produkční větev.
    // buildVarMap přečte prostá přiřazení "VAR=hodnota" jako samostatný segment (typicky oddělený ';'/'&&' od zbytku příkazu).
    const cmdAliases = staticAliases(cmd); // A-026 N15: alias.X nastavený v tomtéž příkazu
    let cur = cwdRaw, pushProd = false, pushDir = null, depMatch = null, depMatchDir = cwdRaw;
    for (const c of commands(cmd)) {
      if (['cd', 'pushd', 'set-location', 'sl', 'chdir'].includes(c.w)) { const t = c.a.find(x => !/^[-/]/.test(x) || /^\//.test(x) && x.length > 2); if (t) cur = resolveDir(cur, t); continue; }
      if (!depMatch) { const text = c.inline || c.all.join(' '); const dm = DEPLOY.find(d => (c.inline || d.bin.test(c.w)) && d.re.test(text)); if (dm) { depMatch = dm.re.exec(text); depMatchDir = cur; } }
      if (c.w !== 'git') continue; // VŠECHNY git push segmenty v příkazu (ne jen první) — "git push a && git push origin main" musí vyhodnotit i druhý (kolo 2)
      // A-005 kolo 3: globální volby gitu v LIBOVOLNÉM pořadí (dřív jen pevné -C pak -c), vč. --git-dir/--work-tree/--no-pager/-P/--bare/--exec-path
      let i = 0, cDir = null; const cfg = [];
      for (;;) {
        const t = c.a[i];
        if (t === '-C' && c.a[i + 1] !== undefined) { cDir = subVars(c.a[i + 1], varMap); i += 2; continue; }
        if (t === '-c' && c.a[i + 1] !== undefined) { cfg.push(c.a[i + 1]); i += 2; continue; }
        if (/^--config-env(=|$)/.test(t || '')) { cfg.push((t.includes('=') ? t.slice(13) : c.a[++i] || '').replace(/=.*$/, '=!config-env')); i++; continue; }
        if ((t === '--git-dir' || t === '--work-tree') && c.a[i + 1] !== undefined) { i += 2; continue; }
        if (/^--git-dir=/.test(t || '') || /^--work-tree=/.test(t || '')) { i++; continue; }
        if (t === '--no-pager' || t === '-p' || t === '-P' || t === '--bare') { i++; continue; }
        if (t === '--exec-path') { i++; if (c.a[i] !== undefined && !/^-/.test(c.a[i])) i++; continue; }
        if (/^--exec-path=/.test(t || '')) { i++; continue; }
        break;
      }
      const dir0 = cDir ? resolveDir(cwdRaw, cDir) : cur;
      // A-026 (N15): alias gitu (`git -c alias.p=push p …`, `git config alias.p push; git p …` nebo alias z configu) se rozbalí;
      // shellový alias („!…") se nedá ověřit → blok. send-pack je push bez pre-push hooku → stejná brána.
      let sub = (c.a[i] || '').toLowerCase(); let rest = c.a.slice(i + 1);
      for (let hop = 0; hop < 3 && sub && !GIT_BUILTINS.has(sub); hop++) {
        const al = aliasOf(sub, cfg, cmdAliases, dir0); if (al === null) break;
        if (/^!/.test(al)) block(`git alias „${sub}" spouští shell (${al}) — nejde ověřit, fail-closed (A-026 N15).`);
        const parts = al.trim().split(/\s+/); sub = (parts[0] || '').toLowerCase(); rest = [...parts.slice(1), ...rest];
      }
      if (sub !== 'push' && sub !== 'send-pack') continue;
      // přesměrování (2>&1, >, | tail se do samostatného segmentu už nedostane) se nepočítá do refspeců
      const rawArgs = [];
      for (let k = 0; k < rest.length; k++) { const m = /^(\d|&)?>>?(.*)$/.exec(rest[k]); if (m) { if (!m[2]) k++; continue; } rawArgs.push(rest[k]); }
      // force push: --force/-f/--force-with-lease, „+refspec" a sloučené krátké volby (-uf/-fu) — nikdy text zprávy commitu
      const isForce = rawArgs.some(x => x === '--force' || x === '-f' || x === '--force-with-lease' || /^--force-with-lease=/.test(x) ||
        /^\+/.test(x) || (/^-[A-Za-z]{2,}$/.test(x) && /f/.test(x.slice(1))));
      if (isForce) block('force push zakázán i ve workspace.');
      let segProd = sub === 'send-pack' || rawArgs.some(a => /^--(all|mirror|tags|branches)$/.test(a));
      const stripPlus = r => r.replace(/^\+/, '');
      const args = rawArgs.filter(a => !a.startsWith('-')); const refspecs = args.slice(1); const targets = refspecs.map(stripPlus).map(r => r.includes(':') ? r.split(':')[1] : r).map(t => t.replace(/^refs\/heads\//, ''));
      if (targets.some(t => t && t !== 'HEAD' && isProdBranch(t, dir0))) segProd = true;
      const refspec = stripPlus(refspecs[0] || ''); const target = refspecs.length > 1 ? '' : (refspec.includes(':') ? refspec.split(':')[1] : refspec);
      // skutečný adresář příkazu: -C <dir> > sledovaný cwd (cd/pushd/Set-Location před příkazem) > cwd hooku (worktree má vlastní HEAD!)
      const dir = dir0;
      let branch = (target && target !== 'HEAD') ? target : ''; if (!branch) { try { branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim(); } catch { branch = 'UNKNOWN'; } }
      if (branch === 'UNKNOWN' || branch === 'HEAD') segProd = true; // nelze určit → fail-closed (gate-check rozhodne)
      segProd = segProd || isProdBranch(branch.replace(/^refs\/heads\//, ''), dir);
      if (segProd && !pushProd) { pushProd = true; pushDir = dir; } // první PROD segment rozhoduje o gate adresáři; další (i non-prod) segmenty dir nepřepisují
    }
    if (pushProd || depMatch) {
      // gate-check nad ADRESÁŘEM PŘÍKAZU (worktree má vlastní HEAD a vydává svůj obsah): adresář skutečného push/deploy segmentu.
      // Jen když jde o totéž repo (stejné .git) — jinak auditované repo (fail-closed jako dřív).
      const gdir = pushProd ? pushDir : depMatchDir;
      // A-026: kotva je per-repo → gate nad repem PŘÍKAZU; env AUDITOR_TARGET_REPO ani cwd hooku o repu nerozhodují.
      const gateDir = gdir || HOOK_CWD;
      // A-026: workspace a gate-check.mjs JEN z kotvy repa, ve kterém se vydává (ne z HEAD settings ani env). Kotva ověří i otisk
      // gate-check.mjs a že workspace patří tomuto repu. Dítěti se env auditora nepředává (gate-check ho stejně nečte).
      const k = anchorOf(gateDir);
      if (!k.ok) block(`DEPLOY BLOKOVÁN — ${k.msg}`);
      const gc = path.join(k.ws, 'kapitan-side', 'gate-check.mjs');
      const env = { ...process.env }; for (const v of UNTRUSTED_ENV) delete env[v];
      try { execFileSync(process.execPath, [gc, gateDir], { stdio: ['ignore', 'pipe', 'pipe'], env }); }
      catch (e) { const err = String(e.stderr || e.message); const line = (err.match(/GATE-CHECK FAIL:.*/) || [])[0] || `gate-check nelze spustit (${(err.match(/ENOENT[^\n]*|Cannot find module[^\n]*/) || ['chyba'])[0]}) — fail-closed`; block(`DEPLOY BLOKOVÁN — ${line}`); }
    }
    process.exit(0);
  }
  process.exit(0);
});
function block(msg) { process.stderr.write(`KAPITAN-AUDIT-GUARD Blocked: ${msg}\n`); process.exit(2); }
