// A-031 (1.8.9): oprávnění Claude Code pod schválenou samostatností Kapitána — sdílené settings.json, vyhodnocení pravidel VZOREM,
// uživatelské ~/.claude/settings.json (jen hlášení), otisk spouštěčů, permission_mode v guardu, varovací soubor. Volá se z selftest.mjs.
// Pozor: HOME/USERPROFILE všech spuštěných procesů míří do temp (skutečné uživatelské nastavení se nikdy nedotkne); soubor
// ~/.claude/settings.json skutečného uživatele se jen čte kvůli kontrole, že se nezměnil.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto'; import { spawnSync } from 'node:child_process'; import { pathToFileURL } from 'node:url';

export async function runA031(ctx) {
  const { T, pkg, tmp, env, KG, isWin } = ctx;
  const TP = path.join(pkg, 'tools');
  const base = path.join(tmp, 'a031'); fs.mkdirSync(base, { recursive: true });
  const home = path.join(base, 'home'); fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const homeEnv = { ...process.env, HOME: home, USERPROFILE: home, CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli' };
  const sha = f => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return 'chybi'; } };
  const realUserSettings = path.join(os.homedir(), '.claude', 'settings.json'); const realBefore = sha(realUserSettings);
  const NEED = /^(opravneni|prisnost|opravneni-pravidla|opravneni-vzor|kapitan-role|spoustec|varovani|write-launchers)\.mjs$/;
  const gw = (w, ...a) => spawnSync('git', ['-C', w, ...a], { encoding: 'utf8' });
  const commitAs = (w, files, who) => { for (const f of files) gw(w, 'add', '-f', f); const email = who === 'vlastnik' ? 'vlastnik@auditor.local' : 'agent@local'; gw(w, '-c', `user.name=${who}`, '-c', `user.email=${email}`, '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', `test ${who}`); };
  const wr = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, 'utf8'); };
  const rj = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const WARN = w => path.join(w, 'AUDIT', 'VAROVANI-oprávnění.md');
  const txt = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const FOREIGN = { model: 'x', jine: 'ščřžýáíéúůďťňĚŠČŘŽ' };

  // fixture: repo (.claude) + workspace auditora (git, kopie nástrojů); kap = schválená samostatnost (0 = nic neschváleno, 1–3), git = false → ws bez gitu
  const mk = (name, { kap = 0, git = true } = {}) => {
    const d = path.join(base, name), r = path.join(d, 'app'), w = path.join(d, 'app-audit');
    fs.mkdirSync(path.join(r, '.claude'), { recursive: true }); fs.mkdirSync(path.join(w, 'tools'), { recursive: true }); fs.mkdirSync(path.join(w, 'AUDIT'), { recursive: true });
    for (const f of fs.readdirSync(TP)) if (NEED.test(f)) fs.copyFileSync(path.join(TP, f), path.join(w, 'tools', f));
    if (git) { gw(w, 'init', '-q'); gw(w, '-c', 'user.name=auditor', '-c', 'user.email=auditor@local', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'init'); }
    if (kap) { wr(path.join(w, '.opravneni.json'), JSON.stringify({ kapitan: kap }) + '\n'); if (git) commitAs(w, ['.opravneni.json'], 'vlastnik'); }
    return { r, w, S: path.join(r, '.claude', 'settings.json'), L: path.join(r, '.claude', 'settings.local.json') };
  };
  const role = (p, extraEnv = {}) => spawnSync(process.execPath, [path.join(p.w, 'tools', 'kapitan-role.mjs'), p.w], { cwd: p.r, env: { ...homeEnv, CLAUDE_PROJECT_DIR: p.r, ...extraEnv }, encoding: 'utf8' });
  const baks = (p, name) => fs.readdirSync(path.join(p.r, '.claude')).filter(f => f.startsWith(name + '.bak-'));
  const guard = (p, input, level) => spawnSync(process.execPath, [KG], { input: JSON.stringify(input), env: { ...env, HOME: home, USERPROFILE: home, AUDITOR_WORKSPACE: p.w.replace(/\\/g, '/'), AUDITOR_TARGET_REPO: p.r.replace(/\\/g, '/') }, encoding: 'utf8' });

  // --- AK2) pravidla se vyhodnocují VZOREM (čistá funkce)
  const V = await import(pathToFileURL(path.join(TP, 'opravneni-vzor.mjs')).href);
  const P = await import(pathToFileURL(path.join(TP, 'opravneni-pravidla.mjs')).href);
  const BROAD = ['Bash(*)', 'Bash', 'mcp__*__*', 'mcp__supabase__execute_sql', 'Bash(rm:*)', 'Bash(git push*)', 'Bash(psql:*)', 'Bash(curl:*)', 'PowerShell(*)', 'Bash(node:*)', 'mcp__supabase'];
  const NARROW = ['Bash(node selftest.mjs)', 'Bash(git status)', 'Bash(git log:*)', 'Read(*)', 'Bash(npm test)', 'mcp__supabase__list_tables', 'Bash(ls:*)', 'Bash(moje:*)', 'Bash(node scripts/build.mjs)'];
  T('A-031 vzor: široká a riziková pravidla (Bash(*), Bash, mcp__*__*, execute_sql, rm, git push, psql, curl, PowerShell(*), node:*) jsou „široká"', BROAD.map(r => V.isBroadRule(r)).join(','), BROAD.map(() => 'true').join(','));
  T('A-031 vzor: úzká pravidla (node selftest.mjs, git status, git log, Read, npm test, list_tables …) nejsou „široká"', NARROW.map(r => V.isBroadRule(r)).join(','), NARROW.map(() => 'false').join(','));
  T('A-031 úroveň 1 odebere všech 7 rizikových variant (Bash(*), Bash, mcp__*__*, execute_sql, rm, git push, psql)', ['Bash(*)', 'Bash', 'mcp__*__*', 'mcp__supabase__execute_sql', 'Bash(rm:*)', 'Bash(git push*)', 'Bash(psql:*)'].map(r => P.isExcess(r, 1)).join(','), 'true,true,true,true,true,true,true');
  T('A-031 úroveň 1 úzká pravidla NEODEBERE (node selftest.mjs, git status, git log, Read, npm test)', NARROW.slice(0, 5).map(r => P.isExcess(r, 1)).join(','), 'false,false,false,false,false');
  T('A-031 úroveň 2: široká mimo tabulku pryč (Bash(*), rm, git push, execute_sql), psql z tabulky zůstane, úzká zůstanou', ['Bash(*)', 'Bash(rm:*)', 'Bash(git push*)', 'mcp__supabase__execute_sql', 'Bash(psql:*)', 'Bash(git status)'].map(r => P.isExcess(r, 2)).join(','), 'true,true,true,false,false,false');
  T('A-031 úroveň 3: nic se neodebírá (ani Bash(*))', ['Bash(*)', 'Bash', 'mcp__*__*'].map(r => P.isExcess(r, 3)).join(','), 'false,false,false');

  // --- AK1 + AK2) sdílené .claude/settings.json I settings.local.json při SessionStartu Kapitána
  const BAD = { ...FOREIGN, permissions: { defaultMode: 'bypassPermissions', allow: ['Bash(node selftest.mjs)', 'Bash(git status)', 'Bash(*)', 'Bash', 'mcp__*__*', 'mcp__supabase__execute_sql', 'Bash(rm:*)', 'Bash(git push*)', 'Bash(psql:*)'] } };
  { const p = mk('s1', { kap: 1 }); wr(p.S, JSON.stringify(BAD, null, 2) + '\n'); wr(p.L, JSON.stringify(BAD, null, 2) + '\n');
    const o = role(p); const s = rj(p.S), l = rj(p.L);
    T('A-031 AK1: úroveň 1 — bypassPermissions ve sdíleném settings.json odebrán', `${s.permissions.defaultMode}`, 'undefined');
    T('A-031 AK2: úroveň 1 — v settings.json i settings.local.json zůstala jen úzká pravidla', `${JSON.stringify(s.permissions.allow)}|${JSON.stringify(l.permissions.allow)}`, `${JSON.stringify(['Bash(node selftest.mjs)', 'Bash(git status)'])}|${JSON.stringify(['Bash(node selftest.mjs)', 'Bash(git status)'])}`);
    T('A-031 AK1: cizí klíče (UTF-8 diakritika) ve settings.json zůstaly beze změny', `${s.model}/${s.jine}`, `x/${FOREIGN.jine}`);
    T('A-031 AK1: záloha settings.json.bak-<čas> a settings.local.json.bak-<čas> existují a nesou původní obsah', `${baks(p, 'settings.json').length}/${baks(p, 'settings.local.json').length}/${JSON.stringify(rj(path.join(p.r, '.claude', baks(p, 'settings.json')[0]))) === JSON.stringify(BAD)}`, '1/1/true');
    T('A-031 AK1: SessionStart vypíše „[OPRÁVNĚNÍ] ⚠" pro oba soubory', `${/\[OPRÁVNĚNÍ\] ⚠ \.claude\/settings\.json /.test(o.stdout)}/${/\[OPRÁVNĚNÍ\] ⚠ \.claude\/settings\.local\.json /.test(o.stdout)}`, 'true/true');
    T('A-031 AK1: log AUDIT/_zmeny-nastaveni.log nese oba soubory', `${/soubor=[^\n]*settings\.json /.test(txt(path.join(p.w, 'AUDIT', '_zmeny-nastaveni.log')))}/${/soubor=[^\n]*settings\.local\.json /.test(txt(path.join(p.w, 'AUDIT', '_zmeny-nastaveni.log')))}`, 'true/true');
    T('A-031 AK6: mechanické varování AUDIT/VAROVANI-oprávnění.md vzniklo (UTF-8) a zmiňuje settings.json', `${fs.existsSync(WARN(p.w))}/${/settings\.json/.test(txt(WARN(p.w)))}`, 'true/true');
    const before = sha(p.S); role(p);
    T('A-031 AK1: druhý start nic dalšího neodebírá ani nezálohuje (idempotence)', `${sha(p.S) === before}/${baks(p, 'settings.json').length}`, 'true/1');
    const k = spawnSync(process.execPath, [path.join(p.w, 'tools', 'prisnost.mjs'), '--ws', p.w, 'kontext'], { env: homeEnv, encoding: 'utf8' });
    T('A-031 AK6: nevyřešené varování se hlásí i při dalším startu (řádek kontextu přísnosti)', /\[OPRÁVNĚNÍ\] ⚠ Nevyřešené varování z VAROVANI-oprávnění\.md/.test(k.stdout), true); }
  { const p = mk('s2', { kap: 2 }); wr(p.S, JSON.stringify(BAD, null, 2) + '\n'); role(p); const s = rj(p.S);
    T('A-031 AK2: úroveň 2 — sdílené settings.json: bypass a široká pravidla pryč, psql z tabulky a úzká zůstala', `${s.permissions.defaultMode}/${JSON.stringify(s.permissions.allow)}`, `undefined/${JSON.stringify(['Bash(node selftest.mjs)', 'Bash(git status)', 'mcp__supabase__execute_sql', 'Bash(psql:*)'])}`); }
  { const OK = { ...FOREIGN, permissions: { allow: ['Bash(node selftest.mjs)', 'Bash(git status)', 'Bash(psql:*)', 'Bash(npm run:*)'] } };
    const p = mk('s3', { kap: 2 }); wr(p.S, JSON.stringify(OK, null, 2) + '\n'); const b = sha(p.S); const o = role(p);
    T('A-031 AK7: úroveň 2 schválená a pravidla do úrovně 2 — žádná změna, žádná záloha, žádné varování', `${sha(p.S) === b}/${baks(p, 'settings.json').length}/${/OPRÁVNĚNÍ/.test(o.stdout)}/${fs.existsSync(WARN(p.w))}`, 'true/0/false/false');
    const q = mk('s4', { kap: 3 }); wr(q.S, JSON.stringify(BAD, null, 2) + '\n'); wr(path.join(home, '.claude', 'settings.json'), JSON.stringify({ permissions: { defaultMode: 'bypassPermissions' } }) + '\n');
    const bq = sha(q.S), oq = role(q);
    T('A-031 AK7: úroveň 3 schválená — nic se neodebere, žádné varování (ani na bypass v ~/.claude/settings.json), žádný soubor varování', `${sha(q.S) === bq}/${/OPRÁVNĚNÍ/.test(oq.stdout)}/${fs.existsSync(WARN(q.w))}`, 'true/false/false');
    fs.rmSync(path.join(home, '.claude', 'settings.json'), { force: true }); }
  { const p = mk('s5', { kap: 0 }); wr(p.S, JSON.stringify(BAD, null, 2) + '\n'); role(p); const s = rj(p.S);
    T('A-031 AK1: nic neschváleno vlastníkem (fail-closed = úroveň 1) → sdílené settings.json se srovná', `${s.permissions.defaultMode}/${JSON.stringify(s.permissions.allow)}`, `undefined/${JSON.stringify(['Bash(node selftest.mjs)', 'Bash(git status)'])}`); }

  // --- AK3) ~/.claude/settings.json se NIKDY nemění; při bypassu jen hlášení
  { const U = path.join(home, '.claude', 'settings.json'); const UBAD = JSON.stringify({ permissions: { defaultMode: 'bypassPermissions', allow: ['Bash(*)'] }, jine: 'ščřžýáíéúůďťňĚŠČŘŽ' }, null, 2) + '\n';
    const p = mk('u1', { kap: 1 }); wr(U, UBAD); const b = sha(U); const o = role(p);
    T('A-031 AK3: bypass v ~/.claude/settings.json — soubor po startu Kapitána BYTE-IDENTICKÝ (nikdy se nemění)', sha(U) === b, true);
    T('A-031 AK3: bypass v ~/.claude/settings.json — start hlásí vlastníkovi „[OPRÁVNĚNÍ] ⚠ ~/.claude/settings.json" a zapíše varování', `${/\[OPRÁVNĚNÍ\] ⚠ ~\/\.claude\/settings\.json/.test(o.stdout)}/${/~\/\.claude\/settings\.json/.test(txt(WARN(p.w)))}`, 'true/true');
    fs.rmSync(U, { force: true });
    const q = mk('u2', { kap: 1 }); wr(U, JSON.stringify({ permissions: { defaultMode: 'default' } }) + '\n'); const oq = role(q);
    T('A-031 AK3: bez bypassu v ~/.claude/settings.json se nic nehlásí ani nezapisuje', `${/OPRÁVNĚNÍ/.test(oq.stdout)}/${fs.existsSync(WARN(q.w))}`, 'false/false');
    fs.rmSync(U, { force: true }); }

  // --- AK5) guard čte permission_mode (tolerantně): blokuje jen bypassPermissions nad schválenou úrovní
  const inp = (p, mode, tool = 'Bash') => ({ cwd: p.r, tool_name: tool, ...(tool === 'Write' ? { tool_input: { file_path: path.join(p.r, 'docs', 'a.md') } } : { tool_input: { command: 'ls' } }), ...(mode === undefined ? {} : { permission_mode: mode }) });
  { const g1 = mk('g1', { kap: 1 }), g2 = mk('g2', { kap: 2 }), g3 = mk('g3', { kap: 3 }), g0 = mk('g0', { git: false });
    const rb = guard(g1, inp(g1, 'bypassPermissions'));
    T('A-031 AK5: bypassPermissions při schválené úrovni 1 → guard blokuje (exit 2) s hláškou BYPASS OPRÁVNĚNÍ a odkazem START → [7]', `${rb.status}/${/BYPASS OPRÁVNĚNÍ/.test(rb.stderr)}/${/START → \[7\]/.test(rb.stderr)}`, '2/true/true');
    T('A-031 AK5: bypassPermissions při úrovni 2 → blok (Bash i Write)', `${guard(g2, inp(g2, 'bypassPermissions')).status}/${guard(g2, inp(g2, 'bypassPermissions', 'Write')).status}`, '2/2');
    T('A-031 AK5: bypassPermissions při schválené úrovni 3 → neblokuje', guard(g3, inp(g3, 'bypassPermissions')).status, 0);
    T('A-031 AK5: ws bez gitu (integrita nedostupná = fail-closed úroveň 1) + bypass → blok', guard(g0, inp(g0, 'bypassPermissions')).status, 2);
    T('A-031 AK3: bez bypassu se nic neblokuje — default, acceptEdits, plan, auto, pole chybí, prázdná hodnota (úroveň 1)', ['default', 'acceptEdits', 'plan', 'auto', undefined, '', null].map(m => guard(g1, inp(g1, m)).status).join(','), '0,0,0,0,0,0,0');
    T('A-031 AK5: bypass s jiným písmem (např. „bypasspermissions") se nepovažuje za bypass — tolerantní, neblokuje', guard(g1, inp(g1, 'bypasspermissions')).status, 0); }

  // macOS: temp leží pod symlinkem (/var → /private/var); CLI nástroje se spouští přes cestu se symlinkem/junctionem — vstupní bod musí poznat sám sebe (realpath)
  { const p = mk('sym', { kap: 3 }); const lnk = path.join(base, 'sym', 'odkaz'); let ok = true; try { fs.symlinkSync(path.join(p.w, 'tools'), lnk, 'junction'); } catch { ok = false; }
    if (ok) { const r = spawnSync(process.execPath, [path.join(lnk, 'prisnost.mjs'), '--ws', p.w, 'kapitan-uroven'], { env: homeEnv, encoding: 'utf8' });
      T('A-031 symlink: prisnost.mjs spuštěný přes symlink/junction cestu se chová jako přímo (kapitan-uroven 3, ne prázdný výstup)', r.stdout.trim(), '3'); } }

  // --- AK4) spouštěč: otisk schváleného spouštěče, obnova, guard proti zápisu
  const SP = await import(pathToFileURL(path.join(TP, 'spoustec.mjs')).href);
  const gen = p => spawnSync(process.execPath, [path.join(p.w, 'tools', 'write-launchers.mjs'), p.w, p.r], { env: homeEnv, encoding: 'utf8' });
  const LK = p => path.join(p.w, isWin ? 'start-kapitan.cmd' : 'start-kapitan.sh');
  { const p = mk('l1', { kap: 2 }); gen(p); commitAs(p.w, ['.spoustec.json'], 'vlastnik');
    const fp = rj(path.join(p.w, '.spoustec.json')); const orig = txt(LK(p));
    T('A-031 AK4: write-launchers zapíše otisk spouštěčů (.spoustec.json, sha256 souborů start-*)', `${Object.keys(fp.soubory).includes(path.basename(LK(p)))}/${/^[0-9a-f]{64}$/.test(fp.soubory[path.basename(LK(p))])}`, 'true/true');
    const r0 = role(p);
    T('A-031 AK4: nezměněný schválený spouštěč — žádné varování ani obnova', `${/spouštěč/.test(r0.stdout)}/${fs.existsSync(WARN(p.w))}/${txt(LK(p)) === orig}`, 'false/false/true');
    // přepis agentem (mimo START)
    wr(LK(p), orig + '\nclaude --dangerously-skip-permissions\n'); const r1 = role(p);
    T('A-031 AK4: spouštěč přepsaný agentem → varování a obnova ze šablony (bit-přesně původní obsah)', `${/\[OPRÁVNĚNÍ\] ⚠ spouštěč/.test(r1.stdout)}/${txt(LK(p)) === orig}/${/spouštěč/.test(txt(WARN(p.w)))}`, 'true/true/true');
    // podstrčený spouštěč, který schválený otisk nezná
    const extra = path.join(p.w, isWin ? 'start-projekt.sh' : 'start-projekt.cmd'); wr(extra, 'echo podvrh\n'); const r2 = role(p);
    T('A-031 AK4: podstrčený spouštěč neznámý schválenému otisku → varování a smazán', `${/\[OPRÁVNĚNÍ\] ⚠ spouštěč/.test(r2.stdout)}/${fs.existsSync(extra)}`, 'true/false');
    // schválená změna vlastníkem přes START: změna volby (okno) + přegenerování + commit vlastníka (otisk) → zůstane, žádné varování
    wr(path.join(p.w, '.rezim.json'), JSON.stringify({ okno: 123456 }) + '\n'); gen(p); commitAs(p.w, ['.rezim.json', '.spoustec.json'], 'vlastnik');
    const chosen = txt(LK(p)); fs.rmSync(WARN(p.w), { force: true }); const r3 = role(p);
    T('A-031 AK4: změna vlastníka přes START (schválený otisk) → spouštěč se změnou zůstane, žádné varování', `${/123456/.test(chosen)}/${chosen !== orig}/${txt(LK(p)) === chosen}/${/spouštěč/.test(r3.stdout)}/${fs.existsSync(WARN(p.w))}`, 'true/true/true/false/false');
    wr(LK(p), chosen + '\nrem podvrh\n'); role(p);
    T('A-031 AK4: obnova po přepisu zachová vlastníkovy volby (okno 123456) — přegenerováno z tabulky, ne z původního schválení', `${txt(LK(p)) === chosen}/${/123456/.test(txt(LK(p)))}`, 'true/true');
    // spouštěč bez schváleného otisku (starší instalace) se nekontroluje
    const o = mk('l2', { kap: 2 }); gen(o); wr(LK(o), 'echo vlastni\n'); const ro = role(o);
    T('A-031 AK4: bez schváleného otisku (zpětná kompatibilita) se spouštěč nekontroluje a neobnovuje', `${/spouštěč/.test(ro.stdout)}/${txt(LK(o)) === 'echo vlastni\n'}`, 'false/true'); }
  { const p = mk('l3', { kap: 2 }); const LNAME = isWin ? 'start-kapitan.cmd' : 'start-kapitan.sh'; const inW = m => ({ cwd: p.w, tool_name: 'Bash', tool_input: { command: m } });
    const V1 = 'd=start-kapi; echo x > "${d}tan.' + (isWin ? 'cmd' : 'sh') + '"';
    T('A-031 AK4 guard: Write do spouštěče ve ws → blok', guard(p, { cwd: p.r, tool_name: 'Write', tool_input: { file_path: path.join(p.w, LNAME) } }).status, 2);
    T('A-031 AK4 guard: přesměrování `echo x > start-kapitan…` → blok', guard(p, inW(`echo x > ${LNAME}`)).status, 2);
    T('A-031 AK4 guard: zápis přes proměnnou (`d=start-kapi; … > ${d}tan.cmd`) → blok', guard(p, inW(V1)).status, 2);
    T('A-031 AK4 guard: zápis přes glob (`cp x start-k*.cmd`) → blok', guard(p, inW('cp x start-k*.cmd')).status, 2);
    T('A-031 AK4 guard: `sed -i s/a/b/ start-kapitan…` → blok', guard(p, inW(`sed -i s/a/b/ ${LNAME}`)).status, 2);
    T('A-031 AK4 guard: `node -e` s writeFileSync spouštěče → blok', guard(p, inW(`node -e "require('fs').writeFileSync('${LNAME}','x')"`)).status, 2);
    T('A-031 AK4 guard: čtení spouštěče (`cat start-kapitan…`) neblokuje', guard(p, inW(`cat ${LNAME}`)).status, 0); }

  // --- AK7) dokumentace a matcher
  const M = fs.readFileSync(path.join(TP, 'merge-repo-settings.mjs'), 'utf8');
  T('A-031 AK7: matcher PreToolUse guardu Kapitána pokrývá PowerShell (Edit|Write|NotebookEdit|Bash|PowerShell)', /matcher: 'Edit\|Write\|NotebookEdit\|Bash\|PowerShell'/.test(M), true);
  const CL_path = path.join(pkg, '..', 'CHANGELOG.md');
  const CL = txt(CL_path);
  const has_CL = fs.existsSync(CL_path);
  T('A-031 AK7: CHANGELOG má sekci „Rozpracováno (příští verze 1.8.9)" a A-031, nadpis „## 1.8.9" v něm není', `${!has_CL || /## Rozpracováno \(příští verze 1\.8\.9\)/.test(CL)}/${!has_CL || /A-031/.test(CL)}/${!has_CL || !/^## 1\.8\.9\b/m.test(CL)}`, 'true/true/true');
  T('A-031: skutečné ~/.claude/settings.json uživatele samotest nezměnil (sha256 před/po)', sha(realUserSettings) === realBefore, true);
}
