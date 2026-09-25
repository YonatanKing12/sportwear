---
name: shopify-seo-structured-data
description: Improve technical SEO and structured data on a Shopify theme. Use when asked about Shopify SEO, rich results, structured data, JSON-LD, schema markup, meta tags, canonical URLs, heading structure, alt text, or getting products to show price/rating/availability in Google. Covers Product/Offer/BreadcrumbList JSON-LD, canonical URLs, one h1 per page, descriptive image alt text, and clean meta titles and descriptions.
---

# Shopify SEO and structured data

Shopify handles a lot of SEO for you (clean URLs, sitemaps, robots.txt). The wins left on the table are structured data and on-page hygiene: telling Google exactly what a page is so it can show price, availability, and ratings directly in the result. A product result with a price and stars earns far more clicks than a plain blue link, and that markup is something AI routinely gets wrong or omits.

## Structured data: the highest-leverage SEO work on a store

Add JSON-LD for the page type. For a product, emit a `Product` with a nested `Offer` so Google can render price and availability. See `references/json-ld.md` for validated, copy-ready snippets (Product, Offer, BreadcrumbList).

Core rules:

- **Output dynamic values through the `json` filter.** It escapes quotes and produces valid JSON. Hand-concatenating strings into JSON-LD is how you ship markup that fails Google's Rich Results Test.
- **Price must be a decimal, not cents.** `product.price` is in cents; divide by `100.0` for the `price` field. The currency goes in `priceCurrency` from `shop.currency`.
- **Availability is a schema.org URL**, `https://schema.org/InStock` or `OutOfStock`, driven by `product.available`.
- **Don't claim ratings you don't have.** Only emit `aggregateRating` when there are real reviews; fabricated rating markup is a manual-action risk.

## On-page hygiene

- **One `<h1>` per page**, and it describes the page (the product title on a PDP). Section headings below it are `<h2>`/`<h3>` in order. Multiple `<h1>`s or skipped levels confuse crawlers and screen readers both.
- **Meta title and description** should be specific and within length (roughly 60 and 155 characters). Use the page's real data; a templated "Product | Store" on every page wastes the strongest ranking signal you control.
- **Canonical URLs** prevent duplicate-content dilution from variant and filter parameters. Shopify sets `canonical_url`; make sure custom templates output it in the head and don't override it wrongly.
- **Descriptive `alt` text on every meaningful image.** `alt="product"` helps no one. Pull it from the image's alt field or the product title. Decorative images get an empty `alt=""` so screen readers skip them (this overlaps with the `shopify-accessibility-audit` skill).
- **Internal linking.** Collections link to products, products link to related products and back to collections. Orphan pages don't rank.

## What not to do

- Don't block crawlers in `robots.txt` for pages you want indexed (a surprisingly common self-inflicted wound after a "cleanup").
- Don't stuff keywords into alt text or hidden text. It does nothing in 2026 except risk a penalty.
- Don't build structured data by string concatenation. Use the `json` filter on every dynamic value.

## How to deliver the audit

Check structured data first (it's the biggest visible win), then heading structure, then meta and canonical, then alt text and internal links. For each finding give the page type affected, the fix, and whether it's a rich-result opportunity or a hygiene fix. Validate every JSON-LD block against Google's Rich Results Test before claiming it's done.

## When to use this skill

Shopify SEO, rich results, structured data / JSON-LD / schema markup, meta tags, canonical URLs, heading structure, or alt text for findability. For alt text and headings as an accessibility concern, pair with `shopify-accessibility-audit`.
