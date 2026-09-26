# Atmosphere imagery

The home page photos (hero, category tiles, lifestyle gallery) are **AI-generated** with OpenAI's
`gpt-image-2` (2026-09-26). They set the mood; they are not product photos, and no product in the
store is shown in them. `prompts.json` records the file name, size and prompt of every image in use.

## Where they live

- In Shopify: **Content → Files**, named `sw-*.jpg`. The theme references them as
  `shopify://shop_images/<file>` in `templates/index.json`.
- In the repo: resized copies in `scripts/preview/fixtures/images/` so the local preview shows them.

| File | Used in |
| --- | --- |
| `sw-hero-fans.jpg` (3840 × 1280), `sw-hero-fans-mobile.jpg` | Hero (`layout: image`, mirrored in English) |
| `sw-cat-football.jpg`, `sw-cat-basketball.jpg`, `sw-cat-kids.jpg`, `sw-cat-teams.jpg` | Category tiles |
| `sw-life-stands.jpg`, `sw-life-streetball.jpg`, `sw-life-family.jpg`, `sw-life-tunnel.jpg` | Lifestyle gallery |

## Rules for new images

- **No logos, crests, sponsor text, numbers or letters**, and no real team kits. Team names and
  crests are trademarks, and AI cannot reproduce a real product faithfully.
- **No recognisable real people.** Only fictional people, or people seen from behind.
- Keep the house style: night, floodlights, deep blacks, a lime (`#C6FF3D`) accent light. Jerseys
  are plain: black with lime trim, white with black trim, sometimes red or royal blue.
- Never present these photos as products or as customers ("our customers", "real fans").
- Hero photos: the subject goes on the **left** and dark space on the right (Hebrew text sits on the
  right). The hero's "mirror in left-to-right languages" setting flips the photo for English.

## Generating

`python3 scripts/images/generate.py <jobs.json> <out_dir>` with `OPENAI_API_KEY` set in the
environment (the cloud environment's variables, never the repo or the chat). A job is
`{"name", "size", "prompt", "quality"}`; the script appends the house style and the rules above to
every prompt. Sizes must be multiples of 16 with a longest edge of at most 3840.
