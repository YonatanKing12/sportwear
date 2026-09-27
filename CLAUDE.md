# SportWear: project brief for Claude

This repo is the **SportWear** Shopify store: a theme built from scratch (it will live at the
repo root), the product-catalog pipeline, and the tooling around both. The owner writes in Hebrew.
Answer in Hebrew and address them in the plural (אתם) unless they say otherwise.

## The business

- An Israeli online store selling **football jerseys, basketball jerseys and basketball shorts** at
  affordable prices.
  - Current season (26/27), a mix of leagues and teams.
  - Adults and kids.
  - No name, number or patch printing for now.
- **Audience:** sports fans. Kids 6–12 (bought by parents), 12–18, 18–26 and 26+ (owner's
  estimate), plus amateur teams ordering in bulk.
- **Stock and delivery:** stock is held in Israel. Home delivery within up to 10 business days (owner
  decision, 2026-09-26; it was 3 business days before).
- **Shipping:** free on every order, Israel only (owner decisions, 2026-09-26). Admin's only zone is
  Israel, with one method, "משלוח חינם עד הבית" at ₪0, described "עד 10 ימי עסקים".
- **Prices:** adult football shirts ₪139, kids sets (shirt + shorts) ₪99, basketball jerseys imported
  before ₪149. A basketball jersey with the shorts of the same kit costs ₪229 instead of ₪268 (owner
  decision 2026-09-27: an automatic discount takes ₪39 off the shorts; `catalog/pricing.json`, `sets`).
  Lots of promotions are planned.
- **Returns:** up to 45 days. The owner said "unopened"; we recommended "unworn, unwashed, tags on"
  instead, pending a lawyer's review of the wording.
- **Payments:** an Israeli card gateway (which one is not decided yet) plus Apple Pay and Google Pay.
  Invoices and receipts come from the gateway.
- **Languages:** Hebrew (default, RTL), English and Arabic (RTL).
- **Domain:** `sportwear.co.il`, not bought yet (it looked free on 2026-09-25). No existing sales
  channels; this starts from zero.
- **Launch target:** early October 2026 (≈ Oct 8, right after Sukkot).

## The store (facts as of 2026-09-27)

| Item | Value |
| --- | --- |
| Shop | `sfgzdp-1m.myshopify.com` ("SportWear") |
| Plan | Basic, ILS, Israel |
| Storefront | **open to the public**: the password was off when checked on 2026-09-26 22:34 UTC (it was on before). No payment gateway yet, and the live theme still shows the old shipping texts (free above ₪250, 3 business days) |
| Catalog | 1,098 products imported by the owner (tag `source:yupoo`), 0 orders. A full scan on 2026-09-27 checked every product's title and description against its photos: 47 titles fixed, 4 photo fixes, 4 back photos added (`catalog/published/scan-fixes-2026-09-27.json`). 532 products also show the supplier's real close-ups of the fabric and print after their studio photos: 979 photos (`catalog/published/fabric-closeups-2026-09-27.json`, `design/imagery/README.md`). One demo product (tag `demo`, ACTIVE, not on any channel) awaits the owner's decision. Every Online Store product carries the storefront-filter metafields, and the owner added the filters in Search & Discovery; checked on the storefront in he/en/ar (2026-09-27, `catalog/published/filters-2026-09-27.json`). Sets: 22 basketball jerseys and the 6 shorts of the same design are paired (`sportwear.complements`, shown as "השלימו את הסט" on the product page and in the cart; `catalog/published/complements-2026-09-27.json`). Wave 1 from jerseyxie: 128 products (tag `source:jerseyxie`, files in `catalog/published/`), ACTIVE and on the Online Store since 2026-09-26, on the owner's instruction ("אתה יכול להפעיל לבד"). Review page: https://claude.ai/code/artifact/0e56a640-3b84-42af-bf9d-6abd4d4677af |
| Live theme | Our theme: "SportWear (dev)", `gid://shopify/OnlineStoreTheme/188519711024`, published by the owner on 2026-09-26 (at commit 71be9d5). Never write to it. Horizon is now unpublished |
| Dev theme | "SportWear (next)", unpublished, `gid://shopify/OnlineStoreTheme/188528591152` (`SW_PREVIEW_THEME_ID=188528591152`), a copy of the live theme made on 2026-09-26, updated on 2026-09-27 with the real-site QA fixes (`deployed_commit` in `catalog/store-setup.json`). Deploy here; the owner publishes. Deploy steps: `.claude/skills/sportwear-theme/references/deploy.md` |
| Locales | `he` is primary (since 2026-09-26); `en` and `ar` are published. All three are on the main domain's web presence: `/`, `/en`, `/ar` |
| Store translations | English and Arabic registered for every product (the 1,098 imported ones since 2026-09-27, `catalog/translations/older-products.json`), the collections, menus, pages and league names. Only the demo product has none. See `catalog/translations/README.md` |
| Store setup | Metaobjects, metafield definitions, 146 smart collections (leagues, clubs, national teams, NBA teams, players, styles, kids), 1 manual collection (`our-picks`, the home page's first row, editable by the owner), 6 pages, 3 menus. The set price: 1 automatic discount ("מחיר סט: גופייה + מכנסיים") and 2 internal smart collections for it (`set-offer-jerseys`, `set-offer-shorts`, on no channel). IDs in `catalog/store-setup.json` |
| Shipping | Israel only: free on every order, up to 10 business days (since 2026-09-26). The international zone (27 countries, ₪58) was deleted on 2026-09-26 |
| Logo | The owner's SW monogram, vectorized (`snippets/logo-mark.liquid`, files in `design/logo/`). Header shows the mark only, centered; favicon `sw-favicon.png` |
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
   - Adults: S, M, L, XL.
   - Kids from the supplier jerseyxie: its own sizes 16–28 (ages 2-3 to 12-13), sold as sets
     (jersey + shorts). Owner decision, 2026-09-26.
   - New products from jerseyxie use the supplier's size charts (`catalog/size-charts/jerseyxie.json`).
     The products imported before keep their own chart, which the owner will send.
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
- **No originality claims anywhere.** No "original", "100% original", "authentic" or "genuine"
  (`מקורי`, `أصلي`) in the theme, product content, pages, SEO or translations. Owner decision,
  2026-09-26: the claim is a legal risk.
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

- Which card gateway (and whether it supports Bit). Until then the site shows the official Visa, Mastercard,
  Apple Pay and Google Pay logos (Theme settings → Cart → Payment logos); add `american_express`,
  `diners_club` or `bit` there once the gateway takes them. Shopify has no Isracard logo
- Selling prices for new basketball jerseys and shorts (football is set: adults ₪139, kids sets ₪99)
- Business and contact details for the site: business name and ID, address, WhatsApp/phone/email
  (the owner: "יטופל בהמשך")
- Demo products: keep and add the rest (active, behind the password), switch to draft, or delete
- Store policies: only Shopify's English privacy policy exists. Hebrew drafts of all five (terms, refunds,
  shipping, privacy, contact details) are on the legal drafts page below; they need the business details and a
  lawyer before they go into Settings → Policies
- The legal pages: the accessibility contact (name, phone, email), who pays return shipping, whether to
  charge the cancellation fee, and a lawyer's review. Full drafts (returns, cancellation, accessibility,
  and the five store policies) are on https://claude.ai/code/artifact/81442e94-2e3a-49a1-accb-4e113a95fd39.
  The site keeps its placeholders until the owner approves
- VAT: the prices show "כולל מע״מ" (taxes included). If the business is an עוסק פטור, that line comes off
- Two adult pink Real Madrid 26/27 third shirts are on sale (`sw-football-236063085` and
  `real-madrid-third-jersey-2026-27`): keep both or hide one
- Stock: every one of the 5,088 variants shows exactly 5 units (checked 2026-09-27). If that is not the
  real stock, a size sells out on the site after 5 orders and a size filter has nothing to narrow; only
  the owner knows the real quantities
- Buying the domain
- Publishing "SportWear (next)" (checked on the real store on 2026-09-26: it renders with the right texts), and whether the site stays open until launch.
  The live theme still shares links with no picture and the bare title "SportWear"; the new share image
  (`design/share/README.md`) and titles come with the publish
- Connecting GitHub to Shopify, a one-time step for the development theme
- The size chart of the products imported before (the owner will send it). Until then their 106 kids
  products are sold in S–XL with no chart (the size guide shows how to measure), so a parent cannot tell
  which size fits which age
- Two products flagged by the close-up review: the Bulls 23 print jersey (`sw-jerseys-158635085`) is an
  all-over Louis Vuitton monogram (a trademark risk: keep or hide), and the supplier's photos of the Hawks
  15 yellow jersey (`sw-jerseys-105462222`) show the back name misprinted as "ANTHIOY" (the site shows only
  its front; check with the supplier)
