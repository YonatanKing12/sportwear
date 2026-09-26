# Local preview harness

Renders the theme's Liquid locally (LiquidJS + a mock catalog) so pages can be screenshotted and
scanned with axe **without the password-protected storefront**. It is a QA smoke test for layout,
RTL and CSS bugs, not a Shopify clone. Anything it cannot emulate is **loud**, never silent:

- a yellow bar at the end of `<body>` lists every gap on that page (it never overlaps the theme),
- each gap is logged with `console.warn('[preview-gap] …')`,
- `render-report.json` (render) and `report.json` (screenshots) list them all,
- like Shopify, runtime errors print inline as `Liquid error (sections/x.liquid line 12): …`, and a
  missing translation prints `[missing: key]` where the text should be.

## Run

```bash
npm run preview:render     # HTML → qa-output/preview/<locale>/<page>.html
npm run preview:shots      # PNGs + axe → qa-output/preview-shots/<viewport>/<locale>-<page>.png, report.json
npm run preview            # both
npm run preview:serve      # live server: http://127.0.0.1:4173/index.html (page list) or http://127.0.0.1:4173/
                           # (theme files are re-read on every page load: edit, then refresh)
npm run preview:selftest   # checks the harness itself (smoke theme + this repo's layout/snippets)
```

`SW_PREVIEW_EMPTY_STORE=1` (before either command) renders the store with no products at all, the way
the real theme preview looks before products reach the Online Store channel. Product pages don't exist
in that mode, so pass `--pages` without them, e.g.
`SW_PREVIEW_EMPTY_STORE=1 node scripts/preview/render.mjs --out qa-output/preview-empty --pages index,collection,search`.

`SW_PREVIEW_DESIGN_MODE=1` sets `request.design_mode` to true, so pages render the way the theme editor
shows them (for example the header menu keeps links to empty collections that the storefront hides).
Nothing else about the editor is emulated.

`render.mjs` options: `--theme <dir>` (default: repo root), `--out <dir>`, `--locales he,en,ar`,
`--pages index,product,…`, `--money-format "₪{{amount}}"`, `--no-editor-attributes`, `--quiet`.
`serve-and-shoot.mjs` options: `--out`, `--shots`, `--pages`, `--locales`, `--viewports mobile,desktop`,
`--drawer-page index`, `--no-axe`, `--strict` (exit 1 on page/console errors or serious axe issues),
`--serve [--port 4173]`. Pass options after `--`: `npm run preview:render -- --pages product`.

### Pages

| Id | Renders |
| --- | --- |
| `index` | `templates/index.json` |
| `product`, `product-sale`, `product-kids`, `product-set` | home jersey (kids counterpart, "new"); away jersey (compare-at, XL sold out); kids jersey; basketball jersey ("complete the set") |
| `product-chart`, `product-kids-set` | preview-only products with the supplier jerseyxie's size charts: adult away jersey (S–XL, L sold out); kids away kit, jersey and shorts (sizes 16–28 with ages, 26 sold out, ₪99) |
| `collection`, `collection-empty` | football (7 products); serie-a (empty) |
| `list-collections`, `search` (q=דמו), `search-empty`, `cart` (2 lines), `cart-empty`, `page` (shipping and returns), `404` | the matching templates |
| `blog`, `article`, `password`, `gift_card` | when those templates exist |
| `page.contact` etc. | alternate templates: every `templates/{page,product,collection,…}.<suffix>.json` is added automatically |
| `product:<handle>`, `collection:<handle>`, `page:<handle>`, `article:<handle>`, `search:<terms>` | any mock resource |

Any id can take a query: `collection:football?sort_by=price-ascending&page=2`,
`collection:football?filter.v.availability=1`, `product?variant=<id>`.

The screenshot run also opens the **cart drawer** (both viewports) and the **menu drawer** (mobile)
on the `index` page by clicking `[data-drawer-open="CartDrawer"|"MenuDrawer"]` like a user; if the
trigger is missing or not clickable it says so and opens the drawer from script. Per page the report
has: console errors and warnings, page errors, failed or 4xx/5xx requests, blocked external requests
(anything not served locally is blocked), harness gaps, horizontal overflow (with the innermost
elements that stick out), `<h1>` count, broken images, inline Liquid errors, missing translations and
axe violations (WCAG 2.0/2.1/2.2 A+AA).

## What is emulated

- **Templates**: JSON templates (order, `disabled`, `wrapper`, `custom_css`, `layout`), Liquid
  templates with `{% layout %}`, section groups (`{% sections 'header-group' %}`), static sections
  (`{% section 'x' %}` with `settings_data` or schema `default`), Shopify-style ids
  (`template--<n>__main`, `sections--<n>__header`) and wrappers (schema `tag` and `class`).
- **section / block objects**: id, settings (schema defaults + JSON; resource settings resolved:
  collection, product, page, blog, article, link_list, collection_list, product_list, url
  `shopify://…`, image_picker, color, color_scheme, video_url, metaobject and metaobject_list (by
  handle, `type/handle`, `shopify://metaobjects/type/handle` or GID, against the mock metaobjects);
  dynamic sources `{{ closest.product }}`),
  blocks, block_order, index, index0, location, `shopify_attributes`.
- **Theme blocks**: `{% content_for 'blocks' %}` (nested, `closest.*` passing), static blocks
  `{% content_for 'block', type:, id:, … %}` with extra arguments, block schema `tag`/`class`
  (`"tag": null` = no wrapper). App blocks are skipped (reported).
- **Tags**: `schema`, `doc`, `stylesheet` and `javascript` (bundled per page like Shopify: only files
  rendered on the page, linked from `content_for_header`), `style`, `form` (all Shopify form types,
  hidden inputs, `id:`/`class:`/`data-*` attributes, `form` object), `paginate` (+ `paginate` object and
  parts), `render` (with/for/as, isolated scope, `section`/`block`/`product` visible), `include`,
  `layout`, `forloop.parentloop`, and everything LiquidJS has (`liquid`, `capture`, `increment`, …).
- **Globals**: settings, request, routes (locale prefix `/en`, `/ar`), localization, shop, linklists
  (main-menu, footer, footer-shop), collections, all_products, pages, blogs, articles, images,
  metaobjects, cart, customer (nil), recommendations, predictive_search, template, page_title,
  page_description, page_image, canonical_url, handle, current_page, current_tags,
  content_for_header (Shopify object, hreflang, preloads, compiled CSS/JS), powered_by_link, …
- **Filters**: `t` (default-locale fallback, CLDR plurals via `Intl.PluralRules`, only `_html` keys
  unescaped), asset/image/url filters, `image_tag` (srcset, sizes, width/height, preload), `money*`,
  `json`, colour filters, `date`/`time_tag` (with `date_formats` from the locale files),
  `structured_data`, `payment_type_svg_tag`, `default` (keeps objects), `divided_by` (integer
  division), and more: see `lib/filters.mjs`.
- **Catalog** (`lib/catalog.mjs`): the 8 demo products created in the store (prices in agorot,
  sizes, sold-out XL, compare-at, tags incl. he/en/ar search keywords such as "גופייה", "jersey",
  "قميص", `sportwear.*` metafields with `.value`, team/league/size-chart metaobjects, counterpart and
  complements), plus 2 preview-only products carrying the supplier jerseyxie's size charts (their
  rows are read from `catalog/size-charts/jerseyxie.json`, in the store's `{ "rows": [...] }` shape;
  the demo charts are bare arrays), the store's collections plus team and player collections (NBA, EuroLeague, players,
  Premier League and LaLiga clubs; they borrow the demo products of their sport, Toronto is empty)
  with filters and sort options, the six store pages, a blog, the three menus (the main menu has three
  levels: basketball > NBA > 13 teams, basketball > players > 10 players, football > leagues > clubs),
  a two-line cart. Hebrew is primary (no URL prefix); English and Arabic have translated titles, as
  the catalog translator will publish them.
- **Server** (`lib/server.mjs`): static files, plus the endpoints theme JavaScript calls: Section
  Rendering API (`?section_id=`, `?sections=` on any page URL, static pages included), Cart AJAX API
  (`/cart.js`, `/cart/add|change|update|clear(.js)`, with `sections`), `/products/<handle>.js`,
  `/search/suggest`, `/recommendations/products`, POST `/localization`, and storefront URLs
  (`/`, `/en/products/…`) rendered on demand.

## Known gaps (differences from Shopify)

- **Money format**: the store's real format is used: `{{amount}} NIS` (read from the Admin API on
  2026-09-26), so prices show as `120 NIS`, which reads "NIS 120" in RTL. The theme was written for
  `₪`. Try `--money-format "₪{{amount}}"` to see that version.
- Images are not resized: `image_url` returns `/files/<name>?…&width=…` and the browser gets the
  1200×1500 original. URLs are root-relative, not protocol-relative CDN URLs, so
  `https:{{ image | image_url }}` becomes `https:/files/…` (meta tags only).
- `image_picker` values resolve by file name against `fixtures/images/`; anything else becomes a
  striped "image not available" marker image (and a gap). Drop a file with the same name there to use it.
- Not emulated (reported when used): `video`, `font_picker`, `liquid` settings, app
  blocks, `font_*`, `media_tag` for video/3D, `shopify_asset_url`, customer accounts, the `app` and
  `checkout` objects, the theme editor (`request.design_mode` is false unless `SW_PREVIEW_DESIGN_MODE=1`, but
  `block.shopify_attributes` is filled, which the live storefront leaves empty; `--no-editor-attributes`
  turns it off).
- Storefront filters: availability, price, size and product type only; option filter param names use
  the (translated) option name. Search is a substring match on titles and tags.
- `/search/suggest` (predictive search) honours `resources[type]`, `resources[limit]`,
  `resources[limit_scope]`, `resources[options][fields]` (incl. `tag`) and
  `resources[options][unavailable_products]`; every word must appear in a searched field. Query
  suggestions are made from the matching product titles. No typo tolerance or synonyms.
- Shopify's own strings (sort names, filter labels, page titles such as "Your Shopping Cart") are
  approximations in he/en/ar. Named `date` formats missing from the locale files use English patterns.
- `json` output escapes `/`, `<`, `>`, `&` (as Shopify does); drops without a Shopify JSON shape
  serialise their visible properties.
- Only Israel is in `localization.available_countries`. Whitespace can differ slightly from Shopify.

## Files

```
render.mjs               CLI: render pages to static HTML
serve-and-shoot.mjs      CLI: server + Playwright screenshots, drawers, axe → report.json
selftest.mjs             harness self-test
lib/preview.mjs          page specs, template/section/block rendering, content_for_header, gap bar
lib/engine.mjs           LiquidJS set-up: preprocessing, inline Liquid errors
lib/tags.mjs             Shopify tags        lib/filters.mjs   Shopify filters
lib/world.mjs            Shopify objects     lib/catalog.mjs   mock data
lib/drops.mjs            drop base classes   lib/i18n.mjs      the t filter
lib/server.mjs           static + dynamic HTTP server
fixtures/images/         demo product art (our own originals, 1200×1500)
fixtures/theme-smoke/    small theme that exercises every feature (used by selftest.mjs)
```
