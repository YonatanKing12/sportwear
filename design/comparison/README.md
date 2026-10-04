# Head to head: SportWear and other stores

The product pages show a comparison board, "ראש בראש מול חנויות אחרות" (`sections/store-comparison.liquid`,
under the main product section in `templates/product.json`). The owner asked for it on 2026-10-04, after a
competitor's version (HOOPERS: "מה מקבלים ב-HOOPERS שלא מקבלים במקום אחר"), "ברמה הרבה יותר גבוהה".

Our column comes from the store itself: free shipping from the theme setting (through
`snippets/free-shipping-cents.liquid`), the product's kids set price (its own, or its kids counterpart's) and its
basketball set price (the shop's set offer and a matching complement). The other
stores' column is copy in `i18n/product.*.json` (`products.compare.<topic>.theirs`, `theirs_note`, `note`), and every
word of it has to be backed by `competitors-2026-10-04.json`. That file lists, per store, what its own pages said on
2026-10-04, with the URL and a quote for each fact (null where a store says nothing).

## The stores checked (2026-10-04)

HOOPERS, Jerseys.co.il, FanShop, R:Sport, Liberokits, FootArmy, Jerseyniho and Ohadimos: eight Israeli online
stores for football shirts, most of them also selling NBA jerseys. Sport City could not be loaded (Cloudflare);
Max Sport is a general sports store, left out, but it sells kids football kits at ₪99, so we never say that nobody
else does.

## What each row claims, and how many of the eight back it

| Row | Other stores' copy (he) | Backed by |
| --- | --- | --- |
| Home delivery | "לרוב לנקודת איסוף" · "עד הבית: בתשלום, מעל מינימום או בכלל לא" | 6 of 8 deliver free only to a pickup point: home delivery costs ₪29–49 (Jerseys, FootArmy), needs ₪450–499 (FanShop, Jerseys) or isn't offered (Liberokits, Jerseyniho, Ohadimos). HOOPERS delivers home free; R:Sport free to the home or a pickup point by area |
| Delivery time | "עד 14-35 ימי עסקים" · "ברובן חלק מההזמנות או כולן נשלחות מחו״ל" | The stated upper ends run from 14 (HOOPERS) to 35 (Ohadimos) business days. 4 say everything ships from abroad, 2 that some orders do. HOOPERS also has a 3-day collection in stock in Israel |
| Returns | "לרוב 14 יום" · "ובחלק מהן אין החזרות בכלל" | 14 days at HOOPERS, Jerseys, R:Sport (cash refund only within 48 hours), FootArmy and Jerseyniho's terms; FanShop 14 business days; no returns at Liberokits, Ohadimos and Jerseyniho's FAQ |
| Kids set (football pages with a kids set) | "119-230 ₪" · "לסט ילדים של העונה" | This season's kids sets: Liberokits ₪119–139, Ohadimos ₪120, FootArmy from ₪140 (mostly ₪150), FanShop ₪145–185, Jerseys ₪159–179, Jerseyniho ₪159, HOOPERS ₪179, R:Sport ₪160–230 (older seasons from ₪104) |
| Jersey + shorts (basketball pages with a set) | "מ־298 ₪" · "גופייה ומכנס בנפרד, בלי מחיר סט" | No set price at 7 of 8 (HOOPERS has one bundle with a ball, ₪449). The cheapest jersey plus shorts: Liberokits ₪298; others ₪304 and up |

The languages row (3 languages against Hebrew only at all 8) was taken out on 2026-10-04: the owner said it
interests no one ("זה שיש 3 שפות באתר זה לא מעניין אף אחד") and that the board should talk about what really matters
to a buyer, such as the quality of the fabric. A fabric row needs facts first (ours from the owner, theirs from the
stores' pages).

Left out on purpose, because they would not be true or would not favour us: the shirt price (Liberokits ₪119 and
Ohadimos ₪89 are cheaper than our ₪139; FootArmy is ₪140), name printing (free at 3 stores, ₪10–15 at the rest,
against our ₪35), sizes (7 of 8 go up to 4XL) and NFL (HOOPERS and R:Sport sell it too). The section still has a
`price` topic, with no default copy; a row without other-stores copy is not shown.

## Keeping it true

Stores change their terms. Check them again before a big campaign and at least every few months: run the same
research (the method is in the JSON), save a new `competitors-<date>.json`, and change the copy and the date in the
footnote (`products.compare.note`) in all three languages. If a row stops being backed, take it out of
`templates/product.json` or change its copy; never keep a claim the latest check does not support. Our own side
must stay true too: if delivery, returns or shipping change, change `products.compare.<topic>.ours*`.
