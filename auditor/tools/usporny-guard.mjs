#!/usr/bin/env node
// ÚSPORNÝ REŽIM auditora — PreToolUse pojistka proti plýtvání tokeny (hlavní vlákno; subagenti mají vlastní omezení v .claude/agents/).
//   • Agent: hlavní vlákno deleguje jen na levné/určené subagenty (pruzkumnik = haiku, mechanik = sonnet, overovatel-lehky = sonnet,
//     overovatel = hlavní model jen pro P0/P1) nebo s výslovným model: haiku|sonnet. Obecný subagent na nejdražším modelu = blok.
//   • Read / cat velkého souboru celého v hlavním vlákně = blok (každý další krok by ho znovu četl z kontextu) → Grep, offset/limit, pruzkumnik.
//   • Read PDF s více než 5 stranami bez pages = blok → převést na text (pdftotext) nebo číst po stranách.
// Režim: <workspace>/.rezim.json {"rezim":"usporny"|"dukladny"}; výchozí úsporný. Důkladný režim tuhle pojistku vypne (vlastník rozhoduje).
// Nikdy neblokuje chybou: při potížích pustí akci (exit 0) — je to pojistka nákladů, ne bezpečnosti.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
try {
  const ws = process.env.AUDITOR_WORKSPACE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let rez = 'usporny'; try { rez = JSON.parse(fs.readFileSync(path.join(ws, '.rezim.json'), 'utf8')).rezim || rez; } catch { }
  if (rez === 'dukladny') process.exit(0);
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  if (input.agent_id || input.agent_type) process.exit(0);   // uvnitř subagenta: ten má vlastní model i nástroje
  const tool = input.tool_name || '', ti = input.tool_input || {}; const cwd = input.cwd || ws;
  const block = m => { process.stderr.write(`ÚSPORNÝ REŽIM: ${m}\n(Režim mění vlastník: .rezim.json → "dukladny".)\n`); process.exit(2); };
  const OK_AGENTS = new Set(['pruzkumnik', 'mechanik', 'overovatel', 'overovatel-lehky', 'Explore', 'claude-code-guide', 'statusline-setup']);
  if (tool === 'Agent' || tool === 'Task') {
    const t = String(ti.subagent_type || 'general-purpose'), m = String(ti.model || '').toLowerCase();
    if (OK_AGENTS.has(t) || /^(haiku|sonnet)$/.test(m)) process.exit(0);
    try { const def = fs.readFileSync(path.join(ws, '.claude', 'agents', `${t.replace(/[^\w-]/g, '')}.md`), 'utf8'); if (/^model:\s*(haiku|sonnet)\b/m.test(def)) process.exit(0); } catch { }   // agent z katalogu s levným modelem
    block(`subagent „${t}" by běžel na drahém modelu. Použij pruzkumnik (hledání, výpisy, klasifikace — haiku), mechanik (skeny, testy, `
      + `dávky UI, sondy — sonnet), overovatel-lehky (ověření P2/P3), overovatel (jen P0/P1), nebo zadej model: "sonnet" / "haiku".`);
  }
  const LIM = 60 * 1024; const binary = /\.(png|jpe?g|gif|webp|pdf|ipynb)$/i;
  const big = f => { try { const p = path.resolve(cwd, f); const st = fs.statSync(p); return st.isFile() && st.size > LIM && !binary.test(p) ? st.size : 0; } catch { return 0; } };
  if (tool === 'Read' && !ti.limit) { const sz = big(ti.file_path || ''); if (sz) block(`${ti.file_path} má ${Math.round(sz / 1024)} kB — celý by zůstal v kontextu a každý další krok by ho četl znovu. Čti cíleně (Grep, offset/limit) nebo to deleguj subagentovi pruzkumnik.`); }
  // PDF: každá strana jde do kontextu jako text i obrázek (~1,5–3 tis. tokenů/strana) a zůstane tam → víc stran jen po částech nebo jako text
  if (tool === 'Read' && /\.pdf$/i.test(ti.file_path || '') && !ti.pages) { try { const p = path.resolve(cwd, ti.file_path); const st = fs.statSync(p);
    const n = st.size < 60 * 1024 * 1024 ? (fs.readFileSync(p).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length : 99;
    if (n > 5) block(`${ti.file_path} má ~${n} stran — celé PDF by zůstalo v kontextu (text i obrázek každé strany). Převeď ho jednou na text `
      + `(pdftotext "${ti.file_path}" AUDIT/_data/<název>.md) a čti cíleně, nebo čti jen potřebné strany (pages: "1-3"), nebo to deleguj pruzkumnikovi.`); } catch { } }
  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    for (const m of cmd.matchAll(/(?:^|[;&|]\s*)(?:cat|type|Get-Content)\s+("[^"]+"|'[^']+'|[^\s|;&>]+)(?![^|;&]*\|\s*(head|tail|grep|wc|jq|sed -n|Select-Object))/g)) {
      const f = m[1].replace(/^["']|["']$/g, ''); const sz = big(f); if (sz) block(`cat ${f} (${Math.round(sz / 1024)} kB) by vysypal celý soubor do kontextu. Použij head/tail/grep, nebo subagenta pruzkumnik.`);
    }
  }
  process.exit(0);
} catch { process.exit(0); }
