import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { launchBrowser } from '../lib/browser.mjs';
import { hidePreviewBar } from './lib.mjs';
const id = process.env.SW_PREVIEW_THEME_ID;
if (!id) throw new Error('Preview required');
const out = 'qa-output/personalization-ui';
mkdirSync(out, { recursive: true });
const products = [
  ['real-madrid-home-jersey-2026-27', true, 174],
  ['barcelona-home-kit-2026-27-kids', true, 134],
  ['sw-jerseys-218038482', false],
  ['kansas-city-chiefs-patrick-mahomes-15-red-jersey', false],
  ['sw-shorts-162704069', false],
];
const locales = (process.env.SW_QA_LOCALES || 'he,en,ar').split(',');
const rows = [];
const browser = await launchBrowser();
try {
  for (const width of [390, 1440])
    for (const locale of locales) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, ignoreHTTPSErrors: true });
      const page = await context.newPage();
      let cartWrites = 0;
      await context.route('**/checkout**', (r) => r.abort());
      await context.route('**/cart/**', (r) => {
        if (r.request().method() === 'POST') {
          cartWrites++;
          return r.abort();
        }
        return r.continue();
      });
      for (const [handle, eligible, total] of products) {
        const row = { width, locale, handle, eligible, checks: [] };
        try {
          await page.goto(
            `https://sportwear.co.il${locale === 'he' ? '' : '/' + locale}/products/${handle}?preview_theme_id=${id}`,
            { waitUntil: 'domcontentloaded' },
          );
          await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
          await page.evaluate(() => document.fonts.ready);
          await hidePreviewBar(page);
          assert.equal(String(await page.evaluate(() => Shopify.theme.id)), id);
          const panel = page.locator('[data-personalization]');
          assert.equal(await panel.count(), eligible ? 1 : 0);
          row.checks.push(eligible ? 'Personalization present' : 'Personalization absent');
          if (eligible) {
            const toggle = page.locator('[data-print-toggle]'),
              name = page.locator('[data-print-name]'),
              number = page.locator('[data-print-number]');
            assert(await name.isDisabled());
            assert(await number.isDisabled());
            assert(!(await name.getAttribute('required')));
            assert(!(await number.getAttribute('required')));
            assert(!(await page.locator('[data-print-details]').isVisible()));
            await toggle.check();
            assert(await name.isEnabled());
            assert(await number.isEnabled());
            assert(!(await name.evaluate((e) => e.required)));
            assert(!(await number.evaluate((e) => e.required)));
            row.checks.push('Toggle enables both optional fields');
            await name.fill(locale === 'ar' ? 'محمد' : locale === 'he' ? 'יונתן' : 'YONATAN');
            await number.fill('10');
            const totalText = await page.locator('[data-print-total]').innerText();
            assert(totalText.includes(String(total)) || locale === 'ar');
            const linked = await page.locator('[data-print-linked-total]').evaluateAll((els) =>
              els.map((e) => ({
                hidden: e.hidden,
                text: e.textContent,
                originalHidden: e.parentElement.querySelector('.price:not([data-print-linked-total])')?.hidden,
              })),
            );
            assert(linked.length >= 2);
            assert(linked.every((e) => !e.hidden && e.originalHidden));
            row.linkedTotals = linked;
            row.checks.push('Main, sticky and size-sheet totals reflect one ₪35 add-on');
            await page.locator('[data-personalization]').scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${out}/${width}-${locale}-${handle}.png`, fullPage: false });
            const axe = await new AxeBuilder({ page })
              .exclude('#PBarNextFrameWrapper')
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze();
            row.a11y = axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) }));
            await toggle.uncheck();
            assert.equal(await name.inputValue(), '');
            assert.equal(await number.inputValue(), '');
            assert(await name.isDisabled());
            assert(await number.isDisabled());
            assert(await page.locator('[data-print-linked-total]').evaluateAll((els) => els.every((e) => e.hidden)));
            row.checks.push('Toggle off clears and disables fields and restores original prices');
          } else {
            const axe = await new AxeBuilder({ page })
              .exclude('#PBarNextFrameWrapper')
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze();
            row.a11y = axe.violations.map((v) => ({ id: v.id, impact: v.impact }));
          }
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
            0,
          );
          row.checks.push('No page overflow');
        } catch (e) {
          row.error = e.stack;
        }
        rows.push(row);
        writeFileSync(`${out}/report-${locales.join('-')}.json`, JSON.stringify(rows, null, 2));
        console.log(JSON.stringify(row));
      }
      assert.equal(cartWrites, 0, 'Read-only UI tests must not send cart mutations');
      await context.close();
    }
} finally {
  await browser.close();
}
if (rows.some((r) => r.error || r.a11y?.length)) process.exitCode = 1;
