// Isolated anonymous-cart verification. Never creates checkout, payment or order.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from '../lib/browser.mjs';
import { hidePreviewBar } from './lib.mjs';
const theme = process.env.SW_PREVIEW_THEME_ID;
assert(theme);
const out = 'qa-output/personalization';
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const results = [];
const addonId = 67877546656048;
try {
  for (const [locale, width] of process.env.SW_QA_SINGLE
    ? [['he', 390]]
    : [
        ['he', 390],
        ['en', 390],
        ['ar', 390],
        ['he', 1440],
      ]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      ignoreHTTPSErrors: true,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await context.route('**/checkout**', (r) => r.abort('blockedbyclient'));
    const row = { locale, width, checks: [] };
    const payloads = [];
    page.on('request', (r) => {
      if (/\/cart\/add\.js/.test(r.url())) payloads.push(r.postData());
    });
    const prefix = locale === 'he' ? '' : `/${locale}`;
    const cart = () =>
      page.evaluate(() => fetch('/cart.js?qa=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()));
    const waitCount = async (count) => {
      // Wait for the product form to complete its own serialized request; polling cart before
      // the first add finishes can race Shopify's initial cart-cookie creation.
      await page.waitForFunction(
        () =>
          document.querySelector('#CartDrawer dialog')?.open &&
          !document.querySelector('sw-product-form button[name="add"]')?.hasAttribute('aria-busy'),
        null,
        { timeout: 20000 },
      );
      assert.equal((await cart()).item_count, count);
    };
    try {
      await page.goto(
        `https://sportwear.co.il${prefix}/products/${process.env.SW_QA_PRODUCT || 'real-madrid-home-jersey-2026-27'}?preview_theme_id=${theme}`,
        { waitUntil: 'domcontentloaded' },
      );
      assert.equal(String(await page.evaluate(() => Shopify.theme.id)), theme);
      await hidePreviewBar(page);
      assert.equal((await cart()).item_count, 0);
      const form = page.locator('sw-product-form[data-source="product-form"]');
      const submit = form.locator('button[name="add"]');
      const toggle = form.locator('[data-print-toggle]');
      const name = form.locator('[data-print-name]');
      const number = form.locator('[data-print-number]');
      const nameKey = (await name.getAttribute('name')).slice(11, -1);
      const numberKey = (await number.getAttribute('name')).slice(11, -1);
      row.properties = { name: nameKey, number: numberKey };
      const choose = async (n) => {
        const radio = page.locator('.variant-picker--main input[data-size-input]:not(:disabled)').nth(n);
        const value = await radio.getAttribute('data-variant-id');
        await page.locator(`label[for="${await radio.getAttribute('id')}"]`).click();
        await page.waitForFunction((v) => document.querySelector('[data-variant-id-input]').value === v, value);
        await page.waitForTimeout(800);
        return Number(value);
      };
      const assertPair = (state, expectedName, expectedNumber, variant) => {
        const child = state.items.find(
          (i) =>
            i.variant_id === addonId &&
            (i.properties[nameKey] || '') === expectedName &&
            (i.properties[numberKey] || '') === expectedNumber,
        );
        assert(child, 'Paid customization child exists');
        assert.equal(child.original_price, 3500);
        const parent = state.items.find((i) => i.key === child.parent_relationship?.parent_key);
        assert(parent, 'Nested parent exists');
        assert.equal(parent.variant_id, variant);
        assert.equal(parent.quantity, child.quantity);
        assert.equal(parent.properties._sw_print_reference, child.properties._sw_print_reference);
        assert.equal(child.properties._sw_print_addon, 'true');
        assert(
          !Object.keys(parent.properties).some((k) => !k.startsWith('_')),
          'No fulfillment instructions on unpaid parent',
        );
        return { parent, child };
      };
      const v1 = await choose(0);
      await toggle.check();
      if (width < 750) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('sw-sticky-buy[data-visible] .product-sticky__size').click();
        assert(await page.locator('[data-size-sheet] dialog').evaluate((el) => el.open));
        await page.locator('[data-size-sheet] button[type="submit"]').click();
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-size-sheet] dialog').open &&
            document.activeElement?.matches('[data-print-name]'),
        );
        assert.equal(payloads.length, 0);
        row.checks.push('Invalid printing from size sheet closes modal and focuses accessible main field');
      }
      await submit.click();
      assert.equal(payloads.length, 0);
      await name.fill('NOA1');
      await number.fill('07');
      await submit.click();
      assert.equal(payloads.length, 0);
      await name.fill('NOA');
      await number.evaluate((el) => {
        el.value = '123';
      });
      await submit.click();
      assert.equal(payloads.length, 0);
      await number.fill(locale === 'ar' ? '٠٧' : '07');
      await toggle.uncheck();
      assert(await name.isDisabled());
      assert(await number.isDisabled());
      assert.equal(await name.inputValue(), '');
      assert.equal(await number.inputValue(), '');
      await toggle.check();
      await name.fill('NOA');
      await number.fill(locale === 'ar' ? '٠٧' : '07');
      row.checks.push('Empty/invalid fields block requests; turning off clears and disables both fields');
      await context.route('**/cart/add.js', (r) => r.abort('failed'), { times: 1 });
      await submit.click();
      await page.waitForFunction(() => document.querySelector('[data-form-error]')?.textContent.trim());
      assert.equal((await cart()).item_count, 0);
      await page.waitForFunction(
        () => !document.querySelector('sw-product-form button[name="add"]').hasAttribute('aria-busy'),
      );
      const before = payloads.length;
      let finalSubmit = submit;
      if (width < 750) {
        await page.evaluate(() => window.scrollTo(0, 0));
        finalSubmit = page.locator('sw-sticky-buy[data-visible] .product-sticky__add');
        await finalSubmit.waitFor({ state: 'visible' });
      }
      await finalSubmit.evaluate((el) => {
        el.click();
        el.click();
      });
      await waitCount(2);
      assert.equal(payloads.length - before, 1);
      let state = await cart();
      assertPair(state, 'NOA', '07', v1);
      assert.equal(state.original_total_price, Number(await submit.getAttribute('data-base-price')) + 3500);
      const payload = payloads.at(-1);
      assert(payload.includes('items[1][parent_id]'));
      assert(payload.includes(`items[1][properties][${numberKey}]`));
      assert(!payload.includes(`items[0][properties][${numberKey}]`));
      row.checks.push(
        'Interrupted add recovers; duplicate click issues one paid pair; actual Shopify cart has name and normalized number only on linked ₪35 child',
      );
      assert((await page.locator('#CartDrawer').innerText()).includes('NOA'));
      assert((await page.locator('#CartDrawer').innerText()).includes('07'));
      await page.keyboard.press('Escape');
      await name.fill('DAN');
      await number.fill('10');
      const v2 = await choose(1);
      assert.equal(await name.inputValue(), 'DAN');
      assert.equal(await number.inputValue(), '10');
      await submit.click();
      await waitCount(4);
      state = await cart();
      assertPair(state, 'NOA', '07', v1);
      assertPair(state, 'DAN', '10', v2);
      row.checks.push('Variant change preserves fields and adds a separately linked paid pair');
      await page.keyboard.press('Escape');
      if (width === 1440) {
        await choose(0);
        await name.fill('LIOR');
        await number.fill('23');
        await submit.click();
        await waitCount(6);
        await page.keyboard.press('Escape');
        state = await cart();
        assertPair(state, 'LIOR', '23', v1);
        assertPair(state, 'NOA', '07', v1);
        row.checks.push('Same shirt variant with different printing stays in separate parent/child pairs');
        await name.fill('');
        await number.fill('9');
        await submit.click();
        await waitCount(8);
        await page.keyboard.press('Escape');
        assertPair(await cart(), '', '9', v1);
        await name.fill('ORI');
        await number.fill('');
        await submit.click();
        await waitCount(10);
        await page.keyboard.press('Escape');
        assertPair(await cart(), 'ORI', '', v1);
        row.checks.push('Name-only and number-only each retain the same ₪35 per-unit add-on');
      }
      await page.goto(`https://sportwear.co.il${prefix}/cart?preview_theme_id=${theme}`, {
        waitUntil: 'domcontentloaded',
      });
      await hidePreviewBar(page);
      state = await cart();
      let pair = assertPair(state, 'NOA', '07', v1);
      const parentRow = page.locator(`main [data-cart-line][data-key="${pair.parent.key}"]`);
      await parentRow.locator('[data-cart-step="1"]').click();
      await page.waitForFunction(
        async (key) => {
          const c = await fetch('/cart.js?qa=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
          const p = c.items.find((i) => i.key === key);
          const ch = c.items.find((i) => i.parent_relationship?.parent_key === key);
          return p?.quantity === 2 && ch?.quantity === 2;
        },
        pair.parent.key,
        { timeout: 20000 },
      );
      assertPair(await cart(), 'NOA', '07', v1);
      row.checks.push('Cart quantity synchronizes paid child quantity and keeps properties');
      await page.locator(`main [data-cart-line][data-key="${pair.parent.key}"] [data-cart-remove]`).click();
      await page.waitForFunction(
        async (key) =>
          !(await fetch('/cart.js?qa=' + Date.now(), { cache: 'no-store' }).then((r) => r.json())).items.some(
            (i) => i.key === key || i.parent_relationship?.parent_key === key,
          ),
        pair.parent.key,
      );
      state = await cart();
      assertPair(state, 'DAN', '10', v2);
      row.checks.push('Removing one parent removes only its paid child and leaves other customization intact');
      pair = assertPair(state, 'DAN', '10', v2);
      const removed = await page.evaluate(
        async (key) =>
          fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: key, quantity: 0 }),
          }).then((r) => r.json()),
        pair.child.key,
      );
      const remaining = removed.items.find((i) => i.key === pair.parent.key);
      assert(remaining);
      assert(!Object.keys(remaining.properties).some((k) => !k.startsWith('_')));
      assert(!removed.items.some((i) => i.key === pair.child.key));
      row.checks.push('Removing paid line leaves no name/number instruction on unpaid shirt');
      row.payload = payload;
      await page.screenshot({ path: `${out}/${width}-${locale}-cart.png`, fullPage: true });
    } catch (e) {
      row.error = e.stack;
      row.failedItems = (await cart()).items.map(
        ({ variant_id, properties, parent_relationship, quantity, original_price }) => ({
          variant_id,
          properties,
          parent_relationship,
          quantity,
          original_price,
        }),
      );
      row.lastPayload = payloads.at(-1);
      await page.screenshot({ path: `${out}/${width}-${locale}-error.png`, fullPage: true }).catch(() => {});
    } finally {
      try {
        await page.evaluate(() => fetch('/cart/clear.js', { method: 'POST' }));
        assert.equal((await cart()).item_count, 0);
        row.cartCleaned = true;
      } catch (e) {
        row.cleanupError = e.message;
      }
      await context.close();
    }
    results.push(row);
    writeFileSync(`${out}/${process.env.SW_QA_REPORT || 'commerce.json'}`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ ...row, payload: row.payload ? 'captured' : undefined }));
  }
} finally {
  await browser.close();
}
if (results.some((r) => r.error || !r.cartCleaned)) process.exitCode = 1;
