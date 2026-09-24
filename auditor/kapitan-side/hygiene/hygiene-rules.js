// Loader pravidel hygieny (CommonJS i ESM přes createRequire). Hledá: explicitní cesta → .claude/hooks/hygiene-rules.json v repu → vedle tohoto souboru.
const fs = require('node:fs'); const path = require('node:path');
function load(explicit) {
  const cands = [explicit, process.env.HYGIENE_RULES, path.join(process.env.AUDITOR_TARGET_REPO || '', '.claude/hooks/hygiene-rules.json'), path.join(__dirname, 'hygiene-rules.json'), path.join(__dirname, 'hygiene', 'hygiene-rules.json')].filter(Boolean);
  for (const c of cands) { try { const j = JSON.parse(fs.readFileSync(c, 'utf8')); const R = {}; for (const [k, v] of Object.entries(j)) R[k] = typeof v === 'string' && k !== '_' ? new RegExp(v, 'i') : v; R.__file = c; return R; } catch { } }
  throw new Error('hygiene-rules.json nenalezen (' + cands.join(', ') + ')');
}
module.exports = { load };
