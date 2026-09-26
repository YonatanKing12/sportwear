"""Studio packshots of store products with the OpenAI Images edit endpoint (reference = the supplier photo).
Reads the key from the OPENAI_API_KEY environment variable (never printed or committed). See design/imagery/README.md.
Usage: python3 scripts/images/studio.py <products.json> <out_dir> [size] [quality] [workers]
products.json: [{"handle", "title", "type", "media": [{"url", ...}]}]; only media[0] is rendered.
Writes <out_dir>/ref/<handle>.jpg, <out_dir>/raw/<handle>.png and one JSON result line per product."""
import base64, io, json, os, subprocess, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

key = os.environ.get('OPENAI_API_KEY', '').strip()
if not key:
    sys.exit('Set OPENAI_API_KEY in the environment (never commit it).')
products = json.load(open(sys.argv[1]))
out = sys.argv[2]
size = sys.argv[3] if len(sys.argv) > 3 else '1248x1248'
quality = sys.argv[4] if len(sys.argv) > 4 else 'medium'
workers = int(sys.argv[5]) if len(sys.argv) > 5 else 6
os.makedirs(os.path.join(out, 'ref'), exist_ok=True)
os.makedirs(os.path.join(out, 'raw'), exist_ok=True)

KIND = {
    'Basketball Jersey': 'basketball jersey (tank top)',
    'Football Jersey': 'football shirt',
    'Hoodie': 'hooded sweatshirt',
    'Basketball Shorts': 'pair of basketball shorts',
}

PROMPT = (
    'Create a clean e-commerce studio product photo of the exact {kind} shown in the reference photo. '
    'Framing: square image; the whole garment is centered and faces the camera straight on, neatly laid flat '
    'and symmetrical, seen from the same side as in the reference (if the reference shows the back, show the '
    'back). The garment fills about 95% of the image height. '
    'Background: seamless, uniform, very light neutral gray (#F4F4F4) across the entire frame, with no '
    'gradient, no vignette, no floor, no shadow and no border. '
    'Lighting: soft, even studio light that shows the true colors. '
    'Remove everything that is not the garment: hangers, hands, mannequins, clips, packaging, other garments, '
    'tables, floors, walls, watermarks and any text that is not printed on the garment. Smooth out wrinkles. '
    'Keep the garment exactly as it is in the reference: the same colors and shades, fabric and mesh texture, '
    'every letter, word, number, logo, crest, badge, tag, sponsor print, pattern, stripe, trim, collar and '
    'armhole, in the same positions and sizes, spelled exactly the same. Do not add, remove, redesign, '
    'translate or mirror anything.'
)


def fetch_ref(product):
    path = os.path.join(out, 'ref', product['handle'] + '.jpg')
    if not os.path.exists(path):
        url = product['media'][0]['url']
        data = urllib.request.urlopen(url, timeout=60).read()
        im = Image.open(io.BytesIO(data)).convert('RGB')
        im.thumbnail((1536, 1536))
        im.save(path, quality=92)
    return path


def run(product):
    name = product['handle']
    raw = os.path.join(out, 'raw', name + '.png')
    if os.path.exists(raw):
        return {'handle': name, 'skipped': 'exists'}
    try:
        ref = fetch_ref(product)
    except Exception as e:  # noqa: BLE001
        return {'handle': name, 'error': f'ref: {e}'}
    prompt = PROMPT.format(kind=KIND.get(product.get('type'), 'garment'))
    cmd = ['curl', '-sS', '--max-time', '300', 'https://api.openai.com/v1/images/edits',
           '-H', f'Authorization: Bearer {key}',
           '-F', 'model=gpt-image-2',
           '--form-string', f'prompt={prompt}',
           '-F', f'size={size}',
           '-F', f'quality={quality}',
           '-F', 'output_format=png',
           '-F', f'image[]=@{ref}']
    started = time.time()
    for attempt in range(3):
        res = subprocess.run(cmd, capture_output=True, text=True)
        try:
            data = json.loads(res.stdout)
        except json.JSONDecodeError:
            data = {'error': {'message': (res.stdout[:200] + res.stderr[:200]) or 'no response'}}
        if 'error' not in data:
            break
        msg = data['error'].get('message', '')
        if 'rate' in msg.lower() or 'timeout' in msg.lower() or 'no response' in msg or '50' in msg[:4]:
            time.sleep(20 * (attempt + 1))
            continue
        return {'handle': name, 'error': msg[:300]}
    else:
        return {'handle': name, 'error': data['error'].get('message', '')[:300]}
    open(raw, 'wb').write(base64.b64decode(data['data'][0]['b64_json']))
    return {'handle': name, 'seconds': round(time.time() - started), 'usage': data.get('usage')}


with ThreadPoolExecutor(max_workers=workers) as pool:
    for result in pool.map(run, products):
        print(json.dumps(result), flush=True)
