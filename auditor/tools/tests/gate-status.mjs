import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';

export function runGateStatus({ T, pkg, tmp, run = spawnSync }) {
  const parent = fs.realpathSync(tmp);
  const base = fs.mkdtempSync(path.join(parent, 'gate-status-'));
  const repo = path.join(base, 'repo'), ws = path.join(base, 'repo-audit'), home = path.join(base, 'home');
  const K = createRequire(import.meta.url)(path.join(pkg, 'kapitan-side', 'kotva.cjs'));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_/i.test(key)) delete env[key];
  Object.assign(env, { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(home, 'gitconfig'), AUDITOR_BEZ_TTY: '1' });
  const options = { cwd: repo, env, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL' };
  const git = args => run('git', args, options);
  const mustGit = args => { const r = git(args); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.error || r.stderr}`); return r.stdout.trim(); };
  const gate = () => run(process.execPath, [path.join(ws, 'kapitan-side', 'gate-check.mjs'), repo], options);
  const outcome = (r, message) => `${r.status}/${message.test(r.stderr || '')}/${/GATE-CHECK PASS:/.test(r.stdout || '')}`;
  try {
    for (const dir of [repo, home, path.join(base, 'empty-template'), path.join(ws, 'AUDIT'), path.join(ws, 'kapitan-side'), path.join(ws, '.claude')]) fs.mkdirSync(dir, { recursive: true });
    mustGit(['init', '-q', '-b', 'test', `--template=${path.join(base, 'empty-template')}`]);
    const text = 'ščřžýáíéúůďťňĚŠČŘŽ\n', readme = path.join(repo, 'README.md');
    fs.writeFileSync(readme, text, 'utf8');
    T('GATE STATUS: diakritika UTF-8 round-trip bitově přesně', fs.readFileSync(readme, 'utf8') === text && fs.readFileSync(readme).equals(Buffer.from(text, 'utf8')), true);
    mustGit(['add', 'README.md']);
    mustGit(['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']);
    for (const file of K.HASHED_FILES) fs.copyFileSync(path.join(pkg, 'kapitan-side', file), path.join(ws, 'kapitan-side', file));
    fs.writeFileSync(path.join(ws, '.claude', 'settings.json'), JSON.stringify({ env: { AUDITOR_TARGET_REPO: repo } }), 'utf8');
    K.writeAnchor(repo, ws);
    const head = mustGit(['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(ws, 'AUDIT', '05_release_gate.md'), `commit ${head}\nVerdikt: 🟢 SMÍ VYDAT\n`, 'utf8');
    T('GATE STATUS: čistý strom → PASS', outcome(gate(), /GATE-CHECK FAIL:/), '0/false/true');
    fs.writeFileSync(readme, text + 'dirty\n', 'utf8');
    T('GATE STATUS: změněný strom → FAIL', outcome(gate(), /pracovní strom není čistý/), '2/true/false');
    fs.writeFileSync(readme, text, 'utf8');

    // Skutečný Git: vadný index shodí status na všech OS, čtení commitů a kotvy dál funguje.
    fs.writeFileSync(path.join(repo, '.git', 'index'), 'invalid index\n', 'utf8');
    const probes = [['rev-parse', 'HEAD'], ['rev-parse', 'HEAD^{tree}'], ['rev-parse', '--show-toplevel'], ['rev-parse', '--git-common-dir'], ['rev-parse', '--path-format=absolute', '--git-common-dir'], ['log', '-1', '--format=%H']];
    T('GATE STATUS: rev-parse/log/cesty i kotva při vadném indexu fungují', `${probes.map(args => git(args).status).join('/')}/${K.verifyAnchor(repo).ok}`, '0/0/0/0/0/0/true');
    const status = git(['status', '--porcelain']);
    T('GATE STATUS: samotný git status skutečně selže', Number.isInteger(status.status) && status.status !== 0 && /index/i.test(status.stderr || ''), true);
    T('GATE STATUS: selhání git status → FAIL s českou hláškou, žádný PASS', outcome(gate(), /GATE-CHECK FAIL: nelze ověřit čistotu pracovního stromu.*git status --porcelain/), '2/true/false');
  } finally {
    if (path.dirname(base) !== parent) throw new Error('Úklid mimo dočasný workspace zakázán');
    fs.rmSync(base, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = [], T = (name, got, exp) => results.push({ name, got, exp, ok: got === exp });
  try { runGateStatus({ T, pkg: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), tmp: os.tmpdir() }); }
  catch (e) { console.error(e); process.exitCode = 1; }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}: ${r.got} (očekáváno ${r.exp})`);
  process.exitCode = process.exitCode || (results.every(r => r.ok) ? 0 : 1);
}
