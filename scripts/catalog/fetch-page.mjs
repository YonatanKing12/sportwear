#!/usr/bin/env node
// Renders a product page in headless Chromium and prints the data product-scout needs, as JSON:
// JSON-LD blocks, OpenGraph/product meta, large images, size selectors, visible text, and, when
// the site is a Shopify store, the product JSON at <product-url>.js (variants, options, images).
// Usage: node scripts/catalog/fetch-page.mjs "<url>"
import { launchBrowser } from '../lib/browser.mjs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/catalog/fetch-page.mjs "<url>"');
  process.exit(2);
}

const browser = await launchBrowser();
try {
  const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  const data = await page.evaluate(() => {
    const parse = (text) => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    };
    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => parse(s.textContent))
      .filter(Boolean);
    const meta = Object.fromEntries(
      [...document.querySelectorAll('meta[property^="og:"], meta[property^="product:"], meta[name^="twitter:"]')].map(
        (m) => [m.getAttribute('property') || m.getAttribute('name'), m.getAttribute('content')],
      ),
    );
    const images = [
      ...new Map(
        [...document.images]
          .filter((img) => img.naturalWidth >= 300 && (img.currentSrc || img.src))
          .map((img) => [
            img.currentSrc || img.src,
            { src: img.currentSrc || img.src, alt: img.alt, width: img.naturalWidth, height: img.naturalHeight },
          ]),
      ).values(),
    ];
    const selects = [...document.querySelectorAll('select')].map((s) => ({
      name: s.name || s.id || null,
      options: [...s.options].map((o) => ({ value: o.value, text: o.text.trim(), disabled: o.disabled })),
    }));
    const radios = [...document.querySelectorAll('input[type="radio"]')].map((r) => ({
      name: r.name,
      value: r.value,
      disabled: r.disabled,
      label: r.labels?.[0]?.innerText?.trim() ?? null,
    }));
    return {
      title: document.title,
      lang: document.documentElement.lang || null,
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      jsonLd,
      meta,
      images,
      selects,
      radios,
      text: document.body.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 8000),
    };
  });

  // Shopify storefronts expose the full product as JSON at <product-url>.js
  let shopifyProduct = null;
  const finalUrl = new URL(page.url());
  if (/\/products\/[^/]+/.test(finalUrl.pathname)) {
    const jsUrl = `${finalUrl.origin}${finalUrl.pathname.replace(/\/$/, '')}.js`;
    const res = await context.request.get(jsUrl).catch(() => null);
    // The endpoint returns JSON but is not always labelled application/json, so just try to parse it.
    if (res?.ok()) {
      try {
        const candidate = JSON.parse(await res.text());
        if (candidate && Array.isArray(candidate.variants)) shopifyProduct = candidate;
      } catch {
        // not a Shopify product endpoint
      }
    }
  }

  const output = {
    url,
    status: response?.status() ?? null,
    final_url: page.url(),
    fetched_at: new Date().toISOString(),
    ...data,
    shopifyProduct,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  await browser.close();
}
