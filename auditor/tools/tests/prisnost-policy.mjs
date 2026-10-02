import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../prisnost.mjs';

const read = file => fs.readFileSync(file, 'utf8');
const has = (text, pattern) => pattern.test(text);
const normalize = text => text.normalize('NFC').replace(/[`*]/g, '')
  .replace(/^#{1,6}[ \t]+/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
const all = (text, patterns) => patterns.every(pattern => has(text, pattern));

export function runPrisnostPolicyTests({ T, pkg }) {
  const corePath = path.join(pkg, 'CLAUDE.md');
  const checklistPath = path.join(pkg, 'checklists', 'AUDIT_POSTUP.md');
  const coreSource = read(corePath);
  const core = normalize(coreSource);
  const checklist = normalize(read(checklistPath));
  const coreBytes = fs.statSync(corePath).size;
  const policySections = coreSource.split(/^##[ \t]+/m).filter(section => /^Přísnost\b/i.test(section));
  const policy = normalize(policySections[0] || '');
  const entry = 'checklists/AUDIT_POSTUP.md';

  T('PŘÍSNOST STATIKA: jádro do 12000 bajtů UTF-8 a odkaz na existující checklist',
    coreBytes <= 12000 && core.includes(entry.toLowerCase()) && fs.existsSync(path.join(pkg, entry)), true);
  T('PŘÍSNOST STATIKA: jediný oddíl určuje autoritu a má přednost před checklisty',
    policySections.length === 1 &&
      all(policy, [/jediný zdroj autority/, /má přednost před/, /checklisty/]) &&
      all(checklist, [/výhradně §přísnost/, /claude\.md/]), true);
  // Nezávislé textové kotvy v autoritativním oddílu; nejde o parser ani důkaz poslušnosti LLM.
  T('PŘÍSNOST STATIKA: prototyp má jeden cílený průchod ~15 min a limit není PASS',
    all(policy, [/prototyp:/, /(?:1|jeden) cílený průchod/, /(?:přibližně|cca|asi|~)\s*15\s*min(?:ut)?\b/,
      /limit času není důkaz/, /(?:důkaz\/pass|ani (?:automatický )?pass)/,
      /bez (?:potřebného )?důkazu/, /neprůkazné/, /pokrytí/, /neověřené oblasti/,
      /další kolo jen pro/, /reprodukovanou konkrétní blokující chybu/]), true);
  T('PŘÍSNOST STATIKA: rozsah docs/API/UI a spouštěče plného auditu jsou vymezené',
    all(policy, [/dokumentace (?:bez ui|nevyžaduje ui)/,
      /(?:api změna s api testem|změna api vyžaduje test api)/,
      /ui změna (?:s dotčeným tokem|jen dotčený tok)/,
      /plný audit spouští/, /milník/, /výslovný pokyn vlastníka/, /exposure/,
      /změna auth\s*\/\s*autorizace/, /změna práce s daty/, /závislosti/]), true);
  T('PŘÍSNOST STATIKA: bariéry a release gate vyžadují úplné pokrytí blokujícího dopadu',
    all(policy, [/bezpečnostní bariéry/, /permissions/, /guardy/, /kotva důvěry/, /oprávnění/,
      /platí ve všech profilech/, /release gate:/, /\bpass\b/, /\bscoped_pass\b/,
      /scoped_pass jen (?:když|pokud)/, /doložený rozsah/, /plně pokrývá blokující dopad/,
      /aktuálního profilu/, /neověřené blokující riziko ponechá gate 🔴/,
      /otevřený audit dluhu\s*=\s*🔴/, /až do uzavření/, /snížení profilu ho samo nezavře/,
      /relevantní regrese bez selhání/, /cílený re-sken bez nového blokujícího nálezu/,
      /časový limit nikdy nezelení gate/, /souhlasem vlastníka/]), true);

  const levels = ['prototyp', 'osobni', 'bezny', 'kriticky'];
  const allRulesAgree = levels.every(level => {
    if (typeof RULES[level] !== 'string') return false;
    const rule = normalize(RULES[level]);
    if (!all(rule, [/§přísnost/, /claude\.md/, /cílen|dotčen|důkladn/])) return false;
    const expectedBlock = {
      prototyp: /blokuje jen P0[^;]*(ztráta dat|data)[^;]*tajemství[^;]*stroj/i,
      osobni: /blokuje P0\s*\+\s*P1 bezpečnost/i,
      bezny: /blokuje všechny P0\s*\/\s*P1/i,
      kriticky: /blokuje P0\s*\/\s*P1\s*\+\s*P2 bezpečnost/i,
    }[level];
    if (!expectedBlock.test(rule)) return false;
    if (level !== 'prototyp' && !new RegExp(`asvs l${{ osobni: 1, bezny: 2, kriticky: 3 }[level]}\\b`).test(rule)) return false;
    if (level === 'kriticky' ? !/ci 2\s*[×x]\s*zelené/.test(rule) :
        level !== 'prototyp' && !/ci 1\s*[×x]/.test(rule)) return false;
    return !/ASVS[^;,.]*certifikac/i.test(rule) &&
      !/plný\s+ui[- ]crawl/i.test(rule) &&
      !/plný audit\s+(?:při každé|pro každou|každé změně)/i.test(rule);
  });
  T('PŘÍSNOST STATIKA: RULES pro všechny čtyři úrovně souhlasí se scope a ASVS cíli', allRulesAgree, true);
  T('PŘÍSNOST STATIKA: ASVS cíle nejsou prezentované jako certifikace',
    all(policy, [/asvs/, /bezpečnostní cíle/, /(?:ne časový rozpočet|nikoli .*?rozpoč(?:et|tu))/,
      /(?:ani důkaz shody|neprokazuje shodu)/]) &&
      levels.filter(level => level !== 'prototyp').every(level =>
        all(normalize(RULES[level]), [/bezpečnostní cíl/, /asvs/])), true);

  const generalChecklistUi = /UI\/design,?\s*(?:je )?povinně|UI\s+smoke[^.;:]*(?:každé|každou|všechny změny)/i;
  T('PŘÍSNOST STATIKA: položky checklistu pro all P0/P1 a UI smoke nejsou univerzální povinnost',
    !has(checklist, generalChecklistUi) &&
      has(checklist, /Z vybraného rozsahu dle §Přísnost/i) &&
      has(checklist, /UI\/design, jen dotčený tok dle §Přísnost/i), true);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = [];
  const T = (name, got, expected) => results.push({ name, got, expected, ok: got === expected });
  const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  try { runPrisnostPolicyTests({ T, pkg }); }
  catch (error) { console.error(error); process.exitCode = 1; }
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
  process.exitCode = process.exitCode || (results.every(result => result.ok) ? 0 : 1);
}
