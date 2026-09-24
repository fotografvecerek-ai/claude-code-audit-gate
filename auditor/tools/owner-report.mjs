#!/usr/bin/env node
// OWNER-REPORT — vyrobí AUDIT/ZPRAVA.html (čitelná zpráva pro vlastníka) z AUDIT/ZPRAVA.md, případně z 00_prvni_dojem.md.
// node tools/owner-report.mjs [workspace] [--open]   Bez závislostí; jednoduchý Markdown → HTML (nadpisy, odstavce, seznamy, tabulky, tučné, kód, odkazy).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { exec } from 'node:child_process';
const ws = path.resolve(process.argv.slice(2).find((a, i, arr) => !a.startsWith('--') && !['--src', '--out'].includes(arr[i - 1])) || process.env.AUDITOR_WORKSPACE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const A = p => path.isAbsolute(p) ? p : path.join(ws, 'AUDIT', p);
const argv = process.argv; const argOf = k => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : null; };
const src = argOf('--src') ? A(argOf('--src')) : ['ZPRAVA.md', '00_prvni_dojem.md'].map(A).find(fs.existsSync);
if (!src || !fs.existsSync(src)) { console.error('Zatím není co zobrazit: AUDIT/ZPRAVA.md ani 00_prvni_dojem.md neexistuje (auditor je napíše po první vlně).'); process.exit(1); }
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>').replace(/&lt;sub&gt;(.*?)&lt;\/sub&gt;/g, '<small>$1</small>');
const md = fs.readFileSync(src, 'utf8').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
let out = [], list = false, table = null, para = []; const qs = [];
const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
const flushL = () => { if (list) { out.push('</ul>'); list = false; } };
const flushT = () => { if (table) { const [h, ...rows] = table; out.push('<table><thead><tr>' + h.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>'); table = null; } };
const flush = () => { flushP(); flushL(); flushT(); };
for (const raw of md) {
  const l = raw.trimEnd();
  if (/^\|.*\|$/.test(l.trim())) { flushP(); flushL(); const cells = l.trim().slice(1, -1).split('|').map(c => c.trim()); if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue; (table ||= []).push(cells); continue; } else flushT();
  let m;
  if ((m = l.match(/^(#{1,3})\s+(.*)/))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
  if ((m = l.match(/^\s*[-*]\s+\[(Q\d+)\]\s+(.*?)\s*\{([^}]*)\}\s*$/))) { flush(); const [, id, q, full] = m; const [spec, ...rest] = full.split(';'); const recM = rest.join(';').match(/doporu\S*\s*:\s*([^—–-]+?)\s*(?:[—–-]\s*(.*))?$/i); const rec = recM ? recM[1].trim() : '', why = recM && recM[2] ? recM[2].trim() : '';
    const opts = /^ano\s*\/\s*ne$/i.test(spec.trim()) ? ['ano', 'ne'] : /^text$/i.test(spec.trim()) ? [] : spec.split('|').map(x => x.trim()).filter(Boolean); qs.push(id);
    out.push(`<fieldset class="q" data-id="${id}" data-q="${esc(q)}"><legend><b>${id}</b> ${inline(q)}</legend>${rec ? `<div class="rec">Doporučuji: <b>${esc(rec)}</b>${why ? ' — ' + inline(why) : ''}</div>` : ''}${opts.map(o => `<label${o.toLowerCase() === rec.toLowerCase() ? ' class="isrec"' : ''}><input type="radio" name="${id}" value="${esc(o)}"${o.toLowerCase() === rec.toLowerCase() ? ' checked' : ''}> ${esc(o)}${o.toLowerCase() === rec.toLowerCase() ? ' <small>(doporučeno)</small>' : ''}</label>`).join('')}<textarea placeholder="${opts.length ? 'Komentář (nepovinný)' : (rec ? 'Doporučuji: ' + esc(rec) : 'Tvoje odpověď')}" rows="2"></textarea></fieldset>`); continue; }
  if ((m = l.match(/^\s*[-*]\s+(.*)/))) { flushP(); if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
  if (!l.trim()) { flush(); continue; }
  flushL(); para.push(l.trim());
}
flush();
const proj = path.basename(ws).replace(/-audit$/, '');
const form = qs.length ? `<div class="send"><button id="send">Odeslat odpovědi auditorovi</button> <span id="st">Uloží soubor Auditor_odpovedi_${esc(proj)}.json do Stažených — auditor si ho načte sám. Zároveň se odpovědi zkopírují do schránky (kdyby ne, vlož je auditorovi do okna).</span></div>
<script>document.getElementById('send').onclick=()=>{const a=[...document.querySelectorAll('fieldset.q')].map(f=>({id:f.dataset.id,otazka:f.dataset.q,odpoved:(f.querySelector('input:checked')||{}).value||'',doporuceno:(f.querySelector('.rec b')||{}).textContent||'',komentar:f.querySelector('textarea').value.trim()}));
const miss=a.filter(x=>!x.odpoved&&!x.komentar).map(x=>x.id);if(miss.length&&!confirm('Bez odpovědi: '+miss.join(', ')+'. Odeslat i tak?'))return;
const data={projekt:${JSON.stringify(proj)},vytvoreno:new Date().toISOString(),odpovedi:a};const t='ODPOVĚDI VLASTNÍKA ('+data.projekt+'):\\n'+a.map(x=>x.id+' '+x.otazka+' → '+(x.odpoved||'-')+(x.komentar?' | '+x.komentar:'')).join('\\n');
try{navigator.clipboard.writeText(t)}catch(e){}const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));l.download='Auditor_odpovedi_'+data.projekt+'.json';document.body.appendChild(l);l.click();l.remove();
document.getElementById('st').textContent='Odesláno ✓ (soubor ve Stažených + schránka). Auditorovi stačí napsat: odpověděl jsem.';};</script>` : '';
const body = out.join('\n') + form; const title = (md.find(l => l.startsWith('# ')) || '# Zpráva auditora').slice(2);
const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{--bg:#f7f7f5;--card:#fff;--ink:#1c1c1c;--muted:#666;--line:#e3e3df;--accent:#0f766e}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--card:#1e1e1e;--ink:#eee;--muted:#aaa;--line:#333;--accent:#2dd4bf}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,"Segoe UI",sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:28px;margin:0 0 8px}h2{font-size:20px;margin:32px 0 8px;padding-top:16px;border-top:1px solid var(--line)}
p,li{max-width:75ch}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:8px 0}
th,td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}th{font-size:13px;color:var(--muted);font-weight:600}
td:first-child{width:28px;font-size:18px}code{background:var(--line);padding:1px 5px;border-radius:4px;font-size:.9em}
small{color:var(--muted)}a{color:var(--accent)}.meta{color:var(--muted);font-size:13px;margin-bottom:24px}
fieldset.q{border:1px solid var(--line);background:var(--card);border-radius:8px;margin:12px 0;padding:12px 16px}fieldset.q legend{padding:0 6px}fieldset.q label{display:inline-block;margin:6px 18px 6px 0;cursor:pointer;font-size:17px}fieldset.q input[type=radio]{transform:scale(1.3);margin-right:6px}fieldset.q .rec{margin:4px 0 6px;padding:6px 10px;border-left:3px solid var(--accent);background:var(--bg);font-size:14px}fieldset.q label.isrec{font-weight:600}fieldset.q textarea{display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font:inherit}
.send{position:sticky;bottom:0;background:var(--bg);padding:14px 0;border-top:1px solid var(--line);margin-top:16px}#send{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:16px;font-weight:600;cursor:pointer}#st{color:var(--muted);font-size:13px;margin-left:8px}
@media print{body{background:#fff}h2{break-after:avoid}table{break-inside:avoid}}
</style></head><body><main><div class="meta">Auditor · vygenerováno ${new Date().toLocaleString('cs-CZ')} z ${esc(path.basename(src))}</div>
${body}</main></body></html>`;
const dst = A(argOf('--out') || 'ZPRAVA.html'); fs.writeFileSync(dst, html); console.log(`zpráva pro vlastníka: ${dst}`);
if (process.argv.includes('--open')) exec(process.platform === 'win32' ? `start "" "${dst}"` : process.platform === 'darwin' ? `open "${dst}"` : `xdg-open "${dst}"`);
