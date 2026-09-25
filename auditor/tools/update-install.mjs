#!/usr/bin/env node
// UPDATE-INSTALL — aktualizace UŽ NAINSTALOVANÉHO a rozjetého auditu. Jen vymění nástroje, pravidla, pojistky a nastavení na novou verzi.
// Nic neopakuje: žádný intake, žádné otázky, žádné GitHub kroky, žádné otevírání oken, AUDIT/ (nálezy, verdikty, handoff, zprávy) se nemění.
// node tools/update-install.mjs <repo> <workspace>      (volají INSTALL.cmd, install.sh a průvodce více projekty, když workspace už existuje)
// Co mění: workspace (ústava, checklisty, šablony, nástroje, hooky auditora, settings se ZACHOVANÝM modelem, spouštěče);
//          v repu jen to, co tam instalace už dřív dala (strana Kapitána / zdravý start / pre-commit / CI brána) + commit jen těchto souborů.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process'; import { createHash } from 'node:crypto'; import { fileURLToPath } from 'node:url';
const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(process.argv[2] || ''); const ws = path.resolve(process.argv[3] || `${repo}-audit`);
const say = s => console.log(s); const ok = s => console.log(`  ✅ ${s}`); const warn = s => console.log(`  ⚠ ${s}`);
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const tryRun = (...a) => { try { return run(...a); } catch (e) { return null; } };
const rd = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
if (!fs.existsSync(path.join(ws, '.claude', 'settings.json'))) { console.error(`Auditor v ${ws} ještě není nainstalovaný — použij běžnou instalaci.`); process.exit(3); }
const vers = [...rd(path.join(pkg, '..', 'CHANGELOG.md')).matchAll(/^## (\d+)\.(\d+)\.(\d+)/gm)].map(m => m.slice(1).map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]); const ver = vers.length ? vers.pop().join('.') : 'nová verze';
const name = path.basename(repo);
say(`\n== AKTUALIZACE auditora: ${name} → ${ver}`);
say('   Audit je rozjetý — jen se vymění nástroje, pravidla a nastavení. Nálezy, verdikty, handoff a zprávy zůstávají.\n   Ptám se jen JEDNOU na volby, které jsou v této verzi nové a ještě jsi je neurčil (např. samostatnost Kapitána, Telegram).\n');

// 1) workspace auditora: model ze současného nastavení, pak kopie balíku (AUDIT/ jen chybějící soubory ze šablony)
let model = 'best'; try { model = JSON.parse(rd(path.join(ws, '.claude', 'settings.json')).replace(/^﻿/, '')).model || model; } catch { }
// dřívější výchozí pevné ID modelu → alias „best" (nejlepší dostupný model, posouvá se sám s novými verzemi); jiný výslovně zvolený model zůstává
if (model === 'claude-fable-5-1') { model = 'best'; ok('model auditora: pevné claude-fable-5-1 → alias „best" (nový model se použije sám)'); }
// NÁSTROJE: auditor si smí nástroje v tools/ upravit pro projekt — aktualizace jeho úpravy nesmaže bez zálohy.
//   otisky balíku z minulé instalace (tools/.balik-otisky.json): soubor, který auditor změnil a balík ne → zůstane auditorova verze;
//   změnili oba (nebo chybí otisky a soubor je novější než minulá instalace) → záloha do AUDIT/_nastroje-zaloha/<čas>/ + nová verze balíku + úkol pro auditora.
const sha = f => { try { return createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return ''; } };
const TP = path.join(pkg, 'tools'), TW = path.join(ws, 'tools'), MF = path.join(TW, '.balik-otisky.json');
const walk = (d, pre = '') => { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules') continue; const r = pre ? `${pre}/${e.name}` : e.name; if (e.isDirectory()) o = o.concat(walk(path.join(d, e.name), r)); else o.push(r); } return o; };
const tFiles = fs.existsSync(TP) ? walk(TP) : []; let man = null; try { man = JSON.parse(rd(MF)).soubory || null; } catch { }
const ALWAYS = /^(preflight|usporny-guard|bus|bus-notify|codex-[\w-]+|write-[\w-]+|update-install|selftest|telegram-[\w-]+|kapitan-role|opravneni|wait-idle|merge-repo-settings|trust-folders|guard-check)\.mjs$|^VERZE$/;   // pojistky a spouštění: vždy verze balíku
let lastInst = 0; try { lastInst = fs.statSync(path.join(ws, 'CLAUDE.md')).mtimeMs; } catch { }
const keepTools = new Set(), savedTools = []; const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
for (const rel of tFiles) {
  const dst = path.join(TW, rel); if (!fs.existsSync(dst)) continue; const cur = sha(dst), neu = sha(path.join(TP, rel)); if (cur === neu) continue;
  const base = man ? man[rel] : null;
  const localMod = base ? cur !== base : (lastInst && fs.statSync(dst).mtimeMs > lastInst + 60000);
  if (!localMod) continue;                                                     // neupravený starší soubor → nová verze
  if (base && base === neu && !ALWAYS.test(path.basename(rel))) { keepTools.add(rel); continue; }   // balík ho nezměnil → auditorova úprava zůstává
  const bk = path.join(ws, 'AUDIT', '_nastroje-zaloha', stamp, rel); fs.mkdirSync(path.dirname(bk), { recursive: true }); fs.copyFileSync(dst, bk); savedTools.push(rel);
}
for (const d of ['CLAUDE.md', 'README.md', 'BRIDGE.md', '.claude', 'checklists', 'templates', 'tools', 'kapitan-side', 'starter']) {
  const src = path.join(pkg, d); if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(ws, d), { recursive: true, force: true, filter: s => !/[\\/]node_modules([\\/]|$)/.test(s) && !/Auditor_pruzkum_/.test(s)
    && !(d === 'tools' && keepTools.has(path.relative(TP, s).split(path.sep).join('/'))) });
}
try { fs.writeFileSync(MF, JSON.stringify({ _: 'Otisky nástrojů z balíku (update-install podle nich pozná úpravy auditora). Needitovat.', soubory: Object.fromEntries(tFiles.map(r => [r, sha(path.join(TP, r))])) }, null, 1) + '\n'); } catch { }
if (keepTools.size) ok(`nástroje upravené auditorem ponechány (${keepTools.size}): ${[...keepTools].join(', ')}`);
if (savedTools.length) warn(`upravené nástroje, které nová verze mění (${savedTools.length}), jsou zálohované v AUDIT/_nastroje-zaloha/${stamp}/ — auditor si úpravy přenese (úkol v NOVE_CILE.md)`);
const copyMissing = (src, dst) => { for (const e of fs.readdirSync(src, { withFileTypes: true })) { const s = path.join(src, e.name), d = path.join(dst, e.name); if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyMissing(s, d); } else if (!fs.existsSync(d)) fs.copyFileSync(s, d); } };
if (fs.existsSync(path.join(pkg, 'AUDIT'))) copyMissing(path.join(pkg, 'AUDIT'), path.join(ws, 'AUDIT'));
{ const gi = path.join(ws, '.gitignore'); let g = rd(gi); for (const l of ['AUDIT/bus/.notified-*', '.preflight.json', '.bin/']) if (!g.split(/\r?\n/).includes(l)) g = g.replace(/\s*$/, '\n') + l + '\n'; fs.writeFileSync(gi, g); }
if (!tryRun(process.execPath, [path.join(ws, 'tools', 'write-auditor-settings.mjs'), ws, repo, model])) { console.error('Zápis nastavení auditora selhal.'); process.exit(1); }
tryRun(process.execPath, [path.join(ws, 'tools', 'write-launchers.mjs'), ws, repo]);
ok(`workspace auditora aktualizován (model ${model} zachován, AUDIT/ beze změny)`);
if (!fs.existsSync(path.join(ws, 'tools', 'node_modules'))) warn('nástroje pro testy nejsou nainstalované (cd tools && npm install) — auditor si je doinstaluje, až je bude potřebovat');

// 2) repo: jen to, co tam už je
const H = path.join(repo, '.claude', 'hooks'); const HY = path.join(pkg, 'kapitan-side', 'hygiene'); const changed = [];
const put = (src, rel) => { const dst = path.join(repo, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); const before = rd(dst); fs.copyFileSync(src, dst); if (rd(dst) !== before) changed.push(rel); };
const pre = new Set((tryRun('git', ['status', '--porcelain', '--untracked-files=all'], repo) || '').split('\n').filter(Boolean).map(l => l.slice(3).trim().replace(/^"|"$/g, '')));
const kapitan = fs.existsSync(path.join(H, 'kapitan-audit-guard.js')); const starter = fs.existsSync(path.join(H, 'projekt-guard.js'));
if (kapitan && !fs.existsSync(path.join(ws, '.opravneni.json'))) { if (process.stdin.isTTY) { try { execFileSync(process.execPath, [path.join(pkg, 'tools', 'opravneni.mjs'), ws, repo, '--ask'], { stdio: 'inherit' }); } catch { } } else warn('samostatnost Kapitána zatím nevybrána (OPATRNÝ) — START → [7]'); }
if (kapitan) {
  for (const f of ['kapitan-audit-guard.js', 'gate-check.mjs', 'auditor-bus.mjs']) put(path.join(pkg, 'kapitan-side', f), `.claude/hooks/${f}`);
  const sk = path.join(repo, '.claude', 'skills', 'audit-rezim', 'SKILL.md'); const before = rd(sk); fs.mkdirSync(path.dirname(sk), { recursive: true });
  fs.writeFileSync(sk, '---\nname: audit-rezim\ndescription: Závazný audit režim — stop-the-line při otevřených P0/P1 v AUDIT/02_HANDOFF.md, důkazy do AUDIT/03_dukazy, bus komunikace s auditorem, deploy jen po gate-check. Použij při startu každé dávky.\n---\n' + rd(path.join(pkg, 'kapitan-side', 'AUDIT_REZIM.md')));
  if (rd(sk) !== before) changed.push('.claude/skills/audit-rezim/SKILL.md');
  tryRun(process.execPath, [path.join(ws, 'tools', 'merge-repo-settings.mjs'), repo, ws]); changed.push('.claude/settings.json');
  tryRun(process.execPath, [path.join(ws, 'tools', 'kapitan-role.mjs'), ws, '--claude-md', repo]); changed.push('CLAUDE.md');
  const gy = path.join(repo, '.github', 'workflows', 'auditor-gate.yml'); if (fs.existsSync(gy)) put(path.join(pkg, 'kapitan-side', 'ci', 'auditor-gate.yml'), '.github/workflows/auditor-gate.yml');
  ok('strana Kapitána aktualizována (pojistky, skill audit-rezim, role Kapitána v CLAUDE.md, SessionStart hooky)');
}
if (starter) {
  for (const f of ['projekt-guard.js', 'release-check.mjs', 'session-start.mjs', 'hygiene-all.mjs']) put(path.join(pkg, 'starter', 'claude', 'hooks', f), `.claude/hooks/${f}`);
  const km = path.join(repo, '.claude', 'agents', 'kontrolor.md'); const curModel = (rd(km).match(/^model:\s*(\S+)/m) || [])[1] || model; const before = rd(km);
  fs.mkdirSync(path.dirname(km), { recursive: true }); fs.writeFileSync(km, rd(path.join(pkg, 'starter', 'claude', 'agents', 'kontrolor.md')).replace(/\{\{MODEL\}\}/g, curModel)); if (rd(km) !== before) changed.push('.claude/agents/kontrolor.md');
  for (const f of fs.readdirSync(path.join(pkg, 'starter', 'claude', 'commands'))) { const dst = path.join(repo, '.claude', 'commands', f); const b = rd(dst); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, rd(path.join(pkg, 'starter', 'claude', 'commands', f)).replace(/\{\{SLUG\}\}/g, name)); if (rd(dst) !== b) changed.push(`.claude/commands/${f}`); }
  for (const f of fs.readdirSync(path.join(pkg, 'checklists')).filter(f => f.endsWith('.md') && f !== 'ZDROJE.md')) put(path.join(pkg, 'checklists', f), `.claude/kontrola/checklists/${f}`);
  put(path.join(pkg, 'tools', 'owner-report.mjs'), '.claude/tools/owner-report.mjs');
  ok('zdravý start projektu aktualizován (pojistky, kontrolor, příkazy, checklisty)');
}
if (kapitan || starter) {
  for (const [f, t] of [['hygiene-rules.js'], ['hygiene-rules.json'], ['pre-commit-check.mjs'], ['hooks-package.json', 'package.json']]) put(path.join(HY, f), `.claude/hooks/${t || f}`);
  const pc = path.join(repo, '.git', 'hooks', 'pre-commit'); if (/pre-commit-check/.test(rd(pc))) { fs.copyFileSync(path.join(HY, 'pre-commit-guard.sh'), pc); try { fs.chmodSync(pc, 0o755); } catch { } }
  if (fs.existsSync(path.join(H, 'pre-commit-guard.sh'))) put(path.join(HY, 'pre-commit-guard.sh'), '.claude/hooks/pre-commit-guard.sh');
  // commit jen souborů aktualizace, které uživatel neměl rozdělané už předtím; jeho index se nemění
  // .claude/settings.local.json = místní nastavení tohoto počítače (cesty, oprávnění) → do gitu nepatří; .gitignore doplníme jen když ho uživatel nemá rozdělaný
  { const gi = path.join(repo, '.gitignore'), cur = rd(gi); if (!pre.has('.gitignore') && !/^\/?\.claude\/settings\.local\.json\s*$/m.test(cur)) fs.writeFileSync(gi, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + '# Claude Code – místní nastavení tohoto počítače (auditor)\n.claude/settings.local.json\n'); }
  const dirtyNow = (tryRun('git', ['status', '--porcelain', '--untracked-files=all', '--', '.claude', '.github/workflows/auditor-gate.yml', 'CLAUDE.md', '.gitignore'], repo) || '').split('\n').filter(Boolean).map(l => l.slice(3).trim().replace(/^"|"$/g, '')).filter(f => !/(^|\/)settings\.local\.json$/.test(f));
  const ours = dirtyNow.filter(f => !pre.has(f)); const left = dirtyNow.filter(f => pre.has(f));
  if (ours.length) {
    const gn = (tryRun('git', ['config', 'user.name'], repo) || '').trim() || 'auditor-install', ge = (tryRun('git', ['config', 'user.email'], repo) || '').trim() || 'auditor-install@local';
    const r = tryRun('git', ['-c', `user.name=${gn}`, '-c', `user.email=${ge}`, 'commit', '-q', '--no-verify', '-m', `chore(audit): aktualizace auditora na ${ver}`, '--', ...ours], repo)
      ?? (tryRun('git', ['add', '--', ...ours], repo), tryRun('git', ['-c', `user.name=${gn}`, '-c', `user.email=${ge}`, 'commit', '-q', '--no-verify', '-m', `chore(audit): aktualizace auditora na ${ver}`, '--', ...ours], repo));
    if (r === null) { console.error(`  ❌ aktualizované pojistky se nepodařilo uložit do gitu (${ours.join(', ')}). Pošli tento výpis.`); process.exit(1); }
    ok(`do gitu uloženo ${ours.length} aktualizovaných souborů pojistek`);
  } else ok('pojistky v repu už byly aktuální');
  if (left.length) warn(`neuloženo (měl jsi v nich rozdělané změny, nechávám je tobě): ${left.join(', ')}`);
} else ok('do repa se nesahá (profil jen audit / audit z GitHubu)');

// 2b) Telegram: jen když ho některá role ještě nemá a někdo sedí u počítače (založení bota potřebuje člověka v Telegramu); odmítnutí se pamatuje
{ let tc = {}; try { tc = JSON.parse(rd(path.join(ws, '.telegram.json'))); } catch { }
  const remoteOrCombo = fs.existsSync(path.join(ws, 'AUDIT', '.remote.json')) || fs.existsSync(path.join(ws, 'AUDIT', '.zdravy-start.json'));
  const roles = remoteOrCombo ? ['auditor'] : ['auditor', 'kapitan']; let det = {}; try { det = JSON.parse(execFileSync(process.execPath, [path.join(pkg, 'tools', 'telegram-setup.mjs'), '--ws', ws, '--repo', repo, '--detect'], { encoding: 'utf8' })); } catch { }   // skutečný stav na TOMTO počítači (token existuje?)
  const missing = roles.filter(r => tc[r]?.mode !== 'odmitnuto' && !(det[r]?.mode === 'channel' || (det[r]?.mode === 'vlastni' && det[r].volba)));   // vlastní most bez volby → jednou nabídnout standardního bota
  if (missing.length && process.stdin.isTTY) { try { execFileSync(process.execPath, [path.join(pkg, 'tools', 'telegram-setup.mjs'), '--ws', ws, '--repo', repo, '--role', missing.length === 2 ? 'obe' : missing[0]], { stdio: 'inherit' }); } catch { warn('nastavení Telegramu se nedokončilo — kdykoliv znovu: START → [6]'); } }
  else if (missing.length) warn('Telegram pro ' + missing.join(' a ') + ' zatím není — START → [6]');
  else ok('Telegram: ' + roles.map(r => `${r} ${det[r]?.mode === 'channel' ? '@' + (det[r].bot || tc[r]?.bot || 'bot') : det[r]?.mode === 'vlastni' ? 'vlastní most projektu' : 'vypnuto'}`).join(', '));
  tryRun(process.execPath, [path.join(ws, 'tools', 'write-launchers.mjs'), ws, repo]); }
// 2a2) Codex: role, které vlastník přepnul do Codexu (START → [8]), dostanou obnovené pojistky, AGENTS.md a otisky — bez otázek
{ let ag = null; try { ag = JSON.parse(rd(path.join(ws, '.agents.json'))); } catch { }
  if (ag && (ag.auditor === 'codex' || ag.kapitan === 'codex')) { tryRun(process.execPath, [path.join(ws, 'tools', 'codex-setup.mjs'), '--ws', ws, '--repo', repo, '--auditor', ag.auditor, '--kapitan', ag.kapitan, '--yes']);
    ok(`Codex: ${[ag.auditor === 'codex' && 'auditor', ag.kapitan === 'codex' && 'Kapitán'].filter(Boolean).join(' a ')} — pojistky a pravidla obnoveny`); } }

// 2c) NOVÉ CÍLE AUDITU (delta): žádný audit od začátku — jen cíle přidané novými verzemi, které tento audit ještě nemá
{ const bf = path.join(ws, 'AUDIT', '.balik.json'); let b = {}; try { b = JSON.parse(rd(bf)); } catch { }
  let cile = []; try { cile = JSON.parse(rd(path.join(pkg, 'templates', 'cile_auditu.json'))).cile || []; } catch { }
  const rozjety = ['00_intake.md', '02_HANDOFF.md', '05_release_gate.md', 'ZPRAVA.md', 'ZPRAVA.html'].some(f => fs.existsSync(path.join(ws, 'AUDIT', f))) || (() => { try { return fs.readdirSync(path.join(ws, 'AUDIT', '01_nalezy')).some(f => /^A-\d+\.md$/.test(f)); } catch { return false; } })();   // rozjetý = cokoliv z výsledků auditu existuje
  const hotove = new Set(b.hotove || []); const nf = path.join(ws, 'AUDIT', 'NOVE_CILE.md');
  const pending = rozjety ? cile.filter(c => !hotove.has(c.id) && !(c.hotovo_kdyz || []).some(f => fs.existsSync(path.join(ws, f)))) : [];
  if (savedTools.length && rozjety) pending.push({ id: `NASTROJE-${stamp}`, od_verze: ver, cil: `přenést tvoje úpravy nástrojů (${savedTools.join(', ')}) — aktualizace je nahradila novou verzí, tvoje verze leží v AUDIT/_nastroje-zaloha/${stamp}/`,
    postup: 'porovnej zálohu s novou verzí; úpravy, které projekt dál potřebuje, dej do tools/mistni/ (kopie nástroje + změna) — tam aktualizace nesahá; nové opravy z balíku neztrať.', naklady: 'malé (jen porovnání dvou verzí)' });
  if (pending.length) {
    fs.writeFileSync(nf, `# Nové cíle auditu po aktualizaci na ${ver}\n\nAudit je rozjetý — **nic neopakuj od začátku** (intake, průchody, nálezy, verdikty zůstávají platné).\nUdělej jen tyto cíle, v tomto pořadí, v nejmenším nutném rozsahu. Hotový cíl zapiš do \`AUDIT/.balik.json\` → \`hotove\` a řádek tady odškrtni.\nAž budou všechny hotové, tento soubor smaž a pokračuj v běžné práci (ověřování oprav Kapitána).\n\n` +
      pending.map(c => `- [ ] **${c.id}** (od ${c.od_verze}) — ${c.cil}. Postup: ${c.postup} _Náklady: ${c.naklady}._`).join('\n') + '\n');
    ok(`nové cíle auditu k doplnění: ${pending.length} (AUDIT/NOVE_CILE.md) — zbytek auditu se neopakuje`);
  } else { if (fs.existsSync(nf) && !rozjety) fs.unlinkSync(nf); ok(rozjety ? 'nové cíle auditu: žádné — audit pokračuje beze změny' : 'audit ještě nezačal — proběhne celý podle aktuální verze'); }
  fs.writeFileSync(bf, JSON.stringify({ ...b, verze: ver, predchozi: b.verze || null, aktualizovano: new Date().toISOString(), hotove: [...hotove] }, null, 2) + '\n'); }

// 3) kontrola a konec — bez otevírání oken
tryRun(process.execPath, [path.join(ws, 'tools', 'trust-folders.mjs'), ws, repo]);
say('\n  Probíhá závěrečná kontrola (samotest, na Windows 1–3 min) — nic nedělej, počkej na „AKTUALIZOVÁNO"...');
const st = (() => { try { return { ok: true, out: execFileSync(process.execPath, [path.join('tools', 'selftest.mjs')], { cwd: ws, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; } })();
const sum = (st.out.match(/\d+\/\d+ PASS.*/) || [''])[0];
if (!st.ok) { console.error(`  ❌ SAMOTEST NEPROŠEL po aktualizaci (${sum}). Pošli tento výpis:\n${st.out.split('\n').filter(l => /^FAIL/.test(l)).join('\n')}`); process.exit(1); }
ok(`samotest ${sum}`);
say(`\n================ AKTUALIZOVÁNO: ${name} (${ver}) ================`);
say('  Audit pokračuje tam, kde byl. Nic se neopakuje, intake ani instalace znovu neproběhnou.');
say('  Nové nastavení se načte, až okna auditora a Kapitána příště otevřeš. Běžící okna nech doběhnout, pak je zavři');
say(`  a spusť znovu ze složky ${ws}\n  (start-auditor${process.platform === 'win32' ? '.cmd' : '.sh'} a start-kapitan${process.platform === 'win32' ? '.cmd' : '.sh'}): auditor naváže na rozjetý audit, Kapitán dostane zprávy od auditora.`);
if (process.stdin.isTTY && !process.env.AUDITOR_NO_OPEN) { try { if (process.platform === 'win32') execFileSync('explorer', [ws], { stdio: 'ignore' }); else execFileSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [ws], { stdio: 'ignore', timeout: 5000 }); say('  (Otevřel jsem ti tu složku se spouštěči.)'); } catch { } }
