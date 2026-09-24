#!/usr/bin/env node
// BUILD-ENV — auditorova vlastní testovací instance aplikace (nikdy Kapitánův dev server, nikdy produkce).
//   node tools/build-env.mjs up   [--ref <commit|branch>] [--port 3100]   klon/aktualizace do build/<repo>, checkout ref, install, .env z AUDIT/.auth/.env.audit, start dev serveru na pozadí
//   node tools/build-env.mjs down                                          zastaví dev server spuštěný tímto skriptem (PID v build/.devserver.pid) — nikdy cizí procesy
//   node tools/build-env.mjs status                                        běží? na jakém portu/commitu?
// Pravidla: .env.audit dodá vlastník (TESTOVACÍ DB/účty — auditor ho nevytváří z produkčních hodnot); port jiný než Kapitánův (výchozí 3100);
// baseUrl v tools/audit.config.json musí odpovídat. Klon je jen ke čtení a testům (hook blokuje commit/push v build/).
import fs from 'node:fs'; import path from 'node:path'; import { spawn, execSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ws = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const repo = process.env.AUDITOR_TARGET_REPO;
if (!repo) { console.error('AUDITOR_TARGET_REPO není nastaven'); process.exit(1); }
const args = process.argv.slice(2); const cmd = args[0]; const opt = k => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
const name = path.basename(repo); const dir = path.join(ws, 'build', name); const pidFile = path.join(ws, 'build', '.devserver.pid'); const logFile = path.join(ws, 'build', `${name}.dev.log`);
const port = opt('--port') || process.env.AUDIT_PORT || '3100'; const envSrc = path.join(ws, 'AUDIT', '.auth', '.env.audit');
const sh = (c, cwd = dir) => execSync(c, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const pm = () => fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : 'npm';

if (cmd === 'up') {
  fs.mkdirSync(path.join(ws, 'build'), { recursive: true });
  if (!fs.existsSync(dir)) { console.log(`clone → ${dir}`); execSync(`git clone --quiet "${repo}" "${dir}"`, { stdio: 'inherit' }); } else { sh('git fetch --quiet --all'); }
  const ref = opt('--ref') || sh('git rev-parse --abbrev-ref HEAD', repo); sh(`git checkout --quiet --force ${ref}`); try { sh('git pull --quiet --ff-only'); } catch { }
  console.log(`checkout ${ref} @ ${sh('git rev-parse --short HEAD')}`);
  if (!fs.existsSync(envSrc)) { console.error(`CHYBÍ ${envSrc}\n→ požádej vlastníka o .env pro TESTOVACÍ prostředí (oddělená DB, testovací účty A/B, žádné produkční klíče). Bez něj instanci nespouštěj.`); process.exit(3); }
  const txt = fs.readFileSync(envSrc, 'utf8');
  if (!/^AUDIT_ENV_OK=1/m.test(txt)) { console.error('.env.audit musí obsahovat řádek AUDIT_ENV_OK=1 — potvrzení vlastníka, že jde o TESTOVACÍ prostředí.'); process.exit(3); }
  const risky = txt.match(/^(?:STRIPE_SECRET_KEY=sk_live_|NEXT_PUBLIC_STRIPE\w*=pk_live_|NODE_ENV=production|VERCEL_ENV=production|\w*SERVICE_ROLE\w*=)/gm); if (risky) { console.error(`.env.audit obsahuje produkční/privilegované hodnoty: ${risky.join(', ')} — auditor s nimi instanci nespustí.`); process.exit(3); }
  fs.copyFileSync(envSrc, path.join(dir, '.env.local')); fs.copyFileSync(envSrc, path.join(dir, '.env'));
  console.log(`${pm()} install …`); execSync(`${pm()} install --silent`, { cwd: dir, stdio: 'inherit' });
  const devCmd = fs.existsSync(path.join(dir, 'package.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts?.dev ? `${pm()} run dev` : (fs.existsSync(path.join(dir, 'build_html.py')) ? `python build_html.py && npx http-server . -p ${port}` : null);
  if (!devCmd) { console.error('nenalezen dev skript ani build_html.py — doplň ručně'); process.exit(3); }
  if (!devCmd.includes('run dev')) console.error('VAROVÁNÍ: stack bez `dev` skriptu — ověř, že aplikace .env skutečně načítá (statická HTML appka typicky žádný .env nečte; testovací data řeš jinak).');
  const out = fs.openSync(logFile, 'a'); const child = spawn(devCmd, { cwd: dir, shell: true, detached: true, stdio: ['ignore', out, out], env: { ...process.env, PORT: port, NEXT_TELEMETRY_DISABLED: '1' } });
  child.unref(); fs.writeFileSync(pidFile, String(child.pid)); console.log(`dev server PID ${child.pid} na portu ${port}, log ${logFile}. Do tools/audit.config.json nastav baseUrl http://localhost:${port}. Ověř: curl -sI http://localhost:${port}`);
} else if (cmd === 'down') {
  if (!fs.existsSync(pidFile)) { console.log('nic nespuštěno tímto skriptem'); process.exit(0); }
  const pid = +fs.readFileSync(pidFile, 'utf8');
  // ověř, že PID je stále náš dev server (ochrana proti recyklaci PID) — Linux/WSL přes /proc, jinde podle názvu procesu
  let mine = true; try { if (fs.existsSync(`/proc/${pid}/cmdline`)) mine = /dev|http-server|next|node|pnpm|npm/i.test(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')); else if (process.platform === 'win32') mine = /node|cmd|pnpm|npm/i.test(execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' })); } catch { mine = false; }
  if (!mine) { console.error(`PID ${pid} už není náš dev server — nezabíjím. Smaž ${pidFile} ručně.`); process.exit(3); }
  try { process.platform === 'win32' ? execSync(`taskkill /PID ${pid} /T /F`) : process.kill(-pid, 'SIGTERM'); console.log(`zastaven PID ${pid}`); } catch (e) { console.log('proces už neběží'); } fs.unlinkSync(pidFile);
} else if (cmd === 'status') {
  const pid = fs.existsSync(pidFile) ? +fs.readFileSync(pidFile, 'utf8') : null; let alive = false; if (pid) { try { process.kill(pid, 0); alive = true; } catch { } }
  console.log(JSON.stringify({ dir, exists: fs.existsSync(dir), commit: fs.existsSync(dir) ? sh('git rev-parse --short HEAD') : null, pid, alive, port, log: logFile }));
} else { console.error('up | down | status'); process.exit(1); }
