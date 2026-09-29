// VAROVANI — mechanické varování vlastníkovi o oprávněních Claude Code (A-031): soubor <ws>/AUDIT/VAROVANI-oprávnění.md.
// Zapisuje ho SessionStart Kapitána (kapitan-role.mjs) při odebrání oprávnění nebo při bypassPermissions v uživatelském nastavení;
// při dalším startu ho hlásí auditor i Kapitán (prisnost.mjs contextLine → warningLine). Soubor je jen podnět — nic nevynucuje.
// Vše UTF-8; nikdy nevyhazuje výjimku (varování nesmí shodit start).
import fs from 'node:fs'; import path from 'node:path';

export const WARN_FILE = 'VAROVANI-oprávnění.md';
export const RECENT_MS = 7 * 24 * 3600 * 1000;
const warnPath = ws => path.join(ws, 'AUDIT', WARN_FILE);
const HEAD = '# Varování: oprávnění Claude Code\n\nTento soubor zapisuje Kapitán při startu, když našel oprávnění nad schválenou samostatností. Smaž ho, až problém vyřešíš (START → [7]).\n\n';

// Přidá řádek s časem; stejný text jako poslední záznam se nezapisuje znovu (start by soubor zaplevelil).
export function writeWarning(ws, text) {
  try {
    const p = warnPath(ws); fs.mkdirSync(path.dirname(p), { recursive: true });
    const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : HEAD;
    const last = cur.trim().split(/\r?\n/).pop() || '';
    if (last.endsWith(text)) return false;
    fs.writeFileSync(p, `${cur.endsWith('\n') ? cur : cur + '\n'}- ${new Date().toISOString()}  ${text}\n`, 'utf8');
    return true;
  } catch { return false; }
}
// Poslední záznam mladší než 7 dní, jinak ''.
export function readWarning(ws, now = Date.now()) {
  try {
    const p = warnPath(ws); const st = fs.statSync(p); if (now - st.mtimeMs > RECENT_MS) return '';
    const line = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/).filter(l => l.startsWith('- ')).pop() || '';
    return line.replace(/^- /, '');
  } catch { return ''; }
}
export const warningLine = ws => { const w = readWarning(ws); return w ? `[OPRÁVNĚNÍ] ⚠ Nevyřešené varování z ${WARN_FILE} (AUDIT/): ${w} — ohlas vlastníkovi; po vyřešení soubor smaž.` : ''; };
