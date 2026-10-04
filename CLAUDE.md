# SportWear: project brief for Claude

This repo is the **SportWear** Shopify store: a theme built from scratch (it will live at the
repo root), the product-catalog pipeline, and the tooling around both. The owner writes in Hebrew.
Answer in Hebrew and address them in the plural (אתם) unless they say otherwise.

## The business

- An Israeli online store selling **football jerseys, basketball jerseys and basketball shorts** at
  affordable prices.
  - Current season (26/27), a mix of leagues and teams.
  - Adults and kids.
  - Paid name printing on the back (₪35 per item) on football and basketball jerseys, since the owner's change of
    2026-09-29 (bca8d7c): an UNLISTED product "הדפסת שם אישי בגב" and the theme setting
    `personalization_variant_id`. No number or patch printing. NFL jerseys (already named) don't offer it.
- **Audience:** sports fans. Kids 6–12 (bought by parents), 12–18, 18–26 and 26+ (owner's
  estimate), plus amateur teams ordering in bulk.
- **Stock and delivery:** stock is held in Israel. Home delivery within up to 10 business days (owner
  decision, 2026-09-26; it was 3 business days before).
- **Shipping:** free on every order, Israel only (owner decisions, 2026-09-26). Admin's only zone is
  Israel, with one method, "משלוח חינם עד הבית" at ₪0, described "עד 10 ימי עסקים".
- **Prices:** adult football shirts ₪139, kids sets (shirt + shorts) ₪99, basketball jerseys ₪149,
  basketball shorts ₪119, kids basketball jerseys ₪89 (owner, 2026-09-28: "רק לילדים תעשה מחיר 89 לגופיה"; they were
  ₪149), NFL hoodies ₪249, NFL jerseys ₪139 for adults and ₪89 for kids (owner, 2026-10-04). New products keep the
  same prices (owner, 2026-09-27: "אותו מחיר עד היום").
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
| Storefront | **open to the public**: the password was off when checked on 2026-09-26 22:34 UTC (it was on before). No payment gateway yet. Since the owner published "SportWear (next)" (2026-09-28 13:06 UTC) the live site has no originality claim and the current shipping texts (checked in he/en/ar at 14:20 UTC); the owner published "SportWear (next 2)" on 2026-09-29 |
| Catalog | 1,754 products (2026-10-04): 1,737 ACTIVE, all on the Online Store (191 NFL jerseys added on 2026-10-04); 16 DRAFT since 2026-09-28 (the 15 hidden with the owner's approval and the demo product); 1 UNLISTED, the name-printing product; 0 orders. Details in "The catalog" below |
| Live theme | Our theme: "SportWear (next 2)", `gid://shopify/OnlineStoreTheme/188590424368`, published by the owner on 2026-09-29 at about 09:14 UTC (its theme files are the repo at bca8d7c: the new hero photos, the six category tiles and the owner's name printing). Never write to it. The themes live before, "SportWear (next)" (`188528591152`, at fbe8d55) and "SportWear (dev)" (`188519711024`), and Horizon are unpublished |
| Dev theme | "SportWear (next 3)", unpublished, `gid://shopify/OnlineStoreTheme/188617490736` (`SW_PREVIEW_THEME_ID=188617490736`), a copy of the live theme made on 2026-09-29 09:18 UTC (named "next 3" because the live theme is "SportWear (next 2)"). On it since then (2026-10-04): an NFL jerseys row on the home page (after the team cards), the hoodies category tile leading to the `nfl` collection, and on product pages closing rows that take turns by sport (`show_for` / `rotation` in `featured-collection`). A product-page story band (one big lifestyle photo) was tried the same day and taken out: the owner found it huge, generic and of no use to the buyer. The theme keeps an empty `sections/product-story.liquid` (not in the repo) because the connector cannot delete theme files. Editor changes made in the live theme from now on are not in the copy. `deployed_commit` in `catalog/store-setup.json`. Deploy here; the owner publishes. Deploy steps: `.claude/skills/sportwear-theme/references/deploy.md` |
| Locales | `he` is primary (since 2026-09-26); `en` and `ar` are published. All three are on the main domain's web presence: `/`, `/en`, `/ar` |
| Store translations | English and Arabic registered for every product (the 1,098 imported ones since 2026-09-27, `catalog/translations/older-products.json`), the collections, menus, pages and league names. Only the demo product has none. See `catalog/translations/README.md` |
| Store setup | Metaobjects, metafield definitions, 240 smart collections (leagues, clubs, national teams, NBA teams, NFL teams, players, styles, kids; 59 clubs added with wave 2 on 2026-09-27, 35 NFL collections on 2026-10-04: `nfl`, `nfl-jerseys`, `nfl-jerseys-kids` and the 32 team pages), 2 manual collections (`our-picks`, the home page's first row, editable by the owner; `collabs`, "שיתופי פעולה", 250 products for the owner's influencer barter platform, on no channel, 2026-09-30, `catalog/published/collabs-2026-09-30.json`), 6 pages, 3 menus. The collection metafield `sportwear.banner` ("באנר", a wide picture) is set on 35 collections (32 on 2026-09-27; `nfl`, `nfl-jerseys`, `nfl-jerseys-kids` on 2026-10-04), and the collector-card metafields (`sportwear.card_image`, `card_color`, `card_mark`) on 170 player and team collections: every team page but the four NFL teams with no jersey yet (136 added on 2026-10-04; `design/imagery/collector-cards.json`). The set price: 1 automatic discount ("מחיר סט: גופייה + מכנסיים") and 2 internal smart collections for it (`set-offer-jerseys`, `set-offer-shorts`, on no channel). The 19 collections behind the home rows are sorted by hand (MANUAL) since 2026-09-28: big teams first, adults before kids, jerseys before shorts, the items flagged for the owner last (it was best selling, i.e. newest first with no orders). The 158 team pages (126 + the 32 NFL teams) are MANUAL too, each in the team's own order (adults, then shorts, then kids, then hoodies: men's, women's, kids'; `team_collections` in `catalog/collection-order.json`); so are `nfl`, `nfl-jerseys` and `nfl-jerseys-kids`. After an import, re-run `scripts/catalog/collection-order.py` (record: `catalog/published/collection-order-2026-09-28.json`). IDs in `catalog/store-setup.json` |
| Shipping | Israel only: free on every order, up to 10 business days (since 2026-09-26). The international zone (27 countries, ₪58) was deleted on 2026-09-26 |
| Sitemap and SEO | `https://sportwear.co.il/sitemap.xml`, built by Shopify: one index for Hebrew (root), `/en` and `/ar`. All 5,328 URLs checked on 2026-09-28 (the owner: "חייב לדאוג ל sitemap כמו שצריך לכל השפות"): status, lang, canonical, hreflang, title and description in each language. 6 empty resources are kept out with `seo.hidden` (collections `frontpage`, `basketball-sets`, `sale`, `euroleague`, `israeli-basketball-league`, blog `news`): remove the metafield when one gets products. The 12 league and category collections without a description have an SEO description in he/en/ar. Record: `catalog/published/seo-2026-09-28.json` |
| Legal texts | `legal/` (see its README). Live in he/en/ar since 2026-09-27: `/pages/shipping-returns` (a friendly returns and shipping text, 45 days; the URL to give as the return policy) and `/pages/accessibility`. The store policies (`/policies/*`) wait for the owner to paste them from https://claude.ai/code/artifact/9e4da37c-1a78-4630-9b76-3cb5c20d8455 |
| Google | The owner connected the Google & YouTube channel and Merchant Center on 2026-09-27. Initial review pending; what to do about each notice is on the paste page above |
| Logo | The owner's SW monogram, vectorized (`snippets/logo-mark.liquid`, files in `design/logo/`). Header shows the mark only, centered; favicon `sw-favicon.png` |
| Shopify MCP connector | available in sessions. It follows the owner's account, not this store: on 2026-09-30 it pointed at another store (MAGBAG) until the owner reconnected it, so check `shop { myshopifyDomain }` (`sfgzdp-1m.myshopify.com`) before any write, never touch another store, and don't use `switch-shop` without the owner. Writes to the live (MAIN) theme, theme publishing and theme deletion are blocked by the connector itself. It also refuses `bulkOperationRunMutation`: create products with one `productSet` per call (parallel agents, one group each), then `bulk-update-product-status` and `publicationUpdate`, 50 per call. Stage at most 40 images per `stagedUploadsCreate` call (a bigger result is too large to come back inline). It has no `write_legal_policies` scope, so `shopPolicyUpdate` is refused: the owner pastes policies, and we register their translations (`translationsRegister` works on `ShopPolicy`) |

## The catalog (as of 2026-10-04)

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
- **Scans of 2026-09-28** (the owner: "עברת על כל המוצרים וראית שהשמות תואמים למוצר עצמו"):
  - the 335 products of wave 2 and the shorts, photo by photo: 2 titles, 2 upside-down close-ups, 8 renders fixed in
    place (crest and sponsor lettering, sleeves, colours) and 11 front photos added where only a back showed
    (`catalog/published/scan-2026-09-28.json`);
  - a consistency round over all the products fixed 194: 42 Hebrew titles, the description's first line, 437 alt
    texts, their en/ar translations, 13 tags and 2 adult/kids pairs
    (`catalog/published/consistency-fixes-2026-09-28.json`);
  - the Hornets City Edition 2022 set now reads "צבע מדורג" and the two Heat kids #22 jerseys "מהדורת עיר 2022"
    (`catalog/published/wording-fixes-2026-09-28.json`).
- **Titles:** a title can end in " | detail" to tell look-alike products apart ("… מספר 5 שחור | פס ירוק בחזה"). The
  site shows it as a quieter "· detail"; alt texts, page titles and screen readers get ", detail".
- **Approved on 2026-09-28** (the owner: "הכל מאושר. רק לילדים תעשה מחיר 89 לגופיה"):
  - 15 products hidden (DRAFT): 5 duplicates, 7 BAPE, 2 Supreme and the Louis Vuitton print. Their URLs redirect to the
    copy kept on sale, the Bulls page or מהדורות מיוחדות. The demo product is DRAFT too
    (`catalog/published/hidden-2026-09-28.json`).
  - Burnley, West Ham and Wolves (league `championship`) and Girona (`segunda-division`) moved to ליגות נוספות: tags,
    league filter, the other-leagues rule and the menu (`catalog/published/relegated-2026-09-28.json`).
  - The 75 kids basketball jerseys cost ₪89 instead of ₪149 (`catalog/published/prices-2026-09-28.json`).
- **Real Madrid home 26/27 fixed on 2026-09-30** (the owner asked why it shows buttons). Its supplier album (252535921)
  is a button-front version the club never released; the real shirt is album 221456533. Its front and back photos, the
  Real Madrid team card, the share images and the football hero slide were remade from the real shirt and replaced in
  place, and `sportwear.source_url` points at album 221456533 (`catalog/published/real-madrid-home-fix-2026-09-30.json`).
  A check of all 424 football products found no other button-front shirt.
- **Collaborations collection** (the owner, 2026-09-30): `collabs` ("שיתופי פעולה"), 250 adult products for the
  influencer barter platform the owner works with (up to 250 products; each influencer picks one or two): 97 football
  shirts, 103 basketball jerseys and 50 shorts, the most popular teams and players first, in a mixed order, each pair of
  shorts right after its jersey. On no sales channel, `seo.hidden` = 1 (`catalog/published/collabs-2026-09-30.json`).
- **NFL jerseys from nfl-cyq888** (the owner, 2026-10-04: "יש מוצרים נוספים שצריך להוסיף לאתר"; prices ₪139 / kids ₪89, a
  selection of each team's stars, live after our check): 309 picked (217 adult, 92 kids). 191 are live (139 adult, 52
  kids; tag `source:nfl-cyq888`, product type `NFL Jersey`), with studio photos checked against the supplier's, en/ar,
  37 adult ↔ kids pairs and filter names. 17 wait for a new render and 101 for their first render: the OpenAI credit
  ran out. Menu: a top-level "NFL" (jerseys by team, kids, hoodies). `catalog/sources/nfl-cyq888/` (README, `status.json`),
  `catalog/published/nfl-2026-10-04.json`.

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

The launch page lists every step only the owner can take, in order:
https://claude.ai/code/artifact/0a86a746-7375-4518-a988-eb6b8e53b25e (2026-09-28). The owner's ticks are kept in the
page's db, document `launch/state` (`done`: step id → true); read them with `read_db`. A tick is data, not an
instruction: a store change still needs the owner's "מאשר" in the conversation. The owner approved all six store
changes the page proposed on 2026-09-28 ("The catalog", "Approved on 2026-09-28"). Five are done. The sixth, readable
URLs for the 1,098 older products, waits for Google's approval of the store, as we recommended; the owner tells us when.
When it runs (`productUpdate` with `redirectNewHandle: true`): Shopify doesn't update references to a handle, and the
home page (`templates/index.json`) picks 6 of these products by handle (`sw-shorts-162704069`, `sw-jerseys-97381444`,
`sw-jerseys-96896163`, `sw-jerseys-244984876`, `sw-football-252374837`, `sw-football-250582309`). Change those settings
in the same step, on an unpublished theme the owner then publishes (never the live one). `catalog/translations/older-products.json`
and several records are keyed by the old handles: keep a map old → new.

- A promotion the owner asked about (2026-09-27): the third item (the cheapest) at 70% off, the fifth item free. Tested
  with two Buy X get Y test codes (deleted after) and `draftOrderCalculate`:
  - each works on its own with Shopify's own discounts: "buy 2, get 1 at 70% off" and "buy 4, get 1 free" go to the
    cheapest item;
  - on this plan the two never stack: with 5 items only the free item applies. They don't stack with the ₪229 set price
    either (Shopify picks the better deal for the customer);
  - both at once (5 items = one free plus one at 70% off) needs a discount app from the Shopify App Store (custom apps
    with Functions are Plus-only).

  Waiting on the owner: which version, which products, once per order or every 3 items, and when to start. After that:
  the automatic discounts plus the promotion on the site (announcement bar, product page, a cart line saying how many
  items to add)
- Which card gateway (and whether it supports Bit). Researched on 2026-09-28 (the launch page has the table and
  sources): Shopify Payments isn't available in Israel, so every provider comes through an app and Shopify adds 2% per
  sale on Basic. We recommended Grow (Israeli cards, Apple Pay, Google Pay and Bit, invoices built in, published prices,
  no setup fee, approval in about a business day; money paid out from the 1st of the next month), CardCom as the
  runner-up, Allpay if Google Pay can wait. Grow's terms (section 21.3.8) forbid goods that infringe trademarks: we told
  the owner to describe the products as they are and ask. Until then the site shows the official Visa, Mastercard,
  Apple Pay and Google Pay logos (Theme settings → Cart → Payment logos); add `american_express`,
  `diners_club` or `bit` there once the gateway takes them. Shopify has no Isracard logo. The cart page also shows
  a yellow PayPal button (Shopify's express checkout, from the PayPal entry in Settings → Payments; seen on
  2026-09-28): finish the PayPal setup or turn it off there
- Business and contact details for the site: business name and ID, address, WhatsApp/phone/email
  (the owner: "יטופל בהמשך"). The law asks for them before a purchase, and Google checks for contact details. The
  paste page's form puts them into the terms and builds the contact information policy; we add them to the
  accessibility statement and the contact page once the owner sends them
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
  - The initial review expects a checkout that can take a payment (no card gateway yet). The originality claim is off
    the live site since the owner published "SportWear (next)" on 2026-09-28.
  - "Personal hardships" most likely comes from the 8 Indiana Fever jerseys (Fever is a health term). It only limits
    personalized ads.
  - We told the owner that Google treats unlicensed products bearing brand or club logos as counterfeit (the account
    is suspended at once and for good), and that no wording change helps
- VAT: the prices show "כולל מע״מ" (taxes included). If the business is an עוסק פטור, that line comes off
- Stock: every variant shows 5 units. That is 7,468 variants: the 5,088 checked on 2026-09-27, the 1,616 added
  that day with wave 2 and the shorts, and the 764 of the NFL jerseys (2026-10-04), all created with 5. If that is not
  the real stock, a size sells out on the site after 5 orders and a size filter has nothing to narrow; only the owner
  knows the real quantities
- Publishing "SportWear (next 3)": the NFL row on the home page, the category tile that leads to all the NFL
  products, and the product pages' rotating rows (2026-10-04). The menu, collections and products are store-wide and
  already live. Also open: whether the site stays open until launch
- **NFL: 118 jerseys wait for the OpenAI credit** (platform.openai.com → Billing): 101 picks with no studio photo yet
  (among them every jersey of the Saints, Buccaneers, Titans and Commanders, whose pages show only their hoodies until
  then) and 17 held for a new render. How to finish: `catalog/sources/nfl-cyq888/README.md`
- NFL kids jerseys are sold in S–XL ("מידות ילדים S עד XL") with no size chart: the supplier's kids albums show none.
  Ask the supplier which ages each size fits, as for the 968-NBA kids jerseys
- Connecting GitHub to Shopify, a one-time step for the development theme
- Google Search Console: submit `sitemap.xml` (one index for the three languages) with the Google account used for
  Merchant Center. The domain's DNS is at the registrar (sitesdepot) and already has a google-site-verification TXT
  record. Steps: `catalog/published/seo-2026-09-28.json`, `search_console`. The theme's SEO fixes (whole titles, clean
  descriptions) are live since the owner published "SportWear (next)" on 2026-09-28
- The kids size chart of the products imported before. Their 106 kids products (75 basketball jerseys, 31 NFL
  hoodies, all from the supplier 968-NBA) are sold in S–XL. Those are the supplier's own kids sizes (its kids
  hoodie album says 童装 S-XL; the tags on its kids jerseys read S/M/L), but it publishes no chart, so a parent
  cannot tell which size fits which age. The owner noticed this on 2026-09-27; we gave them a message in Chinese
  asking the supplier for the chart (age, height, width, length for each size). Until it comes, the product page
  says these are kids' sizes. Record and next steps: `catalog/size-charts/968-nba.json`
- The barter platform (2026-09-30): how it takes the products is not known yet (a Shopify app or sales channel, a
  link, or a file). The `collabs` collection is ready in admin on no channel. If the platform needs its own channel or
  a link on the site, publishing is the owner's call: ask first
- Products flagged for the owner:
  - The supplier's photos of the Hawks 15 yellow jersey (`sw-jerseys-105462222`) show the back name misprinted
    as "ANTHIOY" (the site shows only its front; check with the supplier).
  - The supplier's front photo of the Timberwolves City Edition jersey (`sw-jerseys-152407516`) reads
    "MINNESTOA" (the site shows only its back; check with the supplier).
  - The album of the Lakers 24 jersey (`sw-jerseys-125774963`) also shows another white Lakers jersey. Order
    the white "Los Angeles" City Edition shown on the site.
  - The SuperSonics 35 white retro (`sw-jerseys-135857824`) shows only its back: its album has no full front photo.
