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
- **productType:** `Football Jersey` | `Basketball Jersey` | `Basketball Shorts`. New types need
  owner approval.
- **vendor:** the manufacturer brand as shown on the product (Nike, adidas, Puma…).
- **status:** always `DRAFT` on creation.
- **tags** (drive collections and filters):
  - `sport:football|basketball`
  - `league:<slug>`
  - `team:<slug>`
  - `kit:home|away|third|fourth|special|training`
  - `season:2026-27`
  - `audience:adult|kids`
  - `sale` only while discounted
- **metafields** (namespace `sportwear`; definitions are planned in `catalog/metafields.json`):
  - `team`: a metaobject reference (`sw_team`)
  - `leagues`: a list of metaobject references (`sw_league`); a team can play in several
    competitions. Team and league names are translatable into he/en/ar.
  - `season`, `kit`, `audience`
  - `size_chart`: metaobject reference (`sw_size_chart`)
  - `counterpart`: the adult ↔ kids product
  - `complements`: set pieces, such as tank ↔ shorts
  - `source_url`: internal, no storefront access
- **Option:** a single `מידה` (Size) option. Values come from the size system (below).
- **Variants:** one per size.
  - SKU: `SW-{TYPE}-{TEAM}-{KIT}-{SEASON}-{A|K}-{SIZE}`, for example `SW-BJ-MTA-H-2627-A-M`.
    - TYPE codes: FJ (football jersey), BJ (basketball jersey), BS (basketball shorts).
    - KIT codes: H, A, T, F, S, TR.
  - Inventory is tracked, with no overselling (`inventoryPolicy: DENY`).
  - Quantities come from the owner (default 0).
- **Media:**
  - Full-size image URLs from the source, ordered front, back, details. Aim for at least 1200px.
  - Alt text in Hebrew: `{title} – חזית` / `– גב` / `– פרט`.
  - **Only images the business may use**: the supplier's or importer's own product photos. Never
    images from competitor stores or official club shops unless the owner confirms rights.
- **Description (Hebrew):**
  - One or two benefit-led sentences, then bullets: fabric and technology, fit, care.
  - No invented specs.
  - Say "מוצר מקורי" only when the source confirms the item is genuine (the business sources through
    parallel import of originals).
- **SEO:** title up to 60 characters, meta description up to 155 characters, in Hebrew.
- **Collections** (created later, never ad hoc): by sport, league, team, audience, kit, plus "sale"
  and "new".

## Size systems

- **Adults:** `S`, `M`, `L`, `XL`, plus `XXL` only if the supplier lists it.
- **Kids:** `5-6`, `7-8`, `9-10`, `11-12`, `13-14`, for heights 116, 128, 140, 152 and 164 cm.
- Brand labels (for example Nike YXS–YXL, adidas 116–164) are recorded as-is in
  `variants[].source_size_label`, mapped to our kids buckets, and flagged in `questions` when the
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
