# Supplier: xingkong-sports (Yupoo)

NBA shorts, fan version, from the supplier's category "球迷版球裤 NBA Swingman Shorts":
https://xingkong-sports.x.yupoo.com/categories/3569857. The ten shorts the owner imported before
(handles `sw-shorts-<album>`, 2026-09-26) came from here. On 2026-09-27 the owner asked to bring in the
rest of the category ("אתה יכול לשאוב מפה את כולם"), at ₪119 like the ten before (`catalog/pricing.json`),
and to activate them after our own check.

| File | What it is |
| --- | --- |
| `shorts.json` | The category's 117 albums: 10 already in the store (`have`), 106 new, 1 size chart. Team, season year, edition and colour words are read from the supplier's Chinese titles and are only hints: the photos decide |
| `../../size-charts/xingkong-sports.json` | The supplier's size chart for these shorts (S-XL), the metaobject `xingkong-nba-shorts-fan` |
| `scripts/catalog/xingkong-shorts.py` | `albums` (parse the category page into `shorts.json`), `fetch` (every photo of each album), `sheet` (contact sheets), `refs` (studio inputs), `details` (close-up crops), `qa` (supplier photo next to the studio photo) |
| `scripts/catalog/xingkong-build.py` | The photo review → `catalog/ready/sw-shorts-<album>.json` (texts in he/en/ar, variants, tags, size chart, set pieces) |
| `scripts/catalog/productset-input.py` | Product files → `productSet` inputs (DRAFT, metafields, photos) |

## How the import runs

1. `albums` on the saved category page, then `fetch` and `sheet` for the new albums (photos are large:
   shrink them to 2400 px after the download). Downloads go to a `.part` file first, so a stopped run
   never leaves a cut photo.
2. **Review from the photos**, team by team: usable or not (one design of adult shorts), team, colour,
   City Edition or retro, the best front and back photos, up to two close-ups, a one-line design
   description, and the store's jerseys of the same design (the jersey sheets are labeled J1, J2… per
   team). A pair needs the same colours, trim and wordmark on the photos, never team and colour words
   alone (catalog skill, `complements`).
3. **Studio photos** as for every product (`design/imagery/README.md`): `refs`, `scripts/images/studio.py`,
   `scripts/images/normalize.py`, `qa`, and a look at every pair before upload.
4. **Product files** with `xingkong-build.py`: title `מכנסי כדורסל {team} {colour} [מהדורת עיר|רטרו] [year]`
   as for the ten shorts before (the year is the supplier's season label, 25赛季 → 2025), factual texts
   (team, colour, edition, fan version, sizes S-XL, the size chart), 5 units per size, tags from
   `classify.mjs` plus `source:xingkong-sports`, `album:<id>`, `import:2026-09-27`, `new`, and
   `set:shorts` for shorts with a matching jersey.
5. **Shopify:** staged uploads for the photos, `productSet` as DRAFT, a check of every product, then
   ACTIVE and the Online Store (the owner's instruction for this import), English and Arabic
   translations, and the set pieces on the jerseys (`complements` plus the tag `set:jersey`).

**Status (2026-09-27, in progress):** the photos of the 106 new albums are downloaded and under review. In
Shopify so far: the size chart, also attached to the ten shorts from before. When the products are created,
their log goes to `catalog/published/shorts-xingkong-2026-09-27.json`.
