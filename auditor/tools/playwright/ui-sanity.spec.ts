// UI SANITY — překryvy, pořadí vrstev, ořezaný text, horizontální scroll, ikony, velikost cílů,
// console errors, dropdown logika, konzistence menu. Čte tools/audit.config.json.
// Spuštění: npx playwright test tools/playwright/ui-sanity.spec.ts --reporter=list
import { test, expect, devices, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const cfg = JSON.parse(fs.readFileSync(path.resolve('tools/audit.config.json'), 'utf8'));
const OUT = path.resolve('AUDIT/01_nalezy/momentky');
fs.mkdirSync(OUT, { recursive: true });
const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=menuitem], [role=tab], [role=link], [tabindex]:not([tabindex="-1"])';

type Finding = { screen: string; viewport: string; kategorie: string; selektor?: string; pozorovani: string; screenshot_path?: string };
const findings: Finding[] = [];
test.afterAll(() => fs.writeFileSync(path.join(OUT, '..', 'ui-sanity.findings.json'), JSON.stringify(findings, null, 2)));

async function collectErrors(page: Page) {
  const errs: string[] = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  return errs;
}

async function analyze(page: Page) {
  return page.evaluate((sel) => {
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
    const desc = (el: Element) => { const s = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.getAttribute('data-testid') ? `[data-testid=${el.getAttribute('data-testid')}]` : ''); const t = (el.textContent || '').trim().slice(0, 30); return t ? `${s} "${t}"` : s; };
    const els = Array.from(document.querySelectorAll(sel)).filter(vis);
    const overlaps: string[] = [], covered: string[] = [], small: string[] = [];
    const rects = els.map(e => ({ e, r: e.getBoundingClientRect() }));
    for (let i = 0; i < rects.length; i++) {
      const { e, r } = rects[i];
      // pořadí vrstev: prvek uprostřed musí být sám sebou nebo potomkem
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight) {
        const top = document.elementFromPoint(cx, cy);
        if (top && top !== e && !e.contains(top) && !top.contains(e)) covered.push(`${desc(e)} překryt ${desc(top)}`);
      }
      if (r.width < 24 || r.height < 24) small.push(`${desc(e)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      for (let j = i + 1; j < rects.length; j++) {
        const { e: f, r: q } = rects[j];
        if (e.contains(f) || f.contains(e)) continue;
        const ix = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left));
        const iy = Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top));
        if (ix * iy > 4) overlaps.push(`${desc(e)} × ${desc(f)} (${Math.round(ix)}×${Math.round(iy)}px)`);
      }
    }
    const clipped = Array.from(document.querySelectorAll('button, label, th, td, a, h1, h2, h3, [role=menuitem]')).filter(vis)
      .filter(el => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis').map(desc);
    const brokenImg = Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(-60));
    const emptySvg = Array.from(document.querySelectorAll('svg')).filter(s => vis(s) && !s.querySelector('path, circle, rect, line, polygon, use, polyline')).length;
    const hscroll = document.documentElement.scrollWidth > innerWidth + 1;
    return { overlaps, covered, small, clipped, brokenImg, emptySvg, hscroll, interactive: els.length };
  }, INTERACTIVE);
}

for (const [vpName, vp] of Object.entries<any>(cfg.viewports)) {
  test.describe(`viewport ${vpName}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, storageState: cfg.auth?.storageStateFile && fs.existsSync(cfg.auth.storageStateFile) ? cfg.auth.storageStateFile : undefined });

    for (const screen of cfg.screens) {
      test(`${screen.name} (${screen.path})`, async ({ page }) => {
        const errs = await collectErrors(page);
        const resp = await page.goto(cfg.baseUrl + screen.path, { waitUntil: 'networkidle' });
        expect(resp?.status(), 'HTTP status').toBeLessThan(400);
        await page.waitForTimeout(500);
        const a = await analyze(page);
        const shot = path.join(OUT, `${screen.name}_${vpName}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        const push = (kategorie: string, list: string[]) => list.forEach(p => findings.push({ screen: screen.name, viewport: vpName, kategorie, pozorovani: p, screenshot_path: shot }));
        push('prekryv', a.overlaps); push('vrstvy', a.covered); push('orezany_text', a.clipped);
        push('maly_cil<24px', a.small); push('rozbity_obrazek', a.brokenImg); push('console', errs);
        if (a.emptySvg) push('prazdna_ikona', [`${a.emptySvg}× prázdné <svg>`]);
        if (a.hscroll) push('horizontalni_scroll', ['scrollWidth > innerWidth']);
        expect.soft(a.overlaps, 'překryvy').toEqual([]);
        expect.soft(a.covered, 'pořadí vrstev').toEqual([]);
        expect.soft(a.hscroll, 'horizontální scroll').toBe(false);
        expect.soft(errs, 'console/page errors').toEqual([]);
        expect.soft(a.brokenImg, 'rozbité obrázky').toEqual([]);
        expect(a.interactive, 'obrazovka bez interaktivních prvků = špatný selektor nebo prázdná stránka').toBeGreaterThan(0);
      });
    }

    test('dropdown logika', async ({ page }) => {
      await page.goto(cfg.baseUrl + (cfg.screens.find((s: any) => s.auth)?.path ?? '/'), { waitUntil: 'networkidle' });
      const triggers = page.locator(cfg.menuSelectors.dropdownTrigger);
      const n = await triggers.count();
      test.skip(n === 0, 'žádný dropdown trigger dle selektoru');
      const content = page.locator(cfg.menuSelectors.dropdownContent);
      await triggers.first().click();
      await expect(content.first(), 'otevře se').toBeVisible();
      const box = await content.first().boundingBox();
      const vpw = page.viewportSize()!;
      expect.soft(box && box.x >= 0 && box.x + box.width <= vpw.width && box.y + box.height <= vpw.height, 'dropdown uvnitř viewportu').toBeTruthy();
      await page.keyboard.press('Escape');
      await expect(content.first(), 'Escape zavře').toBeHidden();
      await triggers.first().click();
      if (n > 1) { await triggers.nth(1).click(); expect.soft(await content.filter({ visible: true }).count(), 'max 1 otevřený').toBeLessThanOrEqual(1); }
      await page.mouse.click(2, vpw.height - 2);
      expect.soft(await content.filter({ visible: true }).count(), 'klik mimo zavře').toBe(0);
    });

    test('konzistence navigace napříč obrazovkami', async ({ page }) => {
      const sets: Record<string, string[]> = {};
      for (const s of cfg.screens.filter((s: any) => s.auth)) {
        await page.goto(cfg.baseUrl + s.path, { waitUntil: 'networkidle' });
        sets[s.name] = (await page.locator(cfg.menuSelectors.navItems).allInnerTexts()).map(t => t.trim()).filter(Boolean);
      }
      const names = Object.keys(sets); test.skip(names.length < 2, 'méně než 2 obrazovky');
      for (const k of names.slice(1)) expect.soft(sets[k], `menu na ${k} = menu na ${names[0]} (pořadí i názvy)`).toEqual(sets[names[0]]);
      // každá položka menu → ne 404
      for (const href of await page.locator(cfg.menuSelectors.navItems).evaluateAll(els => els.map(e => (e as HTMLAnchorElement).href))) {
        if (!href.startsWith(cfg.baseUrl)) continue;
        const r = await page.request.get(href); expect.soft(r.status(), `menu odkaz ${href}`).toBeLessThan(400);
      }
    });
  });
}
