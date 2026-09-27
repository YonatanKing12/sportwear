"""NBA shorts from the supplier xingkong-sports (Yupoo), category "球迷版球裤 NBA Swingman Shorts".

Usage: python3 scripts/catalog/xingkong-shorts.py <command> [args] <work_dir>

  albums  <category.html>  Parses the saved category page (https://xingkong-sports.x.yupoo.com/categories/3569857)
                           into catalog/sources/xingkong-sports/shorts.json: one row per album with the supplier's
                           title and what it says (team, season, edition and colour words). The words are hints
                           for the review; the photos decide.
  fetch   <ids.json>       Downloads every photo of each album into <work>/albums/<album>/NN.jpg and records them in
                           <work>/photos.json. Pages and photos are cached; at least 1.2 s between album pages.
  sheet   <ids.json>       One contact sheet per album, <work>/sheets/<album>.jpg, every photo labeled "NN", so a
                           person (or an agent) can pick the front, the back and the close-ups.
  refs    <picks.json>     Copies the picked front/back photos to <work>/studio/ref/sw-shorts-<album>[__back].jpg and
                           writes <work>/studio-products.json for scripts/images/studio.py.
  details <picks.json>     The picked close-ups as centred 1200 x 1200 squares: <work>/details/sw-detail-shorts-<album>-<n>.jpg.
  qa      <picks.json>     Side-by-side sheets <work>/qa/qa-NN.jpg: supplier photo | normalized studio photo.

ids.json: ["<album id>", ...]
picks.json: [{"album", "front": "NN.jpg", "back": "NN.jpg" | null, "details": ["NN.jpg", ...], "note_front"?,
              "note_back"?}]
The handle of every product is sw-shorts-<album>, as for the ten shorts imported before (2026-09-26).
"""
import html as htmllib
import json
import os
import re
import subprocess
import sys
import time

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STORE = 'xingkong-sports'
SOURCE = os.path.join(ROOT, 'catalog/sources/xingkong-sports/shorts.json')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
FONT = next((p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                         '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf') if os.path.exists(p)), None)

# The supplier's team names (Chinese) → our team slugs (catalog/classification.json).
TEAMS = [
    ('湖人', 'los-angeles-lakers'), ('勇士', 'golden-state-warriors'), ('快船', 'los-angeles-clippers'),
    ('黄蜂', 'charlotte-hornets'), ('灰熊', 'memphis-grizzlies'), ('热火', 'miami-heat'),
    ('森林狼', 'minnesota-timberwolves'), ('爵士', 'utah-jazz'), ('骑士', 'cleveland-cavaliers'),
    ('公牛', 'chicago-bulls'), ('掘金', 'denver-nuggets'), ('篮网', 'brooklyn-nets'), ('步行者', 'indiana-pacers'),
    ('凯尔特人', 'boston-celtics'), ('独行侠', 'dallas-mavericks'), ('小牛', 'dallas-mavericks'),
    ('太阳', 'phoenix-suns'), ('国王', 'sacramento-kings'), ('魔术', 'orlando-magic'),
    ('76人', 'philadelphia-76ers'), ('奇才', 'washington-wizards'), ('尼克斯', 'new-york-knicks'),
    ('雷霆', 'oklahoma-city-thunder'),
]
# Title words → hints (English), in the order they are listed.
WORDS = [
    ('城市版', 'city edition'), ('城市', 'city edition'), ('复古', 'retro'), ('飞人限定', 'statement (Jordan)'),
    ('飞人款', 'statement (Jordan)'), ('飞人', 'statement (Jordan)'), ('75周年', '75th anniversary'),
    ('主场', 'home'), ('客场', 'away'), ('常规', 'regular'), ('限定', 'limited'), ('圆领', 'crew neck'),
    ('南海岸', 'South Beach'), ('拉丁文', 'Latin wordmark'), ('迷彩', 'camo'), ('涂鸦', 'graffiti'),
    ('渐变', 'gradient'), ('条纹', 'stripes'), ('蛇纹', 'snakeskin'), ('电车蓝', 'cable-car blue'),
    ('旧金山', 'San Francisco'), ('袜子白', 'white'),
]
COLOURS = [
    ('酒红色', 'wine red'), ('藏蓝色', 'navy'), ('黑灰色', 'black-grey'), ('白色', 'white'), ('白', 'white'),
    ('蓝色', 'blue'), ('黑色', 'black'), ('红色', 'red'), ('紫色', 'purple'), ('黄色', 'yellow'),
    ('绿色', 'green'), ('橙色', 'orange'), ('灰色', 'grey'),
]


def font(size):
    return ImageFont.truetype(FONT, size) if FONT else ImageFont.load_default()


def curl(url, dest, referer=None):
    cmd = ['curl', '-sS', '-L', '--max-time', '120', '--retry', '3', '--retry-delay', '3', '-A', UA, '-o', dest]
    if referer:
        cmd += ['-e', referer]
    subprocess.run(cmd + [url], check=True)


def parse_title(title):
    """What the supplier's title says: team, season year (25赛季 → 2025, as our shorts titles use it), edition
    and colour words. Hints only."""
    row = {'team': None, 'season_year': None, 'hints': [], 'colours': []}
    for zh, slug in TEAMS:
        if zh in title:
            row['team'] = slug
            break
    m = re.search(r'(\d{2})赛季', title)
    if m:
        row['season_year'] = 2000 + int(m.group(1))
    rest = title
    for zh, en in WORDS:
        if zh in rest:
            row['hints'].append(en)
            rest = rest.replace(zh, ' ')
    for zh, en in COLOURS:
        if zh in rest:
            row['colours'].append(en)
            rest = rest.replace(zh, ' ')
    return row


def albums(category_html, have):
    page = open(category_html, encoding='utf-8', errors='replace').read()
    rows = []
    for m in re.finditer(r'<a[^>]*class="[^"]*album__main[^"]*"[^>]*>', page):
        tag = m.group(0)
        album = re.search(r'href="/albums/(\d+)', tag)
        title = re.search(r'title="([^"]*)"', tag)
        if not album:
            continue
        title = htmllib.unescape(title.group(1)).strip() if title else ''
        row = {'album': album.group(1), 'title': title}
        if '尺码表' in title:
            row['status'] = 'size-chart'
        else:
            row.update(parse_title(title))
            row['status'] = 'have' if f'sw-shorts-{row["album"]}' in have else 'new'
        rows.append(row)
    total = re.search(r'共(\d+)个相册', page)
    return rows, int(total.group(1)) if total else None


def album_photos(album, work):
    page = os.path.join(work, 'html', album + '.html')
    os.makedirs(os.path.dirname(page), exist_ok=True)
    if not os.path.exists(page) or os.path.getsize(page) < 5000:
        curl(f'https://{STORE}.x.yupoo.com/albums/{album}?uid=1', page)
        time.sleep(1.2)
    text = open(page, encoding='utf-8', errors='ignore').read()
    urls = []
    for u in re.findall(r'data-origin-src="([^"]+)"', text):
        u = 'https:' + u if u.startswith('//') else u
        if u not in urls:
            urls.append(u)
    return urls


def fetch(ids, work):
    # XK_INDEX lets several fetches run side by side (merge their indexes into photos.json afterwards).
    index_path = os.path.join(work, os.environ.get('XK_INDEX', 'photos.json'))
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}
    for album in ids:
        urls = album_photos(album, work)
        folder = os.path.join(work, 'albums', album)
        os.makedirs(folder, exist_ok=True)
        files = []
        for i, u in enumerate(urls, 1):
            f = os.path.join(folder, f'{i:02d}.jpg')
            if not os.path.exists(f) or os.path.getsize(f) < 2000:
                try:  # to a .part file first, so a stopped run never leaves a cut photo under the final name
                    curl(u, f + '.part', referer=f'https://{STORE}.x.yupoo.com/')
                    os.replace(f + '.part', f)
                except subprocess.CalledProcessError:
                    continue
                time.sleep(0.2)
            files.append({'file': os.path.relpath(f, work), 'url': u})
        index[album] = files
        json.dump(index, open(index_path, 'w'), ensure_ascii=False, indent=1)
        print(album, len(files), flush=True)


def thumb(path, box):
    im = Image.open(path).convert('RGB')
    im.thumbnail((box, box))
    return im


def sheet(ids, work):
    index = json.load(open(os.path.join(work, 'photos.json')))
    source = {r['album']: r for r in json.load(open(SOURCE))['albums']}
    os.makedirs(os.path.join(work, 'sheets'), exist_ok=True)
    box, cols, pad = 300, 5, 10
    for album in ids:
        photos = index.get(album, [])
        rows_n = max(1, (len(photos) + cols - 1) // cols)
        width = cols * (box + pad) + pad
        height = 60 + rows_n * (box + 34) + pad
        canvas = Image.new('RGB', (width, height), (255, 255, 255))
        draw = ImageDraw.Draw(canvas)
        row = source.get(album, {})
        draw.text((pad, 12), f"album {album}  ·  {row.get('team') or '?'}  ·  {', '.join(row.get('hints', []) + row.get('colours', []))}",
                  fill=(0, 0, 0), font=font(22))
        for i, p in enumerate(photos):
            r_, c_ = divmod(i, cols)
            x0, y0 = pad + c_ * (box + pad), 60 + r_ * (box + 34)
            try:
                im = thumb(os.path.join(work, p['file']), box)
            except Exception:  # noqa: BLE001
                continue
            canvas.paste(im, (x0 + (box - im.width) // 2, y0 + (box - im.height) // 2))
            draw.text((x0, y0 + box + 4), os.path.basename(p['file']), fill=(170, 0, 0), font=font(20))
        out = os.path.join(work, 'sheets', album + '.jpg')
        canvas.save(out, quality=85)
    print(len(ids), 'sheets in', os.path.join(work, 'sheets'))


def refs(picks, work):
    ref_dir = os.path.join(work, 'studio', 'ref')
    os.makedirs(ref_dir, exist_ok=True)
    products = []
    for p in picks:
        for view, suffix in (('front', ''), ('back', '__back')):
            if not p.get(view):
                continue
            name = f"sw-shorts-{p['album']}{suffix}"
            dest = os.path.join(ref_dir, name + '.jpg')
            im = Image.open(os.path.join(work, 'albums', p['album'], p[view])).convert('RGB')
            crop = p.get('crop_' + view)
            if crop:  # [left, top, right, bottom] as fractions of the photo
                w, h = im.size
                im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
            im.thumbnail((1536, 1536))
            im.save(dest, quality=92)
            entry = {'handle': name, 'title': name, 'type': 'Basketball Shorts', 'media': [{'url': 'file://' + dest}]}
            note = p.get('note_' + view)
            if note:
                entry['note'] = note
            products.append(entry)
    json.dump(products, open(os.path.join(work, 'studio-products.json'), 'w'), indent=1)
    print(len(products), 'studio inputs')


def details(picks, work):
    """The picked close-ups as centred squares, 1200 x 1200 JPEG: <work>/details/sw-detail-shorts-<album>-<n>.jpg
    (the store's close-up line, design/imagery/README.md)."""
    out = os.path.join(work, 'details')
    os.makedirs(out, exist_ok=True)
    count = 0
    for p in picks:
        for n, name in enumerate(p.get('details') or [], 1):
            if n > 2:
                break
            im = Image.open(os.path.join(work, 'albums', p['album'], name)).convert('RGB')
            side = min(im.size)
            left, top = (im.width - side) // 2, (im.height - side) // 2
            im = im.crop((left, top, left + side, top + side)).resize((1200, 1200), Image.LANCZOS)
            im.save(os.path.join(out, f"sw-detail-shorts-{p['album']}-{n}.jpg"), quality=88)
            count += 1
    print(count, 'close-ups in', out)


def qa(picks, work):
    os.makedirs(os.path.join(work, 'qa'), exist_ok=True)
    box, per = 420, 4
    pairs = []
    for p in picks:
        for suffix in ('', '__back'):
            name = f"sw-shorts-{p['album']}{suffix}"
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
    print(len(pairs), 'pairs in', os.path.join(work, 'qa'))


if __name__ == '__main__':
    command = sys.argv[1]
    if command == 'albums':
        have = set(sys.argv[3:]) if len(sys.argv) > 3 else set()
        rows, total = albums(sys.argv[2], have)
        os.makedirs(os.path.dirname(SOURCE), exist_ok=True)
        doc = {
            '_note': ("NBA shorts of the supplier xingkong-sports on Yupoo, category \"球迷版球裤 NBA Swingman Shorts\" "
                      "(fan version). The ten shorts in the store before 2026-09-27 came from here (handles "
                      "sw-shorts-<album>). team / season_year / hints / colours are read from the supplier's Chinese "
                      "title and are only hints: the photos decide. season_year follows our titles: 25赛季 → 2025."),
            'category_url': f'https://{STORE}.x.yupoo.com/categories/3569857',
            'album_url': f'https://{STORE}.x.yupoo.com/albums/{{album}}?uid=1',
            'albums_total_on_site': total,
            'albums': rows,
        }
        json.dump(doc, open(SOURCE, 'w'), ensure_ascii=False, indent=1)
        open(SOURCE, 'a').write('\n')
        counts = {}
        for r in rows:
            counts[r['status']] = counts.get(r['status'], 0) + 1
        print(len(rows), 'albums (site says', total, ')', counts)
        unknown = [r for r in rows if r['status'] != 'size-chart' and not r.get('team')]
        if unknown:
            print('no team:', unknown)
    else:
        arg, work = sys.argv[2], sys.argv[3]
        os.makedirs(work, exist_ok=True)
        data = json.load(open(arg))
        {'fetch': fetch, 'sheet': sheet, 'refs': refs, 'details': details, 'qa': qa}[command](data, work)
