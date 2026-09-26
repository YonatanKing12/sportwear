#!/usr/bin/env node
// Self-test for the preview harness. Renders the smoke theme in fixtures/theme-smoke (which uses
// sections, section groups, theme/static/nested blocks, forms, t with plurals, image_tag, color
// schemes, render with/for, paginate, the Section Rendering API and deliberate gaps) and checks the
// HTML. Then renders the real theme's layout and snippets with every template to make sure they
// render without Liquid errors.
// Usage: node scripts/preview/selftest.mjs   (npm run preview:selftest)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Preview } from './lib/preview.mjs';
import { startServer } from './lib/server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const fixturesDir = path.join(here, 'fixtures');
const smoke = new Preview({ themeDir: path.join(fixturesDir, 'theme-smoke'), fixturesDir });

let failures = 0;
let passes = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passes += 1;
    return;
  }
  failures += 1;
  console.log(`✗ ${name}${detail ? `\n    ${detail}` : ''}`);
}
const count = (html, needle) => html.split(needle).length - 1;
const render = (id, locale = 'he', preview = smoke) => preview.renderPage(preview.pageSpec(id, locale));
const gapKinds = (gaps) => new Set(gaps.map((g) => g.kind));
const hasGap = (gaps, kind, text) => gaps.some((g) => g.kind === kind && g.message.includes(text));
const compiled = (preview, html, kind) => {
  const url = html.match(new RegExp(`(/compiled_assets/${kind}-[^"]+)"`))?.[1];
  return url ? (preview.generatedFiles.get(url)?.content ?? '') : '';
};

/* ----------------------------------------------------------------------------- home (he) */
{
  const { html, gaps } = render('index', 'he');
  check('html lang/dir', html.includes('<html class="no-js" lang="he" dir="rtl">'));
  check('content_for_header replaced', !html.includes('sw-preview:content_for_header'));
  check('hreflang alternates', html.includes('hreflang="en" href="https://sfgzdp-1m.myshopify.com/en"'));
  check(
    'header group wrapper',
    /<aside id="shopify-section-sections--\d+__announcement" class="shopify-section shopify-section-group-header-group smoke-announcement-section">/.test(
      html,
    ),
  );
  check('group section index/location', html.includes('data-index="1"') && html.includes('data-location="header"'));
  check('disabled group section skipped', !html.includes('This section is disabled'));
  check('disabled template section skipped', count(html, 'data-check="plurals"') === 1);
  check('static section rendered', html.includes('id="shopify-section-cart-drawer" class="shopify-section"'));
  check(
    'JSON template section id',
    /id="shopify-section-template--\d+__hero" class="shopify-section smoke-hero-section"/.test(html),
  );
  check(
    'color scheme object',
    html.includes('smoke-hero color-scheme-dark') && html.includes('.color-scheme-dark { --bg: #0D0E11'),
  );
  check('color lightness', html.includes('color-scheme: dark; }'));
  check('link_list setting + nested links', html.includes('href="/collections/premier-league">פרמייר ליג</a>'));
  check('t plural (he two)', html.includes('<span data-cart-count>סל, 2 פריטים</span>'));
  check('t _html not escaped', html.includes('<strong>שלום</strong> <i>Dana</i>'));
  check('t escaped', html.includes('טום &amp; &quot;ג&#39;רי&quot;'));
  check('integer division', html.includes('3|3.5|120.00 NIS'));
  check('color filters', html.includes('rgb(198, 255, 61)|rgba(198, 255, 61, 0.5)|215.84|62'));
  check('handleize keeps Hebrew', html.includes('חולצת-בית-26-27'));
  check(
    'localization form',
    html.includes(
      '<form method="post" action="/localization" id="HeaderLocalization" accept-charset="UTF-8" class="smoke-localization" enctype="multipart/form-data"><input type="hidden" name="form_type" value="localization" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="_method" value="put" /><input type="hidden" name="return_to" value="/" />',
    ),
  );
  check('url setting resolved', html.includes('<a class="smoke-button" href="/collections/football">'));
  check('image_picker fixture', html.includes('src="/files/demo-fc-home-front.png?v=1&amp;width=1920"'));
  check(
    'image_tag srcset capped at original width',
    html.includes('width=480 480w, /files/demo-fc-home-front.png?v=1&amp;width=960 960w" width="1200" height="1500"'),
  );
  check(
    'image_tag preload → content_for_header',
    /<link rel="preload" data-sw-preview="preload-header" as="image" href="\/files\/demo-fc-home-front.png/.test(html),
  );
  check('missing image marker', html.includes('/files/__missing/') && hasGap(gaps, 'image', 'not-uploaded-banner.jpg'));
  check('placeholder-free hero', !html.includes('data-placeholder'));
  check(
    'theme block wrapper',
    html.includes('<div id="shopify-block-group_1" class="shopify-block smoke-group-block">'),
  );
  check('nested theme blocks', /smoke-group-block[\s\S]*First <b>nested<\/b> text[\s\S]*Second nested text/.test(html));
  check('disabled block skipped', !html.includes('DISABLED BLOCK'));
  check('tag: null block has no wrapper', !html.includes('shopify-block-text_3'));
  check(
    'shopify_attributes',
    html.includes(
      'data-shopify-editor-block="{&quot;id&quot;:&quot;text_3&quot;,&quot;type&quot;:&quot;smoke-text&quot;}"',
    ),
  );
  check('section.blocks excludes static blocks', html.includes('data-block-count="2"'));
  check(
    'static block from JSON',
    /<div id="shopify-block-cta" class="shopify-block"><a\s+class="smoke-button"\s+href="\/pages\/contact"/.test(
      html,
    ) && html.includes('>From JSON</a>'),
  );
  check('app block reported', hasGap(gaps, 'unsupported', 'app block'));
  check(
    'section-local blocks',
    html.includes('<h2 data-shopify-editor-block="{&quot;id&quot;:&quot;heading_1&quot;') &&
      html.includes('Default note'),
  );
  check('collection setting + render for', count(html, 'class="smoke-card"') === 4 && html.includes('data-index="4"'));
  check('render with … as', html.includes('· <span class="smoke-price" data-cents="12000">120 NIS</span>'));
  check('metaobject metafield', html.includes('style="--team: #0D0E11">דמו FC</span>'));
  check('payment icons', html.includes('<title id="pi-visa">Visa</title>'));
  check('date with locale format', html.includes('26/09/2026'));
  check('powered_by_link', html.includes('מופעל על ידי Shopify</a>'));
  const css = compiled(smoke, html, 'styles');
  const js = compiled(smoke, html, 'scripts');
  check(
    'stylesheet bundle (sections, blocks, snippets)',
    css.includes('/* sections/smoke-header.liquid */') &&
      css.includes('/* blocks/smoke-text.liquid */') &&
      css.includes('/* snippets/smoke-card.liquid */'),
  );
  check('stylesheet bundle only has rendered files', !css.includes('smoke-product'));
  check(
    'javascript bundle',
    js.includes('/* sections/smoke-hero.liquid */') && js.includes("dataset.smokeHero = 'loaded'"),
  );
  for (const [kind, text] of [
    ['filter', 'frobnicate'],
    ['property', 'shop.not_a_real_property'],
    ['setting', 'settings.not_in_schema'],
    ['setting', 'stale_setting'],
    ['resource', 'no-such-collection'],
    ['translation', 'smoke.no_such_key'],
    ['object', '"app"'],
    ['liquid-error', 'divided by 0'],
    ['liquid-error', 'snippets/does-not-exist.liquid'],
  ]) {
    check(`gap reported: ${kind} ${text}`, hasGap(gaps, kind, text));
  }
  check('missing translation visible', html.includes('[missing: smoke.no_such_key]'));
  check(
    'Liquid error visible inline',
    html.includes('Liquid error (sections/smoke-checks.liquid line 31): divided by 0'),
  );
  check(
    'gap bar + console warnings',
    html.includes('data-sw-preview-gaps="') && html.includes("console.warn('[preview-gap] '"),
  );
  check(
    'no unexpected gap kinds',
    [...gapKinds(gaps)].every((k) =>
      [
        'filter',
        'property',
        'setting',
        'resource',
        'translation',
        'object',
        'liquid-error',
        'image',
        'unsupported',
      ].includes(k),
    ),
    [...gapKinds(gaps)].join(', '),
  );
}

/* ------------------------------------------------------------------------- other locales */
{
  const ar = render('index', 'ar');
  check('ar dir', ar.html.includes('lang="ar" dir="rtl"'));
  check(
    'ar URLs prefixed',
    ar.html.includes('href="/ar/collections/football"') && ar.html.includes('action="/ar/localization"'),
  );
  for (const [n, text] of [
    [0, 'السلة فارغة'],
    [1, 'السلة، منتج واحد'],
    [2, 'السلة، منتجان'],
    [3, 'السلة، 3 منتجات'],
    [11, 'السلة، 11 منتجًا'],
    [100, 'السلة، 100 منتج'],
  ]) {
    check(`ar plural ${n}`, ar.html.includes(`data-count="${n}">${text}<`));
  }
  check('ar fallback reported', hasGap(ar.gaps, 'translation-fallback', 'smoke.fallback_only'));
  check('ar fallback shows default text', ar.html.includes('מחרוזת שקיימת רק בעברית'));
  const en = render('index', 'en');
  check('en ltr', en.html.includes('lang="en" dir="ltr"'));
  check(
    'en plural one/other',
    en.html.includes('data-count="1">Cart, 1 item<') && en.html.includes('data-count="2">Cart, 2 items<'),
  );
  check('en product titles translated', en.html.includes('Demo FC Home Jersey 26/27'));
  check('en no fallback gap', !hasGap(en.gaps, 'translation-fallback', 'smoke.fallback_only'));
}

/* ------------------------------------------------------------------------------- product */
{
  const { html, gaps } = render('product', 'he');
  check('product h1', html.includes('<h1>חולצת בית דמו FC 26/27</h1>'));
  check(
    'product form',
    html.includes(
      '<form method="post" action="/cart/add" id="SmokeProductForm" accept-charset="UTF-8" class="smoke-form" enctype="multipart/form-data" data-type="add-to-cart"><input type="hidden" name="form_type" value="product" /><input type="hidden" name="utf8" value="✓" />',
    ),
  );
  check(
    'product form trailing inputs',
    /<input type="hidden" name="product-id" value="\d+" \/><input type="hidden" name="section-id" value="template--\d+__main" \/><\/form>/.test(
      html,
    ),
  );
  check('option values', html.includes('<legend>מידה</legend>') && count(html, 'name="option-1"') === 4);
  check('counterpart link', html.includes('href="/products/demo-fc-home-jersey-2026-27-kids">לגרסת הילדים</a>'));
  check('size chart metaobject', /<caption>\s*טבלת מידות לדוגמה – מבוגרים\s*<\/caption>/.test(html));
  check('closest.product in theme block', html.includes('Closest product · חולצת בית דמו FC 26/27'));
  check(
    'structured data',
    html.includes('<script type="application/ld+json">{"@context":"http:\\/\\/schema.org\\/","@type":"Product"'),
  );
  check('product json', html.includes('"handle":"demo-fc-home-jersey-2026-27"'));
  check('media image alt', html.includes('alt="חולצת בית דמו FC 26/27 – מלפנים"'));
  check('no product gaps', gaps.length === 0, gaps.map((g) => g.message).join(' | '));
  const sale = render('product-sale', 'he');
  check('sold-out size disabled', /value="XL"[\s\S]{0,200}disabled/.test(sale.html));
  check('compare-at price', sale.html.includes('<s>150 NIS</s>'));
  const set = render('product-set', 'he');
  check('complements', set.html.includes('השלימו את הסט') && set.html.includes('מכנס כדורסל דמו סטארס 26/27'));
  const world = smoke.world(smoke.pageSpec('product', 'he'));
  const medium = world.product('demo-fc-home-jersey-2026-27').variants.find((v) => v.option1 === 'M').id;
  const variant = smoke.renderPage(smoke.pageSpec(`product?variant=${medium}`, 'he'));
  check(
    '?variant selects variant',
    new RegExp(`value="M"\\s+data-variant-id="${medium}"\\s+checked`).test(variant.html),
  );
}

/* ---------------------------------------------------------------------------- collection */
{
  const first = render('collection', 'he');
  check(
    'paginate page 1',
    first.html.includes('data-paginate="1/2/5"') && count(first.html, 'class="smoke-card"') === 3,
  );
  check('pagination parts', first.html.includes('<a href="/collections/football?page=2">2</a>'));
  check('default_pagination', first.html.includes('<span class="page current">1</span>'));
  check(
    'filters',
    first.html.includes('data-filter="filter.v.availability"') && first.html.includes('data-type="price_range"'),
  );
  check('sort options localized', /<option\s+value="manual"\s+selected\s*>מומלצים<\/option>/.test(first.html));
  const second = render('collection:football?page=2', 'he');
  check(
    'paginate page 2',
    second.html.includes('data-paginate="2/2/5"') && count(second.html, 'class="smoke-card"') === 2,
  );
  const filtered = render('collection:football?filter.v.option.מידה=5-6', 'he');
  check(
    'active filter narrows products',
    filtered.html.includes('data-paginate="1/1/1"') && /value="5-6"\s+checked/.test(filtered.html),
  );
  const sorted = render('collection:football?sort_by=title-descending', 'en');
  check('sort_by selected', /<option\s+value="title-descending"\s+selected\s*>/.test(sorted.html));
  const list = render('list-collections', 'he');
  check('paginate global collections (19 without "all")', list.html.includes('data-paginate="1/4"'));
  const main = list.html.slice(list.html.indexOf('<main'), list.html.indexOf('</main>'));
  check('collections page 1 has 6 items', count(main, '<li>') === 6);
  const list2 = render('list-collections?page=2', 'he');
  check('empty collection placeholder', list2.html.includes('data-placeholder="collection-apparel-1"'));
}

/* ------------------------------------------------------------------ search, cart, pages */
{
  const search = render('search', 'he');
  check(
    'search results',
    search.html.includes('8 תוצאות עבור &quot;דמו&quot;') && search.html.includes('data-paginate="1/2"'),
  );
  const cart = render('cart', 'he');
  check(
    'cart form',
    cart.html.includes(
      '<form method="post" action="/cart" id="SmokeCartForm" accept-charset="UTF-8" class="shopify-cart-form" enctype="multipart/form-data">',
    ),
  );
  check('cart lines', count(cart.html, 'data-key="') === 2 && cart.html.includes('240.00 ILS'));
  const empty = render('cart-empty', 'he');
  check(
    'empty cart',
    empty.html.includes('data-cart-empty') && empty.html.includes('<span data-cart-count>סל, 0 פריטים</span>'),
  );
  const contact = render('page.contact', 'he');
  check(
    'template wrapper',
    contact.html.includes('<div id="SmokeWrapper" class="smoke-wrapper" data-template="contact">'),
  );
  check('custom_css', /<style data-shopify>#shopify-section-template--\d+__main\{\.rte \{ outline/.test(contact.html));
  check('template suffix', contact.html.includes('data-template="page.contact" data-suffix="contact"'));
  check(
    'contact form',
    contact.html.includes(
      'action="/contact#contact_form" id="SmokeContact" accept-charset="UTF-8" class="contact-form"',
    ),
  );
  const notFound = render('404', 'en');
  check('404', notFound.html.includes('<h1>Page not found</h1>'));
}

/* ---------------------------------------------------------------- Section Rendering API */
{
  const spec = smoke.pageSpec('product', 'he');
  const out = smoke.renderSections(spec, ['main', 'cart-drawer', 'header', 'nope']);
  check(
    'SRA template section by key',
    /^<div id="shopify-section-template--\d+__main" class="shopify-section">/.test(out.main ?? ''),
  );
  check(
    'SRA static section',
    (out['cart-drawer'] ?? '').startsWith(
      '<div id="shopify-section-cart-drawer" class="shopify-section"><sw-drawer id="CartDrawer">',
    ),
  );
  check('SRA group section', /^<div id="shopify-section-sections--\d+__header"/.test(out.header ?? ''));
  check('SRA unknown section is null', out.nope === null);
  const cartOut = smoke.renderSections(spec, ['cart-drawer'], { cartLines: [] });
  check('SRA uses given cart', cartOut['cart-drawer'].includes('הסל ריק'));
}

/* ---------------------------------------------------------------------------------- server */
{
  const server = await startServer({ root: path.join(fixturesDir, 'images'), preview: smoke });
  try {
    const section = await fetch(`${server.url}/?section_id=checks`);
    const html = await section.text();
    check(
      'server: section_id',
      section.status === 200 && /^<div id="shopify-section-template--\d+__checks"/.test(html),
    );
    const header = JSON.parse(decodeURIComponent(section.headers.get('x-sw-preview-gaps') ?? '%5B%5D'));
    check(
      'server: section gaps in header',
      header.some((m) => m.includes('frobnicate')),
    );
    const world = smoke.world(smoke.pageSpec('product', 'he'));
    const small = world.product('demo-fc-home-jersey-2026-27').variants[0].id;
    const body = new FormData();
    body.set('id', String(small));
    body.set('sections', 'cart-drawer');
    const added = await (await fetch(`${server.url}/cart/add.js`, { method: 'POST', body })).json();
    check('server: cart/add.js', added.variant_id === small && added.sections?.['cart-drawer']?.includes('CartDrawer'));
    const cart = await (await fetch(`${server.url}/cart.js`)).json();
    check('server: cart.js', cart.item_count === 3);
    const page = await fetch(`${server.url}/en/collections/football`);
    check('server: storefront URL', page.status === 200 && (await page.text()).includes('lang="en" dir="ltr"'));
    check('server: 404', (await fetch(`${server.url}/en/no/such/page`)).status === 404);
  } finally {
    await server.close();
  }
}

/* ------------------------------------------------------------- the real theme in this repo */
{
  const real = new Preview({ themeDir: repoRoot, fixturesDir });
  for (const locale of real.locales) {
    for (const id of real.defaultPages()) {
      const { html, gaps } = real.renderPage(real.pageSpec(id, locale));
      const errors = gaps.filter((g) => ['liquid-error', 'filter', 'property', 'object', 'schema'].includes(g.kind));
      check(
        `real theme ${locale}/${id} renders without Liquid errors`,
        errors.length === 0,
        errors.map((g) => g.message).join(' | '),
      );
      check(
        `real theme ${locale}/${id} has a document`,
        html.startsWith('<!doctype html>') && html.includes('</html>'),
      );
    }
  }
}

console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
