#!/usr/bin/env node
// ENDPOINT PROBE — read-only bezpečnostní sonda proti LOKÁLNÍMU buildu (nikdy produkce bez souhlasu).
// Režimy: anon (bez session), cross-tenant (A čte/mění B), bfla (člen volá admin), malformed (400 ne 500), headers.
// node tools/endpoint-probe.mjs tools/audit.config.json <repo> > AUDIT/01_nalezy/endpoint-probe.json
// Cookies: storageState soubory Playwrightu (tenants.A/B.storageState) → cookie hlavička.
import fs from 'node:fs'; import path from 'node:path';
const [cfgPath, repoArg] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); const repo = path.resolve(repoArg || '.');
if (!/localhost|127\.0\.0\.1/.test(cfg.baseUrl)) { console.error('ODMÍTNUTO: probe jen proti localhost. Produkce vyžaduje výslovný souhlas vlastníka a samostatné spuštění.'); process.exit(2); }
const cookieOf = f => { try { const s = JSON.parse(fs.readFileSync(f, 'utf8')); return s.cookies.map(c => `${c.name}=${c.value}`).join('; '); } catch { return ''; } };
const A = cookieOf(cfg.tenants?.A?.storageState), B = cookieOf(cfg.tenants?.B?.storageState);
const placeholders = JSON.stringify(cfg).match(/\[DOPLŇ[^"\]]*\]|\[DOPLN[^"\]]*\]/g) || [];
if (placeholders.length) { console.error(`NEPRŮKAZNÉ: audit.config.json obsahuje nevyplněné hodnoty: ${[...new Set(placeholders)].join(', ')} — dokonči konfiguraci (sampleIds, storageState).`); process.exit(3); }
if (!A) console.error('VAROVÁNÍ: chybí storageState tenantu A — cross-tenant/BFLA/malformed testy se přeskočí (výsledek je částečný).');

// discover: app/api/**/route.ts → cesta + exportované metody + zda má [param]
const eps = [];
(function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'route.ts' || e.name === 'route.js') { const t = fs.readFileSync(p, 'utf8'); const methods = [...t.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g)].map(m => m[1] || m[2]); const url = '/' + path.relative(path.join(repo, 'app'), path.dirname(p)).split(path.sep).filter(s => !/^\(.*\)$/.test(s)).join('/'); eps.push({ file: path.relative(repo, p), url, methods, hasParam: /\[.+\]/.test(url), hasAuthHint: /auth\(|getServerSession|getSession|requireUser|withAuth|supabase\.auth\.getUser/.test(t), hasTenantHint: /tenantId|tenant_id|orgId/.test(t), hasZod: /safeParse\(|\.parse\(/.test(t) }); } } })(path.join(repo, 'app', 'api'));
const fill = (url, t) => url.replace(/\[(\.\.\.)?(\w+)\]/g, (_, __, k) => (cfg.tenants?.[t]?.sampleIds?.[k] ?? cfg.tenants?.[t]?.sampleIds?.[Object.keys(cfg.tenants?.[t]?.sampleIds || {})[0]] ?? 'x'));
async function call(method, url, { cookie = '', body, headers = {} } = {}) {
  const t0 = Date.now(); try { const r = await fetch(cfg.baseUrl + url, { method, redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }); const txt = await r.text(); return { status: r.status, ms: Date.now() - t0, len: txt.length, snippet: txt.slice(0, 200), h: Object.fromEntries(r.headers) }; } catch (e) { return { status: 0, err: String(e.message) }; }
}
if (!eps.length) { console.error('NEPRŮKAZNÉ: 0 endpointů nalezeno v app/api/**/route.ts — jiný router/framework? Doplň endpoints.manual v configu nebo uprav discovery. Prázdný výsledek NENÍ čistý sken.'); process.exit(3); }
for (const m of (cfg.endpoints?.manual || [])) eps.push({ file: 'manual', url: m.path.replace(/\{(\w+)\}/g, '[$1]'), methods: [m.method], hasParam: /\{/.test(m.path), hasAuthHint: true, hasTenantHint: true, hasZod: true, manualBody: m.body });
const findings = [];
const F = (sev, ep, test, obs, navrh) => findings.push({ priorita: sev, endpoint: `${ep.methods?.join('/') || ''} ${ep.url}`, file: ep.file, test, pozorovani: obs, navrh_reseni: navrh });

for (const ep of eps) {
  const url = fill(ep.url, 'B');
  for (const m of ep.methods.length ? ep.methods : ['GET']) {
    // anon
    const r = await call(m, url, { body: m === 'GET' ? undefined : {} });
    if (r.status === 200 && !/public|health|webhook|lead/i.test(ep.url)) F('P0', ep, 'anon', `HTTP 200 bez session (${r.len} B)`, 'ověřit session na začátku handleru (auth()), fail-closed; nebo endpoint explicitně označit jako veřejný v intake');
    if (r.status >= 500) F('P1', ep, 'anon', `HTTP ${r.status}: ${r.snippet}`, 'A10:2025 — chyba bez session musí být 401/400, ne 500; ošetřit výjimky');
    // cross-tenant: A volá B-id
    if (A && ep.hasParam) { const rA = await call(m, url, { cookie: A, body: m === 'GET' ? undefined : {} }); if (rA.status === 200) F('P0', ep, 'cross-tenant', `tenant A dostal 200 na id tenantu B (${rA.len} B)`, 'BOLA: filtr tenantId ve WHERE + RLS; 404 pro cizí id; červený test = tento probe'); }
    // bfla
    if (A && cfg.endpoints?.adminOnly?.some(p => url.startsWith(p))) { const rA = await call(m, url, { cookie: A, body: m === 'GET' ? undefined : {} }); if (rA.status === 200) F('P1', ep, 'bfla', `člen dostal 200 na admin endpoint`, 'policy check role na serveru (permissions.ts), UI jen zrcadlí'); }
    // malformed
    if (m !== 'GET' && A) { for (const bad of ['{not json', '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"x":1}}}', JSON.stringify({ a: 'x'.repeat(100000) }), { role: 'admin', tenantId: 'x', id: 1, isAdmin: true }]) { const rb = await call(m, url, { cookie: A, body: bad }); if (rb.status >= 500) F('P1', ep, 'malformed', `HTTP ${rb.status} na vstup ${typeof bad === 'string' ? bad : JSON.stringify(bad).slice(0, 40)}: ${rb.snippet}`, 'zod safeParse → 400; limit velikosti body; whitelist polí (mass assignment)'); if (/at\s+\w+\s+\(|\.ts:\d+|prisma|PrismaClient|SELECT\s/i.test(rb.snippet)) F('P1', ep, 'leak', `stack/SQL v odpovědi: ${rb.snippet.slice(0, 120)}`, 'generická chybová hláška, detail jen do serverového logu'); } }
    // metoda navíc
    const rm = await call('TRACE', url); if (rm.status === 200) F('P2', ep, 'method', 'TRACE 200', 'zakázat nepodporované metody');
  }
  if (!ep.hasAuthHint && !/public|health|webhook|lead/i.test(ep.url)) F('P1', ep, 'static', 'v handleru není vidět auth volání', 'auth() / requireUser() jako první řádek, nebo middleware matcher pokrývá /api');
  if (ep.hasParam && !ep.hasTenantHint) F('P1', ep, 'static', 'endpoint s [id] bez tenant filtru v kódu', 'where: {id, tenantId} + RLS');
  if (ep.methods.some(m => m !== 'GET') && !ep.hasZod) F('P2', ep, 'static', 'mutace bez zod validace', 'zod schema + safeParse');
}
// headers
const h = await call('GET', '/');
for (const [k, why] of [['strict-transport-security', 'HSTS'], ['content-security-policy', 'CSP (alespoň default-src self + nonce)'], ['x-content-type-options', 'nosniff'], ['referrer-policy', 'strict-origin-when-cross-origin'], ['permissions-policy', 'omezit camera/geolocation'], ['x-frame-options', 'nebo frame-ancestors v CSP']]) if (!h.h?.[k]) F('P2', { url: '/', file: 'next.config', methods: ['GET'] }, 'headers', `chybí ${k}`, `nastavit v next.config headers(): ${why}`);
if (h.h?.['access-control-allow-origin'] === '*') F('P1', { url: '/', file: 'next.config', methods: ['GET'] }, 'cors', 'ACAO: *', 'explicitní allowlist originů');

const partial = !A || !B;
console.log(JSON.stringify({ baseUrl: cfg.baseUrl, partial, co_neproverovano: partial ? 'bez storageState A/B: cross-tenant, BFLA, malformed, mass assignment' : null, endpoints_discovered: eps.length, endpoints: eps, findings, summary: { P0: findings.filter(f => f.priorita === 'P0').length, P1: findings.filter(f => f.priorita === 'P1').length, P2: findings.filter(f => f.priorita === 'P2').length } }, null, 2));
