#!/usr/bin/env node
// EFFICIENCY AUDIT — read-only měření pro checklist EFEKTIVITA.
// Použití:
//   node tools/efficiency-audit.mjs context <repo> [--harness claude|codex|all] # inventura kontextu obou harnessů
//   node tools/efficiency-audit.mjs usage <repo> [--days 7] [--harness claude|codex|all] # kompatibilní Claude usage; Codex explicit unknown
//   node tools/efficiency-audit.mjs churn <repo> [--days 30]  # rework ratio a churn řádků z git logu
//   node tools/efficiency-audit.mjs modules <repo>            # soubory/funkce nad prahy modularizace
//   node tools/efficiency-audit.mjs all <repo> > AUDIT/06_efektivita_raw.json
// Odhad tokenů ≈ znaky/4 (pro CZ text spíš /3.5) — je to odhad, přesná čísla dává /cost a usage.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { auditConfiguration } from './configuration-audit.mjs';

const [cmd, repoArg, ...rest] = process.argv.slice(2);
if (!cmd || !repoArg) { console.error('usage: efficiency-audit.mjs <context|usage|churn|modules|all> <repo> [--days N]'); process.exit(1); }
const repo = path.resolve(repoArg);
const days = Number((rest.join(' ').match(/--days\s+(\d+)/) || [])[1] || (cmd === 'churn' ? 30 : 7));
const tok = s => Math.round(s.length / 3.7);
const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const sh = (c, cwd = repo) => { try { return execSync(c, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 }); } catch { return ''; } };
const walk = (dir, filter, out = [], depth = 0) => {
  if (depth > 8) return out;
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.isSymbolicLink()) continue;
    if (['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'playwright-report', 'test-results', 'vendor', '.venv', 'venv', 'www', '__pycache__', '.tmp', 'tmp', 'temp', '.cache', 'third_party', '_deps'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out, depth + 1); else if (filter(p)) out.push(p);
  }
  return out;
};

function context(harness = 'claude') {
  const one = selectedHarness => {
    const audit = auditConfiguration(repo, { harness: selectedHarness, includeShared: true });
    const items = audit.inventory.map(entry => {
      const kind = entry.kind === 'instruction' ? selectedHarness === 'codex' ? 'agents_md' : 'claude_md'
        : entry.kind === 'rule' ? entry.scope === 'user' ? 'rule_user' : 'rule'
          : entry.kind === 'skill' ? entry.scope === 'user' ? 'skill_user' : 'skill'
            : entry.kind;
      const loadNote = entry.activation === 'not-loaded' ? 'Nad kořenem repozitáře; Codex ji od cwd na úrovni repozitáře nenačítá.'
        : entry.activation === 'excluded' || entry.state === 'shadowed' ? 'Vyloučeno: instrukci přebíjí soubor s vyšší prioritou.'
        : entry.scoped === true ? 'Scoped: paths; tokeny nejsou započtené do always-loaded odhadu.'
        : ['instruction', 'rule'].includes(entry.kind) ? `${entry.scope}; efektivní načtení hostitelem neověřeno.`
          : `${entry.scope}; konfigurace sama nedokazuje aktivaci ani použití.`;
      return { kind, file: entry.path, lines: entry.lines ?? 0, tokens_est: entry.tokensEstimate ?? 0, note: loadNote, state: entry.state, activation: entry.activation, usage: entry.usage, scoped: entry.scoped ?? null };
    });
    const alwaysKinds = new Set(['instruction', 'rule']);
    const total = audit.inventory.filter(entry => alwaysKinds.has(entry.kind) && entry.scoped !== true && !['excluded', 'not-loaded'].includes(entry.activation) && entry.state !== 'shadowed' && entry.tokensEstimate != null)
      .reduce((sum, entry) => sum + entry.tokensEstimate, 0);
    const mcp = {};
    for (const item of audit.inventory.filter(entry => entry.kind === 'mcp-server')) (mcp[item.path] ||= []).push(item.name);
    const verdict = audit.completeness !== 'scanned' ? '⚪' : total > 12000 ? '🔴' : total > 6000 ? '🟡' : '🟢';
    return {
      repo, harness: selectedHarness, always_loaded_tokens_est: total, verdict, mcp_servers: mcp, items,
      configuration: { harness: selectedHarness, completeness: audit.completeness, activation: 'unknown', usage: 'unknown', inventory_count: audit.counts.inventory, limitations: audit.limitations },
      coverage: { context_estimate: audit.completeness === 'scanned' ? 'estimated' : 'partial', activation: 'unknown', usage: 'unknown', scoped_rules_excluded: audit.inventory.filter(item => item.kind === 'rule' && item.scoped === true).length },
      note: 'Odhad vychází z deklarovaných instrukcí; hostitelské načtení, efektivní aktivace a použití zůstávají neznámé. MCP servery jsou uvedené podle názvu bez odhadu ceny schémat.',
    };
  };
  if (harness === 'all') {
    const claude = one('claude'); const codex = one('codex');
    return {
      ...claude, harness: 'all',
      legacy_fields_scope: 'claude-subtotal',
      always_loaded_tokens_scope: 'claude-subtotal', items_scope: 'claude-subtotal',
      verdict_scope: 'claude-subtotal', mcp_servers_scope: 'claude-subtotal',
      claudeSubtotal: { always_loaded_tokens_est: claude.always_loaded_tokens_est, verdict: claude.verdict, mcp_servers: claude.mcp_servers, item_count: claude.items.length },
      harnesses: { claude, codex }, coverage: { harnesses: { claude: claude.coverage, codex: codex.coverage }, effectiveActivation: 'unknown' },
      note: `${claude.note} Pole na nejvyšší úrovni jsou kvůli kompatibilitě pouze mezisoučtem Claude; Codex je uveden samostatně v harnesses.codex.`,
    };
  }
  return one(harness);
}

function usage(harness = 'claude') {
  if (harness === 'codex') return { harness, status: 'unknown', days, project_dirs: [], per_model: null, sessions: null, tool_calls: null, reason: 'Pro tuto verzi není kompatibilní Codex usage telemetrie zapojena; Claude logy se nepoužívají jako náhrada.' };
  if (harness === 'all') return { harness, claude: usage('claude'), codex: usage('codex'), status: 'mixed-coverage' };
  // Claude Code ukládá session logy do ~/.claude/projects/<slug>/*.jsonl; slug = cesta repa s nahrazenými oddělovači.
  const base = path.join(os.homedir(), '.claude/projects');
  let dirs = []; try { dirs = fs.readdirSync(base); } catch { return { harness: 'claude', status: 'unknown', days, project_dirs: [], per_model: null, sessions: null, reason: 'Adresář Claude Code usage logů není dostupný.' }; }
  // přesně tento projekt: složka transkriptů = cesta repa (každý znak mimo A-Z0-9 → „-"), případně jeho podsložky (worktree).
  // Dřív se bral každý adresář obsahující název repa → „app" zahrnul i „app-audit" (spotřebu auditora) a sousední projekty „app-old" apod.
  const enc = p => p.replace(/[^A-Za-z0-9]/g, '-').toLowerCase(); const me = enc(repo);
  let sibs = []; try { sibs = fs.readdirSync(path.dirname(repo), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => enc(path.join(path.dirname(repo), e.name))).filter(x => x !== me && x.startsWith(me)); } catch { }
  const cand = dirs.filter(d => { const x = d.toLowerCase(); return (x === me || x.startsWith(me + '-')) && !x.startsWith(me + '-audit') && !sibs.some(sb => x === sb || x.startsWith(sb + '-')); });
  const since = Date.now() - days * 864e5;
  const perModel = {}, perSession = {}, toolCalls = {}, skills = {}, agents = {}; const seenUsage = new Set();
  // delegace: kolik editací kódu a výstupních tokenů dělá hlavní vlákno (silný model) vs. subagenti (levnější modely)
  const del = { editace_hlavni: 0, editace_subagenti: 0, output_hlavni: 0, output_subagenti: 0, model_hlavni: {}, model_subagenti: {} };
  const isSub = (o, f) => o.isSidechain === true || /[\\/]subagents[\\/]/.test(f);
  for (const d of cand) for (const f of walk(path.join(base, d), p => p.endsWith('.jsonl'))) {
    if (fs.statSync(f).mtimeMs < since) continue;
    for (const line of (read(f) || '').split('\n')) {
      if (line.includes('"tool_use"')) { try { const o = JSON.parse(line); for (const c of (o.message?.content || [])) if (c.type === 'tool_use') { toolCalls[c.name] = (toolCalls[c.name] || 0) + 1; if (/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/.test(c.name)) del[isSub(o, f) ? 'editace_subagenti' : 'editace_hlavni']++; if (c.name === 'Skill' && c.input?.skill) skills[c.input.skill] = (skills[c.input.skill] || 0) + 1; if (c.name === 'Agent' || c.name === 'Task') { const t = c.input?.subagent_type || 'general-purpose'; agents[t] = (agents[t] || 0) + 1; } } } catch { } }
      if (!line.includes('"usage"')) continue;
      try { const o = JSON.parse(line); const m = o.message || {}; const u = m.usage; if (!u) continue;
        const mk = m.id || o.requestId; if (mk) { if (seenUsage.has(mk)) continue; seenUsage.add(mk); }   // jedna odpověď = víc řádků transkriptu se stejným usage → bez deduplikace ~2,3× nadsazení
        const model = m.model || 'unknown'; const ts = o.timestamp ? Date.parse(o.timestamp) : Infinity; if (ts < since) continue;
        const bump = (o2) => { o2.input = (o2.input || 0) + (u.input_tokens || 0); o2.cache_create = (o2.cache_create || 0) + (u.cache_creation_input_tokens || 0); o2.cache_read = (o2.cache_read || 0) + (u.cache_read_input_tokens || 0); o2.output = (o2.output || 0) + (u.output_tokens || 0); o2.calls = (o2.calls || 0) + 1; };
        const sb = isSub(o, f); del[sb ? 'output_subagenti' : 'output_hlavni'] += u.output_tokens || 0; const dm = del[sb ? 'model_subagenti' : 'model_hlavni']; dm[model] = (dm[model] || 0) + (u.output_tokens || 0);
        bump(perModel[model] ||= {}); bump(perSession[path.basename(f, '.jsonl')] ||= { model });
      } catch { }
    }
  }
  const hasRecords = Object.keys(perSession).length > 0;
  return { harness: 'claude', status: hasRecords ? 'measured' : 'unknown', coverage: { source: 'Claude Code session logs', candidate_project_dirs: cand.length, usage_records: hasRecords ? 'found' : 'not found' }, days,
    project_dirs: cand.map((_, i) => `project-${i + 1}`), per_model: hasRecords ? perModel : null, sessions: hasRecords ? Object.keys(perSession).length : null,
    tool_calls: hasRecords ? toolCalls : null, skills_invoked: hasRecords ? skills : null, subagents_invoked: hasRecords ? agents : null,
    delegace: hasRecords ? { ...del, podil_editaci_hlavni: (del.editace_hlavni + del.editace_subagenti) ? +(del.editace_hlavni / (del.editace_hlavni + del.editace_subagenti)).toFixed(2) : null, poznamka: 'Kapitán na silném modelu má plánovat a kontrolovat; kód mají psát subagenti. Podíl editací v hlavním vlákně > 0,3 = nález EFF.' } : null,
    per_session: hasRecords ? perSession : null, reason: hasRecords ? undefined : 'Pro přesný cílový projekt nebyl nalezen kompatibilní usage záznam; skutečná nulová spotřeba z toho neplyne.',
    note: 'Záznamy jsou přiřazeny přesně cílovému projektu a jeho worktree složkám. Pro přesná čísla použij /cost nebo ccusage.' };
}

function churn() {
  const log = sh(`git log --since="${days} days ago" --pretty=format:"@@%H|%ad|%s" --date=short --numstat`);
  if (!log) return { error: 'git log prázdný' };
  const commits = []; let cur = null;
  for (const l of log.split('\n')) {
    if (l.startsWith('@@')) { const [h, d, ...s] = l.slice(2).split('|'); cur = { h, d, s: s.join('|'), files: [] }; commits.push(cur); }
    else if (cur && /^\d+\t\d+\t/.test(l)) { const [a, r, f] = l.split('\t'); cur.files.push({ f, a: +a, r: +r }); }
  }
  const fixRe = /\b(fix|hotfix|revert|oprav|bug|repair)\b/i;
  const touched = {}; let rework = 0, added = 0, removedSoon = 0;
  for (const c of commits.slice().reverse()) {
    const t = Date.parse(c.d);
    let isRework = false;
    for (const f of c.files) {
      const prev = touched[f.f];
      if (fixRe.test(c.s) && prev && t - prev.t <= 7 * 864e5) isRework = true;
      if (prev && t - prev.t <= 7 * 864e5) removedSoon += Math.min(f.r, prev.a);
      added += f.a; touched[f.f] = { t, a: f.a };
    }
    if (isRework) rework++;
  }
  const rr = commits.length ? rework / commits.length : 0, cr = added ? removedSoon / added : 0;
  return { days, commits: commits.length, rework_commits: rework, rework_ratio: +rr.toFixed(3), lines_added: added, lines_removed_within_7d: removedSoon, churn_ratio: +cr.toFixed(3), verdict: rr > 0.25 || cr > 0.2 ? '🔴' : rr > 0.15 || cr > 0.12 ? '🟡' : '🟢' };
}

function modules() {
  const files = walk(repo, p => /\.(ts|tsx|js|jsx|mjs|cjs|py|html|css|c|cc|cpp|cxx|h|hh|hpp|hxx|bas|cls)$/i.test(p) && !/\.(min|d)\.(js|ts)$/i.test(p));
  const rows = [];
  for (const f of files) {
    const t = read(f) || ''; const lines = t.split('\n').length; const tk = tok(t);
    const exportsN = (t.match(/^export\s/gm) || []).length;
    // hrubý odhad délky funkcí: bloky začínající function/=>{ a končící na stejném odsazení
    let longFns = 0; const fnStarts = [...t.matchAll(/^(\s*)(export\s+)?(async\s+)?(function\s+\w+|const\s+\w+\s*=\s*(async\s*)?\(|def\s+\w+)/gm)];
    for (let i = 0; i < fnStarts.length; i++) { const s = t.slice(0, fnStarts[i].index).split('\n').length; const e = i + 1 < fnStarts.length ? t.slice(0, fnStarts[i + 1].index).split('\n').length : lines; if (e - s > 80) longFns++; }
    const level = lines > 1000 || tk > 30000 ? '🔴' : lines > 500 || tk > 15000 || exportsN > 15 || longFns > 0 ? '🟡' : '';
    if (level) rows.push({ file: path.relative(repo, f), lines, tokens_est: tk, exports: exportsN, long_functions_gt80: longFns, verdict: level });
  }
  rows.sort((a, b) => b.lines - a.lines);
  return { files_scanned: files.length, over_threshold: rows.length, red: rows.filter(r => r.verdict === '🔴').length, rows: rows.slice(0, 60), rule: 'Před přidáním featury do 🔴 souboru navrhnout rozdělení podle domény (samostatná položka).' };
}

const harnessIndex = rest.indexOf('--harness');
const requestedHarness = harnessIndex >= 0 ? rest[harnessIndex + 1] : undefined;
const out = cmd === 'all' ? { context: context(requestedHarness || 'all'), usage: usage(requestedHarness || 'all'), churn: churn(), modules: modules() }
  : cmd === 'context' ? context(requestedHarness || 'claude')
    : cmd === 'usage' ? usage(requestedHarness || 'claude')
      : ({ churn, modules })[cmd]?.();
if (!out) { console.error('neznámý příkaz'); process.exit(1); }
console.log(JSON.stringify(out, null, 2));
