#!/usr/bin/env node
// STATUSLINE auditora — přebije globální stavový řádek uživatele (project settings > user settings), aby bylo na první pohled vidět, že jde o AUDITORA.
import fs from 'node:fs'; import path from 'node:path';
let input = {}; try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { }
const ws = process.env.AUDITOR_WORKSPACE || input.cwd || process.cwd(); const name = path.basename(ws).replace(/-audit$/, '');
const model = input.model?.display_name || input.model?.id || ''; let open = 0; try { open = fs.readdirSync(path.join(ws, 'AUDIT', '01_nalezy')).filter(f => /^A-\d+\.md$/.test(f)).length; } catch { }
let gate = '⚪ bez gate'; try { const g = fs.readFileSync(path.join(ws, 'AUDIT', '05_release_gate.md'), 'utf8'); gate = /Verdikt:\s*🟢/.test(g) ? '🟢 gate' : '🔴 gate'; } catch { }
process.stdout.write(`🔍 AUDITOR · ${name} · ${model} · nálezy ${open} · ${gate} · nekóduje, nevydává`);
