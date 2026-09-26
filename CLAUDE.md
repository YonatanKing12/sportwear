# SportWear: project brief for Claude

This repo is the **SportWear** Shopify store: a theme built from scratch (it will live at the
repo root), the product-catalog pipeline, and the tooling around both. The owner writes in Hebrew.
Answer in Hebrew and address them in the plural (אתם) unless they say otherwise.

## The business

- An Israeli online store selling **original football jerseys, basketball jerseys and basketball
  shorts** at affordable prices, sourced from a **parallel importer** (genuine goods).
  - Current season (26/27), a mix of leagues and teams.
  - Adults and kids.
  - No name, number or patch printing for now.
- **Audience:** sports fans. Kids 6–12 (bought by parents), 12–18, 18–26 and 26+ (owner's
  estimate), plus amateur teams ordering in bulk.
- **Stock and delivery:** stock is held in Israel. Home delivery within 3 business days.
- **Shipping:** ₪35. The free-shipping threshold is not decided (₪200 recommended). Admin currently has
  free shipping from ₪250, and the theme setting `free_shipping_threshold` mirrors it (250).
- **Price example:** a football shirt at ₪120. Lots of promotions are planned.
- **Returns:** up to 45 days. The owner said "unopened"; we recommended "unworn, unwashed, tags on"
  instead, pending a lawyer's review of the wording.
- **Payments:** an Israeli card gateway (which one is not decided yet) plus Apple Pay and Google Pay.
  Invoices and receipts come from the gateway.
- **Languages:** Hebrew (default, RTL), English and Arabic (RTL).
- **Domain:** `sportwear.co.il`, not bought yet (it looked free on 2026-09-25). No existing sales
  channels; this starts from zero.
- **Launch target:** early October 2026 (≈ Oct 8, right after Sukkot).

## The store (facts as of 2026-09-25)

| Item | Value |
| --- | --- |
| Shop | `sfgzdp-1m.myshopify.com` ("SportWear") |
| Plan | Basic, ILS, Israel |
| Storefront | password-protected |
| Catalog | 0 real products, 0 orders. One demo product (tag `demo`, ACTIVE, not on any channel) awaits the owner's decision |
| Live theme | Horizon, a placeholder that will be replaced by our theme |
| Dev theme | "SportWear (dev)", unpublished, `gid://shopify/OnlineStoreTheme/188519711024` (`SW_PREVIEW_THEME_ID=188519711024`). Deploy steps: `.claude/skills/sportwear-theme/references/deploy.md` |
| Locales | `en` is still primary; `he` and `ar` are published. The owner must make Hebrew primary (Settings → Languages; the API can't) |
| Store setup | Metaobjects, metafield definitions, 19 smart collections, 6 pages, 3 menus. IDs in `catalog/store-setup.json` |
| Shipping | Israel ₪35, free from ₪250. An international zone (27 countries, ₪58) is active, probably a default |
| Shopify MCP connector | available in sessions. Writes to the live (MAIN) theme, theme publishing and theme deletion are blocked by the connector itself |

## Locked decisions

1. **The theme is built 100% from scratch.** No existing theme's code as a base (not Horizon, not
   Dawn, nothing else). See `.claude/skills/sportwear-theme/`.
2. **Design:**
   - Approved direction: "Night Match — hybrid", a dark brand shell with light shopping surfaces
     and a lime accent `#C6FF3D` (may change with the logo).
   - Canvas: https://claude.ai/artifact/AXjtro4CVL8sLLPBbKSs94. The boards titled "משולב" are the
     approved ones.
   - Tokens: `design/tokens.json`.
3. **Sizes:**
   - Adults: S, M, L, XL (XXL if stocked).
   - Kids: 5-6, 7-8, 9-10, 11-12, 13-14 (heights 116–164 cm).
   - **Kids are separate products** from adults.
4. **Catalog pipeline:** links → `product-scout` → owner review → `catalog-translator` →
   `product-publisher` (DRAFT only). See `.claude/skills/sportwear-catalog/` and `catalog/README.md`.
5. **Accessibility** is a legal requirement in Israel (IS 5568, WCAG AA). The target is WCAG 2.2 AA,
   plus an accessibility statement page.

## Hard rules

- **Never change the live theme.** Work on an unpublished development theme. The owner publishes.
- **Products are created as DRAFT.** Never activate, publish to channels, delete, or change the
  price or stock of existing products without an explicit instruction from the owner in the
  conversation.
- **Never invent prices, stock, specs or claims.** Prices come only from `catalog/pricing.json` or
  the owner.
- **Only use product images and text the business has rights to** (the supplier's own). Rewrite
  descriptions; do not copy them.
- **No secrets in the repo.** The storefront password and tokens go in environment variables
  (`SW_STOREFRONT_PASSWORD`, `SW_PREVIEW_THEME_ID`).
- **Shopify AI Toolkit telemetry stays off.** See `.claude/skills/VENDORED.md`.
- **Follow the Shopify MCP GraphQL workflow** for every Admin API call: `graphql_schema`, then
  `validate_graphql_codeblocks`, then execute.
- **Git:** develop on the branch the session assigns. Commit with clear messages. Never push to
  `main` without the owner's approval.

## How we work

- **Checkpoints with the owner:**
  1. Design direction (done ✓)
  2. Core pages: product, cart, collection, home
  3. Full site before launch

  Between checkpoints, work autonomously.
- **Before showing anything to the owner**, pass the QA gate in `sportwear-theme`: the validator,
  `npm run theme:check`, `npm run format:check`, screenshots in he/en/ar, and axe. The `theme-qa`
  agent can run the full pass.
- **Parallelize independent work with agents.** One `product-scout` per ~10 links.

## Skills (in `.claude/skills/`)

| Skill | Use it for |
| --- | --- |
| `sportwear-theme` | Our theme rules. Read it before touching theme files |
| `sportwear-catalog` | Our product data model and pipeline |
| `shopify` | Shopify's official toolkit: docs search and validators for Liquid, Admin GraphQL, custom data, and more |
| `shopify-liquid-themes`, `liquid-theme-standards`, `liquid-theme-a11y` | Shopify's official Liquid, CSS/JS and a11y guides |
| `review-ai-shopify-liquid`, `shopify-performance-audit`, `shopify-accessibility-audit`, `shopify-seo-structured-data`, `shopify-cro-audit`, `shopify-metafields-architect` | Review and audit checklists |

## Agents (in `.claude/agents/`)

| Agent | What it does |
| --- | --- |
| `product-scout` | Reads product links and writes JSON to `catalog/incoming/`. No Shopify writes |
| `product-publisher` | Creates DRAFT products from `catalog/ready/` |
| `catalog-translator` | Writes EN/AR content, then registers the translations in Shopify |
| `theme-qa` | Read-only QA gate for theme work |

## Commands

```bash
npm run theme:validate   # Shopify's official Liquid validator (all files, or pass file paths)
npm run theme:check      # Shopify theme-check (lint)
npm run i18n             # build locales/* from the translation parts in i18n/ (i18n:check verifies)
npm run format           # prettier (liquid, css, js, json)
npm run format:check
npm run qa:shots         # screenshots he/en/ar x mobile/desktop (needs SW_PREVIEW_THEME_ID, SW_STOREFRONT_PASSWORD)
npm run qa:a11y          # axe accessibility scan (same env)
node scripts/catalog/fetch-page.mjs "<url>"   # render a product page and dump its data (used by product-scout)
```

## Repo map

```
.claude/skills/     vendored + project skills (see VENDORED.md)
.claude/agents/     product-scout, product-publisher, catalog-translator, theme-qa
.claude/hooks/      session-start.sh (cloud sessions: installs deps, telemetry opt-out, browser trust for the proxy)
catalog/            product pipeline: schema, taxonomy, pricing, metafield plan, incoming/ready/published
design/             approved design tokens + notes
scripts/            QA (screenshots, a11y) and catalog helpers
i18n/               translation parts per area, built into locales/ by npm run i18n
(theme folders)     layout/ templates/ sections/ blocks/ snippets/ assets/ config/ locales/
```

## Open items (waiting on the owner)

- Logo
- Which card gateway (and whether it supports Bit)
- Selling prices for every product type (kids, tanks, shorts)
- The free-shipping threshold (admin says ₪250 today) and whether to keep international shipping
- Demo products: keep and add the rest (active, behind the password), switch to draft, or delete
- The final returns wording
- Buying the domain
- The storefront password, for QA screenshots
- Connecting GitHub to Shopify, a one-time step for the development theme
- The first batch of product links
