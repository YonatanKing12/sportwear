"""Product files for the NFL jerseys picked from the supplier nfl-cyq888 (catalog/sources/nfl-cyq888/README.md).

Usage: python3 scripts/catalog/nfl-build.py <work_dir> [--only <handles.json>]
--only: build just these render handles (the ones whose photos passed QA); the counterpart is kept only when
the other product is built too.
Reads <work_dir>/picks.json (the reviewed selection: team, audience, number, colour, player, album, photo, style) and
<work_dir>/studio/norm/<render>.png (+ __back.png), and writes catalog/ready/<handle>.json in the catalog format
(texts in he/en/ar, tags, variants S–XL, 5 per size, prices from catalog/pricing.json, the adult ↔ kids counterpart).
Names come from catalog/taxonomy.json (teams, players) and the colour table below."""
import json, os, re, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.abspath(sys.argv[1])
TAX = json.load(open(os.path.join(ROOT, 'catalog/taxonomy.json')))
CLS = json.load(open(os.path.join(ROOT, 'catalog/classification.json')))
PRICES = {(r['product_type'], r['audience']): r['price'] for r in json.load(open(os.path.join(ROOT, 'catalog/pricing.json')))['rules']}
SIZES = ['S', 'M', 'L', 'XL']
# colour token from the review -> (he, en, ar adjective, ar with article, SKU code, handle slug)
COLORS = {
    'white': ('לבן', 'White', 'أبيض', 'الأبيض', 'WHT', 'white'), 'navy': ('כחול כהה', 'Navy', 'كحلي', 'الكحلي', 'NVY', 'navy'),
    'black': ('שחור', 'Black', 'أسود', 'الأسود', 'BLK', 'black'), 'royal-blue': ('כחול', 'Blue', 'أزرق', 'الأزرق', 'BLU', 'blue'),
    'green': ('ירוק', 'Green', 'أخضر', 'الأخضر', 'GRN', 'green'), 'teal': ('טורקיז', 'Aqua', 'فيروزي', 'الفيروزي', 'AQU', 'aqua'),
    'grey': ('אפור', 'Grey', 'رمادي', 'الرمادي', 'GRY', 'grey'), 'red': ('אדום', 'Red', 'أحمر', 'الأحمر', 'RED', 'red'),
    'gold': ('זהב', 'Gold', 'ذهبي', 'الذهبي', 'GLD', 'gold'), 'orange': ('כתום', 'Orange', 'برتقالي', 'البرتقالي', 'ORG', 'orange'),
    'powder-blue': ('תכלת', 'Powder Blue', 'أزرق فاتح', 'الأزرق الفاتح', 'PBL', 'powder-blue'),
    'light-blue': ('תכלת', 'Light Blue', 'أزرق فاتح', 'الأزرق الفاتح', 'LBL', 'light-blue'),
    'purple': ('סגול', 'Purple', 'بنفسجي', 'البنفسجي', 'PUR', 'purple'), 'brown': ('חום', 'Brown', 'بني', 'البني', 'BRN', 'brown'),
    'maroon': ('בורדו', 'Burgundy', 'عنابي', 'العنابي', 'BUR', 'burgundy'), 'yellow': ('צהוב', 'Yellow', 'أصفر', 'الأصفر', 'YLW', 'yellow'),
}
COLOR_OVERRIDES = {
    ('philadelphia-eagles', 'teal'): ('ירוק כהה', 'Midnight Green', 'أخضر داكن', 'الأخضر الداكن', 'MGR', 'midnight-green'),
    ('seattle-seahawks', 'green'): ('ירוק זוהר', 'Neon Green', 'أخضر نيون', 'الأخضر النيون', 'NEO', 'neon-green'),
}
# Two picks share team + number + colour with another: the title gets a " | detail" (he, en, ar, handle/SKU part)
DETAILS = {
    ('adult', 'dallas-cowboys', '88', 'white', '29'): ('שרוולים כחולים', 'Navy Sleeves', 'أكمام كحلية', 'navy-sleeves', 'NS'),
    ('adult', 'minnesota-vikings', '18', 'purple', '33'): ('מספרים בזהב', 'Gold Numbers', 'أرقام ذهبية', 'gold-numbers', 'GN'),
}


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower().replace("'", '').replace('.', '')).strip('-')


def render_handle(p):
    return f"{p['team']}-{p['number']}-{p['color']}-{p['album']}-{p['photo']}" + ('-kids' if p['audience'] == 'kids' else '')


def keywords(product_type, audience, team, player, retro):
    kw = []
    kw += CLS['product_types'][product_type]['keywords']
    kw += CLS['audiences'][audience].get('keywords', [])
    kw += CLS['teams'][team]['keywords']
    kw += CLS['leagues']['nfl']['keywords']
    kw += CLS['players'][player]['keywords']
    if retro:
        kw += CLS['styles']['retro']['keywords']
    return kw


def build(p, counterpart):
    kids = p['audience'] == 'kids'
    team = TAX['teams']['american-football:' + p['team']]
    pslug = slug(p['player_full'])
    pl = TAX['players'][pslug]
    he_c, en_c, ar_c, ar_cdef, ccode, cslug = COLOR_OVERRIDES.get((p['team'], p['color'])) or COLORS[p['color']]
    retro = p.get('style_guess') == 'throwback'
    det = DETAILS.get((p['audience'], p['team'], p['number'], p['color'], p['photo']))
    num, name = p['number'], (p.get('name_on_back') or '').strip()
    handle = f"{p['team']}-{pslug}-{num}-{cslug}" + ('-throwback' if retro else '') + (f'-{det[3]}' if det else '') + '-jersey' + ('-kids' if kids else '')
    he = f"חולצת פוטבול {team['he']} מספר {num} {he_c}" + (' רטרו' if retro else '') + (f' | {det[0]}' if det else '') + (' – ילדים' if kids else '')
    en = f"{team['en']} #{num} NFL Jersey – {en_c}" + (' Throwback' if retro else '') + (f' | {det[1]}' if det else '') + (' – Kids' if kids else '')
    ar = f"قميص كرة القدم الأمريكية {team['ar']} رقم {num} {ar_c}" + (' ريترو' if retro else '') + (f' | {det[2]}' if det else '') + (' – أطفال' if kids else '')
    sizes_he, sizes_en, sizes_ar = (('מידות ילדים S עד XL', 'Kids sizes S to XL', 'مقاسات الأطفال من S إلى XL') if kids
                                    else ('מידות S עד XL', 'Sizes S to XL', 'المقاسات من S إلى XL'))
    desc_he = (f"<p>חולצת פוטבול של {team['he']} בצבע {he_c}" + (', בעיצוב רטרו' if retro else '') +
               f", עם השם {name} והמספר {num} על הגב ({pl['he']}).</p><ul><li>שרוול קצר</li><li>{sizes_he}</li></ul>")
    desc_en = (f"<p>{team['en']} NFL jersey in {en_c.lower()}" + (', throwback design' if retro else '') +
               f", with the name {name} and the number {num} on the back ({pl['en']}).</p><ul><li>Short sleeves</li><li>{sizes_en}</li></ul>")
    desc_ar = (f"<p>قميص كرة القدم الأمريكية لفريق {team['ar']} باللون {ar_cdef}" + ('، بتصميم ريترو' if retro else '') +
               f"، مع الاسم {name} والرقم {num} على الظهر ({pl['ar']}).</p><ul><li>أكمام قصيرة</li><li>{sizes_ar}</li></ul>")
    seo_he = f"חולצת פוטבול של {team['he']} בצבע {he_c}, עם {name} {num} על הגב, ב{sizes_he}."
    seo_en = f"{team['en']} NFL jersey in {en_c.lower()}, {name} {num} on the back, {sizes_en[0].lower() + sizes_en[1:]}."
    seo_ar = f"قميص كرة القدم الأمريكية لفريق {team['ar']} باللون {ar_cdef}، {name} {num} على الظهر، {sizes_ar}."
    # Arabic titles run long: the search-result title says "NFL" instead of "كرة القدم الأمريكية" (60 characters at most)
    seo_title_ar = ar if len(ar) <= 60 else ar.replace('قميص كرة القدم الأمريكية', 'قميص NFL', 1)
    if len(seo_title_ar) > 60:
        seo_title_ar = seo_title_ar.replace(' رقم ', ' ', 1)
    audience = p['audience']
    tags = ['sport:american-football', f"team:{p['team']}", 'league:nfl', f'audience:{audience}', f'player:{pslug}', pl['he']]
    if retro:
        tags.append('style:retro')
    tags += ['new', 'source:nfl-cyq888', f"album:{p['album']}", 'import:2026-10-04']
    seen = {t.lower().replace(' ', '-') for t in tags}
    for k in keywords('NFL Jersey', audience, p['team'], pslug, retro):
        key = k.lower().replace(' ', '-')
        if key not in seen:
            seen.add(key); tags.append(k)
    price = PRICES[('NFL Jersey', audience)]
    assert price, 'no price rule'
    sku_base = f"SW-NJ-{team['code']}-{num}-{ccode}" + ('-T' if retro else '') + (f'-{det[4]}' if det else '') + ('-K' if kids else '-A')
    rh = render_handle(p)
    norm = os.path.join(WORK, 'studio', 'norm')
    images = [{'url': 'file://' + os.path.join(norm, rh + '.png'), 'alt_he': he, 'view': 'front'},
              {'url': 'file://' + os.path.join(norm, rh + '__back.png'), 'alt_he': he + ' (גב)', 'view': 'back'}]
    front_photo = p.get('front_photo') or p['photo']
    back_photo = p.get('back_photo') or p['photo']
    return {
        'handle': handle, 'status': 'ready', 'sport': 'american-football', 'product_type': 'NFL Jersey', 'audience': audience,
        'size_chart': None, 'team': {'slug': p['team'], 'code': team['code'], 'he': team['he'], 'en': team['en'], 'ar': team['ar']},
        'leagues': ['nfl'], 'kit': None, 'season': None, 'vendor': 'SportWear',
        'player': {'slug': pslug, 'name_on_back': name, **pl},
        'title_he': he, 'description_html_he': desc_he, 'seo': {'title_he': he, 'description_he': seo_he},
        'variants': [{'size': s, 'source_size_label': s, 'sku': f'{sku_base}-{s}', 'barcode': None, 'price': price,
                      'compare_at_price': None, 'quantity': 5, 'available_at_source': True} for s in SIZES],
        'images': images,
        'relations': {'counterpart_handle': counterpart, 'complements_handles': []},
        'translations': {'en': {'title': en, 'description_html': desc_en, 'seo_title': en, 'seo_description': seo_en},
                         'ar': {'title': ar, 'description_html': desc_ar, 'seo_title': seo_title_ar, 'seo_description': seo_ar}},
        'source': {'url': f"https://nfl-cyq888.x.yupoo.com/albums/{p['album']}?uid=1",
                   'fetched_at': '2026-10-04T00:00:00Z', 'original_title': p.get('album_title'),
                   'photos': {'front': f"{p['album']}/{front_photo}", 'back': f"{p['album']}/{back_photo}"},
                   'reference_price': None, 'image_rights_confirmed': True,
                   'image_rights_note': "Studio photos made from the supplier's own album photos (front and back of the same jersey); the owner asked to import from this catalog (2026-10-04)."},
        'questions': [], 'tags': tags, 'review': {'style_guess': p.get('style_guess'), 'variant': p.get('variant'), 'render': rh},
    }


if __name__ == '__main__':
    picks = json.load(open(os.path.join(WORK, 'picks.json')))
    if '--only' in sys.argv:
        only = set(json.load(open(sys.argv[sys.argv.index('--only') + 1])))
        picks = [p for p in picks if render_handle(p) in only]
    albums = {a['album']: a['title'] for a in json.load(open(os.path.join(WORK, 'albums.json')))}
    for p in picks:
        p['album_title'] = albums.get(p['album'])
    # handles first, then counterparts (same team, number, colour, style and detail in both audiences: an adult
    # version with a detail, such as the Vikings' gold numbers, is not the kids jersey's counterpart)
    built = [build(p, None) for p in picks]
    detail = lambda p: (DETAILS.get((p['audience'], p['team'], p['number'], p['color'], p['photo'])) or [None] * 5)[4]
    key = lambda p: (p['team'], p['number'], p['color'], p.get('style_guess') == 'throwback', detail(p))
    by = {}
    for p, b in zip(picks, built):
        by.setdefault(key(p), {}).setdefault(p['audience'], []).append(b['handle'])
    out_dir = os.path.join(ROOT, 'catalog', 'ready')
    os.makedirs(out_dir, exist_ok=True)
    handles = set()
    for p, b in zip(picks, built):
        other = 'kids' if p['audience'] == 'adult' else 'adult'
        mine, theirs = by[key(p)].get(p['audience'], []), by[key(p)].get(other, [])
        b['relations']['counterpart_handle'] = theirs[0] if len(mine) == 1 and len(theirs) == 1 else None
        assert b['handle'] not in handles, b['handle']
        handles.add(b['handle'])
        for img in b['images']:
            assert os.path.exists(img['url'].removeprefix('file://')), img['url']
        json.dump(b, open(os.path.join(out_dir, b['handle'] + '.json'), 'w'), ensure_ascii=False, indent=2)
    pairs = sum(1 for b in built if b['relations']['counterpart_handle']) // 2
    print(len(built), 'product files,', pairs, 'adult/kids pairs')
