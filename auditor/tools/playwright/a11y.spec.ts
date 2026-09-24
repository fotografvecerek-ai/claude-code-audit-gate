// A11Y — axe-core (WCAG 2.2 AA) + klávesnicový průchod. npx playwright test tools/playwright/a11y.spec.ts
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs'; import path from 'node:path';
const cfg = JSON.parse(fs.readFileSync(path.resolve('tools/audit.config.json'), 'utf8'));
const OUT = path.resolve('AUDIT/01_nalezy'); fs.mkdirSync(OUT, { recursive: true });
const all: any[] = [];
test.afterAll(() => fs.writeFileSync(path.join(OUT, 'a11y.findings.json'), JSON.stringify(all, null, 2)));
test.use({ storageState: cfg.auth?.storageStateFile && fs.existsSync(cfg.auth.storageStateFile) ? cfg.auth.storageStateFile : undefined });

for (const s of cfg.screens) {
  test(`axe ${s.name}`, async ({ page }) => {
    await page.goto(cfg.baseUrl + s.path, { waitUntil: 'networkidle' });
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    for (const v of res.violations) all.push({ screen: s.name, id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.slice(0, 5).map(n => ({ target: n.target, html: n.html.slice(0, 160) })) });
    const serious = res.violations.filter(v => ['critical', 'serious'].includes(v.impact || ''));
    expect.soft(serious.map(v => `${v.id} (${v.nodes.length}×): ${v.help}`), `critical/serious na ${s.name}`).toEqual([]);
  });
  test(`klávesnice ${s.name}`, async ({ page }) => {
    await page.goto(cfg.baseUrl + s.path, { waitUntil: 'networkidle' });
    const seq: string[] = []; let noFocusRing = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => { const a = document.activeElement as HTMLElement | null; if (!a || a === document.body) return null; const st = getComputedStyle(a); const ring = st.outlineStyle !== 'none' || st.boxShadow !== 'none'; return { d: a.tagName + (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 20), ring }; });
      if (!info) break; seq.push(info.d); if (!info.ring) noFocusRing++;
    }
    all.push({ screen: s.name, id: 'keyboard-tab-order', impact: noFocusRing > 3 ? 'serious' : 'minor', help: `Tab sekvence: ${seq.join(' → ')}; bez viditelného focusu: ${noFocusRing}` });
    expect.soft(seq.length, 'Tab dosáhne alespoň 3 prvků').toBeGreaterThan(2);
    expect.soft(noFocusRing, 'prvky bez viditelného focusu').toBeLessThanOrEqual(3);
  });
}
