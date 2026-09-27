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
- **Prices:** adult football shirts ₪139, kids sets (shirt + shorts) ₪99, basketball jerseys ₪149,
  basketball shorts ₪119. New products keep the same prices (owner, 2026-09-27: "אותו מחיר עד היום").
  A basketball jersey with the shorts of the same kit costs ₪229 instead of ₪268 (owner decision
  2026-09-27: an automatic discount takes ₪39 off the shorts; `catalog/pricing.json`, `sets`).
  Lots of promotions are planned.
- **Returns:** up to 45 days. The owner said "unopened"; we recommended "unworn, unwashed, tags on"
  instead, pending a lawyer's review of the wording.
- **Payments:** an Israeli card gateway (which one is not decided yet) plus Apple Pay and Google Pay.
  Invoices and receipts come from the gateway.
- **Languages:** Hebrew (default, RTL), English and Arabic (RTL).
- **Domain:** `sportwear.co.il`, the store's primary domain (the owner connected it; SSL on, checked
  2026-09-27). No existing sales channels; this starts from zero.
- **Launch target:** early October 2026 (≈ Oct 8, right after Sukkot).

## The store (facts as of 2026-09-27)

| Item | Value |
| --- | --- |
| Shop | `sfgzdp-1m.myshopify.com` ("SportWear") |
| Plan | Basic, ILS, Israel |
| Storefront | **open to the public**: the password was off when checked on 2026-09-26 22:34 UTC (it was on before). No payment gateway yet. The live theme still shows "100% מקורי" / "100% original" badges on every product page and in the mobile menu, and the old shipping texts (free above ₪250, 3 business days); "SportWear (next)" has neither (checked in he/en/ar on 2026-09-27) |
| Catalog | 1,562 products, all ACTIVE; 1,561 on the Online Store (the demo product is on no channel); 0 orders. Details in "The catalog" below |
| Live theme | Our theme: "SportWear (dev)", `gid://shopify/OnlineStoreTheme/188519711024`, published by the owner on 2026-09-26 (at commit 71be9d5). Never write to it. Horizon is now unpublished |
| Dev theme | "SportWear (next)", unpublished, `gid://shopify/OnlineStoreTheme/188528591152` (`SW_PREVIEW_THEME_ID=188528591152`), a copy of the live theme made on 2026-09-26, updated on 2026-09-27 with the real-site QA fixes and, on the owner's request, a home page without the kids sizes section (its basketball row now reads `basketball-jerseys`). `deployed_commit` in `catalog/store-setup.json`. Deploy here; the owner publishes. Deploy steps: `.claude/skills/sportwear-theme/references/deploy.md` |
| Locales | `he` is primary (since 2026-09-26); `en` and `ar` are published. All three are on the main domain's web presence: `/`, `/en`, `/ar` |
| Store translations | English and Arabic registered for every product (the 1,098 imported ones since 2026-09-27, `catalog/translations/older-products.json`), the collections, menus, pages and league names. Only the demo product has none. See `catalog/translations/README.md` |
| Store setup | Metaobjects, metafield definitions, 205 smart collections (leagues, clubs, national teams, NBA teams, players, styles, kids; 59 clubs added with wave 2 on 2026-09-27), 1 manual collection (`our-picks`, the home page's first row, editable by the owner), 6 pages, 3 menus. The set price: 1 automatic discount ("מחיר סט: גופייה + מכנסיים") and 2 internal smart collections for it (`set-offer-jerseys`, `set-offer-shorts`, on no channel). IDs in `catalog/store-setup.json` |
| Shipping | Israel only: free on every order, up to 10 business days (since 2026-09-26). The international zone (27 countries, ₪58) was deleted on 2026-09-26 |
| Legal texts | `legal/` (see its README). Live in he/en/ar since 2026-09-27: `/pages/shipping-returns` (a friendly returns and shipping text, 45 days; the URL to give as the return policy) and `/pages/accessibility`. The store policies (`/policies/*`) wait for the owner to paste them from https://claude.ai/code/artifact/9e4da37c-1a78-4630-9b76-3cb5c20d8455 |
| Google | The owner connected the Google & YouTube channel and Merchant Center on 2026-09-27. Initial review pending; what to do about each notice is on the paste page above |
| Logo | The owner's SW monogram, vectorized (`snippets/logo-mark.liquid`, files in `design/logo/`). Header shows the mark only, centered; favicon `sw-favicon.png` |
| Shopify MCP connector | available in sessions. Writes to the live (MAIN) theme, theme publishing and theme deletion are blocked by the connector itself. It also refuses `bulkOperationRunMutation`: create products with one `productSet` per call (parallel agents, one group each), then `bulk-update-product-status` and `publicationUpdate`, 50 per call. Stage at most 40 images per `stagedUploadsCreate` call (a bigger result is too large to come back inline). It has no `write_legal_policies` scope, so `shopPolicyUpdate` is refused: the owner pastes policies, and we register their translations (`translationsRegister` works on `ShopPolicy`) |

## The catalog (as of 2026-09-27)

- **Imported by the owner:** 1,098 products (tag `source:yupoo`).
  - A full scan on 2026-09-27 checked every product's title and description against its photos: 47 titles
    fixed, 4 photo fixes, 4 back photos added (`catalog/published/scan-fixes-2026-09-27.json`). 17 more
    "מהדורת עיר" titles were fixed later that day (`catalog/published/city-edition-fixes-2026-09-27.json`).
  - 532 products also show the supplier's real close-ups of the fabric and print after their studio photos:
    979 photos (`catalog/published/fabric-closeups-2026-09-27.json`, `design/imagery/README.md`).
- **jerseyxie, wave 1:** 128 products (tag `source:jerseyxie`), ACTIVE and on the Online Store since
  2026-09-26, on the owner's instruction ("אתה יכול להפעיל לבד"). Review page:
  https://claude.ai/code/artifact/0e56a640-3b84-42af-bf9d-6abd4d4677af
- **jerseyxie, wave 2:** 229 products of 60 clubs, season 26/27: 137 adult jerseys at ₪139 and 92 kids sets
  at ₪99. ACTIVE and on the Online Store since 2026-09-27, on the owner's instruction ("יש לך אישור מלא ואותו
  מחיר עד היום", and the owner confirmed the 244-row wave). The 15 rows left out and their reasons:
  `catalog/published/wave2-2026-09-27.json`. How it ran and the supplier traps: `catalog/sources/jerseyxie/README.md`.
- **NBA shorts from xingkong-sports:** 106 (tag `source:xingkong-sports`) at ₪119, ACTIVE and on the Online
  Store since 2026-09-27, on the owner's instruction; 116 shorts in all with the ten from before
  (`catalog/sources/xingkong-sports/README.md`).
- **Sets:** 84 of the 116 shorts are paired with 204 basketball jerseys of the same design:
  - `sportwear.complements` and the tags `set:shorts` / `set:jersey`;
  - shown as "השלימו את הסט" on the product page and in the cart;
  - ₪229 per pair in the cart;
  - logs: `catalog/published/complements-2026-09-27.json`, `complements-shorts-2026-09-27.json`.
- **Adults ↔ kids:** 136 pairs linked both ways by `sportwear.counterpart` (the adults/kids toggle on the
  product page). 88 of them were added on 2026-09-27, 6 of those with older adult shirts
  (`catalog/published/counterparts-2026-09-27.json`). Only a team and kit with one adult product and one
  kids set is linked.
- **Filters:** every Online Store product carries the storefront-filter metafields, and the owner added
  the filters in Search & Discovery; checked on the storefront in he/en/ar (2026-09-27,
  `catalog/published/filters-2026-09-27.json`).
- **Ordering from the supplier:** each product from wave 1, wave 2 and the shorts keeps its source album in
  `sportwear.source_url`. Order from that album: albums of the same shirt can differ in sponsors
  (Galatasaray: PASIFIK HOLDING or SOCAR), and kids sets often carry another sponsor than the adult shirt,
  or none.
- **Demo:** one demo product (tag `demo`, ACTIVE, not on any channel) awaits the owner's decision.

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
legal/              the store's legal texts as they are in Shopify (pages live, policies to paste; see its README)
scripts/            QA (screenshots, a11y), catalog helpers, legal/build-policies.mjs
i18n/               translation parts per area, built into locales/ by npm run i18n
(theme folders)     layout/ templates/ sections/ blocks/ snippets/ assets/ config/ locales/
```

## Open items (waiting on the owner)

- Which card gateway (and whether it supports Bit). Until then the site shows the official Visa, Mastercard,
  Apple Pay and Google Pay logos (Theme settings → Cart → Payment logos); add `american_express`,
  `diners_club` or `bit` there once the gateway takes them. Shopify has no Isracard logo
- Business and contact details for the site: business name and ID, address, WhatsApp/phone/email
  (the owner: "יטופל בהמשך"). The law asks for them before a purchase, and Google checks for contact details. The
  paste page's form puts them into the terms and builds the contact information policy; we add them to the
  accessibility statement and the contact page once the owner sends them
- Demo products: keep and add the rest (active, behind the password), switch to draft, or delete
- **Urgent: pasting the store policies.** The ones live now are the owner's own (checked 2026-09-27 21:00 UTC):
  - the refund policy, which the product pages and the checkout link to: Shopify's template translated to Hebrew, with
    30 days instead of 45, "[INSERT RETURN ADDRESS]" and the owner's personal email;
  - the terms of service, which start with a pasted chat preamble ("הנה טיוטת Terms of Service לחנות SportWear:");
  - the privacy policy: Shopify's English template, with the owner's personal details;
  - no shipping policy.

  The texts to replace them (refund, terms, privacy, shipping, and contact information from the owner's details) are
  on the paste page, https://claude.ai/code/artifact/9e4da37c-1a78-4630-9b76-3cb5c20d8455, with the Shopify return
  rules to set. The connector cannot write policies. After the owner pastes: en/ar translations and a check
  (`legal/README.md`). A lawyer should still review them; the full terms draft with notes for the lawyer:
  https://claude.ai/code/artifact/dce0b2bd-e3ab-491d-881e-74eebf55ea14
- The legal pages are live (2026-09-27, he/en/ar): the shipping-returns page in a friendly tone and the accessibility
  statement. The owner asked us to handle the whole legal side, so we took the pending decisions as recommended
  (no cancellation fee, the customer pays return shipping, damaged parcels reported within 7 days, business days
  Sunday to Thursday; `legal/README.md`). Still open: an accessibility contact (name, phone, email; until then
  requests go through the contact page) and a lawyer's review. The notes for the lawyer are on
  https://claude.ai/code/artifact/81442e94-2e3a-49a1-accb-4e113a95fd39
- Google Merchant Center (connected by the owner on 2026-09-27). Steps are on the paste page:
  - "Missing local inventory data": remove the Free local listings and Local inventory ads add-ons (no physical
    store).
  - The return policy has to be added in Merchant Center too, because the Google app doesn't sync it: 45 days, with
    the shipping-returns URL.
  - Verify a phone number and address in Business info.
  - The initial review expects a checkout that can take a payment (no card gateway yet) and a site without the
    originality claim (publish "SportWear (next)").
  - "Personal hardships" most likely comes from the 8 Indiana Fever jerseys (Fever is a health term). It only limits
    personalized ads.
  - We told the owner that Google treats unlicensed products bearing brand or club logos as counterfeit (the account
    is suspended at once and for good), and that no wording change helps
- VAT: the prices show "כולל מע״מ" (taxes included). If the business is an עוסק פטור, that line comes off
- Two adult pink Real Madrid 26/27 third shirts are on sale (`sw-football-236063085` and
  `real-madrid-third-jersey-2026-27`): keep both or hide one. The kids third links to the second one
- Stock: every variant shows 5 units. That is 6,704 variants: the 5,088 checked on 2026-09-27, plus the 1,616
  added that day with wave 2 and the shorts, all created with 5. If that is not the real stock, a size sells
  out on the site after 5 orders and a size filter has nothing to narrow; only the owner knows the real
  quantities
- **Urgent: publishing "SportWear (next)".** The live theme still shows the originality claim the owner ruled out
  ("100% מקורי" on every product page and in the mobile menu), now while Google reviews the store. It also still has
  the old shipping texts (free above ₪250, 3 business days), which contradict the free shipping Google gets, and
  shares links with no picture and the bare title "SportWear". The publish fixes all of these and brings the new
  share image (`design/share/README.md`), the titles and the 2026-09-27 home page changes. Also open: whether the
  site stays open until launch
- Order on the home page and the NBA page (optional). The home football row and the NBA collection sort newest
  first, so since 2026-09-27:
  - the row opens with the clubs added that day (Torino, Sporting…);
  - the NBA page opens with the 116 shorts, before the jerseys.

  We offered to put the big clubs and the jerseys first
- Connecting GitHub to Shopify, a one-time step for the development theme
- The kids size chart of the products imported before. Their 106 kids products (75 basketball jerseys, 31 NFL
  hoodies, all from the supplier 968-NBA) are sold in S–XL. Those are the supplier's own kids sizes (its kids
  hoodie album says 童装 S-XL; the tags on its kids jerseys read S/M/L), but it publishes no chart, so a parent
  cannot tell which size fits which age. The owner noticed this on 2026-09-27; we gave them a message in Chinese
  asking the supplier for the chart (age, height, width, length for each size). Until it comes, the product page
  says these are kids' sizes. Record and next steps: `catalog/size-charts/968-nba.json`
- Products flagged for the owner:
  - The Bulls 23 print jersey (`sw-jerseys-158635085`) is an all-over Louis Vuitton monogram (a trademark risk:
    keep or hide).
  - The supplier's photos of the Hawks 15 yellow jersey (`sw-jerseys-105462222`) show the back name misprinted
    as "ANTHIOY" (the site shows only its front; check with the supplier).
  - The supplier's front photo of the Timberwolves City Edition jersey (`sw-jerseys-152407516`) reads
    "MINNESTOA" (the site shows only its back; check with the supplier).
  - The album of the Lakers 24 jersey (`sw-jerseys-125774963`) also shows another white Lakers jersey. Order
    the white "Los Angeles" City Edition shown on the site.
  - Two different black Timberwolves 5 jerseys have near-identical titles (`sw-jerseys-164994797`,
    `sw-jerseys-164118532`).
