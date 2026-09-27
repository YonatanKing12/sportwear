"""Builds product files (catalog/ready/<handle>.json) for products picked from the jerseyxie wave.

Usage: python3 scripts/catalog/jerseyxie-build.py <picks.json> [--out catalog/ready]

picks.json: [{"id": "<wave row id>", "handle", "album", "images": {"front": "<png>", "back": "<png>", "details": ["<jpg>"]}}]
(the wave row gives the team, kit, season and audience; images are the normalized studio photos).

Writes one file per product in the shape of catalog/product.schema.json, in Hebrew with English and
Arabic translations, from catalog/classification.json (team names), catalog/taxonomy.json (kits, team
codes), catalog/pricing.json and the size charts in catalog/store-setup.json. Titles and texts follow
the catalog skill; nothing is invented: the texts state only the team, kit, season, fan version, the
set's pieces and the sizes. Tags come from scripts/catalog/classify.mjs, as for the rest of the store.
"""
import json, os, subprocess, sys, tempfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load = lambda p: json.load(open(os.path.join(ROOT, p)))
C = load('catalog/classification.json')
T = load('catalog/taxonomy.json')
P = load('catalog/pricing.json')
S = load('catalog/store-setup.json')
W = {r['id']: r for wave in ('wave1', 'wave2') if os.path.exists(os.path.join(ROOT, f'catalog/sources/jerseyxie/{wave}.json'))
     for r in load(f'catalog/sources/jerseyxie/{wave}.json')['products']}

picks = json.load(open(sys.argv[1]))
out_dir = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'catalog/ready')
os.makedirs(out_dir, exist_ok=True)

CODES = {
    'real-madrid': 'RMA', 'barcelona': 'BAR', 'manchester-united': 'MUN', 'manchester-city': 'MCI', 'arsenal': 'ARS',
    'chelsea': 'CHE', 'tottenham-hotspur': 'TOT', 'bayern-munich': 'BAY', 'borussia-dortmund': 'BVB',
    'paris-saint-germain': 'PSG', 'ac-milan': 'MIL', 'inter-milan': 'INT', 'as-roma': 'ROM', 'napoli': 'NAP',
    'atletico-madrid': 'ATM', 'inter-miami': 'MIA', 'al-nassr': 'NAS', 'spain': 'ESP', 'brazil': 'BRA',
    'germany': 'GER', 'portugal': 'POR', 'argentina': 'ARG', 'england': 'ENG', 'france': 'FRA', 'netherlands': 'NED',
    'italy': 'ITA', 'morocco': 'MAR', 'belgium': 'BEL', 'croatia': 'CRO', 'israel': 'ISR', 'maccabi-haifa': 'MHA',
    'hapoel-petah-tikva': 'HPT', 'hapoel-tel-aviv': 'HTA',
}
KIT = T['kits']
# "the home shirt" etc. in the sentence texts
KIT_PHRASE = {
    'he': {'home': 'חולצת הבית', 'away': 'חולצת החוץ', 'third': 'החולצה השלישית'},
    'en': {'home': 'home', 'away': 'away', 'third': 'third'},
    'ar': {'home': 'الأساسي', 'away': 'الاحتياطي', 'third': 'الثالث'},
}
SIZES = {'adult': ['S', 'M', 'L', 'XL'], 'kids': ['16', '18', '20', '22', '24', '26', '28']}
CHART = {'adult': 'jerseyxie-football-adult-fan', 'kids': 'jerseyxie-football-kids-set'}
SEASON_CODE = {'26/27': '2627', '2026': '2026'}


def price_for(product_type, audience):
    for rule in P['rules']:
        if rule['product_type'] == product_type and rule['audience'] == audience and rule.get('price') is not None:
            return rule['price']
    raise SystemExit(f'No price in catalog/pricing.json for {product_type} / {audience}')


def texts(team, kit, season, audience, national):
    he_team, en_team, ar_team = team['he'], team['en'], team['ar']
    k = KIT[kit]
    if audience == 'adult':
        title = {
            'he': f"{k['he_football']} {he_team} {season}",
            'en': f"{en_team} {k['en']} Jersey {season}",
            'ar': f"قميص {ar_team} {k['ar']} {season}",
        }
    else:
        title = {
            'he': f"{k['he_football']} ומכנס {he_team} {season} – ילדים",
            'en': f"{en_team} {k['en']} Kit {season} – Kids",
            'ar': f"طقم {ar_team} {k['ar']} {season} – أطفال",
        }
    when = {
        'he': f'ל-{season}' if national else f'לעונת {season}',
        'en': f'for {season}' if national else f'for the {season} season',
        'ar': f'لعام {season}' if national else f'لموسم {season}',
    }
    ar_of = f'ل{ar_team}' if national else f'لنادي {ar_team}'
    kp = {lang: KIT_PHRASE[lang][kit] for lang in KIT_PHRASE}
    if audience == 'adult':
        desc = {
            'he': f"<p>{kp['he']} של {he_team} {when['he']}, בגרסת אוהד.</p>"
            "<ul><li>גרסת אוהד בגזרה נוחה, שרוול קצר</li><li>מידות S עד XL. טבלת המידות מופיעה בעמוד</li></ul>",
            'en': f"<p>The {en_team} {kp['en']} jersey {when['en']}, fan version.</p>"
            '<ul><li>Fan version with a comfortable fit, short sleeves</li><li>Sizes S to XL; the size chart is on this page</li></ul>',
            'ar': f"<p>القميص {kp['ar']} {ar_of} {when['ar']}، نسخة المشجعين.</p>"
            '<ul><li>نسخة المشجعين بقصّة مريحة وأكمام قصيرة</li><li>المقاسات من S إلى XL، وجدول المقاسات في هذه الصفحة</li></ul>',
        }
        seo = {
            'he': f"{kp['he']} של {he_team} {when['he']} בגרסת אוהד, במידות S עד XL.",
            'en': f"The {en_team} {kp['en']} jersey {when['en']}, fan version, sizes S to XL.",
            'ar': f"القميص {kp['ar']} {ar_of} {when['ar']}، نسخة المشجعين، بمقاسات من S إلى XL.",
        }
    else:
        desc = {
            'he': f"<p>{kp['he']} של {he_team} לילדים {when['he']}, בסט עם המכנס התואם.</p>"
            '<ul><li>סט של חולצה ומכנס, גרסת אוהד</li><li>מידות 16 עד 28 (גיל 2 עד 13). טבלת המידות מופיעה בעמוד</li></ul>',
            'en': f"<p>The {en_team} {kp['en']} kit for kids ({season if national else season + ' season'}): the jersey with its matching shorts.</p>"
            '<ul><li>A set of a jersey and shorts, fan version</li><li>Sizes 16 to 28 (ages 2 to 13); the size chart is on this page</li></ul>',
            'ar': f"<p>الطقم {kp['ar']} {ar_of} للأطفال {when['ar']}: القميص مع الشورت المطابق.</p>"
            '<ul><li>طقم من قميص وشورت، نسخة المشجعين</li><li>المقاسات من 16 إلى 28 (من عمر 2 إلى 13 سنة)، وجدول المقاسات في هذه الصفحة</li></ul>',
        }
        seo = {
            'he': f"{kp['he']} והמכנס של {he_team} לילדים {when['he']}, במידות 16 עד 28.",
            'en': f"The {en_team} {kp['en']} kit for kids ({season if national else season + ' season'}): jersey and shorts, sizes 16 to 28.",
            'ar': f"الطقم {kp['ar']} {ar_of} للأطفال {when['ar']}: قميص وشورت، بمقاسات من 16 إلى 28.",
        }
    seo_title = {lang: seo_title_for(t) for lang, t in title.items()}
    return title, desc, seo_title, seo


def seo_title_for(t):
    """Search titles stay within 60 characters: the title plus " | SportWear" when it fits, else the title (cut at
    a word when longer than 60)."""
    if len(t) + len(' | SportWear') <= 60:
        return f'{t} | SportWear'
    return t if len(t) <= 60 else t[:61].rsplit(' ', 1)[0].rstrip(',–- ')


def classify_tags(records):
    """Runs classify.mjs on the new products and returns {handle: [tags to add]}."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'products.jsonl')
        with open(src, 'w') as fh:
            for i, r in enumerate(records):
                fh.write(json.dumps({'id': f'gid://shopify/Product/new-{i}', 'handle': r['handle'], 'title': r['title'],
                                     'productType': r['product_type'], 'tags': r['base_tags']}, ensure_ascii=False) + '\n')
        plan = os.path.join(tmp, 'plan.json')
        subprocess.run(['node', os.path.join(ROOT, 'scripts/catalog/classify.mjs'), src, '--out', plan],
                       check=True, capture_output=True, text=True)
        data = json.load(open(plan))
    result = {row['handle']: {'add': row.get('add', []), 'remove': row.get('remove', [])} for row in data.get('changes', [])}
    for row in data.get('unclassified', []):
        result.setdefault(row['handle'], {'add': [], 'remove': []})['unclassified'] = row.get('missing')
    return result, data


now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
records = []
for pick in picks:
    row = W[pick['id']]
    team_slug, kit, season, audience = row['team'], row['kit'], row['season'], row['audience']
    team = C['teams'][team_slug]
    national = team.get('league') == 'national-teams'
    product_type = 'Football Jersey' if audience == 'adult' else 'Football Kit'
    title, desc, seo_title, seo_desc = texts(team, kit, season, audience, national)
    price = price_for(product_type, audience)
    code = CODES.get(team_slug) or T['teams'][f'football:{team_slug}']['code']
    type_code = 'FJ' if audience == 'adult' else 'FK'
    ak = 'A' if audience == 'adult' else 'K'
    variants = [{'size': s, 'source_size_label': s, 'sku': f"SW-{type_code}-{code}-{KIT[kit]['code']}-{SEASON_CODE[season]}-{ak}-{s}",
                 'barcode': None, 'price': price, 'compare_at_price': None, 'quantity': 5, 'available_at_source': True}
                for s in SIZES[audience]]
    base_tags = ['sport:football', f'team:{team_slug}', f"league:{team['league']}", f'kit:{kit}', f'audience:{audience}', 'new',
                 'source:jerseyxie', f"album:{pick['album']}"]
    if not national:
        base_tags.append('season:2026-27')
    images = [{'url': 'file://' + pick['images']['front'], 'alt_he': f"{title['he']} – חזית", 'view': 'front'}]
    if pick['images'].get('back'):
        images.append({'url': 'file://' + pick['images']['back'], 'alt_he': f"{title['he']} – גב", 'view': 'back'})
    for detail in pick['images'].get('details') or []:
        images.append({'url': 'file://' + detail, 'alt_he': f"{title['he']} (תקריב של הבד וההדפס)", 'view': 'detail'})
    records.append({
        'handle': pick['handle'], 'status': 'ready', 'sport': 'football', 'product_type': product_type, 'audience': audience,
        'size_chart': CHART[audience],
        'team': {'slug': team_slug, 'code': code, 'he': team['he'], 'en': team['en'], 'ar': team['ar']},
        'leagues': [team['league']], 'kit': kit, 'season': season, 'vendor': 'SportWear',
        'title': title['he'], 'title_he': title['he'], 'description_html_he': desc['he'],
        'seo': {'title_he': seo_title['he'], 'description_he': seo_desc['he']},
        'base_tags': base_tags, 'variants': variants, 'images': images,
        'translations': {lang: {'title': title[lang], 'description_html': desc[lang], 'seo_title': seo_title[lang],
                                'seo_description': seo_desc[lang]} for lang in ('en', 'ar')},
        'source': {'url': f"https://jerseyxie.x.yupoo.com/albums/{pick['album']}?uid=1", 'fetched_at': now,
                   'original_title': row['title'], 'reference_price': None, 'image_rights_confirmed': True,
                   'image_rights_note': "Studio photos made from the supplier's own album photos (design/imagery/README.md)."},
        'questions': [],
    })

tag_plan, _ = classify_tags([{'handle': r['handle'], 'title': r['title_he'], 'product_type': r['product_type'],
                              'base_tags': r['base_tags']} for r in records])
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
    with open(os.path.join(out_dir, r['handle'] + '.json'), 'w') as fh:
        json.dump(r, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(r['handle'], len(r['tags']), 'tags', r['variants'][0]['price'])
