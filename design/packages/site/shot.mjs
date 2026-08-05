import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/cntow/Documents/GitHub/material-bluemap/design/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core');

const OUT = 'C:/Users/cntow/AppData/Local/Temp/claude/C--Users-cntow-Documents-GitHub-material-bluemap/048a7cea-ac64-4724-af03-9be4d9f88b9e/scratchpad/shots';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:4173/material-bluemap/';

const tabs = [
  { label: 'Home', name: 'home' },
  { label: 'Documentation', name: 'docs-index' },
  { label: 'Settings', name: 'settings' },
  { label: 'Changelog', name: 'changelog' },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

const themes = ['light', 'dark'];

const browser = await chromium.launch();

for (const theme of themes) {
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);
    // dismiss dim sum toast if present so it doesn't cover content
    await page.locator('button[aria-label], .notification button, [class*="notif"] button').first().click({ timeout: 1000 }).catch(() => {});

    for (const t of tabs) {
      try {
        const tabLoc = page.getByRole('tab', { name: t.label, exact: false }).first();
        const count = await tabLoc.count();
        if (count > 0) {
          await tabLoc.click({ timeout: 5000 });
        } else {
          // fallback: any element with that visible text in the top nav
          await page.locator(`text=${t.label}`).first().click({ timeout: 5000 });
        }
        await page.waitForTimeout(600);
        const fname = `${OUT}/${t.name}-${vp.name}-${theme}.png`;
        await page.screenshot({ path: fname, fullPage: t.name === 'home' || t.name === 'docs-index' });
        console.log('saved', fname);
      } catch (e) {
        console.error('FAILED tab', t.label, vp.name, theme, e.message);
      }
    }

    // docs article: within Documentation tab, click the first article-like entry
    try {
      const docsTab = page.getByRole('tab', { name: 'Documentation', exact: false }).first();
      await docsTab.click({ timeout: 5000 });
      await page.waitForTimeout(500);
      // try common patterns: links/buttons inside a list of articles
      const entry = page.locator('a, button, [role="listitem"], li').filter({ hasText: /./ });
      const n = await entry.count();
      let done = false;
      for (let i = 0; i < Math.min(n, 60) && !done; i++) {
        const el = entry.nth(i);
        const txt = (await el.textContent().catch(() => '')) || '';
        const trimmed = txt.trim();
        // skip nav tabs and short labels
        if (!trimmed || trimmed.length < 8) continue;
        if (['Home','Documentation','Screenshots','Settings','Search','Changelog','Notifications'].includes(trimmed)) continue;
        try {
          await el.click({ timeout: 2000 });
          await page.waitForTimeout(600);
          done = true;
        } catch (_) { /* try next */ }
      }
      const fname = `${OUT}/docs-article-${vp.name}-${theme}.png`;
      await page.screenshot({ path: fname, fullPage: false });
      console.log('saved (opened=' + done + ')', fname);
    } catch (e) {
      console.error('ARTICLE FAILED', vp.name, theme, e.message);
    }

    await ctx.close();
  }
}

await browser.close();
console.log('done');
