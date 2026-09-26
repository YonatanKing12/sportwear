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

### Rules

- Render only what the supplier photographed. Never invent a back view or a detail.
- A photo that shows several products together is not rendered; the product keeps its photo until
  there is a single-product photo.
- The demo product (tag `demo`) is not touched.
- If a render differs from the product in any detail a customer would notice, it does not go live.

History: 229 products got studio photos from an earlier process on 2026-09-26 (files named
`sw-studio-…-main-v1.png` and similar), in the same look; the remaining 870 were made with this pipeline
the same day.

## Home page photography

The hero slides (`sw-v3-s1/s2/s3`, with `-ltr` and `-mobile` versions), the category tiles
(`sw-v2-cat-*`) and the lifestyle gallery (`sw-v2-life-*`) show fictional people wearing jerseys the
store sells, generated with the product photos as references. They live in Content → Files and are
referenced as `shopify://shop_images/<file>` in `templates/index.json`; resized copies sit in
`scripts/preview/fixtures/images/` for the local preview. The first, darker set (`sw-*.jpg`, prompts in
`prompts.json`) is no longer used.

Rules for new atmosphere photos: fictional people only (no recognisable real people or players), jerseys
as they are sold (no added names, numbers or text), and never present them as customers. Team names and
crests appear as they do on the products; the lawyer question about branded jerseys covers these photos
too.
