"""English and Arabic titles and descriptions for the imported products (tag source:yupoo), built from
their Hebrew titles with catalog/classification.json (team, player and style names in he/en/ar) and the
word lists below. The Hebrew titles follow a fixed pattern (type, name, audience, number, colors, styles,
year or season), so every word is either in the dictionary or reported as unknown; nothing is guessed.

Usage: python3 scripts/catalog/translate-titles.py <products.json> <out.json>
  products.json: [{"handle", "title", "descriptionHtml"}]. out.json: {handle: {en: {title, body_html},
  ar: {title, body_html}, unknown: [...]}}. Products with unknown words are listed on stdout."""
import json, re, sys, html

C = json.load(open('catalog/classification.json'))

TYPES = [  # Hebrew prefix -> (kind, en noun, ar noun)
    ('גופיית כדורסל', 'basketball', 'Basketball Jersey', 'قميص كرة سلة'),
    ('מכנסי כדורסל', 'shorts', 'Basketball Shorts', 'شورت كرة سلة'),
    ('חולצת כדורגל', 'football', 'Jersey', 'قميص'),
    ('סווטשירט קפוצ׳ון', 'hoodie', 'Hoodie', 'هودي'),
]
COLORS = {
    'שחור': ('Black', 'أسود'), 'לבן': ('White', 'أبيض'), 'כחול': ('Blue', 'أزرق'), 'ירוק': ('Green', 'أخضر'),
    'אדום': ('Red', 'أحمر'), 'סגול': ('Purple', 'بنفسجي'), 'צהוב': ('Yellow', 'أصفر'),
    'תכלת': ('Light Blue', 'سماوي'), 'בז׳': ('Beige', 'بيج'), 'בורדו': ('Burgundy', 'عنابي'),
    'אפור': ('Grey', 'رمادي'), 'כתום': ('Orange', 'برتقالي'), 'ורוד': ('Pink', 'وردي'),
    'טורקיז': ('Turquoise', 'فيروزي'), 'חום': ('Brown', 'بني'), 'שמנת': ('Cream', 'كريمي'),
    'זהב': ('Gold', 'ذهبي'), 'כסף': ('Silver', 'فضي'),
}
SHADES = {'כהה': ('Dark', 'داكن'), 'בהיר': ('Light', 'فاتح'), 'זית': ('Olive', 'زيتي')}
PHRASES = [  # multi-word styles first
    ('מהדורת עיר', 'City Edition', 'إصدار المدينة'), ('מהדורה משותפת', 'Collab Edition', 'إصدار مشترك'),
    ('מהדורה מיוחדת', 'Special Edition', 'إصدار خاص'), ('מהדורת הנצחה', 'Tribute Edition', 'إصدار تذكاري'),
    ('מהדורת אליפות', 'Championship Edition', 'إصدار البطولة'), ('מהדורת פרישה', 'Retirement Edition', 'إصدار الاعتزال'),
    ('שילוב צבעים', 'Multicolor', 'متعدد الألوان'), ('צבע מדורג', 'Gradient', 'بلون متدرج'),
    ('דוגמת נחש', 'Snakeskin', 'بنقشة جلد الثعبان'), ('עם הדפס מריה', 'Maria Print', 'بطبعة ماريا'),
    ('רטרו', 'Retro', 'ريترو'), ('הדפס', 'Print', 'مطبوع'), ('פסים', 'Pinstripe', 'مقلّم'), ('אימון', 'Training', 'للتدريب'),
]
KITS = {'בית': ('Home', 'الأساسي'), 'חוץ': ('Away', 'الاحتياطي'), 'שלישית': ('Third', 'الثالث'), 'רביעית': ('Fourth', 'الرابع')}
AUDIENCE = {'לילדים': ("Kids'", 'للأطفال'), 'לנשים': ("Women's", 'للنساء'), 'לגברים': ("Men's", 'للرجال')}
NAMELESS_OK = {'Maria Print'}  # styles that stand in for a team name
EXTRA_SENTENCES = {  # the few description lines that are not the title or the sizes (Hebrew -> en, ar)
    'המחיר הוא לזוג מכנסיים אחד בצבע לבן.': ('The price is for one pair, in white.', 'السعر لزوج واحد من الشورت باللون الأبيض.'),
    'המחיר הוא לזוג מכנסיים אחד בצבע כחול.': ('The price is for one pair, in blue.', 'السعر لزوج واحد من الشورت باللون الأزرق.'),
    'גופיית כדורסל ניו יורק ניקס, מספר 8, בעיצוב לבן עם פסים.': (
        'New York Knicks basketball jersey, number 8, white with pinstripes.',
        'قميص كرة سلة نيويورك نيكس، رقم 8، بتصميم أبيض مقلّم.'),
}
EXTRA_NAMES = {  # names in titles that classification.json does not list as teams or players
    'BAPE': ('BAPE', 'BAPE'), 'הארדוויי': ('Hardaway', 'هارداواي'),
    'בעיצוב NBA ו־Supreme': ('NBA × Supreme', 'بتصميم NBA × Supreme'),
}
# A bare 'פריז' is not listed: it can be Paris Saint-Germain or Paris Basketball, and mapping it to
# 'Paris Basketball' mistitled two PSG jerseys (fixed 2026-09-28). 'פריז סן ז׳רמן' comes from
# classification.json and, being longer, is matched first; a title with only 'פריז' is flagged.

names = []  # (hebrew, en, ar), longest first
for slug, t in C['teams'].items():
    for m in set(t.get('match', []) + [t['he']]):
        he_name = m
        en, ar = t['en'], t['ar']
        if m.startswith('נבחרת '):
            ar = 'منتخب ' + t['ar'] if not t['ar'].startswith('منتخب') else t['ar']
        names.append((he_name, en, ar))
for slug, p in list(C['players'].items()) + list(C['title_names'].items()):
    for m in set((p.get('match') or []) + [p['he']]):
        names.append((m, p['en'], p['ar']))
for he_name, (en, ar) in EXTRA_NAMES.items():
    names.append((he_name, en, ar))
names.sort(key=lambda n: len(n[0]), reverse=True)


def translate(title):
    unknown = []
    rest = title.strip()
    kind = None
    for prefix, k, en_noun, ar_noun in TYPES:
        if rest.startswith(prefix):
            kind, noun_en, noun_ar = k, en_noun, ar_noun
            rest = rest[len(prefix):].strip()
            break
    if kind is None:
        return None, ['<type>']
    # Up to two names (a team and a player, or two teams split by "/"), joined in the Hebrew order.
    found = []  # (start, end, en, ar)
    for he_name, en, ar in names:
        if len(found) == 2:
            break
        for m in re.finditer(r'(?:^|(?<=\s))' + re.escape(he_name) + r'(?=\s|$)', rest):
            if all(m.end() <= s or m.start() >= e for s, e, _, _ in found):
                found.append((m.start(), m.end(), en, ar))
                break
    found.sort()
    name = None
    if found:
        en_name, ar_name = found[0][2], found[0][3]
        kept = rest[:found[0][0]]
        for (_, e1, _, _), (s2, _, en, ar) in zip(found, found[1:]):
            gap = rest[e1:s2].strip()
            join = ' / ' if gap == '/' else ' '
            if gap not in ('', '/'):
                kept += ' ' + gap  # words between the two names stay in the title's details
            en_name += join + en
            ar_name += join + ar
        name = (en_name, ar_name)
        rest = (kept + ' ' + rest[found[-1][1]:]).strip()
    number = None
    m = re.search(r'מספר (\d+(?:/\d+)?)', rest)
    if m:
        number = m.group(1)
        rest = (rest[:m.start()] + ' ' + rest[m.end():]).strip()
    # Remaining words in order: audience, kit, colors (with shades and "ו" joins), styles, years/seasons, "/".
    words = rest.split()
    audience = kit = None
    parts = []  # (en, ar) phrases in Hebrew order
    i = 0
    while i < len(words):
        w = words[i]
        matched = False
        for he_p, en_p, ar_p in PHRASES:
            pw = he_p.split()
            if words[i:i + len(pw)] == pw:
                parts.append(('style', en_p, ar_p)); i += len(pw); matched = True; break
        if matched:
            continue
        if w in AUDIENCE:
            audience = AUDIENCE[w]
        elif w in KITS:
            kit = KITS[w]
        elif re.fullmatch(r'\d{2}/\d{2}|(19|20)\d{2}(/(19|20)\d{2})?', w):
            parts.append(('year', w, w))
        elif w == '/':
            parts.append(('slash', '/', '/'))
        else:
            joined = w.startswith('ו') and w[1:] in COLORS
            base = w[1:] if joined else w
            if base in COLORS:
                en_c, ar_c = COLORS[base]
                if i + 1 < len(words) and words[i + 1] in SHADES:
                    s_en, s_ar = SHADES[words[i + 1]]
                    en_c, ar_c = f'{s_en} {en_c}', f'{ar_c} {s_ar}'
                    i += 1
                parts.append(('color+' if joined else 'color', en_c, ar_c))
            else:
                unknown.append(w)
        i += 1
    # English: "<Name> [#N] [Audience] [Kit] <Noun> [– details]"; football: "<Name> <Kit> Jersey <season> – details".
    details_en, details_ar = [], []
    for kind_p, en_p, ar_p in parts:
        if kind_p == 'color+' and details_en:
            details_en[-1] += f' and {en_p}'; details_ar[-1] += f' و{ar_p}'
        elif kind_p == 'year' and details_en and details_en[-1].endswith('Edition'):  # "City Edition 2021"
            details_en[-1] += f' {en_p}'; details_ar[-1] += f' {ar_p}'
        elif kind_p == 'slash' and details_en:
            details_en[-1] += ' /'; details_ar[-1] += ' /'
        else:
            details_en.append(en_p); details_ar.append(ar_p)
    if name is None and kind == 'football':
        noun_en = 'Football Jersey'  # a print shirt with no club: "Football Jersey 25/26 – Maria Print, Black"
    en_bits = [name[0] if name else '']
    if number: en_bits.append(f'#{number}')
    if audience: en_bits.append(audience[0])
    if kit: en_bits.append(kit[0])
    en_bits.append(noun_en)
    season = None
    if kind == 'football' and details_en and re.fullmatch(r'\d{2}/\d{2}|(19|20)\d{2}(/(19|20)\d{2})?', details_en[-1]):
        season = details_en.pop(); details_ar.pop()
    en = ' '.join(b for b in en_bits if b)
    if season: en += f' {season}'
    detail_en = ', '.join(d.replace(' /,', ' /') for d in details_en).replace(' /, ', ' / ')
    if detail_en: en += f' – {detail_en}'
    # Arabic keeps the Hebrew order: noun, name, audience, number, kit, details (football: kit after the name).
    ar_bits = [noun_ar, name[1] if name else '']
    if kind == 'football' and kit: ar_bits.append(kit[1])
    if audience: ar_bits.append(audience[1])
    if number: ar_bits.append(f'رقم {number}')
    if kind != 'football' and kit: ar_bits.append(kit[1])
    ar_bits += [d.replace(' /,', ' /') for d in details_ar]
    if season: ar_bits.append(season)
    ar = ' '.join(b for b in ar_bits if b)
    if name is None and not any(k == 'style' and e in NAMELESS_OK for k, e, _ in parts):
        unknown.append('<name>')
    return {'en': re.sub(r'\s+', ' ', en).strip(), 'ar': re.sub(r'\s+', ' ', ar).strip()}, unknown


def body(desc_html, title_he, t):
    """The imported descriptions are the title plus a size line; mirror them."""
    text = html.unescape(re.sub(r'<[^>]+>', '\n', desc_html))
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    sizes = None
    for l in lines:
        m = re.match(r'מידות(?: לבחירה| זמינות)?:\s*(.+?)\.?$', l)
        if m: sizes = [s.strip() for s in m.group(1).split(',')]
    other = [l for l in lines if l != title_he and not l.startswith('מידות')]
    extra_en = ''.join(f'<p>{EXTRA_SENTENCES[l][0]}</p>' for l in other if l in EXTRA_SENTENCES)
    extra_ar = ''.join(f'<p>{EXTRA_SENTENCES[l][1]}</p>' for l in other if l in EXTRA_SENTENCES)
    other = [l for l in other if l not in EXTRA_SENTENCES]
    en = f"<p>{t['en']}</p>" + extra_en + (f"<p>Sizes: {', '.join(sizes)}.</p>" if sizes else '')
    ar = f"<p>{t['ar']}</p>" + extra_ar + (f"<p>المقاسات: {'، '.join(sizes)}.</p>" if sizes else '')
    return en, ar, other


if __name__ == '__main__':
    products = json.load(open(sys.argv[1]))
    out, flagged = {}, []
    for p in products:
        t, unknown = translate(p['title'])
        if t is None:
            flagged.append((p['handle'], p['title'], unknown)); continue
        en_b, ar_b, other = body(p.get('descriptionHtml') or '', p['title'], t)
        if other: unknown.append('<description has more text: ' + ' | '.join(other)[:80] + '>')
        out[p['handle']] = {'en': {'title': t['en'], 'body_html': en_b}, 'ar': {'title': t['ar'], 'body_html': ar_b},
                            'unknown': unknown}
        if unknown: flagged.append((p['handle'], p['title'], unknown))
    json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
    print(f'{len(out)} translated, {len(flagged)} flagged')
    for f in flagged: print(' !', *f)
