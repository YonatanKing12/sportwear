---
name: sportwear-catalog
description: SportWear product data model and the links → JSON → Shopify DRAFT pipeline. Use whenever collecting product data from links, preparing or reviewing product JSON, creating or updating products, collections, metafields or translations in the SportWear store, or answering how products are named, tagged, sized, priced or photographed.
---

# SportWear catalog

## Pipeline (who does what)

1. **The owner sends product links**: supplier or importer pages, one or many.
2. **`product-scout` agent** (a batch of up to ~10 links per agent, so several can run in parallel)
   writes one file per product to `catalog/incoming/<handle>.json`, following
   `catalog/product.schema.json`. Each file starts with `status: "needs_review"` and lists open
   `questions`.
3. **Main session**:
   - Goes over the batch with the owner: prices, stock quantities, uncertain team/season/kit, image
     rights.
   - Fixes the files, sets `status: "ready"` and moves them to `catalog/ready/`.
4. **`catalog-translator` agent** fills `translations.en` and `translations.ar` in the ready files.
5. **`product-publisher` agent**:
   - Creates each product in Shopify as **DRAFT** with `productSet`.
   - Writes the Shopify IDs back into the file and moves it to `catalog/published/`.
6. **`catalog-translator` agent** registers the EN/AR translations on the published products.
7. **The owner reviews the drafts** in Shopify admin. A product becomes ACTIVE only on the owner's
   explicit instruction.

**Prerequisites before step 5 (one-time, owner-approved):**
- The store's primary language is switched to Hebrew, with English and Arabic added.
- The metafield and metaobject definitions from `catalog/metafields.json` exist.
- Pricing rules are filled in `catalog/pricing.json`.

## Data model

Each product is one team × one kit × one season × one audience.

- **Titles:**

  | Language | Pattern | Example |
  | --- | --- | --- |
  | he (primary) | `{kit_he} {team_he} {season}`, kids add ` – ילדים` | `חולצת בית ריאל מדריד 26/27`, `גופיית כדורסל מכבי תל אביב 26/27 – ילדים` |
  | en | `{team_en} {kit_en} {season}`, kids add ` – Kids` | `Real Madrid Home Jersey 26/27` |
  | ar | natural word order, kids add ` – أطفال` | `قميص ريال مدريد الأساسي 26/27` |

- **Handle:** `{team-slug}-{kit-slug}-{season-slug}[-kids]` in lowercase ASCII, for example
  `real-madrid-home-jersey-2026-27` or `maccabi-tel-aviv-basketball-jersey-2026-27-kids`. It never
  changes after publishing.
- **productType:** `Football Jersey` | `Football Kit` (kids sets: jersey + shorts) | `Basketball Jersey`
  | `Basketball Shorts` | `Hoodie` (the imported NFL hoodies). New types need owner approval.
- **vendor:** the manufacturer brand as shown on the product (Nike, adidas, Puma…).
- **status:** always `DRAFT` on creation.
- **tags** (drive collections and filters; names and rules in `catalog/classification.json`):
  - `sport:football|basketball|american-football`
  - `league:<slug>`, one per product: the 10 leagues of the store plus `primeira-liga`,
    `saudi-pro-league`, `mls`, `liga-mx`, `brasileirao`, `wnba`, `ncaa`, `nfl`. National teams use
    `league:national-teams` in both sports.
  - `team:<slug>`, one per product. The slug is also the team collection's handle, which the
    theme's breadcrumbs link to.
  - `style:retro|city-edition|special`, any combination (retro: "רטרו" in the title or a season
    before 2016; special: collabs, prints, special/commemorative editions)
  - `player:<slug>` plus the player's Hebrew name as a plain tag, only for a player named in the
    title or a high-confidence team + number pair (`player_numbers`)
  - `kit:home|away|third|fourth|special|training`
  - `season:2026-27`, football only
  - `audience:adult|kids|women`
  - `sale` only while discounted
  - **Search keywords:** plain tags with the team, league, player, product type, audience and
    style words in English (lowercase) and Arabic, plus Hebrew synonyms (גופייה, קפוצון…). They
    exist only so the storefront search finds the product in all three languages (imported
    products have no EN/AR translations). The lists live in `classification.json`. Shopify treats
    tags with the same handle as one tag ("all star" = "all-star"), so each list keeps one
    spelling per handle.
  - `node scripts/catalog/classify.mjs <products.jsonl> --out plan.json` computes the tags for a
    products export and prints what to add and remove; it never writes to Shopify. A re-run on an
    up-to-date store reports 0 changes. Apply a plan with `tagsAdd`/`tagsRemove` in aliased
    batches and log every change in `catalog/published/` (see
    `classification-2026-09-26.json`).
- **metafields** (namespace `sportwear`; definitions are planned in `catalog/metafields.json`):
  - `team`: a metaobject reference (`sw_team`)
  - `leagues`: a list of metaobject references (`sw_league`); a team can play in several
    competitions. Team and league names are translatable into he/en/ar.
  - `season`, `kit`, `audience`
  - `size_chart`: metaobject reference (`sw_size_chart`)
  - `counterpart`: the adult ↔ kids product
  - `complements`: set pieces: a basketball jersey ↔ the shorts of the same kit, in both directions
    (the jersey lists its shorts; the shorts list their jerseys, stars first). Pair only when the
    photos show the same design (colors, trim, wordmark), never on team and color words alone. The
    product page ("השלימו את הסט") and the cart read it. Log: `catalog/published/complements-2026-09-27.json`.
    Paired products also get the tags `set:jersey` / `set:shorts`: they put the pair under the automatic set
    discount (₪229 for both, ₪39 off the shorts; `catalog/pricing.json`, `sets`) and let the theme show the set
    price. A new pair needs complements both ways plus the two tags
  - `source_url`: internal, no storefront access
  - **Storefront filters** (the Search & Discovery app builds its filters on these): `audience`
    (`adult|kids|women`), `team_handle` (team slug), `league_handle` (league slug), `styles` and
    `player` (lists of slugs), `kit`. They mirror the tags, and `scripts/catalog/filter-data.mjs`
    computes them for a products export (plus `kit:` tags from the Hebrew title for football shirts
    that lack one). The theme shows their values by name from the shop metafield
    `sportwear.filter_names` (he/en/ar, built from `catalog/taxonomy.json` by
    `scripts/lib/filter-names.mjs`): a new team, league or player needs its names in `taxonomy.json`
    first, then the dictionary is written again. The storefront filters see new values only after the
    product itself changes: after `metafieldsSet`, run the script's `reindex/` add/remove pairs (a
    temporary `sw-reindex` tag). Details: `catalog/README.md`, "מסננים באתר".
- **Option:** a single `מידה` (Size) option. Values come from the size system (below).
- **Variants:** one per size.
  - SKU: `SW-{TYPE}-{TEAM}-{KIT}-{SEASON}-{A|K}-{SIZE}`, for example `SW-BJ-MTA-H-2627-A-M`.
    - TYPE codes: FJ (football jersey), FK (football kit, the kids sets), BJ (basketball jersey), BS
      (basketball shorts).
    - KIT codes: H, A, T, F, S, TR.
  - Inventory is tracked, with no overselling (`inventoryPolicy: DENY`).
  - Quantities come from the owner (default 0).
- **Media:**
  - Full-size image URLs from the source, ordered front, back, details. Aim for at least 1200px.
  - Alt text in Hebrew: `{title} – חזית` / `– גב` / `– פרט`.
  - **Only images the business may use**: the supplier's or importer's own product photos. Never
    images from competitor stores or official club shops unless the owner confirms rights.
  - **The store shows studio photos** (square, #F4F4F4, garment centered at ~95% height), made from
    the supplier photos with `scripts/images/studio.py` + `normalize.py` and checked against them
    before upload. Only the views the supplier photographed. The supplier photos stay in Files.
    Full process: `design/imagery/README.md`.
- **Description (Hebrew):**
  - One or two benefit-led sentences, then bullets: fabric and technology, fit, care.
  - No invented specs.
  - No originality claims: never write "מקורי", "original", "authentic" or "genuine", even when
    the source says so (owner decision, 2026-09-26).
- **SEO:** title up to 60 characters, meta description up to 155 characters, in Hebrew. A meta description
  set in Hebrew needs its `meta_description` translations in EN/AR registered in the same step: until they
  exist, `/en` and `/ar` show the Hebrew one. A product without one gets a clean description from the
  theme (`snippets/product-meta-description.liquid`).
- **Search engines and the sitemap** (`/sitemap.xml`, one index for he, `/en` and `/ar`; Shopify builds it):
  every product, collection, page and blog on the Online Store is in it, in all three languages. An empty
  collection or blog is kept out with the metafield `seo.hidden` = 1 (`number_integer`), which also adds
  noindex. Remove the metafield when it gets products. Which ones are hidden now:
  `catalog/published/seo-2026-09-28.json`.
- **Collections** are smart collections on the tags above, never ad hoc (IDs and rules in
  `catalog/store-setup.json`, EN/AR in `catalog/translations/store-content.json`):
  - by sport and product type (`football`, `basketball`, `basketball-jerseys`, `basketball-shorts`,
    `nfl-hoodies` with `-men`/`-women`/`-kids`), audience (`kids`, `kids-basketball`), `sale`, `new`
  - football: leagues, `national-teams` (football only), `season-2026-27`, `other-leagues`, and a
    collection per club with 2+ products (handle = team slug)
  - basketball: `nba` and one per NBA team (handle = team slug), `all-star`, `usa-basketball`,
    `college-and-wnba`, `retro`, `city-edition`, `special-editions`, one per player with 3+
    products (handle = player slug) and `players`
  - A new team or player collection needs a Hebrew title, a short description, EN/AR
    translations, publishing to the Online Store and a menu entry. A collection without a description
    (the leagues and categories) has an SEO description in he/en/ar instead, so search results show one.
  - **Order:** the 19 collections behind the home rows (`football`, `nba`, `basketball`, `basketball-jerseys`,
    the leagues, `national-teams`, `kids`, `season-2026-27`, `city-edition`, `retro`, `special-editions`,
    `kids-basketball`) are sorted by hand (MANUAL) since 2026-09-28: adults before kids, jerseys before shorts,
    big teams first, each team's best product first. Shopify doesn't place new products by these rules: after an
    import run `python3 scripts/catalog/collection-order.py fetch|plan|check <work_dir>` and apply the moves with
    `collectionReorderProducts` (rules in `catalog/collection-order.json`; `football` and `nba` are hand-set, see
    `catalog/published/collection-order-2026-09-28.json`). Team collections stay "best selling".

## Size systems

- **Adults:** `S`, `M`, `L`, `XL`. For the jerseyxie import the owner chose S–XL only
  (2026-09-26), even though the supplier also lists 2XL–4XL.
- **Kids from the supplier jerseyxie** (owner decision, 2026-09-26): the supplier's own sizes `16`,
  `18`, `20`, `22`, `24`, `26`, `28` (ages 2-3 to 12-13, heights 95–165 cm), as in its kids chart.
  Kids football products there are sets (jersey + shorts): `productType` `Football Kit`, price in
  `catalog/pricing.json`.
- **Size charts:** products from jerseyxie get the supplier's chart through the
  `sportwear.size_chart` metafield: `jerseyxie-football-adult-fan` (adults) or
  `jerseyxie-football-kids-set` (kids sets). The transcribed charts are in
  `catalog/size-charts/jerseyxie.json`; the metaobject IDs are in `catalog/store-setup.json`.
- **Products imported before that** (other sources) keep their sizes and get their own chart when
  the owner sends it. Don't give them the jerseyxie chart.
- **Other sources (only if the owner adds one):** kids `5-6`, `7-8`, `9-10`, `11-12`, `13-14` (heights
  116–164 cm). Brand labels (for example Nike YXS–YXL, adidas 116–164) are recorded as-is in
  `variants[].source_size_label`, mapped to these buckets, and flagged in `questions` when the
  mapping is not exact.

## Pricing

- Selling prices come **only** from `catalog/pricing.json`, or from the owner in the current
  conversation.
- If a rule is missing, leave `price: null`, add a question and stop before publishing. **Never
  invent a price.**
- The supplier's price, if visible, goes to `source.reference_price` for information only.

## Safety rules for any Shopify write

- Follow the Shopify MCP GraphQL workflow every time: `graphql_schema`, then
  `validate_graphql_codeblocks`, then execute.
- **Create as DRAFT only.** Never set ACTIVE, publish to channels, delete products, or change the
  price or stock of existing products without an explicit owner instruction in the conversation.
- **Before creating, look the handle up.** If it already exists, stop and report. Do not overwrite
  unless the owner asked.
- Never write to the live theme. Never store secrets in the repo.
- Everything written to Shopify is recorded in `catalog/published/<handle>.json`: IDs, timestamps
  and what was set.
