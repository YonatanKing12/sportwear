// Isolated response mock, not a catalog/inventory mutation.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launchBrowser } from '../lib/browser.mjs';
const id = process.env.SW_PREVIEW_THEME_ID;
if (!id) throw new Error('Preview ID required');
const browser = await launchBrowser();
const result = {
  mocked: true,
  description:
    'Shopify section response transformed in this browser only to an unavailable variant; all real variants were available',
  checks: [],
};
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await context.route('**/cart/**', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
  await page.goto(`https://sportwear.co.il/products/real-madrid-home-jersey-2026-27?preview_theme_id=${id}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(1600);
  await page.locator('[data-print-toggle]').check();
  await page.locator('[data-print-name]').fill('TEST');
  await page.locator('[data-print-number]').fill('10');
  const original = await page.evaluate(async () => {
    const url = new URL(location.href);
    url.searchParams.set('section_id', document.querySelector('sw-product-info').dataset.sectionId);
    url.searchParams.set(
      'variant',
      document.querySelector('.variant-picker--main input[data-size-input]').dataset.variantId,
    );
    return (await fetch(url)).text();
  });
  await page.route(
    /\/products\/.*section_id=/,
    async (route) => {
      const body = await page.evaluate((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelector('sw-product-info').dataset.variantAvailable = 'false';
        for (const button of doc.querySelectorAll('button.product-submit')) {
          button.disabled = true;
          button.textContent = 'Sold out (QA mock)';
        }
        return doc.documentElement.outerHTML;
      }, original);
      await route.fulfill({ status: 200, contentType: 'text/html', body });
    },
    { times: 1 },
  );
  const radio = page.locator('.variant-picker--main input[data-size-input]:not(:disabled)').first();
  await page.locator(`label[for="${await radio.getAttribute('id')}"]`).click();
  await page.waitForFunction(() => document.querySelector('sw-product-info')?.dataset.variantAvailable === 'false');
  assert(await page.locator('[data-print-toggle]').isDisabled());
  assert(await page.locator('[data-print-name]').isDisabled());
  assert(await page.locator('[data-print-number]').isDisabled());
  assert(await page.locator('sw-product-form[data-source="product-form"] button[name="add"]').isDisabled());
  result.checks.push('Unavailable variant disables toggle, name, number, and main purchase');
  await page.screenshot({ path: 'qa-output/personalization-ui/unavailable-mock.png', fullPage: false });
  const next = page.locator('.variant-picker--main input[data-size-input]:not(:disabled)').nth(1);
  await page.locator(`label[for="${await next.getAttribute('id')}"]`).click();
  await page.waitForFunction(() => document.querySelector('sw-product-info')?.dataset.variantAvailable === 'true');
  assert(await page.locator('[data-print-toggle]').isEnabled());
  assert(await page.locator('[data-print-name]').isEnabled());
  assert(await page.locator('[data-print-number]').isEnabled());
  result.checks.push('Returning to real available variant restores optional personalization');
  await context.close();
} catch (e) {
  result.error = e.stack;
} finally {
  await browser.close();
}
writeFileSync('qa-output/personalization-ui/unavailable.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.error) process.exitCode = 1;
