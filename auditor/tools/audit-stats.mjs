#!/usr/bin/env node
// AUDIT-STATS — statistika auditu: co a kolik auditor prošel, jak dlouho to trvalo a kolik tokenů to stálo.
// node tools/audit-stats.mjs [workspace] [--open]  → AUDIT/STATISTIKA.md + AUDIT/STATISTIKA.html (+ statistika.json)
// Tokeny a čas: přímo z transkriptů Claude Code (~/.claude/projects/<workspace>/**.jsonl, vč. subagentů) — žádný odhad.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync, spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ws = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.AUDITOR_WORKSPACE || path.join(here, '..'));
const unposix = p => (process.platform === 'win32' && /^\/[a-z]\//.test(p)) ? p[1].toUpperCase() + ':' + p.slice(2) : p;
let repo = process.env.AUDITOR_TARGET_REPO ? unposix(process.env.AUDITOR_TARGET_REPO) : '';
try { if (!repo) repo = unposix(JSON.parse(fs.readFileSync(path.join(ws, '.claude', 'settings.json'), 'utf8')).env.AUDITOR_TARGET_REPO); } catch { }
const A = (...p) => path.join(ws, 'AUDIT', ...p); const ex = p => { try { return fs.existsSync(p); } catch { return false; } };
const n = x => Number(x || 0).toLocaleString('cs-CZ');

// 1) Kód: soubory, řádky podle typu (bez node_modules/build/binárek)
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'vendor', '.tmp', '.venv', 'venv', '__pycache__', 'out', 'target']);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|html|css|scss|vue|svelte|cs|java|kt|swift|go|rs|php|rb|sql|prisma|sh|ps1)$/i, DOC = /\.(md|txt|json|ya?ml|toml)$/i;
const code = { files: 0, loc: 0, docs: 0, docLoc: 0, byExt: {}, big: 0 };
const walk = (d, depth = 0) => { if (depth > 12) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (SKIP.has(e.name) || e.isSymbolicLink() || (e.isDirectory() && e.name.startsWith('.'))) continue; const p = path.join(d, e.name); if (e.isDirectory()) { walk(p, depth + 1); continue; } const isC = CODE.test(e.name), isD = DOC.test(e.name); if (!isC && !isD) continue; let t = ''; try { if (fs.statSync(p).size > 3e6) continue; t = fs.readFileSync(p, 'utf8'); } catch { continue; } const l = t.split('\n').length; if (isC) { code.files++; code.loc += l; const x = path.extname(e.name).slice(1).toLowerCase(); code.byExt[x] = (code.byExt[x] || 0) + l; if (l > 1000) code.big++; } else { code.docs++; code.docLoc += l; } } };
if (repo && ex(repo)) walk(repo);
let commits = 0, commit = ''; try { commits = +execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { }

// 2) Výstupy auditu
const ls = d => { try { return fs.readdirSync(d); } catch { return []; } };
const findings = ls(A('01_nalezy')).filter(f => /^A-\d+\.md$/.test(f)).map(f => fs.readFileSync(A('01_nalezy', f), 'utf8'));
const prio = { P0: 0, P1: 0, P2: 0, P3: 0 }; for (const t of findings) { const m = t.match(/\bP([0-3])\b/); if (m) prio['P' + m[1]]++; }
const verd = ls(A('04_verdikty')).filter(f => f.endsWith('.md')).map(f => fs.readFileSync(A('04_verdikty', f), 'utf8'));
const vc = { PASS: 0, SCOPED_PASS: 0, FAIL: 0 }; for (const t of verd) { if (/SCOPED_PASS/.test(t)) vc.SCOPED_PASS++; else if (/\bFAIL\b/.test(t)) vc.FAIL++; else if (/\bPASS\b/.test(t)) vc.PASS++; }
let crawl = null; try { crawl = JSON.parse(fs.readFileSync(A('01_nalezy', 'ui-crawl.ledger.json'), 'utf8')).summary; } catch { }
let probe = null; try { const j = JSON.parse(fs.readFileSync(A('01_nalezy', 'endpoint-probe.json'), 'utf8')); probe = { endpoints: j.endpoints?.length ?? j.summary?.endpoints ?? (Array.isArray(j) ? j.length : null), checks: j.results?.length ?? j.summary?.checks ?? null }; } catch { }
const shots = (() => { let c = 0; const w = d => { for (const e of ls(d)) { const p = path.join(d, e); try { if (fs.statSync(p).isDirectory()) w(p); else if (/\.png$/i.test(e)) c++; } catch { } } }; w(A('01_nalezy')); return c; })();
const bus = ls(A('bus')).filter(f => f.endsWith('.json')).length;
let metrics = null; try { metrics = JSON.parse(spawnSync(process.execPath, [path.join(here, 'bus.mjs'), 'metrics', '--json'], { cwd: ws, encoding: 'utf8' }).stdout || 'null'); } catch { }

// 3) Tokeny a čas z transkriptů Claude Code
const enc = p => p.replace(/[^A-Za-z0-9]/g, '-');
const projRoot = path.join(os.homedir(), '.claude', 'projects');
const dirs = ls(projRoot).filter(d => d.toLowerCase() === enc(ws).toLowerCase()).map(d => path.join(projRoot, d));
const tok = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, byModel: {}, tools: {}, subagentCalls: 0 }; let tMin = Infinity, tMax = 0, sessions = 0, activeMs = 0;
const jsonl = []; const wj = d => { for (const e of ls(d)) { const p = path.join(d, e); try { if (fs.statSync(p).isDirectory()) wj(p); else if (e.endsWith('.jsonl')) jsonl.push(p); } catch { } } }; dirs.forEach(wj);
const seenMsg = new Set();
for (const f of jsonl) {
  sessions++; let last = 0;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line) continue; let r; try { r = JSON.parse(line); } catch { continue; }
    const ts = Date.parse(r.timestamp || ''); if (ts) { tMin = Math.min(tMin, ts); tMax = Math.max(tMax, ts); if (last && ts - last < 10 * 60e3) activeMs += ts - last; last = ts; }
    const m = r.message; if (!m || m.role !== 'assistant' || !m.usage) continue;
    const id = m.id || r.uuid; if (id && seenMsg.has(id)) continue; if (id) seenMsg.add(id);
    const u = m.usage; tok.calls++; tok.input += u.input_tokens || 0; tok.output += u.output_tokens || 0; tok.cacheRead += u.cache_read_input_tokens || 0; tok.cacheWrite += u.cache_creation_input_tokens || 0;
    const mod = (m.model || '?').replace(/^claude-/, ''); const bm = tok.byModel[mod] ||= { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }; bm.calls++; bm.input += u.input_tokens || 0; bm.output += u.output_tokens || 0; bm.cacheRead += u.cache_read_input_tokens || 0; bm.cacheWrite += u.cache_creation_input_tokens || 0;
    if (r.isSidechain) tok.subagentCalls++;
    for (const c of Array.isArray(m.content) ? m.content : []) if (c.type === 'tool_use') tok.tools[c.name] = (tok.tools[c.name] || 0) + 1;
  }
}
const total = tok.input + tok.output + tok.cacheRead + tok.cacheWrite;
const dur = ms => { const h = Math.floor(ms / 36e5), m = Math.round((ms % 36e5) / 6e4); return h ? `${h} h ${m} min` : `${m} min`; };

// 4) Výstup
const S = { vytvoreno: new Date().toISOString(), workspace: ws, repo, commit, kod: code, commity: commits, nalezy: findings.length, priority: prio, verdikty: vc, crawl, probe, screenshoty: shots, zpravy_mostu: bus, metriky_kapitana: metrics,
  cas: { od: isFinite(tMin) ? new Date(tMin).toISOString() : null, do: tMax ? new Date(tMax).toISOString() : null, celkem_ms: isFinite(tMin) ? tMax - tMin : 0, aktivni_ms: activeMs, sessions }, tokeny: { ...tok, celkem: total } };
fs.writeFileSync(A('statistika.json'), JSON.stringify(S, null, 2));
const topExt = Object.entries(code.byExt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${n(v)}`).join(', ');
const md = `# Statistika auditu — ${path.basename(repo || ws)}

**Vygenerováno:** ${new Date().toLocaleString('cs-CZ')} · **Auditovaný commit:** \`${commit || '?'}\`

## Co auditor prošel
| Oblast | Rozsah |
|---|---|
| Zdrojový kód | ${n(code.files)} souborů, **${n(code.loc)} řádků** (${topExt || '—'}) |
| Dokumenty a konfigurace | ${n(code.docs)} souborů, ${n(code.docLoc)} řádků |
| Velké soubory (> 1000 řádků) | ${n(code.big)} |
| Historie gitu | ${n(commits)} commitů |
| Obrazovky a prvky UI | ${crawl ? `${n(crawl.pages?.length ?? crawl.pages)} stránek, ${n(crawl.elements)} prvků (otestováno ${n(crawl.tested)}, přeskočeno s důvodem ${n(crawl.skipped)}, chyb ${n(crawl.fail)})` : 'průchod UI zatím neproběhl'} |
| Endpointy (bezpečnostní sondy) | ${probe ? `${n(probe.endpoints)} endpointů${probe.checks ? `, ${n(probe.checks)} kontrol` : ''}` : 'sondy zatím neproběhly'} |
| Snímky obrazovky (důkazy) | ${n(shots)} |

## Co auditor zjistil
| | Počet |
|---|---|
| Nálezy celkem | **${n(findings.length)}** |
| P0 — kritické (data, bezpečnost) | ${n(prio.P0)} |
| P1 — vážné (nefunkční, oprávnění) | ${n(prio.P1)} |
| P2 — kvalita, UX | ${n(prio.P2)} |
| P3 — kosmetika | ${n(prio.P3)} |
| Ověřené opravy (PASS / dílčí / FAIL) | ${n(vc.PASS)} / ${n(vc.SCOPED_PASS)} / ${n(vc.FAIL)} |
| Zprávy mezi auditorem a Kapitánem | ${n(bus)} |
${metrics && metrics.first_pass_yield != null ? `| Kapitán: oprava napoprvé / falešná „hotovo" | ${Math.round(metrics.first_pass_yield * 100)} % / ${Math.round((metrics.false_done_rate || 0) * 100)} % |\n` : ''}
## Čas
| | |
|---|---|
| Od – do | ${isFinite(tMin) ? `${new Date(tMin).toLocaleString('cs-CZ')} – ${new Date(tMax).toLocaleString('cs-CZ')}` : '—'} |
| Celková doba | ${isFinite(tMin) ? dur(tMax - tMin) : '—'} |
| Čistý čas práce (bez pauz > 10 min) | ${dur(activeMs)} |
| Sessions (vč. subagentů) | ${n(sessions)} |

## Tokeny (přesně z transkriptů Claude Code)
| | Tokeny |
|---|---|
| **Celkem** | **${n(total)}** |
| Vstup (nový) | ${n(tok.input)} |
| Vstup z cache (levný) | ${n(tok.cacheRead)} |
| Zápis do cache | ${n(tok.cacheWrite)} |
| Výstup | ${n(tok.output)} |
| Volání modelu / z toho subagenti | ${n(tok.calls)} / ${n(tok.subagentCalls)} |

| Model | Volání | Vstup | Cache čtení | Výstup |
|---|---|---|---|---|
${Object.entries(tok.byModel).map(([k, v]) => `| ${k} | ${n(v.calls)} | ${n(v.input + v.cacheWrite)} | ${n(v.cacheRead)} | ${n(v.output)} |`).join('\n') || '| — | | | | |'}

Nejpoužívanější nástroje: ${Object.entries(tok.tools).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${n(v)}×`).join(', ') || '—'}

<sub>Cena v Kč/USD záleží na tarifu (předplatné vs. API) — tady jsou jen přesné počty tokenů. Zdroj: ${n(jsonl.length)} transkriptů v ~/.claude/projects.</sub>
`;
fs.writeFileSync(A('STATISTIKA.md'), md);
spawnSync(process.execPath, [path.join(here, 'owner-report.mjs'), ws, '--src', 'STATISTIKA.md', '--out', 'STATISTIKA.html', ...(process.argv.includes('--open') ? ['--open'] : [])], { stdio: 'inherit' });
console.log(`statistika: ${A('STATISTIKA.md')} · kód ${n(code.loc)} ř. · nálezy ${findings.length} · tokeny ${n(total)} · čas ${isFinite(tMin) ? dur(tMax - tMin) : '—'}`);
