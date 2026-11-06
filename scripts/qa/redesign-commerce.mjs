import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from '../lib/browser.mjs';
import { openPage, hidePreviewBar } from './lib.mjs';
const id = process.env.SW_PREVIEW_THEME_ID;
if (!id) throw new Error('An unpublished preview ID is required.');
const output = 'qa-output/redesign';
mkdirSync(output, { recursive: true });
const results = [];
const browser = await launchBrowser();
const product = '/products/real-madrid-home-jersey-2026-27';
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width < 750 ? 844 : 900 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const row = { width, checks: [] };
    let addRequests = 0;
    page.on('request', (r) => {
      if (/\/cart\/add\.js/.test(r.url())) addRequests++;
    });
    // An explicit guard against accidentally leaving the cart for checkout.
    await context.route('**/checkout**', (route) => route.abort('blockedbyclient'));
    const cart = () => page.evaluate(() => fetch('/cart.js').then((r) => r.json()));
    try {
      const opened = await openPage(page, `https://sportwear.co.il${product}?preview_theme_id=${id}`);
      assert(!opened.blocked && !opened.locked && opened.status === 200);
      assert.equal(String(await page.evaluate(() => Shopify.theme.id)), id);
      await hidePreviewBar(page);
      assert.equal((await cart()).item_count, 0, 'Fresh browser cart must be empty');
      const submit = page.locator('sw-product-form[data-source="product-form"] button[name="add"]');
      const choose = async (n) => {
        const radios = page.locator('.variant-picker--main input[data-size-input]:not(:disabled)');
        const fallback = page.locator('.variant-picker input[data-size-input]:not(:disabled)');
        const options = (await radios.count()) ? radios : fallback;
        const radio = options.nth(n);
        const value = await radio.getAttribute('data-variant-id');
        const inputId = await radio.getAttribute('id');
        await page.locator(`label[for="${inputId}"]`).click();
        await page.waitForFunction((v) => document.querySelector('[data-variant-id-input]')?.value === v, value);
        await page.waitForTimeout(1400);
        return value;
      };
      if (width < 750) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('sw-sticky-buy[data-visible] .product-sticky__choose--sheet').click();
        assert(await page.locator('[data-size-sheet] dialog').evaluate((el) => el.open));
        await page.keyboard.press('Escape');
        row.checks.push('Initial mobile sticky size control opens and dismisses size sheet');
      }
      await submit.click();
      assert.equal(addRequests, 0, 'No-size add must not call cart');
      row.checks.push('Size required before add');
      await page.keyboard.press('Escape');
      const v1 = await choose(0);
      // Interrupt the first cart request before it reaches Shopify, then recover through the same UI.
      await context.route('**/cart/add.js', (route) => route.abort('failed'), { times: 1 });
      await submit.click();
      await page.waitForFunction(
        () =>
          !!document.querySelector('sw-product-form[data-source="product-form"] [data-form-error]')?.textContent.trim(),
      );
      assert.equal((await cart()).item_count, 0);
      await page.waitForFunction(
        () => !document.querySelector('sw-product-form[data-source="product-form"] button[name="add"]')?.disabled,
      );
      row.checks.push('Interrupted add reports error and restores button');
      const before = addRequests;
      await submit.evaluate((el) => {
        el.click();
        el.click();
      });
      await page.waitForFunction(() => document.querySelector('#CartDrawer dialog')?.open, { timeout: 20000 });
      assert.equal(addRequests - before, 1, 'Rapid double add should issue one request');
      let state = await cart();
      assert.equal(state.item_count, 1);
      assert.equal(String(state.items[0].variant_id), v1);
      row.checks.push('Rapid double submit adds one selected variant');
      await page.keyboard.press('Escape');
      const v2 = await choose(1);
      await submit.click();
      await page.waitForTimeout(1800);
      state = await cart();
      assert.equal(state.item_count, 2);
      assert(state.items.some((i) => String(i.variant_id) === v2));
      row.checks.push('Change size and add preserves both distinct variants');
      await page.keyboard.press('Escape');
      await page.goto(`https://sportwear.co.il/cart?preview_theme_id=${id}`, { waitUntil: 'domcontentloaded' });
      await hidePreviewBar(page);
      const remove = page.locator('main [data-cart-remove]').first();
      await remove.click();
      await page.waitForTimeout(1700);
      assert.equal((await cart()).item_count, 1);
      row.checks.push('Cart remove updates actual cart');
      await page.locator('main [data-cart-remove]').first().click();
      await page.waitForTimeout(1700);
      assert.equal((await cart()).item_count, 0);
      row.checks.push('Last removal restores empty cart');
      await page.screenshot({ path: `${output}/${width}-commerce-empty.png`, fullPage: true });
    } catch (e) {
      row.error = e.stack;
      await page.screenshot({ path: `${output}/${width}-commerce-error.png`, fullPage: true }).catch(() => {});
    } finally {
      await context.close();
    }
    results.push(row);
    writeFileSync(`${output}/commerce.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(row));
  }
} finally {
  await browser.close();
}
if (results.some((r) => r.error)) process.exitCode = 1;
