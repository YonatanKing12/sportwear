# Real Madrid home 26/27: the button-front version (fix ready, not in the store yet)

On 2026-09-30 the owner asked why the product `real-madrid-home-jersey-2026-27` looks like it has buttons.

**What happened.** Wave 1 took this product from the supplier album 252535921 ("26-27 Real Madrid Home"). That
album shows a button-front version with a V-collar, which Real Madrid and adidas never released: the real home
shirt (unveiled on 3 June 2026) has a round collar and no buttons. The studio render copied the album faithfully,
and also printed "AEROREADY" at the hem where the album's shirt shows another small print. The same supplier has
the real shirt in album 221456533, and the store's kids set of this kit (album 242831509) is already the real one.
A check of all 424 football products (272 adult shirts, 152 kids sets) found no other button-front shirt.

The button-front photo is also in three other places: the Real Madrid team card and banner (`sw-card-real-madrid.png`),
the football hero slide on "SportWear (next 2)" (`sw-v4-hero-football*.jpg`, the woman in the middle), and, partly
hidden, the share images (`sw-share-*.jpg`).

## The files here

| File | Replaces | Made from |
| --- | --- | --- |
| `real-madrid-home-jersey-2026-27.png` | the product's front photo | album 221456533, photo 01, `scripts/images/studio.py` (quality high) + `normalize.py` |
| `real-madrid-home-jersey-2026-27__back.png` | the product's back photo | album 221456533, photo 02, same way |
| `sw-card-real-madrid.png` | the collector card (`gid://shopify/MediaImage/45307161149744`) | the new front, `scripts/images/recut-card.py … flood 4 3`, 820 px wide |
| `sw-share-he.jpg`, `-en`, `-ar` | the share images | `scripts/images/share-image.mjs` with the new Real Madrid cut-out (`cutout.py --thresh 4`) |
| `sw-v4-hero-football.jpg`, `-ltr`, `-mobile` | the football hero slide (dev theme only) | the same photos, the shirt repainted from the new front (masked edit), then the hem print and a logo on the shorts painted out |

All of them were checked at full size: round collar, no buttons, crest, adidas logo, "Emirates FLY BETTER", the
HP sleeve patch, no invented text.

## To apply (needs the Shopify connector on SportWear)

1. Product photos: replace in place with `fileUpdate(originalSource)` (same media IDs, alts and positions), after a
   staged upload of each PNG. Look the media IDs up with `product(id: "gid://shopify/Product/15309468860720")
   { media { … } }`.
2. Point the product at the right album: metafield `sportwear.source_url` =
   `https://jerseyxie.x.yupoo.com/albums/221456533?uid=1`, and the same in
   `catalog/published/real-madrid-home-jersey-2026-27.json` (`source.url`), so orders go to the real shirt.
3. Card: `fileUpdate(originalSource)` on `gid://shopify/MediaImage/45307161149744`.
4. Share images: `fileCreate` with the same filenames and `duplicateResolutionMode: REPLACE`, or `fileUpdate` in
   place; then copy them over `design/share/`.
5. Hero: `fileUpdate(originalSource)` on the three `sw-v4-hero-football*.jpg` files (used only by the dev theme), and
   refresh `scripts/preview/fixtures/images/` (1920 × 640 and 800 × 1035 copies).
6. Check the storefront, write the record (`catalog/published/`), and delete this folder.
