# The owner's photos

38 lifestyle photos the owner uploaded on 2026-09-28 (night of 27 to 28 September). They show people wearing the
store's shirts around Israel: courts, parks, the beach promenade, cafés and steps. The owner said they can be used
anywhere on the site ("תמונות מעולות ואותנטיות שאפשר להשתמש בהן").

- The files were uploaded one by one to the repo root with long English names; they now live here under short
  names (`<teams>-<place>.png`). `index.json` keeps each file's original name, the teams it shows (collection
  handles), a one-line description and its size.
- Most are 1672×941 (16:9); three are wide 1942×809 (`knicks-courtside-wide`, `napoli-pitch-wide`,
  `roma-knicks-alley-wide`).
- Kits in them: Napoli (blue home), Roma (cream), Porto (home), Sporting CP (home), Torino (maroon home), New York
  Knicks 8 (white), Chicago Bulls 1 (red), Boston Celtics 7 (green) and Charlotte Hornets shorts (teal).

Where each photo is used on the site is listed in `index.json` (`used_on`) once it is placed.

## Where they are used (2026-09-28)

The kits in the photos are products the store sells, so the photos sell them directly:

- **Product galleries.** Nine products show 2-4 of the photos right after their studio front (and back) photo,
  as square crops with the alt text "<product> – צילום אווירה" (other languages get "lifestyle photo" through
  `snippets/media-alt.liquid`): Napoli home (`sw-football-250582309`), Roma away 26/27 (`sw-football-252374837`),
  Porto home, Sporting CP home, Torino home, Knicks 8 (`sw-jerseys-244984876`), Bulls 1 red (`sw-jerseys-96896163`),
  Celtics 7 green (`sw-jerseys-97381444`) and the Hornets retro shorts (`sw-shorts-162704069`).
- **Home page, "Shop the look"** (`sections/lifestyle-gallery.liquid`): nine 4:5 crops, each with a tag that shows
  the product, its price and a link.
- **Empty cart**: the Napoli fan on a bench by the court ("your cart's still on the bench").

The crops were made with Pillow from these originals (square 1200 px and 4:5 960×1200 px, centred on the person);
the centres are in `index.json` (`used_on`). Uploaded files are named `sw-look-<file>-sq.jpg` / `-45.jpg`.
