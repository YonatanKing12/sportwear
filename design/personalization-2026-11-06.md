# Football personalization — 2026-11-06

Preview: https://sportwear.co.il/?preview_theme_id=189466116400 (UNPUBLISHED).
The owner explicitly confirmed that the existing ₪35 per-shirt fee includes name and number.
No live theme, catalog product, price, inventory, publication or shared collection was changed.
The restored hero and mixed first homepage shelf were untouched.

## Scope and price

Eligibility requires BOTH exact tag `sport:football` and exact product type `Football Jersey` or
`Football Kit`. Kids football kits contain a shirt and qualify for printing on that shirt only.
Basketball, NFL/American football, shorts, hoodies and other types do not qualify. No substring matching.

The existing service variant remains `67877546656048`, ₪35 (3500 minor units) per shirt. Admin and
public product data confirm it is available, UNLISTED and untracked; inventory quantity 0 therefore
does not mean sold out. Its existing catalog title remains unchanged. Name only, number only or both
use ONE service unit per shirt at the same fee. No new surcharge or free personalization path.

`personalization_number_enabled` defaults false and is explicitly true in this unpublished theme.
Name: up to 10 Unicode letters/combining marks/spaces, normalized spacing; existing name limit retained.
Number: one or two digits (0–99); leading zeros preserved, Arabic/Persian numerals normalized to ASCII.
At least one field is required when selected. Turning customization off clears/disables both fields.
Unavailable variants disable the customization control, and returning to an available variant restores
it without losing the chosen text. Main, sticky and size-sheet prices reflect the same paid total. Invalid customization submitted
from the size-sheet modal closes it and focuses the labelled main field with its linked error.

## Shopify cart payload and fulfillment safeguard

Both lines are added in one existing Cart AJAX request:

- `items[0][id]`: selected shirt variant; `quantity`: requested units.
- `items[0][properties][_sw_print_reference]`: unique UUID for this printed configuration.
- `items[1][id]`: `67877546656048`; same quantity; `items[1][parent_id]`: shirt variant ID.
- `items[1][properties][_sw_print_addon]`: `true`.
- `items[1][properties][_sw_print_reference]`: same UUID.
- Public instructions ONLY on the paid child: `שם להדפסה` / `מספר להדפסה`, `Name to print` /
  `Number to print`, or `الاسم للطباعة` / `الرقم للطباعة`, according to storefront language.

Shopify's returned `parent_relationship.parent_key` is verified against the precise parent line.
Names/numbers are never copied to the unpaid shirt line. Removing the paid child removes all
fulfillment instructions; removing a parent removes its child. Same variant + different printing
stays in distinct parent/child pairs. Existing cart quantity synchronization preserves the per-unit fee.
These are actual Shopify cart line-item properties; no checkout or order was created to verify them.

## Validation

- Two changed Liquid snippets passed official validator; JS syntax, Theme Check (zero errors,
  six existing warnings), formatting and i18n freshness checks passed.
- 30 UI cases: Hebrew/English/Arabic at 390/1440px, adult football, kids football, NBA, NFL and shorts.
  Eligibility, field state/clearing, displayed ₪174/₪134 totals and overflow passed.
- Actual available variants tested. No suitable sold-out football variant was found, so an isolated
  mocked section response verified unavailable/restore behavior without changing inventory.
- No personalization axe violations. Two old partially clipped controls produced target-size findings
  at a scrolled position; both pages passed with the viewport at the top (evidence retained).
- Actual anonymous Shopify cart tests in all 3 languages at 390px and Hebrew at 1440px: invalid inputs,
  interrupted add recovery, duplicate-submit suppression, normalized number 07, separate variants,
  same variant/different printing, name-only/number-only fixed fee, quantity synchronization,
  parent/child removal and visible cart properties passed. The same full mobile flow also passed
  on a real kids football kit at ₪99 + ₪35. Test carts were cleared afterward.
- Test automation waits for the product form's completed request before reading the cart: polling
  before the first add completes can race Shopify's initial cart-cookie creation.

Files: `snippets/product-buy-buttons.liquid`, `snippets/product-sticky-buy.liquid`,
`assets/product-info.js`, `config/settings_schema.json`, `config/settings_data.json`,
`i18n/personalization.*.json`, generated `locales/*.json`, and `scripts/qa/personalization-*.mjs`.
Evidence: `qa-output/personalization/commerce.json`, `kids-commerce.json`, `qa-output/personalization-ui/summary.json`,
`unavailable.json`, `axe-recheck.json` and screenshots. Deployment/checksum evidence is in
`/workspace/scratch/sw-redesign/personalization-deployment.json`.

No payment/order was executed. Device coverage is browser viewport emulation. Storefront scope is
implemented in Liquid and the product form; no server-side Shopify Function or catalog policy changed.
Publication remains an owner action; production was verified unchanged.
