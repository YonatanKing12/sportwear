# Supplier: nfl-cyq888 (Yupoo)

NFL jerseys from https://nfl-cyq888.x.yupoo.com. The owner sent the link on 2026-10-04 ("יש מוצרים נוספים שצריך
להוסיף לאתר") and chose, in answer to our questions the same day:

- **Prices:** adults ₪139, kids ₪89 (`catalog/pricing.json`, product type `NFL Jersey`).
- **Scope:** a selection of each team's stars in the main colours, not the whole catalog (about 8 adult and 3 kids
  jerseys per team).
- **Publishing:** live on the site after our own check, like the earlier waves.

| File | What it is |
| --- | --- |
| `albums.json` | The catalog: 64 albums, one per NFL team for adults (category 二代NFL, 5214685) and one per team for kids (童装NFL, 5036285), 1,356 photos. Each album holds many jerseys of one team (players × colours), one jersey per photo, its front and back side by side on hangers |
| `review.json` | The photo review: every distinct jersey in every album (905 adult, 447 kids), with the name and number on its back, the player, the colour, what tells two versions of a colour apart, and the clearest photo |
| `picks.json` | The selection: 309 jerseys (217 adult, 92 kids), with the photo each studio render was made from |
| `status.json` | Where each pick stands: `created` (with its product id), `held` (with what to fix in the next render) or `not rendered yet` |
| `scripts/catalog/nfl-photos.py` | `albums`, `fetch` (album pages and photos, cached), `sheet` (numbered contact sheets for the review), `zoom`, `originals` (full-size photos of the picks), `studio` (inputs for `scripts/images/studio.py`), `qa` (supplier photo next to the studio front and back) |
| `scripts/catalog/nfl-build.py` | Picks → `catalog/ready/<handle>.json`: texts in he/en/ar, tags, variants S–XL, 5 per size, prices, the adult ↔ kids counterpart |
| `scripts/images/retouch.py` | Local fixes for the renderer's usual mistakes: an invented back tag (`tag`), a hanger line inside the neck (`hanger`), a Browns jersey drawn near-black (`browns`) |

## How the import runs

1. `albums`, `fetch`, `sheet`. The review reads every photo: one JSON per album with the name and number on the back,
   the colour and the version. Watch for: the same number on two players (Patriots 10 is Drake Maye and Mac Jones;
   pick by name, not by number), white or navy jerseys in two versions (home and Color Rush), photos with "一件加2元"
   (+2 yuan, a pricier version) written on them, and product photos on white or mannequin shots mixed with the
   supplier's own hanging photos. Some originals are stored sideways: the studio inputs turn them upright.
2. The selection (`picks.json`): current stars and legends, home (team colour) and away (white) first, then the
   famous alternates and throwbacks (Eagles kelly green, Buccaneers creamsicle orange, Patriots red, Giants royal).
3. **Studio photos** as for every product (`design/imagery/README.md`): each supplier photo shows one jersey twice,
   so the whole photo is the reference and a note tells the renderer which of the two to draw (front or back), with
   the number and the name on the back. `normalize.py`, then a QA sheet per four jerseys (below).
4. **Product files** with `nfl-build.py`: title `חולצת פוטבול {team} מספר {n} {colour}[ רטרו][ – ילדים]` like the
   basketball jerseys (the player is in the tags and the description), product type `NFL Jersey`, tags from
   `classification.json` (`player_numbers` covers the NFL teams too), `source:nfl-cyq888`, `album:<id>`,
   `import:2026-10-04`, `new`. Two jerseys of one team, number and colour that differ in a detail get a title detail
   ("… לבן | שרוולים כחולים"). Build only the rendered picks: `nfl-build.py <studio dir> --only <list.json>`.
5. **Shopify:** staged uploads (at most 40 per call), one `productSet` per product as DRAFT, a read-back check
   (status, price, 4 sizes × 5 units, media READY), then `bulk-update-product-status` ACTIVE and `publicationUpdate`
   on the Online Store (50 per call; the owner's instruction), the EN/AR translations (`catalog-translator`), the
   adult ↔ kids counterparts, the filter names (`sportwear.filter_names`, `scripts/lib/filter-names.mjs`) and the
   collection order (`scripts/catalog/collection-order.py`).

## Studio QA and local fixes

Each render was checked against its supplier photo (front and back, side by side): the name and number on the back,
the colours, the logos and patches, the sleeves and the collar. Of the 208 renders made, 179 passed and 29 had a
mistake:

- 12 were mended locally with `scripts/images/retouch.py` (the fix is named in `status.json`, `local_fix`): 8
  invented jock tags on the back hem covered with fabric, 2 hanger lines drawn inside the neck of dark kids jerseys,
  and the 2 Browns kids jerseys, drawn near-black, given their brown back.
- 17 are **held**: a wrong sleeve, a missing TV number, a wrong colour or trim that only a new render fixes. Their
  product files wait in `catalog/ready/`, and `status.json` keeps the issue and the note for the new render
  (`render_note`).

The renderer's usual mistakes, to look for first: a jock tag or size label invented on the back hem; the hanger bar
drawn inside the neck; TV numbers on the shoulders left out; sleeve stripes or numbers moved from one sleeve to the
other; silver or metallic numbers drawn white; brown, teal or royal turned black or navy.

## Result (2026-10-04)

- **191 jerseys live** (139 adult, 52 kids): ACTIVE and on the Online Store, ₪139 adults and ₪89 kids, sizes S–XL
  with 5 units each, English and Arabic titles, descriptions and SEO, the size option name in both languages.
- **37 adult ↔ kids pairs** linked both ways (`sportwear.counterpart`): a team, number and colour with one adult and
  one kids jersey, the same detail if any (`nfl-build.py`).
- **Collections** (35, smart, on the Online Store, MANUAL order): `nfl` (all NFL products: jerseys, then kids
  jerseys, then the hoodies), `nfl-jerseys`, `nfl-jerseys-kids`, and one page per team with the team slug as its
  handle (its jerseys, then its hoodies). The 4 teams with no jersey yet (Saints, Buccaneers, Titans, Commanders) show
  their hoodies until their jerseys come.
- **Menu:** a top-level "NFL" in place of "קפוצ׳ונים": "חולצות NFL" with the 32 teams (most popular first), "חולצות
  NFL לילדים", and "קפוצ׳ונים" with its men/women/kids items under it. "חולצות NFL לילדים" under "ילדים" too, and
  "חולצות NFL" in the footer's shop menu.
- **Home page** (on the development theme, for the owner to publish): an NFL row after the team cards, and the hoodies
  category tile leads to `nfl`.

## To finish: 17 held and 101 not rendered yet

The OpenAI credit ran out on 2026-10-04 while the renders were being made: 101 picks have no studio photo yet, and the
17 held ones need a new render. Once the owner adds credit (platform.openai.com → Billing):

1. Render the 101 (`nfl-photos.py studio`, then `scripts/images/studio.py`) and the 17 again with the `render_note`
   from `status.json`. `normalize.py`, then the QA above.
2. `nfl-build.py <studio dir> --only <list>` for the renders that pass, then create, check, activate and publish as in
   step 5. Remove the held files from `catalog/ready/` first and build them again: their images change.
3. Translations, counterparts (new pairs can include products already live), filter names, and
   `collection-order.py fetch` / `plan` / apply / `check`. Update `status.json`.

## Traps

- **Moving a menu item between levels drops its translations.** When "קפוצ׳ונים" moved under "NFL", it and its three
  children lost their English and Arabic titles; the clubs moved to "ליגות נוספות" on 2026-09-28 had lost theirs the
  same way. After any `menuUpdate`, read every LINK with `translatableResources(resourceType: LINK)` and register what
  is missing. Shopify also makes a new hidden child list (MENU resource, titled like its parent) for each item that
  gets children, and it needs its own translations.
- A GraphQL document is limited to 16,384 characters: pass long values (metafields, menus) as variables.
- `publicationUpdate` takes products only; collections go on the Online Store with `publishablePublish`.
