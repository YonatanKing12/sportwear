# Store content translations

`store-content.json` holds the translations of the store's non-product content:

- the 120 collections (101 added on 2026-09-26 by the categories work: clubs, NBA teams, players, styles, hoodies)
- the 3 menus (`main-menu`, `footer`, `footer-shop`) with every menu item, plus the 11 hidden child lists that Shopify keeps behind the main-menu items that have children
- 4 pages
- the 10 league metaobjects (`sw_league`), `name` field only

Product translations live in the product files, not here.

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
