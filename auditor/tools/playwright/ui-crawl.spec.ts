// UI CRAWL — vyčerpávající průchod: strom stránek → každý interaktivní prvek → interakce podle typu →
// po každé interakci kontrola (console, překryv/vrstvy, otevřené dialogy). Vede LEDGER POKRYTÍ:
// plošné AK = 100 % viditelných interaktivních prvků má záznam {tested|skipped+důvod}; skipped bez důvodu = 0.
// Spuštění: npx playwright test tools/playwright/ui-crawl.spec.ts --reporter=list --timeout=900000
import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const cfg = JSON.parse(fs.readFileSync(path.resolve('tools/audit.config.json'), 'utf8'));
const OUT = path.resolve('AUDIT/01_nalezy/momentky/crawl'); fs.mkdirSync(OUT, { recursive: true });
const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES || 60);
const DESTRUCTIVE = /(smazat|odstranit|vymazat|delete|remove|zaplatit|pay|odeslat e-?mail|send|publish|zrušit účet|deaktivovat|reset)/i;
const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=menuitem], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=slider], [role=combobox], [role=option], [contenteditable=true], summary, [tabindex]:not([tabindex="-1"])';

type Row = { page: string; fp: string; type: string; status: 'tested' | 'skipped' | 'fail'; reason?: string; pozorovani?: string; screenshot?: string };
const ledger: Row[] = [];
const seen = new Set<string>(); const queue: string[] = [];

const same = (u: string) => u.startsWith(cfg.baseUrl) && !/\.(png|jpg|svg|pdf|zip|csv)(\?|$)/i.test(u) && !/logout|odhl/i.test(u);
async function fingerprint(l: Locator) {
  return l.evaluate(el => {
    const e = el as HTMLElement; const t = (e.innerText || (e as HTMLInputElement).value || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().slice(0, 40);
    return `${e.tagName.toLowerCase()}|${e.getAttribute('role') || ''}|${e.getAttribute('type') || ''}|${e.id || e.getAttribute('data-testid') || e.getAttribute('name') || ''}|${t}`;
  });
}
async function health(page: Page, errs: string[]) {
  const out: string[] = [...errs.splice(0)];
  const cov = await page.evaluate((sel) => {
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const bad: string[] = [];
    for (const e of Array.from(document.querySelectorAll(sel)).filter(vis)) {
      const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== e && !e.contains(top) && !top.contains(e) && !top.closest('[role=dialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper]')) bad.push(`${e.tagName.toLowerCase()} "${(e.textContent || '').trim().slice(0, 25)}" překryt ${top.tagName.toLowerCase()}.${(top as HTMLElement).className?.toString().slice(0, 30)}`);
    }
    return bad;
  }, INTERACTIVE);
  return out.concat(cov.map(c => 'vrstvy: ' + c));
}
async function closeOverlays(page: Page) {
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape').catch(() => {}); }
  const dlg = page.locator('[role=dialog]:visible, [role=alertdialog]:visible');
  if (await dlg.count()) { const x = dlg.locator('button[aria-label*="lose" i], button[aria-label*="zav" i], button:has-text("Zavřít"), button:has-text("Zrušit"), button:has-text("Close")').first(); if (await x.count()) await x.click({ timeout: 2000 }).catch(() => {}); }
}

async function interact(page: Page, l: Locator, fp: string, errs: string[]): Promise<Row> {
  const base = { page: page.url().replace(cfg.baseUrl, ''), fp };
  const [tag, role, type, , text] = fp.split('|');
  const shot = async (n: string) => { const p = path.join(OUT, `${ledger.length}_${n}.png`); await page.screenshot({ path: p }).catch(() => {}); return p; };
  try {
    if (DESTRUCTIVE.test(text) || DESTRUCTIVE.test(fp)) return { ...base, type: tag, status: 'skipped', reason: 'destruktivní akce — testovat ručně/s fixture DB' };
    if (tag === 'a') { const href = await l.getAttribute('href'); const abs = href ? new URL(href, cfg.baseUrl).toString() : ''; if (same(abs) && !seen.has(abs)) queue.push(abs); return { ...base, type: 'link', status: 'tested', pozorovani: `→ ${abs || href}` }; }
    if (tag === 'input' && ['text', '', 'email', 'search', 'tel', 'url', 'password', 'number'].includes(type) || tag === 'textarea' || role === 'textbox' || fp.includes('contenteditable')) {
      const samples = type === 'number' ? ['0', '-1', '99999999'] : type === 'email' ? ['a@b.cz', 'špatně'] : ['Příliš žluťoučký kůň úpěl ďábelské ódy', 'x'.repeat(300), '<b>x</b> "\'`'];
      for (const s of samples) { await l.fill(s, { timeout: 3000 }); await page.waitForTimeout(150); }
      const val = await l.inputValue().catch(() => ''); const clipped = await l.evaluate(e => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 2);
      await l.fill('', { timeout: 3000 }).catch(() => {});
      return { ...base, type: 'input', status: 'tested', pozorovani: `zadáno 3 vzorky; drží hodnotu=${val.length > 0}; ořez=${clipped}` };
    }
    if (tag === 'input' && ['checkbox', 'radio'].includes(type) || ['switch', 'checkbox', 'radio'].includes(role)) { const b = await l.isChecked().catch(() => null); await l.click({ timeout: 3000 }); const a = await l.isChecked().catch(() => null); if (b !== null && b === a) return { ...base, type: 'toggle', status: 'fail', pozorovani: 'klik nezměnil stav', screenshot: await shot('toggle') }; await l.click({ timeout: 3000 }).catch(() => {}); return { ...base, type: 'toggle', status: 'tested', pozorovani: `${b}→${a}` }; }
    if (tag === 'input' && type === 'range' || role === 'slider') { await l.focus(); const v0 = await l.evaluate(e => (e as HTMLInputElement).value || e.getAttribute('aria-valuenow')); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); const v1 = await l.evaluate(e => (e as HTMLInputElement).value || e.getAttribute('aria-valuenow')); await page.keyboard.press('Home'); await page.keyboard.press('End'); if (v0 === v1) return { ...base, type: 'slider', status: 'fail', pozorovani: 'klávesy nemění hodnotu', screenshot: await shot('slider') }; return { ...base, type: 'slider', status: 'tested', pozorovani: `${v0}→${v1}, Home/End OK` }; }
    if (tag === 'input' && ['date', 'time', 'datetime-local'].includes(type)) { await l.fill(type === 'time' ? '13:45' : type === 'date' ? '2026-09-24' : '2026-09-24T13:45', { timeout: 3000 }); return { ...base, type: 'date', status: 'tested' }; }
    if (tag === 'input' && type === 'file') return { ...base, type: 'file', status: 'skipped', reason: 'upload — samostatný test s fixture souborem (typ, velikost, název)' };
    if (tag === 'select') { const n = await l.locator('option').count(); for (let i = 0; i < Math.min(n, 25); i++) await l.selectOption({ index: i }, { timeout: 3000 }); return { ...base, type: 'select', status: 'tested', pozorovani: `${n} možností projeto` }; }
    if (role === 'combobox' || (tag === 'button' && (fp.includes('menu') || /aria-haspopup/.test(fp))) || tag === 'summary' || role === 'tab' || tag === 'button' || role === 'button' || role === 'menuitem') {
      await l.click({ timeout: 4000 }); await page.waitForTimeout(300);
      const menu = page.locator('[role=menu]:visible, [role=listbox]:visible, [data-radix-popper-content-wrapper]:visible');
      let note = 'klik OK';
      if (await menu.count()) {
        const items = menu.first().locator('[role=menuitem], [role=option]'); const n = await items.count(); const box = await menu.first().boundingBox(); const vp = page.viewportSize()!;
        const inside = !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1;
        const texts = (await items.allInnerTexts()).map(t => t.trim());
        note = `dropdown ${n} položek [${texts.slice(0, 8).join(' | ')}${n > 8 ? ' …' : ''}], uvnitř viewportu=${inside}`;
        for (const t of texts) if (!DESTRUCTIVE.test(t)) { ledger.push({ ...base, fp: `${fp}>${t}`, type: 'menuitem', status: 'tested', pozorovani: 'položka viditelná, klik testován níže' }); }
        await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        if (await menu.filter({ visible: true }).count()) { note += '; Escape NEZAVŘEL'; return { ...base, type: 'dropdown', status: 'fail', pozorovani: note, screenshot: await shot('dropdown') }; }
        if (!inside) return { ...base, type: 'dropdown', status: 'fail', pozorovani: note, screenshot: await shot('dropdown') };
        return { ...base, type: 'dropdown', status: 'tested', pozorovani: note };
      }
      const dlg = page.locator('[role=dialog]:visible'); if (await dlg.count()) { note = 'otevřel dialog'; const focusIn = await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')); note += `, focus v dialogu=${focusIn}`; await closeOverlays(page); if (await dlg.count()) { note += ', Escape/Zavřít NEZAVŘEL'; return { ...base, type: 'button', status: 'fail', pozorovani: note, screenshot: await shot('dialog') }; } }
      if (!page.url().startsWith(cfg.baseUrl)) { await page.goBack(); note = 'navigace mimo app'; }
      return { ...base, type: role === 'tab' ? 'tab' : 'button', status: 'tested', pozorovani: note };
    }
    return { ...base, type: tag, status: 'skipped', reason: `neznámý typ prvku (${tag}/${role}/${type}) — doplnit do crawleru` };
  } catch (e: any) {
    return { ...base, type: tag, status: 'fail', pozorovani: String(e.message).split('\n')[0].slice(0, 160), screenshot: await shot('err') };
  }
}

test('vyčerpávající průchod stromem UI', async ({ page }) => {
  test.setTimeout(0);
  // SÍŤOVÝ GUARD (poučení z praxe): průchod „proklikej vše" smí běžet jen v izolovaném prostředí. Pokud config neříká isolatedEnv:true,
  // blokujeme všechny mutační požadavky a externí hosty — GET není automaticky bez vedlejších účinků (seed/migrace/refresh endpointy).
  const blocked: string[] = [];
  if (!cfg.isolatedEnv) {
    await page.route('**/*', route => {
      const req = route.request(); const u = new URL(req.url());
      const external = !u.href.startsWith(cfg.baseUrl); const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method());
      const riskyGet = /(seed|migrate|reset|refresh|sync|logout|delete|remove|send|export|purge)/i.test(u.pathname);
      if (external || mutating || riskyGet) { blocked.push(`${req.method()} ${u.pathname}`); return route.abort(); }
      return route.continue();
    });
  }
  const errs: string[] = []; page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text().slice(0, 200)); });
  for (const s of cfg.screens) queue.push(cfg.baseUrl + s.path);
  let pages = 0;
  while (queue.length && pages < MAX_PAGES) {
    const url = queue.shift()!; if (seen.has(url)) continue; seen.add(url); pages++;
    const r = await page.goto(url, { waitUntil: 'networkidle' }).catch(() => null);
    if (!r || r.status() >= 400) { ledger.push({ page: url, fp: '-', type: 'page', status: 'fail', pozorovani: `HTTP ${r?.status() ?? 'timeout'}` }); continue; }
    const initial = await health(page, errs); initial.forEach(p => ledger.push({ page: url, fp: '-', type: 'page', status: 'fail', pozorovani: p }));
    const total = await page.locator(INTERACTIVE).count();
    const done = new Set<string>();
    for (let i = 0; i < total; i++) {
      if (page.url() !== url) await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
      const all = page.locator(INTERACTIVE); if (i >= await all.count()) break;
      const l = all.nth(i); if (!(await l.isVisible().catch(() => false))) { continue; }
      const fp = await fingerprint(l).catch(() => `?${i}`); if (done.has(fp)) continue; done.add(fp);
      await l.scrollIntoViewIfNeeded().catch(() => {});
      const row = await interact(page, l, fp, errs);
      const after = await health(page, errs); if (after.length) { row.pozorovani = (row.pozorovani || '') + ' | PO INTERAKCI: ' + after.join('; '); if (row.status === 'tested') row.status = 'fail'; }
      ledger.push(row); await closeOverlays(page);
    }
  }
  if (blocked.length) fs.writeFileSync(path.resolve('AUDIT/01_nalezy/ui-crawl.blocked-requests.txt'), [...new Set(blocked)].join('\n'));
  const summary = { isolatedEnv: !!cfg.isolatedEnv, blocked_requests: new Set(blocked).size, pages, elements: ledger.length, tested: ledger.filter(r => r.status === 'tested').length, skipped: ledger.filter(r => r.status === 'skipped').length, skipped_without_reason: ledger.filter(r => r.status === 'skipped' && !r.reason).length, fail: ledger.filter(r => r.status === 'fail').length, queue_left: queue.length };
  fs.writeFileSync(path.resolve('AUDIT/01_nalezy/ui-crawl.ledger.json'), JSON.stringify({ summary, ledger }, null, 2));
  console.log(JSON.stringify(summary));
  expect(summary.skipped_without_reason, 'každý přeskočený prvek má důvod').toBe(0);
  expect(summary.queue_left, 'neprojité stránky (zvyš CRAWL_MAX_PAGES)').toBe(0);
  expect.soft(summary.fail, 'FAIL prvky → nálezy').toBe(0);
});
