"""Orders the main collections: big teams first, adults before kids, jerseys before shorts.

Usage: python3 scripts/catalog/collection-order.py <command> <work_dir>

  fetch  Saves the storefront order of every collection in catalog/collection-order.json (the main ones and the
         team pages), and of nba, to
         <work>/collections.json (https://sportwear.co.il/collections/<handle>/products.json, 250 a page).
  plan   Reads <work>/collections.json and writes <work>/moves.json: for each collection that is not in order yet,
         its id and the moves for collectionReorderProducts, in calls of up to 250. Prints the first products of
         each planned order so a person can check them. It never writes to Shopify.
  check  Fetches the collections again and reports, for each one, whether its order is the planned one.

The rules and the team order live in catalog/collection-order.json. Applying a plan (Shopify MCP workflow):
the collection's sortOrder must be MANUAL; send each call's moves with
  mutation($id: ID!, $moves: [MoveInput!]!) { collectionReorderProducts(id: $id, moves: $moves) { job { id done } } }
and wait for the job to be done before the next call on the same collection (moves apply in order).
Run it after every import: Shopify does not place new products by these rules.
"""
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG = os.path.join(ROOT, 'catalog/collection-order.json')
NFL_PICKS = os.path.join(ROOT, 'catalog/sources/nfl-cyq888/picks.json')
STORE = 'https://sportwear.co.il'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
KIT = {'home': 0, 'away': 1, 'third': 2, 'fourth': 3, 'special': 4, 'training': 5}
SEASON = {None: 0, '2026-27': 0, '2025-26': 1, '2024-25': 2}
END = '99999'  # "newPosition" past the last product puts it at the end
HOODIE_AUDIENCE = {'adult': 0, 'men': 0, 'women': 1, 'kids': 2}  # the men's hoodies are tagged audience:adult


def get_json(url):
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 430, 503):
                raise
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(2 ** attempt * 2)
    raise RuntimeError(f'could not fetch {url}')


def fetch(handles):
    out = {}
    for handle in handles:
        items, page = [], 1
        while True:
            data = get_json(f'{STORE}/collections/{handle}/products.json?limit=250&page={page}')
            products = data.get('products', [])
            items += [{'id': str(p['id']), 'handle': p['handle'], 'title': p['title'], 'type': p['product_type'],
                       'tags': p['tags']} for p in products]
            if len(products) < 250:
                break
            page += 1
            time.sleep(0.5)
        out[handle] = items
        print(f'{handle}: {len(items)}', file=sys.stderr)
        time.sleep(0.5)
    return out


def facts(p, cfg):
    tags = p['tags']

    def tag(prefix):
        return next((t[len(prefix):] for t in tags if t.startswith(prefix)), None)

    season = tag('season:')
    retro = 'style:retro' in tags
    team = tag('team:') or p['handle']
    return {
        'id': p['id'], 'p': p, 'sport': tag('sport:') or '', 'team': team,
        'kit': KIT.get(tag('kit:') or '', 6),
        'kids': tag('audience:') == 'kids',
        'audience': tag('audience:'),
        'old': bool((season and season != '2026-27') or retro),
        'season_rank': SEASON.get(season, 3) + (5 if retro else 0),
        'demote': p['handle'] in cfg['demote'] or team == 'bape',
    }


def nfl_ranks():
    """NFL jersey handle -> its place in the picks (each team's stars first), through the studio render its product
    file names (catalog/published/<handle>.json, review.render)."""
    picks = json.load(open(NFL_PICKS, encoding='utf-8'))['picks']
    order = {}
    for i, p in enumerate(picks):
        render = f"{p['team']}-{p['number']}-{p['color']}-{p['album']}-{p['photo']}"
        order[render + ('-kids' if p['audience'] == 'kids' else '')] = i
    ranks = {}
    for f in glob.glob(os.path.join(ROOT, 'catalog/published/*.json')):
        d = json.load(open(f, encoding='utf-8'))
        render = (d.get('review') or {}).get('render') if isinstance(d, dict) else None
        if render in order:
            ranks[d['handle']] = order[render]
    return ranks


def order(handle, products, nba_index, nfl_rank, cfg):
    """The planned order of one collection, as a list of facts dicts."""
    football, basketball = cfg['football_priority'], cfg['basketball_priority']
    american_football = cfg['american_football_priority']
    top = set(basketball[:cfg['top_basketball_teams']])
    rows = []
    for i, p in enumerate(products):
        f = facts(p, cfg)
        f['orig'] = i
        if p['type'] == 'Hoodie':
            f['group'] = 3
        elif f['kids']:
            f['group'] = 2
        elif p['type'] == 'Basketball Shorts':
            f['group'] = 1
        else:
            f['group'] = 0
        if handle == 'kids':  # the football sets first, then basketball, then NFL jerseys, then hoodies
            sport_group = {'football': 0, 'basketball': 1, 'american-football': 2}.get(f['sport'], 3)
            f['group'] = 3 if p['type'] == 'Hoodie' else sport_group
        rows.append(f)

    # Each team's products in turn order: football by season then kit, basketball in the nba page's order, NFL in the
    # picks' order.
    teams = defaultdict(list)
    for f in rows:
        teams[(f['demote'], f['group'], f['sport'], f['team'])].append(f)
    for (_, _, sport, _), lst in teams.items():
        if sport == 'football':
            lst.sort(key=lambda f: (f['season_rank'], f['kit'], f['orig']))
        elif sport == 'american-football':
            lst.sort(key=lambda f: (nfl_rank.get(f['p']['handle'], 10 ** 6), f['orig']))
        else:
            lst.sort(key=lambda f: (nba_index.get(f['id'], 10 ** 6), f['orig']))
        for r, f in enumerate(lst):
            f['round'] = r

    def key(f):
        if f['p']['type'] == 'Hoodie':  # the NFL teams in turn, each team's men's, women's, then kids' hoodie
            rank = american_football.index(f['team']) if f['team'] in american_football else len(american_football)
            return (f['demote'], f['group'], 0, 0, rank, HOODIE_AUDIENCE.get(f['audience'], 3), f['orig'])
        ranks = {'football': football, 'american-football': american_football}.get(f['sport'], basketball)
        rank = ranks.index(f['team']) if f['team'] in ranks else len(ranks) + 1
        if f['sport'] == 'football' and f['old']:
            rank += cfg['older_season_delay']  # a big club with no 26/27 shirt yet still shows, a little later
        phase = 0
        if f['sport'] == 'basketball':
            phase = 0 if (f['team'] in top and f['round'] < cfg['top_basketball_rounds']) else 1
        return (f['demote'], f['group'], phase, f['round'], rank, 0, f['orig'])

    return sorted(rows, key=key)


def head_and_tail(planned, spec):
    to_end = set(spec['to_end'])
    head = [f for f in planned if not f['demote'] and f['group'] not in to_end]
    if spec['prefix']:
        head = head[:spec['prefix']]
    tail = [f for f in planned if f['demote'] or f['group'] in to_end]
    return head, tail


def in_order(current_ids, head, tail):
    head_ok = current_ids[:len(head)] == [f['id'] for f in head]
    tail_ok = not tail or current_ids[len(current_ids) - len(tail):] == [f['id'] for f in tail]
    return head_ok and tail_ok


def moves_for(current_ids, head, tail):
    # Sent to the end in order, then each head product to its place from the first one out of place: the result
    # doesn't depend on the order the collection is in now, and products not listed (not on the Online Store)
    # keep their place in between.
    gid = 'gid://shopify/Product/'
    order_now = list(current_ids)
    tail_ids = [f['id'] for f in tail]
    moves = []
    if tail and order_now[len(order_now) - len(tail):] != tail_ids:
        for pid in tail_ids:
            order_now.remove(pid)
            order_now.append(pid)
            moves.append({'id': gid + pid, 'newPosition': END})
    start = next((i for i, f in enumerate(head) if i >= len(order_now) or order_now[i] != f['id']), len(head))
    moves += [{'id': gid + f['id'], 'newPosition': str(i)} for i, f in enumerate(head) if i >= start]
    return moves


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ('fetch', 'plan', 'check'):
        print(__doc__)
        sys.exit(1)
    command, work = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    cfg = json.load(open(CONFIG, encoding='utf-8'))
    specs = dict(cfg['collections'])
    # Team pages: the whole collection in the team's own order.
    specs.update({h: {'id': gid, 'prefix': None, 'to_end': []} for h, gid in cfg.get('team_collections', {}).items()})
    handles = list(specs)
    path = os.path.join(work, 'collections.json')

    if command == 'fetch':
        json.dump(fetch(handles + ['nba']), open(path, 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'wrote {path}')
        return

    cols = fetch(handles + ['nba']) if command == 'check' else json.load(open(path, encoding='utf-8'))
    nba_index = {p['id']: i for i, p in enumerate(cols['nba'])}
    nfl_rank = nfl_ranks()
    plans = {}
    for handle in handles:
        spec = specs[handle]
        planned = order(handle, cols[handle], nba_index, nfl_rank, cfg)
        head, tail = head_and_tail(planned, spec)
        current = [p['id'] for p in cols[handle]]
        ok = in_order(current, head, tail)
        if command == 'check':
            print(f'{handle:24} {"in order" if ok else "NOT in order"} ({len(current)} products)')
            continue
        print(f'\n{handle} ({len(current)} products): {"in order" if ok else "to reorder"}')
        for f in head[:12]:
            print(f'   {f["p"]["title"]}')
        if ok:
            continue
        moves = moves_for(current, head, tail)
        plans[handle] = {'id': spec['id'], 'calls': [moves[i:i + 250] for i in range(0, len(moves), 250)]}
    if command == 'plan':
        out = os.path.join(work, 'moves.json')
        json.dump(plans, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'\nwrote {out}: {len(plans)} collections to reorder')


if __name__ == '__main__':
    main()
