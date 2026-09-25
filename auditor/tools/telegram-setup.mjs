#!/usr/bin/env node
// TELEGRAM-SETUP — vlastní Telegram bot pro auditora a pro Kapitána (každý svůj), napojený přímo do jejich okna Claude Code.
// Mechanismus: oficiální kanál Claude Code (plugin telegram@claude-plugins-official, spouští se `claude --channels …`). Zpráva z Telegramu
// přijde rovnou do běžícího okna (i nečinného) a agent odpovídá zpět do Telegramu. Každý bot má vlastní složku stavu
// (TELEGRAM_STATE_DIR = ~/.claude/channels/telegram-<projekt>-<role>/: token, povolený uživatel), takže se boti nepletou.
// Nezávislé na prostředí: žádné názvy počítačů, žádné osobní skripty. Složka stavu = projekt + otisk jeho cesty + role (dva projekty
// stejného jména se nepletou); na jiném počítači se bot nastaví znovu (token je vždy jen na počítači, kde okno běží).
// Kapitán: když projekt UŽ MÁ vlastní Telegram most (skripty/hooky s „telegram"), ten se nemění. Standardní bot se mu přesto nabídne
//          (doporučeno) — je to JINÝ bot, s vlastním mostem se nehádá, a funguje vždy. Volbu „jen vlastní most" si pamatuje (volba: vlastni).
//          Když už má bota založeného tímto nástrojem, nové okno na něj naváže (převezme ho od starého okna).
// node tools/telegram-setup.mjs --ws <workspace> --repo <repo> [--role auditor|kapitan|obe] [--yes] [--detect] [--agent] [--kapitan-most standard|vlastni] [--test]
//   --agent  spouští průvodce v okně Claude Code (templates/pruvodce_telegram.md): bez otázek v terminálu, token přes okénko, čeká na spárování
//   --detect  jen vypíše JSON se stavem (nic nemění) · --yes  bez otázek (chybějícího bota nezakládá — to vyžaduje člověka v Telegramu)
//   --kapitan-most  volba pro projekt s vlastním mostem (bez otázky) · --test  pošle každému botovi zkušební zprávu vlastníkovi
// Výsledek: <workspace>/.telegram.json (bez tajemství) → tools/write-launchers.mjs podle něj přidá do spouštěčů kanál a složku stavu.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import readline from 'node:readline';
import { execFileSync, spawnSync, exec } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import crypto from 'node:crypto';
const a = process.argv; const val = k => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : ''; }; const flag = k => a.includes(k);
const ws = path.resolve(val('--ws') || '.'); const repo = path.resolve(val('--repo') || path.join(ws, '..', path.basename(ws).replace(/-audit$/, '')));
const roleArg = val('--role') || 'obe'; const AGENT = flag('--agent'); const YES = !AGENT && (flag('--yes') || !process.stdin.isTTY); const DETECT = flag('--detect');
const isWin = process.platform === 'win32'; const slug = path.basename(repo).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projekt';
const PLUGIN = 'telegram@claude-plugins-official';
const home = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const realp = p => { try { return fs.realpathSync.native(p); } catch { return p; } };
const hid = crypto.createHash('sha1').update(realp(repo).replace(/\\/g, '/').toLowerCase()).digest('hex').slice(0, 6);
const stateDirOf = role => path.join(home, 'channels', `telegram-${slug}-${hid}-${role}`);
// boti z 1.4.0 mají složku zapsanou v .telegram.json (stateDir) — ta má vždy přednost; cizí složku stejného jména bez otisku NIKDY nepřebíráme
const KMOST = ['standard', 'vlastni'].includes(val('--kapitan-most')) ? val('--kapitan-most') : ''; const TEST = flag('--test');
const cfgFile = path.join(ws, '.telegram.json');
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { }
const say = s => console.log(s); const ok = s => console.log(`  ✅ ${s}`); const warn = s => console.log(`  ⚠ ${s}`);
const has = c => { try { execFileSync(isWin ? 'where' : 'which', [c], { stdio: 'ignore' }); return true; } catch { return false; } };
const rl = (YES || AGENT) ? null : readline.createInterface({ input: process.stdin, output: process.stdout });   // --agent: spouští agent Claude Code za člověka (bez terminálu); otázky = výchozí odpověď, token přes okénko
const ask = (q, def) => new Promise(r => { if (!rl) return r(def); rl.question(q, x => r(x.trim() || def)); });
const openUrl = u => { try { exec(isWin ? `start "" "${u}"` : process.platform === 'darwin' ? `open "${u}"` : `xdg-open "${u}"`); } catch { } };
const tg = async (token, method, body) => { const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return r.json(); };
const readEnvToken = dir => { try { return (fs.readFileSync(path.join(dir, '.env'), 'utf8').match(/^TELEGRAM_BOT_TOKEN=(.+)$/m) || [])[1]?.trim() || ''; } catch { return ''; } };

// ---------- zjištění stávajícího stavu
function detectCustomBridge(dir) {
  const hits = []; const look = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { if (/^(node_modules|\.git|\.venv|venv|dist|build|out|archive|backup.*)$/i.test(e.name)) continue; const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 2 && /^(scripts|tools|bin|server|\.claude|hooks|infra)$/i.test(e.name)) look(p, depth + 1);
      else if (e.isFile() && /telegram/i.test(e.name) && /\.(py|js|mjs|ts|ps1|bat|cmd|sh)$/i.test(e.name)) hits.push(path.relative(dir, p)); } };
  look(dir, 0);
  for (const f of ['.mcp.json', '.claude/settings.json', '.claude/settings.local.json']) { try { if (/telegram/i.test(fs.readFileSync(path.join(dir, f), 'utf8')) && !fs.readFileSync(path.join(dir, f), 'utf8').includes(PLUGIN)) hits.push(f); } catch { } }
  return hits.filter(h => !/auditor-bus|bus-notify/.test(h));
}
// jeden bot = jedno okno: tokeny, které už používá JINÁ složka stavu (druhá role, jiný projekt), se nesmí použít znovu
function tokensElsewhere(ownDir, onlyRegistered = false) {
  const used = new Map(); const own = path.resolve(ownDir); let es = [];
  if (!onlyRegistered) try { es = fs.readdirSync(path.join(home, 'channels'), { withFileTypes: true }); } catch { }
  for (const e of es) { const d = path.join(home, 'channels', e.name); if (e.isDirectory() && path.resolve(d) !== own) { const t = readEnvToken(d); if (t) used.set(t, e.name); } }
  for (const r of ['auditor', 'kapitan']) { const d = cfg[r]?.stateDir; if (d && path.resolve(d) !== own) { const t = readEnvToken(d); if (t) used.set(t, r); } }
  return used;
}
function state(role, { fix = false } = {}) {
  const c = cfg[role]; const sd = stateDirOf(role);
  for (const d of [...new Set([c?.mode === 'channel' ? c.stateDir : '', sd].filter(Boolean))]) {   // bot sdílený s jiným oknem = neplatný (např. omylem vložený token druhé role)
    const reg = c?.mode === 'channel' && c.stateDir && path.resolve(c.stateDir) === path.resolve(d);   // zapsaný v .telegram.json = platí (ustoupí jen jinému zapsanému)
    const t = readEnvToken(d); if (!t) continue; const kdo = tokensElsewhere(d, reg).get(t);
    if (!kdo) return { mode: 'channel', stateDir: d, bot: c?.bot, ...(c?.allowFrom ? { allowFrom: c.allowFrom } : {}) };
    if (fix && path.resolve(d) === path.resolve(sd)) { for (const f of ['.env', 'access.json']) { try { fs.unlinkSync(path.join(d, f)); } catch { } } warn(`${role}: ve složce byl token bota, kterého už používá ${kdo} — smazáno, zadáš token nového bota`); }
  }
  if (role === 'kapitan') { const hits = c?.mode === 'vlastni' ? (c.soubory || []) : detectCustomBridge(repo); if (hits.length || c?.mode === 'vlastni') return { mode: 'vlastni', soubory: hits.slice(0, 8), ...(c?.volba ? { volba: c.volba } : {}) }; }
  return { mode: 'zadny', budouciSlozka: stateDirOf(role) };
}
const roles = roleArg === 'obe' ? ['auditor', 'kapitan'] : [roleArg];
if (DETECT) { const o = {}; for (const r of roles) o[r] = state(r); console.log(JSON.stringify(o, null, 2)); process.exit(0); }
if (TEST) { const ping = path.join(path.dirname(fileURLToPath(import.meta.url)), 'telegram-ping.mjs');
  for (const r of roles) { const st = state(r); if (st.mode !== 'channel') { say(`  ${r}: standardní bot není (${st.mode})`); continue; }
    const p = spawnSync(process.execPath, [ping, st.stateDir, r, slug, '--test'], { encoding: 'utf8' }); say(`  ${r}: ${(p.stdout || p.stderr || '').trim() || 'bez odpovědi'}`); }
  process.exit(0); }

// ---------- předpoklady kanálu: Bun + plugin (lokálně jen pro danou složku, ne do všech projektů)
function ensureBun() {
  const bunBin = path.join(os.homedir(), '.bun', 'bin'); process.env.PATH = bunBin + path.delimiter + process.env.PATH;
  if (has('bun')) return true;
  say('  Instaluji Bun (potřebuje ho Telegram kanál Claude Code)...');
  const r = isWin ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm bun.sh/install.ps1 | iex'], { stdio: 'inherit' })
    : spawnSync('bash', ['-c', 'curl -fsSL https://bun.sh/install | bash'], { stdio: 'inherit' });
  return r.status === 0 && (has('bun') || fs.existsSync(path.join(bunBin, isWin ? 'bun.exe' : 'bun')));
}
function ensurePlugin(dir) {
  if (!has('claude')) { warn('Claude Code (příkaz claude) nenalezen — plugin nainstaluj později: claude plugin install ' + PLUGIN); return false; }
  const run = args => spawnSync('claude', args, { cwd: dir, encoding: 'utf8', shell: isWin, timeout: 180000 });
  run(['plugin', 'marketplace', 'add', 'anthropics/claude-plugins-official']);
  const r = run(['plugin', 'install', PLUGIN, '--scope', 'local']);
  const en = run(['plugin', 'enable', PLUGIN, '--scope', 'local']);   // install nemusí plugin v této složce zapnout (ověřeno v praxi) — zapnout výslovně
  if (en.status === 0 || /already enabled/i.test(String(en.stdout) + String(en.stderr))) { ok(`Telegram kanál zapnutý pro ${path.basename(dir)} (jen tato složka)`); return true; }
  if (r.status === 0 || /already|již|installed/i.test(String(r.stdout) + String(r.stderr))) { ok(`Telegram kanál zapnutý pro ${path.basename(dir)} (jen tato složka)`); return true; }
  warn(`plugin se nepodařilo nainstalovat (${String(r.stderr || r.stdout).trim().split('\n').pop()}) — v okně Claude Code: /plugin install ${PLUGIN}`); return false;
}
async function readToken(label) {
  if (process.platform === 'darwin' && (AGENT || !process.stdin.isTTY)) { const r = spawnSync('osascript', ['-e', `tell application "System Events" to activate`, '-e', `tell application "System Events" to text returned of (display dialog "Vlož token bota pro ${label} od @BotFather" default answer "" with hidden answer with title "Telegram")`], { encoding: 'utf8' }); return String(r.stdout || '').trim(); }
  if (process.platform === 'linux' && (AGENT || !process.stdin.isTTY)) { for (const [c, args] of [['zenity', ['--password', '--title', `Telegram - ${label}`]], ['kdialog', ['--password', `Token bota pro ${label}`]]]) { if (has(c)) return String(spawnSync(c, args, { encoding: 'utf8' }).stdout || '').trim(); }
    const f = path.join(stateDirOf('token-drop'), 'token.txt'); fs.mkdirSync(path.dirname(f), { recursive: true }); say(`  Okénko pro token tu není — ulož token do souboru ${f} (jen token) a spusť znovu.`); try { const t = fs.readFileSync(f, 'utf8').trim(); fs.unlinkSync(f); return t; } catch { return ''; } }
  if (isWin) {   // vlastní okénko VŽDY NAVRCHU (TopMost) uprostřed obrazovky — InputBox se schovával pod ostatní okna
    say('  >>> Okénko na token je uprostřed obrazovky, NAVRCHU nad ostatními okny (titulek „Telegram - token"). <<<');
    const q = t => t.replace(/'/g, "''");
    const ps = [`Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [Windows.Forms.Application]::EnableVisualStyles()`,
      `$f = New-Object Windows.Forms.Form; $f.Text = 'Telegram - token (${q(label)})'; $f.TopMost = $true; $f.StartPosition = 'CenterScreen'; $f.ClientSize = New-Object Drawing.Size(560, 150)`,
      `$f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.MinimizeBox = $false; $f.ShowInTaskbar = $true; $f.Font = New-Object Drawing.Font('Segoe UI', 10)`,
      `$l = New-Object Windows.Forms.Label; $l.Text = '${q(`Vlož token bota pro ${label} od @BotFather (dlouhý text s dvojtečkou, např. 123456789:AAH...) a klikni OK.`)}'; $l.SetBounds(12, 10, 536, 44)`,
      `$t = New-Object Windows.Forms.TextBox; $t.SetBounds(12, 60, 536, 28)`,
      `$ok = New-Object Windows.Forms.Button; $ok.Text = 'OK'; $ok.SetBounds(362, 104, 90, 32); $ok.DialogResult = 'OK'`,
      `$cn = New-Object Windows.Forms.Button; $cn.Text = 'Zrušit'; $cn.SetBounds(458, 104, 90, 32); $cn.DialogResult = 'Cancel'`,
      `$f.Controls.AddRange(@($l, $t, $ok, $cn)); $f.AcceptButton = $ok; $f.CancelButton = $cn`,
      `$f.Add_Shown({ $f.TopMost = $true; $f.Activate(); $f.BringToFront(); $t.Focus() })`,
      `if ($f.ShowDialog() -eq [Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($t.Text.Trim()) }`].join('\n');
    const r = spawnSync('powershell', ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { encoding: 'utf8' }); return String(r.stdout || '').trim(); }
  return new Promise(res => { const out = process.stdout; out.write(`Vlož token bota pro ${label} (nebude vidět) a Enter: `); const i = readline.createInterface({ input: process.stdin, output: null, terminal: true });
    i.question('', t => { i.close(); out.write('\n'); res(t.trim()); }); });
}
async function createBot(role) {
  const label = role === 'auditor' ? `auditora (${slug})` : `Kapitána (${slug})`; const sd = stateDirOf(role);
  say(`\n== Telegram bot pro ${label}`);
  say('  1. Otevírám v Telegramu @BotFather. Pošli mu: /newbot');
  say(`  2. Jméno: ${role === 'auditor' ? 'Auditor' : 'Kapitán'} ${slug}   Uživatelské jméno (musí končit na „bot"): ${slug.replace(/-/g, '_')}_${role}_bot`);
  say('     (když je obsazené, přidej číslo, např. …_2_bot)');
  say('  3. BotFather pošle token (dlouhý řetězec s dvojtečkou) — zkopíruj ho a vlož do okénka, které se otevře.');
  openUrl('https://t.me/BotFather');
  let token = '', me = null;
  for (let i = 0; i < 3 && !me; i++) { token = await readToken(label); if (!token) { warn('nic nevloženo — Telegram pro ' + label + ' přeskakuji (spustíš později: START → [6])'); return null; }
    const kdo = tokensElsewhere(sd).get(token);
    if (kdo) { warn(`tohle je token bota, kterého už používá ${kdo} — potřebuju token NOVÉHO bota (u @BotFather /newbot; token je ve zprávě „Done! Congratulations…"). Zkus znovu`); continue; }
    try { const r = await tg(token, 'getMe'); if (r.ok) me = r.result; else warn('token nefunguje (' + (r.description || 'neznámá chyba') + ') — zkus znovu'); } catch (e) { warn('Telegram není dostupný (' + e.message + ')'); return null; } }
  if (!me) return null;
  fs.mkdirSync(sd, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(sd, '.env'), `TELEGRAM_BOT_TOKEN=${token}\n`, { mode: 0o600 });
  ok(`bot @${me.username} ověřen, token uložen mimo projekt (${sd})`);
  // spárování bez příkazů: vlastník pošle botovi zprávu, zachytíme jeho číselné ID a povolíme jen jeho
  say(`  4. Napiš teď botovi @${me.username} v Telegramu cokoliv (třeba „ahoj"). Čekám až 5 minut...`); openUrl(`https://t.me/${me.username}`);
  await tg(token, 'deleteWebhook', { drop_pending_updates: false }).catch(() => { });
  let from = null, offset = 0; const until = Date.now() + 5 * 60e3;
  while (!from && Date.now() < until) { let r; try { r = await tg(token, 'getUpdates', { timeout: 25, offset, allowed_updates: ['message'] }); } catch { await new Promise(s => setTimeout(s, 3000)); continue; }
    for (const u of r.result || []) { offset = u.update_id + 1; const m = u.message; if (m && m.chat?.type === 'private' && m.from && !m.from.is_bot) from = m.from; } }
  if (offset) await tg(token, 'getUpdates', { offset, timeout: 0 }).catch(() => { });   // potvrdit přečtení, ať se „ahoj" nedoručí agentovi
  if (!from) { warn('zpráva nepřišla — bot je připravený, spárování proběhne v okně agenta: pošli botovi zprávu, dostaneš kód a v okně napiš /telegram:access pair <kód>'); return { mode: 'channel', stateDir: sd, bot: me.username }; }
  fs.writeFileSync(path.join(sd, 'access.json'), JSON.stringify({ dmPolicy: 'allowlist', allowFrom: [String(from.id)], groups: {}, pending: {} }, null, 2) + '\n', { mode: 0o600 });
  await tg(token, 'sendMessage', { chat_id: from.id, text: `✅ ${role === 'auditor' ? 'Auditor' : 'Kapitán'} projektu ${slug} je napojený. Zprávy sem půjdou přímo do jeho okna (jen od tebe) — odpovídat začne, až jeho okno spustíš (start-*.cmd).` }).catch(() => { });
  ok(`spárováno s ${from.first_name || 'tebou'} (ID ${from.id}); jiným lidem bot neodpovídá`);
  return { mode: 'channel', stateDir: sd, bot: me.username, allowFrom: [String(from.id)] };
}

// ---------- hlavní průběh
say('\n== Telegram: vlastní bot pro auditora a pro Kapitána');
for (const role of roles) {
  const st = state(role, { fix: true }); const who = role === 'auditor' ? 'Auditor' : 'Kapitán';
  if (st.mode === 'channel') { ok(`${who}: bot @${st.bot || '?'} už existuje — nové okno na něj naváže (převezme ho od starého okna)`); cfg[role] = st; continue; }
  if (st.mode === 'vlastni') {
    const vl = `projekt má vlastní Telegram most (${st.soubory.slice(0, 3).join(', ') || 'dřívější volba'})`;
    let volba = KMOST || st.volba || '';
    if (!volba && !YES) { say(`\n  ${who}: ${vl}. Ten zůstává, jak je — ale jestli doručuje zprávy, závisí na nastavení projektu (počítač, skripty).`);
      volba = (await ask('  [1] přidat standardního bota (doporučeno: jiný bot, s mostem projektu se nehádá, zprávy chodí přímo do okna na každém počítači)\n  [2] jen vlastní most projektu\n  → Enter = 1: ', '1')) === '2' ? 'vlastni' : 'standard'; }
    if (volba !== 'standard') { ok(`${who}: ${vl} — používá se jen ten${volba ? '' : ' (standardního bota přidáš přes START → [6])'}`); cfg[role] = { ...st, ...(volba ? { volba } : {}) }; continue; }
    if (YES) { warn(`${who}: standardního bota založíš přes START → [6] (potřebuje tebe v Telegramu); zatím jen vlastní most`); cfg[role] = st; continue; }
    say(`  ${who}: ${vl} — zůstává; navíc dostane standardního bota.`); }
  else if (YES) { warn(`${who}: Telegram zatím nemá — založení bota potřebuje tebe v Telegramu; spusť START → [6]`); cfg[role] = { mode: 'zadny' }; continue; }
  if (st.mode !== 'vlastni') { const q = await ask(`${who} zatím nemá Telegram. Založit mu vlastního bota (zprávy půjdou přímo do jeho okna)? [1] ano (doporučeno)  [2] ne  → Enter = 1: `, '1');
    if (q !== '1') { cfg[role] = { mode: 'odmitnuto' }; continue; } }
  if (!ensureBun()) { warn('Bun se nepodařilo nainstalovat — bez něj Telegram kanál nepoběží. Instalace: https://bun.sh'); cfg[role] = st.mode === 'vlastni' ? { ...st, volba: 'standard' } : { mode: 'zadny' }; continue; }
  ensurePlugin(role === 'auditor' ? ws : repo);
  cfg[role] = (await createBot(role)) || (st.mode === 'vlastni' ? { ...st, volba: 'standard' } : { mode: 'zadny' });   // volba zůstává: příště rovnou k založení bota, bez otázky
}
fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, _: 'Telegram napojení (bez tajemství; token je ve složce stateDir mimo projekt). Spravuje tools/telegram-setup.mjs.' }, null, 2) + '\n');
spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'write-launchers.mjs'), ws, repo], { stdio: 'ignore' });
const sBot = Object.entries(cfg).filter(([k, v]) => ['auditor', 'kapitan'].includes(k) && v?.mode === 'channel').map(([k]) => k === 'auditor' ? 'auditora' : 'Kapitána');
say(sBot.length ? `\n  DALŠÍ KROK: bot odpovídá jen oknu, které se s ním spustí. Běží-li okno ${sBot.join(' nebo ')}, zavři ho; pak ve složce\n  ${ws}\n  spusť ${cfg.auditor?.mode === 'channel' ? 'start-auditor' : ''}${cfg.auditor?.mode === 'channel' && cfg.kapitan?.mode === 'channel' ? ' a ' : ''}${cfg.kapitan?.mode === 'channel' ? 'start-kapitan' : ''} (${isWin ? '.cmd' : '.sh'}). Bot ti napíše „🟢 … se spouští" — teprve pak mu piš.` : '  Spouštěče aktualizované.');
if (sBot.length && (AGENT || !YES) && !process.env.AUDITOR_NO_OPEN) { try { if (isWin) spawnSync('explorer', [ws], { stdio: 'ignore' }); else spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [ws], { stdio: 'ignore', timeout: 5000 }); say('  (Otevřel jsem ti tu složku se spouštěči.)'); } catch { } }
rl?.close();
