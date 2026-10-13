#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { profileProject } from './project-profile.mjs';

const MAX_FILES = 10000;
const MAX_ENTRIES = 20000;
const MAX_DEPTH = 18;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_FINDINGS = 100;
const SKIP = new Set(['.git', 'node_modules', 'vendor', 'build', 'dist', 'out', '.venv', 'venv', 'AUDIT', '.next', 'coverage', '__pycache__', '.vs', 'third_party', '_deps', '.tmp', 'tmp', 'temp', '.cache', 'debug', 'telemetry', 'file-history', 'session-env', 'shell-snapshots', 'todos', 'statsig', '.trash', '.archive', '.archives', 'zip-check']);
const SKIP_CONFIG_PATHS = new Set(['.claude/worktrees', '.claude/projects', '.claude/plugins', '.claude/tasks', '.claude/cache', '.codex/worktrees', '.codex/sessions', '.codex/cache']);
const CATALOG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../katalog/katalog.json');

const digest = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const readUtf8 = (filesystem, file) => filesystem.readFileSync(file, 'utf8');
const lineOf = (text, pattern) => {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex(line => pattern.test(line));
  return index < 0 ? 1 : index + 1;
};
const normalizePath = value => value.split(path.sep).join('/');

function auditConfiguration(repoDir, { home = os.homedir(), codexHome = process.env.CODEX_HOME || path.join(home, '.codex'), harness = 'all', includeShared = true, filesystem = fs } = {}) {
  if (!['claude', 'codex', 'all'].includes(harness)) throw new TypeError('harness must be claude, codex, or all');
  const repo = path.resolve(repoDir);
  const homeDir = path.resolve(home);
  const codexHomeDir = path.resolve(codexHome);
  const repoStat = filesystem.lstatSync(repo);
  if (!repoStat.isDirectory() || repoStat.isSymbolicLink()) throw new TypeError('repo must be a real directory');

  const inventory = [];
  const limitations = new Set([
    'Efektivní konfiguraci hostitele nelze určit; deklarace souborů nedokazuje aktivaci ani použití.',
    'Usage bez kompatibilní telemetrie zůstává neznámé.',
    'Manifest potvrzuje deklarované katalogové ID, ne původ ani integritu konkrétního souboru.',
  ]);
  let truncated = false;
  let incomplete = false;
  let entriesVisited = 0;
  let entryLimitReached = false;
  const filesByScope = { project: [], parent: [], user: [] };

  function sourcePath(scope, full) {
    if (scope === 'user') {
      const codexRelative = path.relative(codexHomeDir, full);
      if (codexRelative && codexRelative !== '..' && !codexRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(codexRelative)) return `$CODEX_HOME/${normalizePath(codexRelative)}`;
      return `$USER/${normalizePath(path.relative(homeDir, full))}`;
    }
    const relative = path.relative(repo, full);
    return normalizePath(relative || path.basename(full));
  }

  function walk(base, scope, depth = 0) {
    if (depth > MAX_DEPTH || filesByScope[scope].length >= MAX_FILES) { truncated = true; incomplete = true; return; }
    if (entriesVisited >= MAX_ENTRIES) { truncated = true; incomplete = true; entryLimitReached = true; return; }
    let stream;
    try {
      const stat = filesystem.lstatSync(base);
      if (stat.isSymbolicLink() || !stat.isDirectory()) { limitations.add('Symbolické nebo neadresářové skenovací kořeny jsou přeskočeny.'); return; }
      stream = filesystem.opendirSync(base, { encoding: 'utf8', bufferSize: 32 });
    } catch (error) { limitations.add(`${scope}: některé složky nejsou čitelné${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; return; }
    try {
      let entry;
      while ((entry = stream.readSync()) !== null) {
        entriesVisited++;
        if (filesByScope[scope].length >= MAX_FILES || entriesVisited > MAX_ENTRIES) { truncated = true; incomplete = true; if (entriesVisited > MAX_ENTRIES) entryLimitReached = true; return; }
        if (entry.isSymbolicLink()) { limitations.add('Symbolické odkazy jsou přeskočeny.'); continue; }
        const full = path.join(base, entry.name);
        if (entry.isDirectory()) {
          const rel = normalizePath(path.relative(scope === 'user' ? homeDir : repo, full)).toLowerCase();
          const segments = rel.split('/');
          const codexRel = scope === 'user' ? normalizePath(path.relative(codexHomeDir, full)).toLowerCase() : rel;
          const configSegments = rel.split('/');
          const inPrivateWorktree = configSegments.some((segment, index) =>
            (segment === '.claude' || segment === '.codex') && configSegments[index + 1] === 'worktrees');
          if (SKIP.has(entry.name.toLowerCase()) || /^cmake-build(?:-|$)/i.test(entry.name) || segments.some(segment => /^\.trash(?:$|-)/.test(segment)) || SKIP_CONFIG_PATHS.has(codexRel) || inPrivateWorktree) continue;
          walk(full, scope, depth + 1);
        } else if (entry.isFile()) {
          const rel = sourcePath(scope, full);
          filesByScope[scope].push({ full, rel, name: entry.name, depth });
        }
      }
    } catch (error) { limitations.add(`${scope}: adresář nebylo možné úplně enumerovat${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; }
    finally { try { stream.closeSync(); } catch {} }
  }

  walk(repo, 'project');
  const addUserFile = rel => {
    const full = path.join(homeDir, rel);
    try {
      const stat = filesystem.lstatSync(full);
      if (!stat.isFile() || stat.isSymbolicLink()) return;
      filesByScope.user.push({ full, rel: `$USER/${normalizePath(rel)}`, name: path.basename(rel), depth: 0 });
    } catch (error) { if (error?.code !== 'ENOENT') { limitations.add(`User konfigurace ${rel} není čitelná${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; } }
  };
  const addCodexHomeFile = rel => {
    const full = path.join(codexHomeDir, rel);
    try {
      const stat = filesystem.lstatSync(full);
      if (!stat.isFile() || stat.isSymbolicLink()) return;
      filesByScope.user.push({ full, rel: `$CODEX_HOME/${normalizePath(rel)}`, name: path.basename(rel), depth: 0 });
    } catch (error) { if (error?.code !== 'ENOENT') { limitations.add(`Codex user konfigurace ${rel} není čitelná${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; } }
  };
  if (includeShared) {
    for (const rel of [
      '.agents/skills', '.claude/rules', '.claude/skills', '.claude/agents', '.claude/hooks',
    ]) {
      const full = path.join(homeDir, rel);
      try { const stat = filesystem.lstatSync(full); if (stat.isDirectory() && !stat.isSymbolicLink()) walk(full, 'user'); }
      catch (error) { if (error?.code !== 'ENOENT') { limitations.add(`User konfigurace ${rel} není čitelná${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; } }
    }
    for (const rel of ['.claude/settings.json', '.claude/settings.local.json', '.claude.json']) addUserFile(rel);
    if (harness !== 'codex') addUserFile('.claude/CLAUDE.md');
    if (harness !== 'claude') {
      for (const rel of ['AGENTS.md', 'AGENTS.override.md', 'config.toml', 'config.json', 'katalog.json']) addCodexHomeFile(rel);
      for (const rel of ['agents', 'hooks']) {
        const full = path.join(codexHomeDir, rel);
        try { const stat = filesystem.lstatSync(full); if (stat.isDirectory() && !stat.isSymbolicLink()) walk(full, 'user'); }
        catch (error) { if (error?.code !== 'ENOENT') { limitations.add(`Codex user konfigurace ${rel} není čitelná${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; } }
      }
    }
  }
  if (truncated) limitations.add(`Inventura byla omezena na ${MAX_FILES} souborů nebo hloubku ${MAX_DEPTH}.`);
  if (entryLimitReached) limitations.add(`Počet prohlédnutých položek adresářů je omezen na ${MAX_ENTRIES}.`);

  const readBoundedJson = file => {
    const stat = filesystem.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw Object.assign(new Error('not a regular file'), { code: 'EINVAL' });
    if (stat.size > MAX_TEXT_BYTES) throw Object.assign(new Error('file too large'), { code: 'EFBIG' });
    const raw = readUtf8(filesystem, file).replace(/^\uFEFF/, '');
    return { raw, data: JSON.parse(raw) };
  };

  // Instrukce přímo v rodičovských složkách mají vlastní scope; čtou se pouze AGENTS/CLAUDE texty.
  if (includeShared) {
    for (let dir = path.dirname(repo), depth = 0; dir && dir !== path.dirname(dir) && depth < MAX_DEPTH; dir = path.dirname(dir), depth++) {
      const parentNames = harness === 'claude' ? ['CLAUDE.md', 'CLAUDE.local.md'] : harness === 'codex' ? ['AGENTS.override.md', 'AGENTS.md'] : ['AGENTS.override.md', 'AGENTS.md', 'CLAUDE.md', 'CLAUDE.local.md'];
      for (const name of parentNames) {
          const full = path.join(dir, name);
        try {
          const stat = filesystem.lstatSync(full);
          if (stat.isSymbolicLink() || !stat.isFile()) continue;
          filesByScope.parent.push({ full, rel: normalizePath(path.relative(repo, full)) || `../${name}`, name, depth });
        } catch (error) { if (error?.code !== 'ENOENT') { limitations.add(`Rodičovský soubor ${name} není čitelný${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; } }
      }
    }
  }

  const shadowedCodexInstructions = new Set();
  const emptyCodexOverrides = new Set();
  if (harness !== 'claude') {
    for (const scope of ['project', 'parent', 'user']) {
      const grouped = new Map();
      for (const file of filesByScope[scope]) {
        if (!['AGENTS.md', 'AGENTS.override.md'].includes(file.name)) continue;
        const directory = path.dirname(file.full);
        const group = grouped.get(directory) || {};
        group[file.name] = file;
        grouped.set(directory, group);
      }
      for (const group of grouped.values()) {
        if (!group['AGENTS.override.md']) continue;
        try {
          const stat = filesystem.statSync(group['AGENTS.override.md'].full);
          if (stat.size > MAX_TEXT_BYTES) continue;
          const overrideText = readUtf8(filesystem, group['AGENTS.override.md'].full);
          if (overrideText.trim()) {
            if (group['AGENTS.md']) shadowedCodexInstructions.add(group['AGENTS.md'].full);
          } else emptyCodexOverrides.add(group['AGENTS.override.md'].full);
        } catch { }
      }
    }
  }

  const includeClaude = harness !== 'codex';
  const readManifestIds = (scope, targetHarness) => {
    const ids = new Map();
    let found = false;
    let failed = false;
    if (harness !== 'all' && harness !== targetHarness) return { ids, status: 'not-applicable' };
    const dir = targetHarness === 'codex' ? '.codex' : '.claude';
    const baseDir = scope === 'user' ? (targetHarness === 'codex' ? codexHomeDir : homeDir) : repo;
    const file = path.join(baseDir, dir, 'katalog.json');
    try {
      const { data } = readBoundedJson(file); found = true;
      const active = data?.aktivni;
      if (active && typeof active === 'object' && !Array.isArray(active)) for (const id of Object.keys(active)) ids.set(id, sourcePath(scope, file));
    } catch (error) { if (error?.code !== 'ENOENT') { failed = true; limitations.add(`Katalogový manifest ${sourcePath(scope, file)} není ověřitelný${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; } }
    return { ids, status: failed ? 'unknown' : found ? 'available' : 'absent' };
  };
  const catalogIds = {
    project: { claude: readManifestIds('project', 'claude'), codex: readManifestIds('project', 'codex') },
    user: includeShared ? { claude: readManifestIds('user', 'claude'), codex: readManifestIds('user', 'codex') }
      : { claude: { ids: new Map(), status: 'absent' }, codex: { ids: new Map(), status: 'absent' } },
  };
  let catalog;
  try { catalog = readBoundedJson(CATALOG).data; }
  catch { catalog = { polozky: [] }; limitations.add('Vestavěný katalog položek není dostupný; kontrola relevance se přeskočila.'); incomplete = true; }
  const catalogById = Object.fromEntries((catalog.polozky || []).map(item => [item.id, item]));

  const add = ({ kind, scope, file, state = 'present', activation = 'unknown', name, harness: targetHarness = 'shared', text, line, provenanceId, metadata = {} }) => {
    const id = provenanceId || name || path.basename(file.rel).replace(/\.[^.]+$/, '');
    const catalogHarness = targetHarness === 'codex' ? 'codex' : targetHarness === 'claude' ? 'claude' : harness;
    const catalogState = catalogIds[scope]?.[catalogHarness];
    const declarationPath = catalogState?.ids.get(id);
    const provenanceStatus = declarationPath ? 'catalog-declared' : catalogState?.status === 'unknown' ? 'unknown' : 'unmanaged';
    const item = {
      kind, harness: targetHarness, scope, path: file.rel,
      source: { path: file.rel, scope, line: line || 1 },
      state, activation, usage: 'unknown',
      provenance: { status: provenanceStatus, ...(declarationPath ? { catalogId: id, manifestPath: declarationPath } : {}) },
      ...(name ? { name } : {}), ...metadata,
    };
    inventory.push(item);
    return item;
  };

  const parsedDocs = [];
  const jsonRecords = [];
  for (const scope of ['project', 'parent', ...(includeShared ? ['user'] : [])]) {
    for (const file of filesByScope[scope]) {
      if (scope === 'parent' && !['AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', 'CLAUDE.local.md'].includes(file.name)) continue;
      const lower = file.rel.toLowerCase();
      if (file.name === '.env' || /^\.env\./i.test(file.name)) continue;
      const isClaude = lower === '.mcp.json' || /^claude(?:\.local)?\.md$/i.test(file.name) || lower.includes('/.claude/') || lower.startsWith('.claude/') || (scope === 'user' && lower.startsWith('$user/.claude/'));
      const isCodex = /^agents(?:\.override)?\.md$/i.test(file.name) || lower.includes('/.codex/') || lower.startsWith('.codex/') || lower.startsWith('.agents/') || lower.startsWith('$codex_home/') || (scope === 'user' && (lower.startsWith('$user/.codex/') || lower.startsWith('$user/.agents/')));
      if (harness === 'claude' && isCodex || harness === 'codex' && isClaude) continue;

      const isInstruction = /(?:^|\/)(?:AGENTS(?:\.override)?|CLAUDE(?:\.local)?)\.md$/i.test(file.rel) || /\/\.claude\/rules\/.*\.md$/i.test(`/${file.rel}`) || /\/\.agents\/skills\/.*\/SKILL\.md$/i.test(`/${file.rel}`);
      const isRule = /\/\.claude\/rules\/.*\.md$/i.test(`/${file.rel}`);
      const isSkill = /\/skills\/.*\/SKILL\.md$/i.test(`/${file.rel}`);
      const isAgent = /\/agents\/[^/]+\.(?:md|toml)$/i.test(`/${file.rel}`);
      const isHook = /\/hooks\//i.test(`/${file.rel}`);
      const isCodexConfig = /\/\.codex\/(?:config|hooks\/[^/]+)\.toml$/i.test(`/${file.rel}`) || /\/\.codex\/config\.json$/i.test(`/${file.rel}`) || /^\$CODEX_HOME\/(?:config\.toml|config\.json)$/i.test(file.rel);
      const isToml = file.name.toLowerCase().endsWith('.toml');
      const isYaml = /\.(?:yaml|yml)$/i.test(file.name);
      const isJsonConfig = file.name === '.mcp.json' || /\/\.claude\/settings(?:\.local)?\.json$/i.test(`/${file.rel}`) || /\/\.codex\/(?:config|katalog)\.json$/i.test(`/${file.rel}`) || /^\$CODEX_HOME\/config\.json$/i.test(file.rel) || file.name === '.claude.json';
      const isCatalogManifest = /\/\.(?:claude|codex)\/katalog\.json$/i.test(`/${file.rel}`) || /^\$CODEX_HOME\/katalog\.json$/i.test(file.rel);
      if (isInstruction || isSkill || isAgent && !isToml || isHook && !isToml) {
        let text;
        try {
          const size = filesystem.statSync(file.full).size;
          if (size > MAX_TEXT_BYTES) throw Object.assign(new Error('large'), { code: 'EFBIG' });
          text = readUtf8(filesystem, file.full);
          parsedDocs.push({ file, scope, text, hash: digest(text), kind: isSkill ? 'skill' : isAgent ? 'agent' : isHook ? 'hook' : isInstruction ? 'instruction' : 'text' });
        } catch (error) { limitations.add(`Text ${file.rel} není úplný${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; }
        const kind = isRule ? 'rule' : isSkill ? 'skill' : isAgent ? (isCodex ? 'codex-agent' : 'claude-agent') : isHook ? 'hook' : 'instruction';
        const instructionName = path.basename(file.name).toLowerCase();
        const harnessName = isCodex || instructionName === 'agents.md' ? 'codex' : isClaude || instructionName.startsWith('claude') ? 'claude' : 'shared';
        const frontmatter = text?.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const isTopLevelInstruction = !file.rel.includes('/') || /^\.(?:claude|codex)\/(?:AGENTS(?:\.override)?|CLAUDE(?:\.local)?)\.md$/i.test(file.rel);
        const scoped = Boolean(isRule && frontmatter && /^\s*paths\s*:/m.test(frontmatter[1])) || Boolean(isInstruction && !isRule && scope === 'project' && !isTopLevelInstruction);
        const notLoadedCodexParent = scope === 'parent' && harnessName === 'codex' && isInstruction;
        const shadowed = shadowedCodexInstructions.has(file.full);
        const emptyFallback = emptyCodexOverrides.has(file.full);
        add({ kind, scope, file, state: text == null ? 'unknown' : shadowed ? 'shadowed' : emptyFallback ? 'empty-fallback' : 'present', activation: notLoadedCodexParent ? 'not-loaded' : shadowed || emptyFallback ? 'excluded' : 'unknown', text, provenanceId: isSkill ? file.rel.split('/').at(-2) : isAgent ? path.basename(file.name, path.extname(file.name)) : undefined, line: 1, metadata: { lines: text == null ? null : text.split(/\r?\n/).length, characters: text == null ? null : text.length, tokensEstimate: text == null ? null : Math.round(text.length / 3.7), ...(isInstruction || isRule ? { scoped, loadScope: notLoadedCodexParent ? 'not-loaded' : scoped ? 'path' : 'always' } : {}) }, harness: harnessName });
        if (text != null && (isInstruction || isSkill)) {
          text.split(/\r?\n/).forEach((lineText, index) => parsedDocs.push({ file, scope, text: lineText, line: index + 1, hash: '', kind: isSkill ? 'skill-line' : 'instruction-line' }));
        }
        continue;
      }
      if (isCatalogManifest || isJsonConfig) {
        let data;
        try {
          data = readBoundedJson(file.full).data;
        } catch (error) {
          limitations.add(`JSON konfigurace ${file.rel} není ověřitelná${error?.code ? ` (${error.code})` : ''}.`); incomplete = true;
          add({ kind: isCatalogManifest ? 'catalog-manifest' : 'json-config', scope, file, state: 'unknown', harness: isCodex ? 'codex' : isClaude ? 'claude' : 'shared' });
          continue;
        }
        add({ kind: isCatalogManifest ? 'catalog-manifest' : file.name === '.mcp.json' || file.name === '.claude.json' ? 'mcp-config' : 'settings', scope, file, state: 'configured', harness: isCodex ? 'codex' : isClaude ? 'claude' : 'shared' });
        const raw = readBoundedJson(file.full).raw;
        if (isCatalogManifest) {
          for (const id of Object.keys(data?.aktivni || {})) add({ kind: 'catalog-item', scope, file, name: id, state: 'configured', provenanceId: id, line: lineOf(raw, new RegExp(`\\"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\"`)), harness: file.rel.includes('.codex') ? 'codex' : 'claude' });
        } else {
          for (const [key, config] of Object.entries(data?.mcpServers || {})) {
            const at = raw.indexOf(JSON.stringify(key));
            add({ kind: 'mcp-server', scope, file, name: key, state: 'configured', line: at < 0 ? 1 : raw.slice(0, at).split('\n').length, harness: isCodex ? 'codex' : 'claude' });
          }
          for (const event of Object.keys(data?.hooks || {})) add({ kind: 'hook-event', scope, file, name: event, state: 'configured', line: lineOf(raw, new RegExp(`\\"${event}\\"`)), harness: 'claude' });
          for (const plugin of Object.keys(data?.enabledPlugins || {})) add({ kind: 'plugin', scope, file, name: plugin, state: 'configured', line: lineOf(raw, new RegExp(`\\"${plugin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\"`)), harness: 'claude' });
        }
        jsonRecords.push({ file, scope, data, raw });
        continue;
      }
      if (isCodexConfig || isToml || isYaml) {
        let text = null;
        try { if (filesystem.statSync(file.full).size > MAX_TEXT_BYTES) throw Object.assign(new Error('large'), { code: 'EFBIG' }); text = readUtf8(filesystem, file.full); }
        catch (error) { limitations.add(`Konfigurace ${file.rel} není čitelná${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; }
        const allDeclarations = text == null ? [] : text.split(/\r?\n/).map((line, index) => {
          const toml = line.match(/^\s*\[([A-Za-z0-9_. -]+)\]\s*(?:#.*)?$/);
          const yaml = line.match(/^\s*([A-Za-z0-9_.-]+):\s*(?:#.*)?$/);
          return toml || yaml ? { name: (toml || yaml)[1], line: index + 1 } : null;
        }).filter(Boolean);
        const declarations = allDeclarations.slice(0, 100);
        if (allDeclarations.length > declarations.length) { limitations.add(`Deklarace v ${file.rel} byly omezeny na 100 názvů.`); incomplete = true; }
        add({ kind: isAgent ? 'codex-agent' : isHook ? 'codex-hook' : isCodexConfig ? 'codex-config' : 'declaration-file', scope, file, state: 'unknown', harness: isCodex ? 'codex' : 'shared', metadata: { parser: 'not-supported', declarations: declarations.map(item => item.name), lines: text == null ? null : text.split(/\r?\n/).length, characters: text == null ? null : text.length, tokensEstimate: text == null ? null : Math.round(text.length / 3.7) } });
        if (text != null) for (const declaration of declarations) add({ kind: 'declaration', scope, file, name: declaration.name, line: declaration.line, state: 'unknown', harness: isCodex ? 'codex' : 'shared' });
      }
    }
  }

  // ~/.claude.json may contain many unrelated projects. Only the exact canonical target is inspected.
  if (includeShared && includeClaude) {
    const globalClaude = path.join(homeDir, '.claude.json');
    try {
      const { raw, data: parsed } = readBoundedJson(globalClaude);
      const projectConfig = parsed?.projects?.[repo] || parsed?.projects?.[repo.replace(/\\/g, '/')];
      if (projectConfig) {
        const rel = '$USER/.claude.json';
        const file = { full: globalClaude, rel, name: '.claude.json' };
        for (const name of Object.keys(projectConfig.mcpServers || {})) add({ kind: 'mcp-server', scope: 'user', file, name, state: 'configured', harness: 'claude', line: lineOf(raw, new RegExp(`\\"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\"`)) });
      }
    } catch (error) { if (error?.code !== 'ENOENT') { limitations.add(`User Claude JSON není ověřitelný${error?.code ? ` (${error.code})` : ''}.`); incomplete = true; } }
  }

  // Markdown and TOML declaration inventories are bounded metadata; values and commands are never returned.
  const docsOnly = parsedDocs.filter(item => !item.kind.endsWith('-line'));
  const groups = new Map();
  for (const doc of docsOnly.filter(item => item.kind === 'instruction' || item.kind === 'rule' || item.kind === 'skill')) {
    if (!groups.has(doc.hash)) groups.set(doc.hash, []);
    groups.get(doc.hash).push({ path: doc.file.rel, scope: doc.scope, line: 1 });
  }
  const findings = [];
  const candidate = (type, reason, sources, id) => findings.push({ type, status: 'candidate', reason, ...(id ? { id } : {}), sources });
  for (const same of groups.values()) if (same.length > 1) candidate('duplicate-instructions', 'Soubory mají totožný SHA-256 obsah; může jít o duplicitní pravidlo nebo skill.', same.slice(0, 2));

  const scopedRuleFiles = new Set(parsedDocs
    .filter(item => item.kind === 'rule' && /^---\s*\r?\n[\s\S]*?^\s*paths\s*:/m.test(item.text))
    .map(item => item.file.full));
  const isCoactiveInstruction = item => {
    if (item.kind !== 'instruction-line') return false;
    const { file, scope } = item;
    if (scope === 'project' && shadowedCodexInstructions.has(file.full)) return false;
    const rel = file.rel.replace(/\\/g, '/');
    if (scope === 'parent') return /^\.\.\/CLAUDE(?:\.local)?\.md$/i.test(rel);
    if (scope === 'user') {
      return /^\$USER\/(?:AGENTS(?:\.override)?\.md|\.claude\/CLAUDE(?:\.local)?\.md|\.claude\/rules\/[^/]+\.md)$/i.test(rel)
        && !scopedRuleFiles.has(file.full);
    }
    if (scope !== 'project') return false;
    return /^(?:AGENTS(?:\.override)?\.md|CLAUDE(?:\.local)?\.md|\.claude\/CLAUDE\.md)$/i.test(rel)
      || (/^\.claude\/rules\/[^/]+\.md$/i.test(rel) && !scopedRuleFiles.has(file.full));
  };
  const lineDocs = parsedDocs.filter(isCoactiveInstruction);
  const findLine = patterns => lineDocs.filter(item => patterns.some(pattern => pattern.test(item.text))).map(item => ({ path: item.file.rel, scope: item.scope, line: item.line }));
  const autoRelease = findLine([/without (?:owner|user) approval/i, /release (?:is )?(?:automatic|autonomous)/i, /(?:automatic|autonomous) release/i, /vyd[aá]t?[^\n]{0,60}bez[^\n]{0,30}(?:souhlasu|schv[aá]len[ií])/i]);
  const requireApproval = findLine([/(?:require|must get|only .*?can approve)[^\n]{0,80}(?:owner|user) (?:approval|consent)/i, /(?:owner|user) approval[^\n]{0,60}(?:required|before release|must)/i, /vlastn[ií]k[^\n]{0,80}(?:souhlas|schv[aá]len)/i, /jen[^\n]{0,80}v[ýy]slovn[^\n]{0,30}(?:souhlas|schv[aá]len)/i]);
  if (autoRelease.length && requireApproval.length) candidate('instruction-conflict', 'Pokyny se mohou rozcházet v tom, zda vydání vyžaduje souhlas vlastníka.', [autoRelease[0], requireApproval[0]]);
  const forbidsCode = findLine([/(?:do not|must not|never|forbid)[^\n]{0,80}(?:edit|modify|write|change)[^\n]{0,50}(?:code|source|file)/i, /(?:nesm[ií]|neprov[aá]d[eě]j|z[aá]kaz)[^\n]{0,80}(?:uprav|m[eě]ň|zapis|k[oó]d)/i]);
  const forbiddenCodeLocations = new Set(forbidsCode.map(item => `${item.path}:${item.line}`));
  const asksCode = findLine([/\b(?:implement|write|edit|modify)\b[^\n]{0,60}(?:code|source|feature|file)/i, /\b(?:code|source)\b[^\n]{0,60}\b(?:implement|edit|write)\b/i, /\b(?:implementuj|napi[sš]|uprav|m[eě]ň)\b[^\n]{0,80}(?:k[oó]d|zdroj|soubor|funkc)/i]).filter(item => !forbiddenCodeLocations.has(`${item.path}:${item.line}`));
  if (forbidsCode.length && asksCode.length) candidate('instruction-conflict', 'Jeden pokyn zakazuje úpravy kódu a jiný žádá jejich provedení.', [forbidsCode[0], asksCode[0]]);
  const forbidsDelegation = findLine([/(?:do not|must not|never|forbid)[^\n]{0,80}(?:delegate|subagent|sub-agent)/i, /(?:nesm[ií]|nepou[zž][ií]vej|z[aá]kaz)[^\n]{0,80}(?:deleg|subagent|pomocn[ií]k)/i]);
  const forbiddenDelegationLocations = new Set(forbidsDelegation.map(item => `${item.path}:${item.line}`));
  const asksDelegation = findLine([/\b(?:delegate|subagent|sub-agent)\b[^\n]{0,80}(?:code|implementation|work)/i, /\b(?:code|implementation|work)\b[^\n]{0,80}\b(?:delegate|subagent|sub-agent)\b/i, /\b(?:deleguj|subagent|pomocn[ií]k)\b[^\n]{0,80}(?:k[oó]d|implement|pr[aá]ci)/i]).filter(item => !forbiddenDelegationLocations.has(`${item.path}:${item.line}`));
  if (forbidsDelegation.length && asksDelegation.length) candidate('instruction-conflict', 'Jeden pokyn zakazuje delegaci a jiný ji výslovně žádá.', [forbidsDelegation[0], asksDelegation[0]]);

  const projectProfile = profileProject(repo);
  const signals = new Set(projectProfile.signals);
  const activeIds = new Map();
  for (const item of inventory.filter(entry => entry.kind === 'catalog-item')) activeIds.set(item.name, { path: item.path, scope: item.scope, line: item.source.line });
  const relevance = {
    'typescript-reviewer': ['typescript', 'javascript'],
    'security-reviewer': ['web', 'api'],
    'e2e-runner': ['e2e'],
    'e2e-test-designer': ['e2e'],
  };
  for (const [id, source] of activeIds) {
    const expected = relevance[id] || catalogById[id]?.signaly;
    if (!expected?.length) continue;
    const hasEvidence = expected.some(signal => signals.has(signal));
    if (!hasEvidence && projectProfile.confidence === 'low') {
      candidate('catalog-relevance', 'Profil projektu je neúplný; vhodnost aktivní katalogové položky nelze určit.', [source], id);
    } else if (!hasEvidence && projectProfile.languages.length) {
      candidate('catalog-relevance', `Doložené jazyky/stopy projektu neobsahují známé signály položky (${expected.join(', ')}).`, [source], id);
    }
  }

  const totalFindings = findings.length;
  const reportedFindings = findings.slice(0, MAX_FINDINGS);
  if (totalFindings > MAX_FINDINGS) { truncated = true; limitations.add(`Výstup nálezů byl omezen na prvních ${MAX_FINDINGS}.`); }
  const counts = {
    inventory: inventory.length,
    findings: totalFindings,
    findingsReported: reportedFindings.length,
    byState: Object.fromEntries(['present', 'configured', 'unknown'].map(state => [state, inventory.filter(item => item.state === state).length])),
  };
  return {
    repo: '.', harness, includeShared,
    completeness: incomplete || truncated ? 'partial' : 'scanned',
    inventory, findings: reportedFindings, counts, truncated,
    limitations: [...limitations].sort(),
    usage: { status: 'unknown', reason: 'Telemetrie použití není součástí této read-only inventury.' },
  };
}

export { auditConfiguration };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [repoArg, ...args] = process.argv.slice(2);
  if (!repoArg) { process.stderr.write('Použití: node tools/configuration-audit.mjs <repo> [--harness claude|codex|all] [--no-shared]\n'); process.exitCode = 2; }
  else {
    const i = args.indexOf('--harness');
    const harness = i < 0 ? 'all' : args[i + 1];
    try { process.stdout.write(`${JSON.stringify(auditConfiguration(repoArg, { harness, includeShared: !args.includes('--no-shared') }), null, 2)}\n`); }
    catch (error) { process.stderr.write(`Inventuru konfigurace nelze vytvořit${error?.code ? ` (${error.code})` : ''}.\n`); process.exitCode = 1; }
  }
}
