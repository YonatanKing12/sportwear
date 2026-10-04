# Imagery

Two kinds of photos, both made with OpenAI's `gpt-image-2` through the Images edit endpoint, with the
store's own product photos as references. The key comes from the `OPENAI_API_KEY` environment variable
(the cloud environment's variables), never the repo or the chat.

## Product photos: the studio line

Every product photo follows one line, so cards and galleries look like one catalog:

- Square **1254 × 1254 PNG**, seamless **#F4F4F4** background, no shadow, no props.
- The garment is centered and flat, about **95% of the height** and at most 90% of the width.
- The same side as the supplier's photo: a back view only when the supplier photographed the back.

The theme is built for it. Product cards are square (`card_image_ratio: square`) and the image tile is
#F4F4F4 (`--color-tile` in `assets/base.css`, no blend mode), so a photo fills its card edge to edge.

### Making them

1. `python3 scripts/images/studio.py <products.json> <out_dir>` renders one studio photo per product
   from `media[0]` (the supplier photo), at `1248x1248`, quality `medium` (about 2,050 output tokens and
   30 seconds a photo; 8 in parallel). A product's back view is a separate entry whose `media` holds the
   back photo, named `<handle>__back`.
2. `python3 scripts/images/normalize.py <out_dir>/raw <out_dir>/norm` sets the exact background and the
   framing. Product pixels are only scaled. It flags renders that touch the frame edge.
3. **QA before upload.** Put each render next to its supplier photo and check the team, colors, number,
   player name, sponsor, patches, tags, signatures and all-over prints. Re-render or drop anything that
   changed. For a re-render, add a `"note"` to the product entry that names the lost detail; `studio.py`
   appends it to the prompt.
4. Upload: `stagedUploadsCreate` (resource `IMAGE`, PUT), then `fileCreate` (alt = the product title; a
   back view adds " (גב)"), then one `fileUpdate` that adds each new file to its product
   (`referencesToAdd`) and removes the supplier photo from it (`referencesToRemove`). The supplier
   photo stays in Content → Files, so the change can be undone.

File names: `sw-studio-<handle without "sw-">.png`, and `-back.png` for a back view.
New products from the jerseyxie import (catalog/sources/jerseyxie/README.md) are created with their studio
photos, named after the handle: `<handle>.png` and `<handle>__back.png`.

### Rules

- Render only what the supplier photographed. Never invent a back view or a detail.
- A supplier photo that shows the front and the back side by side is cut in half, and each half is
  rendered on its own: the front, and the back as `<handle>__back`.
- A photo of several colorways together: render only the item that matches the product title, and only
  if it is fully visible. Otherwise the product keeps its supplier photo until there is a
  single-product photo.
- The demo product (tag `demo`) is not touched.
- If a render differs from the product in any detail a customer would notice, it does not go live.

History (2026-09-26): an earlier process gave 229 products studio photos in the same look (files named
`sw-studio-…-main-v1.png` and similar, some with extra close-ups). This pipeline made the rest the same
day: 878 products (867 new, plus 11 football shirts from the earlier set, redone), 922 photos in all
(878 fronts, 44 backs). Three products kept their supplier photo: the demo product,
`sw-jerseys-244981217` (its two photos showed two different jerseys) and `sw-shorts-117771218` (a group
photo). The full scan of 2026-09-27 gave both of them studio photos from their supplier albums, so only the
demo product keeps its supplier photo (`catalog/published/scan-fixes-2026-09-27.json`).

Later the same day a crop bug came to light: `normalize.py` missed the thin outline of white garments on the light background and cut sleeves or edges. The script was fixed (a finer mask, with the old one as a fallback against background noise), the 947 earlier renders were measured with both masks, and the 19 uploaded photos the old crop had cut were re-cropped from their raw renders and replaced in place (`catalog/published/photo-recrop-2026-09-26.json`).

The scan of 2026-09-28 (`catalog/published/scan-2026-09-28.json`) fixed what the renderer had got wrong in small
print, all replaced in place:

- **Text:** it repaired crest lettering (Celtic home and away) and a nape emblem (Aston Villa third) with the
  supplier's own pixels, aligned and colour-matched. Where the supplier photo was too soft to lift letters from,
  it re-set the line in a real font at the supplier's size and position (Al Hilal's Arabic sponsor line,
  Galatasaray's motto).
- **Other details:** it rebuilt West Ham away's sleeves from the product's own back render, and matched Lille
  third's two blues to the supplier's navy.
- **Front photos:** 11 older products had only a back photo because the imported photo was the album's back. They
  got a studio front from the front photo in their own album, first in the gallery (`sw-studio-…-front.png`).

A render with gibberish text is not accepted: check every word of small print (crest rings, sponsor lines, nape
prints) at 100% before upload.

## Product close-ups: real photos of the fabric

On 2026-09-27 the owner asked for photos that show the quality of the fabric. These are the supplier's
own close-ups from each product's Yupoo album, never generated:

1. An inventory of every album (its photo URLs), contact sheets with numbered photos, and a visual review
   that marks each photo as a full front, a full back, a close-up or other, and picks up to two close-ups
   of the product's own garment. Mixed albums are common: a photo of another colorway or team is never
   picked.
2. Each pick is cropped to a centred square, 1200 × 1200 JPEG, named `sw-detail-<handle>-<n>.jpg`.
3. Upload as for studio photos (`stagedUploadsCreate`, `fileCreate`, `fileUpdate referencesToAdd`). They
   come after the studio photos, alt `<title> (תקריב של הבד וההדפס)`.

The record is `catalog/published/fabric-closeups-2026-09-27.json`: 979 close-ups on 532 products (507 from
the owner's import, 25 from jerseyxie; 447 with two, 85 with one). Albums with only full views (most
jerseyxie albums, the football albums and the hoodie album) have no close-ups.

The theme keeps them on the product page: a product card's hover photo skips `sw-detail-*` files, so grids
keep the studio look (`snippets/product-card.liquid`). Alt texts are stored in Hebrew; on `/en` and `/ar`
`snippets/media-alt.liquid` rebuilds them from the translated title plus "(back)" or "(close-up of the
fabric and print)", so keep the Hebrew suffixes (" (גב)", " – גב", " (תקריב של הבד וההדפס)") on new
photos.

## Home page photography

The hero slides and the category tiles show fictional people wearing products the store sells,
generated with the product photos as references. They live in Content → Files and are referenced as
`shopify://shop_images/<file>` in `templates/index.json`; resized copies sit in
`scripts/preview/fixtures/images/` for the local preview.

**Current set (2026-09-28, `sw-v4-*`).** The owner: the hero is the first thing a customer sees, and
if it looks like AI, trust is gone before they scroll; they asked for "Israeli people, an Israeli
background, Israeli details, and not too perfect a picture", made to fit phones and computers. So every
photo is a candid phone snapshot in plain daylight (no golden hour, no grading, no background blur),
with ordinary Israelis of different backgrounds and everyday Israeli places: a neighbourhood pitch
with a green cage fence and solar water heaters on the roofs, a Tel Aviv street with a red-and-white
kerb, a court with a Jerusalem-stone wall, the Tel Aviv promenade with matkot, a Jerusalem alley, a
schoolyard. Each hero slide has three files made for its frame:

| File | Size | Frame |
| --- | --- | --- |
| `sw-v4-hero-<slide>.jpg` | 3840 × 1280 | people in the left 40%, heads in the top fifth; the right side is calm, for the Hebrew and Arabic text |
| `sw-v4-hero-<slide>-ltr.jpg` | 3840 × 1280 | the same scene with the people on the right, for the English text on the left |
| `sw-v4-hero-<slide>-mobile.jpg` | 1088 × 1408 | people in the upper half, the text over the lower half |

Slides: `football` (Maccabi Haifa, Real Madrid and Barcelona home 26/27; on 2026-09-30 the Real Madrid shirt was
repainted from the real shirt, because the product's first photos came from a supplier album of a button-front version
the club never released: `catalog/published/real-madrid-home-fix-2026-09-30.json`), `street` (Manchester City home
26/27 and the Boston 7 jersey), `nba` (Lakers 24 yellow, Golden State 30 black, the white Bulls 23 with
the sketched bull) and `national` (Israel, Brazil and Argentina home 2026). Tiles (`sw-v4-cat-<tile>.jpg`,
1024 × 1280): `football` (Manchester United home 26/27), `basketball` (the black Bulls 23 with the
sketched bull), `shorts` (the yellow Lakers shorts), `hoodies` (the olive Dallas Cowboys hoodie),
`kids` (Real Madrid and Barcelona home kids kits) and `teams` (Chelsea home 26/27).

How they were made: `gpt-image-2.5-flare` through the Images edit endpoint, with the product's studio photo
as the reference and a style block for the candid look (people, places, no text or flags anywhere except
the products' own print). Each hero scene was generated once as a 3:2 photo and then extended to the three
frames with a transparent-area edit, so the people and jerseys stay the same in every version. Every file
was checked at full size for AI tells, stray text and jersey accuracy against the product photo; one brand
name on a basketball (shorts tile) was painted out. The hero section's scrim and crop are tuned for these
frames (`sections/hero-slideshow.liquid`): worst-case contrast of the white text over the photos was 8.5:1
in he/en/ar from 360 to 1920 px wide. Record, with the products shown and the style block: `home-photos-2026-09-28.json`.

Older sets: `sw-v3-*` and `sw-v2-*` (the first AI generation, glossy golden-hour look) stay in Files; the
live theme stopped using them when the owner published "SportWear (next 2)" on 2026-09-29. `sw-*.jpg` (the
first, darker set, prompts in `prompts.json`) is unused.

Rules for new atmosphere photos: fictional people only (no recognisable real people or players), jerseys
as they are sold (no added names, numbers or text), and never present them as customers. Team names and
crests appear as they do on the products; the lawyer question about branded jerseys covers these photos
too.

## Collector cards: jersey cut-outs

The player and team cards (`sections/collection-circles.liquid`, the team banners and the product page's team
card) use a cut-out jersey per collection: the collection metafield `sportwear.card_image` (with
`card_color` and `card_mark`), 34 files `sw-card-<collection>.png`, listed in `collector-cards.json`. They were
cut from studio photos with `scripts/images/cutout.py`; three of them (Arsenal, Golden State, Juventus)
showed a light outline, specks or a halo on the dark cards and were re-cut on 2026-09-28 with
`scripts/images/recut-card.py` and replaced in place. Real Madrid's was re-cut the same way on 2026-09-30 from the
product's new front photo. Check a new cut-out on a dark background at 200% before uploading.

**Every team page since 2026-10-04** (the owner chose "a colour and a card for every team"): 136 more cards, 170 in
all. Each comes from the first jersey on the team's page, a few swapped for the team's best-known shirt (France's navy
home, Inter Miami's pink home, the Raiders' black, the Bears' navy). The studio renders sit in a soft grey shadow 5-8
px wide (up to ~16 px under the hem) that a flood cut keeps as a light rim on a dark card, so `recut-card.py` has an
`auto` mode that removes that shadow and keeps flat white or silver parts of the garment (white jerseys still cut best
with `flood 4 1`; three real photos on a grey backdrop, Memphis, Utah and Houston, with `grey 160 1`). Which mode each
card used, its colour, its mark and its source product are in `collector-cards.json`. The NFL team pages show their
card on the night-field banner `sw-col-hoodies.jpg`, set as `sportwear.banner` on `nfl`, `nfl-jerseys` and
`nfl-jerseys-kids` (a team page falls back to its league's banner). The Saints, Buccaneers, Titans and Commanders have
no card until their first jerseys come.

## Product page story band (removed)

On 2026-10-04 the product pages got a story band: one big lifestyle photo with a line of copy, picked by the kind of
product and shown in the team's colour. The owner turned it down the same day ("ענקי, לא מביא שום ערך, מרובע, עם
מסגרת, גנרי": huge, no value, boxy, framed, generic) and it was taken out. The lesson for product pages: a big photo
with general copy, often of another team's shirt, gives the buyer nothing. A photo there should show the product
itself, as the owner's photos do in nine product galleries, or carry something the buyer uses.

## Brand graphics: banners, the empty cart and the 404 page

On 2026-09-27 the owner asked for "lots of special graphics" to brand the site. Twenty wide pictures
(3072 × 1024), made with `gpt-image-2` from text alone (no reference photos), in the look of the home
page: real-looking editorial sports photography, golden hour or floodlit nights, never text, logos,
crests, sponsor boards, real people, players or stadiums. Prompts, file names and media IDs:
`design/imagery/brand-prompts.json`; regenerate with
`python3 scripts/images/brand.py design/imagery/brand-prompts.json <out_dir> [names]` (key from
`OPENAI_API_KEY`). Every picture was checked at full size for stray text and brand marks before upload.

- **Collection banners** (`sw-col-*.jpg`): 18 league and category pictures (a rainy English ground, a
  Spanish sunset, an Italian bowl at dusk, a German standing terrace, an NBA arena, a rooftop court for
  City Edition, a 90s gym for retro, kids' boots on the grass, a foggy football field for the hoodies…).
  They sit in the collection metafield `sportwear.banner` (file reference, "באנר" in admin, pinned), set
  on 32 collections (`collection_banners` in the JSON). The collection image itself stays empty on
  purpose: the mega menu shows collection images as small product tiles. `sections/main-collection.liquid`
  (setting "Show banner") puts the banner under the page title with a dark gradient; a team's or a
  player's page without its own banner uses its league's (the first product's `sportwear.league_handle`,
  or `other-leagues` for football). To give a collection a banner: Products → Collections → the collection
  → Metafields → באנר (a wide picture, 3:1; the middle stays visible on phones).
- **Empty cart** (`sw-empty-cart.jpg`): a locker-room bench with a folded shirt, a football and a
  basketball; Theme settings → Cart → Empty cart → Picture. It goes with the heading "הסל עוד על הספסל".
- **404** (`sw-not-found.jpg`): an assistant referee's flag on the touchline; the 404 template's
  "Picture" setting, with the heading "נבדל!".
