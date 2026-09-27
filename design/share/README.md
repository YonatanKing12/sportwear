# Share image (link previews)

What WhatsApp, Facebook, Telegram and iMessage show when someone shares a link to the store: the SW
logo, the tagline and three shirts from the store (Barcelona home 26/27, Lakers #23 gold, Real Madrid
home 26/27) on the Night Match background, with the lime accent.

| File | Language | Alt text (in Content → Files) |
| --- | --- | --- |
| `sw-share-he.jpg` | Hebrew | SportWear – חולצות כדורגל וגופיות כדורסל |
| `sw-share-en.jpg` | English | SportWear – football and basketball jerseys |
| `sw-share-ar.jpg` | Arabic | SportWear – قمصان كرة القدم وكرة السلة |

- **Size:** 1200 × 630 JPEG, about 75 KB each (WhatsApp skips large images).
- **Crop band:** WhatsApp shows the image about 3:1, cropping about 115 px from the top and the bottom.
  The logo and the text stay inside the middle 1200 × 400 band; only the shirts reach beyond it.
- **Where the theme uses it:** `snippets/meta-tags.liquid` takes the page's own image first (a product,
  a collection, an article, or the image set in Online Store → Preferences), then the theme's "Share
  image" setting, then `sw-share-<language>.jpg` from Content → Files (Hebrew when a language has none).
  `og:image:alt` is the file's alt text.
- **Caches:** WhatsApp and Facebook keep a link's preview for a while. A link shared before the change
  may still show the old picture; a new share (or Facebook's Sharing Debugger, "Scrape again") picks up
  the new one.

## Making it again

1. Cut the shirts out of their studio photos (flat #F4F4F4, see `design/imagery/README.md`):

   ```bash
   python3 scripts/images/cutout.py qa-output/share/cutouts \
     barca="https://cdn.shopify.com/s/files/1/0999/6746/7824/files/barcelona-home-jersey-2026-27.png?width=1000" \
     lakers23="https://cdn.shopify.com/s/files/1/0999/6746/7824/files/sw-studio-jerseys-106048308.png?width=1000"
   python3 scripts/images/cutout.py --thresh 4 qa-output/share/cutouts \
     realmadrid="https://cdn.shopify.com/s/files/1/0999/6746/7824/files/real-madrid-home-jersey-2026-27.png?width=1000"
   ```

   Use `--thresh 4` for white shirts, so their edges are not taken for background.
2. `node scripts/images/share-image.mjs` renders the three JPEGs into this folder with the theme's own
   fonts (`assets/font-*.woff2`) and logo (`design/logo/sw-mark-white.svg`).
3. Look at each one, then upload: `stagedUploadsCreate` (resource `IMAGE`, PUT), then `fileCreate` with
   the same filename and the alt text above. Replacing an existing file needs
   `duplicateResolutionMode: REPLACE`.
