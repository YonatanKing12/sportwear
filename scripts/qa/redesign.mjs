// Read-only layout checks plus an isolated browser cart smoke test (never checkout).
// Requires an unpublished SW_PREVIEW_THEME_ID. Artifacts: qa-output/redesign/.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { launchBrowser } from '../lib/browser.mjs';
import { hidePreviewBar } from './lib.mjs';
async function openPage(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const text = await page.locator('body').innerText();
  return {
    status: response.status(),
    locked: page.url().includes('/password'),
    blocked: response.status() === 429 || /verify you are human|needs to be verified/i.test(text),
    lang: await page.locator('html').getAttribute('lang'),
  };
}
async function loadLazyContent(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);
}
const id = process.env.SW_PREVIEW_THEME_ID;
if (!id) throw new Error('Set SW_PREVIEW_THEME_ID to the verified unpublished theme.');
const out = path.resolve('qa-output/redesign');
mkdirSync(out, { recursive: true });
const base = 'https://sportwear.co.il';
const targetPaths = {
  home: '/',
  football: '/collections/football',
  madrid: '/collections/real-madrid',
  product: '/products/real-madrid-home-jersey-2026-27',
  cart: '/cart',
};
const url = (locale, p) => `${base}${locale === 'he' ? '' : '/' + locale}${p}?preview_theme_id=${id}`;
const widths = (process.env.SW_QA_WIDTHS || '360,390,1180,1440').split(',').map(Number);
const locales = (process.env.SW_QA_LOCALES || 'he,en,ar').split(',');
const pages = (process.env.SW_QA_PAGES || Object.keys(targetPaths).join(',')).split(',');
const reportPath = path.join(out, process.env.SW_QA_REPORT || 'layout.json');
const rows = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')).filter((r) => !r.error) : [];
const browser = await launchBrowser();
try {
  for (const width of widths) {
    const ctx = await browser.newContext({
      viewport: { width, height: width < 750 ? 844 : 900 },
      locale: 'he-IL',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    for (const locale of locales)
      for (const name of pages) {
        if (rows.some((r) => r.width === width && r.locale === locale && r.name === name)) continue;
        const row = { width, locale, name };
        const errors = [];
        const onerror = (e) => errors.push(String(e));
        page.on('pageerror', onerror);
        try {
          Object.assign(row, await openPage(page, url(locale, targetPaths[name])));
          if (row.blocked || row.locked || row.status !== 200)
            throw new Error(`Unavailable: ${row.status} blocked=${row.blocked} locked=${row.locked}`);
          row.theme = await page.evaluate(() => window.Shopify?.theme?.id);
          if (String(row.theme) !== id) throw new Error(`Unexpected theme ${row.theme}`);
          await hidePreviewBar(page);
          await loadLazyContent(page);
          row.layout = await page.evaluate(() => {
            const box = (s) => {
              const e = document.querySelector(s);
              if (!e) return null;
              const r = e.getBoundingClientRect();
              return { x: r.x, y: r.y, width: r.width, height: r.height };
            };
            return {
              client: document.documentElement.clientWidth,
              scroll: document.documentElement.scrollWidth,
              h1s: document.querySelectorAll('main h1').length,
              hero: box('.hero-slideshow'),
              title: box('.product-info__title'),
              price: box('.product-info__price'),
              sizes: box('.variant-picker'),
              products: document.querySelectorAll('.product-card').length,
              overflow: [...document.querySelectorAll('main *')]
                .filter((e) => {
                  const r = e.getBoundingClientRect();
                  return (
                    r.width > document.documentElement.clientWidth + 1 &&
                    !e.closest('.scroller, [data-carousel-track], .hero-slideshow__track')
                  );
                })
                .slice(0, 8)
                .map((e) => ({ tag: e.tagName, class: e.className, width: e.getBoundingClientRect().width })),
              missingText: /Liquid error|translation missing|\[missing:/.test(document.body.innerText),
            };
          });
          if (width === 390 || width === 1440) {
            const axe = await new AxeBuilder({ page })
              .exclude('#PBarNextFrameWrapper')
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze();
            row.a11y = axe.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              count: v.nodes.length,
              nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target, summary: n.failureSummary })),
            }));
          }
          await page.screenshot({ path: path.join(out, `${width}-${locale}-${name}.png`), fullPage: true });
        } catch (e) {
          row.error = e.message;
        }
        row.errors = errors;
        page.off('pageerror', onerror);
        rows.push(row);
        writeFileSync(reportPath, JSON.stringify(rows, null, 2));
        console.log(
          JSON.stringify({
            width,
            locale,
            name,
            status: row.status,
            theme: row.theme,
            overflow: row.layout ? row.layout.scroll - row.layout.client : null,
            a11y: row.a11y?.map((v) => v.id),
            error: row.error,
          }),
        );
      }
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (
  rows.some(
    (r) =>
      r.error ||
      r.layout?.scroll > r.layout?.client + 1 ||
      r.layout?.missingText ||
      r.errors.length ||
      r.a11y?.some((v) => ['critical', 'serious'].includes(v.impact)),
  )
)
  process.exitCode = 1;
