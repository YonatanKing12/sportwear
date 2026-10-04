"""Photo work for the NFL jerseys of the supplier nfl-cyq888 (catalog/sources/nfl-cyq888/README.md).

Usage: python3 scripts/catalog/nfl-photos.py <command> <work_dir> [args]

  albums     Reads the two category pages (adults 5214685, kids 5036285) into <work>/albums.json
             (album, Chinese title, photo count, audience, team slug).
  fetch      Downloads every album page and its photos in the "big" size (810 x 1080) to <work>/albums/<album>/NN.jpg
             and indexes them in <work>/photos.json (with each photo's original URL). Pages one at a time, 1.2 s apart.
  sheet      Contact sheets <work>/sheets/<audience>-<album>-<part>.jpg, 24 numbered photos each, for the review.
  zoom       zoom <album> <NN> [full|left|right|top]: a large crop for reading names and trim.
  originals  Downloads the full-size original of every picked photo (<work>/picks.json) to <work>/orig/<album>/<NN>.jpg.
  studio     Writes <work>/studio-products.json for scripts/images/studio.py: two renders per pick (front, back), the whole
             upright original as the reference (<work>/studio/ref/<render>.jpg) and a note naming which of the two jerseys
             in the photo to render, its number and the name on the back.
  qa         QA sheets <work>/qa/<prefix>-NN.jpg: supplier photo | studio front | studio back, four rows each.

The photo review itself (one JSON per album: every distinct jersey, its player, number, colour and best photo) is done by
people or agents from the contact sheets; its result is catalog/sources/nfl-cyq888/review.json, and the selection is
catalog/sources/nfl-cyq888/picks.json (copy it to <work>/picks.json)."""
import html, json, os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont, ImageOps

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
BASE = 'https://nfl-cyq888.x.yupoo.com'
CATEGORIES = {'5214685': 'adult', '5036285': 'kids'}  # 二代NFL, 童装NFL
TEAMS = {'海鹰': 'seattle-seahawks', '泰坦': 'tennessee-titans', '红雀': 'arizona-cardinals', '圣徒': 'new-orleans-saints',
         '巨人': 'new-york-giants', '海盗': 'tampa-bay-buccaneers', '布朗': 'cleveland-browns', '美洲豹': 'jacksonville-jaguars',
         '指挥官': 'washington-commanders', '野马': 'denver-broncos', '黑豹': 'carolina-panthers', '喷气机': 'new-york-jets',
         '公羊': 'los-angeles-rams', '熊队': 'chicago-bears', '德州人': 'houston-texans', '闪电': 'los-angeles-chargers',
         '小马': 'indianapolis-colts', '猎鹰': 'atlanta-falcons', '包装工': 'green-bay-packers', '维京人': 'minnesota-vikings',
         '爱国者': 'new-england-patriots', '钢人': 'pittsburgh-steelers', '雄狮': 'detroit-lions', '乌鸦': 'baltimore-ravens',
         '猛虎': 'cincinnati-bengals', '突击者': 'las-vegas-raiders', '海豚': 'miami-dolphins', '49人': 'san-francisco-49ers',
         '比尔': 'buffalo-bills', '酋长': 'kansas-city-chiefs', '牛仔': 'dallas-cowboys', '老鹰': 'philadelphia-eagles'}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def font(size):
    return ImageFont.truetype(FONT, size) if os.path.exists(FONT) else ImageFont.load_default()


def curl(url, dest, referer=None):
    cmd = ['curl', '--http1.1', '-sS', '-L', '--max-time', '180', '-A', UA, '-o', dest]
    if referer:
        cmd += ['-e', referer]
    subprocess.run(cmd + [url], check=True)


def page(path, dest):
    for attempt in range(3):
        if os.path.exists(dest) and os.path.getsize(dest) >= 2000:
            return open(dest, encoding='utf-8', errors='ignore').read()
        try:
            curl(BASE + path, dest)
        except subprocess.CalledProcessError:
            time.sleep(5 * (attempt + 1))
        time.sleep(1.2)
    raise SystemExit(f'page not fetched: {path}')


def albums(work):
    rows = []
    os.makedirs(os.path.join(work, 'html'), exist_ok=True)
    for cat, audience in CATEGORIES.items():
        text = page(f'/categories/{cat}', os.path.join(work, 'html', f'cat_{cat}.html'))
        for m in re.finditer(r'class="album__main"\s+title="([^"]*)"\s+href="/albums/(\d+)\?[^"]*".*?album__photonumber">(\d+)</div>', text, re.S):
            title = html.unescape(m.group(1))
            rows.append({'album': m.group(2), 'title': title, 'photos': int(m.group(3)), 'category': cat, 'audience': audience,
                         'team': TEAMS[title.replace('童装', '')]})
    json.dump(rows, open(os.path.join(work, 'albums.json'), 'w'), ensure_ascii=False, indent=1)
    print(len(rows), 'albums')


def download(job):
    url, dest = job
    if os.path.exists(dest) and os.path.getsize(dest) >= 2000:
        return True
    for attempt in range(3):
        try:
            curl(url, dest + '.part', referer=BASE + '/')
            os.replace(dest + '.part', dest)
            return True
        except subprocess.CalledProcessError:
            time.sleep(3 * (attempt + 1))
    return False


def fetch(work):
    rows = json.load(open(os.path.join(work, 'albums.json')))
    index_path = os.path.join(work, 'photos.json')
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    with ThreadPoolExecutor(6) as pool:
        for r in rows:
            a = r['album']
            text = page(f'/albums/{a}?uid=1', os.path.join(work, 'html', f'{a}.html'))
            origin = []
            for u in re.findall(r'data-origin-src="([^"]+)"', text):
                u = 'https:' + u if u.startswith('//') else u
                if u not in origin:
                    origin.append(u)
            os.makedirs(os.path.join(work, 'albums', a), exist_ok=True)
            jobs = [(u.rsplit('/', 1)[0] + '/big.' + u.rsplit('.', 1)[-1], os.path.join(work, 'albums', a, f'{i:02d}.jpg'))
                    for i, u in enumerate(origin, 1)]
            ok = list(pool.map(download, jobs))
            index[a] = {**r, 'files': [{'file': os.path.relpath(f, work), 'origin': u} for (_, f), u, k in zip(jobs, origin, ok) if k]}
            json.dump(index, open(index_path, 'w'), ensure_ascii=False, indent=1)
            print(a, r['team'], r['audience'], len(index[a]['files']), '/', r['photos'], flush=True)


def sheet(work, only=None):
    index = json.load(open(os.path.join(work, 'photos.json')))
    os.makedirs(os.path.join(work, 'sheets'), exist_ok=True)
    box, cols, pad = 330, 6, 8
    for a in (only or list(index)):
        e = index[a]
        files = e['files']
        for part in range(0, len(files), 24):
            chunk = files[part:part + 24]
            rows_n = (len(chunk) + cols - 1) // cols
            canvas = Image.new('RGB', (cols * (box + pad) + pad, 50 + rows_n * (box + 28) + pad), 'white')
            draw = ImageDraw.Draw(canvas)
            draw.text((pad, 10), f"{a} {e['audience']} {e['team']} ({len(files)} photos) part {part // 24 + 1}", fill='black', font=font(24))
            for i, f in enumerate(chunk):
                r_, c_ = divmod(i, cols)
                x, y = pad + c_ * (box + pad), 50 + r_ * (box + 28)
                im = Image.open(os.path.join(work, f['file'])).convert('RGB')
                im.thumbnail((box, box))
                canvas.paste(im, (x + (box - im.width) // 2, y + (box - im.height) // 2))
                draw.text((x + 2, y + box + 2), os.path.basename(f['file'])[:2], fill=(190, 0, 0), font=font(20))
            out = os.path.join(work, 'sheets', f"{e['audience']}-{a}-{part // 24 + 1}.jpg")
            canvas.save(out, quality=82)
            print(out)


def zoom(work, a, n, part='full'):
    im = Image.open(os.path.join(work, 'albums', a, f'{n.zfill(2)}.jpg')).convert('RGB')
    w, h = im.size
    box = {'full': (0, 0, w, h), 'left': (0, 0, w // 2 + w // 20, h), 'right': (w // 2 - w // 20, 0, w, h), 'top': (0, 0, w, h // 2)}[part]
    im = im.crop(box)
    if im.width > 1400:
        im = im.resize((1400, int(im.height * 1400 / im.width)))
    os.makedirs(os.path.join(work, 'zoom'), exist_ok=True)
    out = os.path.join(work, 'zoom', f'{a}-{n.zfill(2)}-{part}.jpg')
    im.save(out, quality=88)
    print(out)


def render_handle(p):
    return f"{p['team']}-{p['number']}-{p['color']}-{p['album']}-{p['photo']}" + ('-kids' if p['audience'] == 'kids' else '')


def originals(work):
    index = json.load(open(os.path.join(work, 'photos.json')))
    jobs = []
    for p in json.load(open(os.path.join(work, 'picks.json'))):
        for photo in {p['photo'], p.get('front_photo') or p['photo'], p.get('back_photo') or p['photo']}:
            f = next(f for f in index[p['album']]['files'] if f['file'].endswith(f'/{photo}.jpg'))
            dest = os.path.join(work, 'orig', p['album'], f'{photo}.jpg')
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            jobs.append((f['origin'], dest))
    with ThreadPoolExecutor(6) as pool:
        ok = list(pool.map(download, jobs))
    print(sum(ok), 'of', len(jobs), 'originals')


def note(p, which):
    name, num = (p.get('name_on_back') or '').strip(), p['number']
    what = (f'the front of the jersey, with the number {num} on the chest' if which == 'front' else
            (f'the back of the jersey, with the name "{name}" above the number {num}' if name else f'the back of the jersey, with the number {num}'))
    keep = ('Keep the exact colors, number font, outline colors, sleeve stripes, collar, shoulder logos, small badges and '
            'the chest wordmark if there is one.')
    kids = ' It is a kids jersey.' if p['audience'] == 'kids' else ''
    if p.get('views') == 'separate':
        return f'Render {what}, exactly as in the reference. {keep}{kids}'
    v = (p.get('views') or '').lower()
    pos = None
    if v.startswith('back-left'):
        pos = 'right' if which == 'front' else 'left'
    elif v.startswith('front-left'):
        pos = 'left' if which == 'front' else 'right'
    s = ('The reference photo shows this same jersey twice: once from the front and once from the back. '
         f'Render ONLY {what}')
    if pos:
        s += f" (the jersey on the {pos} of the reference; ignore the one on the {'right' if pos == 'left' else 'left'})"
    return (s + '. Show that one jersey complete and on its own, flat and symmetrical; where the other jersey covers part '
            'of it, continue the same design symmetrically, without adding anything new. ' + keep + kids)


def studio(work):
    items = []
    ref_dir = os.path.join(work, 'studio', 'ref')
    os.makedirs(ref_dir, exist_ok=True)
    for p in json.load(open(os.path.join(work, 'picks.json'))):
        for which in ('front', 'back'):
            photo = p.get(which + '_photo') or p['photo']
            src = os.path.join(work, 'orig', p['album'], f'{photo}.jpg')
            name = render_handle(p) + ('__back' if which == 'back' else '')
            ref = os.path.join(ref_dir, name + '.jpg')
            if not os.path.exists(ref):
                im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')  # some originals are stored sideways
                im.thumbnail((1536, 1536))
                im.save(ref, quality=92)
            items.append({'handle': name, 'type': 'NFL Jersey', 'media': [{'url': 'file://' + os.path.abspath(src)}],
                          'note': note(p, which), 'source_photo': f"{p['album']}/{photo}"})
    json.dump(items, open(os.path.join(work, 'studio-products.json'), 'w'), ensure_ascii=False, indent=1)
    print(len(items), 'renders; run: python3 scripts/images/studio.py', os.path.join(work, 'studio-products.json'),
          os.path.join(work, 'studio'), '1248x1248 medium 8')


def qa(work, prefix='qa'):
    picks = json.load(open(os.path.join(work, 'picks.json')))
    norm = os.path.join(work, 'studio', 'norm')
    rows = [p for p in picks if os.path.exists(os.path.join(norm, render_handle(p) + '.png'))]
    os.makedirs(os.path.join(work, 'qa'), exist_ok=True)
    size = 520
    for s in range(0, len(rows), 4):
        chunk = rows[s:s + 4]
        canvas = Image.new('RGB', (3 * (size + 10) + 10, len(chunk) * (size + 40) + 10), 'white')
        draw = ImageDraw.Draw(canvas)
        for i, p in enumerate(chunk):
            y = 10 + i * (size + 40)
            h = render_handle(p)
            tiles = [os.path.join(work, 'orig', p['album'], f"{p['photo']}.jpg"), os.path.join(norm, h + '.png'), os.path.join(norm, h + '__back.png')]
            for k, t in enumerate(tiles):
                if os.path.exists(t):
                    im = ImageOps.exif_transpose(Image.open(t)).convert('RGB')
                    im.thumbnail((size, size))
                    canvas.paste(im, (10 + k * (size + 10), y))
            draw.text((10, y + size + 6), f"{h}  |  {p.get('name_on_back')} {p['number']} {p['color']}", fill=(170, 0, 0), font=font(20))
        out = os.path.join(work, 'qa', f'{prefix}-{s // 4 + 1:02d}.jpg')
        canvas.save(out, quality=86)
        print(out)


if __name__ == '__main__':
    cmd, work = sys.argv[1], os.path.abspath(sys.argv[2])
    rest = sys.argv[3:]
    {'albums': lambda: albums(work), 'fetch': lambda: fetch(work), 'sheet': lambda: sheet(work, rest or None),
     'zoom': lambda: zoom(work, *rest), 'originals': lambda: originals(work), 'studio': lambda: studio(work),
     'qa': lambda: qa(work, *(rest or ['qa']))}[cmd]()
