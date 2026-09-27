"""Brand graphics (wide atmosphere pictures) with the OpenAI Images API. Reads the key from the OPENAI_API_KEY
environment variable (never printed or committed). Prompts: design/imagery/brand-prompts.json ("jobs").
Usage: python3 scripts/images/brand.py design/imagery/brand-prompts.json <out_dir> [name,name,...]"""
import base64, json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

here = os.path.dirname(os.path.abspath(__file__))
key = os.environ.get('OPENAI_API_KEY', '').strip()
if not key:
    sys.exit('Set OPENAI_API_KEY in the environment (never commit it).')
data = json.load(open(sys.argv[1]))
jobs = data['jobs'] if isinstance(data, dict) else data
out = sys.argv[2]
only = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None
os.makedirs(out, exist_ok=True)

STYLE = (
    ' Photorealistic editorial sports photography for a premium sportswear shop: full-frame camera, natural '
    'cinematic colour, rich true colours and deep shadows, gentle film grain, no heavy filters. '
    'Absolutely no text, letters, numbers, digits, logos, crests, badges, emblems, brand marks, sponsor boards, '
    'advertising, flags with symbols or watermarks anywhere in the image, and no recognisable real people, '
    'real players or real stadiums.'
)

def run(job):
    body = {
        'model': 'gpt-image-2',
        'prompt': job['prompt'] + STYLE,
        'size': job.get('size', '3072x1024'),
        'quality': job.get('quality', 'high'),
        'output_format': 'jpeg',
        'output_compression': 90,
        'n': 1,
    }
    req = urllib.request.Request(
        'https://api.openai.com/v1/images/generations',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
    )
    started = time.time()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=900) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as e:
            err = e.read().decode()[:300]
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(20 * (attempt + 1)); continue
            return {'name': job['name'], 'error': err}
        except Exception as e:  # network
            if attempt < 2:
                time.sleep(20); continue
            return {'name': job['name'], 'error': str(e)[:300]}
    img = base64.b64decode(data['data'][0]['b64_json'])
    path = os.path.join(out, job['name'] + '.jpg')
    open(path, 'wb').write(img)
    return {'name': job['name'], 'kb': len(img) // 1024, 'seconds': round(time.time() - started), 'usage': data.get('usage', {}).get('total_tokens')}

todo = [j for j in jobs if not only or j['name'] in only]
with ThreadPoolExecutor(max_workers=6) as pool:
    for result in pool.map(run, todo):
        print(json.dumps(result), flush=True)
