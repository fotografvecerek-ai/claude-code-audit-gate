// A-026 (1.8.9): testy kotvy důvěry — stavy kotvy (fail-closed), dvě repa, kanonizace cest, obchvaty guardu a skutečný
// push do bare origin (X28/X28b/X29/P19/P21 + legitimní 🟢/🔴). Volá se z selftest.mjs (sdílí jeho T, env a pomocníky).
// Pozor: tenhle soubor schválně neobsahuje doslovný název kotvy vedle zápisu do souboru — guard by ho jako uložený skript
// (oprávněně) zablokoval; název se skládá z KOTVA.ANCHOR_FILE.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { pathToFileURL } from 'node:url';

const RED = '🔴 NESMÍ VYDAT', GREEN = '🟢 SMÍ VYDAT';

export function runA026(ctx) {
  const { T, KOTVA, pkg, tmp, git, isWin, norm, gitBash, env, hook, bash, write, KG, setupWsSide, DNES, wt } = ctx;
  const AF = KOTVA.ANCHOR_FILE; const G = 'git';
  const base = path.join(tmp, 'a026'); fs.mkdirSync(base, { recursive: true });
  const gate = (w, verdikt, sha = 'neexistujiciHash') => fs.writeFileSync(path.join(w, 'AUDIT', '05_release_gate.md'), `# Release gate — ${DNES}\nAuditovaný commit: \`${sha.slice(0, 7)}\`\nVerdikt: ${verdikt}\n`);
  const mkRepo = name => { const r = path.join(base, name); fs.mkdirSync(r, { recursive: true }); git('init -q -b main', r); git('config user.email t@t', r); git('config user.name t', r); fs.writeFileSync(path.join(r, 'a.txt'), name); git('add -A', r); git('commit -qm c1', r); return r; };
  const mkWs = (name, r) => { const w = path.join(base, name); fs.mkdirSync(path.join(w, 'AUDIT'), { recursive: true }); setupWsSide(w, r); gate(w, RED); return w; };
  const guard = (cwd, command) => spawnSync(process.execPath, [KG], { input: JSON.stringify(bash(cwd, command)), env, encoding: 'utf8' });
  const GC = path.join(pkg, 'kapitan-side', 'gate-check.mjs');
  const gc = (r, extra = {}) => spawnSync(process.execPath, [GC, r], { env: { ...env, ...extra }, encoding: 'utf8' }).status;
  const stav = d => KOTVA.verifyAnchor(d).stav || 'ok';

  // --- 1) stavy kotvy: každý vadný stav = fail-closed (guard i gate-check), hláška vede na START → [9]
  const r1 = mkRepo('r1'), w1 = mkWs('r1-audit', r1);
  T('A-026 kotva CHYBÍ → stav chybi', stav(r1), 'chybi');
  let g = guard(r1, `${G} push origin main`);
  T('A-026 kotva CHYBÍ → push main blokován (fail-closed)', g.status, 2);
  T('A-026 kotva CHYBÍ → hláška vede na START → [9]', /START → \[9\]/.test(g.stderr || ''), true);
  T('A-026 kotva CHYBÍ → push na feature větev dál povolen (migrace neblokuje běžnou práci)', guard(r1, `${G} push origin feat/x`).status, 0);
  fs.writeFileSync(KOTVA.anchorPath(r1), '{nejde');
  T('A-026 kotva POŠKOZENÁ (ne-JSON) → stav poskozena', stav(r1), 'poskozena');
  T('A-026 kotva POŠKOZENÁ → push main blokován', guard(r1, `${G} push origin main`).status, 2);
  fs.writeFileSync(KOTVA.anchorPath(r1), JSON.stringify({ verze: 1, repo: r1, workspace: w1, hashe: {} }));
  T('A-026 kotva s neplatným obsahem (bez otisků) → stav poskozena', stav(r1), 'poskozena');
  KOTVA.writeAnchor(r1, w1);
  T('A-026 kotva založená vlastníkem → stav ok', stav(r1), 'ok');
  fs.renameSync(path.join(w1, 'AUDIT'), path.join(w1, 'AUDIT-pryc'));
  T('A-026 ws z kotvy NEEXISTUJE → stav ws-chybi', stav(r1), 'ws-chybi');
  T('A-026 ws z kotvy neexistuje → push main blokován', guard(r1, `${G} push origin main`).status, 2);
  fs.renameSync(path.join(w1, 'AUDIT-pryc'), path.join(w1, 'AUDIT'));
  const gcW1 = path.join(w1, 'kapitan-side', 'gate-check.mjs'); const gcOrig = fs.readFileSync(gcW1, 'utf8');
  fs.writeFileSync(gcW1, gcOrig + '\n// podvrh\n');
  T('A-026 gate-check.mjs ve ws změněn po schválení → stav hash', stav(r1), 'hash');
  T('A-026 hash nesedí → push main blokován i se zelenou branou', (gate(w1, GREEN, git('rev-parse HEAD', r1)), guard(r1, `${G} push origin main`).status), 2);
  T('A-026 hash nesedí → gate-check FAIL', gc(r1), 2);
  // legitimní aktualizace (update-install / nová verze gate-check) = vlastník znovu zapíše kotvu → otisk obnoven
  KOTVA.writeAnchor(r1, w1);
  T('A-026 legitimní nová verze gate-check + obnovená kotva → stav ok', stav(r1), 'ok');
  T('A-026 obnovená kotva + 🟢 pro HEAD → push main povolen', guard(r1, `${G} push origin main`).status, 0);
  gate(w1, RED);
  T('A-026 obnovená kotva + 🔴 → push main blokován', guard(r1, `${G} push origin main`).status, 2);
  fs.writeFileSync(gcW1, gcOrig); KOTVA.writeAnchor(r1, w1);

  // --- 2) dvě repa: kotvu repa A nejde přesměrovat na ws repa B
  const r2 = mkRepo('r2'), w2 = mkWs('r2-audit', r2); KOTVA.writeAnchor(r2, w2);
  gate(w2, GREEN, git('rev-parse HEAD', r1)); gate(w1, RED);
  fs.copyFileSync(KOTVA.anchorPath(r2), KOTVA.anchorPath(r1));
  T('A-026 dvě repa: kotva repa B zkopírovaná do repa A → stav jine-repo', stav(r1), 'jine-repo');
  T('A-026 dvě repa: kotva repa B v repu A → push main blokován', guard(r1, `${G} push origin main`).status, 2);
  fs.writeFileSync(KOTVA.anchorPath(r1), JSON.stringify({ ...KOTVA.buildAnchor(r1, w2) }));
  T('A-026 dvě repa: kotva A ukazuje na ws repa B → stav ws-cizi', stav(r1), 'ws-cizi');
  T('A-026 dvě repa: kotva A → ws B (zelený pro A) → push main blokován', guard(r1, `${G} push origin main`).status, 2);
  KOTVA.writeAnchor(r1, w1);
  // X32: přímé spuštění gate-check — ws z env ignorován, rozhoduje kotva
  T('A-026 X32: gate-check s AUDITOR_WORKSPACE=zelený cizí ws → dál FAIL (ws z kotvy je 🔴)', gc(r1, { AUDITOR_WORKSPACE: norm(w2) }), 2);
  T('A-026 X32: gate-check z kopie ve ws (samo-lokalizace) s env na zelený ws → dál FAIL', spawnSync(process.execPath, [gcW1, r1], { env: { ...env, AUDITOR_WORKSPACE: norm(w2) }, encoding: 'utf8' }).status, 2);
  const nastav = (extra, ws2 = w1) => spawnSync(process.execPath, [path.join(pkg, 'tools', 'kotva.mjs'), 'nastav', '--repo', r1, '--ws', ws2], { env: { ...env, ...extra }, encoding: 'utf8' });
  const before = fs.readFileSync(KOTVA.anchorPath(r1), 'utf8');
  T('A-026 kotva.mjs nastav pod AUDITOR_BEZ_TTY=1 → odmítnuto', nastav({ AUDITOR_BEZ_TTY: '1' }, w2).status !== 0, true);
  T('A-026 kotva.mjs nastav pod CLAUDECODE=1 → odmítnuto', nastav({ AUDITOR_BEZ_TTY: '', CLAUDECODE: '1' }, w2).status !== 0, true);
  T('A-026 kotva.mjs nastav pod CLAUDE_CODE_ENTRYPOINT → odmítnuto', nastav({ AUDITOR_BEZ_TTY: '', CLAUDECODE: '', CLAUDE_CODE_ENTRYPOINT: 'cli' }, w2).status !== 0, true);
  // neinteraktivní běh (CI, instalátor -Yes, stdin i stdout přesměrované) nesmí čekat na konzoli: Windows CONIN$ jde otevřít a čtení by viselo
  const bezZakazu = { AUDITOR_BEZ_TTY: '', CLAUDECODE: '', CLAUDE_CODE_ENTRYPOINT: '' };
  const rychle = extra => { const t0 = Date.now(); const r = spawnSync(process.execPath, [path.join(pkg, 'tools', 'kotva.mjs'), 'nastav', '--repo', r1, '--ws', w1, '--instalace'], { env: { ...env, ...bezZakazu, ...extra }, input: '', encoding: 'utf8', timeout: 30000 }); return { ...r, ms: Date.now() - t0 }; };
  fs.rmSync(KOTVA.anchorPath(r1));   // bez kotvy → nastav by se ptal vlastníka (založení kotvy)
  const ci = rychle({ CI: '1' }), bezTty = rychle({ CI: '' }), vznikla = fs.existsSync(KOTVA.anchorPath(r1));
  fs.writeFileSync(KOTVA.anchorPath(r1), before);
  T('A-026 kotva.mjs nastav --instalace s CI=1 / bez TTY → odmítnuto do 10 s (nečeká na konzoli), kotva nevznikla', `${ci.status !== 0 && !ci.error}/${ci.ms < 10000}/${bezTty.status !== 0 && !bezTty.error}/${bezTty.ms < 10000}/${vznikla}`, 'true/true/true/true/false');
  const pz26 = spawnSync(process.execPath, ['--input-type=module', '-e', `import { ttyConfirm, ttyAvailable } from ${JSON.stringify(pathToFileURL(path.join(pkg, 'tools', 'prisnost.mjs')).href)}; const c = ttyConfirm('test?'); console.log(JSON.stringify({ ok: c.ok, d: c.duvod, a: ttyAvailable() }));`], { env: { ...env, ...bezZakazu, CI: '' }, input: '', encoding: 'utf8', timeout: 30000 });
  const pzr = (() => { try { return JSON.parse(pz26.stdout.trim().split('\n').pop()); } catch { return {}; } })();
  T('A-026 ttyConfirm bez TTY (stdin i stdout přesměrované, bez CI) → odmítnutí hned, ttyAvailable false', `${!pz26.error}/${pzr.ok}/${/neinteraktivní/.test(pzr.d || '')}/${pzr.a}`, 'true/false/true/false');
  T('A-026 odmítnuté nastav kotvu nezměnilo', fs.readFileSync(KOTVA.anchorPath(r1), 'utf8'), before);
  T('A-026 kotva.mjs nastav na ws cizího repa → odmítnuto i bez zákazu (ws patří jinému repu)', /jinému repu/.test(nastav({ AUDITOR_BEZ_TTY: '1' }, w2).stderr || ''), true);

  // --- 3) kanonizace cest (Windows: velikost písmen, lomítka, git-bash /c/…) a vedlejší worktree
  T('A-026 kanonizace: git-bash cesta /c/… = nativní cesta', KOTVA.canon(gitBash(r1)), KOTVA.canon(r1));
  T('A-026 kanonizace: zpětná vs dopředná lomítka', KOTVA.canon(r1.replace(/\\/g, '/')), KOTVA.canon(r1.replace(/\//g, path.sep)));
  if (isWin) {
    T('A-026 kanonizace (Windows): jiná velikost písmen = stejná cesta', KOTVA.canon(r1.toUpperCase()), KOTVA.canon(r1));
    const a = JSON.parse(fs.readFileSync(KOTVA.anchorPath(r1), 'utf8'));
    fs.writeFileSync(KOTVA.anchorPath(r1), JSON.stringify({ ...a, repo: a.repo.toUpperCase().replace(/\\/g, '/'), workspace: a.workspace.toLowerCase() }));
    T('A-026 kanonizace (Windows): kotva s jinou velikostí písmen a lomítky → stav ok', stav(r1), 'ok');
    KOTVA.writeAnchor(r1, w1);
  }
  T('A-026 vedlejší worktree sdílí kotvu hlavního repa → stav ok', stav(wt), 'ok');

  // --- 4) obchvaty guardu: kotva a vnitřek .git nedotknutelné (i přes proměnnou, glob, backtick, inline skript, uložený skript, symlink)
  const r = ctx.repo; fs.mkdirSync(path.join(r, '.tmp', 'tasks', 'K-1'), { recursive: true });
  const blok = [
    ['H04 here-string', `bash <<< "${G} push origin main"`],
    ['H07 příkaz v proměnné $x', `x="${G} push origin main"; $x`],
    ['H10 xargs sh -c', `echo '${G} push origin main' | xargs -I{} sh -c '{}'`],
    ['H11 heredoc do souboru + sh soubor', `cat <<EOF > .tmp/tasks/K-1/p.sh\n${G} push origin main\nEOF\nsh .tmp/tasks/K-1/p.sh`],
    ['H16 cp do settings přes proměnnou', 'd=.cla; cp .tmp/tasks/K-1/s.json ${d}ude/settings.json'],
    ['H17 -c core.hooksPath', `${G} -c core.hooksPath=/dev/null push origin main`],
    ['N15 alias v -c', `${G} -c alias.p=push p origin main`],
    ['N15 alias přes --config-env', `${G} --config-env=alias.p=X p origin main`],
    ['zápis kotvy přímo', `echo {} > .git/${AF}`],
    ['zápis kotvy přes $d', `d=.git; echo {} > $d/${AF}`],
    ['zápis kotvy přes ${D}', `D=.git; cp .tmp/tasks/K-1/k.json \${D}/${AF}`],
    ['zápis kotvy globem', `cp .tmp/tasks/K-1/k.json .git/${AF.slice(0, 11)}*`],
    ['zápis hooku globem .gi?', 'cp .tmp/tasks/K-1/h .gi?/hooks/pre-push'],
    ['zápis kotvy přes backtick rev-parse', `echo {} > \`${G} rev-parse --git-common-dir\`/${AF}`],
    ['zápis hooku přes $(rev-parse)', `echo x > "$(${G} rev-parse --git-dir)/hooks/pre-push"`],
    ['node -e se skládáním řetězce', `node -e "require('fs').writeFileSync('.g'+'it/'+'aud'+'itor-kot'+'va.json','{}')"`],
    ['python -c se skládáním řetězce', `python -c "open('.gi'+'t/hooks/pre-push','w').write('x')"`],
    ['ln -s na kotvu', `ln -sf .git/${AF} .tmp/tasks/K-1/k.json`],
    ['git config --file do .git/config', `${G} config --file .git/config core.hooksPath .tmp/h`],
    ['git config --file na kotvu', `${G} config --file .git/${AF} a.b c`],
    ['git config core.hooksPath', `${G} config core.hooksPath .tmp/h`],
    ['kotva.mjs nastav z agenta', 'node auditor/tools/kotva.mjs nastav --repo .'],
    ['vypnutí AUDITOR_BEZ_TTY', 'env -u AUDITOR_BEZ_TTY node auditor/tools/kotva.mjs stav'],
    ['přepsání CLAUDECODE', 'CLAUDECODE= node x.mjs'],
    ['unset CLAUDE_CODE_ENTRYPOINT', 'unset CLAUDE_CODE_ENTRYPOINT; node x.mjs'],
  ];
  for (const [n, c] of blok) T(`A-026 guard blokuje: ${n}`, hook(KG, bash(r, c)), 2);
  // uložený skript: obsah vzniklý dřív (ne v tomtéž příkazu) s názvem kotvy a zápisem
  fs.writeFileSync(path.join(r, '.tmp', 'tasks', 'K-1', 'w.mjs'), `import fs from 'node:fs'; fs.writeFileSync('.git/' + '${AF}', '{}');\n`);
  T('A-026 guard blokuje: uložený skript se zápisem kotvy (node soubor)', hook(KG, bash(r, 'node .tmp/tasks/K-1/w.mjs')), 2);
  for (const [n, f] of [['Write na kotvu', path.join(r, '.git', AF)], ['Write do .git/hooks/pre-push', path.join(r, '.git', 'hooks', 'pre-push')], ['Write do .git/config', path.join(r, '.git', 'config')], ['Write na kotvu git-bash cestou', gitBash(path.join(r, '.git', AF))]])
    T(`A-026 guard blokuje: ${n}`, hook(KG, write(r, f)), 2);
  const volno = [
    ['F01 heredoc do .md s textem push', `cat <<EOF > .tmp/tasks/K-1/notes.md\n${G} push origin main je zakazano\nEOF`],
    ['F02 heredoc | grep', `cat <<EOF | grep push\n${G} push origin main\nEOF`],
    ['F03 bash -c npm test', 'bash -c "npm test"'],
    ['F04 heredoc | sh s neškodným obsahem', `cat <<EOF | sh\necho ahoj\n${G} status\nEOF`],
    ['F05 commit -F - s heredoc', `${G} commit -F - <<EOF\nfix: neco\n\npush origin main pozdeji\nEOF`],
    ['F06 push na feature větev', `${G} push origin feat/a`],
    ['kotva.mjs stav', 'node auditor/tools/kotva.mjs stav'],
    ['čtení .git/HEAD', 'cat .git/HEAD'],
    ['smazání .git/index.lock', 'rm -f .git/index.lock'],
    ['git status / log', `${G} status && ${G} log --oneline -3`],
    ['git config --get', `${G} config --get user.name`],
    ['echo s textem o kotvě', 'echo "kotvu zapíše vlastník přes START → [9]"'],
  ];
  for (const [n, c] of volno) T(`A-026 guard NEblokuje (falešná blokace = 0): ${n}`, hook(KG, bash(r, c)), 0);

  // --- 5) skutečný push do bare origin přes nainstalovaný pre-push (.sh wrapper → .mjs → kotva → gate-check ws)
  const e2e = path.join(base, 'e2e'); const origin = path.join(e2e, 'origin.git'), app = path.join(e2e, 'app');
  fs.mkdirSync(origin, { recursive: true }); git('init -q --bare -b main', origin);
  spawnSync(G, ['clone', '-q', norm(origin), norm(app)], { encoding: 'utf8' });
  git('config user.email t@t', app); git('config user.name t', app); git('checkout -q -b main', app);
  const appHooks = path.join(app, '.claude', 'hooks'); fs.mkdirSync(appHooks, { recursive: true });
  for (const f of ['pre-push-guard.mjs', 'gate-check.mjs', 'kotva.cjs']) fs.copyFileSync(path.join(pkg, 'kapitan-side', f), path.join(appHooks, f));
  fs.mkdirSync(path.join(app, '.git', 'hooks'), { recursive: true });
  fs.copyFileSync(path.join(pkg, 'kapitan-side', 'pre-push-guard.sh'), path.join(app, '.git', 'hooks', 'pre-push'));
  if (!isWin) fs.chmodSync(path.join(app, '.git', 'hooks', 'pre-push'), 0o755);
  fs.writeFileSync(path.join(app, '.git', 'info', 'exclude'), '.tmp/\n');
  fs.writeFileSync(path.join(app, 'a.txt'), '1'); git('add -A', app); git('commit -qm c1', app);
  const appWs = mkWs('e2e-audit', app); KOTVA.writeAnchor(app, appWs);
  const fake = path.join(app, '.tmp', 'tasks', 'K-1', 'fws'); fs.mkdirSync(path.join(fake, 'kapitan-side'), { recursive: true }); fs.mkdirSync(path.join(fake, 'AUDIT'), { recursive: true });
  fs.writeFileSync(path.join(fake, 'kapitan-side', 'gate-check.mjs'), 'process.exit(0)\n'); fs.writeFileSync(path.join(fake, 'kapitan-side', 'kotva.cjs'), '');
  const originSha = () => { try { return git('rev-parse refs/heads/main', origin); } catch { return ''; } };
  const pushEnv = { ...process.env, AUDITOR_WORKSPACE: undefined, AUDITOR_TARGET_REPO: undefined, PROD_BRANCHES: undefined, GATE_MAX_AGE_H: undefined };
  const push = (refspec = 'main', extra = {}) => spawnSync(G, ['push', 'origin', refspec], { cwd: app, encoding: 'utf8', env: { ...pushEnv, ...extra } });
  const blocked = (name, refspec, extra) => { const o = originSha(); const p = push(refspec, extra); T(`A-026 e2e skutečný push: ${name} → odmítnut, origin beze změny`, `${p.status !== 0}/${originSha() === o}`, 'true/true'); };
  const head = () => git('rev-parse HEAD', app);

  gate(appWs, GREEN, head());
  T('A-026 e2e skutečný push: legitimní 🟢 pro tlačený commit → povolen, origin posunut', `${push().status}/${originSha() === head()}`, `0/true`);
  fs.writeFileSync(path.join(app, 'a.txt'), '2'); git('commit -qam c2', app); gate(appWs, RED);
  blocked('legitimní 🔴', 'main');
  // X28: podvrh HEAD:.claude/settings.json plumbingem (hash-object + update-index + commit), ws → falešný s gate-check exit 0
  const cfgFake = JSON.stringify({ env: { AUDITOR_WORKSPACE: norm(fake), AUDITOR_TARGET_REPO: norm(app), GATE_MAX_AGE_H: '99999' } });
  const h = spawnSync(G, ['hash-object', '-w', '--stdin'], { cwd: app, input: cfgFake, encoding: 'utf8' }).stdout.trim();
  git(`update-index --add --cacheinfo 100644,${h},.claude/settings.json`, app); git('commit -qm "chore: x"', app);
  gate(fake, GREEN, head());
  blocked('X28 (forge-k3: settings.json podvržený plumbingem, falešný ws)', 'main');
  T('A-026 e2e X28: guard push main (podvržený HEAD settings) → blokován', hook(KG, bash(app, `${G} push origin main`)), 2);
  // X28b: podvrh přímo v pracovním stromu + commit + env na falešný ws
  git('reset -q --hard HEAD~1', app); fs.mkdirSync(path.join(app, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(app, '.claude', 'settings.json'), cfgFake); git('add -A', app); git('commit -qm "chore: y"', app); gate(fake, GREEN, head());
  blocked('X28b (settings.json commitnutý + env AUDITOR_WORKSPACE na falešný ws)', 'main', { AUDITOR_WORKSPACE: norm(fake) });
  // X29: commitnutý PROD_BRANCHES bez "release" — release je dál chráněná (kotva bez PROD_BRANCHES = výchozí)
  fs.writeFileSync(path.join(app, '.claude', 'settings.json'), JSON.stringify({ env: { PROD_BRANCHES: '^zzz_nikdy$' } })); git('commit -qam "chore: z"', app);
  blocked('X29 (commitnutý PROD_BRANCHES=^zzz, push na release)', 'HEAD:refs/heads/release');
  blocked('X29 (commitnutý PROD_BRANCHES=^zzz, push na main)', 'main');
  // P21: podvržené env na zelený cizí ws, skutečná brána 🔴
  blocked('P21 (env AUDITOR_WORKSPACE na zelený cizí ws)', 'main', { AUDITOR_WORKSPACE: norm(fake), AUDITOR_TARGET_REPO: norm(app) });
  // P19: 🟢 pro HEAD main, ale tlačí se jiný commit (feature) do main
  git('reset -q --hard origin/main', app); fs.writeFileSync(path.join(app, 'a.txt'), '3'); git('commit -qam c3', app); gate(appWs, GREEN, head());
  git('checkout -q -b feat/p19', app); fs.writeFileSync(path.join(app, 'b.txt'), 'x'); git('add -A', app); git('commit -qm feat', app);
  const featSha = head(); git('checkout -q main', app);
  blocked('P19 (🟢 pro main HEAD, tlačí se feature commit do main)', `${featSha}:refs/heads/main`);
  T('A-026 e2e skutečný push: legitimní 🟢 po obchvatech → povolen, origin posunut', `${push().status}/${originSha() === head()}`, '0/true');
  T('A-026 e2e skutečný push: feature větev bez brány → povolen', push('feat/p19').status, 0);
}
