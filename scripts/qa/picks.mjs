// Verify the preview-only curated shelf against the real public catalog, without writes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { launchBrowser } from '../lib/browser.mjs';
import { hidePreviewBar } from './lib.mjs';
const theme = process.env.SW_PREVIEW_THEME_ID;
assert(theme, 'Set SW_PREVIEW_THEME_ID');
const handles = JSON.parse(readFileSync('templates/index.json')).sections.featured_collection.settings.products;
const out = 'qa-output/picks';
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const rows = [];
try {
  for (const width of (process.env.SW_QA_WIDTHS || '360,390,1440').split(',').map(Number)) {
    for (const locale of (process.env.SW_QA_LOCALES || 'he,en,ar').split(',')) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        ignoreHTTPSErrors: true,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const prefix = locale === 'he' ? '' : `/${locale}`;
      await page.goto(`https://sportwear.co.il${prefix}/?preview_theme_id=${theme}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(String(await page.evaluate(() => Shopify.theme.id)), theme);
      await hidePreviewBar(page);
      assert.equal(await page.locator('.hero-slideshow').count(), 1);
      assert.equal(await page.locator('.editorial-hero').count(), 0);
      const shelf = page.locator('.featured-collection').first();
      await shelf.scrollIntoViewIfNeeded();
      assert.equal(
        (await shelf.locator('h2').textContent()).trim(),
        { he: 'הבחירות שלנו', en: 'Our picks', ar: 'اختياراتنا' }[locale],
      );
      const cards = shelf.locator('[data-row-card]');
      assert.equal(await cards.count(), handles.length);
      const track = shelf.locator('[data-carousel-track]');
      const shown = await cards.evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return {
            href: n.querySelector('.product-card__link').getAttribute('href'),
            price: n.querySelector('.price').innerText,
            visible: r.left >= -1 && r.right <= window.innerWidth + 1,
          };
        }),
      );
      assert.deepEqual(
        shown.map((p) => p.href.split('/products/')[1].split('?')[0]),
        handles,
      );
      assert(
        shown.slice(0, width < 750 ? 2 : 4).every((p) => p.visible),
        'Early category diversity visible',
      );
      for (let i = 0; i < handles.length; i++) {
        const product = await page.evaluate(async (handle) => {
          const response = await fetch(`/products/${handle}.js`);
          if (!response.ok) throw new Error(`Product HTTP ${response.status}`);
          return response.json();
        }, handles[i]);
        assert(product.available && product.variants.some((v) => v.available));
        assert(shown[i].price.includes(String(product.price / 100)));
        await cards.nth(i).scrollIntoViewIfNeeded();
        await cards
          .nth(i)
          .locator('img')
          .first()
          .evaluate((img) => img.decode());
      }
      await track.evaluate((el) => {
        el.scrollLeft = 0;
      });
      if (width >= 750) {
        await shelf.locator('[data-carousel-next]').click();
        assert(Math.abs(await track.evaluate((el) => el.scrollLeft)) > 20);
        await shelf.locator('[data-carousel-prev]').click();
      } else {
        await track.evaluate((el) => {
          el.scrollLeft = getComputedStyle(el).direction === 'rtl' ? -200 : 200;
        });
        assert(Math.abs(await track.evaluate((el) => el.scrollLeft)) > 20);
      }
      await track.evaluate((el) => {
        el.scrollLeft = 0;
      });
      const pricePositions = await cards.evaluateAll((nodes) =>
        nodes.map((n) => n.querySelector('.price').getBoundingClientRect().top),
      );
      assert(Math.max(...pricePositions) - Math.min(...pricePositions) < 2, 'Card prices aligned');
      const browse = await shelf.locator('.featured-collection__view-all').getAttribute('href');
      assert.equal(browse, `${prefix}/collections/all?view=catalog`);
      assert.equal(await shelf.locator('.featured-collection__more-link').getAttribute('href'), browse);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert.equal(overflow, 0);
      const axe = await new AxeBuilder({ page })
        .include('.featured-collection')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      assert.deepEqual(axe.violations, []);
      await shelf.screenshot({ path: `${out}/${width}-${locale}.png` });
      assert.deepEqual(errors, []);
      if (locale === 'he') {
        await page.goto(`https://sportwear.co.il${browse}&preview_theme_id=${theme}`, {
          waitUntil: 'domcontentloaded',
        });
        assert.equal(String(await page.evaluate(() => Shopify.theme.id)), theme);
        assert((await page.locator('.product-card').count()) >= 20, 'Browse opens full catalog grid');
      }
      rows.push({
        width,
        locale,
        cards: handles.length,
        heading: true,
        pricesAndAvailability: true,
        images: true,
        earlyDiversity: true,
        scrolling: true,
        browse,
        overflow,
        axeViolations: 0,
        errors,
      });
      writeFileSync(`${out}/${process.env.SW_QA_REPORT || 'report.json'}`, JSON.stringify(rows, null, 2));
      console.log(width, locale, 'passed');
      await context.close();
    }
  }
} finally {
  await browser.close();
}
