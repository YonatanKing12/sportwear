---
name: shopify-performance-audit
description: Audit and fix Shopify theme performance and Core Web Vitals (LCP, CLS, INP). Use when asked to make a store faster, improve page speed or Lighthouse score, fix slow loading, reduce layout shift, optimize images, defer JavaScript, or improve LCP/CLS/INP on a Shopify theme. Covers the LCP hero image, preload_tag, lazy-loading, image dimensions to prevent layout shift, JS deferral, the 50-iteration Liquid loop limit, and using the Section Rendering API instead of full page reloads.
---

# Shopify performance audit

Speed is a conversion feature and an SEO feature at once. On mobile, where most Shopify traffic lives, every second of load time measurably drops conversion. Core Web Vitals are the three numbers Google watches and customers feel: **LCP** (how fast the main content paints), **CLS** (how much the layout jumps), and **INP** (how fast the page responds to a tap). Fix them in that order, because that is the order of impact for a typical storefront.

## LCP: the largest paint, usually the hero image

The LCP element on most pages is the hero or first product image. Three things make it slow: it loads lazily, it isn't preloaded, and it's the wrong size.

- **Load the LCP image eagerly, everything else lazily.** Below-the-fold images get `loading: 'lazy'`. The one above-the-fold hero gets `loading: 'eager'` and `fetchpriority: 'high'`.
- **Preload the hero** so the browser fetches it before it finishes parsing CSS.

```liquid
{# Preload + render the LCP hero image #}
{{ image | image_url: width: 1600 | preload_tag: as: 'image' }}

{{
  image
  | image_url: width: 1600
  | image_tag: loading: 'eager', fetchpriority: 'high', sizes: '100vw', widths: '600, 900, 1200, 1600'
}}
```

- **Serve the right size.** `image_url: width: ...` plus a `widths` list lets the browser pick. Shipping a 3000px master image to a 390px phone is the single most common LCP mistake.
- **Don't lazy-load the LCP image.** A `loading="lazy"` on the hero is a guaranteed LCP regression; it is the most common copy-paste error AI makes here.

## CLS: reserve space so nothing jumps

Layout shift happens when something loads and shoves the content that was already there. The buy button moving just as a customer taps it is both a CLS score and a misclick.

- **Always emit width and height on images.** `image_tag` does this from the image object; a raw `<img>` without dimensions is a CLS bug waiting to happen.
- **Reserve space for anything injected late**: review widgets, banners, embedded apps. Give the container a min-height so the page doesn't reflow when the app paints.
- **Preload theme fonts** and pair them with `font-display: swap` so text doesn't pop and reflow.

## INP: keep the main thread free

INP measures how fast the page reacts to taps and clicks. Heavy JavaScript on the main thread makes a fast-looking page feel broken.

- **Defer non-critical JavaScript.** Scripts that aren't needed for first paint load with `defer`.
- **Don't ship libraries for what the platform does.** A jQuery slider or a 40KB carousel dependency for something CSS scroll-snap handles is pure INP cost. Write component JS in `{% javascript %}`, scoped and small.
- **Avoid layout thrash** in scroll and input handlers (reading then writing layout in a loop). Debounce scroll work.

## Liquid that quietly costs render time

- **The `for` loop caps at 50 iterations and you should rarely hit it.** Rendering a 200-product collection in one pass is both a limit violation and a slow page. Use `{% paginate collection.products by 24 %}`.
- **Don't loop to filter.** `{% assign available = collection.products | where: 'available', true %}` beats a loop with an `if` inside, and it reads better.
- **Avoid N+1 metafield access in tight loops.** Pull what you need once, then iterate.

## Use the Section Rendering API instead of reloading

For cart updates, filtered collections, infinite scroll, and quick-add, do **not** reload the page or rebuild the DOM by hand. Shopify's Section Rendering API returns the freshly-rendered HTML for a single section, so the cart drawer or product grid updates with one small request and the server stays the source of truth. Rebuilding cart state in JavaScript is how totals drift and discounts disappear.

## How to deliver the audit

Measure first (Lighthouse / PageSpeed Insights on a real mobile profile), then map each finding to the Web Vital it moves and the specific theme change that fixes it. Rank by impact: a non-preloaded, lazy-loaded hero image is almost always the biggest single LCP win and should lead the report. Don't report a 5-point opportunity above a 2-second LCP problem.

## When to use this skill

Whenever the goal is speed or Core Web Vitals on a Shopify theme: slow pages, poor Lighthouse scores, layout shift, image optimization, JS deferral, LCP/CLS/INP. For conversion friction that isn't speed, use `shopify-cro-audit`.
