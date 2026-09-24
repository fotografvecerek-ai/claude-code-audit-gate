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
const ws = norm(WORKSPACE), repo = norm(REPO);
const WRITE_ALLOW_DIRS = ['AUDIT/', 'tools/', '.claude/', 'build/', 'test-results/'].map(s => `${ws}/${s.toLowerCase()}`);
const WRITE_ALLOW_FILES = ['.gitignore', 'README.md', 'CLAUDE.md', 'BRIDGE.md'].map(s => `${ws}/${s.toLowerCase()}`);
const WRITE_DENY = [`${ws}/audit/03_dukazy/`];

const DENY = [
  [/\bvercel\b/i, 'deploy'], [/\b(npm|pnpm|yarn)\s+publish\b/i, 'publish'],
  [/\bprisma\s+(migrate\s+(dev|deploy|reset)|db\s+push)\b/i, 'migrace'], [/\bsupabase\s+(db\s+push|functions\s+deploy|migration\s+up)\b/i, 'migrace'],
  [/\brm\s+-[a-z]*r[a-z]*f?\b/i, 'rekurzivní mazání'], [/\bRemove-Item\b.*-Recurse/i, 'rekurzivní mazání'], [/\bdel\s+\/[sq]/i, 'mazání'],
  [/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE)\b/i, 'destruktivní SQL'],
  [/\b(kill|taskkill|pkill|killall)\b/i, 'ukončení procesu (Kapitánův dev server / most)'],
];
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
    const fp = norm(ti.file_path || ti.notebook_path || ''); if (!fp) process.exit(0);
    if (WRITE_DENY.some(d => fp.startsWith(d))) block(`Zápis do ${fp} zakázán — 03_dukazy/ patří Kapitánovi.`);
    if (repo && (fp === repo || fp.startsWith(repo + '/'))) block(`Zápis do repa aplikace zakázán (${fp}). Auditor nekóduje — sepiš nález/návrh do AUDIT/.`);
    if (!WRITE_ALLOW_DIRS.some(a => fp.startsWith(a)) && !WRITE_ALLOW_FILES.includes(fp)) block(`Zápis mimo povolené složky (${fp}). Povoleno: AUDIT/, tools/, .claude/, build/ (lokální klon pro testy) ve workspace auditora.`);
    if (/\/audit\/bus\/[^/]*_(kapitan|owner)_[^/]*\.json$/.test(fp)) block('Zprávy na busu za Kapitána/vlastníka nesmí psát auditor (vlastnictví zpráv).');
    if (/\/audit\/bus\/ledger\.md$/.test(fp)) block('LEDGER.md generuje bus.mjs — needitovat ručně.');
    process.exit(0);
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(ti.command || ''); const lc = norm(cmd);
    for (const [re, why] of DENY) if (re.test(cmd)) block(`Zakázáno (${why}): auditor nevydává, nemigruje, nemaže, neukončuje procesy, nemutuje mimo localhost.`);
    if (mutatingRemoteHttp(cmd)) block('Zakázáno (mutační HTTP mimo localhost): sondy jen proti lokálnímu buildu; produkce jen se souhlasem vlastníka a mimo tento hook.');
    // git mutace: povoleno jen když cíl = workspace auditora (cwd ve workspace a žádné -C/cesta do repa)
    const repoRe = repo ? new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w.-])') : null;
    const resolveTarget = (m) => {
      if (m[1]) return norm(m[1]);
      const before = lc.slice(0, m.index); const cds = [...before.matchAll(/(?:^|[;&|]\s*)cd\s+("[^"]+"|\S+)/g)];
      if (!cds.length) return cwd; let t = cds[cds.length - 1][1].replace(/"/g, '');
      return t.startsWith('/') ? t : norm(cwd + '/' + t).replace(/\/\.\//g, '/');
    };
    for (const m of cmd.matchAll(GIT_MUT)) {
      const target = resolveTarget(m);
      const inRepo = repo && (target === repo || target.startsWith(repo + '/') || (repoRe.test(m[1] ? norm(m[1]) : '')));
      const inWs = target === ws || target.startsWith(ws + '/');
      const inBuild = target.startsWith(ws + '/build/');
      if (inRepo || !inWs) block(`git ${m[2]} mimo workspace auditora zakázán (cíl: ${target}). Auditor commituje jen svůj AUDIT repozitář.`);
      if (inBuild && !/^(checkout|switch|restore|stash)$/i.test(m[2])) block(`git ${m[2]} v build/ klonu zakázán — klon slouží jen ke čtení a spuštění testů (povoleno: clone, fetch, pull, checkout, switch).`);
    }
    if (/\bgit\s+(-C\s+\S+\s+)?push\b.*--force|\bgit\s+push\s+-f\b/i.test(cmd)) block('force push zakázán i ve workspace.');
    if (repo && lc.includes(repo) && /(>>?|\btee\b|\bcp\b|\bmv\b|\bsed\s+-i|\bcopy\b|\bmove\b|set-content|out-file|\bmkdir\b|\btouch\b)/i.test(cmd)) block('Shellový zápis/kopie do repa aplikace zakázán. Výstupy patří do AUDIT/.');
    if (/bus\.mjs\s+post\b/.test(cmd) && !/--from\s+auditor\b/.test(cmd)) block('bus post: auditor smí posílat jen --from auditor.');
    process.exit(0);
  }
  process.exit(0);
});
function block(msg) { process.stderr.write(`AUDITOR-GUARD Blocked: ${msg}\n`); process.exit(2); }
