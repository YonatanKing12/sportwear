# Supplier: jerseyxie (Yupoo)

A read-only map of the supplier's catalog at https://jerseyxie.x.yupoo.com against our Shopify store,
so the owner can decide what to import next. Nothing here writes to Shopify.

| File | What it is |
| --- | --- |
| `albums.json` | The supplier's full inventory, normalized: one line per product album |
| `wave1.json` | The first import wave recommended to the owner (2026-09-26): current-season home/away/third kits of the Israeli teams, 17 top clubs and 12 national teams, one row per product (161 after merging the supplier's duplicate kids albums: 69 adult, 60 kids, 32 women). Review page: https://claude.ai/code/artifact/3e9da8d7-5548-4440-b5b0-5f02ea7d03f1. The owner approved the adult and kids rows on 2026-09-26 (see Importing a wave) |
| `gap-report.json` | Per album: `have`, `close_variant`, `missing`, `unparsed` or `out_of_scope`, with our matching product handle. The summary at the top groups the missing items |
| `scripts/catalog/yupoo-crawl.mjs` | Crawls the category tree and album listings into a cache (no photos) |
| `scripts/catalog/yupoo-normalize.mjs` | Title parser (Node, no dependencies). Writes `albums.json`, prints the titles it cannot parse. Reusable for the import (`normalizeTitle`, `normalizeAlbum`, `parseSeason`, `expand`) |
| `scripts/catalog/yupoo-gap.mjs` | Compares `albums.json` with an export of our products and writes `gap-report.json` |

## Snapshot of 2026-09-26

- **30,332 albums** crawled, 33 of them shop info (shipping, sizes chart, category covers): **30,299 product
  albums**, but only 15,161 distinct titles, because the supplier often posts the same product 2 to 4 times.
  The report counts albums and "products" (distinct normalized products).
- **In scope: 21,604 albums (10,288 products)**, football 18,953 and basketball 2,651:
  - have: 1,591 albums (744 products). Football 158, basketball 1,433 (518 of them matched on team and
    number only, because the title gives nothing else)
  - close variant: 3,588 (1,116)
  - missing: 16,336 (8,367). Current season (26/27 and 2026 kits): 2,380 (1,491)
  - unparsed: 89
- Out of scope: 8,695 albums (training wear, tracksuits, windbreakers, jackets, football shorts, polos,
  accessories, other sports…). See `summary.out_of_scope_by_type`.
- Our store: 1,099 products exported on 2026-09-26 (the demo product is left out).

## Re-run

```bash
# 1. Crawl (≈ 650 listing pages, 15 min; at least 1.1 s between requests, cached in qa-output/jerseyxie-cache/).
#    Delete the cache folder to crawl fresh. Behind the cloud proxy the script sets NODE_USE_ENV_PROXY itself.
node scripts/catalog/yupoo-crawl.mjs
#    optional: fetch a few album pages to see what they hold
node scripts/catalog/yupoo-crawl.mjs --album-samples 30 --sample-match "^(26-27|2026) " --out qa-output/jerseyxie-cache/samples.json

# 2. Normalize -> catalog/sources/jerseyxie/albums.json (prints the unparsed titles)
node scripts/catalog/yupoo-normalize.mjs

# 3. Export our products, read-only, with the Shopify MCP GraphQL workflow
#    (graphql_schema -> validate_graphql_codeblocks -> graphql_query), 250 per page, and save every page
#    under qa-output/store-export/. A bulkOperationRunQuery JSONL export works too.
#      query StoreProductsExport($after: String) {
#        products(first: 250, after: $after, sortKey: ID) {
#          nodes { id handle title productType vendor status tags createdAt }
#          pageInfo { hasNextPage endCursor }
#        }
#      }

# 4. Compare -> catalog/sources/jerseyxie/gap-report.json
node scripts/catalog/yupoo-gap.mjs --products qa-output/store-export/products.json
```

`--products` accepts a JSON array, GraphQL responses (one or several pages in one file) or JSONL.
Both scripts read `catalog/classification.json`, the canonical team names (pass `--classification <file>`
to use another copy).

## How the crawl works

- The category tree comes from the header menu of the home page: 54 top-level categories and 293
  sub-categories (league → team). `/collections/<id>` uses the same ids as `/categories/<id>`.
- Every category is paged through (120 albums per page), then the `/albums` listing (11 pages). The
  album count of every category matched the site's own "in total N albums".
- Yupoo lists an album in every category that holds it (for example "Daily new arrivals" and
  "Premier League › Chelsea"), so albums are merged by id and keep all their category ids.
  16,085 albums, most of the newest ones, sit only in "Daily new arrivals": for those, the title is
  the only source of the team.
- Skipped as shop info: the 6 "Cheap Soccer Jerseys UK" albums (shipping, how to order, sizes chart…),
  25 category-cover albums ("HOT Soccer Product", "National Team Jerseys"), "Size" and "Customize
  Jerseys". They are listed in `albums.json` → `skipped`.
- 721 pages were fetched (639 category pages, 11 `/albums` pages, the home page, 70 sampled album
  pages), with no failures. The site is served in English (`Accept-Language`).

## albums.json

The header holds `album_url` (`https://jerseyxie.x.yupoo.com/albums/{id}?uid=1`), `cover_base`,
`defaults`, the totals, `teams` (slug → name, league), `leagues`, `categories` (id → name, parent,
albums), `skipped` and `unknown_words` (title words the parser does not know, for extending it).
`expand(entry, header)` in the normalizer rebuilds the full entry.

Per album (a missing field means the default, or unknown):

| Field | Values |
| --- | --- |
| `id`, `title` | as on Yupoo |
| `cover` | cover image, relative to `cover_base` |
| `photos` | photo count shown in the listing. Absent when the listing shows 0, which Yupoo does for about 5,000 recent albums |
| `cats` | every category id holding the album (names in the header) |
| `sport` | `football`, `basketball`, `american-football`, `other` (MLB, NHL, F1, rugby, AFL) |
| `league` | league slug, from the team; else from the category |
| `team` | team slug: the one in `catalog/classification.json` when the team is there, otherwise the kebab-case English name from the `TEAM_TABLE` in the normalizer |
| `season` | `2026-27`, `1995-97`, or a bare year (`2026`: World Cup kits, calendar-year leagues, retro) |
| `kit` | `home`, `away`, `third`, `fourth`, `special`, `training`, `goalkeeper` (football). Priority when a title has several: goalkeeper, training, fourth, third, special, away, home |
| `audience` | `adult` (default), `kids`, `women`, `adult+kids`; `baby: true` for baby sizes |
| `version` | `fan` (default) or `player` |
| `sleeve` | `short` (default), `long`, `none` (vests); absent for basketball tanks |
| `type` | `jersey` (default), `kids-kit` (kids jersey + shorts), `shorts`, `polo`, `jacket`, `tracksuit`, `hoodie`, `other` (with `item`: accessory, socks, t-shirt, vest, training-set, pants, baseball-jersey, fashion). `with_shorts: true` for adult jersey + shorts sets |
| `retro` | the retro season or year (`true` when unknown): labelled retro, in the Retro category, or a season before 2016, as in `catalog/classification.json` |
| `player`, `number`, `edition`, `print`, `colors` | basketball: player last name, shirt number, `city` / `classic` / `75th-anniversary` / `statement` / `icon` / `association` / `earned` / `special`, `embroidered` or `heat-pressed`, colour families. `player` is also set for football tributes (Messi, Ronaldo…) |
| `sizes` | size range when the title states one (`S-XXL`, `S-4XL`, `16-28`…) |
| `brand` | brand teamwear without a club (Adidas training suits, Nike T90) |
| `problems` | why the album is unparsed: `team`, `sport`, or an ambiguous team name |
| `category_team` | the supplier's category names another team than the title (the title wins) |

Leagues are the club's league in 2025-26; lower divisions are grouped per country (`efl`,
`segunda-division`, `serie-b`, `2-bundesliga`, `ligue-2`). The supplier files clubs loosely (Leeds,
Southampton and Sheffield United under "Premier League", Monaco under "National Teams"), so the team
decides the league, not the category.

Supplier quirks the parser handles: obfuscated trademarks (`M-anchester U-nited`, `Barc`, `Real
Ma-drid`, `Li-verpool`), typos (`Monterey`, `Dotmund`, `Portto`), nicknames (`Paris` = PSG, `Spanish`
= Espanyol, `Oasis` = the Manchester City × Oasis collab, `Olympics` = Olympiacos, `Dynamo` = Houston
Dynamo, as filed by the supplier), accents dropped (`Kln`, `So Paulo`).

## gap-report.json

The header has the rules, then `summary`, then one line per album:
`{"id", "status", "handle" (our matching product), "differs", "we_carry_team", "reason", "note"}`.

- **Scope.** In scope: football jerseys (any season, retro, kids, women, goalkeeper, player version,
  long sleeve) and basketball jerseys and shorts. Out of scope, for the owner to decide: other sports,
  NFL (we sell NFL hoodies only), accessories, windbreakers, jackets, polos, tracksuits, hoodies,
  training wear (training jerseys and sets, vests), T-shirts, football shorts, baby sizes, brand
  teamwear without a club.
- **Football.** `have` = same team, season, kit and audience, plus the same version and sleeve.
  `close_variant` = same team and season, but another kit, audience, version or sleeve, or a kit we
  cannot compare (not in the title, or both are special editions). `missing` = no product of that team
  and season (`we_carry_team` lists the seasons we do sell). Seasons compare by start year (2026 =
  26/27); national teams by tournament cycle (25-26, 2026 and 26-27 are all the 2026 kits).
- **Basketball.** `have` = same team, type and number, same edition class (city / retro / regular),
  a compatible year and colour, same audience. Many supplier NBA titles give only team and number
  ("Lakers #23 Embroidery"): those matches carry a `note`. `close_variant` = same team and number but
  another edition, year, colour or audience, or a team album with no number. `missing` = we do not sell
  that team, or not that number.
- **Our titles** are parsed with `catalog/classification.json` (team names), the kit words (בית, חוץ,
  שלישית, רביעית, מהדורה מיוחדת, אימון), `מספר N`, colours, מהדורת עיר and רטרו. They never say fan
  or player version, so they count as fan.

`summary` holds the totals, `close_variant_groups`, `out_of_scope_by_type`, `missing_by_league`
(league → teams, with albums, products and seasons), `missing_current_season` and
`missing_highlights` (Israeli Premier League, national teams, the 2026 national-team kits, retro,
kids, women).

## What an album page holds (for the import)

From 70 sampled album pages and the listings:

- **Photos:** usually 2 per album (front and back); 10% of albums have 6 or more, retro "S-XXL"
  albums have 8. Photos are 800 × 800 px (older albums) or 1080 px on the long side (2025-26 onwards);
  few reach the 1200 px our catalog aims for. Some photo files are WeChat or QQ screenshots, so the
  image rights need checking before any photo is used.
- **No description** (empty, or the title again), **no prices** anywhere, and no size selector.
- **Sizes** appear only in some titles (1,721 albums: `S-XXL` 1,071, `S-4XL` 417, `XS-XXL` 136, kids
  `16-28` 15) and in the "📏Sizes Chart" album (23 photos).

## Limits

- Titles only: the photos were not checked. Special editions, albums without a kit in the title and
  team-level NBA albums need a look at the photos before a decision.
- Ambiguous names are kept for grouping and flagged: "Tel Aviv" (Maccabi or Hapoel?), "Maccabi";
  unknown or obfuscated ones (Aravis, Bula, Hatz, Corvado, Dinamo, Glasgow…) and titles without a team
  are `unparsed`.
- The crawl is a snapshot: the supplier adds albums daily ("Daily new arrivals").

## Importing a wave

The owner approved wave 1 on 2026-09-26: the adult and kids rows of `wave1.json` (129 products, women
left out). Adults get one short-sleeve fan jersey in S–XL at ₪139 (₪120 at import; the owner moved it to
₪139 the same day); kids get the set, jersey and shorts, in the supplier's sizes 16–28 at ₪99
(`catalog/pricing.json`), each with the supplier's size chart (`catalog/size-charts/jerseyxie.json`,
metaobjects in `catalog/store-setup.json`). 5 units per size.

1. **Photos.** `python3 scripts/catalog/jerseyxie-photos.py fetch <ids.json> <work>` downloads every
   album of each row, and `sheet` draws one labeled contact sheet per row. Pick the album and the front
   and back photos by looking at the sheet, never by the title: the titles are often wrong (below).
   Write `<work>/picks.json`: `[{"id", "album", "front": "<album>/<NN.ext>", "back": … | null}]`.
2. **Studio photos.** `refs`, then `scripts/images/studio.py <work>/studio-products.json <work>/studio`
   (key from `OPENAI_API_KEY`), `scripts/images/normalize.py <work>/studio/raw <work>/studio/norm`, then
   `qa` draws supplier | studio pairs. Re-render a photo that lost a detail with `note_front` /
   `note_back` in the pick, or drop it (design/imagery/README.md).
3. **Product files.** `jerseyxie-photos.py build` writes `<work>/picks-build.json`, then
   `python3 scripts/catalog/jerseyxie-build.py <work>/picks-build.json` writes `catalog/ready/<handle>.json`:
   titles, factual descriptions and SEO in he/en/ar, variants and SKUs, tags (through `classify.mjs`),
   the size chart. Link adult/kids pairs with `relations.counterpart_handle`, then
   `node scripts/catalog/validate.mjs catalog/ready/*.json`.
4. **Images to Shopify.** `stagedUploadsCreate` (IMAGE, image/png, PUT) for every PNG, PUT the files,
   and put each `resourceUrl` in the file's `images[].url` (keep `studio_file`).
5. **Drafts.** The `product-publisher` agent creates the products as DRAFT, sets the metafields and
   counterparts, and moves the files to `catalog/published/`; then `catalog-translator` registers the
   en/ar translations from the files.

Wave 1 (2026-09-26): 128 drafts (20 pilot + 108), reviewed by the owner on the page https://claude.ai/code/artifact/0e56a640-3b84-42af-bf9d-6abd4d4677af, whose store document `review/drafts` lists the handles marked for fixing (none were marked). The owner then told us to activate them ("אתה יכול להפעיל לבד"), and all 128 went ACTIVE and onto the Online Store the same day. Later waves stay drafts until the owner says so in the conversation.

Handles: `{team}-{kit}-jersey-{season}` and `{team}-{kit}-kit-{season}-kids`, season `2026-27` for clubs
and `2026` for national teams.

Supplier traps seen in wave 1 (check every product's photos):

- Albums titled "Inter Milan" that show Inter Miami kits; "Paris" albums with Paris FC instead of PSG.
- Baby onesies in adult albums (Barcelona, Spain), kids sets in adult albums (Manchester United).
- Long-sleeve versions under short-sleeve titles (Argentina kids), and angled or partial photos.
- The same kids product posted several times (merged in `wave1.json`).

## Wave 2 (2026-09-27)

The owner gave full approval to bring in more products at the same prices ("יש לך אישור מלא ואותו מחיר עד
היום") and confirmed this wave in the conversation: `wave2.json`, 244 rows of 26/27 kits of 60 clubs, adults
₪139 and kids sets ₪99, ACTIVE and on the Online Store after our own check.

- **Result:** 229 products, 137 adult jerseys and 92 kids sets. The log `catalog/published/wave2-2026-09-27.json`
  lists every product and the 15 rows left out, each with its reason. The albums showed another season's kit, a
  leaked or pre-release design, a kids set in an adult album, or two designs under one name.
- **Store:** each product was created as DRAFT with its own `productSet` call, by parallel agents in seven
  groups, because the connector refuses `bulkOperationRunMutation`. Every product was read back, then set ACTIVE
  (`bulk-update-product-status`) and published (`publicationUpdate`), 50 per call. Stage at most 40 images per
  `stagedUploadsCreate` call: a bigger result is too large to come back inline.
- **Around the products:**
  - English and Arabic are registered for every product.
  - Adult and kids versions are linked, also to older store shirts of the same kit
    (`catalog/published/counterparts-2026-09-27.json`).
  - 59 new team collections, each linked in the menu under its league.
  - New filter names.
  - The "other leagues" collection now also takes the Dutch, Scottish, Turkish and Argentine leagues
    (`catalog/store-setup.json`).
- **Taxonomy:** 52 clubs and 4 leagues were added (`taxonomy.json`, `classification.json`). SKU team codes are
  three capital letters (Leverkusen is `LEV`).

Supplier traps seen in wave 2:

- Albums filed under one kit that show another: Espanyol third kids shows the away kit, Sevilla away kids the home
  kit, Stuttgart away kids another shirt.
- Other seasons and unreleased designs under 26/27 titles:
  - Brentford third is the 2025/26 kit; the HSV away albums show an older shirt.
  - Leverkusen third is a leaked design; Lyon away adult is a pre-release one.
  - Burnley home comes in pink instead of claret.
- Kids sets often carry another front sponsor than the adult shirt, or none, so check a kids product against its
  own album.
- The studio renderer sometimes invents or misspells sponsor text or moves the stripes on shorts. Compare every
  studio photo with the supplier's and re-render with `note_front` / `note_back`.
- Shopify merges tags that differ only by accents into one handle ("besiktas" / "beşiktaş"), so keep one spelling.
