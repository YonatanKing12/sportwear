"""Builds product files (catalog/ready/sw-shorts-<album>.json) for the NBA shorts of the supplier xingkong-sports.

Usage: python3 scripts/catalog/xingkong-build.py <review.json> <work_dir> [--out catalog/ready]

review.json: the photo review, one row per album (scripts/catalog/xingkong-shorts.py, catalog/sources/xingkong-sports/):
  {"album", "usable", "team", "colour", "edition": "city" | "retro" | null, "front", "back", "details": [...],
   "pairs": [jersey handles], "title_extra": {"he", "en", "ar"}?}
work_dir holds the normalized studio photos (studio/norm/sw-shorts-<album>[__back].png) and the close-up crops
(details/sw-detail-shorts-<album>-<n>.jpg).

Writes one file per usable album in the shape of catalog/product.schema.json, in Hebrew with English and Arabic
translations. Titles follow the ten shorts imported before: "מכנסי כדורסל {team} {colour} [מהדורת עיר|רטרו] [year]",
where the year is the supplier's season label (25赛季 → 2025). The texts state only what the photos and the supplier
show: team, colour, City Edition or retro design, fan version (the supplier's category), sizes and the size chart.
Price from catalog/pricing.json; 5 units per size, as every product in the store. Tags come from
scripts/catalog/classify.mjs plus the import tags; paired shorts get set:shorts (the set price).
"""
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load = lambda p: json.load(open(os.path.join(ROOT, p)))  # noqa: E731
C = load('catalog/classification.json')
P = load('catalog/pricing.json')
SOURCE = {r['album']: r for r in load('catalog/sources/xingkong-sports/shorts.json')['albums']}
CHART = load('catalog/size-charts/xingkong-sports.json')['charts']['nba-shorts-fan']

CODES = {
    'los-angeles-lakers': 'LAL', 'golden-state-warriors': 'GSW', 'los-angeles-clippers': 'LAC',
    'charlotte-hornets': 'CHA', 'memphis-grizzlies': 'MEM', 'miami-heat': 'MIA', 'minnesota-timberwolves': 'MIN',
    'utah-jazz': 'UTA', 'cleveland-cavaliers': 'CLE', 'chicago-bulls': 'CHI', 'denver-nuggets': 'DEN',
    'brooklyn-nets': 'BKN', 'indiana-pacers': 'IND', 'boston-celtics': 'BOS', 'dallas-mavericks': 'DAL',
    'phoenix-suns': 'PHX', 'sacramento-kings': 'SAC', 'orlando-magic': 'ORL', 'philadelphia-76ers': 'PHI',
    'washington-wizards': 'WAS', 'new-york-knicks': 'NYK', 'oklahoma-city-thunder': 'OKC',
}
# Colour words as the store's titles and their translations use them (catalog/translations/older-products.json).
COLOURS = {
    'white': ('לבן', 'White', 'أبيض'), 'black': ('שחור', 'Black', 'أسود'), 'blue': ('כחול', 'Blue', 'أزرق'),
    'navy': ('כחול כהה', 'Dark Blue', 'أزرق داكن'), 'purple': ('סגול', 'Purple', 'بنفسجي'),
    'yellow': ('צהוב', 'Yellow', 'أصفر'), 'red': ('אדום', 'Red', 'أحمر'), 'green': ('ירוק', 'Green', 'أخضر'),
    'grey': ('אפור', 'Grey', 'رمادي'), 'orange': ('כתום', 'Orange', 'برتقالي'), 'beige': ('בז׳', 'Beige', 'بيج'),
    'gold': ('זהב', 'Gold', 'ذهبي'), 'teal': ('טורקיז', 'Turquoise', 'فيروزي'),
    'burgundy': ('בורדו', 'Burgundy', 'عنابي'), 'light-blue': ('תכלת', 'Light Blue', 'سماوي'),
    'gradient': ('צבע מדורג', 'Gradient', 'بلون متدرج'),
}
EDITION = {'city': ('מהדורת עיר', 'City Edition', 'إصدار المدينة'), 'retro': ('רטרו', 'Retro', 'ريترو')}
SIZES = ['S', 'M', 'L', 'XL']


def price():
    for rule in P['rules']:
        if rule['product_type'] == 'Basketball Shorts' and rule['audience'] == 'adult' and rule.get('price') is not None:
            return rule['price']
    raise SystemExit('No price for Basketball Shorts / adult in catalog/pricing.json')


def texts(team, colour, edition, year, extra):
    he_c, en_c, ar_c = COLOURS[colour]
    ed = EDITION.get(edition)
    he = ['מכנסי כדורסל', team['he'], he_c]
    ar = ['شورت كرة سلة', team['ar'], ar_c]
    en_parts = [en_c]
    if extra:
        he.append(extra['he'])
        ar.append(extra['ar'])
        en_parts.append(extra['en'])
    if ed:
        he.append(ed[0])
        ar.append(ed[2])
    if edition == 'city':
        en_parts.append(f"{ed[1]} {year}" if year else ed[1])
    else:
        if ed:
            en_parts.append(ed[1])
        if year:
            en_parts.append(str(year))
    if year:
        he.append(str(year))
        ar.append(str(year))
    title = {'he': ' '.join(he), 'en': f"{team['en']} Basketball Shorts – {', '.join(en_parts)}", 'ar': ' '.join(ar)}

    ed_phrase = {
        'city': (' במהדורת העיר', ', City Edition', ' من إصدار المدينة'),
        'retro': (' בעיצוב רטרו', ', retro design', ' بتصميم ريترو'),
    }.get(edition, ('', '', ''))
    # "in white" / "בצבע לבן" / "باللون الأبيض" (with the article, "الأزرق الداكن" for the two-word colour);
    # a gradient design reads "in a colour gradient".
    if colour == 'gradient':
        in_colour = ('בצבע מדורג', 'in a colour gradient', 'بلون متدرج')
    else:
        in_colour = (f'בצבע {he_c}', f'in {en_c.lower()}', 'باللون ' + ' '.join('ال' + w for w in ar_c.split()))
    desc = {
        'he': f"<p>מכנסי הכדורסל של {team['he']}{ed_phrase[0]}, {in_colour[0]}, בגרסת אוהד.</p>"
              '<ul><li>גרסת אוהד</li><li>מידות S עד XL. טבלת המידות מופיעה בעמוד</li></ul>',
        'en': f"<p>{team['en']} basketball shorts{ed_phrase[1]}, {in_colour[1]}, fan version.</p>"
              '<ul><li>Fan version</li><li>Sizes S to XL; the size chart is on this page</li></ul>',
        'ar': f"<p>شورت كرة السلة لفريق {team['ar']}{ed_phrase[2]}، {in_colour[2]}، نسخة المشجعين.</p>"
              '<ul><li>نسخة المشجعين</li><li>المقاسات من S إلى XL، وجدول المقاسات في هذه الصفحة</li></ul>',
    }
    seo = {
        'he': f"מכנסי הכדורסל של {team['he']}{ed_phrase[0]}, {in_colour[0]}, בגרסת אוהד, במידות S עד XL.",
        'en': f"{team['en']} basketball shorts{ed_phrase[1]}, {in_colour[1]}, fan version, sizes S to XL.",
        'ar': f"شورت كرة السلة لفريق {team['ar']}{ed_phrase[2]}، {in_colour[2]}، نسخة المشجعين، بمقاسات من S إلى XL.",
    }
    return title, desc, {lang: seo_title(t, lang) for lang, t in title.items()}, seo


# Search titles stay within 60 characters. A long title first drops "basketball" ("Warriors Shorts – Black, City
# Edition 2024"); only then is it cut at a word, never ending on a dangling word or mark.
SHORTER = {'he': ('מכנסי כדורסל', 'מכנסי'), 'en': ('Basketball Shorts', 'Shorts'), 'ar': ('شورت كرة سلة', 'شورت')}
DANGLING = {'עם', 'של', 'על', 'with', 'on', 'of', 'and', 'على', 'مع', 'في', 'من', '–', '-', ','}


def seo_title(t, lang):
    if len(t) + len(' | SportWear') <= 60:
        return f'{t} | SportWear'
    if len(t) <= 60:
        return t
    shorter = t.replace(*SHORTER[lang], 1)
    if len(shorter) <= 60:
        return shorter
    words = shorter[:61].rsplit(' ', 1)[0].split(' ')
    while words and words[-1] in DANGLING:
        words.pop()
    return ' '.join(words).rstrip(',–- ')


def classify_tags(records):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'products.jsonl')
        with open(src, 'w') as fh:
            for i, r in enumerate(records):
                fh.write(json.dumps({'id': f'gid://shopify/Product/new-{i}', 'handle': r['handle'], 'title': r['title'],
                                     'productType': 'Basketball Shorts', 'tags': r['base_tags']}, ensure_ascii=False) + '\n')
        plan = os.path.join(tmp, 'plan.json')
        subprocess.run(['node', os.path.join(ROOT, 'scripts/catalog/classify.mjs'), src, '--out', plan],
                       check=True, capture_output=True, text=True)
        data = json.load(open(plan))
    result = {row['handle']: {'add': row.get('add', []), 'remove': row.get('remove', [])} for row in data.get('changes', [])}
    for row in data.get('unclassified', []):
        result.setdefault(row['handle'], {'add': [], 'remove': []})['unclassified'] = row.get('missing')
    return result


def main():
    review = json.load(open(sys.argv[1]))
    work = sys.argv[2]
    out_dir = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'catalog/ready')
    os.makedirs(out_dir, exist_ok=True)
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    unit_price = price()
    records = []
    for row in review:
        if not row.get('usable'):
            continue
        album = row['album']
        handle = f'sw-shorts-{album}'
        team_slug = row['team']
        team = C['teams'][team_slug]
        year = SOURCE[album].get('season_year')
        edition = row.get('edition')
        title, desc, seo_title, seo_desc = texts(team, row['colour'], edition, year, row.get('title_extra'))
        front = os.path.join(work, 'studio', 'norm', handle + '.png')
        back = os.path.join(work, 'studio', 'norm', handle + '__back.png')
        if not os.path.exists(front):
            print('no studio front photo, skipped:', album)
            continue
        images = [{'url': 'file://' + front, 'alt_he': title['he'], 'view': 'front'}]
        if os.path.exists(back):
            images.append({'url': 'file://' + back, 'alt_he': f"{title['he']} (גב)", 'view': 'back'})
        for n in range(1, 3):
            detail = os.path.join(work, 'details', f'sw-detail-shorts-{album}-{n}.jpg')
            if os.path.exists(detail):
                images.append({'url': 'file://' + detail, 'alt_he': f"{title['he']} (תקריב של הבד וההדפס)", 'view': 'detail'})
        kit_code = 'S' if edition in ('city', 'retro') else ('H' if row['colour'] == 'white' else 'A')
        variants = [{'size': s, 'source_size_label': s,
                     'sku': f"SW-BS-{CODES[team_slug]}-{kit_code}-{year or '0000'}-A-{album}-{s}",
                     'barcode': None, 'price': unit_price, 'compare_at_price': None, 'quantity': 5,
                     'available_at_source': True} for s in SIZES]
        base_tags = ['sport:basketball', f'team:{team_slug}', 'league:nba', 'audience:adult', 'new',
                     'source:xingkong-sports', f'album:{album}', 'import:2026-09-27']
        if row.get('pairs'):
            base_tags.append('set:shorts')
        records.append({
            'handle': handle, 'status': 'ready', 'sport': 'basketball', 'product_type': 'Basketball Shorts',
            'audience': 'adult', 'size_chart': CHART['metaobject_handle'],
            'team': {'slug': team_slug, 'code': CODES[team_slug], 'he': team['he'], 'en': team['en'], 'ar': team['ar']},
            'leagues': ['nba'], 'kit': None, 'season': str(year) if year else None, 'vendor': 'SportWear',
            'title': title['he'], 'title_he': title['he'], 'description_html_he': desc['he'],
            'seo': {'title_he': seo_title['he'], 'description_he': seo_desc['he']},
            'base_tags': base_tags, 'variants': variants, 'images': images,
            'relations': {'counterpart_handle': None, 'complements_handles': row.get('pairs', [])},
            'translations': {lang: {'title': title[lang], 'description_html': desc[lang], 'seo_title': seo_title[lang],
                                    'seo_description': seo_desc[lang]} for lang in ('en', 'ar')},
            'source': {'url': f'https://xingkong-sports.x.yupoo.com/albums/{album}?uid=1', 'fetched_at': now,
                       'original_title': SOURCE[album]['title'], 'reference_price': None, 'image_rights_confirmed': True,
                       'image_rights_note': ("Studio photos and close-ups made from the supplier's own album photos; the owner "
                                             "asked to import this supplier's shorts on 2026-09-27.")},
            'questions': [],
        })
    tag_plan = classify_tags([{'handle': r['handle'], 'title': r['title_he'], 'base_tags': r['base_tags']} for r in records])
    titles = {}
    for r in records:
        plan = tag_plan.get(r['handle'], {})
        tags = [t for t in r.pop('base_tags') if t not in plan.get('remove', [])]
        for t in plan.get('add', []):
            if t not in tags:
                tags.append(t)
        r['tags'] = tags
        if plan.get('unclassified'):
            r['questions'].append(f"classify.mjs could not classify it: {plan['unclassified']}")
        r.pop('title')
        titles.setdefault(r['title_he'], []).append(r['handle'])
        with open(os.path.join(out_dir, r['handle'] + '.json'), 'w') as fh:
            json.dump(r, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
    dupes = {t: h for t, h in titles.items() if len(h) > 1}
    print(len(records), 'files in', out_dir)
    if dupes:
        print('DUPLICATE TITLES (add title_extra in the review):', json.dumps(dupes, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
