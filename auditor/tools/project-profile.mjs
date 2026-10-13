import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_FILES = 10000;
const MAX_PRIORITY_MANIFESTS = 500;
const MAX_PRIORITY_PRISMA_FILES = 100;
const MAX_ENTRIES = 20000;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DEPTH = 24;
const WORKSPACE_DEPTH = 6;
const MAX_EVIDENCE = 100;
const MAX_PURPOSE_EVIDENCE = 20;
const MAX_LIMITATIONS = 30;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'build', 'dist', 'out', '.venv', 'venv', 'audit', '.claude', '.codex', '.agents', '.next', 'coverage', '__pycache__', '.vs', 'third_party', '_deps', '.tmp', 'tmp', 'temp', '.cache', '.playwright-mcp', 'playwright-report', 'test-results', 'archive', 'archives', '__archives__']);
const SECRET_NAME = /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i;
const WEB_FRAMEWORKS = new Set(['next', 'react-dom', 'vue', 'angular', 'svelte', 'nuxt', 'astro', 'remix', 'gatsby', 'express', 'fastify', 'koa', 'hono', 'flask', 'django', 'fastapi', 'starlette', 'spring-boot', 'asp.net']);
const API_FRAMEWORKS = new Set(['express', 'fastify', 'koa', 'hono', 'flask', 'django', 'fastapi', 'starlette', 'spring-boot', 'asp.net']);
const DB_MARKERS = new Map([
  ['pg', 'postgresql'], ['postgres', 'postgresql'], ['postgresql', 'postgresql'],
  ['supabase/supabase-js', 'postgresql'], ['supabase', 'postgresql'],
  ['npgsql', 'postgresql'], ['psycopg', 'postgresql'], ['psycopg2', 'postgresql'],
]);

function normalizeName(value) {
  return String(value).toLowerCase().replace(/^@/, '').replace(/[_-]+/g, '-');
}

function maskPrismaCommentsAndStrings(text) {
  let result = '';
  let state = 'code';
  let quote = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (state === 'line-comment') {
      if (char === '\n') { result += '\n'; state = 'code'; } else result += ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') { result += '  '; index++; state = 'code'; }
      else result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (state === 'string') {
      result += char === quote ? quote : char === '\n' ? '\n' : ' ';
      if (char === '\\') { if (next !== undefined) { result += next === '\n' ? '\n' : ' '; index++; } }
      else if (char === quote) state = 'code';
      continue;
    }
    if (char === '/' && next === '/') { result += '  '; index++; state = 'line-comment'; }
    else if (char === '/' && next === '*') { result += '  '; index++; state = 'block-comment'; }
    else if (char === '"') { result += char; quote = char; state = 'string'; }
    else result += char;
  }
  return result;
}

function hasPostgresPrismaDatasource(text) {
  const code = maskPrismaCommentsAndStrings(text);
  const datasourcePattern = /\bdatasource\s+[A-Za-z_][\w]*\s*\{/g;
  let match;
  while ((match = datasourcePattern.exec(code))) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (end < code.length && depth > 0) {
      if (code[end] === '{') depth++;
      if (code[end] === '}') depth--;
      end++;
    }
    if (depth !== 0) continue;
    const blockStart = match.index + match[0].length;
    const blockCode = code.slice(blockStart, end - 1);
    const providerPattern = /\bprovider\s*=\s*/g;
    let provider;
    while ((provider = providerPattern.exec(blockCode))) {
      const originalValue = text.slice(blockStart + provider.index + provider[0].length).match(/^\s*"([^"\\]*)"/);
      if (originalValue?.[1] === 'postgresql') return true;
    }
    datasourcePattern.lastIndex = end;
  }
  return false;
}

function profileProject(projectDir, { filesystem = fs } = {}) {
  const root = path.resolve(projectDir);
  const rootStat = filesystem.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new TypeError('projectDir must be a real directory');

  const files = [];
  const limitations = new Set();
  const seenLimitations = new Set();
  let limitationCount = 0;
  const addLimitation = value => {
    if (value.length > 320) value = `${value.slice(0, 300)}…`;
    if (seenLimitations.has(value)) return;
    seenLimitations.add(value);
    limitationCount++;
    if (limitations.size < MAX_LIMITATIONS) limitations.add(value);
  };
  let truncated = false;
  let scanIncomplete = false;
  let entriesVisited = 0;
  let skippedArtifactDirectories = 0;
  const seenFiles = new Set();
  let priorityManifestFiles = 0;
  let priorityPrismaFiles = 0;
  const isPriorityManifest = name => /^(?:package\.json|requirements(?:-dev)?\.txt|pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|CMakeLists\.txt)$/i.test(name);
  const addFile = (full, name, depth, priorityManifest = false, priorityPrisma = false) => {
    if (seenFiles.has(full)) return;
    if (priorityPrisma && priorityPrismaFiles >= MAX_PRIORITY_PRISMA_FILES) { truncated = true; scanIncomplete = true; return; }
    const hasManifestBudget = priorityManifest && priorityManifestFiles < MAX_PRIORITY_MANIFESTS;
    const hasPrismaBudget = priorityPrisma && priorityPrismaFiles < MAX_PRIORITY_PRISMA_FILES;
    if (files.length >= MAX_FILES && !hasManifestBudget && !hasPrismaBudget) {
      truncated = true; scanIncomplete = true; return;
    }
    if (files.length >= MAX_FILES && hasManifestBudget) priorityManifestFiles++;
    if (priorityPrisma) priorityPrismaFiles++;
    seenFiles.add(full);
    files.push({ full, rel: path.relative(root, full).split(path.sep).join('/'), name, depth });
  };
  // Root manifests are read before traversal so a large generated subtree cannot hide them.
  for (const name of ['package.json', 'requirements.txt', 'requirements-dev.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'CMakeLists.txt']) {
    const full = path.join(root, name);
    try { const stat = filesystem.lstatSync(full); if (stat.isFile() && !stat.isSymbolicLink()) addFile(full, name, 0, true); } catch {}
  }
  const priority = name => /^(?:apps|packages|src|app|web|frontend|backend|client|server|services|api|supabase|prisma|schema|drizzle|migrations|database|db)$/i.test(name) ? 0 : 1;
  const queue = [{ dir: root, depth: 0 }];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const { dir, depth } = queue[queueIndex++];
    if (depth > MAX_DEPTH) { truncated = true; scanIncomplete = true; continue; }
    let stream;
    try { stream = filesystem.opendirSync(dir, { encoding: 'utf8', bufferSize: 32 }); }
    catch { addLimitation('Některé adresáře nebylo možné přečíst.'); scanIncomplete = true; continue; }
    const childDirs = [];
    try {
      let entry;
      while ((entry = stream.readSync()) !== null) {
        entriesVisited++;
        if (entriesVisited > MAX_ENTRIES) { truncated = true; scanIncomplete = true; break; }
        if (entry.isSymbolicLink()) { addLimitation('Symbolické odkazy jsou přeskočeny.'); continue; }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          let directoryIsLink = false;
          try { directoryIsLink = filesystem.lstatSync(full).isSymbolicLink(); }
          catch { addLimitation('Některé adresáře nebylo možné ověřit.'); scanIncomplete = true; continue; }
          if (directoryIsLink) { addLimitation('Symbolické odkazy jsou přeskočeny.'); continue; }
          if (SKIP_DIRS.has(entry.name.toLowerCase()) || /^cmake-build(?:-|$)/i.test(entry.name)) { skippedArtifactDirectories++; addLimitation('Scaffolding, runtime, cache a archivní složky jsou přeskočeny.'); continue; }
          if (depth < MAX_DEPTH) childDirs.push({ dir: full, depth: depth + 1, name: entry.name });
          else { truncated = true; scanIncomplete = true; }
        } else if (entry.isFile()) addFile(full, entry.name, depth, depth <= WORKSPACE_DEPTH && isPriorityManifest(entry.name), depth <= WORKSPACE_DEPTH && /^.+\.prisma$/i.test(entry.name));
      }
    } catch { addLimitation('Některé adresáře nebylo možné úplně enumerovat.'); scanIncomplete = true; }
    finally { try { stream.closeSync(); } catch {} }
    childDirs.sort((a, b) => priority(a.name) - priority(b.name));
    queue.push(...childDirs.map(({ dir: child, depth: childDepth }) => ({ dir: child, depth: childDepth })));
    if (entriesVisited > MAX_ENTRIES) break;
  }
  if (truncated) addLimitation(`Prohledávání omezeno: max ${MAX_FILES} zdrojových souborů, ${MAX_PRIORITY_MANIFESTS} prioritních manifestů, ${MAX_ENTRIES} položek nebo hloubka ${MAX_DEPTH}.`);

  const languages = new Set();
  const stacks = new Set();
  const databases = new Set();
  const signals = new Set();
  const evidence = [];
  const seenEvidence = new Set();
  const purposeEvidence = new Map();
  const addEvidence = (file, signal, strength = 'medium') => {
    const key = `${file.rel}\0${signal}`;
    if (seenEvidence.has(key)) return;
    seenEvidence.add(key);
    if (evidence.length < MAX_EVIDENCE) evidence.push({ path: file.rel, signal, strength });
  };
  const addPurpose = (purpose, file, strength = 'medium') => {
    if (!purposeEvidence.has(purpose)) purposeEvidence.set(purpose, { byFile: new Map(), total: 0, bestStrength: 'low' });
    const item = purposeEvidence.get(purpose);
    if (item.byFile.has(file.rel)) return;
    item.total++;
    const rank = value => value === 'high' ? 2 : value === 'medium' ? 1 : 0;
    if (rank(strength) > rank(item.bestStrength)) item.bestStrength = strength;
    if (item.byFile.size < MAX_PURPOSE_EVIDENCE) item.byFile.set(file.rel, strength);
    else {
      const weakest = [...item.byFile].sort((a, b) => rank(a[1]) - rank(b[1]))[0];
      if (weakest && rank(strength) > rank(weakest[1])) { item.byFile.delete(weakest[0]); item.byFile.set(file.rel, strength); }
    }
  };

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    if (SECRET_NAME.test(file.name)) { signals.add('tajemstvi'); addEvidence(file, 'tajemstvi', 'weak'); }
    if (/\.(?:sh|bash|zsh|bat|cmd|ps1)$/i.test(file.name)) { signals.add('skripty'); addEvidence(file, 'skripty', 'medium'); addPurpose('skriptování', file); }
    if (/\.(?:js|mjs|cjs|jsx)$/i.test(file.name)) { languages.add('javascript'); signals.add('javascript'); addEvidence(file, 'javascript', 'medium'); }
    if (/\.(?:ts|tsx|mts|cts)$/i.test(file.name)) { languages.add('typescript'); signals.add('typescript'); addEvidence(file, 'typescript', 'medium'); }
    if (ext === '.py' || file.name === 'pyproject.toml' || file.name === 'requirements.txt') { languages.add('python'); signals.add('python'); addEvidence(file, 'python', ext === '.py' ? 'medium' : 'weak'); }
    if (ext === '.c') { languages.add('c'); signals.add('c'); addEvidence(file, 'c', 'medium'); }
    if (/\.(?:cc|cpp|cxx|hh|hpp|hxx)$/i.test(file.name)) { languages.add('cpp'); signals.add('cpp'); addEvidence(file, 'cpp', 'medium'); }
    if (/\.(?:bas|cls)$/i.test(file.name)) { languages.add('basic'); signals.add('vba-neověřeno'); addEvidence(file, 'vba-neověřeno', 'weak'); addLimitation('Přípona .bas/.cls sama nerozliší BASIC a VBA.'); }
    else if (/\.(?:xlsm|xlsb)$/i.test(file.name)) { addEvidence(file, 'vba-neověřeno', 'weak'); addLimitation('Obsah sešitu nebyl čten; přítomnost VBA nelze potvrdit.'); }
    if (ext === '.sql') { languages.add('sql'); signals.add('sql'); addEvidence(file, 'sql', 'medium'); }
    if (/\.(?:spec|test)\.(?:js|mjs|cjs|jsx|ts|tsx|c|cc|cpp|cxx)$/i.test(file.name) || /(?:^|\/)(?:tests?|test)\//i.test(file.rel)) {
      signals.add('testovani'); addEvidence(file, 'testovani', 'weak'); addPurpose('testování', file, 'weak');
    }
    if (file.depth <= WORKSPACE_DEPTH && /(?:^|\/)(?:supabase)\/config\.toml$/i.test(file.rel)) {
      databases.add('postgresql'); signals.add('postgres'); stacks.add('supabase'); addEvidence(file, 'postgres', 'medium');
    }
    if (file.depth <= WORKSPACE_DEPTH && /\.prisma$/i.test(file.name)) {
      try {
        if (filesystem.statSync(file.full).size > MAX_FILE_BYTES) throw new Error('large');
        if (hasPostgresPrismaDatasource(filesystem.readFileSync(file.full, 'utf8'))) {
          databases.add('postgresql'); signals.add('postgres'); stacks.add('prisma'); addEvidence(file, 'postgres', 'high');
        }
      } catch { addLimitation(`Prisma schema ${file.rel} nebylo možné bezpečně ověřit.`); scanIncomplete = true; }
    }
  }

  const packageFiles = files.filter(file => file.name === 'package.json' && file.depth <= WORKSPACE_DEPTH);
  if (files.some(file => file.name === 'package.json' && file.depth > WORKSPACE_DEPTH)) {
    addLimitation('Vnořené package.json za hloubkou 6 nebyly vyhodnoceny.');
    scanIncomplete = true;
  }
  for (const file of packageFiles) {
    if (file.depth > WORKSPACE_DEPTH) continue;
    try {
      if (filesystem.statSync(file.full).size > MAX_FILE_BYTES) { addLimitation(`Manifest ${file.rel} překročil limit velikosti.`); scanIncomplete = true; continue; }
      const manifest = JSON.parse(filesystem.readFileSync(file.full, 'utf8').replace(/^\uFEFF/, ''));
      const deps = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies };
      const names = Object.keys(deps).map(normalizeName);
      if (names.includes('capacitor/core') && names.some(name => ['capacitor/android', 'capacitor/ios'].includes(name))) {
        stacks.add('capacitor'); signals.add('mobile-hybrid'); addEvidence(file, 'mobile-hybrid', 'high'); addPurpose('mobilní aplikace', file, 'high');
      }
      const isTypescriptTooling = names.includes('typescript');
      if (isTypescriptTooling) { stacks.add('typescript-tooling'); addEvidence(file, 'typescript-tooling', 'weak'); addLimitation(`Manifest ${file.rel} deklaruje TypeScript tooling; zdrojů TS nebylo tímto důkazem potvrzeno.`); }
      if (names.includes('react')) stacks.add('react');
      if (names.includes('vite')) stacks.add('vite');
      for (const raw of Object.keys(deps)) {
        const dep = normalizeName(raw);
        const db = DB_MARKERS.get(dep) || (dep === 'npgsql' ? 'postgresql' : null);
        if (db) { databases.add(db); signals.add('postgres'); stacks.add(dep); addEvidence(file, 'postgres', 'high'); }
        if (WEB_FRAMEWORKS.has(dep)) { stacks.add(dep); signals.add('web'); addEvidence(file, 'web', 'high'); addPurpose('webová aplikace', file, 'high'); }
        if (API_FRAMEWORKS.has(dep)) { signals.add('api'); addEvidence(file, 'api', 'high'); addPurpose('API nebo server', file, 'high'); }
        if (['playwright', '@playwright/test', 'cypress', 'webdriverio'].includes(raw.toLowerCase())) {
          signals.add('e2e'); signals.add('testovani'); stacks.add(dep); addEvidence(file, 'e2e', 'high'); addPurpose('testování', file, 'high');
        } else if (['vitest', 'jest', 'mocha', 'tap'].includes(raw.toLowerCase())) {
          signals.add('testovani'); stacks.add(dep); addEvidence(file, 'testovani', 'medium'); addPurpose('testování', file, 'medium');
        }
      }
      if (manifest.workspaces) addEvidence(file, 'workspace', 'medium');
      if (manifest.scripts && typeof manifest.scripts === 'object' && Object.keys(manifest.scripts).length) {
        signals.add('skripty'); addEvidence(file, 'skripty', 'weak');
      }
    } catch {
      scanIncomplete = true;
      addLimitation(`Manifest ${file.rel} nebyl platný JSON nebo jej nebylo možné přečíst.`);
      addEvidence(file, 'manifest-neověřen', 'weak');
    }
  }

  for (const file of files) {
    const base = file.name.toLowerCase();
    if (base === 'requirements.txt' || base === 'requirements-dev.txt') {
      try {
        if (filesystem.statSync(file.full).size > MAX_FILE_BYTES) throw new Error('large');
        const text = filesystem.readFileSync(file.full, 'utf8');
        for (const match of text.matchAll(/^\s*([A-Za-z0-9_.-]+)(?:\s*[<>=!~;[]|\s*$)/gm)) {
          const name = normalizeName(match[1]);
          if (DB_MARKERS.has(name)) { databases.add('postgresql'); signals.add('postgres'); stacks.add(name); addEvidence(file, 'postgres', 'high'); }
          if (WEB_FRAMEWORKS.has(name)) { stacks.add(name); signals.add('web'); addEvidence(file, 'web', 'high'); addPurpose('webová aplikace', file, 'high'); }
          if (API_FRAMEWORKS.has(name)) { signals.add('api'); addEvidence(file, 'api', 'high'); addPurpose('API nebo server', file, 'high'); }
        }
      } catch { addLimitation(`Závislosti v ${file.rel} jsou neověřené.`); scanIncomplete = true; }
    }
    if (/^(?:pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml)$/i.test(base)) {
      addLimitation(`Manifest ${base} nemá vestavěný parser; jeho závislosti jsou neověřené.`);
    }
    if (base === 'cmakelists.txt' || /\.vcxproj$/i.test(base)) {
      try {
        if (filesystem.statSync(file.full).size > MAX_FILE_BYTES) throw new Error('large');
        const text = filesystem.readFileSync(file.full, 'utf8');
        const qtFound = /find_package\s*\(\s*Qt\d*|Qt\d+::|QtCore/i.test(text);
        const qtGui = /find_package\s*\(\s*Qt\d*[^)]*(?:Widgets|Gui|Quick)|Qt\d+::(?:Widgets|Gui|Quick)|Qt(?:Widgets|Gui|Quick)|QApplication|QGuiApplication|QQuickView/i.test(text);
        const win = /Windows\.h|Windows SDK|WIN32_EXECUTABLE|Qt\d+::WinMain/i.test(text);
        if (qtFound) stacks.add('qt');
        if (qtGui) { addEvidence(file, 'desktop-cpp', 'high'); addPurpose('desktopová aplikace', file, 'high'); }
        if (win) { stacks.add('windows-desktop'); addEvidence(file, 'desktop-cpp', 'medium'); addPurpose('desktopová aplikace', file, 'medium'); }
      } catch { addLimitation(`Build marker ${file.rel} nebyl ověřen.`); scanIncomplete = true; }
    }
    if (/^vite\.config\./i.test(base)) stacks.add('vite');
    if (/^(?:next|nuxt|astro|angular|svelte|remix)\.config\./i.test(base)) {
      const framework = base.split('.')[0];
      stacks.add(framework); signals.add('web'); addEvidence(file, 'web', 'medium'); addPurpose('webová aplikace', file, 'medium');
    }
  }

  const macroFiles = files.filter(file => /\.(?:bas|cls)$/i.test(file.name));
  const workbookFiles = files.filter(file => /\.(?:xlsm|xlsb)$/i.test(file.name));
  const exportFiles = files.filter(file => /\.(?:csv|tsv)$/i.test(file.name) || /(?:^|\/)(?:exports?|exporty)\//i.test(file.rel));
  if (macroFiles.length && workbookFiles.length && exportFiles.length) {
    for (const file of [...macroFiles, ...workbookFiles, ...exportFiles]) addPurpose('automatizace tabulek', file, 'low');
  }

  if (databases.has('postgresql')) { signals.add('postgres'); addPurpose('databázová aplikace', evidence.find(item => item.signal === 'postgres') ? { rel: evidence.find(item => item.signal === 'postgres').path } : { rel: 'supabase/config.toml' }, 'high'); }
  if (languages.size > 1) signals.add('mixed');
  if (!languages.size) signals.add('unknown');

  const purposes = [...purposeEvidence].map(([name, { byFile, total, bestStrength }]) => {
    const confidence = bestStrength === 'weak' ? 'low' : bestStrength;
    return { name, confidence, evidence: [...byFile].map(([file, strength]) => ({ path: file, strength })), evidence_count: total, evidence_truncated: total > byFile.size };
  });
  if (!files.length) addLimitation('Projekt neobsahuje rozpoznané soubory.');
  if (files.some(file => /^(?:pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml)$/i.test(file.name))) {
    addLimitation('Některé manifesty nemají vestavěný parser; závislosti z nich nemusí být úplné.');
  }
  const confidence = truncated || scanIncomplete ? 'low' : evidence.length > 0 ? 'medium' : 'low';
  evidence.sort((a, b) => a.path.localeCompare(b.path) || a.signal.localeCompare(b.signal));
  const totalEvidence = seenEvidence.size;
  return {
    languages: [...languages].sort(), stacks: [...stacks].sort(), databases: [...databases].sort(), purposes,
    signals: [...signals].sort(), evidence, evidenceSummary: { total: totalEvidence, shown: evidence.length, truncated: totalEvidence > evidence.length },
    counts: { filesScanned: files.length, entriesVisited, skippedArtifactDirectories, limitations: limitationCount },
    confidence, limitations: [...limitations].sort(), limitationSummary: { total: limitationCount, shown: limitations.size, truncated: limitationCount > limitations.size },
  };
}

export { profileProject };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const target = process.argv[2];
  if (!target) {
    process.stderr.write('Použití: node tools/project-profile.mjs <repo>\n');
    process.exitCode = 2;
  } else {
    try { process.stdout.write(`${JSON.stringify(profileProject(target), null, 2)}\n`); }
    catch (error) { process.stderr.write(`Profil projektu nelze vytvořit${error?.code ? ` (${error.code})` : ''}.\n`); process.exitCode = 1; }
  }
}
