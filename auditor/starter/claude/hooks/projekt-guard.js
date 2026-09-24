#!/usr/bin/env node
// PROJEKT GUARD — PreToolUse hook zdravého projektu (bez odděleného auditora). Pravidla auditora zabudovaná přímo v projektu.
// Vynucuje: (1) hygienu umístění nových souborů (sdílená pravidla hygiene-rules.json), žádná tajemství a binárky v repu;
//           (2) SELF-PROTECT: hooky, settings, CI a definici kontrolora mění jen vlastník, ne agent;
//           (3) NEZÁVISLOST: do docs/kontrola/ smí zapisovat jen subagent „kontrolor" (agent_type z hooku) a kontrolor nesmí měnit nic jiného;
//           (4) vydání (deploy, publish, push do produkční větve) jen když release-check.mjs projde (verdikt kontrolora 🟢 pro tento kód);
//           (5) force push zakázán.
// FAIL-CLOSED: pád hooku = blok.
process.on('uncaughtException', e => { process.stderr.write('PROJEKT-GUARD Blocked: hook selhal (' + (e && e.message) + ') — fail-closed.\n'); process.exit(2); });
const { execFileSync } = require('node:child_process'); const path = require('node:path'); const fs = require('node:fs');
const norm = p => { if (!p) return ''; p = String(p).replace(/\\/g, '/'); p = p.replace(/(^|[\s"'=(])([A-Za-z]):\//g, (_, pre, d) => `${pre}/${d.toLowerCase()}/`); return p.toLowerCase().replace(/\/+$/, ''); };
// skutečná cesta (Windows 8.3 zkratky RUNNER~1, macOS /var → /private/var), i pro soubor, který ještě neexistuje
const real = p => { let cur = path.resolve(String(p || '.')); const rest = []; while (!fs.existsSync(cur)) { rest.unshift(path.basename(cur)); const up = path.dirname(cur); if (up === cur) break; cur = up; } try { cur = fs.realpathSync.native(cur); } catch { } return path.join(cur, ...rest); };
let R = null; try { R = require(path.join(__dirname, 'hygiene-rules.js')).load(path.join(__dirname, 'hygiene-rules.json')); } catch { }
const PROD_BRANCH = new RegExp(process.env.PROD_BRANCHES || '^(main|master|production|prod|release)$', 'i');
const DEPLOY = [/\bvercel\s+(deploy|--prod|alias|promote)|\bvercel\b.*--prod/i, /\b(npm|pnpm|yarn)\s+publish\b/i, /\bprisma\s+migrate\s+deploy\b/i, /\bsupabase\s+(db\s+push|functions\s+deploy)\b/i, /\b(netlify|firebase)\s+deploy\b/i, /\bfly\s+deploy\b/i, /\bwrangler\s+(deploy|publish)\b/i, /\b(eas|fastlane)\s+(submit|build)\b/i, /\bgh\s+release\s+create\b/i];
const KONTROLOR = /^kontrolor$/i;
let raw = ''; process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let input = {}; try { input = JSON.parse(raw || '{}'); } catch { block('vstup hooku není JSON (fail-closed).'); }
  if (!R) block('hygiene-rules.json nenalezen v .claude/hooks (fail-closed).');
  const tool = input.tool_name || '', ti = input.tool_input || {}; const cwd = input.cwd || process.cwd();
  const isK = KONTROLOR.test(String(input.agent_type || '')) && !!input.agent_id;
  let root = ''; try { root = norm(real(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim())); } catch { root = norm(real(path.resolve(__dirname, '..', '..'))); }
  if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(tool)) {
    const abs = ti.file_path || ti.notebook_path || ''; const fp = norm(real(path.isAbsolute(abs) ? abs : path.join(cwd, abs)));
    let audWs = ''; try { audWs = norm(real(JSON.parse(fs.readFileSync(path.join(__dirname, 'auditor.json'), 'utf8')).workspace)); } catch { }
    if (audWs && (fp === audWs || fp.startsWith(audWs + '/'))) block(`workspace samostatného auditora je pro agenta projektu jen ke čtení (${fp}).`);
    if (!fp.startsWith(root + '/')) process.exit(0);
    const relp = fp.slice(root.length + 1); const base = relp.split('/').pop();
    const inKontrola = /^docs\/kontrola\//.test(relp);
    if (isK && !inKontrola) block(`kontrolor smí zapisovat jen do docs/kontrola/ (${relp}) — opravy dělá hlavní agent, ne kontrolor.`);
    if (!isK && inKontrola) block(`docs/kontrola/ zapisuje jen nezávislý kontrolor (${relp}). Hlavní agent verdikty ani nálezy neupravuje — spusť /kontrola.`);
    if (/^\.claude\/(hooks\/|settings(\.local)?\.json$|agents\/kontrolor\.md$)|^\.github\/workflows\/|^\.git\/hooks\//.test(relp)) block(`SELF-PROTECT: ${relp} — pojistky, settings, CI a kontrolora mění jen vlastník ručně, ne agent.`);
    const isNew = !fs.existsSync(abs);
    if (!relp.includes('/') && isNew && !R.rootAllow.test(base)) block(`HYGIENA: nový soubor v rootu (${base}) — skripty → scripts/, dokumenty → docs/, provizoria → .tmp/tasks/<ID>/.`);
    if (R.junk.test(base) && !R.tmpOkDirs.test(relp)) block(`HYGIENA: provizorní soubor (${relp}) mimo .tmp/tasks/<ID>/ — po úkolu uklidit.`);
    if (R.binExt.test(base) && !R.binOkDirs.test(relp) && !/^\.tmp\/tasks\//.test(relp)) block(`HYGIENA: binárka (${relp}) mimo public/assets.`);
    if (R.secret.test(relp) && !R.secretOk.test(relp) && isNew) block(`HYGIENA: tajemství (${relp}) — do repa jen .env.example; skutečné hodnoty zadá vlastník sám.`);
    process.exit(0);
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(ti.command || ''); const c = cmd.replace(/\\/g, '/');
    const WRITE = /(>>?(?![&]|\s*\/dev\/null)|\btee\b|\bcp\b|\bmv\b|\brm\b|\bdel\b|\bsed\s+-i|remove-item|set-content|out-file|add-content|copy-item|move-item|\bchmod\b|\btruncate\b|\bgit\s+(rm|mv)\b)/i;
    if (/\bgit\s+(-C\s+\S+\s+)?push\b.*(--force|-f\b)/i.test(cmd)) block('force push zakázán.');
    let audWsB = ''; try { audWsB = norm(JSON.parse(fs.readFileSync(path.join(__dirname, 'auditor.json'), 'utf8')).workspace); } catch { }
    if (audWsB && norm(cmd).includes(audWsB) && WRITE.test(cmd) && !/\bgit\s+(-C\s+\S+\s+)?(log|status|diff|show)\b/.test(cmd)) block('workspace samostatného auditora je pro agenta projektu jen ke čtení (zápis shellem zakázán).');
    if (/(\.claude\/(hooks|settings|agents\/kontrolor)|\.github\/workflows|\.git\/hooks)/i.test(c) && WRITE.test(cmd)) block('SELF-PROTECT: zápis do pojistek, settings, CI nebo kontrolora přes shell je zakázán.');
    if (!isK && /docs\/kontrola/i.test(c) && WRITE.test(cmd) && !/\bowner-report\.mjs\b/.test(cmd)) block('docs/kontrola/ zapisuje jen kontrolor.');
    if (isK) {
      if (/\bgit\s+(?:(?:-C|-c)\s+\S+\s+|--no-pager\s+)*(commit|push|reset|checkout|switch|restore|stash|merge|rebase|cherry-pick|revert|tag|clean|add|rm|mv|apply|am|worktree|branch\s+-[dDmM])\b/i.test(cmd)) block('kontrolor nemění git (jen čte: status, log, diff, show, rev-parse, ls-files).');
      if (DEPLOY.some(re => re.test(cmd))) block('kontrolor nevydává.');
      const targets = [...c.matchAll(/(?:>>?|\btee\s+(?:-a\s+)?)\s*("[^"]+"|'[^']+'|[^\s;&|]+)/g)].map(m => m[1].replace(/["']/g, ''));
      if (targets.some(t => !/^(\/dev\/null|&\d|nul)$/i.test(t) && !/(^|\/)docs\/kontrola\//i.test(t) && !/(^|\/)\.tmp\//.test(t))) block('kontrolor smí přesměrovat výstup jen do docs/kontrola/ nebo .tmp/.');
      if (/\b(rm|del|mv|remove-item|move-item)\b/i.test(cmd) && !/(docs\/kontrola|\.tmp\/)/i.test(c)) block('kontrolor nemaže ani nepřesouvá soubory projektu.');
    }
    const pushM = cmd.match(/\bgit\b(?:\s+-C\s+\S+)?(?:\s+-c\s+\S+)*\s+push\b([^|;&]*)/i); let pushProd = false;
    if (pushM) { const a = pushM[1].trim().split(/\s+/).filter(Boolean); if (a.some(x => /^--(all|mirror|tags|branches)$/.test(x))) pushProd = true;
      const refs = a.filter(x => !x.startsWith('-')).slice(1).map(r => (r.includes(':') ? r.split(':')[1] : r).replace(/^refs\/heads\//, ''));
      if (refs.some(t => t && t !== 'HEAD' && PROD_BRANCH.test(t))) pushProd = true;
      if (!refs.length || refs.every(t => t === 'HEAD')) { let br = ''; try { br = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' }).trim(); } catch { br = 'HEAD'; } if (br === 'HEAD' || PROD_BRANCH.test(br)) pushProd = true; } }
    if (pushProd || DEPLOY.some(re => re.test(cmd))) {
      try { execFileSync(process.execPath, [path.join(__dirname, 'release-check.mjs')], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (e) { const err = String(e.stderr || e.message); block('VYDÁNÍ BLOKOVÁNO — ' + ((err.match(/RELEASE-CHECK FAIL:.*/) || [])[0] || 'release-check nelze spustit (fail-closed)') + ' → spusť /vydani (nezávislý kontrolor) a pak znovu.'); }
    }
    process.exit(0);
  }
  process.exit(0);
});
function block(msg) { process.stderr.write(`PROJEKT-GUARD Blocked: ${msg}\n`); process.exit(2); }
