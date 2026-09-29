// OPRAVNENI-VZOR — vyhodnocení allow pravidel Claude Code VZOREM (A-031), ne přesným řetězcem z tabulky.
// isBroadRule(rule): true = pravidlo dává široké/rizikové oprávnění (Bash(*), Bash, mcp__*__*, Bash(rm:*), Bash(git push*), Bash(psql:*),
// mcp__x__execute_sql …); úzká pravidla (Bash(node selftest.mjs), Bash(git status), Bash(git log:*)) vrací false.
// coveredBy(rule, table): pravidlo je stejné nebo užší než některé z tabulky úrovně (např. Bash(psql -c x) pod Bash(psql:*)).
// Čistá funkce bez zápisu do souborů.

const RISKY_BINS = new Set(['rm', 'rmdir', 'rd', 'del', 'erase', 'sudo', 'su', 'doas', 'chmod', 'chown', 'dd', 'mkfs', 'format', 'curl', 'wget', 'iwr', 'invoke-webrequest', 'invoke-restmethod',
  'ssh', 'scp', 'sftp', 'nc', 'ncat', 'psql', 'mysql', 'sqlite3', 'mongo', 'mongosh', 'redis-cli', 'supabase', 'docker', 'kubectl', 'terraform', 'vercel', 'netlify', 'gh', 'aws', 'gcloud', 'az',
  'remove-item', 'set-content', 'add-content', 'out-file', 'invoke-expression', 'iex', 'eval', 'exec', 'xargs', 'env', 'start-process', 'reg', 'schtasks', 'taskkill', 'kill', 'pkill']);
const INTERPRETERS = new Set(['node', 'nodejs', 'bun', 'deno', 'python', 'python3', 'py', 'ruby', 'perl', 'php', 'bash', 'sh', 'zsh', 'dash', 'cmd', 'powershell', 'pwsh', 'npx', 'pnpx', 'bunx', 'npm', 'pnpm', 'yarn', 'pip', 'uv', 'uvx']);
const RISKY_GIT = new Set(['push', 'send-pack', 'reset', 'clean', 'rebase', 'checkout', 'restore', 'rm', 'config', 'filter-branch', 'update-ref', 'switch', 'branch', 'tag', 'commit', 'merge', 'cherry-pick', 'revert', 'stash', 'worktree', 'gc', 'reflog']);
const RISKY_MCP_TOOL = /(exec|sql|query|migrat|deploy|delete|drop|truncate|write|update|insert|remove|merge|push|create|apply|run|send|post|put|patch|upload|edit|set_|admin)/i;
const WILD = /[*?]/;
const norm = s => String(s || '').trim().replace(/\\/g, '/');
const head = t => norm(t).split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
const parse = rule => { const m = /^\s*([A-Za-z][\w*-]*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(String(rule || '')); return m ? { tool: m[1], content: m[2] === undefined ? null : m[2].trim() } : null; };
// literální začátek pravidla před prvním zástupným znakem (bez koncového „:“ / mezery)
const prefixOf = c => norm(c).replace(/:?[*?][\s\S]*$/, '').replace(/[:\s]+$/, '');
const isShellTool = t => /^(bash|powershell|shell|cmd)$/i.test(t);

function bashDanger(content) {
  if (content === null || content === '') return true;                                   // celý nástroj bez omezení
  const c = norm(content), pre = prefixOf(c), wild = WILD.test(c) || /:\*$/.test(c);
  if (!pre) return true;                                                                  // (*), (:*) = cokoli
  const toks = pre.split(/\s+/).filter(Boolean), h = head(toks[0]), sub = (toks[1] || '').toLowerCase();
  const argsAfterHead = toks.length > 1;
  if (h === 'git') { if (!sub) return true; return RISKY_GIT.has(sub) && (wild || sub === 'push' || sub === 'reset' || sub === 'clean' || sub === 'send-pack'); }
  if (RISKY_BINS.has(h)) return wild || ['rm', 'rmdir', 'rd', 'del', 'erase', 'sudo', 'su', 'doas', 'dd', 'mkfs', 'format', 'chmod', 'chown'].includes(h);
  if (INTERPRETERS.has(h)) return wild && !argsAfterHead;                                 // node:*, npx *; node scripts/x:* už je úzké
  return false;
}
function mcpDanger(tool) {
  const parts = String(tool).split('__');                                                 // mcp, server, nástroj
  if (parts.length < 2 || parts[0] !== 'mcp') return false;
  const server = parts[1], name = parts.slice(2).join('__');
  if (WILD.test(server) || server === '') return true;                                    // mcp__*, mcp__*__*
  if (!name) return true;                                                                 // celý server (všechny jeho nástroje)
  return WILD.test(name) || RISKY_MCP_TOOL.test(name);
}
export function isBroadRule(rule) {
  const p = parse(rule); if (!p) return false;
  if (/^mcp__/i.test(p.tool)) return mcpDanger(p.tool);
  if (isShellTool(p.tool)) return bashDanger(p.content);
  if (/^(write|edit|multiedit|notebookedit|webfetch)$/i.test(p.tool)) return p.content === null || /^(\*+|:?\*+|\*\*\/\*)$/.test(p.content);
  return false;                                                                           // Read, Grep, Glob… a ostatní nástroje nejsou zápis/spuštění
}
export function coveredBy(rule, table) {
  const p = parse(rule); if (!p) return false;
  return table.some(t => {
    const q = parse(t); if (!q) return false;
    if (/^mcp__/i.test(p.tool)) return p.tool === q.tool || p.tool.startsWith(q.tool + '__');   // tabulka má celý server (mcp__supabase) → pokrývá jeho nástroje
    if (q.tool.toLowerCase() !== p.tool.toLowerCase()) return false;
    if (q.content === null) return true;
    if (p.content === null) return false;
    const qp = prefixOf(q.content), pp = prefixOf(p.content);
    return !!qp && pp.startsWith(qp);
  });
}
