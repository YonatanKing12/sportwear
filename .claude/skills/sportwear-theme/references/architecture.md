# SportWear theme: architecture contract

Every builder follows this contract so that parts written in parallel fit together without edits.
Read it fully before writing code. It complements `../SKILL.md` (project rules), Shopify's
`shopify-liquid-themes`, `liquid-theme-standards` and `liquid-theme-a11y` skills.

## 1. Ground rules

- **Build from scratch.** Never copy code from Horizon, Dawn or any other theme.
- **Own only your files** (section 3). If you need a change in a foundation file (layout, config,
  `assets/base.css`, `assets/core.js`, core snippets, core i18n parts), do not edit it. Describe the
  exact change in your final report and work around it in your own files meanwhile.
- **Every visible string goes through `t`**, with keys in your own i18n part files (section 7).
- **Logical CSS only**: `margin-inline-*`, `padding-inline-*`, `inset-inline-*`, `text-align: start|end`,
  `border-start-start-radius`… Never `left`/`right`/`margin-left` and the like.
- **RTL first.** Hebrew is the default language; Arabic is RTL too; English is LTR. Check that
  directional things (chevrons, arrows, drawers, sliders, progress bars) follow `dir`.
- **No hand-built cart or product HTML in JavaScript.** Re-render with the Section Rendering API.
- **No external libraries.** Native web components, `<dialog>`, `<details>`, CSS scroll-snap.
- **Mobile first.** Breakpoints: `750px` (tablet) and `990px` (desktop), always `min-width`.
- **Accessibility is part of done**: WCAG 2.2 AA, 44px targets, visible focus, labels, landmarks,
  one `<h1>` per page (owned by the main section of each template).

## 2. How to work (you are in your own git worktree)

1. `npm install --include=dev --no-audit --no-fund && npm install --include=dev --no-audit --no-fund --prefix .claude/skills/shopify`
   (NODE_ENV=production in this environment, so `--include=dev` is required).
2. Build your files. After adding translation keys run `npm run i18n` (regenerates `locales/*`).
3. Gate before you finish; all must pass:
   - `npm run theme:validate -- <your .liquid files>`: Shopify's official validator, no errors
   - `npm run theme:check`: no errors in your files (warnings about other areas' missing files are fine)
   - `npm run i18n:check`
   - `npx prettier --write <your files>` (only your files; never format the whole repo)
4. Commit in your worktree: `git add <your files, your i18n parts, locales/*> && git commit -m "…"`.
   Do not push, rebase, or touch other branches. Locale files are generated: conflicts there are
   resolved by re-running `npm run i18n` after merging.
5. You cannot preview the storefront (the store is locked and there is no local Shopify renderer).
   Be rigorous: read Shopify docs for every object/filter you are unsure of
   (`node .claude/skills/shopify/scripts/search_docs.mjs "<query>" --api liquid`), and rely on the validator.

## 3. File ownership

| Area | Files you own |
| --- | --- |
| **header** | `sections/announcement-bar.liquid`, `sections/header.liquid`, `sections/predictive-search.liquid`, `sections/header-group.json`, `snippets/header-*.liquid`, `snippets/menu-drawer.liquid`, `assets/header.js`, `assets/predictive-search.js`, `i18n/header.*` |
| **product** | `sections/main-product.liquid`, `sections/product-recommendations.liquid`, `snippets/product-*.liquid` (not `product-card`), `snippets/variant-picker.liquid`, `snippets/size-chart.liquid`, `assets/product-*.js`, `templates/product.json`, `i18n/product.*` |
| **collection** | `sections/main-collection.liquid`, `sections/main-search.liquid`, `sections/main-list-collections.liquid`, `snippets/facets*.liquid`, `snippets/pagination.liquid`, `snippets/sort-by.liquid`, `assets/facets.js`, `templates/collection.json`, `templates/search.json`, `templates/list-collections.json`, `i18n/collection.*` |
| **cart** | `sections/cart-drawer.liquid` (replace the stub), `sections/main-cart.liquid`, `snippets/cart-*.liquid` (not `cart-bubble`), `snippets/free-shipping-bar.liquid`, `assets/cart.js`, `templates/cart.json`, `i18n/cart.*` |
| **home** | `sections/hero.liquid`, `sections/collection-links.liquid`, `sections/featured-collection.liquid`, `sections/promo-banner.liquid`, `sections/image-with-text.liquid`, `sections/trust-strip.liquid`, `sections/cta-band.liquid`, `sections/rich-text.liquid`, `snippets/home-*.liquid`, `assets/home-*.js`, `templates/index.json`, `i18n/home.*` |
| **content** | `sections/footer.liquid`, `sections/footer-group.json`, `sections/main-page.liquid`, `sections/contact-form.liquid`, `sections/team-orders.liquid`, `sections/faq.liquid`, `sections/size-guide.liquid`, `sections/business-details.liquid`, `sections/main-404.liquid`, `sections/main-blog.liquid`, `sections/main-article.liquid`, `sections/main-password.liquid`, `snippets/content-*.liquid`, `assets/content-*.js`, `templates/page*.json`, `templates/404.json`, `templates/blog.json`, `templates/article.json`, `templates/password.json`, `templates/gift_card.liquid`, `i18n/content.*` |
| **foundation** (read-only for builders) | `layout/*`, `config/*`, `assets/base.css`, `assets/core.js`, `assets/font-*.woff2`, `snippets/{icon,image,price,product-card,logo,cart-bubble,localization-switcher,social-icons,meta-tags,fonts,css-variables}.liquid`, `sections/cart-bubble.liquid`, `i18n/core.*`, `scripts/*` |

## 4. Foundation you can use

### Layout (layout/theme.liquid)
`<html lang dir>` from `request.locale`; head loads fonts, `css-variables`, `assets/base.css`, the
import map (`@theme/core` → `assets/core.js`) and `window.theme` (routes, strings, cartType,
designMode). Body: `{% sections 'header-group' %}`, `<main id="MainContent">`, `{% sections 'footer-group' %}`,
`{% section 'cart-drawer' %}`, and a polite live region `#SwLiveRegion` (use `announce()`).

### Color schemes
Apply with a class on your section's root: `class="color-{{ section.settings.color_scheme.id }}"`.
Scheme ids: `scheme-day` (white, shopping surfaces), `scheme-night` (#0D0E11 brand shell),
`scheme-accent` (lime promos), `scheme-soft` (light grey band). Each sets:
`--color-background, --color-surface, --color-border, --color-text, --color-muted, --color-highlight,
--color-on-highlight, --color-button, --color-button-label, --color-secondary-button-label, --color-sale`.
Global: `--color-accent`, `--color-on-accent`, `--color-tile` (#F1F2F4, product images, all schemes),
`--color-badge-sale`, `--color-overlay`, `--color-success`, `--color-error`.
**Accent is a fill or text-on-dark only; never accent text on a light background.**

### Tokens and classes (assets/base.css)
- Type: `--font-display` (Anton / Karantina / Changa per script), `--font-body` (Heebo / Noto Sans Arabic);
  sizes `--text-xs … --text-2xl`, `--display-s|m|l|xl`. Classes `.display-xl|l|m|s` (display font,
  uppercase for English automatically, Arabic line-height fixed), `.title-l|m|s`, `.eyebrow`, `.text-muted`.
- Spacing `--space-1 … --space-16` (4px grid), `--gutter`, `--grid-gap`; radii `--radius-card`,
  `--radius-button`, `--radius-badge`, `--radius-chip`; `--touch-target` (44px), `--control-height` (52px);
  `--z-header|overlay|drawer|toast`; `--duration-fast|--duration`, `--ease`.
- Layout: `.page-width` (container with gutters), `.section` (vertical padding from `--section-pt/--section-pb`),
  `.section-header` (heading + link row), `.grid` (set `--grid-cols`, `--grid-cols-tablet`, `--grid-cols-desktop`),
  `.scroller` (horizontal scroll-snap row).
- Components: `.button` + `.button--primary|secondary|full|small|large|icon`, `.link`, `.link-arrow`,
  `.chip` (+ `.chip--active` / `aria-current` / `aria-pressed`), `.badge` + `--new|--sale|--sold-out|--highlight`,
  `.field`, `.field__label`, `.field__input|select|textarea`, `.field__message(--error)`, `.form-status(--success|--error)`,
  `.price` (+ `.price--sale`, `.price__current`, `.price__compare`), `.media-tile` (light tile, `--media-ratio`, `--media-fit`),
  `.drawer` (+ `.drawer--start`, `.drawer__header|body|footer`), `.modal`, `.rte`, `.table-scroll`,
  `.visually-hidden`, `.icon`, `.spinner`, `.js-only`, `.no-js-only`.

### Snippets
| Snippet | Params |
| --- | --- |
| `icon` | `name` (menu, close, search, bag, user, truck, shield-check, return, lock, chevron-forward, chevron-back, chevron-down, chevron-up, arrow-forward, arrow-back, plus, minus, check, globe, ruler, filter, sort, trash, chat, mail, phone, map-pin, info, alert, shirt, tag, users, external, zoom, instagram, tiktok, facebook, whatsapp, youtube, x), `size`, `class`. Directional icons mirror in RTL. Always `aria-hidden`; label the control. |
| `image` | `image`, `sizes` (always pass a real value), `widths`, `loading`, `fetchpriority`, `preload`, `alt` ('' = decorative), `class`, `placeholder` |
| `price` | `product` or `variant`, `class` |
| `product-card` | `product`, `sizes`, `loading`, `heading_tag`, `class` |
| `logo` | `link` (default true), `class`, `loading` |
| `cart-bubble` | render inside `<span data-cart-bubble>` in the header cart link (the link needs `position: relative`) |
| `localization-switcher` | `id`, `style` ('inline' or 'compact') |
| `social-icons` | `class` |

### JavaScript (assets/core.js, import map `@theme/core`)
```js
import {
  EVENTS, CART_BUBBLE_SECTION, config, publish, subscribe, debounce,
  fetchSections, fetchSection, parseHTML, replaceContent, announce, prefersReducedMotion,
  CartAPI, openDrawer, closeDrawer,
} from '@theme/core';
```
- `CartAPI.add(formData, { sections: ['cart-drawer'], source: 'product-form' })`,
  `CartAPI.change({ line, quantity }, { sections, source })`, `CartAPI.update({ updates, note }, { sections, source })`,
  `CartAPI.get()`. Each mutation returns `{ cart, sections }`, also renders the `cart-bubble` section, and
  publishes `EVENTS.cartUpdated` `{ cart, sections, source }` (or `EVENTS.cartError` `{ message, source }`).
  The header count updates itself.
- `<sw-drawer id="X"><dialog class="drawer" aria-labelledby="…">…</dialog></sw-drawer>`: open with any
  `<button type="button" data-drawer-open="X" aria-haspopup="dialog" aria-expanded="false">`, close with
  `[data-drawer-close]`, Escape or a backdrop click; focus returns to the opener. From code: `openDrawer('X', opener)`.
- Component scripts are ES modules in `assets/<name>.js`, loaded by the section that needs them:
  `<script type="module" src="{{ '<name>.js' | asset_url }}"></script>`. Custom element names start
  with `sw-`. Guard with `if (!customElements.get('sw-x')) customElements.define(...)`.
- Theme editor: `window.theme.designMode`; handle `shopify:section:load`, `shopify:section:select`,
  `shopify:block:select` where a component hides content (drawers, accordions, sliders).

### Cross-area contracts
- **Add to cart** (product form, quick add): `CartAPI.add(formData, { sections: ['cart-drawer'], source })`. If
  `window.theme.cartType === 'page'`, then navigate to `window.theme.routes.cart_url` after success.
- **Cart drawer** (cart area) subscribes to `EVENTS.cartUpdated`, replaces its content from
  `sections['cart-drawer']` when present, and opens itself when `source` is `'product-form'` or `'quick-add'`.
  Its `sw-drawer` id is **`CartDrawer`**. The header cart link opens it with `data-drawer-open="CartDrawer"` (drawer
  mode) and is a normal link to `routes.cart_url` otherwise; it must work without JS (link to the cart page).
- **Header cart link** contains `<span data-cart-bubble>{% render 'cart-bubble' %}</span>`.
- **Menu drawer** id `MenuDrawer`, **filters drawer** id `FacetsDrawer`, **size chart** id `SizeChart`.
  Keep ids unique per page. There is no search dialog: the header's search field (`#HeaderSearchInput`,
  `snippets/header-search`) is the only header search; to send a visitor to it, focus that input or link
  to `routes.search_url`.
- **Predictive search** section id `predictive-search`; rendered through
  `routes.predictive_search_url?q=…&section_id=predictive-search` (fields include `tag`) where the
  storefront language is supported (`<script id="shopify-features">` → `predictiveSearch`). Hebrew and
  Arabic are not, so there it is rendered on `routes.search_url?q=…&type=product&options[prefix]=last`
  and reads `search.results`, with category chips matched from the main menu's link titles.
- **Search forms** elsewhere (search page, 404) sit in `<sw-search-form>` (`assets/predictive-search.js`),
  which sends the query normalized like the header's (Hebrew geresh/gershayim, spaces).
- **"Complete the set"**: product metafield `sportwear.complements` (list of products). Product page and cart
  upsell both read it.
- **Adults / kids switch**: product metafield `sportwear.counterpart` (product). The switch links to it.

## 5. Section conventions

Every section:
```liquid
<div class="section NAME color-{{ section.settings.color_scheme.id }}" style="--section-pt: {{ section.settings.padding_top }}px; --section-pb: {{ section.settings.padding_bottom }}px;">
  <div class="page-width">…</div>
</div>
```
Schema must include (use the shared labels):
```json
{ "type": "color_scheme", "id": "color_scheme", "label": "t:settings.color_scheme", "default": "scheme-day" },
{ "type": "range", "id": "padding_top", "min": 0, "max": 96, "step": 4, "unit": "px", "label": "t:settings.padding_top", "default": 36 },
{ "type": "range", "id": "padding_bottom", "min": 0, "max": 96, "step": 4, "unit": "px", "label": "t:settings.padding_bottom", "default": 36 }
```
(The header, announcement bar, drawers and render-only sections are exempt from padding settings.)

- **Addable sections have `presets`** with a `t:` name and sensible defaults; add `"disabled_on": {"groups": ["header", "footer"]}`
  or `"enabled_on"` where it makes sense. Main template sections (main-*) have no presets.
- **Text settings default to empty and fall back to translated copy**, so all three languages work
  out of the box:
  ```liquid
  {%- liquid
    assign heading = section.settings.heading
    if heading == blank
      assign heading = 'home.hero.heading' | t
    endif
  -%}
  ```
  Give such settings `"info": "t:settings.default_text_info"` and a `"placeholder"` if helpful.
- **Images**: always `{% render 'image', … %}` with a correct `sizes`. Only the first section on a page
  may use `loading: 'eager'` + `fetchpriority: 'high'` + `preload: true` (check `section.index == 1`).
- **Headings**: the main section of a template owns the single `<h1>`. Other sections use `<h2>`.
- **Blocks**: use `{{ block.shopify_attributes }}` on every block wrapper. Prefer section-level blocks
  (schema `blocks` with explicit types) unless nesting is truly needed.
- **`{% stylesheet %}`** for component CSS (no Liquid inside; one per file). Use `{% style %}` or inline
  `style="--var: …"` for values from settings. BEM, single-class specificity, no IDs, no `!important`.
- **Links**: use `routes.*` and resource `.url`, never hardcoded paths.
- **Prices**: `render 'price'` or `| money_without_trailing_zeros`, never raw cents.

## 6. Data available

- Product metafields (namespace `sportwear`): `team` (metaobject `sw_team`: `name`, `short_name`, `slug`,
  `sport`, `leagues`, `primary_color`), `leagues` (list of `sw_league`: `name`, `slug`, `sport`), `season`
  (e.g. 26/27), `kit` (home|away|third|fourth|special|training), `audience` (adult|kids), `size_chart`
  (metaobject `sw_size_chart`: `name`, `audience`, `table` JSON `{"rows": [...]}` or a bare array of rows
  `{size, age, height_cm, weight_kg, chest_width_cm (flat, armpit to armpit), chest_cm (circumference),
  length_cm, shorts_length_cm}`, all optional but `size`, values numbers or ranges like "160-170"; rendered
  by `snippets/size-chart-table.liquid`, ages also under the sizes in the picker), `fit_note`),
  `counterpart` (product), `complements` (list of products).
  Access typed values with `.value`, e.g. `product.metafields.sportwear.team.value.name.value`.
  They may be empty; always guard with `!= blank`.
- Product option: a single size option (`מידה` / Size / المقاس). Adult sizes S, M, L, XL (XXL maybe); kids
  5-6, 7-8, 9-10, 11-12, 13-14; kids football sets from the supplier jerseyxie: 16, 18, 20, 22, 24, 26, 28
  (owner, 2026-09-26; their chart gives the age of each).
- Tags: `sport:*`, `league:*`, `team:*`, `kit:*`, `season:*`, `audience:*`, `sale`, `new`.
- Theme settings you may read: `settings.cart_type`, `settings.free_shipping_threshold` (₪, may be blank),
  `settings.cart_show_upsell`, `settings.cart_show_note`, `settings.whatsapp_number`, `settings.business_*`,
  `settings.support_phone`, `settings.support_email`, `settings.predictive_search`, `settings.drawer_color_scheme`,
  `settings.card_*`, social links.

## 7. Translations (i18n parts)

- Storefront strings: `i18n/<area>.he.json`, `i18n/<area>.en.json`, `i18n/<area>.ar.json`: identical keys.
- Editor strings: `i18n/<area>.schema.en.json`, `i18n/<area>.schema.he.json`: identical keys.
- Namespaces you may define (storefront / editor):
  - header: `header.*`, `predictive_search.*` / `sections.announcement_bar.*`, `sections.header.*`, `sections.predictive_search.*`
  - product: `products.*` / `sections.main_product.*`, `sections.product_recommendations.*`
  - collection: `collections.*`, `search.*`, `facets.*`, `pagination.*` / `sections.main_collection.*`, `sections.main_search.*`, `sections.main_list_collections.*`
  - cart: `cart.*` / `sections.cart_drawer.*`, `sections.main_cart.*` (also delete nothing: the stub key `sections.cart_drawer_stub` stays in core)
  - home: `home.*` / `sections.hero.*`, `sections.collection_links.*`, `sections.featured_collection.*`, `sections.promo_banner.*`, `sections.image_with_text.*`, `sections.trust_strip.*`, `sections.cta_band.*`, `sections.rich_text.*`
  - content: `footer.*`, `pages.*`, `contact.*`, `team_orders.*`, `faq.*`, `size_guide.*`, `blogs.*`, `not_found.*`, `password.*`, `gift_card.*` / `sections.footer.*`, `sections.main_page.*`, `sections.contact_form.*`, `sections.team_orders.*`, `sections.faq.*`, `sections.size_guide.*`, `sections.business_details.*`, `sections.main_404.*`, `sections.main_blog.*`, `sections.main_article.*`, `sections.main_password.*`
- Shared editor labels already exist: `t:settings.*` (color_scheme, padding_top, padding_bottom, heading,
  subheading, eyebrow, text, image, image_mobile, button_label, button_link, secondary_button_label,
  secondary_button_link, collection, collections, product, products_to_show, columns_desktop, columns_mobile,
  menu, link, page, heading_tag, heading_size, alignment, full_width, show_view_all, default_text_info) and
  `t:options.size.*`, `t:options.alignment.*`, `t:options.heading_tag.*`. Shared storefront strings:
  `general.*`, `accessibility.*`, `localization.*`, `social.*` (see `i18n/core.en.json`).
- Language quality: Hebrew is the primary language: natural, warm, addressing customers in the plural
  (אתם). Arabic is Modern Standard Arabic in a natural retail tone. Plural keys: English one/other,
  Hebrew one/two/many/other, Arabic zero/one/two/few/many/other.

## 8. Design reference

Approved direction "Night Match, hybrid" (canvas boards titled "משולב"):
https://claude.ai/artifact/AXjtro4CVL8sLLPBbKSs94 and `design/tokens.json`.
- Brand shell dark (`scheme-night`): announcement bar is lime (`scheme-accent`), header, hero, trust strip,
  team-orders band and footer are dark.
- Shopping surfaces light (`scheme-day`): product grids, product page below the header, cart, content pages.
- Display headings are big and tight (Anton/Karantina), body is Heebo; prices bold 800.
- Product tiles light grey `#F1F2F4`, 4px radius, badges top-start.
- Primary button on light: `#0D0E11` with lime text; on dark: lime with dark text. 52–56px tall, 4px radius.
- Chips (leagues) are pills; the active chip is inverted.

## 9. Definition of done and final report

Done = your templates render a complete, polished, accessible experience in he/en/ar at 390px and
1440px, with every string translated, every file validated, formatted and committed in your worktree.

Final report (your last message), short:
1. Files created (list) and the commit hash.
2. What each section does and its main settings (one line each).
3. Contract items you rely on or provide (ids, events, metafields).
4. Requests for foundation changes (exact diff or description), if any.
5. Known gaps or risks the integrator must check in the live preview.
