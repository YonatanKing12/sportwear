import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launchBrowser } from '../lib/browser.mjs';
const id = process.env.SW_PREVIEW_THEME_ID;
if (!id) throw new Error('preview ID required');
const browser = await launchBrowser();
const rows = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const row = { width, checks: [] };
    try {
      await page.goto(`https://sportwear.co.il/collections/football?preview_theme_id=${id}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(2000);
      assert.equal(String(await page.evaluate(() => Shopify.theme.id)), id);
      assert((await page.locator('[data-facets-region="results"] .product-card').count()) > 0);
      row.checks.push('Football products immediately rendered');
      const sort = page.locator('[data-facets-sort]');
      await sort.selectOption('price-ascending');
      await sort.selectOption('price-descending');
      await page.waitForFunction(() => new URL(location.href).searchParams.get('sort_by') === 'price-descending');
      await page.waitForTimeout(1200);
      assert.equal(await sort.inputValue(), 'price-descending');
      row.checks.push('Repeated sort retains latest selection');
      if (width < 990) await page.locator('[data-drawer-open="FacetsDrawer"]').click();
      const check = page.locator('[data-facets-form] input[type="checkbox"]:not(:disabled)').first();
      await check.evaluate((el) => el.closest('details')?.setAttribute('open', ''));
      const filterName = await check.getAttribute('name'),
        filterValue = await check.getAttribute('value');
      await page.locator(`label[for="${await check.getAttribute('id')}"]`).click();
      await page.waitForFunction(
        ({ name, value }) => new URL(location.href).searchParams.getAll(name).includes(value),
        { name: filterName, value: filterValue },
      );
      if (width < 990) await page.locator('[data-facets-apply]').click();
      assert((await page.locator('.facets-active__chip').count()) > 0);
      row.checks.push('Filter applies and displays active chip');
      await page.locator('.facets-active__clear').click();
      await page.waitForFunction(
        () => ![...new URL(location.href).searchParams.keys()].some((k) => k.startsWith('filter.')),
      );
      row.checks.push('Clear filters resets result state');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        0,
      );
      row.checks.push('No overflow after repeated filtering');
    } catch (e) {
      row.error = e.stack;
    } finally {
      await context.close();
    }
    rows.push(row);
    console.log(JSON.stringify(row));
    writeFileSync('qa-output/redesign/filters.json', JSON.stringify(rows, null, 2));
  }
} finally {
  await browser.close();
}
if (rows.some((r) => r.error)) process.exitCode = 1;
