"""Photo work for products picked from the jerseyxie wave (catalog/sources/jerseyxie/wave1.json).

Usage: python3 scripts/catalog/jerseyxie-photos.py <command> <ids-or-picks.json> <work_dir>

  fetch   <ids.json>    Downloads every album of each wave row (row["albums"]) into <work>/albums/<album>/NN.ext
                        and records them in <work>/photos.json. Pages and photos are cached.
  sheet   <ids.json>    One contact sheet per row, <work>/sheets/<id>.jpg: every photo of every album, labeled
                        "<album>/<NN>" so a person (or an agent) can pick the front and back photos.
  refs    <picks.json>  Copies the picked photos to <work>/studio/ref/<handle>[__back].jpg and writes
                        <work>/studio-products.json for scripts/images/studio.py.
  qa      <picks.json>  Side-by-side sheets <work>/qa/qa-NN.jpg: supplier photo | normalized studio photo.
  build   <picks.json>  Writes <work>/picks-build.json, the input of scripts/catalog/jerseyxie-build.py.

ids.json: ["<wave1 row id>", ...]
picks.json: [{"id": "<row id>", "album": "<album id>", "front": "<album>/<NN.ext>", "back": "<album>/<NN.ext>" | null,
              "note": "<optional re-render note>"}]
The handle comes from the row: {team}-{kit}-jersey-{season} (adults) or {team}-{kit}-kit-{season}-kids (kids),
where season is 2026-27 for clubs and 2026 for national teams.
"""
import json, os, re, subprocess, sys, time
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
ROWS = {r['id']: r for r in json.load(open(os.path.join(ROOT, 'catalog/sources/jerseyxie/wave1.json')))['products']}
ALBUMS = {a['id']: a for a in json.load(open(os.path.join(ROOT, 'catalog/sources/jerseyxie/albums.json')))['albums']}
FONT = next((p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                         '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf') if os.path.exists(p)), None)


def font(size):
    return ImageFont.truetype(FONT, size) if FONT else ImageFont.load_default()


def handle_for(row):
    season = '2026-27' if row['season'] == '26/27' else row['season']
    if row['audience'] == 'kids':
        return f"{row['team']}-{row['kit']}-kit-{season}-kids"
    return f"{row['team']}-{row['kit']}-jersey-{season}"


def product_type(row):
    return 'Football Kit' if row['audience'] == 'kids' else 'Football Jersey'


def curl(url, dest, referer=None):
    cmd = ['curl', '-sS', '-L', '--max-time', '120', '-A', UA, '-o', dest]
    if referer:
        cmd += ['-e', referer]
    subprocess.run(cmd + [url], check=True)


def fetch(ids, work):
    index_path = os.path.join(work, 'photos.json')
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    for pid in ids:
        row = ROWS[pid]
        entry = {'albums': []}
        for album in sorted(row['albums'], key=int, reverse=True):
            page = os.path.join(work, 'html', album + '.html')
            os.makedirs(os.path.dirname(page), exist_ok=True)
            if not os.path.exists(page) or os.path.getsize(page) < 2000:
                curl(f'https://jerseyxie.x.yupoo.com/albums/{album}?uid=1', page)
                time.sleep(1.2)
            html = open(page, encoding='utf-8', errors='ignore').read()
            urls = []
            for u in re.findall(r'data-origin-src="([^"]+)"', html):
                u = 'https:' + u if u.startswith('//') else u
                if u not in urls:
                    urls.append(u)
            folder = os.path.join(work, 'albums', album)
            os.makedirs(folder, exist_ok=True)
            files = []
            for i, u in enumerate(urls, 1):
                ext = u.rsplit('.', 1)[-1].lower().split('?')[0]
                f = os.path.join(folder, f'{i:02d}.{ext}')
                if not os.path.exists(f) or os.path.getsize(f) < 2000:
                    try:
                        curl(u, f, referer='https://jerseyxie.x.yupoo.com/')
                    except subprocess.CalledProcessError:
                        continue
                    time.sleep(0.3)
                files.append(os.path.relpath(f, work))
            entry['albums'].append({'album': album, 'title': ALBUMS.get(album, {}).get('title'), 'photos': files})
        index[pid] = entry
        json.dump(index, open(index_path, 'w'), ensure_ascii=False, indent=1)
        print(pid, [(a['album'], len(a['photos'])) for a in entry['albums']], flush=True)


def thumb(path, box):
    im = Image.open(path).convert('RGB')
    im.thumbnail((box, box))
    return im


def sheet(ids, work):
    index = json.load(open(os.path.join(work, 'photos.json')))
    os.makedirs(os.path.join(work, 'sheets'), exist_ok=True)
    box, cols, pad, head = 300, 6, 10, 34
    for pid in ids:
        row = ROWS[pid]
        blocks = []
        for a in index[pid]['albums']:
            n = len(a['photos'])
            rows_n = max(1, (n + cols - 1) // cols)
            blocks.append((a, rows_n))
        width = cols * (box + pad) + pad
        height = 60 + sum(head + r * (box + 30) for _, r in blocks) + pad
        canvas = Image.new('RGB', (width, height), (255, 255, 255))
        draw = ImageDraw.Draw(canvas)
        draw.text((pad, 10), f"{pid}  ({row['audience']}, {row['kit']}, {row['season']})", fill=(0, 0, 0), font=font(24))
        y = 60
        for a, rows_n in blocks:
            draw.rectangle([0, y, width, y + head - 4], fill=(230, 236, 245))
            draw.text((pad, y + 5), f"album {a['album']}: {a['title']}", fill=(20, 20, 60), font=font(18))
            y += head
            for i, rel in enumerate(a['photos']):
                r_, c_ = divmod(i, cols)
                x0, y0 = pad + c_ * (box + pad), y + r_ * (box + 30)
                try:
                    im = thumb(os.path.join(work, rel), box)
                except Exception:  # noqa: BLE001
                    continue
                canvas.paste(im, (x0 + (box - im.width) // 2, y0 + (box - im.height) // 2))
                draw.text((x0, y0 + box + 3), f"{a['album']}/{os.path.basename(rel)}", fill=(160, 0, 0), font=font(17))
            y += rows_n * (box + 30)
        out = os.path.join(work, 'sheets', pid + '.jpg')
        canvas.save(out, quality=85)
        print(out)


def load_picks(path):
    picks = json.load(open(path))
    for p in picks:
        row = ROWS[p['id']]
        p.setdefault('handle', handle_for(row))
        p['type'] = product_type(row)
    return picks


def refs(picks, work):
    ref_dir = os.path.join(work, 'studio', 'ref')
    os.makedirs(ref_dir, exist_ok=True)
    products = []
    for p in picks:
        for view, suffix in (('front', ''), ('back', '__back')):
            if not p.get(view):
                continue
            name = p['handle'] + suffix
            dest = os.path.join(ref_dir, name + '.jpg')
            im = Image.open(os.path.join(work, 'albums', p[view])).convert('RGB')
            im.thumbnail((1536, 1536))
            im.save(dest, quality=92)
            entry = {'handle': name, 'title': name, 'type': p['type'], 'media': [{'url': 'file://' + dest}]}
            note = p.get('note_' + view) or p.get('note')
            if note:
                entry['note'] = note
            products.append(entry)
    json.dump(products, open(os.path.join(work, 'studio-products.json'), 'w'), indent=1)
    print(len(products), 'studio inputs')


def qa(picks, work):
    os.makedirs(os.path.join(work, 'qa'), exist_ok=True)
    box, per = 420, 4
    pairs = []
    for p in picks:
        for suffix in ('', '__back'):
            name = p['handle'] + suffix
            ref = os.path.join(work, 'studio', 'ref', name + '.jpg')
            norm = os.path.join(work, 'studio', 'norm', name + '.png')
            if os.path.exists(ref):
                pairs.append((name, ref, norm))
    for n in range(0, len(pairs), per):
        chunk = pairs[n:n + per]
        canvas = Image.new('RGB', (2 * box + 30, len(chunk) * (box + 40) + 10), (255, 255, 255))
        draw = ImageDraw.Draw(canvas)
        for i, (name, ref, norm) in enumerate(chunk):
            y = 10 + i * (box + 40)
            draw.text((10, y), name, fill=(0, 0, 0), font=font(20))
            for j, path in enumerate((ref, norm)):
                if os.path.exists(path):
                    im = thumb(path, box)
                    canvas.paste(im, (10 + j * (box + 10) + (box - im.width) // 2, y + 30))
                else:
                    draw.text((10 + j * (box + 10), y + 60), 'missing', fill=(200, 0, 0), font=font(20))
        out = os.path.join(work, 'qa', f'qa-{n // per:02d}.jpg')
        canvas.save(out, quality=85)
        print(out)


def build(picks, work):
    norm = os.path.join(work, 'studio', 'norm')
    out = []
    for p in picks:
        front = os.path.join(norm, p['handle'] + '.png')
        back = os.path.join(norm, p['handle'] + '__back.png')
        if not os.path.exists(front):
            print('no studio front photo, skipped:', p['id'])
            continue
        out.append({'id': p['id'], 'handle': p['handle'], 'album': p['album'],
                    'images': {'front': front, 'back': back if os.path.exists(back) else None}})
    json.dump(out, open(os.path.join(work, 'picks-build.json'), 'w'), indent=1)
    print(len(out), 'products in', os.path.join(work, 'picks-build.json'))


if __name__ == '__main__':
    command, arg, work = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(work, exist_ok=True)
    if command in ('fetch', 'sheet'):
        {'fetch': fetch, 'sheet': sheet}[command](json.load(open(arg)), work)
    else:
        {'refs': refs, 'qa': qa, 'build': build}[command](load_picks(arg), work)
