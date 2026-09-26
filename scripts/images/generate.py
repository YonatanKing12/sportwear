"""Generates images with the OpenAI Images API. Reads the key from the OPENAI_API_KEY environment variable (never printed or committed).
Usage: python3 scripts/images/generate.py <jobs.json> <out_dir>
jobs: [{"name", "size", "prompt", "quality"}]; see design/imagery/README.md."""
import base64, json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

here = os.path.dirname(os.path.abspath(__file__))
key = os.environ.get('OPENAI_API_KEY', '').strip()
if not key:
    sys.exit('Set OPENAI_API_KEY in the environment (never commit it).')
jobs = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)

STYLE = (
    ' Style: cinematic editorial sports photography for a premium sportswear brand, photorealistic, '
    'full-frame camera, shallow depth of field, rich deep near-black shadows, soft volumetric haze, '
    'stadium floodlight glow with an acid-lime (#C6FF3D) accent light, high contrast, natural film grain. '
    'Strictly no text, no letters, no numbers, no logos, no brand marks, no crests, no sponsor boards, '
    'no watermarks, and no recognisable real people.'
)

def run(job):
    body = {
        'model': job.get('model', 'gpt-image-2'),
        'prompt': job['prompt'] + STYLE,
        'size': job['size'],
        'quality': job.get('quality', 'high'),
        'output_format': 'jpeg',
        'output_compression': 92,
        'n': 1,
    }
    req = urllib.request.Request(
        'https://api.openai.com/v1/images/generations',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
    )
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        return {'name': job['name'], 'error': e.read().decode()[:400]}
    img = base64.b64decode(data['data'][0]['b64_json'])
    path = os.path.join(out, job['name'] + '.jpg')
    open(path, 'wb').write(img)
    return {'name': job['name'], 'bytes': len(img), 'seconds': round(time.time() - started), 'usage': data.get('usage')}

with ThreadPoolExecutor(max_workers=6) as pool:
    for result in pool.map(run, jobs):
        print(json.dumps(result), flush=True)
