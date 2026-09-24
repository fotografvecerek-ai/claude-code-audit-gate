#!/usr/bin/env node
// EFFICIENCY AUDIT — read-only měření pro checklist EFEKTIVITA.
// Použití:
//   node tools/efficiency-audit.mjs context <repo>            # co se načítá do kontextu (CLAUDE.md, rules, agents, skills, MCP, hooks)
//   node tools/efficiency-audit.mjs usage <repo> [--days 7]   # tokeny per model ze session logů Claude Code (~/.claude/projects/<slug>/*.jsonl)
//   node tools/efficiency-audit.mjs churn <repo> [--days 30]  # rework ratio a churn řádků z git logu
//   node tools/efficiency-audit.mjs modules <repo>            # soubory/funkce nad prahy modularizace
//   node tools/efficiency-audit.mjs all <repo> > AUDIT/06_efektivita_raw.json
// Odhad tokenů ≈ znaky/4 (pro CZ text spíš /3.5) — je to odhad, přesná čísla dává /cost a usage.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

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
    if (['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'playwright-report', 'test-results', 'vendor'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out, depth + 1); else if (filter(p)) out.push(p);
  }
  return out;
};

function context() {
  const items = [];
  const add = (kind, file, text, note = '') => text != null && items.push({ kind, file: path.relative(repo, file) || file, lines: text.split('\n').length, tokens_est: tok(text), note });
  for (const f of ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md']) add('claude_md', path.join(repo, f), read(path.join(repo, f)));
  add('claude_md_user', path.join(os.homedir(), '.claude/CLAUDE.md'), read(path.join(os.homedir(), '.claude/CLAUDE.md')));
  for (const f of walk(path.join(repo, '.claude/rules'), p => p.endsWith('.md'))) {
    const t = read(f); const hasPaths = /^---[\s\S]*?paths:/m.test(t || '');
    add('rule', f, t, hasPaths ? 'scoped (paths:)' : 'ALWAYS LOADED — bez paths:');
  }
  for (const f of walk(path.join(repo, '.claude/agents'), p => p.endsWith('.md'))) {
    const t = read(f) || ''; const fm = (t.match(/^---([\s\S]*?)---/) || [])[1] || '';
    const model = (fm.match(/^model:\s*(\S+)/m) || [])[1] || 'inherit(!)';
    const tools = (fm.match(/^tools:\s*(.+)/m) || [])[1] || 'ALL(!)';
    const skills = (fm.match(/^skills:\s*(.+)/m) || [])[1] || '';
    add('agent', f, t, `model=${model}; tools=${tools}; skills=${skills || '-'}`);
  }
  for (const f of walk(path.join(repo, '.claude/skills'), p => p.endsWith('SKILL.md'))) add('skill', f, read(f));
  for (const f of walk(path.join(os.homedir(), '.claude/skills'), p => p.endsWith('SKILL.md'))) add('skill_user', f, read(f));
  // MCP servery
  const mcp = {};
  for (const f of [path.join(repo, '.mcp.json'), path.join(os.homedir(), '.claude.json'), path.join(repo, '.claude/settings.json'), path.join(repo, '.claude/settings.local.json'), path.join(os.homedir(), '.claude/settings.json')]) {
    const j = read(f); if (!j) continue;
    try { const o = JSON.parse(j); const s = o.mcpServers || (o.projects && Object.values(o.projects).flatMap(p => Object.keys(p.mcpServers || {}))) || {};
      mcp[path.relative(repo, f) || f] = Array.isArray(s) ? s : Object.keys(s);
      if (o.hooks) items.push({ kind: 'hooks', file: path.relative(repo, f) || f, lines: 0, tokens_est: 0, note: Object.entries(o.hooks).map(([ev, arr]) => `${ev}:${arr.flatMap(g => g.hooks || []).map(h => h.type).join('/')}`).join(' ') });
    } catch { }
  }
  const total = items.filter(i => ['claude_md', 'claude_md_user', 'rule'].includes(i.kind)).reduce((a, b) => a + b.tokens_est, 0);
  const verdict = total > 12000 ? '🔴' : total > 6000 ? '🟡' : '🟢';
  return { repo, always_loaded_tokens_est: total, verdict, mcp_servers: mcp, items, note: 'MCP schémata nástrojů se posílají v každém requestu — počet nástrojů ověř přes /mcp v Claude Code.' };
}

function usage() {
  // Claude Code ukládá session logy do ~/.claude/projects/<slug>/*.jsonl; slug = cesta repa s nahrazenými oddělovači.
  const base = path.join(os.homedir(), '.claude/projects');
  let dirs = []; try { dirs = fs.readdirSync(base); } catch { return { error: `nenalezeno ${base}` }; }
  const slugHint = repo.replace(/[:\\/]/g, '-').toLowerCase();
  const cand = dirs.filter(d => slugHint.includes(d.toLowerCase().replace(/^-/, '')) || d.toLowerCase().includes(path.basename(repo).toLowerCase()));
  const since = Date.now() - days * 864e5;
  const perModel = {}, perSession = {}, toolCalls = {}, skills = {}, agents = {};
  for (const d of cand) for (const f of walk(path.join(base, d), p => p.endsWith('.jsonl'))) {
    if (fs.statSync(f).mtimeMs < since) continue;
    for (const line of (read(f) || '').split('\n')) {
      if (line.includes('"tool_use"')) { try { const o = JSON.parse(line); for (const c of (o.message?.content || [])) if (c.type === 'tool_use') { toolCalls[c.name] = (toolCalls[c.name] || 0) + 1; if (c.name === 'Skill' && c.input?.skill) skills[c.input.skill] = (skills[c.input.skill] || 0) + 1; if (c.name === 'Agent' || c.name === 'Task') { const t = c.input?.subagent_type || 'general-purpose'; agents[t] = (agents[t] || 0) + 1; } } } catch { } }
      if (!line.includes('"usage"')) continue;
      try { const o = JSON.parse(line); const m = o.message || {}; const u = m.usage; if (!u) continue;
        const model = m.model || 'unknown'; const ts = o.timestamp ? Date.parse(o.timestamp) : Infinity; if (ts < since) continue;
        const bump = (o2) => { o2.input = (o2.input || 0) + (u.input_tokens || 0); o2.cache_create = (o2.cache_create || 0) + (u.cache_creation_input_tokens || 0); o2.cache_read = (o2.cache_read || 0) + (u.cache_read_input_tokens || 0); o2.output = (o2.output || 0) + (u.output_tokens || 0); o2.calls = (o2.calls || 0) + 1; };
        bump(perModel[model] ||= {}); bump(perSession[path.basename(f, '.jsonl')] ||= { model });
      } catch { }
    }
  }
  return { days, project_dirs: cand, per_model: perModel, sessions: Object.keys(perSession).length, tool_calls: toolCalls, skills_invoked: skills, subagents_invoked: agents, per_session: perSession, note: 'Formát logu ověř na aktuální verzi Claude Code; pro přesná čísla /cost nebo ccusage. Normalizuj: tokeny / uzavřený issue.' };
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
  const files = walk(repo, p => /\.(ts|tsx|js|jsx|mjs|cjs|py|html|css)$/.test(p) && !/\.(min|d)\.(js|ts)$/.test(p));
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

const out = cmd === 'all' ? { context: context(), usage: usage(), churn: churn(), modules: modules() }
  : ({ context, usage, churn, modules })[cmd]?.();
if (!out) { console.error('neznámý příkaz'); process.exit(1); }
console.log(JSON.stringify(out, null, 2));
