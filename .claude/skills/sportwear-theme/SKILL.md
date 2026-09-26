---
name: sportwear-theme
description: Project rules for building the SportWear Shopify theme from scratch. Covers the architecture, the approved "Night Match, hybrid" design system (dark brand shell with light shopping surfaces), RTL-first CSS for Hebrew and Arabic with English LTR, i18n, commerce rules, performance and accessibility budgets, and the validation/QA gate. Use for ANY work on theme files in this repo (layout, templates, sections, blocks, snippets, assets, config, locales), and whenever a design or UX decision about the storefront comes up.
---

# SportWear theme: project rules

These rules come from decisions the store owner has approved. Where a vendored skill is more
generic, this file wins. Where this file is silent, follow `shopify-liquid-themes`,
`liquid-theme-standards` and `liquid-theme-a11y`.

**Before writing theme code, read `references/architecture.md`**: file ownership, the foundation
APIs (tokens, classes, snippets, `@theme/core`), cross-component contracts, section conventions and
the i18n parts workflow (`i18n/<area>.<lang>.json` → `npm run i18n` → `locales/*`).

**To put the theme on the store, follow `references/deploy.md`** (zip + `themeCreate` for a new
theme, staged uploads + `themeFilesUpsert` for changes).

## Non-negotiables

1. **From scratch.** Do not copy code from Horizon, Dawn or any other theme. Reading Shopify docs
   and the examples inside the vendored skills is fine. Copying another theme's files is not.
2. **Never touch the live theme.** Work only on the unpublished development theme, either the
   GitHub-connected branch or an unpublished theme updated through MCP `themeFilesUpsert`. The
   owner presses Publish, never us.
3. **Validate before committing.** Every file you create or change passes the Liquid validator
   and `npm run theme:check` (see the QA gate below).
4. **No hardcoded copy.** Every visible string goes through the `t` filter, with keys in all three
   storefront locales (he, en, ar).
5. **RTL first.** Hebrew is the default language. Use logical CSS properties everywhere.

## Architecture

The repo root is the theme root: Shopify's GitHub integration syncs only the standard theme folders
and ignores `.claude/`, `catalog/`, `design/`, `scripts/` and the rest.

```
layout/theme.liquid, layout/password.liquid
templates/*.json            (JSON templates only; gift_card.liquid is the one .liquid exception)
sections/*.liquid           + sections/header-group.json, sections/footer-group.json
blocks/*.liquid             (theme blocks for composable sections)
snippets/*.liquid           (with {% doc %} headers)
assets/*.css|*.js|*.woff2   (component JS as web components, self-hosted fonts)
config/settings_schema.json, config/settings_data.json
locales/he.default.json, en.json, ar.json, en.default.schema.json, he.schema.json
```

- JavaScript: vanilla custom elements, one file per component, loaded with `defer` or as a module.
  No jQuery, no frameworks, no slider libraries (CSS scroll-snap covers carousels).
- Cart: drawer plus the `/cart` page. Use the Cart AJAX API for writes and the **Section Rendering
  API** to re-render. Never rebuild cart HTML by hand in JS.
- Collections: storefront filtering (`collection.filters`) plus the Section Rendering API. No full
  page reloads. Paginate by 24.
- Search: suggestions in the header field. Shopify's Predictive Search API doesn't serve Hebrew or
  Arabic (it answers 417), so in those languages the same section is rendered on the storefront
  search page (`search.results`) instead; see `assets/predictive-search.js`.
- Product: the native variant picker built on `product.options_with_values` and
  `product.selected_or_first_available_variant`. Sold-out sizes stay visible but disabled.
- Every section gets a `color_scheme` setting (see below) plus spacing settings. Every block
  wrapper outputs `{{ block.shopify_attributes }}`. Every section has presets so the owner can add
  it in the editor.
- Owner-editable content (banners, promos, texts, featured teams) lives in section and block
  settings, never in code. Aim: day-to-day changes need no developer.

## Design system (approved)

- Canvas: https://claude.ai/artifact/AXjtro4CVL8sLLPBbKSs94. The boards titled **"משולב"**
  (hybrid) are the approved direction. Tokens are in `design/tokens.json`, notes in `design/README.md`.
- **Color schemes** go in `config/settings_schema.json` as a `color_scheme_group`, applied per section:

| Scheme | bg | surface | line | text | muted | primary button |
| --- | --- | --- | --- | --- | --- | --- |
| `night` (dark) | #0D0E11 | #16181D | #2A2E37 | #F4F5F7 | #A7ADB8 | accent bg + #0D0E11 text |
| `day` (light) | #FFFFFF | #F1F2F4 | #E3E5E8 | #0D0E11 | #5B616E | #0D0E11 bg + accent text |
| `accent` | accent | #FFFFFF | #0D0E11 | #0D0E11 | #0D0E11 | #0D0E11 bg + accent text |

- **Where each scheme goes by default:**
  - `night`: announcement-free header, hero, trust strip, team-orders band, footer.
  - `day`: product grids, the product page below the header, the cart drawer body, content pages.
  - `accent`: bundle and promo banners, plus the announcement bar.
- **Accent** defaults to lime `#C6FF3D`. It is a theme setting because the logo is not final, so
  never hardcode it outside settings and tokens. Accent is **never text on a light background**.
- Sale price text is `#C22D0D` on light and `#FF5A36` on dark. The sale badge is `#FF5A36` with
  `#0D0E11` text.
- **Product image tiles are always light (`#F1F2F4`) in every scheme.** Supplier photos are shot on
  white, and dark kits must stay visible.
- **Type:**
  - Display stack: `Anton` (Latin), then `Karantina` 700 (Hebrew), then `Changa` 800 (Arabic).
  - Body stack: `Heebo`, then `Noto Sans Arabic`.
  - Set `font-synthesis: none`. Arabic display text needs `line-height >= 1.2`.
  - Self-host woff2 files (OFL licensed) with `unicode-range` subsets and `font-display: swap`.
    Preload only the display face used above the fold.
- Radii: 4px for cards and buttons, 3px for badges, 999px for chips. Spacing on a 4px grid.
  Touch targets are at least 44px.

## RTL and i18n

- Use `<html lang="{{ request.locale.iso_code }}" dir="{{ request.locale.direction }}">`.
- Use logical properties only: `margin-inline-*`, `padding-inline-*`, `inset-inline-*`,
  `text-align: start|end`, `border-start-start-radius` and so on. Physical left/right is allowed
  only for non-directional artwork.
- Mirror directional icons (chevrons, arrows, truck) in RTL via `:dir(rtl)`. Keep prices, sizes
  like `9-10`, and seasons like `26/27` bidi-safe (wrap in `<bdi>` when mixed with text).
- Storefront locales:
  - `he.default.json` is the default, because the store's primary language will be Hebrew.
  - `en.json` and `ar.json` are the others.
  - Arabic needs all plural categories: zero, one, two, few, many, other.
- Editor (schema) locales are `en.default.schema.json` and `he.schema.json`, so the owner can edit
  in Hebrew.
- Products, pages and menus are translated as Shopify content (the `catalog-translator` agent),
  not through theme locale files.

## Commerce rules for this business

- Format prices with the `money` filters. Show compare-at only when it is higher than the price.
- **Sizes:**
  - Adults: S, M, L, XL (add XXL only if stocked).
  - Kids: 5-6, 7-8, 9-10, 11-12, 13-14 (heights 116, 128, 140, 152, 164 cm).
  - Kids are **separate products**. The adults/kids toggle on the product page links to the
    counterpart product through the metafield `sportwear.counterpart`.
- **"Complete the set"**: shorts ↔ tank via the metafield `sportwear.complements`.
- **Free-shipping progress bar:** the threshold comes from the theme setting
  `free_shipping_threshold` (ILS). Keep it in sync with the shipping rate in admin (the threshold is
  not decided yet; ₪200 is the recommendation, and shipping is ₪35).
- **Trust strip:** delivery in up to 3 business days · returns up to 45 days · stock held in
  Israel · secure payment (credit card, Apple Pay, Google Pay). Never an originality claim ("100%
  original", "authentic"): the owner ruled it out.
- **Team orders page:** CTA to WhatsApp. The number is a theme setting.
- No fake urgency, scarcity or ratings. Stock hints must read real inventory. Show ratings only
  when real reviews exist.
- Checkout is Shopify's own. Brand it in the checkout editor and keep it light.

## Budgets

- **Performance** (mobile on 4G):
  - LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms.
  - The hero image is eager, with `fetchpriority: 'high'` and preloaded. Every other image is lazy
    and rendered with `image_tag` (width and height included).
  - No render-blocking third-party scripts.
  - Keep first-party JS small: under 60 KB gzip per page is the target.
- **Accessibility:**
  - This is a legal requirement in Israel (IS 5568, based on WCAG AA). Target WCAG 2.2 AA.
  - Required: semantic HTML, visible focus, labelled controls, 4.5:1 contrast (the token pairs
    above already pass), 44px targets, a skip link, a focus trap in drawers and modals, and
    `prefers-reduced-motion`.
  - Mark `lang` on mixed-language text. Link the accessibility statement page (הצהרת נגישות) in
    the footer.
- **SEO:**
  - JSON-LD for Product + Offer, BreadcrumbList and Organization.
  - One `<h1>` per page, a canonical URL, and meta tags from the SEO fields.
  - Alt text comes from the image alt or the product title.
  - Verify hreflang tags for he/en/ar in QA.

## Validation and QA gate

Run all of this before every commit that touches theme files, and before every owner checkpoint:

1. **Liquid validator** (Shopify's official one, bundled, telemetry off):
   `npm run theme:validate` (all files) or `npm run theme:validate -- sections/a.liquid snippets/b.liquid`
   Translations: `npm run i18n` after editing `i18n/*`, and `npm run i18n:check`.
2. **Theme check:** `npm run theme:check` must report no errors.
3. **Formatting:** `npm run format:check`.
4. **After the dev theme updates:**
   - `npm run qa:shots` covers he/en/ar × mobile/desktop. Look at the screenshots yourself.
   - `npm run qa:a11y` runs axe.
   - The `theme-qa` agent can run the full pass and report.
5. **Self-review** against `review-ai-shopify-liquid` before calling anything done.
