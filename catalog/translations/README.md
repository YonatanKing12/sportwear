# Store content translations

`store-content.json` holds the translations of the store's non-product content:

- the 205 smart collections (on 2026-09-26: 101 added by the categories work, for clubs, NBA teams, players, styles and
  hoodies; then `kids-football` and the 25 team collections of wave 1; on 2026-09-27 the 59 team collections of wave 2),
  plus the manual `our-picks`
- the 3 menus (`main-menu`, `footer`, `footer-shop`) with every menu item, plus the 15 hidden child lists that Shopify keeps behind the main-menu items that have children
- 4 pages
- the 10 league metaobjects (`sw_league`), `name` field only

Product translations live in the product files (`catalog/published/*.json`), not here. The 1,098 products
imported before (tag `source:yupoo`) have no product files: their English and Arabic titles are in
`older-products.json`, made by `scripts/catalog/translate-titles.py` and registered on 2026-09-27 (title and
description in en and ar, 4,392 translations, read back with a bulk export: all match, none outdated). The demo
product is the only product without translations.

Each translated field has four keys:

- `he`: the Hebrew source, exactly as it is in Shopify
- `en` and `ar`: the translations
- `digest`: the SHA-256 of `he`, which `translationsRegister` requires

## Status

| Locale | Status |
| --- | --- |
| `ar` | Registered in Shopify on 2026-09-26: 282 resources, 391 fields |
| `en` | Registered in Shopify on 2026-09-26, after Hebrew became the primary language: 282 resources, 391 fields |

The categories work (2026-09-26 afternoon) added 214 resources and 315 fields: the new collections, 104 menu items and
9 hidden child lists. They were read back with a bulk export of `translatableResources`: every value matches and none
is outdated.

The shipping change (2026-09-26 evening: free shipping on every order, up to 10 business days) rewrote the description
of 104 collections ("משלוח חינם עד הבית, עד 10 ימי עסקים.") and of `kids`. Their `en` and `ar` were registered again
with the new digests and read back: none is outdated.

Wave 1 (2026-09-26 evening) added 55 resources and 80 fields: 25 team collections (12 clubs and 13 national teams; IDs in
`store-setup.json`), 26 main-menu items (the teams under their leagues, national teams by their short country name, and
`kids-football` first under ילדים) and the 4 hidden child lists that Shopify created behind בונדסליגה, ליגות נוספות,
נבחרות and ליגת העל. Read back: every value matches this file, none is outdated, and the 119 existing main-menu items
kept their IDs and translations.

Wave 2 (2026-09-27 afternoon) added 118 resources and 177 fields: 59 team collections (the clubs of the jerseyxie wave 2,
every one except `porto`, which already had a collection; IDs in `store-setup.json`) and 59 main-menu items, the team
names under their leagues. Shopify created no hidden child list this time, because all seven leagues already had
children. Read back: every value matches this file, none is outdated, and the 145 existing main-menu items kept their
IDs and translations.

What is not translated:

- URL handles, which stay the same in every language.
- The `shipping-returns` and `accessibility` pages. They are legal drafts waiting for the lawyer (see `skipped`).
- SEO fields. No resource has them set yet.
- Shopify's own customer-account menu ("Customer account main menu", with Orders and Profile).
- The `slug` and `sport` fields of the league metaobjects. They are identifiers the theme relies on.
- The demo teams (`sw_team`). They are demo-only and get deleted before launch.

## Registering English after Hebrew becomes the primary language

1. **Owner, in the admin:** Settings → Languages → change the default language to Hebrew. Make sure English is still
   listed as an additional language.
2. **Check the locales:** `shopLocales { locale primary published }` must show `he` as primary and `en` as not primary.
3. **Check that Arabic survived the switch:** read `translations(locale: "ar") { key value outdated }` on a few
   resources. If anything is missing, register it again from the `ar` column, the same way as step 5.
4. **Re-read the digests** with `translatableResourcesByIds` (`translatableContent { key value digest locale }`). The
   content locale should now be `he`. If a digest differs from the JSON, the Hebrew changed: update `he`, review `en` and
   `ar`, and use the new digest.
5. **Register:** call `translationsRegister(resourceId, translations)` once per resource, with
   `{ locale: "en", key, value: <en>, translatableContentDigest: <digest> }` for each field. Batch several resources in
   one request with GraphQL aliases. Follow the Shopify MCP workflow: `graphql_schema`, then
   `validate_graphql_codeblocks`, then execute.
6. **Verify:** there are no `userErrors`, and `translations(locale: "en")` returns every field with `outdated: false`.
7. **Check the web presence:** `shopLocales { locale published marketWebPresences { id alternateLocales { locale } } }`.
   Every language must be published and attached to the main domain's web presence, or shoppers can't reach it. After
   the switch on 2026-09-26, English came back unpublished and Arabic had no web presence; both were fixed with
   `shopLocaleUpdate(locale, shopLocale: { published: true, marketWebPresenceIds: [<the main web presence>] })`.

List everything to register:

```bash
jq -c '.. | objects | select(has("resource_id") and has("fields")) | {resource_id, fields: (.fields | map_values({en, digest}))}' catalog/translations/store-content.json
```

## When the Hebrew changes

Editing a title or description in the admin changes its digest, and Shopify marks the existing translations as
outdated. Update `he`, `en`, `ar` and `digest` here, then register again.
