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
const fsx = require('node:fs');
let R = null; for (const c of [path.join(__dirname, 'hygiene-rules.js'), path.join(__dirname, 'hygiene', 'hygiene-rules.js'), path.join(process.env.AUDITOR_WORKSPACE || '', 'kapitan-side/hygiene/hygiene-rules.js')]) { try { R = require(c).load(); break; } catch { } }
const PROD_BRANCH = new RegExp(process.env.PROD_BRANCHES || '^(main|master|production|prod|release)$', 'i');
const DEPLOY = [/\bvercel\s+(deploy|--prod|alias|promote)|\bvercel\b.*--prod/i, /\b(npm|pnpm|yarn)\s+publish\b/i, /\bprisma\s+migrate\s+deploy\b/i, /\bsupabase\s+(db\s+push|functions\s+deploy)\b/i, /\bcapgo\b.*(upload|bundle)/i, /\bbuild_ota\.py\b/i, /\b(eas|fastlane)\s+(submit|build)\b/i, /\bgh\s+release\s+create\b/i];
let raw = ''; process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch { process.stderr.write('KAPITAN-GUARD Blocked: vstup hooku není JSON (fail-closed).\n'); process.exit(2); }
  const tool = input.tool_name || '', ti = input.tool_input || {};
  const cwdRaw = input.cwd || process.cwd();
  if (!ws || /\[DOPLŇ|\[DOPLN/.test(ws) || !repo) block('AUDITOR_WORKSPACE / AUDITOR_TARGET_REPO nejsou nastaveny (fail-closed) — spusť setup-auditor, nebo hook odstraň ze settings.');
  if (!R) block('hygiene-rules.json nenalezen (fail-closed) — spusť setup-auditor (kopíruje pravidla do .claude/hooks/).');
  if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(tool)) {
    const fp = norm(ti.file_path || ti.notebook_path || '');
    if (fp.startsWith(ws + '/audit/')) {
      const ok = fp.startsWith(ws + '/audit/03_dukazy/') || (/\/audit\/bus\/[^/]*_kapitan_[^/]*\.json$/.test(fp));
      if (!ok) block(`Kapitán smí v AUDIT/ zapisovat jen do 03_dukazy/ a bus zprávy --from kapitan (${fp}). Nálezy, verdikty, handoff a gate patří auditorovi.`);
    }
    if (fp.startsWith(ws + '/') && !fp.startsWith(ws + '/audit/')) block(`Workspace auditora je pro Kapitána read-only mimo AUDIT/03_dukazy (${fp}).`);
    if (repo && fp.startsWith(repo + '/')) {
      const relp = fp.slice(repo.length + 1); const base = relp.split('/').pop();
      if (/^\.claude\/(hooks\/|settings(\.local)?\.json$)|^\.github\/workflows\/auditor-gate\.yml$|^\.git\/hooks\//.test(relp)) block(`SELF-PROTECT: ${relp} — hooky, settings a CI bránu mění jen vlastník ručně nebo setup-auditor, ne agent.`);
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
    // SELF-PROTECT i přes shell: zápis/mazání/přesun souborů hooků, settings, CI brány
    if (/(\.claude\/(hooks|settings)|\.github\/workflows\/auditor-gate|\.git\/hooks)/i.test(cmd.replace(/\\/g, '/')) && /(>>?|\btee\b|\bcp\b|\bmv\b|\brm\b|\bdel\b|\bsed\s+-i|remove-item|set-content|out-file|copy-item|move-item|\bgit\s+rm\b|\bchmod\b|\btruncate\b|\bnpx\s+prettier\b)/i.test(cmd)) block('SELF-PROTECT: zápis do .claude/hooks, settings nebo CI brány přes shell je zakázán.');
    if (/bus\.mjs\s+post\b/.test(cmd) && !/--from\s+kapitan\b/.test(cmd)) block('bus post: Kapitán smí posílat jen --from kapitan.');
    const lc = norm(cmd);
    if (lc.includes(ws + '/audit/') && !lc.includes(ws + '/audit/03_dukazy') && !/bus\.mjs/.test(cmd) && /(>>?|\btee\b|\bcp\b|\bmv\b|\bsed\s+-i|\brm\b|\bdel\b|remove-item|set-content|out-file)/i.test(cmd)) block('Shellový zápis do AUDIT/ mimo 03_dukazy zakázán.');
    // git push do produkční větve = deploy (Vercel/GitHub integrace nasazuje automaticky) → gate-check
    const pushM = cmd.match(/\bgit\b(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+push\b([^|;&]*)/i);
    let pushProd = false;
    if (pushM) { const rawArgs = pushM[1].trim().split(/\s+/).filter(Boolean); if (rawArgs.some(a => /^--(all|mirror|tags|branches)$/.test(a))) pushProd = true;
      const args = rawArgs.filter(a => !a.startsWith('-')); const refspecs = args.slice(1); const targets = refspecs.map(r => r.includes(':') ? r.split(':')[1] : r).map(t => t.replace(/^refs\/heads\//, ''));
      if (targets.some(t => t && t !== 'HEAD' && PROD_BRANCH.test(t))) pushProd = true;
      const refspec = refspecs[0] || ''; const target = refspecs.length > 1 ? '' : (refspec.includes(':') ? refspec.split(':')[1] : refspec);
      // skutečný adresář příkazu: -C <dir> > poslední `cd <dir>` před push > cwd hooku (worktree má vlastní HEAD!)
      const cM = pushM[0].match(/\s-C\s+("[^"]+"|\S+)/); const cdM = [...cmd.slice(0, pushM.index).matchAll(/(?:^|[;&|(\n{]\s*)cd\s+("[^"]+"|\S+)/g)].pop();
      let dir = cM ? cM[1] : cdM ? cdM[1] : cwdRaw; dir = dir.replace(/"/g, ''); if (!path.isAbsolute(dir)) dir = path.resolve(cwdRaw, dir);
      let branch = (target && target !== 'HEAD') ? target : ''; if (!branch) { try { branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim(); } catch { branch = 'UNKNOWN'; } }
      if (branch === 'UNKNOWN' || branch === 'HEAD') pushProd = true; // nelze určit → fail-closed (gate-check rozhodne)
      pushProd = pushProd || PROD_BRANCH.test(branch.replace(/^refs\/heads\//, '')); }
    if (pushProd || DEPLOY.some(re => re.test(cmd))) {
      // důvěryhodná kopie = workspace auditora (mimo repo); kopie v repu jen jako záloha, když workspace není dostupný
      const gc = [path.join(process.env.AUDITOR_WORKSPACE, 'kapitan-side', 'gate-check.mjs'), path.join(__dirname, 'gate-check.mjs')].find(p => fsx.existsSync(p)) || path.join(__dirname, 'gate-check.mjs');
      try { execFileSync(process.execPath, [gc, process.env.AUDITOR_TARGET_REPO || process.cwd()], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env }); }
      catch (e) { const err = String(e.stderr || e.message); const line = (err.match(/GATE-CHECK FAIL:.*/) || [])[0] || `gate-check nelze spustit (${(err.match(/ENOENT[^\n]*|Cannot find module[^\n]*/) || ['chyba'])[0]}) — fail-closed`; block(`DEPLOY BLOKOVÁN — ${line}`); }
    }
    process.exit(0);
  }
  process.exit(0);
});
function block(msg) { process.stderr.write(`KAPITAN-AUDIT-GUARD Blocked: ${msg}\n`); process.exit(2); }
