"""Turns product files (catalog/ready/<handle>.json) into ProductSetInput objects for the Admin API's productSet.

Usage: python3 scripts/catalog/productset-input.py <urls.json> <ids.json> <file.json>... > inputs.json

urls.json: {"<local image path>": "<staged upload resourceUrl>"} for every image the files name (file:// URLs).
ids.json:  {"<product handle>": "gid://shopify/Product/…"} for the products the files reference
           (relations.complements_handles).

Every product is created as DRAFT (the catalog rule). It carries the Hebrew texts, the single מידה option, one
variant per size with its SKU, price, 5 units at the shop's location (tracked, no overselling), the photos with
their Hebrew alt texts, and the sportwear metafields the storefront reads: the filter fields (audience,
team_handle, league_handle, kit, styles, player), the size chart and the set pieces (complements).
"""
import json
import sys

LOCATION = 'gid://shopify/Location/114120163632'
SIZE_CHARTS = {  # catalog/store-setup.json → metaobjects.sw_size_chart
    'jerseyxie-football-adult-fan': 'gid://shopify/Metaobject/282968949040',
    'jerseyxie-football-kids-set': 'gid://shopify/Metaobject/282968981808',
    'xingkong-nba-shorts-fan': 'gid://shopify/Metaobject/283181383984',
}


def metafield(key, type_, value):
    return {'namespace': 'sportwear', 'key': key, 'type': type_, 'value': value}


def build(product, urls, ids):
    tags = product['tags']
    styles = [t.split(':', 1)[1] for t in tags if t.startswith('style:')]
    players = [t.split(':', 1)[1] for t in tags if t.startswith('player:')]
    fields = [
        metafield('audience', 'single_line_text_field', product['audience']),
        metafield('team_handle', 'single_line_text_field', product['team']['slug']),
        metafield('league_handle', 'single_line_text_field', product['leagues'][0]),
        metafield('source_url', 'url', product['source']['url']),
    ]
    if product.get('kit'):
        fields.append(metafield('kit', 'single_line_text_field', product['kit']))
    if styles:
        fields.append(metafield('styles', 'list.single_line_text_field', json.dumps(styles)))
    if players:
        fields.append(metafield('player', 'list.single_line_text_field', json.dumps(players)))
    if product.get('size_chart'):
        fields.append(metafield('size_chart', 'metaobject_reference', SIZE_CHARTS[product['size_chart']]))
    complements = [ids[h] for h in (product.get('relations') or {}).get('complements_handles', [])]
    if complements:
        fields.append(metafield('complements', 'list.product_reference', json.dumps(complements)))
    sizes = [v['size'] for v in product['variants']]
    return {
        'title': product['title_he'],
        'handle': product['handle'],
        'status': 'DRAFT',
        'descriptionHtml': product['description_html_he'],
        'productType': product['product_type'],
        'vendor': product['vendor'],
        'tags': tags,
        'seo': {'title': product['seo']['title_he'], 'description': product['seo']['description_he']},
        'productOptions': [{'name': 'מידה', 'position': 1, 'values': [{'name': s} for s in sizes]}],
        'variants': [{
            'optionValues': [{'optionName': 'מידה', 'name': v['size']}],
            'sku': v['sku'],
            'price': f"{v['price']:.2f}",
            'inventoryPolicy': 'DENY',
            'inventoryItem': {'tracked': True},
            'inventoryQuantities': [{'locationId': LOCATION, 'name': 'available', 'quantity': v['quantity']}],
        } for v in product['variants']],
        'files': [{'originalSource': urls[img['url'].removeprefix('file://')], 'contentType': 'IMAGE', 'alt': img['alt_he']}
                  for img in product['images']],
        'metafields': fields,
    }


if __name__ == '__main__':
    urls = json.load(open(sys.argv[1]))
    ids = json.load(open(sys.argv[2]))
    print(json.dumps([build(json.load(open(f)), urls, ids) for f in sys.argv[3:]], ensure_ascii=False))
