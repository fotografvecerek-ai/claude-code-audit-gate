#!/usr/bin/env node
// KATALOG · sdileny-strom — PreToolUse (Bash|PowerShell): ve stromu, kde pracuje víc agentů (Kapitán + subagenti + auditor), blokuje
//   • ukončení procesů podle JMÉNA (taskkill /IM, pkill, killall, Stop-Process -Name) — sestřelí cizí procesy; povoleno jen podle PID,
//   • destruktivní git operace, které smažou cizí necommitnutou práci: stash (kromě list/show), reset --hard, reset <revize>,
//     checkout -- / checkout ., restore bez --staged, clean -f, pull/rebase --autostash.
// Povolené zůstává: git reset HEAD <soubor> (unstage), git restore --staged, taskkill /PID, kill <PID>. Chyba hooku = pustí (fail-open).
import fs from 'node:fs';
try {
  const inp = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); if (!/^(Bash|PowerShell)$/.test(inp.tool_name || '')) process.exit(0);
  // zprávy commitů/tagů (-m "…", --message=…, heredoc) jsou text, ne příkaz; ostatní text v uvozovkách (bash -c "git stash") se kontroluje
  const cmd = String(inp.tool_input?.command || '').replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\1\b/g, '')
    .replace(/(^|\s)(-m|--message|-F)\s*(=\s*)?("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/g, '$1');
  const block = m => { process.stderr.write(`SDÍLENÝ STROM: ${m}\n(Pravidlo z katalogu Auditoru; vypnout může vlastník: node <workspace>/tools/katalog.mjs deaktivuj sdileny-strom --cil <repo>)\n`); process.exit(2); };
  const R = [
    [/\btaskkill\b[^\n;&|]*\/im\b/i, 'taskkill /IM ukončí VŠECHNY procesy toho jména (i cizí agenty a servery). Použij taskkill /PID <pid>.'],
    [/\b(pkill|killall)\s+(?!-[a-z]*P\b)/i, 'pkill/killall podle jména sestřelí i cizí procesy. Použij kill <PID> procesu, který jsi sám spustil.'],
    [/\bstop-process\b[^\n;|]*-name\b/i, 'Stop-Process -Name ukončí všechny procesy toho jména. Použij Stop-Process -Id <pid>.'],
    [/\bget-process\b[^\n;]*\|\s*stop-process\b/i, 'Get-Process … | Stop-Process ukončí hromadně. Použij Stop-Process -Id <pid>.'],
    [/\bgit\s+stash(?!\s+(list|show)\b)/i, 'git stash ve sdíleném stromu schová i cizí rozdělanou práci. Commituj jmenovitě nebo pracuj v samostatném worktree.'],
    [/\bgit\s+reset\s+(?:[^\n;&|]*\s)?--(hard|soft|mixed|merge|keep)\b/i, 'git reset --hard/--soft/--mixed ve sdíleném stromu smaže nebo přesune cizí práci. Povolený je jen unstage: git reset HEAD <soubor>.'],
    [/\bgit\s+reset\s+(HEAD[~^]\S*|[0-9a-f]{7,40}|origin\/\S+)(\s*$|\s*[;&|])/i, 'git reset na jinou revizi může vzít i cizí commit. Povolený je jen unstage: git reset HEAD <soubor>.'],
    [/\bgit\s+checkout\s+(?:[^\n;&|]*\s)?--\s/i, 'git checkout -- <soubor> zahodí necommitnuté změny (i cizí). Vrať jen vlastní hunky (reverse patch).'],
    [/\bgit\s+checkout\s+\.(\s|$|;|&)/i, 'git checkout . zahodí všechny necommitnuté změny ve stromu.'],
    [/\bgit\s+restore\s+(?![^\n;&|]*--staged)/i, 'git restore bez --staged zahodí necommitnuté změny. Pro unstage použij git restore --staged <soubor>.'],
    [/\bgit\s+clean\s+[^\n;&|]*-[a-z]*f/i, 'git clean -f smaže nesledované soubory (i cizí rozdělané).'],
    [/\bgit\s+(pull|rebase)\b[^\n;&|]*--autostash\b/i, '--autostash při konfliktu tiše nechá práci ve stash. Sdílené operace dělej v samostatném worktree.'],
  ];
  for (const [re, m] of R) if (re.test(cmd)) block(m);
  process.exit(0);
} catch { process.exit(0); }
